import { useFrame } from '@react-three/fiber';
import { playerPosition } from './playerTransform';
import { QUEST_NPCS, QUEST_INTERACT_RADIUS } from './Village';
import { useUIStore } from '../../stores/uiStore';
import { useWorldStore } from '../../stores/worldStore';

/**
 * Tracks which quest-giving flavor NPC (if any) the player is standing close enough to talk
 * to — identical shape to ShopProximity.tsx, just for QUEST_NPCS instead of SHOP_NPCS. Only
 * sets a flag; CharacterMesh's Space handler decides whether to open the quest dialogue.
 */
export function QuestProximity() {
  const currentArea = useWorldStore((s) => s.currentArea);

  useFrame(() => {
    // Quest NPCs only exist in the village (part of the field map) — skip the check
    // entirely in the dungeon rather than risk a coincidental coordinate overlap.
    if (currentArea === 'dungeon') {
      if (useUIStore.getState().nearQuestNpcName !== null) useUIStore.getState().setNearQuestNpcName(null);
      return;
    }

    const near = QUEST_NPCS.find(({ position: [x, z] }) => {
      const dx = playerPosition.x - x;
      const dz = playerPosition.z - z;
      return Math.hypot(dx, dz) < QUEST_INTERACT_RADIUS;
    });
    const name = near?.name ?? null;
    if (name !== useUIStore.getState().nearQuestNpcName) useUIStore.getState().setNearQuestNpcName(name);
  });

  return null;
}
