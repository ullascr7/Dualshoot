import React from 'react';
import { Smartphone, Download, CheckCircle2, X, ArrowUpRight, ShieldCheck, Zap, HardDrive } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface AndroidInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AndroidInstallModal: React.FC<AndroidInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isAndroid, isIOS, install } = usePWAInstall();

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (success) {
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* App Icon & Header */}
        <div className="flex flex-col items-center text-center mt-2">
          <div className="relative w-20 h-20 rounded-2xl bg-neutral-950 p-1 border-2 border-amber-500/40 shadow-xl shadow-amber-500/10 flex items-center justify-center">
            <img
              src="/pwa-192x192.png"
              alt="DualShot Android Icon"
              className="w-full h-full rounded-xl object-cover"
              onError={(e) => {
                // Fallback icon
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <Smartphone size={10} /> Android
            </div>
          </div>

          <h3 className="mt-4 text-xl font-bold text-white tracking-tight">
            DualShot Android App
          </h3>
          <p className="mt-1 text-xs text-neutral-400">
            Simultaneous 9:16 + 16:9 Camera & Pro Studio
          </p>
        </div>

        {/* Features highlights */}
        <div className="mt-6 space-y-2.5 text-left text-xs bg-neutral-950/70 p-3.5 rounded-2xl border border-neutral-800/80">
          <div className="flex items-center gap-2.5 text-neutral-300">
            <CheckCircle2 size={16} className="text-amber-400 shrink-0" />
            <span>Full-screen Android viewfinder without browser bars</span>
          </div>
          <div className="flex items-center gap-2.5 text-neutral-300">
            <Zap size={16} className="text-amber-400 shrink-0" />
            <span>Simultaneous 9:16 (TikTok) & 16:9 (YouTube) captures</span>
          </div>
          <div className="flex items-center gap-2.5 text-neutral-300">
            <HardDrive size={16} className="text-amber-400 shrink-0" />
            <span>Works 100% offline with on-device IndexedDB gallery</span>
          </div>
          <div className="flex items-center gap-2.5 text-neutral-300">
            <ShieldCheck size={16} className="text-amber-400 shrink-0" />
            <span>Native hardware camera zoom & exposure compensation</span>
          </div>
        </div>

        {/* Action Button or Instructions */}
        <div className="mt-6">
          {isInstalled ? (
            <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium text-sm">
              <CheckCircle2 size={18} />
              <span>App is installed on this device!</span>
            </div>
          ) : isInstallable ? (
            <button
              onClick={handleInstallClick}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black font-bold text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95 transition"
            >
              <Download size={18} />
              <span>Install to Android Phone</span>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="bg-neutral-800/80 p-3 rounded-xl text-xs text-neutral-300 border border-neutral-700">
                <p className="font-semibold text-white mb-1.5 flex items-center gap-1.5">
                  <Smartphone size={14} className="text-amber-400" />
                  Install from Android Chrome:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-neutral-300">
                  <li>Tap the <strong>⋮ (three dots menu)</strong> at top right.</li>
                  <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                  <li>Confirm <strong>"Install"</strong> to add DualShot to your Android app drawer.</li>
                </ol>
              </div>

              {isIOS && (
                <p className="text-[11px] text-neutral-400 text-center">
                  On iPhone: Tap Share <ArrowUpRight size={12} className="inline" /> → Add to Home Screen
                </p>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-3 w-full py-2.5 text-xs font-medium text-neutral-400 hover:text-white transition text-center"
        >
          Continue in Camera
        </button>
      </div>
    </div>
  );
};
