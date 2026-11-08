export type AdStatus = 'idle' | 'loading' | 'showing' | 'completed' | 'skipped' | 'failed';

export interface AdUnitConfig {
  adMobInterstitialId: string;
  adMobBannerId?: string;
  minimumWatchSeconds: number;
  skipAfterSeconds: number;
  showOnAppLaunch: boolean;
  showAfterCapturesCount: number;
}

export interface UserSubscriptionState {
  isAdFree: boolean;
  tier: 'free' | 'annual_pass' | 'pro_lifetime';
  purchaseDate?: number;
  expiresAt?: number; // Expiration timestamp in ms (1 year from purchase)
  billingCycle?: 'annual' | 'lifetime';
  orderId?: string;
}

export interface InAppProduct {
  productId: string;
  title: string;
  description: string;
  formattedPrice: string;
  priceAmountMicros: number;
  currency: string;
}
