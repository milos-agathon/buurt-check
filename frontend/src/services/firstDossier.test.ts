import { beforeEach, describe, expect, it } from 'vitest';
import { isFirstDossierAvailable, markFirstDossierUsed } from './firstDossier';

describe('firstDossier', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('first dossier is available by default', () => {
    expect(isFirstDossierAvailable()).toBe(true);
  });

  it('not available after marked used', () => {
    markFirstDossierUsed();
    expect(isFirstDossierAvailable()).toBe(false);
  });
});

