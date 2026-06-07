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

async function serveFile(filePath) {
  const idx = await getIndex();
  if (!idx || !(filePath in idx)) return null;

  const offset = idx[filePath];
  // Fetch tar header (512B) + file data
  // Read a generous buffer to ensure we get the full header + file
  const endByte = offset + 512 + 50000000; // 50MB max file size
  const resp = await fetch(`${RELEASE}/vcsky-all.tar`, {
    headers: { Range: `bytes=${offset}-${endByte}` },
    redirect: 'follow',
  });
  if (!resp.ok) return null;

  const buffer = await resp.arrayBuffer();
  const data = new Uint8Array(buffer);
  if (data.length < 512) return null;

  const sizeStr = new TextDecoder().decode(data.slice(124, 136)).replace(/\0/g, '');
  const fileSize = parseInt(sizeStr, 8);
  if (!fileSize || fileSize > 50000000) return null;

  const fileData = data.slice(512, 512 + fileSize);

  let ct = 'application/octet-stream';
  const ext = filePath.split('.').pop().toLowerCase();
  if (ext === 'mp3') ct = 'audio/mpeg';
  else if (ext === 'wav') ct = 'audio/wav';

  return new Response(fileData, {
    headers: {
      'Content-Type': ct,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    }
  });
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

  // Core files from GitHub Releases
  if (path === '/index.data' || path === '/index.wasm') {
    const resp = await fetch(`${RELEASE}${path}`, { redirect: 'follow' });
    return new Response(resp.body, {
      status: resp.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      }
    });
  }

  // All vcsky assets from complete tar
  if (path.startsWith('/vcsky/')) {
    const result = await serveFile(path.slice(1));
    if (result) return result;
  }

  // vcbr fallback
  if (path.startsWith('/vcbr/')) {
    const target = 'https://br.cdn.dos.zone/vcsky/' + path.slice(6);
    try {
      const resp = await fetch(target, { redirect: 'follow' });
      if (resp.ok) {
        return new Response(resp.body, {
          headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' }
        });
      }
    } catch (e) {}
  }

  return new Response('Not Found', { status: 404 });
}
