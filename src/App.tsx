import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import {
  AdvancedControlsState,
  CameraErrorKind,
  CameraSettings,
  CaptureType,
  DualCaptureSession,
  DualLayoutMode,
  HardwareQualityProfile,
  LensMode,
  TimerDelay,
} from './types/camera';
import {
  saveCaptureSession,
  getAllCaptureSessions,
  deleteCaptureSession,
  createSampleDemoSession,
  checkStorageThreshold,
  clearOlderSessions,
  STORAGE_CLEANUP_THRESHOLD_BYTES,
  StorageCleanupStatus,
} from './utils/indexedDb';
import { DualCameraEngine } from './utils/cameraStream';
import {
  playShutterSound,
  playRecordStartSound,
  playRecordStopSound,
  playFocusBeep,
  prewarmAudioSfx,
} from './utils/audioSfx';
import { formatBytes, formatDuration } from './utils/cropMath';
import { OEM_CONFIG } from './config/oemConfig';
import { CameraViewfinder } from './components/CameraViewfinder';
import { CameraControls, TopCameraBar } from './components/CameraControls';
import { SettingsModal } from './components/SettingsModal';
import { GalleryModal } from './components/GalleryModal';
import { StorageCleanupModal } from './components/StorageCleanupModal';

const INITIAL_HARDWARE_PROFILE: HardwareQualityProfile = {
  detectedMaxWidth: 1920,
  detectedMaxHeight: 1080,
  activeWidth: 1920,
  activeHeight: 1080,
  activeFps: 60,
  qualityLabel: '1080p',
  bitrateBps: 20_000_000,
  codecLabel: 'H.264/MP4',
  concurrentDualSupported: false,
  sequentialFallbackActive: false,
};

