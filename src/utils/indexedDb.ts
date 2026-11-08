import { DualCaptureSession } from '../types/camera';

const DB_NAME = 'DualShotDB';
const DB_VERSION = 1;
const STORE_NAME = 'captures';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCaptureSession(session: DualCaptureSession): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(session);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save to IndexedDB, using localStorage fallback', err);
    try {
      const existing = getLocalFallbackSessions();
      existing.unshift(session);
      localStorage.setItem('dualshot_captures', JSON.stringify(existing.slice(0, 30)));
    } catch (e) {
      console.error('LocalStorage write failed:', e);
    }
  }
}

export async function getAllCaptureSessions(): Promise<DualCaptureSession[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('createdAt');
      const req = index.getAll();

      req.onsuccess = () => {
        const results = (req.result || []) as DualCaptureSession[];
        // Sort descending by date
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB read failed, falling back to localStorage', err);
    return getLocalFallbackSessions();
  }
}

export async function deleteCaptureSession(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB delete failed, falling back to localStorage', err);
    const existing = getLocalFallbackSessions().filter(s => s.id !== id);
    localStorage.setItem('dualshot_captures', JSON.stringify(existing));
  }
}

function getLocalFallbackSessions(): DualCaptureSession[] {
  try {
    const data = localStorage.getItem('dualshot_captures');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Creates realistic demo captured photos (one 9:16 vertical, one 16:9 horizontal)
 * matching the user's provided sunny forest scene from the prompt mockup.
 */
export function createSampleDemoSession(): DualCaptureSession {
  // Generate sample canvas images matching the mockup
  const vCanvas = document.createElement('canvas');
  vCanvas.width = 1080;
  vCanvas.height = 1920;
  const vCtx = vCanvas.getContext('2d');
  if (vCtx) {
    // Sky
    const grad = vCtx.createLinearGradient(0, 0, 0, 1920);
    grad.addColorStop(0, '#3888d8');
    grad.addColorStop(0.5, '#6cb3ef');
    grad.addColorStop(1, '#97d2fb');
    vCtx.fillStyle = grad;
    vCtx.fillRect(0, 0, 1080, 1920);

    // Sun & flare
    vCtx.beginPath();
    vCtx.arc(580, 720, 80, 0, Math.PI * 2);
    vCtx.fillStyle = '#ffffff';
    vCtx.shadowColor = 'rgba(255, 255, 200, 0.8)';
    vCtx.shadowBlur = 90;
    vCtx.fill();
    vCtx.shadowBlur = 0;

    // Forest trees at bottom
    vCtx.fillStyle = '#1c3d25';
    for (let i = 0; i < 9; i++) {
      vCtx.beginPath();
      const x = i * 140 - 40;
      const y = 1350 + Math.sin(i * 1.5) * 80;
      vCtx.arc(x, y, 160, 0, Math.PI * 2);
      vCtx.fill();
    }
    vCtx.fillStyle = '#265332';
    for (let i = 0; i < 11; i++) {
      vCtx.beginPath();
      const x = i * 110 - 20;
      const y = 1480 + Math.cos(i * 1.3) * 70;
      vCtx.arc(x, y, 140, 0, Math.PI * 2);
      vCtx.fill();
    }
  }

  const hCanvas = document.createElement('canvas');
  hCanvas.width = 1920;
  hCanvas.height = 1080;
  const hCtx = hCanvas.getContext('2d');
  if (hCtx) {
    const grad = hCtx.createLinearGradient(0, 0, 0, 1080);
    grad.addColorStop(0, '#3888d8');
    grad.addColorStop(0.6, '#6cb3ef');
    grad.addColorStop(1, '#97d2fb');
    hCtx.fillStyle = grad;
    hCtx.fillRect(0, 0, 1920, 1080);

    // Sun
    hCtx.beginPath();
    hCtx.arc(960, 420, 90, 0, Math.PI * 2);
    hCtx.fillStyle = '#ffffff';
    hCtx.shadowColor = 'rgba(255, 255, 200, 0.9)';
    hCtx.shadowBlur = 100;
    hCtx.fill();
    hCtx.shadowBlur = 0;

    // Trees
    hCtx.fillStyle = '#1c3d25';
    for (let i = 0; i < 15; i++) {
      hCtx.beginPath();
      const x = i * 150 - 50;
      const y = 780 + Math.sin(i * 1.4) * 60;
      hCtx.arc(x, y, 170, 0, Math.PI * 2);
      hCtx.fill();
    }
    hCtx.fillStyle = '#2b5e38';
    for (let i = 0; i < 18; i++) {
      hCtx.beginPath();
      const x = i * 120 - 30;
      const y = 870 + Math.cos(i * 1.7) * 50;
      hCtx.arc(x, y, 150, 0, Math.PI * 2);
      hCtx.fill();
    }
  }

  const vDataUrl = vCanvas.toDataURL('image/jpeg', 0.9);
  const hDataUrl = hCanvas.toDataURL('image/jpeg', 0.9);

  return {
    id: 'demo-sample-1',
    createdAt: Date.now() - 1000 * 60 * 15, // 15 mins ago
    type: 'photo',
    lensMode: 'single',
    title: 'Outdoor Canopy Dual Shot',
    thumbnailUrl: vDataUrl,
    verticalMedia: {
      id: 'demo-sample-1-v',
      url: vDataUrl,
      aspectRatio: '9:16',
      label: 'TikTok / Reels (9:16)',
      width: 1080,
      height: 1920,
      fileSize: 1845000,
    },
    horizontalMedia: {
      id: 'demo-sample-1-h',
      url: hDataUrl,
      aspectRatio: '16:9',
      label: 'YouTube (16:9)',
      width: 1920,
      height: 1080,
      fileSize: 1950000,
    },
  };
}
