import {
  formatPredictionTrustTier,
  isPredictionTrustTier,
} from '../lib/predictionTier';

describe('prediction trust tier helpers', () => {
  test('formats trust tier via translation key when available', () => {
    const t = (key: string) =>
      key === 'prediction.trustTier.trusted' ? 'Trusted' : key;
    expect(formatPredictionTrustTier('trusted', t)).toBe('Trusted');
  });

  test('falls back to title case when translation key is missing', () => {
    const t = (key: string) => key;
    expect(formatPredictionTrustTier('regular', t)).toBe('Regular');
  });

  test('returns placeholder when tier is missing', () => {
    const t = (key: string) => key;
    expect(formatPredictionTrustTier(null, t)).toBe('-');
  });

  test('detects valid trust tier values', () => {
    expect(isPredictionTrustTier('entry')).toBe(true);
    expect(isPredictionTrustTier('elite')).toBe(true);
    expect(isPredictionTrustTier('invalid')).toBe(false);
  });
});
