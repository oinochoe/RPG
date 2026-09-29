import { beforeEach, describe, expect, it } from 'vitest';
import { markTutorialSeen, shouldAutoShowTutorial, tutorialPages, useTutorialStore } from './tutorial';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('shouldAutoShowTutorial / markTutorialSeen', () => {
  it('shows on a first visit, then never again once marked seen', () => {
    const storage = fakeStorage();
    expect(shouldAutoShowTutorial(storage)).toBe(true);
    markTutorialSeen(storage);
    expect(shouldAutoShowTutorial(storage)).toBe(false);
  });

  it('does not nag when storage is unavailable or throws', () => {
    expect(shouldAutoShowTutorial(null)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(shouldAutoShowTutorial(broken)).toBe(false);
    expect(() => markTutorialSeen(broken)).not.toThrow();
  });
});

describe('tutorialPages', () => {
  it('has the same page structure for both devices', () => {
    expect(tutorialPages(true).map((p) => p.title)).toEqual(tutorialPages(false).map((p) => p.title));
  });

  it('touch wording never tells a phone to press keys', () => {
    const text = tutorialPages(true)
      .flatMap((p) => p.lines.flat())
      .join(' ');
    expect(text).not.toMatch(/WASD|Space|F4|F1|우클릭|더블클릭/);
    expect(text).toContain('조이스틱');
  });

  it('desktop wording covers the keyboard controls', () => {
    const text = tutorialPages(false)
      .flatMap((p) => p.lines.flat())
      .join(' ');
    expect(text).toContain('WASD');
    expect(text).toContain('Space');
  });
});

describe('useTutorialStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useTutorialStore.setState({ isOpen: false });
  });

  it('opens automatically only the first time', () => {
    useTutorialStore.getState().openIfFirstTime();
    expect(useTutorialStore.getState().isOpen).toBe(true);
    useTutorialStore.getState().close();
    useTutorialStore.getState().openIfFirstTime();
    expect(useTutorialStore.getState().isOpen).toBe(false);
  });

  it('can be reopened on demand after being seen', () => {
    useTutorialStore.getState().close();
    useTutorialStore.getState().open();
    expect(useTutorialStore.getState().isOpen).toBe(true);
  });
});
