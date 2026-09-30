import { useUIStore } from '../../stores/uiStore';
import { pickupDrop } from '../../stores/lootStore';
import { triggerPickupAnim } from './playerTransform';
import { attackNearestMonster } from './engage';

/**
 * The two "context actions" the keyboard has always had — Space (talk to the NPC you're
 * standing next to) and F4 (pick up the nearest drop) — pulled out of CharacterMesh's key
 * handler so the touch action button can trigger exactly the same behavior.
 */

export type InteractKind = 'shop' | 'quest' | 'pickup';

/** What the action button would do right now (null = nothing in range). */
export function currentInteraction(): InteractKind | null {
  const ui = useUIStore.getState();
  if (ui.nearShopKind) return 'shop';
  if (ui.nearQuestNpcName) return 'quest';
  if (ui.nearDropId !== null) return 'pickup';
  return null;
}

/** Space: open the shop/quest dialogue of the NPC in range. Returns whether one opened. */
export function talkToNearby(): boolean {
  const ui = useUIStore.getState();
  if (ui.nearShopKind) {
    ui.openShop(ui.nearShopKind, ui.nearShopVillageIndex);
    return true;
  }
  if (ui.nearQuestNpcName) {
    ui.openQuest(ui.nearQuestNpcName);
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

/**
 * The touch action button: talk if an NPC is in range, otherwise pick up, otherwise attack the
 * nearest monster (monsters are tiny on a phone; tapping them precisely is unreliable).
 */
export function interact(): boolean {
  return talkToNearby() || pickupNearby() || attackNearestMonster();
}
