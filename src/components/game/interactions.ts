import { useUIStore } from '../../stores/uiStore';
import { pickupDrop } from '../../stores/lootStore';
import { playerPosition, triggerPickupAnim } from './playerTransform';
import { clearMoveTarget, setTalkMoveTarget, type TalkTarget } from './moveTarget';
import { attackNearestMonster } from './engage';

/**
 * The two "context actions" the keyboard has always had — Space (talk to the NPC you're
 * standing next to) and F4 (pick up the nearest drop) — pulled out of CharacterMesh's key
 * handler so the touch action button can trigger exactly the same behavior.
 */

export type InteractKind = 'shop' | 'quest' | 'discovery' | 'pickup';

/** What the action button would do right now (null = nothing in range). */
export function currentInteraction(): InteractKind | null {
  const ui = useUIStore.getState();
  if (ui.nearShopKind) return 'shop';
  if (ui.nearQuestNpcName) return 'quest';
  if (ui.nearDiscoveryId) return 'discovery';
  if (ui.nearDropId !== null) return 'pickup';
  return null;
}

/** Space: open the shop/quest dialogue of the NPC in range. Returns whether one opened. */
export function talkToNearby(): boolean {
  const ui = useUIStore.getState();
  // The discovery dialog uses Space to advance; don't reopen/restart it (or swap panels) underneath.
  if (ui.discoveryDialogId) return true;
  if (ui.nearShopKind) {
    ui.openShop(ui.nearShopKind, ui.nearShopVillageIndex);
    return true;
  }
  if (ui.nearQuestNpcName) {
    ui.openQuest(ui.nearQuestNpcName);
    return true;
  }
  if (ui.nearDiscoveryId) {
    ui.openDiscovery(ui.nearDiscoveryId);
    return true;
  }
  return false;
}

/** F4: pick up the nearest drop in range. Returns whether there was one to try. */
export function pickupNearby(): boolean {
  const dropId = useUIStore.getState().nearDropId;
  if (dropId === null) return false;
  pickupDrop(dropId).then((ok) => {
    if (ok) triggerPickupAnim();
  });
  return true;
}

// Standing this close counts as "next to" an NPC — matches the proximity radius Space uses.
const TALK_RANGE = 2.4;
// Where the player stops when walking up to an NPC that was clicked from farther away.
const TALK_STANDOFF = 1.6;

/** Open the dialogue of an NPC (their shop, or their quest). */
export function openTalk(target: TalkTarget): void {
  const ui = useUIStore.getState();
  if (target.type === 'shop') ui.openShop(target.kind, target.villageIndex);
  else if (target.type === 'discovery') ui.openDiscovery(target.id);
  else ui.openQuest(target.name);
}

/**
 * Clicking (tapping) an NPC: talk right away if already next to them, otherwise walk up and talk on
 * arrival. `npc` is the NPC's ground position (x, z).
 */
export function clickToTalk(target: TalkTarget, npc: [number, number]): void {
  const dx = playerPosition.x - npc[0];
  const dz = playerPosition.z - npc[1];
  const dist = Math.hypot(dx, dz) || 1;
  if (dist <= TALK_RANGE) {
    clearMoveTarget();
    openTalk(target);
    return;
  }
  setTalkMoveTarget(npc[0] + (dx / dist) * TALK_STANDOFF, npc[1] + (dz / dist) * TALK_STANDOFF, target);
}

/**
 * The touch action button: talk if an NPC is in range, otherwise pick up, otherwise attack the
 * nearest monster (monsters are tiny on a phone; tapping them precisely is unreliable).
 */
export function interact(): boolean {
  return talkToNearby() || pickupNearby() || attackNearestMonster();
}
