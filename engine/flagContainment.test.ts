import { describe, expect, it } from 'vitest';
import { isFlagContained } from './flagContainment';

describe('isFlagContained', () => {
  it('wrapped in getFlag and fallback not true → contained', () => {
    expect(isFlagContained({
      flagName: 'NEW_GAME',
      diffText: "if (getFlag('NEW_GAME')) { renderNewGame(); }",
      featureFlagsSource: "export default { OTHER: true } as Record<string, boolean>;",
    })).toBe(true);
  });

  it('fallback hardcoded true → NOT contained', () => {
    expect(isFlagContained({
      flagName: 'NEW_GAME',
      diffText: "if (getFlag('NEW_GAME')) {}",
      featureFlagsSource: "export default { NEW_GAME: true };",
    })).toBe(false);
  });

  it('flag name not referenced in diff → NOT contained', () => {
    expect(isFlagContained({
      flagName: 'NEW_GAME',
      diffText: "renderNewGame();",
      featureFlagsSource: "export default {};",
    })).toBe(false);
  });

  it('assignment-form default-on (featureFlags[X] = true) → NOT contained', () => {
    expect(isFlagContained({
      flagName: 'GAME_SERVER_ENABLED',
      diffText: "if (getFlag('GAME_SERVER_ENABLED')) {}",
      featureFlagsSource: "featureFlags['GAME_SERVER_ENABLED'] = true;",
    })).toBe(false);
  });

  it('dot-assignment default-on (featureFlags.X = true) → NOT contained', () => {
    expect(isFlagContained({
      flagName: 'NEW_GAME',
      diffText: "if (getFlag('NEW_GAME')) {}",
      featureFlagsSource: "featureFlags.NEW_GAME = true;",
    })).toBe(false);
  });

  it('LOOP default-on via array membership → NOT contained', () => {
    const src = [
      "const availableFlags = [",
      "  'BUTTON_LIKE',",
      "  'BUTTON_SHARE',",
      "];",
      "availableFlags.forEach((flag) => { featureFlags[flag] = true; });",
    ].join('\n');
    expect(isFlagContained({
      flagName: 'BUTTON_LIKE',
      diffText: "if (getFlag('BUTTON_LIKE')) {}",
      featureFlagsSource: src,
    })).toBe(false);
  });

  it('env-derived default (= process.env.X !== "true") → NOT contained', () => {
    expect(isFlagContained({
      flagName: 'AVATAR3D',
      diffText: "if (getFlag('AVATAR3D')) {}",
      featureFlagsSource: "featureFlags['AVATAR3D'] = process.env.EXPO_PUBLIC_DISABLE_3D_AVATARS !== 'true';",
    })).toBe(false);
  });

  it('explicit `= false` (with a comment mentioning the flag) → contained (off → dark)', () => {
    const src = [
      "  // GAME_TAGS_ENABLED — community game tags. Fallback false until rollout.",
      "  featureFlags['GAME_TAGS_ENABLED'] = false;",
    ].join('\n');
    expect(isFlagContained({
      flagName: 'GAME_TAGS_ENABLED',
      diffText: "if (getFlag('GAME_TAGS_ENABLED')) {}",
      featureFlagsSource: src,
    })).toBe(true);
  });

  it('substring safety: flag LIKE not matched inside BUTTON_LIKE', () => {
    const src = "const availableFlags = ['BUTTON_LIKE'];\navailableFlags.forEach((f) => featureFlags[f] = true);";
    // LIKE is absent (only BUTTON_LIKE present) → dark.
    expect(isFlagContained({
      flagName: 'LIKE',
      diffText: "if (getFlag('LIKE')) {}",
      featureFlagsSource: src,
    })).toBe(true);
  });

  it('empty flag name → NOT contained', () => {
    expect(isFlagContained({
      flagName: '',
      diffText: "if (getFlag('NEW_GAME')) {}",
      featureFlagsSource: "export default {};",
    })).toBe(false);
  });
});
