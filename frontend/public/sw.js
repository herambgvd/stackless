/**
 * FlowForge Service Worker
 *
 * Strategy:
 *  - API requests (/api/*): network-first, fall back to cached if offline
 *  - Immutable hashed assets (e.g. main-abc123.js): cache-first (safe, filename changes on update)
 *  - Other static assets (JS/CSS without hashes): network-first to avoid stale cache
 *  - Navigation requests: network-first, cache response, serve cached shell if offline
 */

const CACHE_VERSION = 2;
const CACHE_NAME = `flowforge-v${CACHE_VERSION}`;
const STATIC_ASSETS = ["/", "/index.html"];

// Pattern to detect Vite hashed assets (e.g. /assets/index-Dg3k1a.js)
const HASHED_ASSET_RE =
  /\/assets\/.*-[a-zA-Z0-9]{6,}\.(js|css|woff2?|ttf|eot|svg|png|jpg|gif|webp)$/;

// ── Install: pre-cache shell ────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  // Activate immediately — don't wait for old SW to release clients
  self.skipWaiting();
});

// ── Activate: clean old caches ──────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// ── Fetch strategy ──────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== "GET" || url.protocol === "chrome-extension:") return;

  // API calls: network-first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Navigation (HTML pages): network-first, cache the response, offline shell fallback
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Immutable hashed assets (Vite build output): safe to cache-first
  if (HASHED_ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else (non-hashed JS/CSS, fonts, images): network-first
  event.respondWith(networkFirst(request));
});

// Navigation: always try network, cache the fresh response, fall back to cached shell
async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match("/index.html");
    return (
      cached ||
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/html" },
      })
    );
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return (
      cached ||
      new Response(JSON.stringify({ error: "Offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

// ── Background Sync (offline record queue) ──────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-offline-queue") {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  // Open IndexedDB queue and replay pending requests
  try {
    const db = await openDB();
    const tx = db.transaction("offline-queue", "readwrite");
    const store = tx.objectStore("offline-queue");
    const requests = await getAllFromStore(store);

    for (const item of requests) {
      try {
        await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });
        await store.delete(item.id);
      } catch {
        // Leave in queue for next sync
      }
    }
  } catch (err) {
    console.warn("[SW] syncOfflineQueue failed", err);
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("flowforge-offline", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("offline-queue")) {
        db.createObjectStore("offline-queue", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Push notifications ──────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "FlowForge", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "FlowForge", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url === url && "focus" in c);
      return existing ? existing.focus() : self.clients.openWindow(url);
    }),
  );
});
