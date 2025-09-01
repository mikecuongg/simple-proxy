import { getBodyBuffer } from '@/utils/body';
import {
  getProxyHeaders,
  getAfterResponseHeaders,
  getBlacklistedHeaders,
} from '@/utils/headers';
import {
  createTokenIfNeeded,
  isAllowedToMakeRequest,
  setTokenHeader,
} from '@/utils/turnstile';
import { sendJson } from '@/utils/sending';
import { setResponseHeaders } from 'h3';

export default defineEventHandler(async (event) => {
  // Handle preflight CORS requests
  if (isPreflightRequest(event)) {
    handleCors(event, {});
    event.node.res.statusCode = 204;
    event.node.res.end();
    return;
  }

  // Reject any other OPTIONS requests
  if (event.node.req.method === 'OPTIONS') {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed',
    });
  }

  // Parse URL parameter
  const destination = getQuery<{ url?: string }>(event).url;
  if (!destination) {
    return await sendJson({
      event,
      status: 200,
      data: {
        message: `Febbox proxy is working as expected (v${
          useRuntimeConfig(event).version
        })`,
      },
    });
  }

  // Check if allowed to make the request
  if (!(await isAllowedToMakeRequest(event))) {
    return await sendJson({
      event,
      status: 401,
      data: {
        error: 'Invalid or missing token',
      },
    });
  }

  // Read body and create token if needed
  const body = await getBodyBuffer(event);
  const token = await createTokenIfNeeded(event);

  try {
    // For Febbox, we need to handle cookies and redirects properly
    const url = new URL(destination);
    
    // Get certificate and key from environment variables
    let certHeader = '';
    let keyHeader = '';
    const cert = process.env.CERT_CONTENT;
    const key = process.env.KEY_CONTENT;
    
    if (cert && key) {
      // Encode certificate and key content for use in headers
      certHeader = Buffer.from(cert).toString('base64');
      keyHeader = Buffer.from(key).toString('base64');
    } else {
      console.log('Certificate or key environment variables not found, proceeding without custom certificate');
    }
    
    // First, make a request to get the session cookie
    const sessionHeaders: any = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    };
    
    // Add certificate headers if available
    if (certHeader) {
      sessionHeaders['X-Certificate'] = certHeader;
    }
    if (keyHeader) {
      sessionHeaders['X-Private-Key'] = keyHeader;
    }
    
    const sessionResponse = await globalThis.fetch(url.origin, {
      method: 'GET',
      headers: sessionHeaders,
      redirect: 'follow',
      credentials: 'include',
    });

    // Extract cookies from the session response
    const cookies = sessionResponse.headers.get('set-cookie');
    let cookieHeader = '';
    
    if (cookies) {
      // Extract PHPSESSID cookie if present
      const cookieMatch = cookies.match(/PHPSESSID=([^;]+)/);
      if (cookieMatch) {
        cookieHeader = `PHPSESSID=${cookieMatch[1]}`;
      }
    }

    // Now make the actual request with the cookie
    const proxyHeaders = getProxyHeaders(event.headers);
    
    // Add the session cookie if we have one
    if (cookieHeader) {
      proxyHeaders.set('Cookie', cookieHeader);
    }

    // Add additional headers that the browser sends
    proxyHeaders.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    proxyHeaders.set('Accept-Language', 'en-US,en;q=0.9');
    proxyHeaders.set('Accept-Encoding', 'gzip, deflate, br');
    proxyHeaders.set('Connection', 'keep-alive');
    proxyHeaders.set('Sec-Fetch-Dest', 'document');
    proxyHeaders.set('Sec-Fetch-Mode', 'navigate');
    proxyHeaders.set('Sec-Fetch-Site', 'none');

    // Add certificate headers if available
    if (certHeader) {
      proxyHeaders.set('X-Certificate', certHeader);
    }
    if (keyHeader) {
      proxyHeaders.set('X-Private-Key', keyHeader);
    }

    // Make the actual request
    const response = await globalThis.fetch(destination, {
      method: event.method,
      headers: proxyHeaders,
      body: body || undefined,
      redirect: 'follow',
      credentials: 'include',
    });

    // Get the response data
    const responseData = await response.text();
    
    // Set response headers
    const headers = getAfterResponseHeaders(response.headers, response.url);
    setResponseHeaders(event, headers);
    
    if (token) setTokenHeader(event, token);

    // Return the response
    return responseData;

  } catch (e) {
    console.log('Error fetching from Febbox', e);
    throw e;
  }
});
