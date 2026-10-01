import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DISCOVERIES } from './discoveries';
import { MAX_RADIUS_IN_GRID, MIN_TRIGGER_RADIUS, validateDefs } from './discoveryLogic';
import { zoneAt } from './discoveryZones';
import { DISCOVERY_REWARDS, validateRewardTable } from '../../../supabase/functions/api/discoveries';
import {
  activeColliders,
  boneFieldEdgeAt,
  DESERT_X_END,
  DUNGEON_ENTRANCES,
  fairyForestEdgeAt,
  orcVillageEdgeAt,
  PLAYER_COLLISION_RADIUS,
  resolveMovement,
  RIVER_HALF_WIDTH,
  riverXAt,
  type Collider,
} from './worldColliders';
import { villageColliders } from './villageLayout';
import { QUEST_NPCS, SHOP_NPCS } from './Village';

// FieldNpcs.tsx keeps its list private; these mirror its positions (same formulas).
const FIELD_NPC_POSITIONS: [number, number][] = [
  [0, fairyForestEdgeAt(0) + 20],
  [0, orcVillageEdgeAt(0) - 20],
  [boneFieldEdgeAt(0) - 20, 0],
  [DESERT_X_END + 25, 0],
];

const GEAR_IDS = [9, 10, 11];

describe('discovery content', () => {
  it('has the planned amount and mix', () => {
    expect(DISCOVERIES.length).toBeGreaterThanOrEqual(24);
    expect(DISCOVERIES.filter((d) => d.kind === 'trigger').length).toBeLessThanOrEqual(2);
    expect(DISCOVERIES.filter((d) => d.kind === 'npc').length).toBeGreaterThanOrEqual(3);
    expect(DISCOVERIES.filter((d) => d.reward).length).toBeGreaterThanOrEqual(7);
    // Mostly laughs: at least half of everything pays nothing.
    expect(DISCOVERIES.filter((d) => !d.reward).length).toBeGreaterThanOrEqual(DISCOVERIES.length / 2);
  });

  it('passes the structural validation', () => {
    expect(validateDefs(DISCOVERIES)).toEqual([]);
  });

  it('hides anything gated (a map marker would spoil it) and keeps triggers in the 4..8 radius band', () => {
    for (const d of DISCOVERIES) {
      if ((d.requires ?? []).length > 0) expect(d.hidden, d.id).toBe(true);
      if (d.kind === 'trigger') {
        expect(d.radius, d.id).toBeGreaterThanOrEqual(MIN_TRIGGER_RADIUS);
        expect(d.radius, d.id).toBeLessThanOrEqual(MAX_RADIUS_IN_GRID);
      }
    }
  });

  it('has at least one hidden NPC reached through a seen-chain of hidden discoveries', () => {
    const byId = new Map(DISCOVERIES.map((d) => [d.id, d]));
    const chained = DISCOVERIES.filter(
      (d) => d.kind === 'npc' && d.hidden && (d.requires ?? []).some((r) => r.type === 'seen' && (byId.get(r.id)?.requires ?? []).some((q) => q.type === 'seen')),
    );
    expect(chained.length).toBeGreaterThanOrEqual(1);
    for (const d of DISCOVERIES.filter((x) => x.kind === 'npc')) expect(d.hidden, d.id).toBe(true);
  });

  it('keeps client rewards and the server table identical, and the server table within its caps', () => {
    expect(validateRewardTable(DISCOVERY_REWARDS)).toEqual([]);
    const clientRewardIds = DISCOVERIES.filter((d) => d.reward).map((d) => d.id).sort();
    expect(Object.keys(DISCOVERY_REWARDS).sort()).toEqual(clientRewardIds);
    for (const d of DISCOVERIES.filter((x) => x.reward)) {
      const s = DISCOVERY_REWARDS[d.id];
      expect(s.gold, d.id).toBe(d.reward!.gold);
      expect(s.xp, d.id).toBe(d.reward!.xp);
      expect(s.itemTemplateId, d.id).toBe(d.reward!.itemTemplateId);
      expect(s.itemQty ?? (s.itemTemplateId ? 1 : undefined), d.id).toBe(d.reward!.itemQty ?? (d.reward!.itemTemplateId ? 1 : undefined));
      if (d.reward!.itemTemplateId !== undefined) expect(d.reward!.itemName, d.id).toBeTruthy();
      // The level gate the server enforces must not be easier than what the client requires…
      const clientMin = Math.max(1, ...((d.requires ?? []).filter((r) => r.type === 'level') as { min: number }[]).map((r) => r.min));
      expect(s.minLevel, d.id).toBeGreaterThanOrEqual(clientMin);
      // …and not harder either: otherwise a player could find it, read it and then be refused the reward.
      expect(clientMin, d.id).toBe(s.minLevel);
      // Rewards are the hidden part of the game.
      expect(d.hidden, d.id).toBe(true);
      if (d.reward!.itemTemplateId !== undefined && GEAR_IDS.includes(d.reward!.itemTemplateId)) {
        expect(s.minLevel, d.id).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('keeps total payout modest and rare gear to at most two', () => {
    const gold = Object.values(DISCOVERY_REWARDS).reduce((n, r) => n + (r.gold ?? 0), 0);
    const xp = Object.values(DISCOVERY_REWARDS).reduce((n, r) => n + (r.xp ?? 0), 0);
    expect(gold).toBeLessThanOrEqual(1200);
    expect(xp).toBeLessThanOrEqual(500);
    for (const [id, r] of Object.entries(DISCOVERY_REWARDS)) {
      if (r.gold !== undefined) expect(r.gold, id).toBeLessThanOrEqual(150);
      if (r.xp !== undefined) expect(r.xp, id).toBeLessThanOrEqual(80);
      if (r.itemQty !== undefined) expect(r.itemQty, id).toBeLessThanOrEqual(3);
    }
    expect(Object.values(DISCOVERY_REWARDS).filter((r) => r.itemTemplateId !== undefined && GEAR_IDS.includes(r.itemTemplateId)).length).toBeLessThanOrEqual(2);
  });

  describe('placement', () => {
    // The field's own obstacle list plus the village buildings (Ground.tsx merges the same two at runtime).
    let saved: Collider[];
    beforeAll(() => {
      saved = activeColliders.list;
      activeColliders.list = [...saved, ...villageColliders];
    });
    afterAll(() => {
      activeColliders.list = saved;
    });

    it('puts every discovery somewhere a player can actually stand and walk up to, in a real zone', () => {
      for (const d of DISCOVERIES) {
        const [x, z] = d.position;
        // Not buried in an obstacle: a player-sized circle (plus room for the prop itself) fits on the spot.
        for (const c of activeColliders.list) {
          expect(Math.hypot(x - c.x, z - c.z) - c.radius, `${d.id} vs collider at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBeGreaterThanOrEqual(PLAYER_COLLISION_RADIUS + 0.6);
        }
        // Reachable: walking straight in from 3 units away (from at least one side) ends right on it.
        const reached = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dz]) => {
          let p = { x: x + dx * 3, z: z + dz * 3 };
          for (let i = 0; i < 12; i++) p = resolveMovement(p.x, p.z, -dx * 0.25, -dz * 0.25, PLAYER_COLLISION_RADIUS);
          return Math.hypot(p.x - x, p.z - z) < 0.6;
        });
        expect(reached, d.id).toBe(true);
        expect(zoneAt(x, z), d.id).toBeTruthy();
      }
    });
  });

  it('keeps clear of NPCs, dungeon mouths, the river and each other', () => {
    const npcs = [...SHOP_NPCS.map((n) => n.position), ...QUEST_NPCS.map((n) => n.position), ...FIELD_NPC_POSITIONS];
    for (const d of DISCOVERIES) {
      const [x, z] = d.position;
      for (const [nx, nz] of npcs) expect(Math.hypot(x - nx, z - nz), `${d.id} near NPC at ${nx},${nz}`).toBeGreaterThanOrEqual(5);
      for (const [name, e] of Object.entries(DUNGEON_ENTRANCES)) {
        expect(Math.hypot(x - e.point[0], z - e.point[1]), `${d.id} near ${name}`).toBeGreaterThanOrEqual(5 + d.radius);
      }
      expect(Math.abs(x - riverXAt(z)), `${d.id} near the river`).toBeGreaterThanOrEqual(RIVER_HALF_WIDTH + 5);
      for (const o of DISCOVERIES) {
        if (o === d) continue;
        // Interaction circles must not overlap, or one would shadow the other.
        expect(Math.hypot(x - o.position[0], z - o.position[1]), `${d.id} vs ${o.id}`).toBeGreaterThan(d.radius + o.radius);
      }
    }
  });

  it('covers every region at least once', () => {
    const zones = new Set(DISCOVERIES.map((d) => zoneAt(d.position[0], d.position[1])));
    for (const z of ['village', 'desert', 'fairy', 'orc', 'bone', 'ghoul', 'field'] as const) expect(zones.has(z), z).toBe(true);
  });

  it('meets the per-region minimums from the plan', () => {
    const count = (zone: string) => DISCOVERIES.filter((d) => zoneAt(d.position[0], d.position[1]) === zone).length;
    expect(count('village')).toBeGreaterThanOrEqual(3);
    expect(count('desert')).toBeGreaterThanOrEqual(3);
    expect(count('fairy')).toBeGreaterThanOrEqual(3);
    expect(count('orc')).toBeGreaterThanOrEqual(3);
    expect(count('bone')).toBeGreaterThanOrEqual(3);
    expect(count('ghoul')).toBeGreaterThanOrEqual(3);
    expect(count('field')).toBeGreaterThanOrEqual(2);
  });
});
