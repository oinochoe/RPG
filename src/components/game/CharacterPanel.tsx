import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  useCombatStore,
  statPointCost,
  skillDamageMultiplier,
  SKILLS_BY_CLASS,
  SKILL_MAX_LEVEL,
  type AllocatableStat,
  type SkillDef,
} from '../../stores/combatStore';
import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';
import { useUIStore } from '../../stores/uiStore';
import { EQUIP_SLOT_LABEL } from './itemLabels';
import { HOTBAR_DRAG_SKILL_MIME } from './Hotbar';
import { ItemIcon } from './itemIcons';
import { useTooltip } from './Tooltip';
import { useDraggablePanel } from './useDraggablePanel';
import { CLASS_ACCENT } from './classAccent';
import { Button } from '../ui/button';
import { GamePanel } from '../ui/game-panel';
import { IconButton } from '../ui/icon-button';
import { Slot } from '../ui/slot';
import { cn } from '../../lib/utils';
import { useIsTouch } from '../../lib/device';
import type { CharacterProfile, InventorySlot } from '../../types/api';

const PANEL_WIDTH = 320;

const STAT_ROWS: { stat: AllocatableStat; label: string }[] = [
  { stat: 'str', label: 'STR (힘)' },
  { stat: 'dex', label: 'DEX (민첩)' },
  { stat: 'con', label: 'CON (체력)' },
  { stat: 'int', label: 'INT (지식)' },
  { stat: 'wis', label: 'WIS (정신력)' },
];

function StatRow({
  label,
  value,
  cost,
  canAllocate,
  onAllocate,
}: {
  label: string;
  value: number;
  cost: number;
  canAllocate: boolean;
  onAllocate: () => void;
}) {
  const { handlers: tooltipHandlers, tooltip } = useTooltip(`다음 1점: ${cost} 포인트`);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 4px',
        borderBottom: '2px solid rgb(139 106 70 / 0.15)',
      }}
    >
      <span style={{ color: 'var(--color-ink)', fontSize: 13 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--color-ink)', fontWeight: 700, fontSize: 14, minWidth: 32, textAlign: 'right' }}>
          {value}
        </span>
        <IconButton
          label={`${label} 포인트 올리기`}
          size="sm"
          className={cn('relative', canAllocate ? 'bg-gradient-to-b from-[#ffd970] to-gold' : '')}
          onClick={onAllocate}
          disabled={!canAllocate}
          {...tooltipHandlers}
        >
          +
          {tooltip}
        </IconButton>
      </div>
    </div>
  );
}

// Paper-doll layout (Lineage1-style humanoid silhouette with slot boxes positioned around
// it) — position within a 220x300 box. Drawn with plain CSS shapes rather than an SVG/image
// asset (none available), just enough to read as a figure.
const SLOT_LAYOUT: { slot: string; style: CSSProperties }[] = [
  { slot: 'helmet', style: { top: 0, left: '50%', transform: 'translateX(-50%)' } },
  { slot: 'necklace', style: { top: 44, left: '78%', transform: 'translateX(-50%)' } },
  { slot: 'weapon', style: { top: 120, left: 0 } },
  { slot: 'body_armor', style: { top: 120, left: '50%', transform: 'translateX(-50%)' } },
  { slot: 'shield', style: { top: 120, right: 0 } },
  { slot: 'ring', style: { top: 196, left: '22%', transform: 'translateX(-50%)' } },
  { slot: 'boots', style: { top: 196, left: '50%', transform: 'translateX(-50%)' } },
];

function EquipmentSlotBox({
  slot,
  style,
  item,
  pending,
  onClick,
}: {
  slot: string;
  style: CSSProperties;
  item: InventorySlot | undefined;
  pending: boolean;
  onClick: () => void;
}) {
  const { handlers: tooltipHandlers, tooltip } = useTooltip(item ? item.item_name : EQUIP_SLOT_LABEL[slot]);
  return (
    <Slot
      size={52}
      className="absolute"
      style={{ ...style, opacity: item && pending ? 0.5 : 1 }}
      onClick={onClick}
      {...tooltipHandlers}
    >
      {item ? (
        <ItemIcon itemName={item.item_name} size={34} />
      ) : (
        <span className="text-[11px] font-bold text-ink-soft">{EQUIP_SLOT_LABEL[slot]}</span>
      )}
      {tooltip}
    </Slot>
  );
}

