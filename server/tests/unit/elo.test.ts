import { describe, expect, it } from 'vitest';
import { calculateRatings, expectedScore, kFactor } from '../../src/lib/elo.js';

describe('kFactor', () => {
  it('uses the provisional factor for new accounts', () => {
    expect(kFactor(1200, 0)).toBe(40);
    expect(kFactor(1200, 9)).toBe(40);
  });

  it('drops to the standard factor once established', () => {
    expect(kFactor(1200, 10)).toBe(20);
    expect(kFactor(2399, 50)).toBe(20);
  });

  it('uses the master factor at 2400 and above', () => {
    expect(kFactor(2400, 50)).toBe(10);
    expect(kFactor(2700, 500)).toBe(10);
  });
});

describe('expectedScore', () => {
  it('is even for equal ratings', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 10);
  });

  it('gives a 400-point favourite roughly ten to one odds', () => {
    expect(expectedScore(1900, 1500)).toBeCloseTo(0.909, 3);
  });

  it('is symmetric', () => {
    expect(expectedScore(1600, 1400) + expectedScore(1400, 1600)).toBeCloseTo(1, 10);
  });
});

describe('calculateRatings', () => {
  it('moves both players when equals decide a game', () => {
    const change = calculateRatings(1500, 1500, 20, 20, '1-0');
    expect(change.whiteAfter).toBe(1510);
    expect(change.blackAfter).toBe(1490);
    expect(change.whiteDelta).toBe(10);
    expect(change.blackDelta).toBe(-10);
  });

  it('leaves equals unchanged on a draw', () => {
    const change = calculateRatings(1500, 1500, 20, 20, '1/2-1/2');
    expect(change.whiteDelta).toBe(0);
    expect(change.blackDelta).toBe(0);
  });

  it('rewards an upset far more than an expected win', () => {
    const upset = calculateRatings(1200, 2000, 20, 20, '1-0');
    const expected = calculateRatings(2000, 1200, 20, 20, '1-0');
    expect(upset.whiteDelta).toBeGreaterThan(expected.whiteDelta);
    expect(upset.whiteDelta).toBe(20);
    expect(expected.whiteDelta).toBe(0);
  });

  it('applies each side its own K-factor', () => {
    // White is provisional (K=40), black is established (K=20).
    const change = calculateRatings(1500, 1500, 0, 100, '1-0');
    expect(change.whiteDelta).toBe(20);
    expect(change.blackDelta).toBe(-10);
  });

  it('is zero-sum when both players share a K-factor', () => {
    for (const result of ['1-0', '0-1', '1/2-1/2']) {
      const change = calculateRatings(1687, 1432, 30, 40, result);
      expect(change.whiteDelta + change.blackDelta).toBe(0);
    }
  });
});
