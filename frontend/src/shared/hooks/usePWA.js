/**
 * usePWA — hooks for PWA install prompt and offline queue.
 */
import { useState, useEffect } from 'react';

// ── Install prompt ────────────────────────────────────────────────────────────

let _deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredPrompt = e;
});

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }
    setCanInstall(!!_deferredPrompt);

    const handler = () => setCanInstall(!!_deferredPrompt);
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function install() {
    if (!_deferredPrompt) return false;
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      _deferredPrompt = null;
      setCanInstall(false);
      setIsInstalled(true);
    }
    return outcome === 'accepted';
  }

  return { canInstall, isInstalled, install };
}

// ── Offline status ────────────────────────────────────────────────────────────

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}

// ── Offline queue ─────────────────────────────────────────────────────────────
// Enqueue failed mutation requests so they're replayed when connectivity returns.

const DB_NAME = 'stackless-offline';
const STORE_NAME = 'offline-queue';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function enqueueOfflineRequest(url, method, headers, body) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).add({ url, method, headers, body, queued_at: Date.now() });
  // Trigger background sync when online
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('sync-offline-queue');
  }
}
