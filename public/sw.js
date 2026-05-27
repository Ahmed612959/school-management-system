// Service Worker متقدم
const CACHE_NAME = 'aldabeia-v1';
const STATIC_CACHE = 'aldabeia-static-v1';
const DYNAMIC_CACHE = 'aldabeia-dynamic-v1';

// الملفات التي سيتم تخزينها مؤقتاً
const STATIC_FILES = [
  '/',
  '/index.html',
  '/login.html',
  '/Home.html',
  '/admin.html',
  '/profile.html',
  '/signup.html',
  '/auth.js',
  '/Home.js',
  '/admin.js',
  '/profile.js',
  '/signup.js',
  '/Home.css',
  '/admin.css',
  '/login.css',
  '/index.css',
  '/logo.png'
];

// تثبيت Service Worker
self.addEventListener('install', (event) => {
  console.log('✅ Service Worker installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('Caching static files...');
      return cache.addAll(STATIC_FILES);
    })
  );
  self.skipWaiting();
});

// تنشيط Service Worker
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activated');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => caches.delete(key))
      );
    })
  );
  return self.clients.claim();
});

// استقبال إشعارات Push
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'لديك إشعار جديد',
    icon: data.icon || '/logo.png',
    badge: data.badge || '/logo.png',
    vibrate: [200, 100, 200],
    sound: '/notification.mp3',
    data: {
      url: data.url || '/',
      id: data.id || Date.now()
    },
    actions: [
      { action: 'open', title: '📱 فتح التطبيق', icon: '/logo.png' },
      { action: 'close', title: '❌ إغلاق', icon: '/logo.png' }
    ],
    requireInteraction: true
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'معهد رعاية الضبعية', options)
  );
});

// التعامل مع الضغط على الإشعار
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// استراتيجية الشبكة أولاً مع التخزين المؤقت
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // تجنب تخزين API مؤقتاً
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const responseClone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
