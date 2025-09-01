const headerMap: Record<string, string> = {
  'X-Cookie': 'Cookie',
  'X-Referer': 'Referer',
  'X-Origin': 'Origin',
  'X-User-Agent': 'User-Agent',
  'X-X-Real-Ip': 'X-Real-Ip',
};

const blacklistedHeaders = [
  'cf-connecting-ip',
  'cf-worker',
  'cf-ray',
  'cf-visitor',
  'cf-ew-via',
  'cdn-loop',
  'x-amzn-trace-id',
  'cf-ipcountry',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'forwarded',
  'x-real-ip',
  'content-length',
  ...Object.keys(headerMap),
];

function copyHeader(
  headers: Headers,
  outputHeaders: Headers,
  inputKey: string,
  outputKey: string,
) {
  if (headers.has(inputKey))
    outputHeaders.set(outputKey, headers.get(inputKey) ?? '');
}

export function getProxyHeaders(headers: Headers): Headers {
  const output = new Headers();

  // default user agent
  output.set(
    'User-Agent',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  );

  // Add common browser headers
  output.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  output.set('Accept-Language', 'en-US,en;q=0.9');
  output.set('Accept-Encoding', 'gzip, deflate, br');
  output.set('Connection', 'keep-alive');
  output.set('Sec-Fetch-Dest', 'document');
  output.set('Sec-Fetch-Mode', 'navigate');
  output.set('Sec-Fetch-Site', 'none');

  Object.entries(headerMap).forEach((entry) => {
    copyHeader(headers, output, entry[0], entry[1]);
  });

  return output;
}

export function getAfterResponseHeaders(
  headers: Headers,
  finalUrl: string,
): Record<string, string> {
  const output: Record<string, string> = {};

  if (headers.has('Set-Cookie'))
    output['X-Set-Cookie'] = headers.get('Set-Cookie') ?? '';

  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': '*',
    Vary: 'Origin',
    'X-Final-Destination': finalUrl,
    ...output,
  };
}

export function getBlacklistedHeaders() {
  return blacklistedHeaders;
}
