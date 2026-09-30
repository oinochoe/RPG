import { useEffect } from 'react';
import { addShake, shakeAmplitude, startCombatFxWatcher, subscribeHit } from './combatFx';

/** Mount once inside the Canvas: starts the HP watcher and hosts the combat-feel visuals. */
export function CombatFxRoot() {
  useEffect(() => {
    const stopWatcher = startCombatFxWatcher();
    const stopShake = subscribeHit((e) => {
      const amp = shakeAmplitude(e);
      if (amp > 0) addShake(amp);
    });
    return () => {
      stopShake();
      stopWatcher();
    };
  }, []);
  return null;
}
