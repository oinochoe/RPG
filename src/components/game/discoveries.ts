import type { NpcKind } from './NPC';
import { DISCOVERY_CONTENT } from './discoveryContent';

// Plain data — no three.js, so stores and server-table tests can read it. The reward numbers here are a
// display copy: the real amounts live in supabase/functions/api/discoveries.ts (a test keeps them equal).

export type DiscoveryKind = 'inspect' | 'npc' | 'trigger';
export type PropPreset = 'rock' | 'signpost' | 'pit' | 'mushrooms' | 'sparkle' | 'statue' | 'none';
export type ZoneName = 'village' | 'desert' | 'fairy' | 'orc' | 'bone' | 'ghoul' | 'field';

export type Requirement =
  | { type: 'level'; min: number }
  | { type: 'seen'; id: string }
  | { type: 'zone'; zone: ZoneName };

export interface DiscoveryReward {
  gold?: number;
  xp?: number;
  itemTemplateId?: number;
  /** Display copy of the server's class-specific item ids (discoveryContent.test.ts keeps them equal). */
  itemByClass?: Partial<Record<'warrior' | 'mage' | 'archer', number>>;
  /** Shown in the dialog; the server decides what is actually granted. */
  itemName?: string;
  /** Per-class name for itemByClass rewards; falls back to itemName. */
  itemNameByClass?: Partial<Record<'warrior' | 'mage' | 'archer', string>>;
  itemQty?: number;
}

export interface DiscoveryDef {
  /** Stable key, also the server table key. Lowercase letters, digits, hyphens. */
  id: string;
  kind: DiscoveryKind;
  name: string;
  position: [number, number];
  radius: number;
  prop: PropPreset;
  /** Model for an `npc` discovery (reuses NPC.tsx's kinds). */
  npcKind?: NpcKind;
  /** Hidden until found: not on the map and no sparkle hint. */
  hidden?: boolean;
  requires?: Requirement[];
  lines: string[];
  /** What it says once already seen/claimed. */
  afterLines?: string[];
  reward?: DiscoveryReward;
}

// The data lives in discoveryContent.ts, which imports only types from here (no runtime cycle).
export const DISCOVERIES: DiscoveryDef[] = DISCOVERY_CONTENT;

export function getDiscovery(id: string): DiscoveryDef | undefined {
  return DISCOVERIES.find((d) => d.id === id);
}
