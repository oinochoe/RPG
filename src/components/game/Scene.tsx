import { Suspense, useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Ground } from './Ground';
import { Dungeon, buildFloorMonsters } from './Dungeon';
import { buildFieldMonsters } from './FieldMonsters';
import { AreaTransitions } from './AreaTransitions';
import { PlayerCombatEffects } from './PlayerCombatEffects';
import { PositionSync } from './PositionSync';
import { ShopProximity } from './ShopProximity';
import { CharacterMesh } from './CharacterMesh';
import { MonsterMesh, GOBLIN_VARIANT, SKELETON_VARIANT } from './MonsterMesh';
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

// Elites get a color tint (multiplied onto the base material) instead of a separate model —
// darker/redder the higher-ranked the monster, so a 군주 reads as visually tougher than a
// 대장 at a glance even before its bigger scale/health bar register.
function monsterTint(name: string): THREE.ColorRepresentation | undefined {
  if (name.includes('군주')) return '#8a1f2b';
  if (name.includes('대장')) return '#c4553a';
  return undefined;
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

const MP_REGEN_INTERVAL_SEC = 1;

function MpRegenTicker() {
  const tickMpRegen = useCombatStore((s) => s.tickMpRegen);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current >= MP_REGEN_INTERVAL_SEC) {
      elapsed.current = 0;
      tickMpRegen();
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

  // The server's enter-map response always returns monsters: [] (no real monster-instance
  // persistence yet) — generate the field's roster client-side instead, same pattern as the
  // dungeon's buildFloorMonsters. Stable for the session (computed once, not reshuffled on
  // every re-render).
  const fieldMonsters = useMemo(() => buildFieldMonsters(), []);

  useEffect(() => {
    initCombat(character, fieldMonsters, false);
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
              tint={monsterTint(monster.name)}
            />
          ))}
        </>
      ) : (
        <>
          <Ground />
          {fieldMonsters.map((monster) => (
            <MonsterMesh
              key={monster.instance_id}
              monster={monster}
              variant={monster.monster_template_id === 3 ? SKELETON_VARIANT : undefined}
            />
          ))}
        </>
      )}

      <Suspense fallback={null}>
        <CharacterMesh character={character} />
      </Suspense>
      <AreaTransitions fieldMonsters={fieldMonsters} />
      <PlayerCombatEffects fieldMonsters={fieldMonsters} />
      <RespawnTicker />
      <MpRegenTicker />
      <PositionSync mapId={map.map_id} />
      <ShopProximity />

      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.6} intensity={0.15} mipmapBlur />
        <Vignette eskil={false} offset={0.3} darkness={0.4} />
      </EffectComposer>
    </>
  );
}
