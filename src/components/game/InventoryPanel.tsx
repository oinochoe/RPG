import { useEffect, useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';
import { useUIStore } from '../../stores/uiStore';
import { EQUIP_SLOT_LABEL } from './itemLabels';
import type { CharacterProfile, InventorySlot } from '../../types/api';

const GRID_COLUMNS = 6;
const GRID_ROWS = 4;
const GRID_SLOT_COUNT = GRID_COLUMNS * GRID_ROWS;

const CLASS_ACCENT: Record<CharacterProfile['character_class'], string> = {
  warrior: '#f4c430',
  mage: '#9be7ff',
  archer: '#d7f79b',
};

function GridCell({
  item,
  selected,
  onClick,
}: {
  item: InventorySlot | undefined;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!item}
      style={{
        width: 56,
        height: 56,
        borderRadius: 8,
        border: `1px solid ${selected ? '#e8c97a' : 'rgba(232, 201, 122, 0.3)'}`,
        background: item?.is_equipped ? 'rgba(232, 201, 122, 0.18)' : 'rgba(0, 0, 0, 0.35)',
        position: 'relative',
        cursor: item ? 'pointer' : 'default',
        padding: 2,
      }}
    >
      {item && (
        <>
          <span
            style={{
              display: 'block',
              fontSize: 9,
              fontWeight: 700,
              color: '#f4f1e8',
              lineHeight: 1.15,
              overflow: 'hidden',
            }}
          >
            {item.item_name}
          </span>
          {item.quantity > 1 && (
            <span style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 10, fontWeight: 700, color: '#e8c97a' }}>
              {item.quantity}
            </span>
          )}
          {item.is_equipped && (
            <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 8, color: '#57c25b' }}>●</span>
          )}
        </>
      )}
    </button>
  );
}

export function InventoryPanel({ character }: { character: CharacterProfile }) {
  const isOpen = useUIStore((s) => s.isInventoryOpen);
  const closeInventory = useUIStore((s) => s.closeInventory);
  const player = useCombatStore((s) => s.player);
  const inventory = useCharacterStore((s) => s.inventory);
  const fetchInventory = useCharacterStore((s) => s.fetchInventory);
  const equipItem = useCharacterStore((s) => s.equipItem);
  const unequipItem = useCharacterStore((s) => s.unequipItem);
  const hotbar = useCharacterStore((s) => s.hotbar);
  const setHotbarSlot = useCharacterStore((s) => s.setHotbarSlot);
  const accent = CLASS_ACCENT[character.character_class];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    fetchInventory().catch(() => setError('인벤토리를 불러오지 못했습니다.'));
  }, [isOpen, fetchInventory]);

  if (!isOpen) return null;

  const selected = inventory.find((item) => item.id === selectedId) ?? null;
  const equippable = selected ? selected.equip_slot !== null : false;
  const consumable = selected ? selected.heal_hp > 0 : false;
  const levelOk = selected ? character.level >= selected.required_level : false;
  const classOk = selected
    ? !selected.required_class || selected.required_class === 'all' || selected.required_class === character.character_class
    : false;
  const canEquip = equippable && levelOk && classOk;
  const assignedSlot = selected ? hotbar.findIndex((id) => id === selected.item_template_id) : -1;

  async function handleEquipToggle() {
    if (!selected) return;
    setError(null);
    setPending(true);
    try {
      if (selected.is_equipped) {
        await unequipItem(selected.id);
      } else {
        await equipItem(selected.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      onClick={closeInventory}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2147483647,
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 580,
          background: '#1a2a1c',
          border: `2px solid ${accent}`,
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>인벤토리</span>
          <span style={{ color: '#ffd54a', fontWeight: 700, fontSize: 13 }}>{player.gold} G</span>
          <span style={{ color: '#9aa08f', fontSize: 12 }}>I 또는 ESC로 닫기</span>
        </div>

        {error && <p style={{ color: '#e0538a', fontSize: 12, marginBottom: 8 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 14 }}>
          <div
            className="custom-scroll"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GRID_COLUMNS}, 56px)`,
              gap: 6,
              width: GRID_COLUMNS * 56 + (GRID_COLUMNS - 1) * 6,
              maxHeight: 56 * GRID_ROWS + 6 * (GRID_ROWS - 1),
              overflowY: 'auto',
              overflowX: 'hidden',
              flexShrink: 0,
            }}
          >
            {Array.from({ length: Math.max(GRID_SLOT_COUNT, inventory.length) }).map((_, i) => {
              const item = inventory[i];
              return (
                <GridCell
                  key={item?.id ?? `empty-${i}`}
                  item={item}
                  selected={item?.id === selectedId}
                  onClick={() => item && setSelectedId(item.id)}
                />
              );
            })}
          </div>

          <div style={{ width: 160, flexShrink: 0 }}>
            {selected ? (
              <>
                <div style={{ color: '#f4f1e8', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  {selected.item_name}
                  {selected.quantity > 1 && <span style={{ color: '#9aa08f', fontWeight: 400 }}> x{selected.quantity}</span>}
                </div>
                <div style={{ color: '#9aa08f', fontSize: 11, marginBottom: 10, lineHeight: 1.6 }}>
                  {selected.attack_bonus > 0 && <div>공격 +{selected.attack_bonus}</div>}
                  {selected.defense_bonus > 0 && <div>방어 +{selected.defense_bonus}</div>}
                  {selected.heal_hp > 0 && <div>체력 +{selected.heal_hp}</div>}
                  {selected.equip_slot && <div>부위: {EQUIP_SLOT_LABEL[selected.equip_slot] ?? selected.equip_slot}</div>}
                  {!levelOk && <div style={{ color: '#e0538a' }}>Lv.{selected.required_level} 필요</div>}
                  {!classOk && <div style={{ color: '#e0538a' }}>직업 제한</div>}
                </div>

                {equippable && (
                  <button
                    onClick={handleEquipToggle}
                    disabled={pending || (!selected.is_equipped && !canEquip)}
                    style={{
                      width: '100%',
                      padding: '6px 0',
                      borderRadius: 6,
                      border: '1px solid #e8c97a',
                      background: selected.is_equipped ? 'rgba(232, 201, 122, 0.25)' : 'rgba(255,255,255,0.05)',
                      color: '#e8c97a',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: pending ? 'default' : 'pointer',
                    }}
                  >
                    {selected.is_equipped ? '해제' : '장착'}
                  </button>
                )}

                {consumable && (
                  <div>
                    <div style={{ color: '#9aa08f', fontSize: 11, marginBottom: 4 }}>단축키 등록</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {Array.from({ length: HOTBAR_SIZE }).map((_, slot) => (
                        <button
                          key={slot}
                          onClick={() => setHotbarSlot(slot, assignedSlot === slot ? null : selected.item_template_id)}
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
              </>
            ) : (
              <p style={{ color: '#9aa08f', fontSize: 12 }}>아이템을 선택하세요.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
