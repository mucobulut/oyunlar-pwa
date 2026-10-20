// kids_core/tool/pwa.py tarafından üretildi — çevrimdışı önbellek.
// Kurulumda kc_precache.json'daki tüm dosyalar (pwa.py --paketle) önbelleğe alınır; liste yoksa
// çekirdek dosyalar alınır ve geri kalanı ilk kullanımda önbelleğe girer.
const PREFIX = 'kids-core-pwa-';
const CORE = ['./', 'index.html', 'flutter_bootstrap.js', 'main.dart.js', 'manifest.json', 'favicon.png',
  'icons/Icon-192.png', 'icons/Icon-512.png'];

async function precacheList() {
  try {
    const r = await fetch('kc_precache.json', { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch (e) {}
  return { version: 'dev', files: CORE };
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const list = await precacheList();
    const cache = await caches.open(PREFIX + list.version);
    // Tek tek ekle: bir dosya başarısız olsa da kurulum sürsün.
    await Promise.all(list.files.map((f) => cache.add(new Request(f, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const list = await precacheList();
    const keep = PREFIX + list.version;
    for (const k of await caches.keys()) {
      if (k.startsWith(PREFIX) && k !== keep) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // dış istekler: dokunma
  if (url.pathname.endsWith('/kc_precache.json')) return;
  if (req.mode === 'navigate') {
    // Gezinme: önce ağ (güncel sürüm), yoksa önbellekteki index.html.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(PREFIX + 'runtime');
        cache.put('index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }
  // Varlıklar: önce önbellek, yoksa ağ (ve önbelleğe al). Bazı yükleyiciler "web//dosya.js" gibi çift
  // eğik çizgili adres ister: önbellekte normalleştirilmiş yolla da ara.
  event.respondWith((async () => {
    const hit = (await caches.match(req)) ||
      (url.pathname.includes('//') ? await caches.match(url.pathname.replace(/\/{2,}/g, '/') + url.search) : undefined);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const cache = await caches.open(PREFIX + 'runtime');
      cache.put(req, res.clone());
    }
    return res;
  })());
});
