import React, { useState } from 'react';
import { X, Check, ShieldCheck, Zap, Sparkles, CheckCircle2, RotateCw, Calendar } from 'lucide-react';
import {
  PRO_PRODUCT,
  ANNUAL_PRODUCT,
  purchaseAnnualPass,
  purchaseAdFreePro,
  restorePurchases,
  formatSubscriptionExpiry,
} from '../utils/monetization';
import { UserSubscriptionState } from '../types/monetization';

interface RemoveAdsModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscriptionState: UserSubscriptionState;
  onSubscriptionUpdated: (newState: UserSubscriptionState) => void;
}

export const RemoveAdsModal: React.FC<RemoveAdsModalProps> = ({
  isOpen,
  onClose,
  subscriptionState,
  onSubscriptionUpdated,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePurchaseAnnual = async () => {
    setIsLoading(true);
    setSuccessMessage(null);
    try {
      const updated = await purchaseAnnualPass();
      onSubscriptionUpdated(updated);
      setSuccessMessage('1-Year Pass Activated! Zero ads will be shown for 365 days.');
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      console.error('Annual purchase error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchaseLifetime = async () => {
    setIsLoading(true);
    setSuccessMessage(null);
    try {
      const updated = await purchaseAdFreePro();
      onSubscriptionUpdated(updated);
      setSuccessMessage('Lifetime Pro Activated! Zero ads permanently across all devices.');
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      console.error('Purchase failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    setIsLoading(true);
    try {
      const restored = await restorePurchases();
      onSubscriptionUpdated(restored);
      if (restored.isAdFree) {
        setSuccessMessage('Your Ad-Free Pro license was successfully restored!');
        setTimeout(() => onClose(), 2000);
      } else {
        alert('No previous Google Play purchase was found for this account.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in text-white">
      <div className="relative w-full max-w-sm rounded-3xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Header Badge */}
        <div className="flex flex-col items-center text-center mt-1">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 p-0.5 shadow-xl shadow-amber-500/20 flex items-center justify-center">
            <div className="w-full h-full rounded-2xl bg-neutral-950 flex items-center justify-center text-amber-400">
              <Sparkles size={32} />
            </div>
          </div>

          <h3 className="mt-4 text-xl font-extrabold text-white tracking-tight">
            DualShot Pro
          </h3>
          <p className="mt-1 text-xs text-neutral-400">
            One-time payment • Lifetime Ad-Free License
          </p>
        </div>

        {/* Success message banner */}
        {successMessage ? (
          <div className="mt-6 p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center flex flex-col items-center gap-2">
            <CheckCircle2 size={24} className="text-emerald-400" />
            <p className="font-semibold">{successMessage}</p>
          </div>
        ) : (
          <>
            {/* Feature List */}
            <div className="mt-5 space-y-2.5 text-xs bg-neutral-950/70 p-4 rounded-2xl border border-neutral-800/80">
              <div className="flex items-center gap-2.5 text-neutral-300">
                <Check size={16} className="text-amber-400 shrink-0" />
                <span>Zero Ads on app launch & video recordings</span>
              </div>
              <div className="flex items-center gap-2.5 text-neutral-300">
                <Zap size={16} className="text-amber-400 shrink-0" />
                <span>Instant camera startup without ad countdown</span>
              </div>
              <div className="flex items-center gap-2.5 text-neutral-300">
                <ShieldCheck size={16} className="text-amber-400 shrink-0" />
                <span>Unlimited 4K simultaneous recordings</span>
              </div>
              <div className="flex items-center gap-2.5 text-neutral-300">
                <Check size={16} className="text-amber-400 shrink-0" />
                <span>Valid across all your Android devices</span>
              </div>
            </div>

            {/* Price & Google Play Purchase Buttons */}
            <div className="mt-5 space-y-2.5">
              {subscriptionState.isAdFree ? (
                <div className="w-full p-4 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-center text-xs space-y-1">
                  <div className="font-bold text-sm flex items-center justify-center gap-1.5 text-emerald-400">
                    <CheckCircle2 size={18} />
                    <span>
                      {subscriptionState.tier === 'annual_pass'
                        ? '1-Year Annual Pass Active'
                        : 'Ad-Free Lifetime Active'}
                    </span>
                  </div>
                  {subscriptionState.tier === 'annual_pass' && (
                    <div className="text-[11px] text-emerald-200/80 flex items-center justify-center gap-1">
                      <Calendar size={12} />
                      <span>Valid until: {formatSubscriptionExpiry(subscriptionState.expiresAt)}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-neutral-400">Zero ads on launch and captures.</p>
                </div>
              ) : (
                <>
                  {/* Option 1: 1-Year Annual Pass (Pay once a year) */}
                  <div className="relative">
                    <div className="absolute -top-2.5 right-3 bg-amber-400 text-black text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-md">
                      POPULAR • PAY ONCE A YEAR
                    </div>
                    <button
                      onClick={handlePurchaseAnnual}
                      disabled={isLoading}
                      className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-black font-extrabold text-xs shadow-lg shadow-amber-500/25 flex items-center justify-between active:scale-95 transition disabled:opacity-50"
                    >
                      <div className="text-left">
                        <div className="font-bold text-sm">1-Year Ad-Free Pass</div>
                        <div className="text-[10px] opacity-80">Pay once, zero ads for 365 days</div>
                      </div>
                      <span className="bg-black/15 px-2.5 py-1 rounded-lg text-xs font-black">
                        {ANNUAL_PRODUCT.formattedPrice}
                      </span>
                    </button>
                  </div>

                  {/* Option 2: Lifetime Pro */}
                  <button
                    onClick={handlePurchaseLifetime}
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-2xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-medium text-xs flex items-center justify-between active:scale-95 transition disabled:opacity-50"
                  >
                    <div className="text-left">
                      <div className="font-semibold text-xs text-white">Lifetime License</div>
                      <div className="text-[10px] text-neutral-400">Pay once, keep forever</div>
                    </div>
                    <span className="bg-neutral-700 px-2 py-0.5 rounded text-[11px] font-mono text-neutral-300">
                      {PRO_PRODUCT.formattedPrice}
                    </span>
                  </button>
                </>
              )}

              {/* Restore Button */}
              {!subscriptionState.isAdFree && (
                <button
                  onClick={handleRestore}
                  disabled={isLoading}
                  className="w-full py-2 text-xs text-neutral-400 hover:text-white transition flex items-center justify-center gap-1.5"
                >
                  <RotateCw size={12} className={isLoading ? 'animate-spin' : ''} />
                  <span>Already purchased? Restore pass</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* Footer Guarantee */}
        <p className="mt-4 text-[10px] text-neutral-500 text-center leading-relaxed">
          Processed securely via Google Play In-App Billing. Valid across all Android devices linked to your Google Account.
        </p>
      </div>
    </div>
  );
};