function EquipmentTab() {
  const inventory = useCharacterStore((s) => s.inventory);
  const fetchInventory = useCharacterStore((s) => s.fetchInventory);
  const unequipItem = useCharacterStore((s) => s.unequipItem);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    fetchInventory().catch(() => setError('장비 정보를 불러오지 못했습니다.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnequip(inventoryId: number) {
    setError(null);
    setPendingId(inventoryId);
    try {
      await unequipItem(inventoryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '해제 중 오류가 발생했습니다.');
    } finally {
      setPendingId(null);
    }
  }

  const equippedBySlot = new Map(inventory.filter((item) => item.is_equipped).map((item) => [item.equipped_slot, item]));

  return (
    <div>
      {error && <p style={{ color: 'var(--color-danger-ink)', fontSize: 12, marginBottom: 8 }}>{error}</p>}
      <div style={{ position: 'relative', width: 220, height: 250, margin: '4px auto 8px' }}>
        {/* Humanoid silhouette backdrop, purely decorative */}
        <div
          style={{
            position: 'absolute',
            top: 44,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'rgb(245 184 51 / 0.35)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 70,
            height: 130,
            borderRadius: '18px 18px 10px 10px',
            background: 'rgb(245 184 51 / 0.35)',
          }}
        />

        {SLOT_LAYOUT.map(({ slot, style }) => (
          <EquipmentSlotBox
            key={slot}
            slot={slot}
            style={style}
            item={equippedBySlot.get(slot)}
            pending={equippedBySlot.get(slot)?.id === pendingId}
            onClick={() => {
              const item = equippedBySlot.get(slot);
              if (item) handleUnequip(item.id);
            }}
          />
        ))}
      </div>
      <p style={{ color: 'var(--color-ink-soft)', fontSize: 12, textAlign: 'center' }}>
        장착된 칸을 클릭하면 해제됩니다. 장착은 인벤토리(I)에서.
      </p>
    </div>
  );
}

function SkillCard({ skill, character }: { skill: SkillDef; character: CharacterProfile }) {
  const player = useCombatStore((s) => s.player);
  const upgradeSkill = useCombatStore((s) => s.upgradeSkill);
  const toggleAimSkill = useCombatStore((s) => s.toggleAimSkill);
  const armedSkillId = useCombatStore((s) => s.armedSkillId);
  const hotbar = useCharacterStore((s) => s.hotbar);
  const setHotbarSlot = useCharacterStore((s) => s.setHotbarSlot);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skillLevel = player.skillLevels[skill.id] ?? 0;
  const levelLocked = character.level < skill.requiredLevel;
  const canUpgrade = !pending && !levelLocked && player.skillUpgradePoints > 0 && skillLevel < SKILL_MAX_LEVEL;
  const isTouch = useIsTouch();
  const learned = skillLevel > 0;
  // Previews at level 1 while unlearned (rather than hiding the number entirely) so a
  // player deciding whether to spend a point can see roughly what they're buying — matches
  // castSkill's actual formula (attackPower * multiplier * a 0.8~1.2 variance band).
  const previewMultiplier = skillDamageMultiplier(skill.baseDamageMultiplier, Math.max(skillLevel, 1));
  const dmgMin = Math.round(player.attackPower * previewMultiplier * 0.8);
  const dmgMax = Math.round(player.attackPower * previewMultiplier * 1.2);
  const isArmed = armedSkillId === skill.id;
  const assignedSlot = hotbar.findIndex((a) => a?.kind === 'skill' && a.skillTemplateId === skill.id);

  async function handleUpgrade() {
    setError(null);
    setPending(true);
    try {
      await upgradeSkill(skill.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '스킬 강화 중 오류가 발생했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {error && <p style={{ color: 'var(--color-danger-ink)', fontSize: 12, marginBottom: 4 }}>{error}</p>}
      <div
        draggable={learned && !isTouch}
        onDragStart={(e) => {
          if (!learned) return;
          e.dataTransfer.setData(HOTBAR_DRAG_SKILL_MIME, String(skill.id));
          e.dataTransfer.effectAllowed = 'copy';
        }}
        // Double-click is the other way to arm aiming (besides the hotbar slot/number key) —
        // works even if the skill isn't registered to a slot yet, same as dragging works
        // without registering first.
        onDoubleClick={() => {
          if (!learned) return;
          toggleAimSkill(skill.id);
          // Only closes the panel when it actually armed (checked after the fact, since
          // toggleAimSkill silently no-ops on cooldown/insufficient MP) — this panel sits
          // top-left with the highest z-index on the page and otherwise keeps eating clicks
          // meant for the monster the player is about to aim at.
          if (useCombatStore.getState().armedSkillId === skill.id) useUIStore.getState().closeCharacterPanel();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px',
          borderRadius: 8,
          background: isArmed ? 'rgb(201 52 80 / 0.18)' : 'rgb(58 46 42 / 0.07)',
          border: isArmed ? '2px solid var(--color-danger)' : '1px solid transparent',
          opacity: levelLocked ? 0.5 : 1,
          cursor: learned ? 'grab' : 'default',
        }}
      >
        <div>
          <div style={{ color: 'var(--color-ink)', fontSize: 14, fontWeight: 700 }}>
            {skill.name}
            {skill.type === 'aoe' && (
              <span style={{ color: 'var(--color-violet-ink)', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>범위</span>
            )}
            {' — '}Lv.{skillLevel}/{SKILL_MAX_LEVEL}
          </div>
          <div style={{ color: 'var(--color-ink-soft)', fontSize: 12, marginTop: 2 }}>
            {levelLocked
              ? `Lv.${skill.requiredLevel} 필요 · 피해 ${dmgMin}~${dmgMax}${skill.type === 'aoe' ? ' (범위)' : ''}`
              : `MP ${skill.mpCost} · 쿨다운 ${skill.cooldownMs / 1000}초 · 피해 ${dmgMin}~${dmgMax}${skill.type === 'aoe' ? ` · 범위 ${skill.aoeRadius}` : ''} · 더블클릭 후 몬스터 클릭으로 시전`}
          </div>
        </div>
        <Button size="sm" variant={canUpgrade ? 'primary' : 'ghost'} className="shrink-0" onClick={handleUpgrade} disabled={!canUpgrade}>
          레벨업
        </Button>
      </div>

      {learned && (
        <div style={{ marginTop: 6 }}>
          <div style={{ color: 'var(--color-ink-soft)', fontSize: 11, lineHeight: 1.4, marginBottom: 4 }}>
            {assignedSlot >= 0 ? (
              <>
                단축키 <span style={{ color: 'var(--color-gold-ink)', fontWeight: 700 }}>{assignedSlot + 1}</span>번에 등록됨
              </>
            ) : (
              '드래그하거나 아래 번호를 눌러 단축키에 등록하세요.'
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: HOTBAR_SIZE }).map((_, slot) => (
              <Button
                key={slot}
                variant={assignedSlot === slot ? 'primary' : 'ghost'}
                size="sm"
                className="h-7 flex-1 px-0 text-xs"
                onClick={() =>
                  setHotbarSlot(slot, assignedSlot === slot ? null : { kind: 'skill', skillTemplateId: skill.id })
                }
              >
                {slot + 1}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkillTab({ character }: { character: CharacterProfile }) {
  const player = useCombatStore((s) => s.player);
  const skills = SKILLS_BY_CLASS[character.character_class];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderRadius: 8,
          background: player.skillUpgradePoints > 0 ? 'rgb(245 184 51 / 0.35)' : 'rgb(58 46 42 / 0.07)',
          marginBottom: 10,
        }}
      >
        <span style={{ color: 'var(--color-gold-ink)', fontSize: 13, fontWeight: 700 }}>스킬 강화 포인트</span>
        <span style={{ color: 'var(--color-gold-ink)', fontSize: 15, fontWeight: 700 }}>{player.skillUpgradePoints}</span>
      </div>

      {skills.map((skill) => (
        <SkillCard key={skill.id} skill={skill} character={character} />
      ))}
    </div>
  );
}

export function CharacterPanel({ character }: { character: CharacterProfile }) {
  const isOpen = useUIStore((s) => s.isCharacterPanelOpen);
  const closeCharacterPanel = useUIStore((s) => s.closeCharacterPanel);
  const player = useCombatStore((s) => s.player);
  const allocateStat = useCombatStore((s) => s.allocateStat);
  const accent = CLASS_ACCENT[character.character_class];
  const [tab, setTab] = useState<'stats' | 'equipment' | 'skill'>('stats');
  // Default anchor matches the old fixed left/top-centered position, expressed as plain
  // pixel coordinates so dragging can move it freely afterward — see useDraggablePanel.
  const { frameStyle, onHeaderPointerDown } = useDraggablePanel(() => ({
    x: 16,
    y: Math.max(16, window.innerHeight / 2 - 140),
  }), PANEL_WIDTH);

  // Jumps to the skill tab whenever K asks for it (see openSkillTab) — skipping the run
  // that fires on mount, since the counter's value at that point reflects whatever request
  // happened before this component existed, not a real one just now.
  const skillTabRequestId = useUIStore((s) => s.skillTabRequestId);
  const skipInitialSkillTabRequest = useRef(true);
  useEffect(() => {
    if (skipInitialSkillTabRequest.current) {
      skipInitialSkillTabRequest.current = false;
      return;
    }
    setTab('skill');
  }, [skillTabRequestId]);

  if (!isOpen) return null;

  const canAllocate = player.skillPoints > 0;

  const statValue: Record<AllocatableStat, number> = {
    str: player.statStr,
    dex: player.statDex,
    con: player.statCon,
    int: player.statInt,
    wis: player.statWis,
  };

  return (
    // Docked near the left by default (인벤토리 docks near the right — see InventoryPanel)
    // rather than a centered modal with a dismiss-on-outside-click backdrop, so the two can
    // be open side by side; draggable via the header, see useDraggablePanel.
    <GamePanel
      title={
        <>
          {character.name} <span style={{ color: accent }}>Lv.{player.level}</span>
        </>
      }
      onClose={closeCharacterPanel}
      frameStyle={frameStyle}
      onHeaderPointerDown={onHeaderPointerDown}
      className="z-[2147483647]"
    >
      <div className="mb-3 flex gap-2">
        {(['stats', 'equipment', 'skill'] as const).map((t) => (
          <Button key={t} variant={tab === t ? 'primary' : 'ghost'} size="sm" className="flex-1" onClick={() => setTab(t)}>
            {t === 'stats' ? '스탯' : t === 'equipment' ? '장비' : '스킬'}
          </Button>
        ))}
      </div>

        {tab === 'stats' ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: 8,
                background: canAllocate ? 'rgb(245 184 51 / 0.35)' : 'rgb(58 46 42 / 0.07)',
                marginBottom: 8,
              }}
            >
              <span style={{ color: 'var(--color-gold-ink)', fontSize: 13, fontWeight: 700 }}>스킬 포인트</span>
              <span style={{ color: 'var(--color-gold-ink)', fontSize: 15, fontWeight: 700 }}>{player.skillPoints}</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 4,
                padding: '6px 10px',
                borderRadius: 8,
                background: 'rgb(58 46 42 / 0.07)',
                marginBottom: 10,
                fontSize: 12,
                color: 'var(--color-ink)',
              }}
            >
              <span>공격력 {player.attackPower}</span>
              <span>방어력 {player.defensePower}</span>
              <span>최대체력 {player.maxHp}</span>
              <span>최대마나 {player.maxMp}</span>
            </div>

            <div>
              {STAT_ROWS.map(({ stat, label }) => {
                const value = statValue[stat];
                const cost = statPointCost(value);
                return (
                  <StatRow
                    key={stat}
                    label={label}
                    value={value}
                    cost={cost}
                    canAllocate={player.skillPoints >= cost}
                    onAllocate={() => allocateStat(stat)}
                  />
                );
              })}
            </div>
          </>
        ) : tab === 'equipment' ? (
          <EquipmentTab />
        ) : (
          <SkillTab character={character} />
        )}
    </GamePanel>
  );
}
