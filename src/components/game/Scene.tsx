import { Suspense, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Ground } from './Ground';
import { CharacterMesh } from './CharacterMesh';
import { MonsterMesh } from './MonsterMesh';
import { CameraRig } from './CameraRig';
import { LightRig } from './LightRig';
import { useCombatStore } from '../../stores/combatStore';
import type { CharacterProfile, EnterMapResponse } from '../../types/api';

const FOG_COLOR = '#bcdcf0';
const RESPAWN_CHECK_INTERVAL = 0.5;

function RespawnTicker() {
  const tickRespawns = useCombatStore((s) => s.tickRespawns);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current >= RESPAWN_CHECK_INTERVAL) {
      elapsed.current = 0;
      tickRespawns();
    }
  });
  return null;
}

export function Scene({
  character,
  map,
}: {
  character: CharacterProfile;
  map: EnterMapResponse;
}) {
  const initCombat = useCombatStore((s) => s.init);

  useEffect(() => {
    initCombat(character, map.monsters);
    // Combat state is local-only for now (no backend combat API yet) and should only be
    // (re)seeded when a genuinely new map/character session starts, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id, map.map_id]);

  return (
    <>
      <CameraRig />
      <LightRig />

      <color attach="background" args={[FOG_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, 34, 95]} />

      <hemisphereLight args={['#e8f4ff', '#3f6b34', 0.32]} />
      <ambientLight intensity={0.35} />

      <Ground />

      <Suspense fallback={null}>
        <CharacterMesh character={character} />
      </Suspense>
      {map.monsters.map((monster) => (
        <MonsterMesh key={monster.instance_id} monster={monster} />
      ))}
      <RespawnTicker />

      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.6} intensity={0.15} mipmapBlur />
        <Vignette eskil={false} offset={0.3} darkness={0.4} />
      </EffectComposer>
    </>
  );
}
