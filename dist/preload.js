// Audio preloader - downloads audio tar and caches all files for instant playback
const WORKER_URL = (location.hostname === 'localhost' || location.hostname.startsWith('127.') || location.hostname.startsWith('192.168.'))
  ? '' : 'https://gta-cors-proxy.f4d.workers.dev';

let preloadCache = null;
let audioIndex = null;

async function initPreloadCache() {
  if (preloadCache) return preloadCache;
  preloadCache = await caches.open('gta-audio-v1');
  return preloadCache;
}

async function getAudioIndex() {
  if (audioIndex) return audioIndex;
  const resp = await fetch(`${WORKER_URL}/vcsky-all-index.json`);
  audioIndex = await resp.json();
  return audioIndex;
}

async function preloadAudioFile(path) {
  const cache = await initPreloadCache();
  // Check if already cached
  const cached = await cache.match(path);
  if (cached) return true;

  try {
    const resp = await fetch(`${WORKER_URL}/vcsky/${path}`, { cache: 'reload' });
    if (resp.ok) {
      await cache.put(path, resp.clone());
      return true;
    }
  } catch (e) {}
  return false;
}

async function preloadAllAudio(progressCallback) {
  const idx = await getAudioIndex();
  const audioFiles = Object.keys(idx).filter(k => k.startsWith('vcsky/fetched/audio'));
  const total = audioFiles.length;
  let loaded = 0;
  let failed = 0;

  // Check how many are already cached
  const cache = await initPreloadCache();
  for (const path of audioFiles) {
    if (await cache.match(path)) loaded++;
  }

  if (progressCallback) progressCallback(loaded, total, 'Checking cache...');

  // Download missing files in batches
  const batchSize = 20;
  const missing = audioFiles.filter(async path => !(await cache.match(path)));

  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(path => preloadAudioFile(path).catch(() => false))
    );
    loaded += results.filter(r => r).length;
    if (progressCallback) {
      const pct = Math.round(loaded / total * 100);
      progressCallback(loaded, total, `Preloading audio ${pct}%...`);
    }
    // Small delay to not overwhelm network
    await new Promise(r => setTimeout(r, 50));
  }

  return { loaded, total, failed: total - loaded };
}

// Expose for use in index.html
window.preloadAllAudio = preloadAllAudio;
