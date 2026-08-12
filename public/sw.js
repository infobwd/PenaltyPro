// Penalty Pro — Service Worker (เขียนเอง ไม่ผ่าน build step)
//
// กลยุทธ์แคช:
//   - App shell (/, index.html, offline.html, manifest) → network-first
//   - ไฟล์ที่ Vite ใส่ hash ในชื่อ (/assets/*) → cache-first ได้ปลอดภัย
//   - รูปที่อัปโหลด (/storage/uploads/*) และไอคอน → cache-first เก็บไม่เกิน 30 วัน
//   - ทุกอย่างที่เหลือรวมถึง /api/ → ต่อเน็ตตรง ไม่แคช
//
// ⚠️ ทำไม /api/ ถึงไม่แคชแม้เป็น GET:
//    `?action=getData` เป็น URL เดียวกันสำหรับทุกคน แต่เนื้อหาต่างกันตามสิทธิ์ —
//    แอดมินได้เบอร์โทรและข้อมูลผู้บริจาคมาด้วย ถ้าแคชโดยใช้ URL เป็นคีย์
//    เครื่องที่แอดมินเคยเปิดจะเสิร์ฟข้อมูลชุดนั้นให้ session ถัดไปที่ไม่ใช่แอดมิน
//    การแคชแยกตามสิทธิ์ต้องมีคีย์เพิ่มซึ่งไม่คุ้มความเสี่ยง จึงไม่แคชเลย
//    (ตัวแอปมี cache ของตัวเองใน localStorage อยู่แล้วสำหรับการเปิดซ้ำเร็ว ๆ)
//
// bump SW_VERSION ทุกครั้งที่แก้ไฟล์นี้ ไม่งั้นเครื่องที่เคยเปิดเว็บจะใช้ของเก่าต่อ

const SW_VERSION = 'v6';
const ICON_VERSION = '20260812';

const SHELL_CACHE  = `penalty-shell-${SW_VERSION}`;
const ASSET_CACHE  = `penalty-assets-${SW_VERSION}`;
const UPLOAD_CACHE = `penalty-uploads-${SW_VERSION}`;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  `/manifest.json?v=${ICON_VERSION}`,
];

const UPLOAD_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;   // 30 วัน

// ── ติดตั้ง ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // cache.addAll ล้มทั้งชุดถ้าไฟล์ใดไฟล์หนึ่ง 404 — ใส่ทีละไฟล์แทน
      // เพื่อให้ SW ติดตั้งได้แม้ไฟล์ใดไฟล์หนึ่งยังไม่ได้ deploy
      .then((cache) => Promise.all(
        SHELL_URLS.map((u) => cache.add(u).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

// ── ล้างของเก่า ────────────────────────────────────────────────────────────
async function evictOldUploads() {
  const cache = await caches.open(UPLOAD_CACHE);
  const requests = await cache.keys();
  await Promise.all(requests.map(async (req) => {
    const res = await cache.match(req);
    if (!res) return;
    const raw = res.headers.get('x-cached-at') || res.headers.get('date');
    if (!raw) return;
    const ts = isNaN(Number(raw)) ? new Date(raw).getTime() : Number(raw);
    if (isNaN(ts)) return;
    if (Date.now() - ts > UPLOAD_MAX_AGE_MS) await cache.delete(req);
  }));
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('penalty-') && !k.endsWith(SW_VERSION))
            .map((k) => caches.delete(k))
      ))
      .then(() => evictOldUploads())
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── กลยุทธ์แคช ─────────────────────────────────────────────────────────────
function isAssetRequest(url) {
  return url.pathname.startsWith('/assets/')
    || /\.(?:woff2?|ttf|otf|eot)$/i.test(url.pathname);
}

function isUploadRequest(url) {
  return url.pathname.startsWith('/storage/uploads/')
    || url.pathname.startsWith('/icons/');
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) {
      if (cacheName === UPLOAD_CACHE) {
        // ประทับเวลาไว้เพื่อให้ลบของที่เกิน 30 วันได้ตอน activate
        const headers = new Headers(res.headers);
        headers.set('x-cached-at', String(Date.now()));
        cache.put(request, new Response(await res.clone().arrayBuffer(), {
          status: res.status, statusText: res.statusText, headers,
        }));
      } else {
        cache.put(request, res.clone());
      }
    }
    return res;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

async function networkFirstNavigation(request) {
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(SHELL_CACHE)).put('/index.html', res.clone());
    return res;
  } catch (e) {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('/index.html'))
        || (await cache.match('/offline.html'))
        || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  // API ต้องวิ่งตรงเสมอ — ดูเหตุผลที่หัวไฟล์
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (isAssetRequest(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  if (isUploadRequest(url)) {
    event.respondWith(cacheFirst(request, UPLOAD_CACHE));
    return;
  }
});

// ── Web Push ───────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: event.data ? event.data.text() : 'การแจ้งเตือนใหม่' };
  }

  const title = payload.title || 'Penalty Pro Arena';
  const options = {
    body: payload.body || '',
    icon: `/icons/icon-192.png?v=${ICON_VERSION}`,
    badge: `/icons/icon-192.png?v=${ICON_VERSION}`,
    // tag ต้องไม่ซ้ำ ไม่งั้นเบราว์เซอร์จะแทนที่การแจ้งเตือนเดิมเงียบ ๆ
    // แล้วผู้ใช้จะไม่รู้ว่ามีเรื่องใหม่เข้ามา
    tag: payload.tag || `penalty-${Date.now()}`,
    renotify: payload.renotify !== false,
    requireInteraction: Boolean(payload.requireInteraction),
    data: { url: payload.url || '/', receivedAt: Date.now() },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // บอกทุกแท็บที่เปิดอยู่ให้รีเฟรชกล่องแจ้งเตือนทันที
    try {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of list) client.postMessage({ type: 'push-received', payload });
    } catch (_) { /* ส่งข้อความไม่ได้ก็ไม่กระทบการแจ้งเตือนที่แสดงไปแล้ว */ }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  const absolute = new URL(target, self.location.origin).href;

  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (client.url === absolute && 'focus' in client) return client.focus();
    }
    if (list[0] && 'navigate' in list[0] && 'focus' in list[0]) {
      await list[0].focus();
      return list[0].navigate(absolute);
    }
    if (self.clients.openWindow) return self.clients.openWindow(absolute);
  })());
});
