import { Suspense, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Ground } from './Ground';
import { Dungeon, DUNGEON_MONSTERS } from './Dungeon';
import { AreaTransitions } from './AreaTransitions';
import { CharacterMesh } from './CharacterMesh';
import { MonsterMesh, GOBLIN_VARIANT } from './MonsterMesh';
import { CameraRig } from './CameraRig';
import { LightRig } from './LightRig';
import { useCombatStore } from '../../stores/combatStore';
import { useWorldStore } from '../../stores/worldStore';
import type { CharacterProfile, EnterMapResponse } from '../../types/api';

const FIELD_FOG_COLOR = '#bcdcf0';
const DUNGEON_FOG_COLOR = '#141014';
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
  const currentArea = useWorldStore((s) => s.currentArea);

  useEffect(() => {
    initCombat(character, map.monsters);
    // Combat state is local-only for now (no backend combat API yet) and should only be
    // (re)seeded when a genuinely new map/character session starts, not on every re-render
    // or area transition (entering/leaving the dungeon swaps monsters via loadMonsters
    // instead, which doesn't touch player level/exp/hp).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id, map.map_id]);

  const isDungeon = currentArea === 'dungeon';

  return (
    <>
      <CameraRig />
      <LightRig />

      <color attach="background" args={[isDungeon ? DUNGEON_FOG_COLOR : FIELD_FOG_COLOR]} />
      <fog
        attach="fog"
        args={isDungeon ? [DUNGEON_FOG_COLOR, 14, 40] : [FIELD_FOG_COLOR, 34, 95]}
      />

      <hemisphereLight args={['#e8f4ff', '#3f6b34', isDungeon ? 0.08 : 0.32]} />
      <ambientLight intensity={isDungeon ? 0.12 : 0.35} />

      {isDungeon ? (
        <>
          <Dungeon />
          {DUNGEON_MONSTERS.map((monster) => (
            <MonsterMesh key={monster.instance_id} monster={monster} variant={GOBLIN_VARIANT} />
          ))}
        </>
      ) : (
        <>
          <Ground />
          {map.monsters.map((monster) => (
            <MonsterMesh key={monster.instance_id} monster={monster} />
          ))}
        </>
      )}

      <Suspense fallback={null}>
        <CharacterMesh character={character} />
      </Suspense>
      <AreaTransitions fieldMonsters={map.monsters} />
      <RespawnTicker />

      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.6} intensity={0.15} mipmapBlur />
        <Vignette eskil={false} offset={0.3} darkness={0.4} />
      </EffectComposer>
    </>
  );
}
