import React from 'react';
import { Building2, Stamp } from 'lucide-react';
import {
  CameraSettings,
  VideoQuality,
  FrameRate,
  FileFormat,
  HardwareQualityProfile,
} from '../types/camera';
import { formatBytes, estimateBitrateAndStorage } from '../utils/cropMath';
import { OEM_CONFIG } from '../config/oemConfig';
import { StorageCleanupStatus } from '../utils/indexedDb';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CameraSettings;
  onUpdateSettings: (newSettings: Partial<CameraSettings>) => void;
  hardwareProfile?: HardwareQualityProfile;
  storageStatus?: StorageCleanupStatus | null;
  onOpenStorageCleanup?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  hardwareProfile,
  storageStatus,
  onOpenStorageCleanup,
}) => {
  if (!isOpen) return null;

  const autoMax = settings.autoMaxQuality ?? true;
  const activeQuality = autoMax && hardwareProfile ? hardwareProfile.qualityLabel : settings.videoQuality;
  const activeFps = (autoMax && hardwareProfile ? hardwareProfile.activeFps : settings.frameRate) as FrameRate;

  const storageEstimates = estimateBitrateAndStorage(
    activeQuality,
    activeFps,
    5 * 1024 * 1024 * 1024
  );

  const isWatermarkEnabled = settings.showWatermark ?? OEM_CONFIG.showBrandWatermark;

  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xl flex flex-col text-white animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="w-full px-6 py-4 flex items-center justify-between border-b border-neutral-800">
        <div className="w-12" /> {/* Spacer for balance */}
        <h2 className="text-base font-semibold text-white tracking-wide">Settings</h2>
        <button
          onClick={onClose}
          className="font-semibold text-sm hover:opacity-80 transition-opacity"
          style={{ color: OEM_CONFIG.primaryAccentColor }}
        >
          Done
        </button>
      </div>

      {/* Settings Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 text-sm">
        {/* Auto Max Hardware Quality Section */}
        <div className="p-4 bg-neutral-900 rounded-2xl border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white text-sm">
                Auto Device-Matched Quality
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                Automatically selects max sensor resolution &amp; 60fps when supported
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ autoMaxQuality: !autoMax })}
              aria-label="Toggle Auto Max Hardware Quality"
              className={`w-12 h-6.5 flex items-center rounded-full p-1 transition-colors ${
                autoMax ? 'bg-amber-400' : 'bg-neutral-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-black shadow-md transform transition-transform ${
                  autoMax ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {hardwareProfile && (
            <p className="text-[11px] text-neutral-400 font-mono tabular-nums">
              Active: {hardwareProfile.activeWidth}×{hardwareProfile.activeHeight} · {hardwareProfile.activeFps} fps · {Math.round(hardwareProfile.bitrateBps / 1_000_000)} Mbps ({hardwareProfile.codecLabel})
            </p>
          )}
        </div>

        {/* Manual Quality & Frame Rate Override */}
        <div className={autoMax ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}>
          <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Video Quality {autoMax ? '(Auto Controlled)' : ''}
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-900 rounded-xl border border-neutral-800 mb-3">
            {(['4K', '1080p'] as VideoQuality[]).map((q) => (
              <button
                key={q}
                onClick={() => onUpdateSettings({ videoQuality: q })}
                className={`py-2 rounded-lg font-medium text-xs transition-all ${
                  activeQuality === q
                    ? 'bg-neutral-800 text-white shadow-md border border-neutral-700'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 p-1 bg-neutral-900 rounded-xl border border-neutral-800">
            {([24, 30, 60] as FrameRate[]).map((fps) => (
              <button
                key={fps}
                onClick={() => onUpdateSettings({ frameRate: fps })}
                className={`py-2 rounded-lg font-medium text-xs transition-all ${
                  activeFps === fps
                    ? 'bg-neutral-800 text-white shadow-md border border-neutral-700'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {fps} fps
              </button>
            ))}
          </div>
          <p className="text-[11px] text-neutral-400 mt-2 font-mono tabular-nums text-center">
            ~{storageEstimates.mbPerMinTotal} MB/min (both files) &bull; ~{storageEstimates.minutesAvailable}m available
          </p>
        </div>

        {/* Digital Video Stabilization (EIS) Section */}
        <div className="p-4 bg-neutral-900 rounded-2xl border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white text-sm flex items-center gap-1.5">
                <span>Digital Video Stabilization</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  EIS
                </span>
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                Electronic Image Stabilization on both 9:16 and 16:9 streams
              </div>
            </div>
            <button
              onClick={() =>
                onUpdateSettings({
                  digitalStabilization: !settings.digitalStabilization,
                })
              }
              aria-label="Toggle Digital Stabilization"
              className={`w-12 h-6.5 flex items-center rounded-full p-1 transition-colors ${
                settings.digitalStabilization ? 'bg-amber-400' : 'bg-neutral-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-black shadow-md transform transition-transform ${
                  settings.digitalStabilization ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <p className="text-[10px] text-neutral-500 leading-relaxed">
            Dampens handshake and micro-jitters in real time across both vertical (TikTok/Reels) and horizontal (YouTube) video recordings.
          </p>
        </div>

        {/* Camera Assignment Section */}
        <div className="p-4 bg-neutral-900 rounded-2xl border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white text-sm">
                Camera A &rarr; Portrait (9:16)
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                Camera A saves vertical, Camera B saves horizontal
              </div>
            </div>
            <button
              onClick={() =>
                onUpdateSettings({
                  cameraAssignmentA:
                    settings.cameraAssignmentA === 'portrait' ? 'landscape' : 'portrait',
                })
              }
              aria-label="Toggle Camera Assignment"
              className={`w-12 h-6.5 flex items-center rounded-full p-1 transition-colors ${
                settings.cameraAssignmentA === 'portrait' ? 'bg-amber-400' : 'bg-neutral-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-black shadow-md transform transition-transform ${
                  settings.cameraAssignmentA === 'portrait' ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <p className="text-[10px] text-neutral-500 leading-relaxed">
            Determines which lens output is saved as the portrait (9:16) file. Cannot be changed during recording.
          </p>
        </div>

        {/* File Format Section */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            File Format
          </label>
          <div className="grid grid-cols-3 gap-2 p-1 bg-neutral-900 rounded-xl border border-neutral-800">
            {(['MOV', 'MP4', 'WEBM'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => onUpdateSettings({ fileFormat: fmt.toLowerCase() as FileFormat })}
                className={`py-2 rounded-lg font-medium text-xs transition-all uppercase ${
                  settings.fileFormat === fmt.toLowerCase()
                    ? 'bg-neutral-800 text-white shadow-md border border-neutral-700'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-neutral-500 mt-2 leading-relaxed">
            MOV is recommended for editing in Final Cut Pro or DaVinci Resolve. MP4 is better for direct sharing.
          </p>
        </div>

        {/* OEM Branding & Watermark Section */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            OEM Branding &amp; Watermark
          </label>
          <div className="p-4 bg-neutral-900 rounded-2xl border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/10"
                  style={{ backgroundColor: `${OEM_CONFIG.primaryAccentColor}22` }}
                >
                  <Building2 className="w-4 h-4" style={{ color: OEM_CONFIG.primaryAccentColor }} />
                </div>
                <div>
                  <div className="font-semibold text-white text-xs">{OEM_CONFIG.appName}</div>
                  <div className="text-[11px] text-neutral-400">
                    {OEM_CONFIG.companyName} &bull; <span className="font-mono">{OEM_CONFIG.packageId}</span>
                  </div>
                </div>
              </div>
              <span
                className="w-3 h-3 rounded-full border border-white/20"
                style={{ backgroundColor: OEM_CONFIG.primaryAccentColor }}
                title={`Accent: ${OEM_CONFIG.primaryAccentColor}`}
              />
            </div>

            <div className="pt-3 border-t border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Stamp className="w-4 h-4 text-neutral-400" />
                <div>
                  <div className="font-medium text-white text-xs">Brand Watermark</div>
                  <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                    &ldquo;{OEM_CONFIG.watermarkText}&rdquo;
                  </div>
                </div>
              </div>
              <button
                onClick={() => onUpdateSettings({ showWatermark: !isWatermarkEnabled })}
                aria-label="Toggle Brand Watermark"
                className="w-12 h-6.5 flex items-center rounded-full p-1 transition-colors"
                style={{
                  backgroundColor: isWatermarkEnabled ? OEM_CONFIG.primaryAccentColor : '#404040',
                }}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                    isWatermarkEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Device Information Section */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Device Hardware Capabilities
          </label>
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 divide-y divide-neutral-800/80">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-neutral-300">Concurrent Dual Cam</span>
              <span className="text-xs text-emerald-400 font-medium">
                {hardwareProfile?.concurrentDualSupported
                  ? 'Hardware Concurrent'
                  : 'Sequential Sync Ready'}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-neutral-300">Max Sensor Ceiling</span>
              <span className="text-xs text-neutral-300 font-mono tabular-nums">
                {hardwareProfile
                  ? `${hardwareProfile.detectedMaxWidth}×${hardwareProfile.detectedMaxHeight}`
                  : '1920×1080'}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-neutral-300">Adaptive Bitrate</span>
              <span className="text-xs text-neutral-400 font-mono tabular-nums">
                {hardwareProfile
                  ? `${Math.round(hardwareProfile.bitrateBps / 1_000_000)} Mbps · ${hardwareProfile.codecLabel}`
                  : '20 Mbps · H.264/MP4'}
              </span>
            </div>
            {storageStatus && (
              <div className="flex items-center justify-between px-4 py-3 gap-2">
                <div>
                  <div className="text-xs text-neutral-300">Local IndexedDB Storage</div>
                  <div className="text-[10px] text-neutral-500 font-mono tabular-nums mt-0.5">
                    {formatBytes(storageStatus.usedBytes)} / {formatBytes(storageStatus.thresholdBytes)} threshold
                  </div>
                </div>
                {storageStatus.exceedsThreshold && storageStatus.cleanableSessionCount > 0 && onOpenStorageCleanup ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenStorageCleanup();
                    }}
                    className="px-3 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 text-black text-[11px] font-bold whitespace-nowrap"
                  >
                    Clean Older ({storageStatus.cleanableSessionCount})
                  </button>
                ) : (
                  <span className="text-xs text-emerald-400 font-medium">Healthy</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Demo Mode / Procedural Simulation Toggle */}
        <div className="p-4 bg-neutral-900 rounded-2xl border border-neutral-800 flex items-center justify-between">
          <div>
            <div className="font-medium text-white text-xs">
              Demo Scene Mode
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">
              Simulates outdoor sunny tree canopy from mockup
            </div>
          </div>
          <button
            onClick={() => onUpdateSettings({ demoSimulation: !settings.demoSimulation })}
            aria-label="Toggle Demo Scene Mode"
            className={`w-12 h-6.5 flex items-center rounded-full p-1 transition-colors ${
              settings.demoSimulation ? 'bg-amber-400' : 'bg-neutral-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-black shadow-md transform transition-transform ${
                settings.demoSimulation ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* About */}
        <div className="flex items-center justify-between pt-2 text-xs text-neutral-500">
          <span>About</span>
          <span>{OEM_CONFIG.appName} ({OEM_CONFIG.companyName})</span>
        </div>
      </div>
    </div>
  );
};
