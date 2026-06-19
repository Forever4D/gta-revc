addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const RELEASE = 'https://github.com/Forever4D/gta-revc/releases/download/v1.0';
const CORS = { 'Access-Control-Allow-Origin': '*' };

let assetIndex = null;
let missingFiles = []; // Track missing files for debugging

async function getIndex() {
  if (assetIndex) return assetIndex;
  const resp = await fetch(`${RELEASE}/vcsky-all-index.json`, { redirect: 'follow' });
  if (!resp.ok) return null;
  assetIndex = await resp.json();
  return assetIndex;
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const p = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
  }

  // vcsky assets
  if (p.startsWith('/vcsky/')) {
    try {
    const idx = await getIndex();
    if (!idx) return new Response('no-index', { status: 500, headers: CORS });

    const filePath = p.slice(1);
    if (!(filePath in idx)) {
      missingFiles.push(filePath);
      if (missingFiles.length > 50) missingFiles.shift();
      // Return empty OK to prevent game crashes from 404
      return new Response('', { status: 200, headers: { ...CORS, 'Content-Type': 'application/octet-stream', 'Content-Length': '0' } });
    }

    const offset = idx[filePath];

    // Fetch tar with manual redirect (Range header lost on auto-follow)
    async function fetchRange(url, rangeHeader) {
      let r = await fetch(url, { redirect: 'manual' });
      if (r.status === 302 || r.status === 301) {
        r = await fetch(r.headers.get('Location'), { headers: { Range: rangeHeader } });
      }
      return r;
    }

    // Get tar header first to know file size
    let resp = await fetchRange(`${RELEASE}/vcsky-all.tar`, `bytes=${offset}-${offset + 511}`);
    if (!resp.ok) return new Response('fail:' + resp.status, { status: 502, headers: CORS });
    const hdr = new Uint8Array(await resp.arrayBuffer());
    if (hdr.length < 512) return new Response('short', { status: 502, headers: CORS });

    const sizeStr = new TextDecoder().decode(hdr.slice(124, 136)).replace(/\0/g, '');
    const fileSize = parseInt(sizeStr, 8);
    if (!fileSize || fileSize > 50000000) return new Response('bad-size', { status: 502, headers: CORS });

    // Fetch header + file data in one shot
    const dataEnd = offset + 511 + fileSize;
    resp = await fetchRange(`${RELEASE}/vcsky-all.tar`, `bytes=${offset}-${dataEnd}`);
    if (!resp.ok) return new Response('data-fail:' + resp.status, { status: 502, headers: CORS });

    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.length < 512 + fileSize) return new Response('short-data', { status: 502, headers: CORS });

    const data = buf.slice(512, 512 + fileSize);
    const ext = filePath.split('.').pop().toLowerCase();
    const ct = { mp3: 'audio/mpeg', wav: 'audio/wav' }[ext] || 'application/octet-stream';

    return new Response(data, { headers: { ...CORS, 'Content-Type': ct, 'Content-Length': '' + fileSize, 'Cache-Control': 'public, max-age=86400' } });
    } catch(e) {
      return new Response('err:' + e.message, { status: 500, headers: CORS });
    }
  }

  // Direct GitHub proxy for core files
  if (p === '/index.data' || p === '/index.wasm' || p === '/vcsky-all-index.json') {
    const resp = await fetch(`${RELEASE}${p}`, { redirect: 'follow' });
    if (!resp.ok) return new Response('nf', { status: 404, headers: CORS });
    return new Response(resp.body, { headers: { ...CORS, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' } });
  }

  // vcbr
  if (p.startsWith('/vcbr/')) {
    const resp = await fetch(`${RELEASE}/${p.slice(6)}`, { redirect: 'follow' });
    if (!resp.ok) return new Response('nf', { status: 404, headers: CORS });
    return new Response(resp.body, { headers: { ...CORS, 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'br', 'Cache-Control': 'public, max-age=86400' } });
  }

  // Debug: show missing files
  if (p === '/debug-missing') {
    return new Response(JSON.stringify(missingFiles), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  return new Response('nf', { status: 404, headers: CORS });
}
