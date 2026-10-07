const https = require('https');
const http = require('http');

function nodeFetch(input, options = {}) {
  const urlStr = typeof input === 'string' ? input : (input.url || input.toString());
  const u = new URL(urlStr);
  const mod = u.protocol === 'https:' ? https : http;
  const method = options.method || (input && input.method) || 'GET';
  let headers = options.headers || (input && input.headers) || {};
  if (headers instanceof Headers) {
    const h = {};
    headers.forEach((v, k) => { h[k] = v; });
    headers = h;
  }
  const body = options.body;

  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: new Headers(res.headers),
          text: async () => rawBody,
          json: async () => (rawBody ? JSON.parse(rawBody) : null),
        });
      });
    });
    req.on('error', reject);
    if (body) {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        req.write(body);
      }
    }
    req.end();
  });
}

globalThis.fetch = nodeFetch;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
