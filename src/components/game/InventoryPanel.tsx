import { useEffect, useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';
import { useUIStore } from '../../stores/uiStore';
import { EQUIP_SLOT_LABEL, formatGold } from './itemLabels';
import { HOTBAR_DRAG_MIME } from './Hotbar';
import { useDraggablePanel } from './useDraggablePanel';
import { useIsTouch, useViewportSize } from '../../lib/device';
import { ItemIcon } from './itemIcons';
import { Button } from '../ui/button';
import { GamePanel } from '../ui/game-panel';
import { Slot } from '../ui/slot';
import { cn } from '../../lib/utils';
import { useTooltip } from './Tooltip';
import { ENCHANT_MAX_LEVEL, CURSED_MIN_LEVEL, enchantSuccessChance, safeEnchantLevel, scrollIneligibleReason } from './enchantRules';
import type { CharacterProfile, EnchantOutcome, InventorySlot } from '../../types/api';

const GRID_COLUMNS = 6;
const GRID_ROWS = 4;
const GRID_SLOT_COUNT = GRID_COLUMNS * GRID_ROWS;
const PANEL_WIDTH = 580;

// Enchanting is scroll-based, not gold-based — the player applies a scroll by
// double-clicking it, then double-clicking the target weapon/armor (see
// handleCellDoubleClick below). The rules themselves live in enchantRules.ts.

function GridCell({
  item,
  selected,
  eligibleForPendingScroll,
  size,
  onClick,
  onDoubleClick,
}: {
  item: InventorySlot | undefined;
  selected: boolean;
  eligibleForPendingScroll: boolean;
  size: number;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const isTouch = useIsTouch();
  // Only consumables are hotbar-assignable (equip/use items go through the 장착 button or a
  // double-click instead; scrolls are double-click-onto-a-target items, not hotbar items).
  // Native HTML5 drag never fires from a finger (and arming it just fights with tap/scroll) —
  // touch registers to the hotbar with the numbered buttons in the item details instead.
  const draggable = !isTouch && !!item && (item.heal_hp > 0 || item.restore_mp > 0 || !!item.teleport_target || item.haste_duration_sec > 0);
  const { handlers: tooltipHandlers, tooltip } = useTooltip(item?.item_name);

  return (
    <Slot
      size={size}
      selected={selected}
      disabled={!item}
      onClick={onClick}
      onDoubleClick={item ? onDoubleClick : undefined}
      draggable={draggable}
      enchant={item?.enchant_level}
      quantity={item?.quantity}
      equipped={!!item?.is_equipped}
      {...tooltipHandlers}
      onDragStart={(e) => {
        if (!item) return;
        e.dataTransfer.setData(HOTBAR_DRAG_MIME, String(item.item_template_id));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className={cn(
        'touch-manipulation p-0.5',
        item?.is_equipped && 'bg-gold/35',
        eligibleForPendingScroll && 'shadow-[0_0_0_3px_var(--color-mint-deep),0_0_10px_var(--color-mint-deep)]',
        draggable && 'cursor-grab',
      )}
    >
      {item && <ItemIcon itemName={item.item_name} size={Math.round(size * 0.6)} />}
      {tooltip}
    </Slot>
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Which enchant scroll (if any) is "armed" — double-click a scroll to arm it, then
  // double-click a weapon/armor item to apply it. Persists across single-clicks (browsing
  // other items while a scroll is armed is fine) and is cleared by applying, canceling
  // (double-clicking the same scroll again, or Escape), or closing the panel.
  const [pendingScroll, setPendingScroll] = useState<InventorySlot | null>(null);
  // Feedback from the last enchant attempt — keyed by item NAME rather than inventoryId,
  // because a 'destroyed' outcome deletes the row entirely, so `selected` (and any id lookup)
  // goes null right after; showing the message outside the item-details panel (see render
  // below) is what makes it still visible in that case. Cleared when a different item is
  // selected or the panel closes.
  const [enchantResult, setEnchantResult] = useState<{ itemName: string; outcome: EnchantOutcome } | null>(null);
  const isTouch = useIsTouch();
  const viewport = useViewportSize();
  const { frameStyle, onHeaderPointerDown, narrow } = useDraggablePanel(() => ({
    x: window.innerWidth - PANEL_WIDTH - 16,
    y: Math.max(16, window.innerHeight / 2 - 160),
  }), PANEL_WIDTH);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    fetchInventory().catch(() => setError('인벤토리를 불러오지 못했습니다.'));
  }, [isOpen, fetchInventory]);

  // Escape cancels an armed scroll without closing the panel (the panel's own ESC-to-close
  // binding lives in GamePage/HUD — this just intercepts first while a scroll is pending).
  useEffect(() => {
    if (!isOpen || !pendingScroll) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Escape') setPendingScroll(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, pendingScroll]);

  // Derived above the isOpen early-return (hooks below need them) rather than after it, where
  // they used to live — same values, just reordered.
  const selected = inventory.find((item) => item.id === selectedId) ?? null;
  const consumable = selected
    ? selected.heal_hp > 0 || selected.restore_mp > 0 || !!selected.teleport_target || selected.haste_duration_sec > 0
    : false;
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

  // On a phone the 6-column grid has to fit inside the sheet (viewport - sheet margins - panel
  // padding/border - column gaps) instead of a fixed 56px per cell.
  const cellSize = narrow ? Math.max(40, Math.min(56, Math.floor((viewport.width - 16 - 36 - 6 * 5) / GRID_COLUMNS))) : 56;

  async function handleApplyScroll(target: InventorySlot, scroll: InventorySlot) {
    setError(null);
    setEnchantResult(null);
    setPendingScroll(null);
    setPending(true);
    try {
      const { outcome } = await enchantItem(target.id, scroll.id);
      setEnchantResult({ itemName: target.item_name, outcome });
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

  // Double-click drives the whole enchant flow: double-click a scroll to arm it (or
  // double-click the same armed scroll again to cancel), then double-click a weapon/armor to
  // apply it. Double-clicking anything else while a scroll is armed just cancels — no reason
  // to strand the player in targeting mode over a stray click. Equip-toggle keeps its own
  // existing double-click behavior when no scroll is armed.
  function handleCellDoubleClick(item: InventorySlot | undefined) {
    if (!item) return;
    if (pendingScroll) {
      if (item.id === pendingScroll.id) {
        setPendingScroll(null);
        return;
      }
      const reason = scrollIneligibleReason(item, pendingScroll);
      if (reason) {
        setError(reason);
        setPendingScroll(null);
        return;
      }
      handleApplyScroll(item, pendingScroll);
      return;
    }
    if (item.enchant_scroll_type) {
      setPendingScroll(item);
      setError(null);
      setEnchantResult(null);
      return;
    }
    if (item.equip_slot !== null) toggleEquip(item);
  }

  return (
    // Docked near the right by default (캐릭터 창은 왼쪽 — see CharacterPanel) rather than a
    // centered modal with a dismiss-on-outside-click backdrop, so the two can be open side
    // by side; draggable via the header, see useDraggablePanel.
    <GamePanel
      title="인벤토리"
      onClose={closeInventory}
      frameStyle={frameStyle}
      onHeaderPointerDown={onHeaderPointerDown}
      className="z-[2147483647]"
      headerActions={<span className="font-display text-base text-gold-ink">{formatGold(player.gold)} G</span>}
    >
        {error && <p style={{ color: 'var(--color-danger-ink)', fontSize: 12, marginBottom: 8 }}>{error}</p>}
        {enchantResult && (
          <p
            style={{
              color:
                enchantResult.outcome === 'success'
                  ? 'var(--color-mint-ink)'
                  : enchantResult.outcome === 'destroyed'
                    ? 'var(--color-danger-ink)'
                    : enchantResult.outcome === 'cursed'
                      ? 'var(--color-violet-ink)'
                      : 'var(--color-ink-soft)',
              fontSize: 12,
              marginBottom: 8,
              fontWeight: enchantResult.outcome === 'destroyed' ? 700 : 400,
            }}
          >
            {enchantResult.outcome === 'success' && `${enchantResult.itemName} 강화에 성공했습니다!`}
            {/* Not reachable via any current scroll type (see
                supabase/migrations/20260928120000_split_weapon_armor_enchant_scrolls.sql —
                every non-success roll past the safe level is 'destroyed' outright for weapon/
                armor/blessed-beyond-safe scrolls), kept only in case a future scroll type
                reintroduces a genuinely safe-fail outcome. */}
            {enchantResult.outcome === 'fail' && `${enchantResult.itemName} 강화에 실패했습니다.`}
            {enchantResult.outcome === 'destroyed' && `${enchantResult.itemName}이(가) 강화에 실패하여 파괴되었습니다.`}
            {enchantResult.outcome === 'cursed' && `${enchantResult.itemName}의 강화 수치가 1 낮아졌습니다.`}
          </p>
        )}
        {pendingScroll && (
          <p style={{ color: 'var(--color-gold-ink)', fontSize: 12, marginBottom: 8 }}>
            {pendingScroll.item_name} 사용 중 —{' '}
            {isTouch ? '적용할 무기/방어구를 터치하세요.' : '적용할 무기/방어구를 더블클릭하세요. (ESC 또는 같은 주문서를 다시 더블클릭하면 취소)'}{' '}
            <Button variant="ghost" size="sm" className="ml-2 h-7 px-2 text-xs" onClick={() => setPendingScroll(null)}>
              취소
            </Button>
          </p>
        )}

        <div style={{ display: 'flex', gap: 14, flexWrap: narrow ? 'wrap' : 'nowrap' }}>
          <div
            className="custom-scroll"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GRID_COLUMNS}, ${cellSize}px)`,
              gap: 6,
              width: GRID_COLUMNS * cellSize + (GRID_COLUMNS - 1) * 6,
              maxHeight: cellSize * GRID_ROWS + 6 * (GRID_ROWS - 1),
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
                  eligibleForPendingScroll={!!(item && pendingScroll && item.id !== pendingScroll.id && !scrollIneligibleReason(item, pendingScroll))}
                  size={cellSize}
                  onClick={() => {
                    if (!item) return;
                    // No reliable double-tap on a phone: while a scroll is armed a single tap
                    // on a target applies it (or on the armed scroll itself cancels).
                    if (isTouch && pendingScroll) {
                      handleCellDoubleClick(item);
                      return;
                    }
                    setSelectedId(item.id);
                    setEnchantResult(null);
                  }}
                  onDoubleClick={() => handleCellDoubleClick(item)}
                />
              );
            })}
          </div>

          <div style={{ width: narrow ? '100%' : 160, flexShrink: 0 }}>
            {selected ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <ItemIcon itemName={selected.item_name} size={24} />
                  <div style={{ color: 'var(--color-ink)', fontSize: 13, fontWeight: 700 }}>
                    {selected.enchant_level > 0 && <span style={{ color: 'var(--color-gold-ink)' }}>+{selected.enchant_level} </span>}
                    {selected.item_name}
                    {selected.quantity > 1 && <span style={{ color: 'var(--color-ink-soft)', fontWeight: 400 }}> x{selected.quantity}</span>}
                  </div>
                </div>
                <div style={{ color: 'var(--color-ink-soft)', fontSize: 12, marginBottom: 10, lineHeight: 1.6 }}>
                  {selected.attack_bonus > 0 && <div>공격 +{selected.attack_bonus}</div>}
                  {selected.defense_bonus > 0 && <div>방어 +{selected.defense_bonus}</div>}
                  {selected.heal_hp > 0 && <div>체력 +{selected.heal_hp}</div>}
                  {selected.restore_mp > 0 && <div>마나 +{selected.restore_mp}</div>}
                  {selected.teleport_target === 'village' && <div>사용 시 가까운 마을로 이동</div>}
                  {selected.teleport_target === 'blink' && <div>사용 시 현재 지역 내 랜덤한 곳으로 순간이동</div>}
                  {selected.haste_duration_sec > 0 && (
                    <div>사용 시 {selected.haste_duration_sec}초간 이동속도/공격속도 증가</div>
                  )}
                  {selected.equip_slot && <div>부위: {EQUIP_SLOT_LABEL[selected.equip_slot] ?? selected.equip_slot}</div>}
                  {!levelOk && <div style={{ color: 'var(--color-danger-ink)' }}>Lv.{selected.required_level} 필요</div>}
                  {!classOk && <div style={{ color: 'var(--color-danger-ink)' }}>직업 제한</div>}
                </div>

                {selected.enchant_scroll_type && (
                  <div style={{ color: 'var(--color-ink-soft)', fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
                    {selected.enchant_scroll_type === 'weapon' && (
                      <>
                        <div>'사용'을 누른 뒤 강화할 무기를 선택하세요.</div>
                        <div>+6까지는 100% 안전, +6 이상에서 실패하면 무기가 파괴됩니다.</div>
                      </>
                    )}
                    {selected.enchant_scroll_type === 'armor' && (
                      <>
                        <div>'사용'을 누른 뒤 강화할 방어구를 선택하세요.</div>
                        <div>+4까지는 100% 안전, +4 이상에서 실패하면 방어구가 파괴됩니다.</div>
                      </>
                    )}
                    {selected.enchant_scroll_type === 'blessed' && (
                      <>
                        <div>안전 구간(무기 +6 / 방어구 +4 미만)에서는 무작위로 +1~+3 상승 (극히 드물게 +4).</div>
                        <div>안전 구간 이상에서는 일반 주문서와 같습니다 (+1, 실패 시 파괴).</div>
                      </>
                    )}
                    {selected.enchant_scroll_type === 'cursed' && (
                      <>
                        <div>+{CURSED_MIN_LEVEL} 이상부터 사용 가능. 강화 수치를 1 낮춥니다 (파괴 위험 없음).</div>
                      </>
                    )}
                  </div>
                )}

                {selected.enchant_scroll_type && (
                  <Button
                    variant={pendingScroll?.id === selected.id ? 'sky' : 'primary'}
                    size="sm"
                    className="mb-2.5 w-full"
                    onClick={() => {
                      setPendingScroll(pendingScroll?.id === selected.id ? null : selected);
                      setError(null);
                      setEnchantResult(null);
                    }}
                  >
                    {pendingScroll?.id === selected.id ? '사용 취소' : '사용'}
                  </Button>
                )}

                {equippable && (
                  <>
                    <Button
                      variant={selected.is_equipped ? 'sky' : 'primary'}
                      size="sm"
                      className="w-full"
                      onClick={() => toggleEquip(selected)}
                      disabled={pending || (!selected.is_equipped && !canEquip)}
                    >
                      {selected.is_equipped ? '해제' : '장착'}
                    </Button>
                    <p style={{ color: 'var(--color-ink-soft)', fontSize: 11, marginTop: 4 }}>더블클릭으로도 장착/해제됩니다.</p>

                    {selected.enchant_level < ENCHANT_MAX_LEVEL && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '2px solid rgb(139 106 70 / 0.15)' }}>
                        {(() => {
                          const isWeapon = selected.equip_slot === 'weapon';
                          const successChance = enchantSuccessChance(selected);
                          const destroyChance = 1 - successChance;
                          return (
                            <div style={{ color: 'var(--color-ink-soft)', fontSize: 12, lineHeight: 1.6 }}>
                              <div>
                                {isWeapon ? '무기' : '방어구'} 강화 주문서 사용 시: 성공 {Math.round(successChance * 100)}%
                                {destroyChance > 0 ? (
                                  <span style={{ color: 'var(--color-danger-ink)' }}> · 실패 시 파괴 {Math.round(destroyChance * 100)}%</span>
                                ) : (
                                  <span> (안전 +{safeEnchantLevel(selected)})</span>
                                )}
                              </div>
                              <div style={{ marginTop: 2 }}>인벤토리에서 강화 주문서를 더블클릭해 사용하세요.</div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}

                {consumable && (
                  <div>
                    <div style={{ color: 'var(--color-ink-soft)', fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>
                      {assignedSlot >= 0 ? (
                        <>
                          단축키 <span style={{ color: 'var(--color-gold-ink)', fontWeight: 700 }}>{assignedSlot + 1}</span>번에 등록됨
                        </>
                      ) : (
                        '아이템을 드래그하거나, 아래 번호를 눌러 단축키에 등록하세요.'
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {Array.from({ length: HOTBAR_SIZE }).map((_, slot) => (
                        <Button
                          key={slot}
                          variant={assignedSlot === slot ? 'primary' : 'ghost'}
                          size="sm"
                          className="h-8 flex-1 px-0 text-sm"
                          onClick={() =>
                            setHotbarSlot(
                              slot,
                              assignedSlot === slot ? null : { kind: 'item', itemTemplateId: selected.item_template_id },
                            )
                          }
                        >
                          {slot + 1}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: 'var(--color-ink-soft)', fontSize: 12 }}>아이템을 선택하세요.</p>
            )}
          </div>
        </div>
    </GamePanel>
  );
}
