import React, { useState, useEffect, useRef } from 'react';
import {
  CameraSettings,
  CaptureType,
  DualCaptureSession,
  LensMode,
} from './types/camera';
import {
  saveCaptureSession,
  getAllCaptureSessions,
  deleteCaptureSession,
  createSampleDemoSession,
} from './utils/indexedDb';
import { DualCameraEngine } from './utils/cameraStream';
import {
  playShutterSound,
  playRecordStartSound,
  playRecordStopSound,
} from './utils/audioSfx';
import { formatDuration } from './utils/cropMath';
import { PhoneFrame } from './components/PhoneFrame';
import { CameraViewfinder } from './components/CameraViewfinder';
import { CameraControls } from './components/CameraControls';
import { SettingsModal } from './components/SettingsModal';
import { GalleryModal } from './components/GalleryModal';
import { AndroidInstallModal } from './components/AndroidInstallModal';
import { InterstitialAdModal } from './components/InterstitialAdModal';
import { RemoveAdsModal } from './components/RemoveAdsModal';
import {
  loadUserSubscription,
  shouldDisplayAd,
  DEFAULT_AD_CONFIG,
} from './utils/monetization';
import { UserSubscriptionState } from './types/monetization';

export default function App() {
  // Monetization & AdMob Ad States
  const [subscriptionState, setSubscriptionState] = useState<UserSubscriptionState>(() =>
    loadUserSubscription()
  );
  const [isAdModalOpen, setIsAdModalOpen] = useState<boolean>(() =>
    shouldDisplayAd(loadUserSubscription(), 'launch', 0, DEFAULT_AD_CONFIG)
  );
  const [isRemoveAdsModalOpen, setIsRemoveAdsModalOpen] = useState<boolean>(false);
  const [capturesCount, setCapturesCount] = useState<number>(0);

  // Core Camera States
  const [lensMode, setLensMode] = useState<LensMode>('single');
  const [captureType, setCaptureType] = useState<CaptureType>('video');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Settings & Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [settings, setSettings] = useState<CameraSettings>({
    videoQuality: '1080p',
    frameRate: 30,
    fileFormat: 'mp4',
    cameraAssignmentA: 'portrait',
    flashMode: 'off',
    audioEnabled: true,
    gridGuides: true,
    demoSimulation: false,
    digitalStabilization: true,
  });

  // Advanced Camera Controls State (Zoom, Exposure Compensation, Manual Focus, White Balance)
  const [advancedControls, setAdvancedControls] = useState<{
    zoom: number;
    exposure: number;
    focusMode: 'auto' | 'manual';
    focusDistance: number;
    whiteBalance: 'auto' | 'daylight' | 'cloudy' | 'tungsten' | 'fluorescent';
    focusPeaking: boolean;
    proDrawerOpen: boolean;
    activeControlTab: 'zoom' | 'exposure' | 'focus' | 'wb';
  }>({
    zoom: 1.0,
    exposure: 0.0,
    focusMode: 'auto',
    focusDistance: 0.5,
    whiteBalance: 'auto',
    focusPeaking: false,
    proDrawerOpen: false,
    activeControlTab: 'zoom',
  });

  // Gallery Sessions
  const [sessions, setSessions] = useState<DualCaptureSession[]>([]);

  // Refs
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);
  const canvasDisplayRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DualCameraEngine | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  // 1. Initialize Engine & Storage
  useEffect(() => {
    const engine = new DualCameraEngine();
    engineRef.current = engine;

    // Load persistent sessions from IndexedDB
    getAllCaptureSessions().then((loaded) => {
      if (loaded.length === 0) {
        // Seed default high-fidelity sample session
        const sample = createSampleDemoSession();
        saveCaptureSession(sample).catch(() => {});
        setSessions([sample]);
      } else {
        setSessions(loaded);
      }
    });

    return () => {
      engine.stopCamera();
    };
  }, []);

  // 2. Start/Restart Camera when facingMode or settings change
  useEffect(() => {
    if (!engineRef.current || !videoRefA.current) return;

    engineRef.current.setVideoElements(videoRefA.current, videoRefB.current || undefined);

    let isMounted = true;
    engineRef.current
      .startCamera(facingMode, settings, lensMode)
      .then((res) => {
        if (!isMounted) return;
        setIsSimulated(res.isSimulated);
        if (res.error) {
          setCameraError(res.error);
        } else {
          setCameraError(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [facingMode, settings.demoSimulation, settings.audioEnabled, lensMode]);

  // Sync advanced camera controls and stabilization with engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setAdvancedControls(advancedControls);
    }
  }, [advancedControls]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setDigitalStabilization(settings.digitalStabilization);
    }
  }, [settings.digitalStabilization]);

  // 3. Render Viewfinder Display Loop (at 30fps)
  useEffect(() => {
    let animId: number;
    let lastTime = 0;
    const interval = 1000 / 30;

    const render = (now: number) => {
      if (now - lastTime >= interval) {
        lastTime = now;
        if (engineRef.current && canvasDisplayRef.current) {
          const engine = engineRef.current;
          engine.updateCanvasesFromVideo(lensMode, advancedControls);

          const displayCtx = canvasDisplayRef.current.getContext('2d');
          if (displayCtx) {
            const srcCanvas = engine.getCanvasPortrait();
            displayCtx.drawImage(
              srcCanvas,
              0,
              0,
              canvasDisplayRef.current.width,
              canvasDisplayRef.current.height
            );
          }
        }
      }
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [lensMode, advancedControls]);

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

  // Shutter / Record Handler
  const handleTriggerShutter = async () => {
    if (!engineRef.current) return;

    if (captureType === 'photo') {
      // Photo Capture: Snap simultaneous 9:16 and 16:9
      setIsFlashing(true);
      playShutterSound();
      setTimeout(() => setIsFlashing(false), 160);

      try {
        const session = await engineRef.current.takeDualPhoto(lensMode, advancedControls);
        await saveCaptureSession(session);
        setSessions((prev) => [session, ...prev]);

        // Track capture count and check ad frequency for free users
        const nextCount = capturesCount + 1;
        setCapturesCount(nextCount);
        if (shouldDisplayAd(subscriptionState, 'capture', nextCount, DEFAULT_AD_CONFIG)) {
          setTimeout(() => setIsAdModalOpen(true), 600);
        }
      } catch (err) {
        console.error('Error snapping dual photo:', err);
      }
    } else {
      // Video Capture: Record simultaneous 9:16 and 16:9
      if (!isRecording) {
        // Start recording
        playRecordStartSound();
        engineRef.current.startDualRecording(settings.frameRate);
        setIsRecording(true);
      } else {
        // Stop recording
        playRecordStopSound();
        setIsRecording(false);
        try {
          const session = await engineRef.current.stopDualRecording(lensMode);
          await saveCaptureSession(session);
          setSessions((prev) => [session, ...prev]);

          // Track capture count and check ad frequency for free users
          const nextCount = capturesCount + 1;
          setCapturesCount(nextCount);
          if (shouldDisplayAd(subscriptionState, 'capture', nextCount, DEFAULT_AD_CONFIG)) {
            setTimeout(() => setIsAdModalOpen(true), 600);
          }
        } catch (err) {
          console.error('Error stopping dual recording:', err);
        }
      }
    }
  };

  const handleFlipCamera = () => {
    if (isRecording) return; // Prevent camera flip during active recording
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleToggleFlash = () => {
    setSettings((prev) => ({
      ...prev,
      flashMode: prev.flashMode === 'off' ? 'on' : prev.flashMode === 'on' ? 'auto' : 'off',
    }));
  };

  const handleToggleAudio = () => {
    setSettings((prev) => ({
      ...prev,
      audioEnabled: !prev.audioEnabled,
    }));
  };

  const handleDeleteSession = async (id: string) => {
    await deleteCaptureSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const latestThumb = sessions.length > 0 ? sessions[0].thumbnailUrl : undefined;

  return (
    <PhoneFrame>
      {/* Camera Viewfinder Area */}
      <CameraViewfinder
        lensMode={lensMode}
        isRecording={isRecording}
        recordingTime={recordingTime}
        formatDuration={formatDuration}
        isFlashing={isFlashing}
        videoRefA={videoRefA}
        videoRefB={videoRefB}
        canvasDisplayRef={canvasDisplayRef}
        isSimulated={isSimulated}
        zoom={advancedControls.zoom}
        exposure={advancedControls.exposure}
        onUpdateExposure={(ev) => setAdvancedControls((prev) => ({ ...prev, exposure: ev }))}
        focusMode={advancedControls.focusMode}
        focusDistance={advancedControls.focusDistance}
        digitalStabilization={settings.digitalStabilization}
      />

      {/* Floating Camera Controls (Header, Zoom Presets, Pro Drawer, Mode Pills, Shutter, Gallery, Flip) */}
      <CameraControls
        lensMode={lensMode}
        onSelectLensMode={(mode) => !isRecording && setLensMode(mode)}
        captureType={captureType}
        onSelectCaptureType={(type) => !isRecording && setCaptureType(type)}
        isRecording={isRecording}
        onTriggerShutter={handleTriggerShutter}
        onToggleFlash={handleToggleFlash}
        flashMode={settings.flashMode}
        audioEnabled={settings.audioEnabled}
        onToggleAudio={handleToggleAudio}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenGallery={() => setIsGalleryOpen(true)}
        onFlipCamera={handleFlipCamera}
        onOpenInstallModal={() => setIsInstallModalOpen(true)}
        isAdFree={subscriptionState.isAdFree}
        onOpenRemoveAdsModal={() => setIsRemoveAdsModalOpen(true)}
        lastThumbnailUrl={latestThumb}
        galleryItemCount={sessions.length}
        advancedControls={advancedControls}
        onUpdateAdvancedControls={(patch) =>
          setAdvancedControls((prev) => ({ ...prev, ...patch }))
        }
      />

      {/* Settings Modal (Panel 4) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newVals) => setSettings((prev) => ({ ...prev, ...newVals }))}
        onOpenInstallModal={() => {
          setIsSettingsOpen(false);
          setIsInstallModalOpen(true);
        }}
        subscriptionState={subscriptionState}
        onOpenRemoveAdsModal={() => {
          setIsSettingsOpen(false);
          setIsRemoveAdsModalOpen(true);
        }}
      />

      {/* Dual Gallery Modal (Panel 1) */}
      <GalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        sessions={sessions}
        onDeleteSession={handleDeleteSession}
        onSelectCapture={() => {}}
      />

      {/* Android PWA Install Modal */}
      <AndroidInstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      {/* Google AdMob Interstitial Ad (Shown to Free Users on launch / interval) */}
      <InterstitialAdModal
        isOpen={isAdModalOpen && !subscriptionState.isAdFree}
        onClose={() => setIsAdModalOpen(false)}
        onOpenUpgradeModal={() => setIsRemoveAdsModalOpen(true)}
        skipSeconds={DEFAULT_AD_CONFIG.skipAfterSeconds}
      />

      {/* Google Play In-App Purchase: Remove Ads Pro Lifetime Sheet */}
      <RemoveAdsModal
        isOpen={isRemoveAdsModalOpen}
        onClose={() => setIsRemoveAdsModalOpen(false)}
        subscriptionState={subscriptionState}
        onSubscriptionUpdated={(newSub) => {
          setSubscriptionState(newSub);
          if (newSub.isAdFree) {
            setIsAdModalOpen(false); // Close any active ad immediately upon purchase
          }
        }}
      />
    </PhoneFrame>
  );
}
