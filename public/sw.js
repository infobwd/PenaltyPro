
// bump ทุกครั้งที่ deploy ที่เปลี่ยนโครงไฟล์ — ไม่งั้นเครื่องที่เคยเปิดเว็บแล้ว
// จะถูกเสิร์ฟ shell เก่าที่ยังชี้ asset ไปที่ /PenaltyPro/ ต่อไป
const CACHE_NAME = 'penalty-pro-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Try to cache core assets, but don't fail if external CDNs block opaque responses
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log('Some assets failed to cache', err));
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Navigation requests: Network first, then Cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // คำขอไปยัง API ต้องไม่ผ่าน service worker เด็ดขาด — ปล่อยให้แอปจัดการเอง
  //
  // ⚠️ ตอน API ยังอยู่ที่ script.google.com (คนละโดเมน) ข้อนี้ไม่สำคัญนัก แต่พอ
  // ย้ายมาเป็น /api/ บนโดเมนเดียวกัน คำขอจะกลายเป็น type 'basic' + status 200
  // ซึ่งเข้าเงื่อนไข stale-while-revalidate ด้านล่างพอดี ผลคือ:
  //   - ข้อมูลเก่าถูกเสิร์ฟจาก cache ทั้งที่ฐานข้อมูลเปลี่ยนไปแล้ว
  //   - response ของแอดมิน (ที่มีเบอร์โทร/ข้อมูลผู้บริจาค) ถูกแคชไว้ใน
  //     เครื่องแล้วเสิร์ฟซ้ำให้คำขอถัดไป
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || event.request.url.includes('script.google.com')) {
    return;
  }

  // Static Assets: Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Cache valid responses
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
            });
        }
        return networkResponse;
      }).catch(e => {
          // Network failed
          return cachedResponse; 
      });
      return cachedResponse || fetchPromise;
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});