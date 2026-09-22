import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
import { QuestProximity } from './QuestProximity';
import { LootProximity } from './LootProximity';
import { ItemDropMesh } from './ItemDropMesh';
import { CharacterMesh } from './CharacterMesh';
import {
  MonsterMesh,
  GOBLIN_VARIANT,
  SKELETON_VARIANT,
  CACTORO_VARIANT,
  GIANT_VARIANT,
  ORC_VARIANT,
  GHOUL_VARIANT,
  FAIRY_VARIANT,
} from './MonsterMesh';
import { CameraRig } from './CameraRig';
import { LightRig } from './LightRig';
import { playerPosition } from './playerTransform';
import { useCombatStore } from '../../stores/combatStore';
import { useQuestStore } from '../../stores/questStore';
import { useLootStore } from '../../stores/lootStore';
import { useWorldStore } from '../../stores/worldStore';
import type { CharacterProfile, EnterMapResponse, MonsterInstanceSummary } from '../../types/api';

// Every field monster used to mount unconditionally — with FIELD_MONSTER_COUNT at 90 (and the
// field itself much bigger), that meant 90 simultaneous skinned meshes + animation mixers +
// up to 180 per-frame-repositioned Html name/health tags, all ticking regardless of whether
// the player could even see them. Rendering only stops for monsters actually near the player;
// combatStore's own tickMonsterMovement/monsterAttackTick still run for all of them either way
// (that part was never the bottleneck — it's plain math over a plain object), so nothing about
// combat correctness changes, only what gets mounted. Polled rather than checked every frame
// since a monster's spawn point doesn't need pixel-perfect cull timing, and a little
// hysteresis (wider radius to leave than to enter) stops it flickering in/out right at the edge.
const FIELD_MONSTER_RENDER_RADIUS = 65;
const FIELD_MONSTER_RENDER_HYSTERESIS = 10;
const MONSTER_CULL_POLL_MS = 300;

function useNearbyFieldMonsterIds(monsters: MonsterInstanceSummary[]): Set<number> {
  const [nearbyIds, setNearbyIds] = useState<Set<number>>(() => new Set());
  const prevRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    function poll() {
      const next = new Set<number>();
      for (const m of monsters) {
        const dx = playerPosition.x - m.position_x;
        const dz = playerPosition.z - m.position_z;
        const threshold = prevRef.current.has(m.instance_id)
          ? FIELD_MONSTER_RENDER_RADIUS + FIELD_MONSTER_RENDER_HYSTERESIS
          : FIELD_MONSTER_RENDER_RADIUS;
        if (dx * dx + dz * dz <= threshold * threshold) next.add(m.instance_id);
      }
      prevRef.current = next;
      setNearbyIds(next);
    }
    poll();
    const id = window.setInterval(poll, MONSTER_CULL_POLL_MS);
    return () => window.clearInterval(id);
  }, [monsters]);

  return nearbyIds;
}

// Field monster_template_id convention (see FieldMonsters.ts): 1 = slime (the default variant
// MonsterMesh itself falls back to), 3 = skeleton, 4 = 가시선인장 (desert-only).
function fieldMonsterVariant(templateId: number) {
  if (templateId === 3) return SKELETON_VARIANT;
  if (templateId === 4) return CACTORO_VARIANT;
  if (templateId === 6) return ORC_VARIANT;
  if (templateId === 7) return GHOUL_VARIANT;
  if (templateId === 8) return FAIRY_VARIANT;
  return undefined;
}

// Dungeon monster_template_id convention (see Dungeon.tsx's buildFloorMonsters): 2 = goblin
// (the default), 3 = skeleton, 5 = the final-floor Giant boss.
function dungeonMonsterVariant(templateId: number) {
  if (templateId === 3) return SKELETON_VARIANT;
  if (templateId === 5) return GIANT_VARIANT;
  return GOBLIN_VARIANT;
}

function monsterScale(name: string): number {
  // The Giant boss's size already comes from its own (much bigger) model — the extra
  // scale-up below is a goblin-reskin trick for "대장/군주" that doesn't need to stack here.
  if (name.includes('거인')) return 1.0;
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
  const initQuests = useQuestStore((s) => s.init);
  const drops = useLootStore((s) => s.drops);
  const currentArea = useWorldStore((s) => s.currentArea);
  const dungeonFloor = useWorldStore((s) => s.dungeonFloor);

  // The server's enter-map response always returns monsters: [] (no real monster-instance
  // persistence yet) — generate the field's roster client-side instead, same pattern as the
  // dungeon's buildFloorMonsters. Stable for the session (computed once, not reshuffled on
  // every re-render).
  const fieldMonsters = useMemo(() => buildFieldMonsters(), []);
  const nearbyFieldMonsterIds = useNearbyFieldMonsterIds(fieldMonsters);

  useEffect(() => {
    initCombat(character, fieldMonsters, false);
    initQuests(character.active_quests);
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
        args={isDungeon ? [DUNGEON_FOG_COLOR, 14, 40] : [FIELD_FOG_COLOR, 34, 145]}
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
              variant={dungeonMonsterVariant(monster.monster_template_id)}
              scale={monsterScale(monster.name)}
              tint={monsterTint(monster.name)}
            />
          ))}
        </>
      ) : (
        <>
          <Ground />
          {fieldMonsters
            .filter((monster) => nearbyFieldMonsterIds.has(monster.instance_id))
            .map((monster) => (
              <MonsterMesh
                key={monster.instance_id}
                monster={monster}
                variant={fieldMonsterVariant(monster.monster_template_id)}
                tint={monsterTint(monster.name)}
              />
            ))}
        </>
      )}

      {drops.map((drop) => (
        <ItemDropMesh key={drop.id} drop={drop} />
      ))}

      <Suspense fallback={null}>
        <CharacterMesh character={character} />
      </Suspense>
      <AreaTransitions fieldMonsters={fieldMonsters} />
      <PlayerCombatEffects fieldMonsters={fieldMonsters} />
      <RespawnTicker />
      <MpRegenTicker />
      <PositionSync mapId={map.map_id} />
      <ShopProximity />
      <QuestProximity />
      <LootProximity />

      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.6} intensity={0.15} mipmapBlur />
        <Vignette eskil={false} offset={0.3} darkness={0.4} />
      </EffectComposer>
    </>
  );
}
