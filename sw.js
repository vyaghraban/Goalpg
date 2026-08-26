const CACHE_NAME = "neetpg-ranker-v7";
const CORE_ASSETS = [
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* ---------- lightweight daily-reminder notification loop ---------- */
let lastStatsBody = "Keep the streak alive — log today's work!";
let lastNotifyDate = null;

self.addEventListener("message", (event) => {
  const { type, stats, title, body } = event.data || {};
  if (type === "STATS_UPDATE" && stats && stats.body) {
    lastStatsBody = stats.body;
  }
  if (type === "CHECK_NOW") {
    maybeNotify();
  }
  if (type === "SHOW_CHECKPOINT" && body) {
    self.registration.showNotification(title || "NeetPG Ranker", {
      body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "checkpoint-nudge",
      renotify: true,
      requireInteraction: true,
      vibrate: [120, 60, 120],
    }).catch(() => {});
  }
  // Ongoing "session in progress" notification — replaced in place (same
  // tag, silent) roughly once a minute while the timer runs, so switching
  // apps still shows a live-ish elapsed count without spamming alerts.
  if (type === "FOCUS_UPDATE" && body) {
    self.registration.showNotification("Padhai Clock", {
      body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "focus-session",
      silent: true,
      renotify: false,
    }).catch(() => {});
  }
  if (type === "FOCUS_STOP") {
    self.registration.getNotifications({ tag: "focus-session" }).then((list) => {
      list.forEach((n) => n.close());
    }).catch(() => {});
  }
});

// Best-effort periodic wake-up — only fires on platforms that support
// Periodic Background Sync for installed PWAs (mainly Android Chrome). Uses
// whatever comparison text the page last pushed via STATS_UPDATE.
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "checkpoint-notify") {
    event.waitUntil(
      self.registration.showNotification("NeetPG Ranker", {
        body: lastStatsBody,
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        tag: "checkpoint-nudge",
        renotify: true,
        requireInteraction: true,
        vibrate: [120, 60, 120],
      }).catch(() => {})
    );
  }
});

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function maybeNotify() {
  const today = todayKey();
  if (lastNotifyDate === today) return;
  const hour = new Date().getHours();
  if (hour < 19) return; // only nudge in the evening
  lastNotifyDate = today;
  self.registration.showNotification("NeetPG Ranker", {
    body: lastStatsBody,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: "daily-nudge",
    renotify: true,
    requireInteraction: true,
    vibrate: [120, 60, 120],
  }).catch(() => {});
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