export default function App() {
  // Core Camera States
  const [dualLayoutMode, setDualLayoutMode] = useState<DualLayoutMode>('single');
  const lensMode: LensMode = dualLayoutMode === 'single' ? 'single' : 'dual';

  const [captureType, setCaptureType] = useState<CaptureType>('video');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [hasSecondaryStream, setHasSecondaryStream] = useState(false);
  const [hardwareProfile, setHardwareProfile] = useState<HardwareQualityProfile>(
    INITIAL_HARDWARE_PROFILE
  );
  const [cameraErrorKind, setCameraErrorKind] = useState<CameraErrorKind | null>(null);
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);
  const [restartCounter, setRestartCounter] = useState(0);
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

  // Settings & Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [settings, setSettings] = useState<CameraSettings>({
    videoQuality: '1080p',
    frameRate: 60,
    fileFormat: 'mp4',
    cameraAssignmentA: 'portrait',
    flashMode: 'off',
    audioEnabled: true,
    gridGuides: true,
    demoSimulation: false,
    digitalStabilization: true,
    showWatermark: OEM_CONFIG.showBrandWatermark,
    timerDelay: 0,
    autoMaxQuality: true,
  });

  // Advanced Camera Controls State (Zoom, Exposure Compensation, Manual Focus, White Balance)
  const [advancedControls, setAdvancedControls] = useState<AdvancedControlsState>({
    zoom: 1.0,
    exposure: 0.0,
    focusMode: 'auto',
    focusDistance: 0.5,
    whiteBalance: 'auto',
    focusPeaking: false,
    proDrawerOpen: false,
    activeControlTab: 'zoom',
  });

  // Gallery & Storage Cleanup State
  const [sessions, setSessions] = useState<DualCaptureSession[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageCleanupStatus | null>(null);
  const [isCleanupPromptOpen, setIsCleanupPromptOpen] = useState(false);
  const [isCleaningStorage, setIsCleaningStorage] = useState(false);
  const cleanupDismissedRef = useRef(false);

  // Hardware & Rendering Refs (never cause 60fps re-renders)
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);
  const canvasDisplayRef = useRef<HTMLCanvasElement>(null);
  const canvasSecondaryRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DualCameraEngine | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Live state mirrors for zero-restart 60fps rAF loop
  const advancedControlsRef = useRef(advancedControls);
  const dualLayoutModeRef = useRef(dualLayoutMode);
  const lensModeRef = useRef(lensMode);
  const isRecordingRef = useRef(isRecording);
  const isSimulatedRef = useRef(isSimulated);
  const hasSecondaryStreamRef = useRef(hasSecondaryStream);
  const sessionsRef = useRef(sessions);

  advancedControlsRef.current = advancedControls;
  dualLayoutModeRef.current = dualLayoutMode;
  lensModeRef.current = lensMode;
  isRecordingRef.current = isRecording;
  isSimulatedRef.current = isSimulated;
  hasSecondaryStreamRef.current = hasSecondaryStream;
  sessionsRef.current = sessions;

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ message, isError });
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3200);
  }, []);

  const evaluateStorageHealth = useCallback(
    async (currentSessions?: DualCaptureSession[], forcePrompt = false) => {
      try {
        const status = await checkStorageThreshold(
          STORAGE_CLEANUP_THRESHOLD_BYTES,
          currentSessions
        );
        setStorageStatus(status);
        if (
          (forcePrompt || !cleanupDismissedRef.current) &&
          status.exceedsThreshold &&
          status.cleanableSessionCount > 0
        ) {
          setIsCleanupPromptOpen(true);
        }
      } catch {
        // Ignore storage inspection errors gracefully
      }
    },
    []
  );

  // 1. Initialize Engine & Persistent Gallery Storage
  useEffect(() => {
    const engine = new DualCameraEngine();
    engineRef.current = engine;

    getAllCaptureSessions()
      .then((loaded) => {
        const initialSessions =
          loaded.length === 0 ? [createSampleDemoSession()] : loaded;
        if (loaded.length === 0) {
          saveCaptureSession(initialSessions[0]).catch(() => {});
        }
        setSessions(initialSessions);
        void evaluateStorageHealth(initialSessions);
      })
      .catch(() => {
        setSessions([createSampleDemoSession()]);
      });

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      engine.stopCamera();
    };
  }, [evaluateStorageHealth]);

  // 2. Start/Restart Camera ONLY when facing, audio, simulation, or quality prefs change (NOT layout switches)
  useEffect(() => {
    if (!engineRef.current || !videoRefA.current) return;

    engineRef.current.setVideoElements(videoRefA.current, videoRefB.current || undefined);

    let isMounted = true;
    engineRef.current
      .startCamera(facingMode, settings, lensModeRef.current)
      .then((res) => {
        if (!isMounted) return;
        setHardwareProfile(res.hardwareProfile);
        setHasSecondaryStream(res.hardwareProfile.concurrentDualSupported);

        if (res.hasPermission) {
          setCameraErrorKind(null);
          setCameraErrorMessage(null);
          setIsSimulated(res.isSimulated);
        } else {
          setIsSimulated(false);
          setCameraErrorKind(res.errorKind || 'unknown');
          setCameraErrorMessage(
            res.error || 'Camera access could not be initialized on this device.'
          );
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setCameraErrorKind('unknown');
        setCameraErrorMessage('Unable to access camera right now. Try Demo Scene or retry.');
      });

    return () => {
      isMounted = false;
    };
  }, [
    facingMode,
    settings.demoSimulation,
    settings.audioEnabled,
    settings.autoMaxQuality,
    settings.videoQuality,
    settings.frameRate,
    restartCounter,
  ]);

  // Sync advanced camera controls and stabilization with engine
  useEffect(() => {
    engineRef.current?.setAdvancedControls(advancedControls);
  }, [advancedControls]);

  useEffect(() => {
    engineRef.current?.setDigitalStabilization(settings.digitalStabilization);
  }, [settings.digitalStabilization]);

  // 3. Single Unified Zero-Lag Rendering Pipeline (pauses completely when hardware <video> previews directly on GPU)
  const needsCanvasLoop =
    isSimulated || isRecording || (dualLayoutMode !== 'single' && !hasSecondaryStream);

  useEffect(() => {
    if (!needsCanvasLoop) return;

    let animId: number;
    let lastTime = 0;
    let ctxDisplay: CanvasRenderingContext2D | null = null;
    let ctxSecondary: CanvasRenderingContext2D | null = null;

    const renderLoop = (now: number) => {
      const engine = engineRef.current;
      if (engine) {
        const simulated = isSimulatedRef.current;
        const recording = isRecordingRef.current;
        const layout = dualLayoutModeRef.current;
        const secondaryNeedsCanvas = layout !== 'single' && !hasSecondaryStreamRef.current;

        if (simulated || recording || secondaryNeedsCanvas) {
          // Match WebView canvas captureStream cadence so MediaRecorder never stalls the 60fps UI thread
          const minFrameMs = simulated && recording ? 1000 / 18 : 1000 / 30;
          if (now - lastTime >= minFrameMs) {
            lastTime = now;

            if (simulated) {
              engine.renderSimulationStep(
                advancedControlsRef.current,
                layout !== 'single' || recording
              );

              if (canvasDisplayRef.current) {
                if (!ctxDisplay) {
                  ctxDisplay = canvasDisplayRef.current.getContext('2d', { alpha: false });
                }
                if (ctxDisplay) {
                  ctxDisplay.drawImage(
                    engine.getCanvasPortrait(),
                    0,
                    0,
                    canvasDisplayRef.current.width,
                    canvasDisplayRef.current.height
                  );
                }
              }
            } else {
              engine.updateCanvasesFromVideo(
                lensModeRef.current,
                advancedControlsRef.current,
                layout
              );
            }

            if ((simulated && layout !== 'single') || (!simulated && secondaryNeedsCanvas)) {
              if (canvasSecondaryRef.current) {
                if (!ctxSecondary) {
                  ctxSecondary = canvasSecondaryRef.current.getContext('2d', { alpha: false });
                }
                if (ctxSecondary) {
                  ctxSecondary.drawImage(
                    engine.getCanvasLandscape(),
                    0,
                    0,
                    canvasSecondaryRef.current.width,
                    canvasSecondaryRef.current.height
                  );
                }
              }
            }
          }
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [needsCanvasLoop]);

  // 4. Recording Timer
  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setRecordingTime(0);
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);

  // Execute Immediate Capture (after optional countdown timer)
  const executeCaptureNow = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    if (captureType === 'photo') {
      setIsFlashing(true);
      playShutterSound();
      setTimeout(() => setIsFlashing(false), 160);

      try {
        const session = await engine.takeDualPhoto(lensMode, advancedControlsRef.current);
        const saveResult = await saveCaptureSession(session);
        const updatedSessions = [session, ...sessionsRef.current];
        setSessions(updatedSessions);
        void evaluateStorageHealth(updatedSessions, Boolean(saveResult.quotaExceeded));
        showToast(saveResult.message, Boolean(saveResult.quotaExceeded));
      } catch (err) {
        console.error('Photo capture failed:', err);
        showToast('Could not capture photo. Please try again.', true);
      }
    } else {
      if (!isRecording) {
        try {
          playRecordStartSound();
          engine.startDualRecording(
            settings.autoMaxQuality ? hardwareProfile.activeFps : settings.frameRate
          );
          setIsRecording(true);
        } catch (err) {
          console.error('Video start failed:', err);
          showToast('Unable to start video recording.', true);
        }
      } else {
        playRecordStopSound();
        setIsRecording(false);
        try {
          const session = await engine.stopDualRecording(lensMode);
          const saveResult = await saveCaptureSession(session);
          const updatedSessions = [session, ...sessionsRef.current];
          setSessions(updatedSessions);
          void evaluateStorageHealth(updatedSessions, Boolean(saveResult.quotaExceeded));
          showToast(saveResult.message, Boolean(saveResult.quotaExceeded));
        } catch (err) {
          console.error('Video stop/save failed:', err);
          showToast('Recording could not be saved. Try again.', true);
        }
      }
    }
  }, [captureType, isRecording, lensMode, settings.autoMaxQuality, settings.frameRate, hardwareProfile.activeFps, showToast, evaluateStorageHealth]);

  // Shutter / Record Handler with Optional 3s / 10s Countdown
  const handleTriggerShutter = useCallback(() => {
    prewarmAudioSfx();
    if (!engineRef.current) return;

    if (cameraErrorKind && !isSimulated) {
      showToast('Enable camera permissions or switch to Demo Scene.', true);
      return;
    }

    // Cancel active countdown if user taps shutter again
    if (countdownSeconds !== null) {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setCountdownSeconds(null);
      return;
    }

    // If stopping active recording, stop immediately without countdown
    if (captureType === 'video' && isRecording) {
      void executeCaptureNow();
      return;
    }

    const delay = settings.timerDelay ?? 0;
    if (delay === 0) {
      void executeCaptureNow();
      return;
    }

    // Start smooth 3s / 10s countdown
    let remaining = delay;
    setCountdownSeconds(remaining);
    playFocusBeep();

    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdownSeconds(null);
        void executeCaptureNow();
      } else {
        setCountdownSeconds(remaining);
        playFocusBeep();
      }
    }, 1000);
  }, [cameraErrorKind, isSimulated, countdownSeconds, captureType, isRecording, settings.timerDelay, executeCaptureNow, showToast]);

  const handleSelectDualLayoutMode = useCallback(
    (mode: DualLayoutMode) => {
      if (isRecordingRef.current) return;
      setDualLayoutMode(mode);
      const nextLensMode: LensMode = mode === 'single' ? 'single' : 'dual';
      engineRef.current
        ?.switchLensMode(nextLensMode, facingMode)
        .then((res) => {
          setHasSecondaryStream(res.concurrentDualSupported);
          setHardwareProfile((prev) => ({
            ...prev,
            concurrentDualSupported: res.concurrentDualSupported,
            sequentialFallbackActive: res.sequentialFallbackActive,
          }));
        })
        .catch(() => {});
    },
    [facingMode]
  );

  const handleFlipCamera = useCallback(() => {
    if (isRecordingRef.current) return;
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  const handleToggleFlash = useCallback(() => {
    setSettings((prev) => {
      const nextFlash =
        prev.flashMode === 'off' ? 'on' : prev.flashMode === 'on' ? 'auto' : 'off';
      engineRef.current?.applyTorchConstraint(nextFlash).catch(() => {});
      return { ...prev, flashMode: nextFlash };
    });
  }, []);

  const handleCycleTimer = useCallback(() => {
    if (isRecordingRef.current) return;
    setSettings((prev) => {
      const cur = prev.timerDelay ?? 0;
      const next: TimerDelay = cur === 0 ? 3 : cur === 3 ? 10 : 0;
      return { ...prev, timerDelay: next };
    });
  }, []);

  const handleToggleGrid = useCallback(() => {
    setSettings((prev) => ({ ...prev, gridGuides: !prev.gridGuides }));
  }, []);

  const handleToggleAudio = useCallback(() => {
    setSettings((prev) => ({ ...prev, audioEnabled: !prev.audioEnabled }));
  }, []);

  const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
  const handleOpenGallery = useCallback(() => setIsGalleryOpen(true), []);
  const handleSelectCaptureType = useCallback((type: CaptureType) => {
    if (!isRecordingRef.current) setCaptureType(type);
  }, []);
  const handleUpdateAdvancedControls = useCallback(
    (patch: Partial<AdvancedControlsState>) => {
      setAdvancedControls((prev) => ({ ...prev, ...patch }));
    },
    []
  );
  const handleUpdateExposure = useCallback((ev: number) => {
    setAdvancedControls((prev) => ({ ...prev, exposure: ev }));
  }, []);
  const handleCommitZoom = useCallback((z: number) => {
    setAdvancedControls((prev) => ({ ...prev, zoom: z }));
  }, []);
  const handleTapFocus = useCallback((nx: number, ny: number) => {
    engineRef.current?.triggerTapFocus(nx, ny).catch(() => {});
  }, []);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await deleteCaptureSession(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
      } catch (err) {
        console.error('Failed to delete session:', err);
        showToast('Could not remove capture from gallery.', true);
      }
    },
    [showToast]
  );

  const handleRetryCamera = useCallback(() => {
    setCameraErrorKind(null);
    setCameraErrorMessage(null);
    setSettings((prev) => ({ ...prev, demoSimulation: false }));
    setRestartCounter((c) => c + 1);
  }, []);

  const handleEnableDemoFallback = useCallback(() => {
    setCameraErrorKind(null);
    setCameraErrorMessage(null);
    setSettings((prev) => ({ ...prev, demoSimulation: true }));
    showToast('Switched to Demo Scene');
  }, [showToast]);

  const latestThumb = sessions.length > 0 ? sessions[0].thumbnailUrl : undefined;
  const maxZoom = hardwareProfile.hardwareZoomRange?.max ?? 5.0;

  const handleConfirmStorageCleanup = useCallback(async () => {
    setIsCleaningStorage(true);
    try {
      const result = await clearOlderSessions(
        STORAGE_CLEANUP_THRESHOLD_BYTES,
        storageStatus || undefined
      );
      setSessions(result.remainingSessions);
      const updatedStatus = await checkStorageThreshold(
        STORAGE_CLEANUP_THRESHOLD_BYTES,
        result.remainingSessions
      );
      setStorageStatus(updatedStatus);
      setIsCleanupPromptOpen(false);
      if (result.deletedCount > 0) {
        showToast(
          `Cleared ${result.deletedCount} older ${result.deletedCount === 1 ? 'session' : 'sessions'} · Freed ${formatBytes(result.freedBytes)}`
        );
      }
    } catch {
      showToast('Unable to clear older sessions right now.', true);
    } finally {
      setIsCleaningStorage(false);
    }
  }, [storageStatus, showToast]);

  const handleDismissStorageCleanup = useCallback(() => {
    cleanupDismissedRef.current = true;
    setIsCleanupPromptOpen(false);
  }, []);

  const handleOpenStorageCleanup = useCallback(() => {
    setIsCleanupPromptOpen(true);
  }, []);

  return (
    <div className="safe-area-shell relative w-screen h-[100dvh] bg-black text-white flex flex-col overflow-hidden select-none">
      {/* Capture / Error / Native Save Confirmation Toast */}
      {toast && (
        <div
          className={`absolute top-14 left-1/2 -translate-x-1/2 z-[60] px-3.5 py-2 rounded-full text-white text-xs font-semibold shadow-xl border flex items-center gap-2 whitespace-nowrap pointer-events-none ${
            toast.isError
              ? 'bg-red-600 border-red-400/50'
              : 'bg-emerald-600 border-emerald-400/50'
          }`}
        >
          {toast.isError ? (
            <AlertCircle className="w-4 h-4 text-white shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Quick-Access Stock Camera Bar */}
      <TopCameraBar
        flashMode={settings.flashMode}
        onToggleFlash={handleToggleFlash}
        timerDelay={settings.timerDelay ?? 0}
        onCycleTimer={handleCycleTimer}
        showGrid={settings.gridGuides}
        onToggleGrid={handleToggleGrid}
        audioEnabled={settings.audioEnabled}
        onToggleAudio={handleToggleAudio}
        hardwareProfile={hardwareProfile}
        autoMaxQuality={settings.autoMaxQuality ?? true}
        onOpenSettings={handleOpenSettings}
        isRecording={isRecording}
      />

      {/* Flagship Edge-to-Edge Camera Viewfinder Area */}
      <CameraViewfinder
        lensMode={lensMode}
        dualLayoutMode={dualLayoutMode}
        isRecording={isRecording}
        recordingTime={recordingTime}
        countdownSeconds={countdownSeconds}
        formatDuration={formatDuration}
        isFlashing={isFlashing}
        videoRefA={videoRefA}
        videoRefB={videoRefB}
        canvasDisplayRef={canvasDisplayRef}
        canvasSecondaryRef={canvasSecondaryRef}
        isSimulated={isSimulated}
        hasSecondaryStream={hasSecondaryStream}
        hardwareProfile={hardwareProfile}
        zoom={advancedControls.zoom}
        maxZoom={maxZoom}
        exposure={advancedControls.exposure}
        focusMode={advancedControls.focusMode}
        focusDistance={advancedControls.focusDistance}
        whiteBalance={advancedControls.whiteBalance}
        showGrid={settings.gridGuides}
        digitalStabilization={settings.digitalStabilization}
        cameraErrorKind={cameraErrorKind}
        cameraErrorMessage={cameraErrorMessage}
        onRetryCamera={handleRetryCamera}
        onEnableDemoFallback={handleEnableDemoFallback}
        onSwapFrontRear={handleFlipCamera}
        onUpdateExposure={handleUpdateExposure}
        onCommitZoom={handleCommitZoom}
        onTapFocus={handleTapFocus}
      />

      {/* Thumb-Friendly AMOLED Bottom Camera Controls */}
      <CameraControls
        dualLayoutMode={dualLayoutMode}
        onSelectDualLayoutMode={handleSelectDualLayoutMode}
        captureType={captureType}
        onSelectCaptureType={handleSelectCaptureType}
        isRecording={isRecording}
        isCountdownActive={countdownSeconds !== null}
        onTriggerShutter={handleTriggerShutter}
        onOpenGallery={handleOpenGallery}
        onFlipCamera={handleFlipCamera}
        lastThumbnailUrl={latestThumb}
        galleryItemCount={sessions.length}
        advancedControls={advancedControls}
        onUpdateAdvancedControls={handleUpdateAdvancedControls}
        maxZoom={maxZoom}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newVals) => setSettings((prev) => ({ ...prev, ...newVals }))}
        hardwareProfile={hardwareProfile}
        storageStatus={storageStatus}
        onOpenStorageCleanup={handleOpenStorageCleanup}
      />

      {/* Dual Gallery Modal */}
      <GalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        sessions={sessions}
        onDeleteSession={handleDeleteSession}
        onSelectCapture={() => {}}
        showWatermark={settings.showWatermark ?? OEM_CONFIG.showBrandWatermark}
      />

      {/* Automatic IndexedDB Storage Cleanup Prompt Modal */}
      <StorageCleanupModal
        isOpen={isCleanupPromptOpen}
        status={storageStatus}
        isCleaning={isCleaningStorage}
        onConfirmCleanup={handleConfirmStorageCleanup}
        onDismiss={handleDismissStorageCleanup}
      />
    </div>
  );
}
