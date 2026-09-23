import { Suspense } from 'react';
import { NPC, type NpcKind } from './NPC';
import { fairyForestEdgeAt, orcVillageEdgeAt, boneFieldEdgeAt, DESERT_X_END } from './worldColliders';

interface FieldNpcDef {
  kind: NpcKind;
  name: string;
  position: [number, number];
  facingY?: number;
}

// Purely decorative — rendered standalone (not through Village.tsx's VillagePlaza), so these
// never enter SHOP_NPCS/QUEST_NPCS (Village.tsx builds both flat lists only from
// VILLAGE_CONFIGS' own flavorNpcs/shopNpcs). Pressing Space near one does nothing, same as
// standing near any other piece of scenery — one per new outer-ring zone (see
// worldColliders.ts's inFairyForestZone/inOrcVillageZone/inBoneFieldZone/inGhoulFieldZone) so
// each frontier reads as inhabited rather than empty, placed a few units past the curved
// zone edge so they sit clearly inside their own zone regardless of the edge's local wobble.
const FIELD_NPCS: FieldNpcDef[] = [
  { kind: 'elder', name: '숲의 은둔자', position: [0, fairyForestEdgeAt(0) + 20], facingY: Math.PI },
  { kind: 'townsman', name: '정찰병', position: [0, orcVillageEdgeAt(0) - 20] },
  { kind: 'elder', name: '무덤지기', position: [boneFieldEdgeAt(0) - 20, 0], facingY: -Math.PI / 2 },
  { kind: 'villager', name: '사막의 방랑자', position: [DESERT_X_END + 25, 0], facingY: Math.PI / 2 },
];

export function FieldNpcs() {
  return (
    <Suspense fallback={null}>
      {FIELD_NPCS.map((npc) => (
        <NPC key={npc.name} position={[npc.position[0], 0, npc.position[1]]} name={npc.name} kind={npc.kind} facingY={npc.facingY} />
      ))}
    </Suspense>
  );
}
