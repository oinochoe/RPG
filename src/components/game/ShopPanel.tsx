import { useEffect, useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useUIStore } from '../../stores/uiStore';
import { useDraggablePanel } from './useDraggablePanel';
import type { CharacterProfile } from '../../types/api';

const PANEL_WIDTH = 340;

const CLASS_ACCENT: Record<CharacterProfile['character_class'], string> = {
  warrior: '#f4c430',
  mage: '#9be7ff',
  archer: '#d7f79b',
};

const SHOP_TITLE: Record<'merchant' | 'blacksmith', string> = {
  merchant: '상인의 가게',
  blacksmith: '대장장이의 가게',
};

// quantity/onQuantityChange/maxQuantity are only passed for stackable buy rows (see
// ShopPanel's equip_slot === null check) — equip gear and the sell tab always buy/sell one
// at a time, so those rows render without a stepper at all rather than a stepper stuck at 1.
function ShopRow({
  name,
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
  return (
    <div
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
        <div style={{ color: '#f4f1e8', fontSize: 13, fontWeight: 600 }}>{name}</div>
        <div style={{ color: '#9aa08f', fontSize: 11 }}>{meta}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {hasStepper && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: '1px solid rgba(232, 201, 122, 0.5)',
                background: 'rgba(255,255,255,0.05)',
                color: quantity <= 1 ? '#5c6058' : '#e8c97a',
                fontSize: 11,
                lineHeight: 1,
                cursor: quantity <= 1 ? 'default' : 'pointer',
                padding: 0,
              }}
            >
              −
            </button>
            <span style={{ color: '#f4f1e8', fontSize: 12, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>
              {quantity}
            </span>
            <button
              onClick={() => onQuantityChange(Math.min(maxQuantity ?? 99, quantity + 1))}
              disabled={maxQuantity !== undefined && quantity >= maxQuantity}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: '1px solid rgba(232, 201, 122, 0.5)',
                background: 'rgba(255,255,255,0.05)',
                color: maxQuantity !== undefined && quantity >= maxQuantity ? '#5c6058' : '#e8c97a',
                fontSize: 11,
                lineHeight: 1,
                cursor: maxQuantity !== undefined && quantity >= maxQuantity ? 'default' : 'pointer',
                padding: 0,
              }}
            >
              +
            </button>
          </div>
        )}
        <span style={{ color: priceColor, fontSize: 12, fontWeight: 700, minWidth: 48, textAlign: 'right' }}>
          {totalPrice} G
        </span>
        <button
          onClick={onAction}
          disabled={disabled}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #e8c97a',
            background: 'rgba(255,255,255,0.05)',
            color: disabled ? '#6a6a5f' : '#e8c97a',
            fontSize: 12,
            fontWeight: 700,
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

export function ShopPanel({ character }: { character: CharacterProfile }) {
  const isOpen = useUIStore((s) => s.isShopOpen);
  const shopKind = useUIStore((s) => s.shopKind);
  const closeShop = useUIStore((s) => s.closeShop);
  const player = useCombatStore((s) => s.player);
  const shop = useCharacterStore((s) => s.shop);
  const inventory = useCharacterStore((s) => s.inventory);
  const fetchShop = useCharacterStore((s) => s.fetchShop);
  const fetchInventory = useCharacterStore((s) => s.fetchInventory);
  const buyItem = useCharacterStore((s) => s.buyItem);
  const sellItem = useCharacterStore((s) => s.sellItem);
  const accent = CLASS_ACCENT[character.character_class];
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  // Per-item buy quantity, keyed by item_template_id — local UI state only, reset isn't
  // needed since a fresh shop open starts every row back at the 1 default via the ?? below.
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  // Same idea for the sell tab, keyed by inventory row id instead of item_template_id (two
  // different stacks of the same item would otherwise share one quantity by mistake).
  const [sellQuantities, setSellQuantities] = useState<Record<number, number>>({});
  const { position, onHeaderMouseDown } = useDraggablePanel(() => ({
    x: window.innerWidth / 2 - PANEL_WIDTH / 2,
    y: Math.max(16, window.innerHeight / 2 - 200),
  }));

  useEffect(() => {
    if (!isOpen || !shopKind) return;
    setError(null);
    Promise.all([fetchShop(shopKind), fetchInventory()]).catch(() => setError('상점 정보를 불러오지 못했습니다.'));
  }, [isOpen, shopKind, fetchShop, fetchInventory]);

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
          marginBottom: 4,
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>{SHOP_TITLE[shopKind]}</span>
        <button
          onClick={closeShop}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9aa08f',
            fontSize: 16,
            cursor: 'pointer',
            lineHeight: 1,
            padding: 2,
          }}
          title="닫기 (ESC)"
        >
          ✕
        </button>
      </div>
      <div style={{ color: '#ffd54a', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{player.gold} G 보유</div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {(['buy', 'sell'] as const).map((t) => (
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
              {t === 'buy' ? '구매' : '판매'}
            </button>
          ))}
        </div>

        {error && <p style={{ color: '#e0538a', fontSize: 12, marginBottom: 8 }}>{error}</p>}

        <div className="custom-scroll" style={{ maxHeight: 280, overflowY: 'auto' }}>
          {tab === 'buy' ? (
            shop.length === 0 ? (
              <p style={{ color: '#9aa08f', fontSize: 13, padding: '12px 4px' }}>판매 중인 아이템이 없습니다.</p>
            ) : (
              shop.map((item) => {
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
                  (item.teleport_target === 'blink' ? '순간이동 ' : '');
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
                    meta={[bonus, restriction].filter(Boolean).join('· ')}
                    price={item.buy_price}
                    priceColor="#ffd54a"
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
            <p style={{ color: '#9aa08f', fontSize: 13, padding: '12px 4px' }}>인벤토리가 비어 있습니다.</p>
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
                  meta={
                    (item.attack_bonus > 0 ? `공격 +${item.attack_bonus} ` : '') +
                    (item.defense_bonus > 0 ? `방어 +${item.defense_bonus} ` : '') +
                    (item.heal_hp > 0 ? `체력 +${item.heal_hp} ` : '') +
                    (item.restore_mp > 0 ? `마나 +${item.restore_mp} ` : '') +
                    (item.teleport_target === 'village' ? '마을 이동 ' : '') +
                    (item.teleport_target === 'blink' ? '순간이동 ' : '')
                  }
                  price={item.sell_price}
                  priceColor="#9aa08f"
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
    </div>
  );
}
