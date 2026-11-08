import React, { useState, useEffect } from 'react';
import { X, Volume2, VolumeX, Sparkles, Shield, ExternalLink } from 'lucide-react';
import { PRO_PRODUCT } from '../utils/monetization';

interface InterstitialAdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpgradeModal: () => void;
  skipSeconds?: number;
}

export const InterstitialAdModal: React.FC<InterstitialAdModalProps> = ({
  isOpen,
  onClose,
  onOpenUpgradeModal,
  skipSeconds = 5,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(skipSeconds);
  const [canSkip, setCanSkip] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setSecondsRemaining(skipSeconds);
      setCanSkip(false);
      return;
    }

    setSecondsRemaining(skipSeconds);
    setCanSkip(false);

    const interval = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, skipSeconds]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 text-white select-none animate-fade-in">
      <div className="relative w-full max-w-md h-full sm:h-[88vh] sm:max-h-[760px] sm:rounded-3xl overflow-hidden bg-neutral-950 flex flex-col justify-between border border-neutral-800 shadow-2xl">
        {/* Top Header Bar */}
        <div className="w-full px-4 py-3 flex items-center justify-between bg-black/80 backdrop-blur-md border-b border-neutral-800/80 z-20">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-amber-400 text-black text-[10px] font-black uppercase tracking-wider">
              AD
            </span>
            <span className="text-xs text-neutral-400 font-medium">Google AdMob</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Audio Toggle */}
            <button
              onClick={() => setIsMuted((prev) => !prev)}
              className="p-1.5 rounded-full bg-neutral-900 text-neutral-300 hover:text-white transition"
              aria-label="Toggle Sound"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            {/* Skip / Close Button */}
            {canSkip ? (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-black text-xs font-bold hover:bg-neutral-200 active:scale-95 transition shadow-lg"
              >
                <span>Skip Ad</span>
                <X size={14} />
              </button>
            ) : (
              <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs font-mono font-medium">
                <span>Skip in {secondsRemaining}s</span>
              </div>
            )}
          </div>
        </div>

        {/* Ad Video / Creative Area */}
        <div className="relative flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 overflow-hidden">
          {/* Animated Background Glow */}
          <div className="absolute w-72 h-72 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />

          {/* Sponsored Brand Card */}
          <div className="relative z-10 w-full max-w-xs flex flex-col items-center text-center space-y-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-xl shadow-blue-500/20 flex items-center justify-center text-3xl font-black text-white p-2">
              <span className="tracking-tighter">PLAY</span>
            </div>

            <div>
              <div className="flex items-center justify-center gap-1.5 text-xs text-blue-400 font-semibold uppercase tracking-wider mb-1">
                <span>Sponsored App</span>
                <ExternalLink size={12} />
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                CloudSync Pro for Android
              </h3>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Automatic cloud backup for your 4K DualShot videos and RAW photos. 100GB free tier.
              </p>
            </div>

            {/* Rating & Downloads */}
            <div className="flex items-center justify-center gap-4 text-[11px] text-neutral-400 bg-neutral-900/80 px-4 py-2 rounded-xl border border-neutral-800">
              <div className="flex items-center gap-1 text-amber-400 font-bold">
                <span>★ 4.8</span>
              </div>
              <span>•</span>
              <span>10M+ Downloads</span>
            </div>

            {/* Call to Action */}
            <button
              onClick={() => {
                alert('In production, this opens Google Play Store for the sponsored advertiser.');
              }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-500/25 active:scale-95 transition"
            >
              Install Free on Google Play
            </button>
          </div>
        </div>

        {/* Bottom Banner: "Avoid Ads / Go Pro" */}
        <div className="w-full p-4 bg-gradient-to-t from-black to-neutral-950 border-t border-neutral-800/80 flex items-center justify-between z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1">
                <span>Tired of ads?</span>
                <span className="text-amber-400">{PRO_PRODUCT.formattedPrice}</span>
              </div>
              <div className="text-[10px] text-neutral-400">
                Unlock instant ad-free camera launch forever
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              onClose();
              onOpenUpgradeModal();
            }}
            className="py-1.5 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs shadow-md shadow-amber-400/20 active:scale-95 transition flex items-center gap-1"
          >
            <Shield size={12} />
            <span>Remove Ads</span>
          </button>
        </div>
      </div>
    </div>
  );
};
