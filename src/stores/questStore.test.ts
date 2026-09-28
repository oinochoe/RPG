import { describe, expect, it } from 'vitest';
import { findQuestByGiver, findQuestDef, mainQuestUnlocked } from './questStore';
import type { ActiveQuest } from '../types/api';

function quests(entries: Record<number, ActiveQuest['status']>): Record<number, ActiveQuest> {
  const result: Record<number, ActiveQuest> = {};
  for (const [id, status] of Object.entries(entries)) {
    result[Number(id)] = { quest_template_id: Number(id), status, progress_count: 0 };
  }
  return result;
}

// STORY_QUEST_IDS (1-5) isn't exported, but its contract is: the main quest (id 11, giver
// 촌장) only unlocks once every one of them is 'completed'. These tests pin that contract down
// directly, since findQuestByGiver's own internal gating had zero coverage before this.
const ALL_FIVE_COMPLETED = quests({ 1: 'completed', 2: 'completed', 3: 'completed', 4: 'completed', 5: 'completed' });

describe('mainQuestUnlocked', () => {
  it('is false with no quests accepted at all', () => {
    expect(mainQuestUnlocked({})).toBe(false);
  });

  it('is false when only some of the 5 story quests are completed', () => {
    expect(mainQuestUnlocked(quests({ 1: 'completed', 2: 'completed', 3: 'in_progress' }))).toBe(false);
  });

  it('is true once all 5 are completed', () => {
    expect(mainQuestUnlocked(ALL_FIVE_COMPLETED)).toBe(true);
  });

  it('is unaffected by unrelated quest ids (e.g. repeatable follow-ups)', () => {
    expect(mainQuestUnlocked({ ...ALL_FIVE_COMPLETED, ...quests({ 6: 'in_progress' }) })).toBe(true);
  });
});

describe('findQuestByGiver — 촌장 (the main quest gate)', () => {
  it('offers the story quest first, before anything is accepted', () => {
    expect(findQuestByGiver('촌장', {})?.id).toBe(1);
  });

  it('falls back to the repeatable once the story quest is done, even if not all 5 are', () => {
    const q = findQuestByGiver('촌장', quests({ 1: 'completed' }));
    expect(q?.id).toBe(6);
    expect(q?.isMainQuest).toBeUndefined();
  });

  it('offers the main quest once all 5 story quests are completed', () => {
    const q = findQuestByGiver('촌장', ALL_FIVE_COMPLETED);
    expect(q?.id).toBe(11);
    expect(q?.isMainQuest).toBe(true);
  });

  it('falls back to the repeatable again once the main quest is also completed', () => {
    const q = findQuestByGiver('촌장', { ...ALL_FIVE_COMPLETED, ...quests({ 11: 'completed' }) });
    expect(q?.id).toBe(6);
  });

  it('never offers the main quest while an in_progress attempt exists but is not yet completed', () => {
    // 촌장's own story quest (id 1) done, the other 4 not — main quest must stay hidden.
    const q = findQuestByGiver('촌장', quests({ 1: 'completed', 2: 'in_progress' }));
    expect(q?.isMainQuest).toBeUndefined();
  });
});

describe('findQuestByGiver — every other giver is unaffected by main-quest gating', () => {
  it('농부 never offers the main quest, even once all 5 story quests are done', () => {
    const q = findQuestByGiver('농부', ALL_FIVE_COMPLETED);
    expect(q?.isMainQuest).toBeUndefined();
    expect(q?.giverNpcName).toBe('농부');
  });

  it('a flavor NPC (빨래하는 아낙, added alongside the main quest) follows the plain story→repeatable rotation', () => {
    expect(findQuestByGiver('빨래하는 아낙', {})?.repeatable).toBe(false);
    expect(findQuestByGiver('빨래하는 아낙', quests({ 12: 'completed' }))?.repeatable).toBe(true);
  });

  it('returns undefined for an NPC with no quests at all', () => {
    expect(findQuestByGiver('여관 주인', {})).toBeUndefined();
  });
});

describe('findQuestDef', () => {
  it('finds a quest by id', () => {
    expect(findQuestDef(1)?.title).toBe('여울의 작은 꽃');
  });

  it('returns undefined for an unknown id', () => {
    expect(findQuestDef(9999)).toBeUndefined();
  });
});
