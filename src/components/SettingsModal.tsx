import React from 'react';
import { Smartphone, Download, CheckCircle2, Sparkles, Shield } from 'lucide-react';
import { CameraSettings, VideoQuality, FrameRate, FileFormat } from '../types/camera';
import { UserSubscriptionState } from '../types/monetization';
import { estimateBitrateAndStorage } from '../utils/cropMath';
import { formatSubscriptionExpiry } from '../utils/monetization';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CameraSettings;
  onUpdateSettings: (newSettings: Partial<CameraSettings>) => void;
  onOpenInstallModal: () => void;
  subscriptionState: UserSubscriptionState;
  onOpenRemoveAdsModal: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onOpenInstallModal,
  subscriptionState,
  onOpenRemoveAdsModal,
}) => {
  const { isInstalled, isInstallable } = usePWAInstall();
  if (!isOpen) return null;

  const storageEstimates = estimateBitrateAndStorage(
    settings.videoQuality,
    settings.frameRate,
    5 * 1024 * 1024 * 1024
  );

  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xl flex flex-col text-white animate-in fade-in duration-200">
      {/* Top Header matching mockup */}
      <div className="w-full px-6 py-4 flex items-center justify-between border-b border-neutral-800">
        <div className="w-12" /> {/* Spacer for balance */}
        <h2 className="text-base font-semibold text-white tracking-wide">Settings</h2>
        <button
          onClick={onClose}
          className="text-amber-400 font-semibold text-sm hover:text-amber-300 transition-colors"
        >
          Done
        </button>
      </div>

      {/* Settings Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 text-sm">
        {/* Video Quality Section */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Video Quality
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-900 rounded-xl border border-neutral-800">
            {(['4K', '1080p'] as VideoQuality[]).map((q) => (
              <button
                key={q}
                onClick={() => onUpdateSettings({ videoQuality: q })}
                className={`py-2 rounded-lg font-medium text-xs transition-all ${
                  settings.videoQuality === q
                    ? 'bg-neutral-800 text-white shadow-md border border-neutral-700'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Frame Rate Section */}
        <div>
          <div className="grid grid-cols-3 gap-2 p-1 bg-neutral-900 rounded-xl border border-neutral-800">
            {([24, 30, 60] as FrameRate[]).map((fps) => (
              <button
                key={fps}
                onClick={() => onUpdateSettings({ frameRate: fps })}
                className={`py-2 rounded-lg font-medium text-xs transition-all ${
                  settings.frameRate === fps
                    ? 'bg-neutral-800 text-white shadow-md border border-neutral-700'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {fps} fps
              </button>
            ))}
          </div>
          {/* Storage & Bitrate Readout matching Panel 4 */}
          <p className="text-[11px] text-neutral-400 mt-2 font-mono text-center">
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

        {/* Device Information Section matching Panel 4 */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Device
          </label>
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 divide-y divide-neutral-800/80">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-neutral-300">MultiCam Support</span>
              <span className="text-xs text-emerald-400 font-medium">Supported</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-neutral-300">Active Resolution Note</span>
              <span className="text-xs text-neutral-400 font-medium">Full quality</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-neutral-300">Free Storage</span>
              <span className="text-xs text-neutral-400 font-mono">5.0 GB</span>
            </div>
          </div>
        </div>

        {/* Ad-Free Pro Monetization Section */}
        <div className="p-4 bg-gradient-to-br from-neutral-900 via-neutral-900 to-amber-950/30 rounded-2xl border border-amber-500/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-400 border border-amber-400/30 flex items-center justify-center">
                <Sparkles size={20} />
              </div>
              <div>
                <div className="font-semibold text-white text-xs flex items-center gap-1.5">
                  <span>Ad-Free License</span>
                  {subscriptionState.isAdFree ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
                      <CheckCircle2 size={10} />{' '}
                      {subscriptionState.tier === 'annual_pass' ? '1-Year Pass' : 'Lifetime Pro'}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-neutral-800 text-neutral-400 border border-neutral-700">
                      Free Tier (With Ads)
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  {subscriptionState.isAdFree
                    ? subscriptionState.tier === 'annual_pass'
                      ? `Valid until ${formatSubscriptionExpiry(subscriptionState.expiresAt)} (0 ads)`
                      : 'Lifetime access - zero ads forever'
                    : 'Pay once a year ($4.99/yr) to remove all ads'}
                </div>
              </div>
            </div>
            <button
              onClick={onOpenRemoveAdsModal}
              className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-black font-extrabold text-xs shadow-md shadow-amber-400/20 active:scale-95 transition flex items-center gap-1"
            >
              <Shield size={12} />
              <span>{subscriptionState.isAdFree ? 'Manage' : 'Go Ad-Free'}</span>
            </button>
          </div>
          <p className="text-[10px] text-neutral-400 leading-relaxed">
            Google Play Subscription: Users pay once a year for an uninterrupted 365-day ad-free experience across all Android devices.
          </p>
        </div>

        {/* Android App Installation Card */}
        <div className="p-4 bg-gradient-to-br from-neutral-900 to-neutral-950 rounded-2xl border border-amber-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-400 border border-amber-400/30 flex items-center justify-center">
                <Smartphone size={20} />
              </div>
              <div>
                <div className="font-semibold text-white text-xs flex items-center gap-1.5">
                  <span>Android App (PWA)</span>
                  {isInstalled ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
                      <CheckCircle2 size={10} /> Installed
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Standalone Ready
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Install to Android home screen for full-screen camera
                </div>
              </div>
            </div>
            <button
              onClick={onOpenInstallModal}
              className="py-1.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-400/20 active:scale-95 transition"
            >
              <Download size={14} />
              <span>{isInstalled ? 'View App' : 'Install'}</span>
            </button>
          </div>
          <p className="text-[10px] text-neutral-400 leading-relaxed">
            Provides a native app experience on Android devices: zero browser URL bars, lock-in orientation, hardware-accelerated dual stream recording, and offline gallery.
          </p>
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
          <span>DualShot Recorder v1.0</span>
        </div>
      </div>
    </div>
  );
};
