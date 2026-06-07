addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const RELEASE = 'https://github.com/Forever4D/gta-revc/releases/download/v1.0';

let index = null;

async function getIndex() {
  if (index) return index;
  const resp = await fetch(`${RELEASE}/vcsky-all-index.json`, { redirect: 'follow' });
  index = await resp.json();
  return index;
}

async function serveFromTar(filePath) {
  try {
    const idx = await getIndex();
    if (!idx || !(filePath in idx)) return null;
    const offset = idx[filePath];

    const resp = await fetch(`${RELEASE}/vcsky-all.tar`, {
      headers: { Range: `bytes=${offset}-` },
      redirect: 'follow',
    });
    if (!resp.ok) return null;

    const reader = resp.body.getReader();
    const readBytes = async (n) => {
      let buf = new Uint8Array(n), pos = 0;
      while (pos < n) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        const cp = value.slice(0, n - pos);
        buf.set(cp, pos);
        pos += cp.length;
      }
      return buf;
    };

    const header = await readBytes(512);
    const sizeStr = new TextDecoder().decode(header.slice(124, 136)).replace(/\0/g, '');
    const fileSize = parseInt(sizeStr, 8);
    if (!fileSize || fileSize > 100 * 1024 * 1024) return null;

    const data = await readBytes(fileSize);

    let ct = 'application/octet-stream';
    const ext = filePath.split('.').pop().toLowerCase();
    if (ext === 'mp3') ct = 'audio/mpeg';
    else if (ext === 'wav') ct = 'audio/wav';
    else if (ext === 'png') ct = 'image/png';

    return new Response(data, {
      headers: {
        'Content-Type': ct,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      }
    });
  } catch (e) {
    return null;
  }
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

  // Core data/wasm files
  if (path === '/index.data' || path === '/index.wasm') {
    const resp = await fetch(`${RELEASE}${path}`, { redirect: 'follow' });
    return new Response(resp.body, {
      status: resp.status,
      headers: {
        'Content-Type': resp.headers.get('Content-Type') || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      }
    });
  }

  // All vcsky assets from complete tar (31,222 files)
  if (path.startsWith('/vcsky/')) {
    const result = await serveFromTar(path.slice(1));
    if (result) return result;
  }

  // vcbr fallback
  if (path.startsWith('/vcbr/')) {
    const target = 'https://br.cdn.dos.zone/vcsky/' + path.slice(6);
    try {
      const resp = await fetch(target, { redirect: 'follow' });
      return new Response(resp.body, {
        status: resp.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          ...Object.fromEntries(resp.headers),
        }
      });
    } catch (e) {}
  }

  return new Response('Not Found', { status: 404 });
}
