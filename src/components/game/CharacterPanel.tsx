import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useCombatStore, statPointCost, SKILL_BY_CLASS, SKILL_MAX_LEVEL, type AllocatableStat } from '../../stores/combatStore';
import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';
import { useUIStore } from '../../stores/uiStore';
import { EQUIP_SLOT_LABEL } from './itemLabels';
import { HOTBAR_DRAG_SKILL_MIME } from './Hotbar';
import { ItemIcon, itemRarity, RARITY_SLOT_FRAME } from './itemIcons';
import { useDraggablePanel } from './useDraggablePanel';
import type { CharacterProfile } from '../../types/api';

const PANEL_WIDTH = 320;

const CLASS_ACCENT: Record<CharacterProfile['character_class'], string> = {
  warrior: '#f4c430',
  mage: '#9be7ff',
  archer: '#d7f79b',
};

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
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 4px',
        borderBottom: '1px solid rgba(232, 201, 122, 0.15)',
      }}
    >
      <span style={{ color: '#cfe8d0', fontSize: 13 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 14, minWidth: 32, textAlign: 'right' }}>
          {value}
        </span>
        <button
          onClick={onAllocate}
          disabled={!canAllocate}
          style={{
            width: 28,
            height: 24,
            borderRadius: 6,
            border: '1px solid #e8c97a',
            background: canAllocate ? 'rgba(232, 201, 122, 0.2)' : 'rgba(255,255,255,0.05)',
            color: canAllocate ? '#e8c97a' : '#6a6a5f',
            fontWeight: 700,
            fontSize: 13,
            cursor: canAllocate ? 'pointer' : 'default',
          }}
          title={`다음 1점: ${cost} 포인트`}
        >
          +
        </button>
      </div>
    </div>
  );
}

