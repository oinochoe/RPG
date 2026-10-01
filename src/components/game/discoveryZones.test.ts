import { describe, expect, it } from 'vitest';
import { zoneAt } from './discoveryZones';
import {
  VILLAGES,
  DESERT_X_START,
  DESERT_X_END,
  fairyForestEdgeAt,
  orcVillageEdgeAt,
  boneFieldEdgeAt,
} from './worldColliders';

describe('zoneAt', () => {
  it('names every village centre "village"', () => {
    for (const v of VILLAGES) expect(zoneAt(v.center[0], v.center[1])).toBe('village');
  });

  it('names the desert band', () => {
    expect(zoneAt((DESERT_X_START + DESERT_X_END) / 2, 0)).toBe('desert');
  });

  it('names each outer zone well inside its edge', () => {
    expect(zoneAt(0, fairyForestEdgeAt(0) + 50)).toBe('fairy');
    expect(zoneAt(0, orcVillageEdgeAt(0) - 50)).toBe('orc');
    expect(zoneAt(boneFieldEdgeAt(0) - 50, 0)).toBe('bone');
    expect(zoneAt(DESERT_X_END + 50, 0)).toBe('ghoul');
  });

  it('is plain field in the open middle', () => {
    expect(zoneAt(40, 40)).toBe('field');
  });
});
