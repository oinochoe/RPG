import { useState } from 'react';
import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';
import { useCombatStore, SKILL_BY_CLASS } from '../../stores/combatStore';

// Custom mime type for the drag payload (an item_template_id) — namespaced so it never
// collides with a browser default type or an unrelated drag source on the page. Set by a
// consumable GridCell in InventoryPanel.tsx; read here to assign a slot.
export const HOTBAR_DRAG_MIME = 'application/x-rpg-item-template-id';

// A separate mime type (rather than reusing HOTBAR_DRAG_MIME with a sentinel payload) since
// there's only ever one skill to drag — no id to carry, and checking `dataTransfer.types`
// for this type's presence is all a drop handler needs. Set by the draggable skill card in
// CharacterPanel.tsx's SkillTab.
export const HOTBAR_DRAG_SKILL_MIME = 'application/x-rpg-hotbar-skill';

/**
 * Quickbar for consumables and the class skill — 6 slots, keys 1-6 (wired in GamePage's
 * keydown handler). Assignments are session-local only (see characterStore's hotbar field).
 * A slot can be filled two ways — whichever the player prefers — both driven from wherever
 * the thing being assigned lives (InventoryPanel for items, CharacterPanel's skill tab for
 * the skill): drag onto a slot here, or click a numbered register button there. Clearing a
 * slot is deliberately right-click-only (not drag-out) — an earlier version also cleared a
 * slot when its item was dragged out and released outside the bar, but that made an
 * accidental drag (e.g. a slightly-off click) silently wipe the assignment, so it was
 * removed per feedback; right-click is a clearer, harder-to-trigger-by-accident gesture.
 * Positioned by its parent (HUD.tsx, next to the status bar) rather than self-positioning,
 * so the two form one visual unit at the bottom of the screen.
 */
export function Hotbar() {
  const hotbar = useCharacterStore((s) => s.hotbar);
  const hotbarPending = useCharacterStore((s) => s.hotbarPending);
  const inventory = useCharacterStore((s) => s.inventory);
  const useHotbarSlot = useCharacterStore((s) => s.useHotbarSlot);
  const setHotbarSlot = useCharacterStore((s) => s.setHotbarSlot);
  const player = useCombatStore((s) => s.player);
  const toggleAimSkill = useCombatStore((s) => s.toggleAimSkill);
  const isAimingSkill = useCombatStore((s) => s.isAimingSkill);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const skill = SKILL_BY_CLASS[player.characterClass];

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {Array.from({ length: HOTBAR_SIZE }).map((_, i) => {
        const assignment = hotbar[i];
        const isSkill = assignment?.kind === 'skill';
        const itemTemplateId = assignment?.kind === 'item' ? assignment.itemTemplateId : null;
        const row = itemTemplateId != null ? inventory.find((item) => item.item_template_id === itemTemplateId) : null;
        const quantity = row?.quantity ?? 0;
        // Cooldown isn't ticked per-frame here, so this only becomes accurate again within
        // ~1s of actually expiring (the next re-render this component gets, e.g. from
        // MpRegenTicker's once-a-second tick) — fine for a dimming indicator on a multi-
        // second cooldown, and it matches toggleAimSkill's own guard so the slot never shows
        // "ready" when arming would actually be refused.
        const onCooldown = isSkill && performance.now() < player.skillCooldownUntil;
        const usable = isSkill
          ? player.skillLevel > 0 && player.currentMp >= skill.mpCost && !onCooldown
          : !!row && quantity > 0 && !hotbarPending[i];
        const isDragTarget = dragOverSlot === i;
        const isArmed = isSkill && isAimingSkill;
        const title = isSkill
          ? onCooldown
            ? `${skill.name} — 쿨다운 중`
            : isArmed
              ? `${skill.name} — 몬스터를 클릭해 시전 (다시 누르면 취소)`
              : `${skill.name} — 눌러서 조준, 몬스터를 클릭해 시전`
          : row
            ? `${row.item_name} — 우클릭으로 해제`
            : '드래그하거나 번호를 눌러 등록';
        return (
          <button
            key={i}
            // Deliberately NOT using the `disabled` attribute here (even though an empty
            // slot or a used-up one shouldn't be clickable) — disabled form controls also
            // stop receiving real browser drag/drop pointer interaction in most engines, so
            // an "empty, therefore disabled" slot would silently refuse to accept a drop
            // from a real mouse drag. The click-to-use guard just lives in the handler.
            onClick={() => {
              // toggleAimSkill has its own usability guard (and always allows turning aim
              // back off), so skill slots skip the local `usable` check entirely here.
              if (isSkill) toggleAimSkill();
              else if (usable) useHotbarSlot(i);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (assignment != null) setHotbarSlot(i, null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (dragOverSlot !== i) setDragOverSlot(i);
            }}
            onDragLeave={() => setDragOverSlot((s) => (s === i ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverSlot(null);
              if (e.dataTransfer.types.includes(HOTBAR_DRAG_SKILL_MIME)) {
                setHotbarSlot(i, { kind: 'skill' });
                return;
              }
              const raw = e.dataTransfer.getData(HOTBAR_DRAG_MIME);
              const id = Number(raw);
              if (raw && Number.isInteger(id)) setHotbarSlot(i, { kind: 'item', itemTemplateId: id });
            }}
            title={title}
            style={{
              pointerEvents: 'auto',
              width: 52,
              height: 52,
              borderRadius: 8,
              border: `1px solid ${isArmed ? '#e0538a' : isDragTarget ? '#e8c97a' : 'rgba(232, 201, 122, 0.5)'}`,
              boxShadow: isArmed ? '0 0 8px rgba(224, 83, 138, 0.7)' : 'none',
              background: isDragTarget ? 'rgba(232, 201, 122, 0.25)' : 'rgba(15, 17, 13, 0.65)',
              color: usable ? '#f4f1e8' : '#5c6058',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: usable ? 'pointer' : 'default',
              position: 'relative',
              padding: 0,
            }}
          >
            <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 10, color: '#9aa08f' }}>{i + 1}</span>
            {isSkill ? (
              <>
                <span style={{ fontSize: 10, lineHeight: 1.2, textAlign: 'center', padding: '0 2px' }}>
                  {skill.name}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#9be7ff' }}>MP {skill.mpCost}</span>
              </>
            ) : row ? (
              <>
                <span style={{ fontSize: 10, lineHeight: 1.2, textAlign: 'center', padding: '0 2px' }}>
                  {row.item_name}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#e8c97a' }}>{quantity}</span>
              </>
            ) : (
              <span style={{ fontSize: 10, color: '#5c6058' }}>빈 슬롯</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
