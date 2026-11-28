import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Media } from '@capacitor-community/media';
import { DualCaptureSession } from '../types/camera';
import { OEM_CONFIG } from '../config/oemConfig';

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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read media blob'));
    reader.readAsDataURL(blob);
  });
}

async function sourceToBase64(urlOrBlob: string | Blob): Promise<string> {
  if (urlOrBlob instanceof Blob) {
    return blobToBase64(urlOrBlob);
  }
  if (urlOrBlob.startsWith('data:')) {
    const commaIdx = urlOrBlob.indexOf(',');
    return commaIdx >= 0 ? urlOrBlob.slice(commaIdx + 1) : urlOrBlob;
  }
  const response = await fetch(urlOrBlob);
  const blob = await response.blob();
  return blobToBase64(blob);
}

async function resolveAndroidAlbumIdentifier(): Promise<string | undefined> {
  try {
    const albumName = OEM_CONFIG.appName;
    const { albums } = await Media.getAlbums();
    const existing = albums.find((a) => a.name.toLowerCase() === albumName.toLowerCase());
    if (existing) {
      return existing.identifier;
    }

    await Media.createAlbum({ name: albumName });
    const updated = await Media.getAlbums();
    const created = updated.albums.find((a) => a.name.toLowerCase() === albumName.toLowerCase());
    return created?.identifier;
  } catch (err) {
    console.warn('Could not resolve Android media album identifier:', err);
    return undefined;
  }
}

export async function saveMediaToAndroidGallery(
  urlOrBlob: string | Blob,
  filenameWithoutExt: string,
  mediaType: 'photo' | 'video'
): Promise<{ savedToDeviceGallery: boolean; message: string }> {
  if (!Capacitor.isNativePlatform()) {
    return {
      savedToDeviceGallery: false,
      message: 'Saved to browser gallery',
    };
  }

  const safeName = filenameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = mediaType === 'video' ? 'mp4' : 'jpg';
  const tempPath = `${safeName}_${Date.now()}.${ext}`;

  try {
    const base64Data = await sourceToBase64(urlOrBlob);
    const written = await Filesystem.writeFile({
      path: tempPath,
      data: base64Data,
      directory: Directory.Cache,
    });

    const albumIdentifier = await resolveAndroidAlbumIdentifier();

    if (mediaType === 'video') {
      await Media.saveVideo({
        path: written.uri,
        albumIdentifier,
        fileName: safeName,
      });
    } else {
      await Media.savePhoto({
        path: written.uri,
        albumIdentifier,
        fileName: safeName,
      });
    }

    await Filesystem.deleteFile({
      path: tempPath,
      directory: Directory.Cache,
    }).catch(() => {});

    return {
      savedToDeviceGallery: true,
      message: `Saved to DCIM/${OEM_CONFIG.appName} Gallery`,
    };
  } catch (err) {
    console.error('Failed to export media to Android DCIM/Gallery:', err);
    return {
      savedToDeviceGallery: false,
      message: 'Failed to save to device gallery',
    };
  }
}

export const STORAGE_CLEANUP_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export interface StorageCleanupStatus {
  usedBytes: number;
  quotaBytes: number | null;
  thresholdBytes: number;
  exceedsThreshold: boolean;
  sessionCount: number;
  cleanableSessionCount: number;
  estimatedReclaimableBytes: number;
  sessionsBytes: number;
}

export function estimateSessionSizeBytes(session: DualCaptureSession): number {
  const measureMedia = (media?: { blob?: Blob; fileSize?: number; url?: string }) => {
    if (!media) return 0;
    if (typeof media.blob?.size === 'number' && media.blob.size > 0) {
      return media.blob.size;
    }
    if (typeof media.fileSize === 'number' && media.fileSize > 0) {
      return media.fileSize;
    }
    if (typeof media.url === 'string' && media.url.startsWith('data:')) {
      return Math.round((media.url.length * 3) / 4);
    }
    return 0;
  };

  return measureMedia(session.verticalMedia) + measureMedia(session.horizontalMedia);
}

/**
 * Pure helper returning oldest sessions to delete so local storage falls back cleanly below target.
 * Always preserves at least `keepMinimumRecent` newest sessions (default 1, preferring 3 when sufficient).
 */
