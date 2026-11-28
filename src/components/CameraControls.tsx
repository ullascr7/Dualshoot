import React, { useState } from 'react';
import {
  Zap,
  ZapOff,
  Settings as SettingsIcon,
  RotateCcw,
  Mic,
  MicOff,
  Timer,
  Grid3X3,
  Columns2,
  PictureInPicture2,
  Maximize2,
} from 'lucide-react';
import {
  AdvancedControlsState,
  CaptureType,
  DualLayoutMode,
  HardwareQualityProfile,
  TimerDelay,
} from '../types/camera';
import { AdvancedControlsDrawer } from './AdvancedControlsDrawer';
import { prewarmAudioSfx } from '../utils/audioSfx';

interface TopCameraBarProps {
  flashMode: 'off' | 'on' | 'auto';
  onToggleFlash: () => void;
  timerDelay: TimerDelay;
  onCycleTimer: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  hardwareProfile: HardwareQualityProfile;
  autoMaxQuality: boolean;
  onOpenSettings: () => void;
  isRecording: boolean;
}

export const TopCameraBar: React.FC<TopCameraBarProps> = React.memo(({
  flashMode,
  onToggleFlash,
  timerDelay,
  onCycleTimer,
  showGrid,
  onToggleGrid,
  audioEnabled,
  onToggleAudio,
  hardwareProfile,
  autoMaxQuality,
  onOpenSettings,
  isRecording,
}) => {
  const qualityBadgeText = `${autoMaxQuality ? 'AUTO' : 'PRO'} · ${hardwareProfile.qualityLabel} ${hardwareProfile.activeFps}`;

  return (
    <header className="relative z-30 w-full px-3 py-2 bg-black flex items-center justify-between gap-1.5 border-b border-white/8 shrink-0">
      {/* Left Quick Toggles: Flash, Timer, Grid */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleFlash}
          className="min-w-[40px] min-h-[40px] rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-white transition-colors active:scale-95"
          title={`Flash: ${flashMode}`}
          aria-label="Toggle Flash"
        >
          {flashMode === 'on' ? (
            <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
          ) : flashMode === 'auto' ? (
            <div className="relative flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-300" />
              <span className="absolute -bottom-1 -right-1.5 text-[8px] font-bold text-amber-300">
                A
              </span>
            </div>
          ) : (
            <ZapOff className="w-4 h-4 text-white/75" />
          )}
        </button>

        <button
          type="button"
          disabled={isRecording}
          onClick={onCycleTimer}
          className={`min-w-[40px] min-h-[40px] px-2 rounded-full flex items-center justify-center gap-1 text-[11px] font-mono tabular-nums font-semibold transition-colors active:scale-95 disabled:opacity-40 whitespace-nowrap shrink-0 ${
            timerDelay > 0
              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
              : 'bg-white/8 hover:bg-white/15 text-white/75'
          }`}
          title={`Timer: ${timerDelay === 0 ? 'Off' : `${timerDelay}s`}`}
          aria-label="Cycle Shutter Timer"
        >
          <Timer className="w-4 h-4" />
          {timerDelay > 0 && <span>{timerDelay}s</span>}
        </button>

        <button
          type="button"
          onClick={onToggleGrid}
          className={`min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition-colors active:scale-95 ${
            showGrid
              ? 'bg-white/20 text-amber-300'
              : 'bg-white/8 hover:bg-white/15 text-white/75'
          }`}
          title="Toggle 3x3 Grid"
          aria-label="Toggle 3x3 Grid"
        >
          <Grid3X3 className="w-4 h-4" />
        </button>
      </div>

      {/* Center Auto Quality & Dual-Aspect Badge */}
      <button
        type="button"
        onClick={onOpenSettings}
        className="h-9 px-3 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 text-[11px] font-mono tabular-nums font-semibold text-white/90 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        title="Auto-Matched Camera Quality & Format"
        aria-label="Camera Quality Settings"
      >
        <span className="text-amber-400">9:16 + 16:9</span>
        <span className="text-white/35">·</span>
        <span>{qualityBadgeText}</span>
      </button>

      {/* Right Quick Actions: Mic & Settings */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleAudio}
          className={`min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition-colors active:scale-95 ${
            audioEnabled
              ? 'bg-white/8 hover:bg-white/15 text-white'
              : 'bg-red-500/20 text-red-400 border border-red-500/35'
          }`}
          title={audioEnabled ? 'Microphone On' : 'Microphone Muted'}
          aria-label="Toggle Microphone"
        >
          {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="min-w-[40px] min-h-[40px] rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-white transition-colors active:scale-95"
          title="Camera Settings"
          aria-label="Camera Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
});

interface CameraControlsProps {
  dualLayoutMode: DualLayoutMode;
  onSelectDualLayoutMode: (mode: DualLayoutMode) => void;
  captureType: CaptureType;
  onSelectCaptureType: (type: CaptureType) => void;
  isRecording: boolean;
  isCountdownActive: boolean;
  onTriggerShutter: () => void;
  onOpenGallery: () => void;
  onFlipCamera: () => void;
  lastThumbnailUrl?: string;
  galleryItemCount: number;
  advancedControls: AdvancedControlsState;
  onUpdateAdvancedControls: (patch: Partial<AdvancedControlsState>) => void;
  maxZoom?: number;
}

export const CameraControls: React.FC<CameraControlsProps> = React.memo(({
  dualLayoutMode,
  onSelectDualLayoutMode,
  captureType,
  onSelectCaptureType,
  isRecording,
  isCountdownActive,
  onTriggerShutter,
  onOpenGallery,
  onFlipCamera,
  lastThumbnailUrl,
  galleryItemCount,
  advancedControls,
  onUpdateAdvancedControls,
  maxZoom = 5.0,
}) => {
  const [flipRotationDeg, setFlipRotationDeg] = useState(0);

  const handleFlipClick = () => {
    if (isRecording) return;
    setFlipRotationDeg((prev) => prev + 180);
    onFlipCamera();
  };

  return (
    <div className="relative z-30 w-full bg-black pt-2 pb-4 px-4 flex flex-col items-center gap-2.5 border-t border-white/8 shrink-0 select-none">
      {/* 1. Quick Zoom Pills & Pro Drawer */}
      <AdvancedControlsDrawer
        controls={advancedControls}
        onChange={onUpdateAdvancedControls}
        maxZoom={maxZoom}
      />

      {/* 2. One-Tap Dual-Camera Layout Switcher */}
      <div className="flex items-center p-1 rounded-full bg-neutral-950 border border-white/10">
        {(
          [
            { id: 'single' as const, label: 'Single', icon: Maximize2 },
            { id: 'split' as const, label: 'Split 50/50', icon: Columns2 },
            { id: 'pip' as const, label: 'PiP Mini', icon: PictureInPicture2 },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = dualLayoutMode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={isRecording}
              onClick={() => onSelectDualLayoutMode(item.id)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all duration-200 ease-flagship whitespace-nowrap shrink-0 disabled:opacity-50 ${
                active
                  ? 'bg-amber-400 text-black font-semibold shadow-sm'
                  : 'text-neutral-300 hover:text-white'
              }`}
              aria-pressed={active}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Sliding PHOTO | VIDEO Mode Switcher */}
      <div className="relative grid grid-cols-2 w-44 p-1 rounded-full bg-neutral-950 border border-white/10">
        {/* Smooth sliding active pill */}
        <div
          aria-hidden="true"
          className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-white/15 transition-transform duration-200 ease-flagship"
          style={{
            transform:
              captureType === 'video' ? 'translate3d(100%, 0, 0)' : 'translate3d(0, 0, 0)',
          }}
        />
        <button
          type="button"
          disabled={isRecording}
          onClick={() => onSelectCaptureType('photo')}
          className={`relative z-10 h-8 rounded-full text-xs font-semibold tracking-wider transition-colors whitespace-nowrap disabled:opacity-50 ${
            captureType === 'photo' ? 'text-amber-400' : 'text-neutral-400 hover:text-white'
          }`}
        >
          PHOTO
        </button>
        <button
          type="button"
          disabled={isRecording}
          onClick={() => onSelectCaptureType('video')}
          className={`relative z-10 h-8 rounded-full text-xs font-semibold tracking-wider transition-colors whitespace-nowrap disabled:opacity-50 ${
            captureType === 'video' ? 'text-amber-400' : 'text-neutral-400 hover:text-white'
          }`}
        >
          VIDEO
        </button>
      </div>

      {/* 4. Bottom Action Dock: Gallery | Morphing Tactile Shutter | Flip Camera */}
      <div className="w-full max-w-xs flex items-center justify-between pt-0.5">
        {/* Gallery Button */}
        <button
          type="button"
          onClick={onOpenGallery}
          className="relative w-12 h-12 rounded-2xl overflow-hidden border border-white/25 bg-neutral-900 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform duration-150 ease-flagship group"
          title="Open Dual Gallery"
          aria-label="Open Dual Gallery"
        >
          {lastThumbnailUrl ? (
            <img
              src={lastThumbnailUrl}
              alt="Latest Capture"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          ) : (
            <span className="text-[10px] text-neutral-400 font-medium">Gallery</span>
          )}
          {galleryItemCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-black text-[9px] font-bold font-mono tabular-nums flex items-center justify-center">
              {galleryItemCount > 99 ? '99+' : galleryItemCount}
            </span>
          )}
        </button>

        {/* Tactile Flagship Morphing Shutter Button */}
        <button
          type="button"
          onClick={() => {
            prewarmAudioSfx();
            onTriggerShutter();
          }}
          className={`relative w-20 h-20 rounded-full border-[3.5px] flex items-center justify-center transition-all duration-200 ease-flagship active:scale-95 ${
            isRecording
              ? 'border-white/95 scale-105'
              : captureType === 'video'
                ? 'border-white/95 hover:border-red-400'
                : 'border-white/95 hover:border-amber-300'
          }`}
          title={
            captureType === 'video'
              ? isRecording
                ? 'Stop Recording'
                : 'Start Recording'
              : 'Capture Dual Photo'
          }
          aria-label={
            isCountdownActive
              ? 'Cancel Timer'
              : captureType === 'video'
                ? isRecording
                  ? 'Stop Recording'
                  : 'Start Recording'
                : 'Capture Dual Photo'
          }
        >
          <span
            className={`transition-all duration-200 ease-flagship ${
              captureType === 'video'
                ? isRecording
                  ? 'w-7 h-7 rounded-[8px] bg-red-500 shadow-[0_0_16px_rgba(239,68,68,0.6)]'
                  : 'w-[60px] h-[60px] rounded-full bg-red-500'
                : 'w-[60px] h-[60px] rounded-full bg-white'
            }`}
          />
        </button>

        {/* Front / Rear Flip Camera Button with smooth 180° rotation */}
        <button
          type="button"
          disabled={isRecording}
          onClick={handleFlipClick}
          className="w-12 h-12 rounded-full bg-neutral-900 border border-white/15 flex items-center justify-center text-white hover:bg-neutral-800 active:scale-90 transition-all duration-150 disabled:opacity-40"
          title="Flip Front/Rear Camera"
          aria-label="Flip Camera"
        >
          <RotateCcw
            className="w-5 h-5 transition-transform duration-300 ease-flagship"
            style={{ transform: `rotate(${flipRotationDeg}deg)` }}
          />
        </button>
      </div>
    </div>
  );
});
