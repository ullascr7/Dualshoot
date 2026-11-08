import React from 'react';
import {
  Zap,
  ZapOff,
  Settings as SettingsIcon,
  RotateCcw,
  Mic,
  MicOff,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { LensMode, CaptureType, AdvancedControlsState } from '../types/camera';
import { AdvancedControlsDrawer } from './AdvancedControlsDrawer';

interface CameraControlsProps {
  lensMode: LensMode;
  onSelectLensMode: (mode: LensMode) => void;
  captureType: CaptureType;
  onSelectCaptureType: (type: CaptureType) => void;
  isRecording: boolean;
  onTriggerShutter: () => void;
  onToggleFlash: () => void;
  flashMode: 'off' | 'on' | 'auto';
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onOpenSettings: () => void;
  onOpenGallery: () => void;
  onFlipCamera: () => void;
  onOpenInstallModal: () => void;
  isAdFree?: boolean;
  onOpenRemoveAdsModal: () => void;
  lastThumbnailUrl?: string;
  galleryItemCount: number;
  advancedControls: AdvancedControlsState;
  onUpdateAdvancedControls: (patch: Partial<AdvancedControlsState>) => void;
}

export const CameraControls: React.FC<CameraControlsProps> = ({
  lensMode,
  onSelectLensMode,
  captureType,
  onSelectCaptureType,
  isRecording,
  onTriggerShutter,
  onToggleFlash,
  flashMode,
  audioEnabled,
  onToggleAudio,
  onOpenSettings,
  onOpenGallery,
  onFlipCamera,
  onOpenInstallModal,
  isAdFree = false,
  onOpenRemoveAdsModal,
  lastThumbnailUrl,
  galleryItemCount,
  advancedControls,
  onUpdateAdvancedControls,
}) => {
  return (
    <div className="relative z-30 flex flex-col justify-between w-full pointer-events-auto">
      {/* Top Header Bar (Over Viewfinder) */}
      <div className="w-full px-5 py-3 flex items-center justify-between text-white drop-shadow-md">
        {/* Flash Toggle */}
        <button
          onClick={onToggleFlash}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors"
          title={`Flash: ${flashMode}`}
          aria-label="Toggle Flash"
        >
          {flashMode === 'on' ? (
            <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
          ) : flashMode === 'auto' ? (
            <div className="relative flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-300" />
              <span className="absolute -bottom-1 -right-1 text-[8px] font-bold text-amber-300">A</span>
            </div>
          ) : (
            <ZapOff className="w-5 h-5 text-white/80" />
          )}
        </button>

        {/* Center Indicators */}
        <div className="flex items-center gap-2">
          {/* Dual Stream Aspect Indicator */}
          <div className="px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-md border border-white/10 text-[10px] font-medium tracking-wider text-amber-300 flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>9:16 + 16:9 DUAL</span>
          </div>

          {/* Audio Mic Button */}
          <button
            onClick={onToggleAudio}
            className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-colors ${
              audioEnabled ? 'bg-black/40 text-white' : 'bg-red-500/30 text-red-400 border border-red-500/40'
            }`}
            title={audioEnabled ? 'Microphone On' : 'Microphone Muted'}
            aria-label="Toggle Microphone"
          >
            {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Remove Ads Pro Button */}
          {!isAdFree && (
            <button
              onClick={onOpenRemoveAdsModal}
              className="h-10 px-2.5 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-400/50 flex items-center gap-1 text-xs font-black text-amber-300 hover:bg-amber-500/30 active:scale-95 transition-all shadow-sm"
              title="Remove Ads (Google Play)"
              aria-label="Remove Ads"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] uppercase tracking-wider font-extrabold">No Ads</span>
            </button>
          )}

          {/* Android App Button */}
          <button
            onClick={onOpenInstallModal}
            className="h-10 px-3 rounded-full bg-black/40 backdrop-blur-md border border-amber-500/30 flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:bg-black/60 active:scale-95 transition-all shadow-sm"
            title="Install Android App"
            aria-label="Install Android App"
          >
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-bold">Android</span>
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors"
            title="Camera Settings"
            aria-label="Camera Settings"
          >
            <SettingsIcon className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Advanced Camera Controls (Zoom presets, Pro drawer with EV, Focus, WB) */}
      <div className="w-full px-4">
        <AdvancedControlsDrawer
          controls={advancedControls}
          onChange={onUpdateAdvancedControls}
          isRecording={isRecording}
        />
      </div>

      {/* Floating Mode Selector Pill (Matching the yellow pill selector in user's image) */}
      <div className="w-full flex justify-center py-1">
        <div className="flex items-center p-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 shadow-xl">
          <button
            onClick={() => onSelectLensMode('dual')}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 ${
              lensMode === 'dual'
                ? 'bg-amber-400 text-black shadow-md shadow-amber-400/30 font-bold scale-105'
                : 'text-neutral-300 hover:text-white'
            }`}
          >
            Dual Lens
          </button>
          <button
            onClick={() => onSelectLensMode('single')}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 ${
              lensMode === 'single'
                ? 'bg-amber-400 text-black shadow-md shadow-amber-400/30 font-bold scale-105'
                : 'text-neutral-300 hover:text-white'
            }`}
          >
            Single Lens
          </button>
        </div>
      </div>

      {/* Bottom Camera Action Area */}
      <div className="w-full pt-1 pb-6 px-6 flex flex-col items-center bg-gradient-to-t from-black via-black/85 to-transparent">
        {/* Photo / Video Mode Selector */}
        <div className="flex items-center gap-6 mb-3 text-xs font-semibold tracking-wider uppercase">
          <button
            onClick={() => !isRecording && onSelectCaptureType('photo')}
            disabled={isRecording}
            className={`transition-colors relative py-1 ${
              captureType === 'photo'
                ? 'text-amber-400 font-bold'
                : 'text-neutral-400 hover:text-neutral-200 disabled:opacity-50'
            }`}
          >
            Photo
            {captureType === 'photo' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            onClick={() => !isRecording && onSelectCaptureType('video')}
            disabled={isRecording}
            className={`transition-colors relative py-1 ${
              captureType === 'video'
                ? 'text-amber-400 font-bold'
                : 'text-neutral-400 hover:text-neutral-200 disabled:opacity-50'
            }`}
          >
            Video
            {captureType === 'video' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>
        </div>

        {/* Shutter / Action Controls */}
        <div className="w-full flex items-center justify-between max-w-xs">
          {/* Gallery Button with Thumbnail */}
          <button
            onClick={onOpenGallery}
            className="relative w-13 h-13 rounded-2xl overflow-hidden border-2 border-white/60 bg-neutral-900 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all group"
            title="Open Dual Gallery"
            aria-label="Open Dual Gallery"
          >
            {lastThumbnailUrl ? (
              <img
                src={lastThumbnailUrl}
                alt="Latest Capture"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-800 text-neutral-400 text-[10px]">
                <span>Empty</span>
              </div>
            )}
            {/* Gallery badge counter */}
            {galleryItemCount > 0 && (
              <div className="absolute top-0 right-0 w-4 h-4 rounded-full bg-amber-400 text-black text-[9px] font-black flex items-center justify-center shadow-md">
                {galleryItemCount > 9 ? '9+' : galleryItemCount}
              </div>
            )}
          </button>

          {/* Large Shutter Button */}
          <div className="relative flex items-center justify-center">
            {captureType === 'video' ? (
              /* Video Record Button */
              <button
                onClick={onTriggerShutter}
                className={`relative w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all ${
                  isRecording
                    ? 'border-red-500 scale-105'
                    : 'border-white hover:border-red-400 hover:scale-105'
                }`}
                title={isRecording ? 'Stop Recording Dual Video' : 'Start Recording Dual Video'}
                aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
              >
                <div
                  className={`transition-all duration-300 ${
                    isRecording
                      ? 'w-7 h-7 bg-red-600 rounded-md animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.7)]'
                      : 'w-15 h-15 bg-red-500 rounded-full'
                  }`}
                />
              </button>
            ) : (
              /* Photo Shutter Button */
              <button
                onClick={onTriggerShutter}
                className="relative w-20 h-20 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-xl"
                title="Capture Dual Photo (Vertical + Horizontal)"
                aria-label="Capture Dual Photo"
              >
                <div className="w-15 h-15 bg-white rounded-full transition-transform active:scale-95 shadow-inner" />
              </button>
            )}
          </div>

          {/* Camera Flip Button */}
          <button
            onClick={onFlipCamera}
            className="w-13 h-13 rounded-full bg-neutral-900/80 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-neutral-800 hover:scale-105 active:scale-90 active:rotate-180 transition-all"
            title="Flip Front/Rear Camera"
            aria-label="Flip Camera"
          >
            <RotateCcw className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};