export function selectOlderSessionsToClear(
  sessions: DualCaptureSession[],
  currentUsedBytes: number,
  thresholdBytes: number = STORAGE_CLEANUP_THRESHOLD_BYTES,
  keepRecentPreferred: number = 3
): { sessionsToDelete: DualCaptureSession[]; estimatedFreedBytes: number } {
  if (sessions.length <= 1 || currentUsedBytes < thresholdBytes) {
    return { sessionsToDelete: [], estimatedFreedBytes: 0 };
  }

  // Sort oldest -> newest by creation timestamp
  const oldestFirst = [...sessions].sort((a, b) => a.createdAt - b.createdAt);
  // Target 75% of threshold to provide healthy headroom after cleanup
  const targetBytesAfterCleanup = Math.floor(thresholdBytes * 0.75);
  const bytesToFree = Math.max(1, currentUsedBytes - targetBytesAfterCleanup);

  const selected: DualCaptureSession[] = [];
  let freedBytes = 0;

  // Phase 1: remove sessions beyond the newest `keepRecentPreferred`
  const preferredMaxRemovable = Math.max(0, oldestFirst.length - Math.max(1, keepRecentPreferred));
  for (let i = 0; i < preferredMaxRemovable; i++) {
    const s = oldestFirst[i];
    selected.push(s);
    freedBytes += estimateSessionSizeBytes(s);
    if (freedBytes >= bytesToFree) {
      break;
    }
  }

  // Phase 2: if a few huge videos exceed 2GB on their own, allow removing down to keeping the single newest session
  if (freedBytes < bytesToFree && oldestFirst.length > 1) {
    const absoluteMaxRemovable = oldestFirst.length - 1;
    for (let i = selected.length; i < absoluteMaxRemovable; i++) {
      const s = oldestFirst[i];
      selected.push(s);
      freedBytes += estimateSessionSizeBytes(s);
      if (freedBytes >= bytesToFree) {
        break;
      }
    }
  }

  return { sessionsToDelete: selected, estimatedFreedBytes: freedBytes };
}

export async function checkStorageThreshold(
  thresholdBytes: number = STORAGE_CLEANUP_THRESHOLD_BYTES,
  preloadedSessions?: DualCaptureSession[]
): Promise<StorageCleanupStatus> {
  let browserUsed = 0;
  let quotaBytes: number | null = null;

  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
      const estimate = await navigator.storage.estimate();
      if (typeof estimate.usage === 'number' && Number.isFinite(estimate.usage)) {
        browserUsed = estimate.usage;
      }
      if (typeof estimate.quota === 'number' && Number.isFinite(estimate.quota)) {
        quotaBytes = estimate.quota;
      }
    }
  } catch {
    // StorageManager estimate unavailable
  }

  let sessions: DualCaptureSession[] = [];
  try {
    sessions = preloadedSessions ?? (await getAllCaptureSessions());
  } catch {
    sessions = [];
  }

  const sessionsBytes = sessions.reduce((sum, s) => sum + estimateSessionSizeBytes(s), 0);
  const usedBytes = Math.max(browserUsed, sessionsBytes);
  const exceedsThreshold = usedBytes >= thresholdBytes;

  const { sessionsToDelete, estimatedFreedBytes } = selectOlderSessionsToClear(
    sessions,
    usedBytes,
    thresholdBytes
  );

  return {
    usedBytes,
    quotaBytes,
    thresholdBytes,
    exceedsThreshold,
    sessionCount: sessions.length,
    cleanableSessionCount: sessionsToDelete.length,
    estimatedReclaimableBytes: estimatedFreedBytes,
    sessionsBytes,
  };
}

export async function clearOlderSessions(
  thresholdBytes: number = STORAGE_CLEANUP_THRESHOLD_BYTES,
  preloadedStatus?: StorageCleanupStatus
): Promise<{
  deletedCount: number;
  freedBytes: number;
  remainingSessions: DualCaptureSession[];
}> {
  let sessions: DualCaptureSession[] = [];
  try {
    sessions = await getAllCaptureSessions();
  } catch {
    return { deletedCount: 0, freedBytes: 0, remainingSessions: [] };
  }

  const status = preloadedStatus ?? (await checkStorageThreshold(thresholdBytes, sessions));
  const { sessionsToDelete, estimatedFreedBytes } = selectOlderSessionsToClear(
    sessions,
    status.usedBytes,
    thresholdBytes
  );

  if (sessionsToDelete.length === 0) {
    return { deletedCount: 0, freedBytes: 0, remainingSessions: sessions };
  }

  const deleteIds = new Set<string>(sessionsToDelete.map((s) => s.id));

  for (const s of sessionsToDelete) {
    try {
      await deleteCaptureSession(s.id);
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        if (s.verticalMedia.url?.startsWith('blob:')) URL.revokeObjectURL(s.verticalMedia.url);
        if (s.horizontalMedia.url?.startsWith('blob:')) URL.revokeObjectURL(s.horizontalMedia.url);
      }
    } catch {
      // Continue clearing remaining older sessions cleanly
    }
  }

  const remainingSessions = sessions.filter((s) => !deleteIds.has(s.id));
  return {
    deletedCount: sessionsToDelete.length,
    freedBytes: estimatedFreedBytes,
    remainingSessions,
  };
}

