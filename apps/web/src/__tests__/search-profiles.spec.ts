import {
  assignAbProfile,
  getDefaultSearchAbWeights,
  parseSearchAbWeights,
  parseSearchProfile,
} from '../lib/searchProfiles';

describe('searchProfiles', () => {
  test('parses supported profiles', () => {
    expect(parseSearchProfile('balanced')).toBe('balanced');
    expect(parseSearchProfile('quality')).toBe('quality');
    expect(parseSearchProfile('novelty')).toBe('novelty');
    expect(parseSearchProfile('invalid')).toBeNull();
    expect(parseSearchProfile(undefined)).toBeNull();
  });

  test('parses and normalizes ab weights', () => {
    const weights = parseSearchAbWeights('balanced:2,quality:1,novelty:1');
    expect(
      Number((weights.balanced + weights.quality + weights.novelty).toFixed(6)),
    ).toBe(1);
    expect(weights.balanced).toBeCloseTo(0.5, 4);
    expect(weights.quality).toBeCloseTo(0.25, 4);
    expect(weights.novelty).toBeCloseTo(0.25, 4);
  });

  test('falls back to default weights for invalid config', () => {
    const defaults = getDefaultSearchAbWeights();
    const weights = parseSearchAbWeights('oops');
    expect(weights).toEqual(defaults);
  });

  test('assigns deterministic profile for same seed', () => {
    const weights = parseSearchAbWeights('balanced:0.5,quality:0.5');
    const first = assignAbProfile('visitor-123', weights);
    const second = assignAbProfile('visitor-123', weights);
    expect(first).toBe(second);
  });
});
