addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const RELEASE = 'https://github.com/Forever4D/gta-revc/releases/download/v1.0';
const CORS = { 'Access-Control-Allow-Origin': '*' };

let assetIndex = null;

async function getIndex() {
  if (assetIndex) return assetIndex;
  const resp = await fetch(`${RELEASE}/vcsky-all-index.json`, { redirect: 'follow' });
  if (!resp.ok) return null;
  assetIndex = await resp.json();
  return assetIndex;
}

function contentType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const t = { mp3:'audio/mpeg', wav:'audio/wav' };
  return t[ext] || 'application/octet-stream';
}

async function serveVcsky(filePath) {
  const idx = await getIndex();
  if (!idx || !(filePath in idx)) return null;

  const offset = idx[filePath];
  const resp = await fetch(`${RELEASE}/vcsky-all.tar`, {
    headers: { Range: `bytes=${offset}-${offset + 511}` },
    redirect: 'follow',
  });
  if (!resp.ok) return null;

  const headerBuf = new Uint8Array(await resp.arrayBuffer());
  if (headerBuf.length < 512) return null;

  const sizeStr = new TextDecoder().decode(headerBuf.slice(124, 136)).replace(/\0/g, '');
  const fileSize = parseInt(sizeStr, 8);
  if (!fileSize || fileSize > 50000000) return null;

  // Fetch header + data
  const fullResp = await fetch(`${RELEASE}/vcsky-all.tar`, {
    headers: { Range: `bytes=${offset}-${offset + 511 + fileSize}` },
    redirect: 'follow',
  });
  if (!fullResp.ok) return null;

  const buf = new Uint8Array(await fullResp.arrayBuffer());
  const data = buf.slice(512, 512 + fileSize);

  return new Response(data, {
    headers: Object.assign({}, CORS, {
      'Content-Type': contentType(filePath),
      'Content-Length': String(fileSize),
      'Cache-Control': 'public, max-age=86400',
    })
  });
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: Object.assign({}, CORS, {
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Max-Age': '86400',
      })
    });
  }

  try {
    // Index file
    if (path === '/vcsky-all-index.json') {
      const resp = await fetch(`${RELEASE}/vcsky-all-index.json`, { redirect: 'follow' });
      if (!resp.ok) return new Response('NF', { status: 404, headers: CORS });
      return new Response(resp.body, {
        headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' })
      });
    }

    // Core data/wasm
    if (path === '/index.data' || path === '/index.wasm') {
      const resp = await fetch(`${RELEASE}${path}`, { redirect: 'follow' });
      if (!resp.ok) return new Response('NF', { status: 404, headers: CORS });
      return new Response(resp.body, {
        headers: Object.assign({}, CORS, {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400',
        })
      });
    }

    // vcsky assets
    if (path.startsWith('/vcsky/')) {
      const result = await serveVcsky(path.slice(1));
      if (result) return result;
    }

    // vcbr
    if (path.startsWith('/vcbr/')) {
      const filename = path.slice(6);
      const resp = await fetch(`${RELEASE}/${filename}`, { redirect: 'follow' });
      if (!resp.ok) return new Response('NF', { status: 404, headers: CORS });
      return new Response(resp.body, {
        headers: Object.assign({}, CORS, {
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'br',
          'Cache-Control': 'public, max-age=86400',
        })
      });
    }
  } catch(e) {
    return new Response('Error', { status: 500, headers: CORS });
  }

  return new Response('NF', { status: 404, headers: CORS });
}
