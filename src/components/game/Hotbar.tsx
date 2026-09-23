import { useState, type DragEvent } from 'react';
import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';
import { useCombatStore, findSkillDef, type SkillDef } from '../../stores/combatStore';
import { useTooltip } from './Tooltip';
import { ItemIcon } from './itemIcons';
import type { InventorySlot } from '../../types/api';

// Custom mime type for the drag payload (an item_template_id) — namespaced so it never
// collides with a browser default type or an unrelated drag source on the page. Set by a
// consumable GridCell in InventoryPanel.tsx; read here to assign a slot.
export const HOTBAR_DRAG_MIME = 'application/x-rpg-item-template-id';

// A separate mime type from HOTBAR_DRAG_MIME (rather than one shared "assignable thing"
// type) so a drop handler can tell a skill drag from an item drag before even reading the
// payload — the payload itself is the skill's skill_template_id (a class now has 3 skills,
// see SKILLS_BY_CLASS, so there's an id to carry). Set by the draggable skill card in
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
  const armedSkillId = useCombatStore((s) => s.armedSkillId);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

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
        const skill = assignment?.kind === 'skill' ? findSkillDef(player.characterClass, assignment.skillTemplateId) : undefined;
        const itemTemplateId = assignment?.kind === 'item' ? assignment.itemTemplateId : null;
        const row = itemTemplateId != null ? inventory.find((item) => item.item_template_id === itemTemplateId) : null;
        return (
          <HotbarSlot
            key={i}
            index={i}
            skill={skill}
            row={row ?? null}
            hotbarPending={hotbarPending[i]}
            isDragTarget={dragOverSlot === i}
            armedSkillId={armedSkillId}
            currentMp={player.currentMp}
            skillLevel={skill ? player.skillLevels[skill.id] ?? 0 : 0}
            skillCooldownUntil={skill ? player.skillCooldowns[skill.id] ?? 0 : 0}
            onUse={() => {
              // toggleAimSkill has its own usability guard (and always allows turning aim
              // back off), so skill slots skip the local `usable` check entirely there.
              if (skill) toggleAimSkill(skill.id);
              else useHotbarSlot(i);
            }}
            onClear={() => {
              if (assignment != null) setHotbarSlot(i, null);
            }}
            onDragOver={() => setDragOverSlot(i)}
            onDragLeave={() => setDragOverSlot((s) => (s === i ? null : s))}
            onDrop={(e) => {
              const skillRaw = e.dataTransfer.getData(HOTBAR_DRAG_SKILL_MIME);
              const skillId = Number(skillRaw);
              if (skillRaw && Number.isInteger(skillId)) {
                setHotbarSlot(i, { kind: 'skill', skillTemplateId: skillId });
                return;
              }
              const raw = e.dataTransfer.getData(HOTBAR_DRAG_MIME);
              const id = Number(raw);
              if (raw && Number.isInteger(id)) setHotbarSlot(i, { kind: 'item', itemTemplateId: id });
            }}
          />
        );
      })}
    </div>
  );
}

function HotbarSlot({
  index,
  skill,
  row,
  hotbarPending,
  isDragTarget,
  armedSkillId,
  currentMp,
  skillLevel,
  skillCooldownUntil,
  onUse,
  onClear,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  index: number;
  skill: SkillDef | undefined;
  row: InventorySlot | null;
  hotbarPending: boolean;
  isDragTarget: boolean;
  armedSkillId: number | null;
  currentMp: number;
  skillLevel: number;
  skillCooldownUntil: number;
  onUse: () => void;
  onClear: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLButtonElement>) => void;
}) {
  const quantity = row?.quantity ?? 0;
  // Cooldown isn't ticked per-frame here, so this only becomes accurate again within ~1s of
  // actually expiring (the next re-render this component gets, e.g. from MpRegenTicker's
  // once-a-second tick) — fine for a dimming indicator on a multi-second cooldown, and it
  // matches toggleAimSkill's own guard so the slot never shows "ready" when arming would
  // actually be refused.
  const onCooldown = !!skill && performance.now() < skillCooldownUntil;
  const usable = skill ? skillLevel > 0 && currentMp >= skill.mpCost && !onCooldown : !!row && quantity > 0 && !hotbarPending;
  const isArmed = !!skill && armedSkillId === skill.id;
  const label = skill
    ? onCooldown
      ? `${skill.name} — 쿨다운 중`
      : isArmed
        ? `${skill.name} — 몬스터를 클릭해 시전 (다시 누르면 취소)`
        : `${skill.name} — 눌러서 조준, 몬스터를 클릭해 시전`
    : row
      ? `${row.item_name} — 우클릭으로 해제`
      : '드래그하거나 번호를 눌러 등록';
  const { handlers: tooltipHandlers, tooltip } = useTooltip(label);

  return (
    <button
      // Deliberately NOT using the `disabled` attribute here (even though an empty slot or a
      // used-up one shouldn't be clickable) — disabled form controls also stop receiving real
      // browser drag/drop pointer interaction in most engines, so an "empty, therefore
      // disabled" slot would silently refuse to accept a drop from a real mouse drag. The
      // click-to-use guard just lives in the handler.
      onClick={() => {
        if (skill) onUse();
        else if (usable) onUse();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onClear();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(e);
      }}
      {...tooltipHandlers}
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
      <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 10, color: '#9aa08f' }}>{index + 1}</span>
      {skill ? (
        <>
          <span style={{ fontSize: 10, lineHeight: 1.2, textAlign: 'center', padding: '0 2px' }}>{skill.name}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#9be7ff' }}>MP {skill.mpCost}</span>
        </>
      ) : row ? (
        <>
          <ItemIcon itemName={row.item_name} size={32} />
          <span style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 10, fontWeight: 700, color: '#e8c97a' }}>
            {quantity}
          </span>
        </>
      ) : (
        <span style={{ fontSize: 10, color: '#5c6058' }}>빈 슬롯</span>
      )}
      {tooltip}
    </button>
  );
}
