import { useEffect, useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';
import { useUIStore } from '../../stores/uiStore';
import { EQUIP_SLOT_LABEL } from './itemLabels';
import { HOTBAR_DRAG_MIME } from './Hotbar';
import { useDraggablePanel } from './useDraggablePanel';
import { ItemIcon, itemRarity, RARITY_SLOT_FRAME } from './itemIcons';
import type { CharacterProfile, EnchantOutcome, InventorySlot } from '../../types/api';

const GRID_COLUMNS = 6;
const GRID_ROWS = 4;
const GRID_SLOT_COUNT = GRID_COLUMNS * GRID_ROWS;
const PANEL_WIDTH = 580;

// Enchant system — indexed by the item's CURRENT enchant_level (0-6), i.e. the odds/cost of
// going from that level to the next. Mirrors the server's own tables exactly (see
// supabase/migrations/20260923041612_enchant_item_destroy_risk.sql) — kept as a separate
// client-side copy purely for display (odds/cost preview before the player commits gold), the
// server is still the one actually rolling the outcome. +0..+2 -> +1..+3 is always safe;
// beyond that a failed roll can destroy the item, weapons more often than armor/accessories.
const ENCHANT_MAX_LEVEL = 7;
const ENCHANT_COST = [50, 100, 200, 400, 800, 1500, 3000];
const ENCHANT_SUCCESS_CHANCE = [1.0, 1.0, 1.0, 0.7, 0.5, 0.3, 0.15];
const ENCHANT_DESTROY_CHANCE_WEAPON = [0, 0, 0, 0.1, 0.25, 0.4, 0.6];
const ENCHANT_DESTROY_CHANCE_ARMOR = [0, 0, 0, 0.05, 0.15, 0.25, 0.4];

function enchantDestroyChance(level: number, isWeapon: boolean): number {
  return (isWeapon ? ENCHANT_DESTROY_CHANCE_WEAPON : ENCHANT_DESTROY_CHANCE_ARMOR)[level];
}

const CLASS_ACCENT: Record<CharacterProfile['character_class'], string> = {
  warrior: '#f4c430',
  mage: '#9be7ff',
  archer: '#d7f79b',
};

function GridCell({
  item,
  selected,
  onClick,
  onDoubleClick,
}: {
  item: InventorySlot | undefined;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  // Only consumables are hotbar-assignable (equip/use items go through the 장착 button or a
  // double-click instead).
  const draggable = !!item && (item.heal_hp > 0 || item.restore_mp > 0 || !!item.teleport_target);
  const rarityFrame = item ? RARITY_SLOT_FRAME[itemRarity(item.required_level)] : null;

  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={!item}
      draggable={draggable}
      title={item?.item_name}
      onDragStart={(e) => {
        if (!item) return;
        e.dataTransfer.setData(HOTBAR_DRAG_MIME, String(item.item_template_id));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      style={{
        width: 56,
        height: 56,
        borderRadius: 8,
        border: `1px solid ${selected ? '#e8c97a' : 'rgba(232, 201, 122, 0.3)'}`,
        background: item?.is_equipped ? 'rgba(232, 201, 122, 0.18)' : 'rgba(0, 0, 0, 0.35)',
        backgroundImage: rarityFrame ? `url(${rarityFrame})` : undefined,
        backgroundSize: '100% 100%',
        position: 'relative',
        cursor: item ? (draggable ? 'grab' : 'pointer') : 'default',
        padding: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {item && (
        <>
          <ItemIcon itemName={item.item_name} size={34} />
          {item.quantity > 1 && (
            <span style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 10, fontWeight: 700, color: '#e8c97a' }}>
              {item.quantity}
            </span>
          )}
          {item.is_equipped && (
            <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 8, color: '#57c25b' }}>●</span>
          )}
          {item.enchant_level > 0 && (
            <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 10, fontWeight: 700, color: '#ffd54a' }}>
              +{item.enchant_level}
            </span>
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
  const enchantItem = useCharacterStore((s) => s.enchantItem);
  const hotbar = useCharacterStore((s) => s.hotbar);
  const setHotbarSlot = useCharacterStore((s) => s.setHotbarSlot);
  const accent = CLASS_ACCENT[character.character_class];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Feedback from the last enchant attempt — keyed by item NAME rather than inventoryId,
  // because a 'destroyed' outcome deletes the row entirely, so `selected` (and any id lookup)
  // goes null right after; showing the message outside the item-details panel (see render
  // below) is what makes it still visible in that case. Cleared when a different item is
  // selected or the panel closes.
  const [enchantResult, setEnchantResult] = useState<{ itemName: string; outcome: EnchantOutcome } | null>(null);
  const { position, onHeaderMouseDown } = useDraggablePanel(() => ({
    x: window.innerWidth - PANEL_WIDTH - 16,
    y: Math.max(16, window.innerHeight / 2 - 160),
  }));

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    fetchInventory().catch(() => setError('인벤토리를 불러오지 못했습니다.'));
  }, [isOpen, fetchInventory]);

  // Derived above the isOpen early-return (hooks below need them) rather than after it, where
  // they used to live — same values, just reordered.
  const selected = inventory.find((item) => item.id === selectedId) ?? null;
  const consumable = selected ? selected.heal_hp > 0 || selected.restore_mp > 0 || !!selected.teleport_target : false;
  const assignedSlot = selected
    ? hotbar.findIndex((a) => a?.kind === 'item' && a.itemTemplateId === selected.item_template_id)
    : -1;

  // Select an item, then press its number — same registration the on-screen number buttons
  // below do, just as an actual keyboard shortcut instead of a click. GamePage's own global
  // digit-key handler already bails out while the inventory is open, so these are free to use.
  useEffect(() => {
    if (!isOpen || !selected || !consumable) return;
    function onKeyDown(e: KeyboardEvent) {
      const match = /^Digit([1-9])$/.exec(e.code);
      if (!match) return;
      const slot = Number(match[1]) - 1;
      if (slot >= HOTBAR_SIZE) return;
      e.preventDefault();
      setHotbarSlot(slot, assignedSlot === slot ? null : { kind: 'item', itemTemplateId: selected!.item_template_id });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, selected, consumable, assignedSlot, setHotbarSlot]);

  if (!isOpen) return null;

  const equippable = selected ? selected.equip_slot !== null : false;
  const levelOk = selected ? character.level >= selected.required_level : false;
  const classOk = selected
    ? !selected.required_class || selected.required_class === 'all' || selected.required_class === character.character_class
    : false;
  const canEquip = equippable && levelOk && classOk;

  // Shared by the 장착/해제 button (acts on `selected`) and double-clicking any grid cell
  // (acts on whichever item was double-clicked, which may not be the currently selected
  // one) — always re-derives the level/class check against the specific item passed in
  // rather than trusting the possibly-stale `canEquip`/`selected` closures.
  async function toggleEquip(item: InventorySlot) {
    if (!item.is_equipped) {
      const itemLevelOk = character.level >= item.required_level;
      const itemClassOk =
        !item.required_class || item.required_class === 'all' || item.required_class === character.character_class;
      if (item.equip_slot === null || !itemLevelOk || !itemClassOk) return;
    }
    setError(null);
    setPending(true);
    try {
      if (item.is_equipped) {
        await unequipItem(item.id);
      } else {
        await equipItem(item.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.');
    } finally {
      setPending(false);
    }
  }

  async function handleEnchant(item: InventorySlot) {
    if (item.enchant_level >= ENCHANT_MAX_LEVEL) return;
    const cost = ENCHANT_COST[item.enchant_level];
    if (player.gold < cost) return;
    setError(null);
    setEnchantResult(null);
    setPending(true);
    try {
      const { outcome } = await enchantItem(item.id, cost);
      setEnchantResult({ itemName: item.item_name, outcome });
      // A destroyed item is gone from `inventory` after this — drop the now-stale selection
      // so the details panel falls back to "아이템을 선택하세요" instead of showing nothing
      // for an id that no longer resolves.
      if (outcome === 'destroyed') setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '인챈트 중 오류가 발생했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    // Docked near the right by default (캐릭터 창은 왼쪽 — see CharacterPanel) rather than a
    // centered modal with a dismiss-on-outside-click backdrop, so the two can be open side
    // by side; draggable via the header, see useDraggablePanel.
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
          marginBottom: 10,
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>인벤토리</span>
        <span style={{ color: '#ffd54a', fontWeight: 700, fontSize: 13 }}>{player.gold} G</span>
        <button
          onClick={closeInventory}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9aa08f',
            fontSize: 16,
            cursor: 'pointer',
            lineHeight: 1,
            padding: 2,
          }}
          title="닫기 (I 또는 ESC)"
        >
          ✕
        </button>
      </div>

        {error && <p style={{ color: '#e0538a', fontSize: 12, marginBottom: 8 }}>{error}</p>}
        {enchantResult && (
          <p
            style={{
              color: enchantResult.outcome === 'success' ? '#57c25b' : enchantResult.outcome === 'destroyed' ? '#e0538a' : '#9aa08f',
              fontSize: 12,
              marginBottom: 8,
              fontWeight: enchantResult.outcome === 'destroyed' ? 700 : 400,
            }}
          >
            {enchantResult.outcome === 'success' && `${enchantResult.itemName} 강화에 성공했습니다!`}
            {enchantResult.outcome === 'fail' && `${enchantResult.itemName} 강화에 실패했습니다.`}
            {enchantResult.outcome === 'destroyed' && `${enchantResult.itemName}이(가) 강화에 실패하여 파괴되었습니다.`}
          </p>
        )}

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
                  onClick={() => {
                    if (!item) return;
                    setSelectedId(item.id);
                    setEnchantResult(null);
                  }}
                  onDoubleClick={() => item && item.equip_slot !== null && toggleEquip(item)}
                />
              );
            })}
          </div>

          <div style={{ width: 160, flexShrink: 0 }}>
            {selected ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <ItemIcon itemName={selected.item_name} size={24} />
                  <div style={{ color: '#f4f1e8', fontSize: 13, fontWeight: 700 }}>
                    {selected.enchant_level > 0 && <span style={{ color: '#ffd54a' }}>+{selected.enchant_level} </span>}
                    {selected.item_name}
                    {selected.quantity > 1 && <span style={{ color: '#9aa08f', fontWeight: 400 }}> x{selected.quantity}</span>}
                  </div>
                </div>
                <div style={{ color: '#9aa08f', fontSize: 11, marginBottom: 10, lineHeight: 1.6 }}>
                  {selected.attack_bonus > 0 && <div>공격 +{selected.attack_bonus}</div>}
                  {selected.defense_bonus > 0 && <div>방어 +{selected.defense_bonus}</div>}
                  {selected.heal_hp > 0 && <div>체력 +{selected.heal_hp}</div>}
                  {selected.restore_mp > 0 && <div>마나 +{selected.restore_mp}</div>}
                  {selected.teleport_target === 'village' && <div>사용 시 가까운 마을로 이동</div>}
                  {selected.teleport_target === 'blink' && <div>사용 시 현재 지역 내 랜덤한 곳으로 순간이동</div>}
                  {selected.equip_slot && <div>부위: {EQUIP_SLOT_LABEL[selected.equip_slot] ?? selected.equip_slot}</div>}
                  {!levelOk && <div style={{ color: '#e0538a' }}>Lv.{selected.required_level} 필요</div>}
                  {!classOk && <div style={{ color: '#e0538a' }}>직업 제한</div>}
                </div>

                {equippable && (
                  <>
                    <button
                      onClick={() => toggleEquip(selected)}
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
                    <p style={{ color: '#9aa08f', fontSize: 10, marginTop: 4 }}>더블클릭으로도 장착/해제됩니다.</p>

                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(232, 201, 122, 0.15)' }}>
                      {selected.enchant_level >= ENCHANT_MAX_LEVEL ? (
                        <p style={{ color: '#9aa08f', fontSize: 11 }}>최대 강화 수치입니다.</p>
                      ) : (
                        (() => {
                          const level = selected.enchant_level;
                          const isWeapon = selected.equip_slot === 'weapon';
                          const destroyChance = enchantDestroyChance(level, isWeapon);
                          const successChance = ENCHANT_SUCCESS_CHANCE[level];
                          const failChance = 1 - successChance - destroyChance;
                          const cost = ENCHANT_COST[level];
                          return (
                            <>
                              <div style={{ color: '#9aa08f', fontSize: 11, lineHeight: 1.6, marginBottom: 6 }}>
                                <div>
                                  인챈트 <span style={{ color: '#e8c97a' }}>+{level}</span> →{' '}
                                  <span style={{ color: '#e8c97a' }}>+{level + 1}</span>
                                </div>
                                <div>성공 확률 {Math.round(successChance * 100)}%</div>
                                {destroyChance > 0 && (
                                  <div style={{ color: '#e0538a' }}>
                                    실패 {Math.round(failChance * 100)}% · 파괴 {Math.round(destroyChance * 100)}%
                                  </div>
                                )}
                                <div style={{ color: player.gold < cost ? '#e0538a' : '#ffd54a' }}>비용 {cost} G</div>
                              </div>
                              {destroyChance > 0 && (
                                <p style={{ color: '#e0538a', fontSize: 10, marginBottom: 6 }}>
                                  ⚠ 실패 시 아이템이 파괴될 수 있습니다.
                                </p>
                              )}
                              <button
                                onClick={() => handleEnchant(selected)}
                                disabled={pending || player.gold < cost}
                                style={{
                                  width: '100%',
                                  padding: '6px 0',
                                  borderRadius: 6,
                                  border: `1px solid ${destroyChance > 0 ? '#e0538a' : '#e8c97a'}`,
                                  background: 'rgba(255,255,255,0.05)',
                                  color: player.gold < cost ? '#6a6a5f' : destroyChance > 0 ? '#e0538a' : '#e8c97a',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: pending ? 'default' : 'pointer',
                                }}
                              >
                                인챈트
                              </button>
                            </>
                          );
                        })()
                      )}
                    </div>
                  </>
                )}

                {consumable && (
                  <div>
                    <div style={{ color: '#9aa08f', fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>
                      {assignedSlot >= 0 ? (
                        <>
                          단축키 <span style={{ color: '#e8c97a', fontWeight: 700 }}>{assignedSlot + 1}</span>번에 등록됨
                        </>
                      ) : (
                        '아이템을 드래그하거나, 아래 번호를 눌러 단축키에 등록하세요.'
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {Array.from({ length: HOTBAR_SIZE }).map((_, slot) => (
                        <button
                          key={slot}
                          onClick={() =>
                            setHotbarSlot(
                              slot,
                              assignedSlot === slot ? null : { kind: 'item', itemTemplateId: selected.item_template_id },
                            )
                          }
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
  );
}
