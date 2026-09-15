import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Ground } from './Ground';
import { Dungeon, buildFloorMonsters } from './Dungeon';
import { AreaTransitions } from './AreaTransitions';
import { PlayerCombatEffects } from './PlayerCombatEffects';
import { PositionSync } from './PositionSync';
import { CharacterMesh } from './CharacterMesh';
import { MonsterMesh, GOBLIN_VARIANT } from './MonsterMesh';
import { CameraRig } from './CameraRig';
import { LightRig } from './LightRig';
import { useCombatStore } from '../../stores/combatStore';
import { useWorldStore } from '../../stores/worldStore';
import type { CharacterProfile, EnterMapResponse } from '../../types/api';

function monsterScale(name: string): number {
  if (name.includes('군주')) return 1.7;
  if (name.includes('대장')) return 1.3;
  return 1;
}

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
  const dungeonFloor = useWorldStore((s) => s.dungeonFloor);

  useEffect(() => {
    initCombat(character, map.monsters, false);
    // Combat state is local-only for now (no backend combat API yet) and should only be
    // (re)seeded when a genuinely new map/character session starts, not on every re-render
    // or area transition (entering/leaving the dungeon swaps monsters via loadMonsters
    // instead, which doesn't touch player level/exp/hp).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id, map.map_id]);

  const isDungeon = currentArea === 'dungeon';
  const dungeonMonsters = useMemo(
    () => (isDungeon ? buildFloorMonsters(dungeonFloor) : []),
    [isDungeon, dungeonFloor],
  );

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
          <Dungeon floor={dungeonFloor} />
          {dungeonMonsters.map((monster) => (
            <MonsterMesh
              key={monster.instance_id}
              monster={monster}
              variant={GOBLIN_VARIANT}
              scale={monsterScale(monster.name)}
            />
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
      <PlayerCombatEffects fieldMonsters={map.monsters} />
      <RespawnTicker />
      <PositionSync mapId={map.map_id} />

      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.6} intensity={0.15} mipmapBlur />
        <Vignette eskil={false} offset={0.3} darkness={0.4} />
      </EffectComposer>
    </>
  );
}
