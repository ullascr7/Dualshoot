import test from 'node:test';
import assert from 'node:assert';
import { shouldDisplayAd, DEFAULT_AD_CONFIG } from './monetization';
import { UserSubscriptionState } from '../types/monetization';

test('shouldDisplayAd returns true on launch for free users', () => {
  const freeUser: UserSubscriptionState = { isAdFree: false, tier: 'free' };
  const showAd = shouldDisplayAd(freeUser, 'launch', 0, DEFAULT_AD_CONFIG);
  assert.strictEqual(showAd, true);
});

test('shouldDisplayAd returns false for Pro (Ad-Free) users on launch', () => {
  const proUser: UserSubscriptionState = { isAdFree: true, tier: 'pro_lifetime' };
  const showAd = shouldDisplayAd(proUser, 'launch', 0, DEFAULT_AD_CONFIG);
  assert.strictEqual(showAd, false);
});

test('shouldDisplayAd returns true after configured capture interval for free users', () => {
  const freeUser: UserSubscriptionState = { isAdFree: false, tier: 'free' };
  assert.strictEqual(shouldDisplayAd(freeUser, 'capture', 1, DEFAULT_AD_CONFIG), false);
  assert.strictEqual(shouldDisplayAd(freeUser, 'capture', 2, DEFAULT_AD_CONFIG), false);
  assert.strictEqual(shouldDisplayAd(freeUser, 'capture', 3, DEFAULT_AD_CONFIG), true);
  assert.strictEqual(shouldDisplayAd(freeUser, 'capture', 6, DEFAULT_AD_CONFIG), true);
});

test('shouldDisplayAd returns false for Pro users even on capture intervals', () => {
  const proUser: UserSubscriptionState = { isAdFree: true, tier: 'pro_lifetime' };
  assert.strictEqual(shouldDisplayAd(proUser, 'capture', 3, DEFAULT_AD_CONFIG), false);
  assert.strictEqual(shouldDisplayAd(proUser, 'capture', 6, DEFAULT_AD_CONFIG), false);
});

test('shouldDisplayAd returns false for active 1-year Annual Pass users', () => {
  const now = 1700000000000;
  const activeAnnualUser: UserSubscriptionState = {
    isAdFree: true,
    tier: 'annual_pass',
    purchaseDate: now - 30 * 24 * 60 * 60 * 1000,
    expiresAt: now + 335 * 24 * 60 * 60 * 1000, // 335 days left
  };
  // Should never show ads while 1-year pass is active
  assert.strictEqual(shouldDisplayAd(activeAnnualUser, 'launch', 0, DEFAULT_AD_CONFIG, now), false);
  assert.strictEqual(shouldDisplayAd(activeAnnualUser, 'capture', 3, DEFAULT_AD_CONFIG, now), false);
});

test('shouldDisplayAd returns true when 1-year Annual Pass has expired', () => {
  const now = 1700000000000;
  const expiredUser: UserSubscriptionState = {
    isAdFree: false,
    tier: 'annual_pass',
    purchaseDate: now - 400 * 24 * 60 * 60 * 1000,
    expiresAt: now - 35 * 24 * 60 * 60 * 1000, // Expired 35 days ago
  };
  assert.strictEqual(shouldDisplayAd(expiredUser, 'launch', 0, DEFAULT_AD_CONFIG, now), true);
});
