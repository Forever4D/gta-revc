// Service Worker - intercepts audio/model requests, serves from cache or preloads
const CACHE_NAME = 'gta-assets-v2';
const AUDIO_PREFIX = '/vcsky/fetched/audio/';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only intercept vcsky asset requests
  if (!url.pathname.startsWith(AUDIO_PREFIX)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        if (cached) return cached;
        // Fetch from network and cache for next time
        return fetch(event.request).then(resp => {
          if (resp.ok) cache.put(event.request, resp.clone());
          return resp;
        });
      })
    )
  );
});

// Handle preload messages from main page
self.addEventListener('message', async (event) => {
  if (event.data === 'preload') {
    const cache = await caches.open(CACHE_NAME);
    const idxResp = await fetch('https://gta-cors-proxy.f4d.workers.dev/vcsky-all-index.json');
    const index = await idxResp.json();
    const audioFiles = Object.keys(index).filter(k => k.startsWith('vcsky/fetched/audio'));

    let loaded = 0;
    const total = audioFiles.length;

    // Send progress to all clients
    const sendProgress = () => {
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({
          type: 'preload-progress',
          loaded, total
        }));
      });
    };

    for (let i = 0; i < audioFiles.length; i += 10) {
      const batch = audioFiles.slice(i, i + 10);
      await Promise.all(batch.map(async (path) => {
        const cached = await cache.match('/vcsky/' + path);
        if (cached) { loaded++; return; }
        try {
          const resp = await fetch('https://gta-cors-proxy.f4d.workers.dev/vcsky/' + path);
          if (resp.ok) {
            await cache.put('/vcsky/' + path, resp.clone());
            loaded++;
          }
        } catch(e) {}
      }));
      sendProgress();
      // Tiny delay between batches
      await new Promise(r => setTimeout(r, 30));
    }

    sendProgress();
  }
});
