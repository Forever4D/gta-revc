addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const RELEASE = 'https://github.com/Forever4D/gta-revc/releases/download/v1.0';

let assetIndex = null;

async function getIndex() {
  if (assetIndex) return assetIndex;
  const resp = await fetch(`${RELEASE}/vcsky-all-index.json`, { redirect: 'follow' });
  if (!resp.ok) return null;
  assetIndex = await resp.json();
  return assetIndex;
}

async function serveVcskyStream(filePath) {
  const idx = await getIndex();
  if (!idx || !(filePath in idx)) return null;

  const offset = idx[filePath];
  // Request just enough to get tar header + small files in one shot
  // For large files, we'll stream the rest
  const headResp = await fetch(`${RELEASE}/vcsky-all.tar`, {
    headers: { Range: `bytes=${offset}-${offset + 511}` },
    redirect: 'follow',
  });
  if (!headResp.ok) return null;

  const headerBuf = await headResp.arrayBuffer();
  if (headerBuf.byteLength < 512) return null;

  const header = new Uint8Array(headerBuf);
  const sizeStr = new TextDecoder().decode(header.slice(124, 136)).replace(/\0/g, '');
  const fileSize = parseInt(sizeStr, 8);
  if (!fileSize || fileSize > 50000000) return null;

  // For tiny files, serve in one request
  if (fileSize < 65536) {
    const fullResp = await fetch(`${RELEASE}/vcsky-all.tar`, {
      headers: { Range: `bytes=${offset}-${offset + 511 + fileSize}` },
      redirect: 'follow',
    });
    if (!fullResp.ok) return null;
    const buf = await fullResp.arrayBuffer();
    const data = new Uint8Array(buf).slice(512, 512 + fileSize);
    return new Response(data, {
      headers: {
        'Content-Type': getContentType(filePath),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      }
    });
  }

  // For large files, stream: request the data and pipe it
  const streamResp = await fetch(`${RELEASE}/vcsky-all.tar`, {
    headers: { Range: `bytes=${offset + 512}-${offset + 511 + fileSize}` },
    redirect: 'follow',
  });
  if (!streamResp.ok) return null;

  return new Response(streamResp.body, {
    headers: {
      'Content-Type': getContentType(filePath),
      'Content-Length': String(fileSize),
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    }
  });
}

function getContentType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const types = {
    mp3: 'audio/mpeg', wav: 'audio/wav', adf: 'application/octet-stream',
    txd: 'application/octet-stream', dff: 'application/octet-stream',
  };
  return types[ext] || 'application/octet-stream';
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  // Core data/wasm — stream directly from GitHub
  if (path === '/index.data' || path === '/index.wasm') {
    const resp = await fetch(`${RELEASE}${path}`, { redirect: 'follow' });
    if (!resp.ok) return new Response('Not Found', { status: 404 });
    return new Response(resp.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      }
    });
  }

  // vcsky assets from tar (streaming for large files)
  if (path.startsWith('/vcsky/')) {
    const result = await serveVcskyStream(path.slice(1));
    if (result) return result;
  }

  // vcbr brotli files — stream directly
  if (path.startsWith('/vcbr/')) {
    const filename = path.slice(6);
    const resp = await fetch(`${RELEASE}/${filename}`, { redirect: 'follow' });
    if (!resp.ok) return new Response('Not Found', { status: 404 });
    return new Response(resp.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'br',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      }
    });
  }

  return new Response('Not Found', { status: 404 });
}
