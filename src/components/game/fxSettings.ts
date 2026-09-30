import { create } from 'zustand';

const SHAKE_KEY = 'rpg.fx.shake';

function readShake(): boolean {
  try {
    return typeof localStorage === 'undefined' ? true : localStorage.getItem(SHAKE_KEY) !== '0';
  } catch {
    // Storage blocked (private mode etc.): default to on.
    return true;
  }
}

interface FxSettingsState {
  shake: boolean;
  setShake: (on: boolean) => void;
}

/** Player-facing switches for combat presentation. Screen shake can be turned off (motion sickness). */
export const useFxSettings = create<FxSettingsState>((set) => ({
  shake: readShake(),
  setShake: (on) => {
    try {
      localStorage.setItem(SHAKE_KEY, on ? '1' : '0');
    } catch {
      // best-effort
    }
    set({ shake: on });
  },
}));
