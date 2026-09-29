import { useEffect, useMemo, useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useUIStore } from '../../stores/uiStore';
import { useDraggablePanel } from './useDraggablePanel';
import { Button } from '../ui/button';
import { GamePanel } from '../ui/game-panel';
import { IconButton } from '../ui/icon-button';
import { Slot } from '../ui/slot';
import { formatGold } from './itemLabels';
import { ItemIcon } from './itemIcons';
import { VILLAGE_BLACKSMITH_LEVEL_RANGE } from './Village';
import type { CharacterProfile } from '../../types/api';

const PANEL_WIDTH = 340;

const SHOP_TITLE: Record<'merchant' | 'blacksmith', string> = {
  merchant: '상인의 가게',
  blacksmith: '대장장이의 가게',
};

// quantity/onQuantityChange/maxQuantity are only passed for stackable buy rows (see
// ShopPanel's equip_slot === null check) — equip gear and the sell tab always buy/sell one
// at a time, so those rows render without a stepper at all rather than a stepper stuck at 1.
function ShopRow({
  name,
  iconName,
  meta,
  price,
  priceColor,
  actionLabel,
  disabled,
  onAction,
  quantity,
  onQuantityChange,
  maxQuantity,
}: {
  name: string;
  // The catalog's raw item_name, for icon lookup — `name` itself may have a quantity/
  // equipped suffix appended (see the sell tab below), which would never match ITEM_ICON's
  // keys and silently fall back to the blank-text icon.
  iconName: string;
  meta: string;
  price: number;
  priceColor: string;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
  quantity?: number;
  onQuantityChange?: (next: number) => void;
  maxQuantity?: number;
}) {
  const hasStepper = quantity !== undefined && onQuantityChange !== undefined;
  const totalPrice = hasStepper ? price * quantity : price;
  const atMax = maxQuantity !== undefined && quantity !== undefined && quantity >= maxQuantity;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b-2 border-edge/15 px-1 py-2 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        <Slot size={40}>
          <ItemIcon itemName={iconName} size={26} />
        </Slot>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink">{name}</div>
          <div className="text-xs text-ink-soft">{meta}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {hasStepper && (
          <div className="flex items-center gap-1">
            <IconButton label="수량 줄이기" size="sm" disabled={quantity <= 1} onClick={() => onQuantityChange(Math.max(1, quantity - 1))}>
              −
            </IconButton>
            <span className="min-w-5 text-center text-sm font-bold text-ink">{quantity}</span>
            <IconButton
              label="수량 늘리기"
              size="sm"
              disabled={atMax}
              onClick={() => onQuantityChange(Math.min(maxQuantity ?? 99, quantity + 1))}
            >
              +
            </IconButton>
          </div>
        )}
        <span className="min-w-16 text-right text-sm font-bold" style={{ color: priceColor }}>
          {formatGold(totalPrice)} G
        </span>
        <Button size="sm" onClick={onAction} disabled={disabled}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

export function ShopPanel({ character }: { character: CharacterProfile }) {
  const isOpen = useUIStore((s) => s.isShopOpen);
  const shopKind = useUIStore((s) => s.shopKind);
  const shopVillageIndex = useUIStore((s) => s.shopVillageIndex);
  const closeShop = useUIStore((s) => s.closeShop);
  const player = useCombatStore((s) => s.player);
  const shop = useCharacterStore((s) => s.shop);
  const inventory = useCharacterStore((s) => s.inventory);
  const fetchShop = useCharacterStore((s) => s.fetchShop);
  const fetchInventory = useCharacterStore((s) => s.fetchInventory);
  const buyItem = useCharacterStore((s) => s.buyItem);
  const sellItem = useCharacterStore((s) => s.sellItem);
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  // Per-item buy quantity, keyed by item_template_id — local UI state only, reset isn't
  // needed since a fresh shop open starts every row back at the 1 default via the ?? below.
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  // Same idea for the sell tab, keyed by inventory row id instead of item_template_id (two
  // different stacks of the same item would otherwise share one quantity by mistake).
  const [sellQuantities, setSellQuantities] = useState<Record<number, number>>({});
  const { frameStyle, onHeaderPointerDown } = useDraggablePanel(() => ({
    x: window.innerWidth / 2 - PANEL_WIDTH / 2,
    y: Math.max(16, window.innerHeight / 2 - 200),
  }), PANEL_WIDTH);

  useEffect(() => {
    if (!isOpen || !shopKind) return;
    setError(null);
    Promise.all([fetchShop(shopKind), fetchInventory()]).catch(() => setError('상점 정보를 불러오지 못했습니다.'));
  }, [isOpen, shopKind, fetchShop, fetchInventory]);

  // Server order is plain id ascending (see /me/shop) — fine at the original ~15-item
  // catalog, but the blacksmith list alone is now 30+ weapon/armor rows across all 3 classes
  // and every tier, all mixed together. Sorting the player's own class first (then by
  // required_level) surfaces what they can actually use instead of making them scroll past
  // irrelevant-class gear to find it — a pure display reorder, buy/sell/gating logic below is
  // unchanged.
  //
  // Real user request: "마을마다 파는 품목도 달라야겠지?" — 대장장이 additionally filters down
  // to this village's own VILLAGE_BLACKSMITH_LEVEL_RANGE band (see Village.tsx for why the
  // bands overlap and why 상인 is deliberately excluded from this: 상인 sells consumables/
  // scrolls, and gating basic potions behind a specific village would just be annoying rather
  // than giving leveling up a reason to travel, which is the actual point for gear). Falls
  // back to the full catalog if shopVillageIndex is somehow missing (e.g. a stale dev reload)
  // rather than showing an empty list.
  const sortedShop = useMemo(() => {
    const range = shopKind === 'blacksmith' && shopVillageIndex !== null ? VILLAGE_BLACKSMITH_LEVEL_RANGE[shopVillageIndex] : null;
    const inRange = range ? shop.filter((item) => item.required_level >= range[0] && item.required_level <= range[1]) : shop;
    return [...inRange].sort((a, b) => {
      const aOk = !a.required_class || a.required_class === 'all' || a.required_class === character.character_class;
      const bOk = !b.required_class || b.required_class === 'all' || b.required_class === character.character_class;
      if (aOk !== bOk) return aOk ? -1 : 1;
      return a.required_level - b.required_level;
    });
  }, [shop, character.character_class, shopKind, shopVillageIndex]);

  if (!isOpen || !shopKind) return null;

  async function handleBuy(itemTemplateId: number, price: number, quantity: number) {
    setError(null);
    setPendingId(itemTemplateId);
    try {
      await buyItem(itemTemplateId, price, quantity);
      // Next purchase of this item starts back at 1 rather than staying at whatever bulk
      // amount was just bought — avoids an accidental repeat-click re-buying 10 more.
      setQuantities((q) => ({ ...q, [itemTemplateId]: 1 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '구매 중 오류가 발생했습니다.');
    } finally {
      setPendingId(null);
    }
  }

  async function handleSell(inventoryId: number, price: number, quantity: number) {
    setError(null);
    setPendingId(inventoryId);
    try {
      await sellItem(inventoryId, price, quantity);
      // Next sell of this stack starts back at 1 rather than staying at whatever bulk amount
      // was just sold — same reasoning as handleBuy's reset, and avoids the stepper pointing
      // past the stack's new (now-smaller) remaining quantity.
      setSellQuantities((q) => ({ ...q, [inventoryId]: 1 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '판매 중 오류가 발생했습니다.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    // Draggable via the header (see useDraggablePanel) — no full-screen dismiss-on-outside-
    // click backdrop, for the same consistency reason as CharacterPanel/InventoryPanel:
    // dragging and click-outside-to-close would otherwise fight over what a mouseup outside
    // the header means.
    <GamePanel
      title={SHOP_TITLE[shopKind]}
      onClose={closeShop}
      frameStyle={frameStyle}
      onHeaderPointerDown={onHeaderPointerDown}
      className="z-[2147483647]"
    >
      <div className="mb-3 font-display text-lg text-gold-ink">{formatGold(player.gold)} G 보유</div>

      <div className="mb-3 flex gap-2">
        {(['buy', 'sell'] as const).map((t) => (
          <Button key={t} variant={tab === t ? 'primary' : 'ghost'} size="sm" className="flex-1" onClick={() => setTab(t)}>
            {t === 'buy' ? '구매' : '판매'}
          </Button>
        ))}
      </div>

      {error && <p className="mb-2 text-sm text-danger-ink">{error}</p>}

      <div className="custom-scroll max-h-[280px] overflow-y-auto">
        {tab === 'buy' ? (
          sortedShop.length === 0 ? (
            <p style={{ color: 'var(--color-ink-soft)', fontSize: 13, padding: '12px 4px' }}>판매 중인 아이템이 없습니다.</p>
          ) : (
            sortedShop.map((item) => {
              const classOk =
                !item.required_class || item.required_class === 'all' || item.required_class === character.character_class;
              const levelOk = character.level >= item.required_level;
              // Stackable only (equip gear always buys one at a time — see the server
              // route's equip_slot check) — the affordability cap below uses this too, so
              // an equip item's stepper is simply never rendered rather than rendered
              // pinned at 1.
              const stackable = item.equip_slot === null;
              const maxAffordable = item.buy_price > 0 ? Math.floor(player.gold / item.buy_price) : 99;
              const maxQuantity = Math.max(1, Math.min(99, maxAffordable));
              const quantity = Math.min(quantities[item.id] ?? 1, maxQuantity);
              const canAfford = player.gold >= item.buy_price * (stackable ? quantity : 1);
              const disabled = pendingId === item.id || !classOk || !levelOk || !canAfford;
              const bonus =
                (item.attack_bonus > 0 ? `공격 +${item.attack_bonus} ` : '') +
                (item.defense_bonus > 0 ? `방어 +${item.defense_bonus} ` : '') +
                (item.heal_hp > 0 ? `체력 +${item.heal_hp} ` : '') +
                (item.restore_mp > 0 ? `마나 +${item.restore_mp} ` : '') +
                (item.teleport_target === 'village' ? '마을 이동 ' : '') +
                (item.teleport_target === 'blink' ? '순간이동 ' : '') +
                (item.haste_duration_sec > 0 ? `이속/공속 ${item.haste_duration_sec}초 ` : '');
              const restriction = !levelOk
                ? `Lv.${item.required_level} 필요`
                : !classOk
                  ? '직업 제한'
                  : !canAfford
                    ? '골드 부족'
                    : '';
              return (
                <ShopRow
                  key={item.id}
                  name={item.name}
                  iconName={item.name}
                  meta={[bonus, restriction].filter(Boolean).join('· ')}
                  price={item.buy_price}
                  priceColor='var(--color-gold-ink)'
                  actionLabel="구매"
                  disabled={disabled}
                  onAction={() => handleBuy(item.id, item.buy_price, stackable ? quantity : 1)}
                  quantity={stackable ? quantity : undefined}
                  onQuantityChange={stackable ? (next) => setQuantities((q) => ({ ...q, [item.id]: next })) : undefined}
                  maxQuantity={stackable ? maxQuantity : undefined}
                />
              );
            })
          )
        ) : inventory.length === 0 ? (
          <p style={{ color: 'var(--color-ink-soft)', fontSize: 13, padding: '12px 4px' }}>인벤토리가 비어 있습니다.</p>
        ) : (
          inventory.map((item) => {
            // Equipped gear and single-count rows always sell one at a time — same
            // "stackable only" rule the buy tab uses (see ShopRow's own comment).
            const stackable = item.equip_slot === null && item.quantity > 1;
            const maxQuantity = Math.max(1, Math.min(99, item.quantity));
            const sellQuantity = Math.min(sellQuantities[item.id] ?? 1, maxQuantity);
            return (
              <ShopRow
                key={item.id}
                name={item.item_name + (item.quantity > 1 ? ` x${item.quantity}` : '') + (item.is_equipped ? ' (장착 중)' : '')}
                iconName={item.item_name}
                meta={
                  (item.attack_bonus > 0 ? `공격 +${item.attack_bonus} ` : '') +
                  (item.defense_bonus > 0 ? `방어 +${item.defense_bonus} ` : '') +
                  (item.heal_hp > 0 ? `체력 +${item.heal_hp} ` : '') +
                  (item.restore_mp > 0 ? `마나 +${item.restore_mp} ` : '') +
                  (item.teleport_target === 'village' ? '마을 이동 ' : '') +
                  (item.teleport_target === 'blink' ? '순간이동 ' : '') +
                  (item.haste_duration_sec > 0 ? `이속/공속 ${item.haste_duration_sec}초 ` : '')
                }
                price={item.sell_price}
                priceColor='var(--color-ink-soft)'
                actionLabel="판매"
                disabled={pendingId === item.id}
                onAction={() => handleSell(item.id, item.sell_price, stackable ? sellQuantity : 1)}
                quantity={stackable ? sellQuantity : undefined}
                onQuantityChange={stackable ? (next) => setSellQuantities((q) => ({ ...q, [item.id]: next })) : undefined}
                maxQuantity={stackable ? maxQuantity : undefined}
              />
            );
          })
        )}
      </div>
    </GamePanel>
  );
}