export async function saveCaptureSession(
  session: DualCaptureSession
): Promise<{ savedToDeviceGallery: boolean; message: string; quotaExceeded?: boolean }> {
  let quotaExceeded = false;
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(session);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    const errName = err instanceof DOMException || err instanceof Error ? err.name : '';
    if (errName === 'QuotaExceededError') {
      quotaExceeded = true;
    }
    console.warn('Failed to save to IndexedDB, using localStorage fallback', err);
    try {
      const existing = getLocalFallbackSessions();
      existing.unshift(session);
      localStorage.setItem('dualshot_captures', JSON.stringify(existing.slice(0, 30)));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        quotaExceeded = true;
      }
      console.error('LocalStorage write failed:', e);
    }
  }

  if (Capacitor.isNativePlatform() && !session.id.startsWith('demo-')) {
    const baseName = `${OEM_CONFIG.appName}_${session.id}`;
    const vSource = session.verticalMedia.blob || session.verticalMedia.url;
    const hSource = session.horizontalMedia.blob || session.horizontalMedia.url;

    const [vRes, hRes] = await Promise.all([
      saveMediaToAndroidGallery(vSource, `${baseName}_9-16`, session.type),
      saveMediaToAndroidGallery(hSource, `${baseName}_16-9`, session.type),
    ]);

    if (vRes.savedToDeviceGallery || hRes.savedToDeviceGallery) {
      return {
        savedToDeviceGallery: true,
        message: `Saved 9:16 & 16:9 to ${OEM_CONFIG.appName} Gallery`,
        quotaExceeded,
      };
    }
  }

  return {
    savedToDeviceGallery: false,
    message: quotaExceeded ? 'Captured — clear older sessions to free local space' : 'Captured 9:16 & 16:9 media',
    quotaExceeded,
  };
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
  const pw = 540;
  const ph = 960;
  const vCanvas = document.createElement('canvas');
  vCanvas.width = pw;
  vCanvas.height = ph;
  const vCtx = vCanvas.getContext('2d', { alpha: false });
  if (vCtx) {
    const grad = vCtx.createLinearGradient(0, 0, 0, ph);
    grad.addColorStop(0, '#3888d8');
    grad.addColorStop(0.5, '#6cb3ef');
    grad.addColorStop(1, '#97d2fb');
    vCtx.fillStyle = grad;
    vCtx.fillRect(0, 0, pw, ph);

    const sunGrad = vCtx.createRadialGradient(290, 360, 8, 290, 360, 140);
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.28, 'rgba(255, 252, 200, 0.9)');
    sunGrad.addColorStop(1, 'rgba(255, 220, 140, 0)');
    vCtx.fillStyle = sunGrad;
    vCtx.beginPath();
    vCtx.arc(290, 360, 140, 0, Math.PI * 2);
    vCtx.fill();

    vCtx.fillStyle = '#1c3d25';
    for (let i = 0; i < 9; i++) {
      vCtx.beginPath();
      vCtx.arc(i * 70 - 20, 675 + Math.sin(i * 1.5) * 40, 80, 0, Math.PI * 2);
      vCtx.fill();
    }
    vCtx.fillStyle = '#265332';
    for (let i = 0; i < 11; i++) {
      vCtx.beginPath();
      vCtx.arc(i * 55 - 10, 740 + Math.cos(i * 1.3) * 35, 70, 0, Math.PI * 2);
      vCtx.fill();
    }
  }

  const lw = 960;
  const lh = 540;
  const hCanvas = document.createElement('canvas');
  hCanvas.width = lw;
  hCanvas.height = lh;
  const hCtx = hCanvas.getContext('2d', { alpha: false });
  if (hCtx) {
    const grad = hCtx.createLinearGradient(0, 0, 0, lh);
    grad.addColorStop(0, '#3888d8');
    grad.addColorStop(0.6, '#6cb3ef');
    grad.addColorStop(1, '#97d2fb');
    hCtx.fillStyle = grad;
    hCtx.fillRect(0, 0, lw, lh);

    const sunGrad = hCtx.createRadialGradient(480, 210, 10, 480, 210, 150);
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.28, 'rgba(255, 252, 200, 0.9)');
    sunGrad.addColorStop(1, 'rgba(255, 220, 140, 0)');
    hCtx.fillStyle = sunGrad;
    hCtx.beginPath();
    hCtx.arc(480, 210, 150, 0, Math.PI * 2);
    hCtx.fill();

    hCtx.fillStyle = '#1c3d25';
    for (let i = 0; i < 15; i++) {
      hCtx.beginPath();
      hCtx.arc(i * 75 - 25, 390 + Math.sin(i * 1.4) * 30, 85, 0, Math.PI * 2);
      hCtx.fill();
    }
    hCtx.fillStyle = '#2b5e38';
    for (let i = 0; i < 18; i++) {
      hCtx.beginPath();
      hCtx.arc(i * 60 - 15, 435 + Math.cos(i * 1.7) * 25, 75, 0, Math.PI * 2);
      hCtx.fill();
    }
  }

  const vDataUrl = vCanvas.toDataURL('image/jpeg', 0.85);
  const hDataUrl = hCanvas.toDataURL('image/jpeg', 0.85);

  return {
    id: 'demo-sample-1',
    createdAt: Date.now() - 1000 * 60 * 15,
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
