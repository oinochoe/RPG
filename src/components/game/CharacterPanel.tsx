import { useEffect, useState } from 'react';
import { useCombatStore, type AllocatableStat } from '../../stores/combatStore';
import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';
import { useUIStore } from '../../stores/uiStore';
import type { CharacterProfile } from '../../types/api';

const EQUIP_SLOT_LABEL: Record<string, string> = {
  weapon: '무기',
  shield: '방패',
  helmet: '투구',
  body_armor: '갑옷',
  boots: '신발',
  ring: '반지',
  necklace: '목걸이',
};

const CLASS_ACCENT: Record<CharacterProfile['character_class'], string> = {
  warrior: '#f4c430',
  mage: '#9be7ff',
  archer: '#d7f79b',
};

const STAT_ROWS: { stat: AllocatableStat; label: string; gain: string }[] = [
  { stat: 'attack', label: '공격력', gain: '+1' },
  { stat: 'defense', label: '방어력', gain: '+1' },
  { stat: 'hp', label: '최대 체력', gain: '+8' },
];

function StatRow({
  label,
  value,
  gain,
  canAllocate,
  onAllocate,
}: {
  label: string;
  value: number;
  gain: string;
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
          title={`${gain} (포인트 1 소모)`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function InventoryTab({ character }: { character: CharacterProfile }) {
  const inventory = useCharacterStore((s) => s.inventory);
  const fetchInventory = useCharacterStore((s) => s.fetchInventory);
  const equipItem = useCharacterStore((s) => s.equipItem);
  const unequipItem = useCharacterStore((s) => s.unequipItem);
  const hotbar = useCharacterStore((s) => s.hotbar);
  const setHotbarSlot = useCharacterStore((s) => s.setHotbarSlot);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    fetchInventory().catch(() => setError('인벤토리를 불러오지 못했습니다.'));
    // Only re-fetch when the panel mounts a fresh InventoryTab (i.e. reopened) — equip/unequip
    // already update the store's inventory directly, no need to react to it here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggle(item: (typeof inventory)[number]) {
    setError(null);
    setPendingId(item.id);
    try {
      if (item.is_equipped) {
        await unequipItem(item.id);
      } else {
        await equipItem(item.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.');
    } finally {
      setPendingId(null);
    }
  }

  if (inventory.length === 0) {
    return <p style={{ color: '#9aa08f', fontSize: 13, padding: '12px 4px' }}>인벤토리가 비어 있습니다.</p>;
  }

  return (
    <div>
      {error && (
        <p style={{ color: '#e0538a', fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {inventory.map((item) => {
          const equippable = item.equip_slot !== null;
          const consumable = item.heal_hp > 0;
          const levelOk = character.level >= item.required_level;
          const classOk =
            !item.required_class || item.required_class === 'all' || item.required_class === character.character_class;
          const canEquip = equippable && levelOk && classOk;
          const disabled = pendingId === item.id || (!item.is_equipped && !canEquip);
          const assignedSlot = hotbar.findIndex((id) => id === item.item_template_id);

          return (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 4px',
                borderBottom: '1px solid rgba(232, 201, 122, 0.15)',
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#f4f1e8', fontSize: 13, fontWeight: 600 }}>
                  {item.item_name}
                  {item.quantity > 1 && <span style={{ color: '#9aa08f', fontSize: 11 }}> x{item.quantity}</span>}
                  {item.is_equipped && item.equipped_slot && (
                    <span style={{ color: '#e8c97a', fontSize: 11 }}> · {EQUIP_SLOT_LABEL[item.equipped_slot] ?? item.equipped_slot}</span>
                  )}
                </div>
                <div style={{ color: '#9aa08f', fontSize: 11 }}>
                  {item.attack_bonus > 0 && `공격 +${item.attack_bonus} `}
                  {item.defense_bonus > 0 && `방어 +${item.defense_bonus} `}
                  {item.heal_hp > 0 && `체력 +${item.heal_hp} `}
                  {!levelOk && <span style={{ color: '#e0538a' }}>Lv.{item.required_level} 필요 </span>}
                  {!classOk && <span style={{ color: '#e0538a' }}>직업 제한</span>}
                </div>
              </div>
              {consumable ? (
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {Array.from({ length: HOTBAR_SIZE }).map((_, slot) => (
                    <button
                      key={slot}
                      onClick={() => setHotbarSlot(slot, assignedSlot === slot ? null : item.item_template_id)}
                      title={`단축키 ${slot + 1}에 등록`}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 5,
                        border: '1px solid #e8c97a',
                        background: assignedSlot === slot ? 'rgba(232, 201, 122, 0.35)' : 'rgba(255,255,255,0.05)',
                        color: '#e8c97a',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {slot + 1}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => handleToggle(item)}
                  disabled={disabled}
                  style={{
                    flexShrink: 0,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #e8c97a',
                    background: item.is_equipped ? 'rgba(232, 201, 122, 0.25)' : 'rgba(255,255,255,0.05)',
                    color: disabled && !item.is_equipped ? '#6a6a5f' : '#e8c97a',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: disabled ? 'default' : 'pointer',
                  }}
                >
                  {item.is_equipped ? '해제' : '장착'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CharacterPanel({ character }: { character: CharacterProfile }) {
  const isOpen = useUIStore((s) => s.isCharacterPanelOpen);
  const closeCharacterPanel = useUIStore((s) => s.closeCharacterPanel);
  const player = useCombatStore((s) => s.player);
  const allocateStat = useCombatStore((s) => s.allocateStat);
  const accent = CLASS_ACCENT[character.character_class];
  const [tab, setTab] = useState<'stats' | 'inventory'>('stats');

  if (!isOpen) return null;

  const canAllocate = player.skillPoints > 0;

  return (
    <div
      onClick={closeCharacterPanel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Same reasoning as WorldMap: beat drei <Html> nametags' distance-scaled z-index.
        zIndex: 2147483647,
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320,
          background: '#1a2a1c',
          border: `2px solid ${accent}`,
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>
            {character.name} <span style={{ color: accent }}>Lv.{player.level}</span>
          </span>
          <span style={{ color: '#9aa08f', fontSize: 12 }}>C 또는 ESC로 닫기</span>
        </div>

        <div style={{ color: '#9aa08f', fontSize: 12, marginBottom: 12 }}>
          HP {player.currentHp}/{player.maxHp} · EXP {player.experience}/{player.expToNext} · {player.gold} G
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {(['stats', 'inventory'] as const).map((t) => (
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
              {t === 'stats' ? '스탯' : '인벤토리'}
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

            <div>
              {STAT_ROWS.map(({ stat, label, gain }) => (
                <StatRow
                  key={stat}
                  label={label}
                  value={stat === 'attack' ? player.attackPower : stat === 'defense' ? player.defensePower : player.maxHp}
                  gain={gain}
                  canAllocate={canAllocate}
                  onAllocate={() => allocateStat(stat)}
                />
              ))}
            </div>
          </>
        ) : (
          <InventoryTab character={character} />
        )}
      </div>
    </div>
  );
}