// Paper-doll layout (Lineage1-style humanoid silhouette with slot boxes positioned around
// it) — position within a 220x300 box. Drawn with plain CSS shapes rather than an SVG/image
// asset (none available), just enough to read as a figure.
const SLOT_BOX: CSSProperties = {
  position: 'absolute',
  width: 52,
  height: 52,
  borderRadius: 8,
  border: '1px solid rgba(232, 201, 122, 0.5)',
  background: 'rgba(0, 0, 0, 0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const SLOT_LAYOUT: { slot: string; style: CSSProperties }[] = [
  { slot: 'helmet', style: { top: 0, left: '50%', transform: 'translateX(-50%)' } },
  { slot: 'necklace', style: { top: 44, left: '78%', transform: 'translateX(-50%)' } },
  { slot: 'weapon', style: { top: 120, left: 0 } },
  { slot: 'body_armor', style: { top: 120, left: '50%', transform: 'translateX(-50%)' } },
  { slot: 'shield', style: { top: 120, right: 0 } },
  { slot: 'ring', style: { top: 196, left: '22%', transform: 'translateX(-50%)' } },
  { slot: 'boots', style: { top: 196, left: '50%', transform: 'translateX(-50%)' } },
];

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
      {error && <p style={{ color: '#e0538a', fontSize: 12, marginBottom: 8 }}>{error}</p>}
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
            background: 'rgba(232, 201, 122, 0.12)',
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
            background: 'rgba(232, 201, 122, 0.08)',
          }}
        />

        {SLOT_LAYOUT.map(({ slot, style }) => {
          const item = equippedBySlot.get(slot);
          const rarityFrame = item ? RARITY_SLOT_FRAME[itemRarity(item.required_level)] : null;
          return (
            <div
              key={slot}
              style={{
                ...SLOT_BOX,
                ...style,
                backgroundImage: rarityFrame ? `url(${rarityFrame})` : undefined,
                backgroundSize: '100% 100%',
                opacity: item && pendingId === item.id ? 0.5 : 1,
              }}
              onClick={() => item && handleUnequip(item.id)}
              title={item ? item.item_name : EQUIP_SLOT_LABEL[slot]}
            >
              {item ? (
                <ItemIcon itemName={item.item_name} size={34} />
              ) : (
                <span style={{ fontSize: 10, color: 'rgba(154, 160, 143, 0.6)' }}>{EQUIP_SLOT_LABEL[slot]}</span>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ color: '#9aa08f', fontSize: 11, textAlign: 'center' }}>
        장착된 칸을 클릭하면 해제됩니다. 장착은 인벤토리(I)에서.
      </p>
    </div>
  );
}

function SkillTab({ character }: { character: CharacterProfile }) {
  const player = useCombatStore((s) => s.player);
  const upgradeSkill = useCombatStore((s) => s.upgradeSkill);
  const toggleAimSkill = useCombatStore((s) => s.toggleAimSkill);
  const isAimingSkill = useCombatStore((s) => s.isAimingSkill);
  const hotbar = useCharacterStore((s) => s.hotbar);
  const setHotbarSlot = useCharacterStore((s) => s.setHotbarSlot);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skill = SKILL_BY_CLASS[character.character_class];
  const canUpgrade = !pending && player.skillUpgradePoints > 0 && player.skillLevel < SKILL_MAX_LEVEL;
  const assignedSlot = hotbar.findIndex((a) => a?.kind === 'skill');

  async function handleUpgrade() {
    setError(null);
    setPending(true);
    try {
      await upgradeSkill();
    } catch (err) {
      setError(err instanceof Error ? err.message : '스킬 강화 중 오류가 발생했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderRadius: 8,
          background: player.skillUpgradePoints > 0 ? 'rgba(232, 201, 122, 0.15)' : 'rgba(255,255,255,0.04)',
          marginBottom: 10,
        }}
      >
        <span style={{ color: '#e8c97a', fontSize: 13, fontWeight: 700 }}>스킬 강화 포인트</span>
        <span style={{ color: '#e8c97a', fontSize: 15, fontWeight: 700 }}>{player.skillUpgradePoints}</span>
      </div>

      {error && <p style={{ color: '#e0538a', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      <div
        draggable={player.skillLevel > 0}
        onDragStart={(e) => {
          if (player.skillLevel <= 0) return;
          e.dataTransfer.setData(HOTBAR_DRAG_SKILL_MIME, 'skill');
          e.dataTransfer.effectAllowed = 'copy';
        }}
        // Double-click is the other way to arm aiming (besides the hotbar slot/number key) —
        // works even if the skill isn't registered to a slot yet, same as dragging works
        // without registering first.
        onDoubleClick={() => {
          if (player.skillLevel <= 0) return;
          toggleAimSkill();
          // Only closes the panel when it actually armed (checked after the fact, since
          // toggleAimSkill silently no-ops on cooldown/insufficient MP) — this panel sits
          // top-left with the highest z-index on the page and otherwise keeps eating clicks
          // meant for the monster the player is about to aim at.
          if (useCombatStore.getState().isAimingSkill) useUIStore.getState().closeCharacterPanel();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px',
          borderRadius: 8,
          background: isAimingSkill ? 'rgba(224, 83, 138, 0.18)' : 'rgba(255,255,255,0.04)',
          border: isAimingSkill ? '1px solid #e0538a' : '1px solid transparent',
          cursor: player.skillLevel > 0 ? 'grab' : 'default',
        }}
      >
        <div>
          <div style={{ color: '#f4f1e8', fontSize: 14, fontWeight: 700 }}>
            {skill.name} — Lv.{player.skillLevel}/{SKILL_MAX_LEVEL}
          </div>
          <div style={{ color: '#9aa08f', fontSize: 11, marginTop: 2 }}>
            MP {skill.mpCost} · 쿨다운 {skill.cooldownMs / 1000}초 · 더블클릭 후 몬스터 클릭으로 시전
          </div>
        </div>
        <button
          onClick={handleUpgrade}
          disabled={!canUpgrade}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #e8c97a',
            background: canUpgrade ? 'rgba(232, 201, 122, 0.2)' : 'rgba(255,255,255,0.05)',
            color: canUpgrade ? '#e8c97a' : '#6a6a5f',
            fontSize: 12,
            fontWeight: 700,
            cursor: canUpgrade ? 'pointer' : 'default',
            flexShrink: 0,
          }}
        >
          레벨업
        </button>
      </div>

      {player.skillLevel > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: '#9aa08f', fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>
            {assignedSlot >= 0 ? (
              <>
                단축키 <span style={{ color: '#e8c97a', fontWeight: 700 }}>{assignedSlot + 1}</span>번에 등록됨
              </>
            ) : (
              '스킬을 드래그하거나, 아래 번호를 눌러 단축키에 등록하세요.'
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: HOTBAR_SIZE }).map((_, slot) => (
              <button
                key={slot}
                onClick={() => setHotbarSlot(slot, assignedSlot === slot ? null : { kind: 'skill' })}
                style={{
                  flex: 1,
                  height: 24,
                  borderRadius: 5,
                  border: '1px solid #e8c97a',
                  background: assignedSlot === slot ? 'rgba(232, 201, 122, 0.35)' : 'rgba(255,255,255,0.05)',
                  color: '#e8c97a',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {slot + 1}
              </button>
            ))}
          </div>
        </div>
      )}
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
  const { position, onHeaderMouseDown } = useDraggablePanel(() => ({
    x: 16,
    y: Math.max(16, window.innerHeight / 2 - 140),
  }));

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
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: PANEL_WIDTH,
        background: '#1a2a1c',
        border: `2px solid ${accent}`,
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        zIndex: 2147483647,
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>
          {character.name} <span style={{ color: accent }}>Lv.{player.level}</span>
        </span>
        <button
          onClick={closeCharacterPanel}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9aa08f',
            fontSize: 16,
            cursor: 'pointer',
            lineHeight: 1,
            padding: 2,
          }}
          title="닫기 (C 또는 ESC)"
        >
          ✕
        </button>
      </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {(['stats', 'equipment', 'skill'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 6,
                border: `1px solid ${tab === t ? accent : 'rgba(232, 201, 122, 0.25)'}`,
                background: tab === t ? 'rgba(232, 201, 122, 0.15)' : 'transparent',
                color: tab === t ? '#e8c97a' : '#9aa08f',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t === 'stats' ? '스탯' : t === 'equipment' ? '장비' : '스킬'}
            </button>
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
                background: canAllocate ? 'rgba(232, 201, 122, 0.15)' : 'rgba(255,255,255,0.04)',
                marginBottom: 8,
              }}
            >
              <span style={{ color: '#e8c97a', fontSize: 13, fontWeight: 700 }}>스킬 포인트</span>
              <span style={{ color: '#e8c97a', fontSize: 15, fontWeight: 700 }}>{player.skillPoints}</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 4,
                padding: '6px 10px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                marginBottom: 10,
                fontSize: 12,
                color: '#cfe8d0',
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
    </div>
  );
}
