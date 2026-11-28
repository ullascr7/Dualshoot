import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_CLEANUP_THRESHOLD_BYTES,
  estimateSessionSizeBytes,
  selectOlderSessionsToClear,
  checkStorageThreshold,
} from './indexedDb';
import { DualCaptureSession } from '../types/camera';

function makeSession(id: string, createdAt: number, sizeEachBytes: number): DualCaptureSession {
  return {
    id,
    createdAt,
    type: 'video',
    lensMode: 'dual',
    duration: 30,
    thumbnailUrl: '',
    title: `Capture ${id}`,
    verticalMedia: {
      id: `${id}-v`,
      url: '',
      aspectRatio: '9:16',
      label: 'TikTok / Reels (9:16)',
      width: 1080,
      height: 1920,
      fileSize: sizeEachBytes,
    },
    horizontalMedia: {
      id: `${id}-h`,
      url: '',
      aspectRatio: '16:9',
      label: 'YouTube (16:9)',
      width: 1920,
      height: 1080,
      fileSize: sizeEachBytes,
    },
  };
}

test('STORAGE_CLEANUP_THRESHOLD_BYTES defaults cleanly to 2GB', () => {
  assert.equal(STORAGE_CLEANUP_THRESHOLD_BYTES, 2 * 1024 * 1024 * 1024);
});

test('estimateSessionSizeBytes sums vertical and horizontal capture sizes', () => {
  const s = makeSession('s1', 1000, 150_000_000);
  assert.equal(estimateSessionSizeBytes(s), 300_000_000);
});

test('selectOlderSessionsToClear returns empty when below threshold', () => {
  const sessions = [
    makeSession('s1', 1000, 200_000_000),
    makeSession('s2', 2000, 200_000_000),
    makeSession('s3', 3000, 200_000_000),
    makeSession('s4', 4000, 200_000_000),
  ];
  const res = selectOlderSessionsToClear(sessions, 1_600_000_000, STORAGE_CLEANUP_THRESHOLD_BYTES);
  assert.equal(res.sessionsToDelete.length, 0);
  assert.equal(res.estimatedFreedBytes, 0);
});

test('selectOlderSessionsToClear selects oldest sessions first and preserves newest sessions', () => {
  const sessions = [
    makeSession('newest', 5000, 250_000_000), // 500MB
    makeSession('old-2', 2000, 250_000_000),  // 500MB
    makeSession('old-1', 1000, 250_000_000),  // 500MB
    makeSession('recent-3', 3000, 250_000_000), // 500MB
    makeSession('recent-4', 4000, 250_000_000), // 500MB
  ];
  // Total = 2.5 GB, threshold = 2.0 GB -> target after cleanup = 1.5 GB -> need to free 1.0 GB (oldest 2)
  const totalBytes = 2_500_000_000;
  const threshold = 2_000_000_000;
  const res = selectOlderSessionsToClear(sessions, totalBytes, threshold);

  assert.equal(res.sessionsToDelete.length, 2);
  assert.deepEqual(
    res.sessionsToDelete.map((s) => s.id),
    ['old-1', 'old-2']
  );
  assert.equal(res.estimatedFreedBytes, 1_000_000_000);
});

test('selectOlderSessionsToClear falls back to keeping only newest 1 session if <=3 large videos exceed threshold', () => {
  const sessions = [
    makeSession('huge-old', 1000, 700_000_000), // 1.4 GB
    makeSession('huge-new', 2000, 600_000_000), // 1.2 GB
  ];
  const res = selectOlderSessionsToClear(sessions, 2_600_000_000, 2_000_000_000);
  assert.equal(res.sessionsToDelete.length, 1);
  assert.equal(res.sessionsToDelete[0].id, 'huge-old');
});

test('checkStorageThreshold reports exceedsThreshold when preloaded sessions surpass threshold', async () => {
  const sessions = [
    makeSession('a', 1000, 600_000_000), // 1.2 GB
    makeSession('b', 2000, 600_000_000), // 1.2 GB
  ];
  const status = await checkStorageThreshold(2_000_000_000, sessions);
  assert.equal(status.exceedsThreshold, true);
  assert.equal(status.sessionCount, 2);
  assert.equal(status.cleanableSessionCount, 1);
  assert.equal(status.usedBytes, 2_400_000_000);
});
