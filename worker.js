addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const RELEASE = 'https://github.com/Forever4D/gta-revc/releases/download/v1.0';
const CACHE_TTL = 604800; // 7 days

// Cache for hot assets
const hotCache = caches.default;

let assetIndex = null;

async function getIndex() {
  if (assetIndex) return assetIndex;
  // Cache the index in Cloudflare's CDN
  const cacheUrl = `${RELEASE}/vcsky-all-index.json`;
  let resp = await hotCache.match(cacheUrl);
  if (!resp) {
    resp = await fetch(cacheUrl, { redirect: 'follow' });
    if (resp.ok) {
      const clone = new Response(resp.body, { headers: resp.headers });
      clone.headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
      await hotCache.put(cacheUrl, clone);
    }
  }
  if (!resp || !resp.ok) return null;
  assetIndex = await resp.json();
  return assetIndex;
}

function getContentType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const t = { mp3:'audio/mpeg', wav:'audio/wav', txd:'application/octet-stream', dff:'application/octet-stream' };
  return t[ext] || 'application/octet-stream';
}

async function serveVcsky(filePath) {
  const idx = await getIndex();
  if (!idx || !(filePath in idx)) return null;

  const offset = idx[filePath];
  const cacheUrl = `${RELEASE}/vcsky-all.tar`;

  // Try cache first for this byte range
  const rangeKey = `${cacheUrl}#${offset}`;
  let cached = await hotCache.match(rangeKey);
  if (cached && cached.ok) {
    const data = await cached.arrayBuffer();
    if (data.byteLength >= 512) {
      const sizeStr = new TextDecoder().decode(new Uint8Array(data).slice(124, 136)).replace(/\0/g, '');
      const fileSize = parseInt(sizeStr, 8);
      if (fileSize && fileSize < 60000000) {
        const fileData = new Uint8Array(data).slice(512, 512 + fileSize);
        return new Response(fileData, {
          headers: {
            'Content-Type': getContentType(filePath),
            'Content-Length': String(fileSize),
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
          }
        });
      }
    }
  }

  // Fetch header
  const headResp = await fetch(cacheUrl, {
    headers: { Range: `bytes=${offset}-${offset + 511}` },
    redirect: 'follow',
  });
  if (!headResp.ok) return null;

  const headerBuf = await headResp.arrayBuffer();
  if (headerBuf.byteLength < 512) return null;

  const sizeStr = new TextDecoder().decode(new Uint8Array(headerBuf).slice(124, 136)).replace(/\0/g, '');
  const fileSize = parseInt(sizeStr, 8);
  if (!fileSize || fileSize > 50000000) return null;

  // Fetch full data
  const fullResp = await fetch(cacheUrl, {
    headers: { Range: `bytes=${offset}-${offset + 511 + fileSize}` },
    redirect: 'follow',
  });
  if (!fullResp.ok) return null;

  const buf = await fullResp.arrayBuffer();
  const fileData = new Uint8Array(buf).slice(512, 512 + fileSize);

  // Cache in Cloudflare CDN
  if (fileSize < 2000000) { // Cache files under 2MB
    await hotCache.put(rangeKey, new Response(buf.slice(0, 512 + fileSize), {
      headers: { 'Cache-Control': `public, max-age=${CACHE_TTL}` }
    }));
  }

  return new Response(fileData, {
    headers: {
      'Content-Type': getContentType(filePath),
      'Content-Length': String(fileSize),
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
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

  // Index file for SW preload
  if (path === '/vcsky-all-index.json') {
    const resp = await fetch(`${RELEASE}/vcsky-all-index.json`, { redirect: 'follow' });
    if (!resp.ok) return new Response('Not Found', { status: 404 });
    return new Response(resp.body, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      }
    });
  }

  // Core files
  if (path === '/index.data' || path === '/index.wasm') {
    let resp = await hotCache.match(request.url);
    if (!resp) {
      resp = await fetch(`${RELEASE}${path}`, { redirect: 'follow' });
      if (resp.ok) await hotCache.put(request.url, resp.clone());
    }
    if (!resp.ok) return new Response('Not Found', { status: 404 });
    return new Response(resp.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      }
    });
  }

  // vcsky assets with CDN caching
  if (path.startsWith('/vcsky/')) {
    const result = await serveVcsky(path.slice(1));
    if (result) return result;
  }

  // vcbr
  if (path.startsWith('/vcbr/')) {
    const filename = path.slice(6);
    let resp = await hotCache.match(request.url);
    if (!resp) {
      resp = await fetch(`${RELEASE}/${filename}`, { redirect: 'follow' });
      if (resp.ok) await hotCache.put(request.url, resp.clone());
    }
    if (!resp.ok) return new Response('Not Found', { status: 404 });
    return new Response(resp.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'br',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      }
    });
  }

  return new Response('Not Found', { status: 404 });
}
