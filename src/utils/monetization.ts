import { AdUnitConfig, UserSubscriptionState, InAppProduct } from '../types/monetization';

const STORAGE_KEY = 'dualshot_user_subscription_v1';

export const DEFAULT_AD_CONFIG: AdUnitConfig = {
  // Official Google AdMob Interstitial test ad unit for Android
  adMobInterstitialId: 'ca-app-pub-3940256099942544/1033173712',
  minimumWatchSeconds: 5,
  skipAfterSeconds: 5,
  showOnAppLaunch: true,
  showAfterCapturesCount: 3,
};

export const ANNUAL_PRODUCT: InAppProduct = {
  productId: 'dualshot_adfree_annual',
  title: 'Annual Pass (1 Year Ad-Free)',
  description: 'Pay once a year ($4.99/yr). No ads on app launch and zero ads on recordings for 365 days.',
  formattedPrice: '$4.99 / year',
  priceAmountMicros: 4990000,
  currency: 'USD',
};

export const PRO_PRODUCT: InAppProduct = {
  productId: 'dualshot_adfree_lifetime',
  title: 'DualShot Pro (Lifetime Ad-Free)',
  description: 'Never see ads again. Unlimited dual 4K recordings, instant app opening, and lifetime priority updates.',
  formattedPrice: '$9.99 lifetime',
  priceAmountMicros: 9990000,
  currency: 'USD',
};

/**
 * Pure function: determine if an ad should be displayed
 */
export function shouldDisplayAd(
  userState: UserSubscriptionState,
  trigger: 'launch' | 'capture',
  capturesCount: number = 0,
  config: AdUnitConfig = DEFAULT_AD_CONFIG,
  currentTime: number = Date.now()
): boolean {
  // Lifetime paid users NEVER see ads
  if (userState.tier === 'pro_lifetime') {
    return false;
  }

  // Annual paid users: valid for 1 full year (365 days)
  if (userState.tier === 'annual_pass') {
    if (userState.expiresAt && userState.expiresAt > currentTime) {
      return false; // Active 1-year pass: NEVER show ads!
    }
    // Expired annual pass
    return true;
  }

  // Any other active ad-free state
  if (userState.isAdFree) {
    return false;
  }

  if (trigger === 'launch') {
    return config.showOnAppLaunch;
  }

  if (trigger === 'capture') {
    return capturesCount > 0 && capturesCount % config.showAfterCapturesCount === 0;
  }

  return false;
}

/**
 * Format expiration date for display
 */
export function formatSubscriptionExpiry(expiresAt?: number): string {
  if (!expiresAt) return 'Never (Lifetime)';
  const d = new Date(expiresAt);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Load user subscription from persistent storage
 */
export function loadUserSubscription(): UserSubscriptionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: UserSubscriptionState = JSON.parse(raw);
      // If annual pass has expired, revert to free
      if (parsed.tier === 'annual_pass' && parsed.expiresAt && parsed.expiresAt <= Date.now()) {
        const expiredState: UserSubscriptionState = {
          isAdFree: false,
          tier: 'free',
        };
        saveUserSubscription(expiredState);
        return expiredState;
      }
      if (typeof parsed.isAdFree === 'boolean') {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not read user subscription from storage:', err);
  }

  return {
    isAdFree: false,
    tier: 'free',
  };
}

/**
 * Save user subscription state to persistent storage
 */
export function saveUserSubscription(state: UserSubscriptionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save user subscription:', err);
  }
}

/**
 * Purchase 1-Year Annual Ad-Free Subscription Pass
 */
export async function purchaseAnnualPass(): Promise<UserSubscriptionState> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const now = Date.now();
      const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
      const orderId = `GPA.${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(
        1000 + Math.random() * 9000
      )}-${Math.floor(1000 + Math.random() * 9000)}`;

      const updatedState: UserSubscriptionState = {
        isAdFree: true,
        tier: 'annual_pass',
        purchaseDate: now,
        expiresAt: now + ONE_YEAR_MS,
        billingCycle: 'annual',
        orderId,
      };

      saveUserSubscription(updatedState);
      resolve(updatedState);
    }, 600);
  });
}

/**
 * Google Play In-App Purchase execution handler (Lifetime License)
 */
export async function purchaseAdFreePro(): Promise<UserSubscriptionState> {
  // Simulate Google Play Billing transaction verification
  return new Promise((resolve) => {
    setTimeout(() => {
      const orderId = `GPA.${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(
        1000 + Math.random() * 9000
      )}-${Math.floor(1000 + Math.random() * 9000)}`;

      const updatedState: UserSubscriptionState = {
        isAdFree: true,
        tier: 'pro_lifetime',
        purchaseDate: Date.now(),
        orderId,
      };

      saveUserSubscription(updatedState);
      resolve(updatedState);
    }, 600);
  });
}

/**
 * Restore previous purchases (required by Google Play policy)
 */
export async function restorePurchases(): Promise<UserSubscriptionState> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const existing = loadUserSubscription();
      resolve(existing);
    }, 500);
  });
}
