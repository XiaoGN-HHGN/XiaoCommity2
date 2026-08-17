// ============================================================================
// Xiao 2.0 · PWA Service Worker
// 离线缓存策略：
//   - 静态资源（HTML/CSS/JS/字体/图片）：cache-first，回退网络
//   - Supabase API 请求：network-first，回退缓存
//   - 其他：stale-while-revalidate
// ============================================================================
const CACHE_NAME = 'xiao-v2.1-' + '20260816';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/core/config.js',
  './assets/js/core/supabase.js',
  './assets/js/core/utils.js',
  './assets/js/core/ui.js',
  './assets/js/core/i18n.js',
  './assets/js/core/theme.js',
  './assets/js/core/presence.js',
  './assets/js/core/skeleton.js',
  './assets/js/core/cmdk.js',
  './assets/js/core/store.js',
  './assets/js/core/auth.js',
  './assets/js/core/router.js',
  './assets/js/i18n/zh-CN.js',
  './assets/js/i18n/en.js',
  './assets/js/i18n/ru.js',
  './assets/js/modules/home.js',
  './assets/js/modules/auth.js',
  './assets/js/modules/chat.js',
  './assets/js/modules/social.js',
  './assets/js/modules/works.js',
  './assets/js/modules/editor.js',
  './assets/js/modules/profile.js',
  './assets/js/modules/admin.js',
  './assets/js/modules/misc.js',
  './assets/js/modules/leaderboard.js',
  './assets/js/modules/tasks.js',
  './assets/js/modules/polls.js',
  './assets/js/modules/announcements.js'
];

// Supabase 域名特征（不缓存 API 响应体）
const SUPABASE_HOSTS = ['.supabase.co', '.supabase.in'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // 仅处理 GET
  if (req.method !== 'GET') return;

  // Supabase API：network-first，失败回退缓存
  if (SUPABASE_HOSTS.some(h => url.hostname.endsWith(h))) {
    e.respondWith(
      fetch(req).catch(() => caches.match(req).then(r => r || new Response('{}', { status: 503 })))
    );
    return;
  }

  // 同源静态资源：cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) {
          // 后台更新缓存
          fetch(req).then(resp => {
            if (resp && resp.status === 200) {
              caches.open(CACHE_NAME).then(c => c.put(req, resp.clone()));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(req).then(resp => {
          if (resp && resp.status === 200) {
            const respClone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, respClone));
          }
          return resp;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // 跨域资源：stale-while-revalidate
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(resp => {
        if (resp && resp.status === 200) {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, respClone));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// 接收消息：跳过等待立即激活
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
