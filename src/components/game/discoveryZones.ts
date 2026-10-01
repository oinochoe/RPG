import {
  inVillageClearZone,
  inFairyForestZone,
  inOrcVillageZone,
  inBoneFieldZone,
  inGhoulFieldZone,
  inDesertZone,
} from './worldColliders';
import type { ZoneName } from './discoveries';

/**
 * Which named zone a ground point is in (the same names discoveries' `zone` requirements use).
 * Order matters where zones overlap: villages win, then the outer bands (their corners can overlap
 * the desert strip or each other; fairy/orc are checked before bone so a shared corner reads as
 * the forest/orc side), then ghoul, then desert, otherwise plain field.
 */
export function zoneAt(x: number, z: number): ZoneName {
  if (inVillageClearZone(x, z)) return 'village';
  if (inFairyForestZone(x, z)) return 'fairy';
  if (inOrcVillageZone(x, z)) return 'orc';
  if (inBoneFieldZone(x, z)) return 'bone';
  if (inGhoulFieldZone(x)) return 'ghoul';
  if (inDesertZone(x)) return 'desert';
  return 'field';
}
