addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const RELEASE = 'https://github.com/Forever4D/gta-revc/releases/download/v1.0';

let assetIndex = null;

async function getIndex() {
  if (assetIndex) return assetIndex;
  const resp = await fetch(`${RELEASE}/vcsky-all-index.json`, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`Index fetch failed: ${resp.status}`);
  assetIndex = await resp.json();
  return assetIndex;
}

async function serveAssetFile(filePath) {
  try {
    const index = await getIndex();
    if (!index || !(filePath in index)) return null;

    const offset = index[filePath];
    const resp = await fetch(`${RELEASE}/vcsky-all.tar`, {
      headers: { Range: `bytes=${offset}-` },
      redirect: 'follow',
    });
    if (!resp.ok) return null;

    const reader = resp.body.getReader();
    let headerBytes = new Uint8Array(512);
    let pos = 0;
    while (pos < 512) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      const copy = value.slice(0, 512 - pos);
      headerBytes.set(copy, pos);
      pos += copy.length;
    }

    const sizeStr = new TextDecoder().decode(headerBytes.slice(124, 136)).replace(/\0/g, '');
    const fileSize = parseInt(sizeStr, 8);
    if (!fileSize || fileSize > 100 * 1024 * 1024) return null;

    let data = new Uint8Array(fileSize);
    let dataPos = 0;
    while (dataPos < fileSize) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      const toCopy = Math.min(value.length, fileSize - dataPos);
      data.set(value.slice(0, toCopy), dataPos);
      dataPos += toCopy;
    }

    return new Response(data, {
      headers: {
        'Content-Type': filePath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
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

  const fileMap = {
    '/index.data': `${RELEASE}/index.data`,
    '/index.wasm': `${RELEASE}/index.wasm`,
  };

  if (path in fileMap) {
    const resp = await fetch(fileMap[path], { redirect: 'follow' });
    const headers = new Headers(resp.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=86400');
    return new Response(resp.body, { status: resp.status, headers });
  }

  // All vcsky assets from complete tar (models, textures, audio, anims)
  if (path.startsWith('/vcsky/')) {
    const result = await serveAssetFile(path.slice(1));
    if (result) return result;
  }

  // vcbr proxy (brotli assets)
  if (path.startsWith('/vcbr/')) {
    const target = 'https://br.cdn.dos.zone/vcsky/' + path.slice(6);
    const resp = await fetch(target, { redirect: 'follow' });
    const headers = new Headers(resp.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(resp.body, { status: resp.status, headers });
  }

  return new Response('Not Found', { status: 404 });
}
