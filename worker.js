addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  const fileMap = {
    '/index.data': 'https://github.com/Forever4D/gta-revc/releases/download/v1.0/index.data',
    '/index.wasm': 'https://github.com/Forever4D/gta-revc/releases/download/v1.0/index.wasm',
  };

  const target = fileMap[path];
  if (!target) {
    return new Response('Not Found', { status: 404 });
  }

  const response = await fetch(target);
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Max-Age', '86400');

  return new Response(response.body, {
    status: response.status,
    headers: headers,
  });
}
