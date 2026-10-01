import { describe, expect, it } from 'vitest';
import { PART_KINDS } from './skillFxLife';
import { PART_RENDERERS } from './skillFxParts';

describe('PART_RENDERERS', () => {
  it('has a renderer for every part kind, so no skill definition can reference something that draws nothing', () => {
    for (const kind of PART_KINDS) expect(PART_RENDERERS[kind], kind).toBeTypeOf('function');
  });
});
