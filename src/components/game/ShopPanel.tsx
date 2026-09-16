import { useEffect, useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useUIStore } from '../../stores/uiStore';
import type { CharacterProfile } from '../../types/api';

const CLASS_ACCENT: Record<CharacterProfile['character_class'], string> = {
  warrior: '#f4c430',
  mage: '#9be7ff',
  archer: '#d7f79b',
};

const SHOP_TITLE: Record<'merchant' | 'blacksmith', string> = {
  merchant: '상인의 가게',
  blacksmith: '대장장이의 가게',
};

function ShopRow({
  name,
  meta,
  price,
  priceColor,
  actionLabel,
  disabled,
  onAction,
}: {
  name: string;
  meta: string;
  price: number;
  priceColor: string;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: priceColor, fontSize: 12, fontWeight: 700 }}>{price} G</span>
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

  useEffect(() => {
    if (!isOpen || !shopKind) return;
    setError(null);
    Promise.all([fetchShop(shopKind), fetchInventory()]).catch(() => setError('상점 정보를 불러오지 못했습니다.'));
  }, [isOpen, shopKind, fetchShop, fetchInventory]);

  if (!isOpen || !shopKind) return null;

  async function handleBuy(itemTemplateId: number, price: number) {
    setError(null);
    setPendingId(itemTemplateId);
    try {
      await buyItem(itemTemplateId, price);
    } catch (err) {
      setError(err instanceof Error ? err.message : '구매 중 오류가 발생했습니다.');
    } finally {
      setPendingId(null);
    }
  }

  async function handleSell(inventoryId: number, price: number) {
    setError(null);
    setPendingId(inventoryId);
    try {
      await sellItem(inventoryId, price);
    } catch (err) {
      setError(err instanceof Error ? err.message : '판매 중 오류가 발생했습니다.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div
      onClick={closeShop}
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
          width: 340,
          background: '#1a2a1c',
          border: `2px solid ${accent}`,
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 16 }}>{SHOP_TITLE[shopKind]}</span>
          <span style={{ color: '#9aa08f', fontSize: 12 }}>ESC로 닫기</span>
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

        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {tab === 'buy' ? (
            shop.length === 0 ? (
              <p style={{ color: '#9aa08f', fontSize: 13, padding: '12px 4px' }}>판매 중인 아이템이 없습니다.</p>
            ) : (
              shop.map((item) => {
                const classOk =
                  !item.required_class || item.required_class === 'all' || item.required_class === character.character_class;
                const levelOk = character.level >= item.required_level;
                const canAfford = player.gold >= item.buy_price;
                const disabled = pendingId === item.id || !classOk || !levelOk || !canAfford;
                const bonus =
                  (item.attack_bonus > 0 ? `공격 +${item.attack_bonus} ` : '') +
                  (item.defense_bonus > 0 ? `방어 +${item.defense_bonus} ` : '');
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
                    onAction={() => handleBuy(item.id, item.buy_price)}
                  />
                );
              })
            )
          ) : inventory.length === 0 ? (
            <p style={{ color: '#9aa08f', fontSize: 13, padding: '12px 4px' }}>인벤토리가 비어 있습니다.</p>
          ) : (
            inventory.map((item) => (
              <ShopRow
                key={item.id}
                name={item.item_name + (item.is_equipped ? ' (장착 중)' : '')}
                meta={
                  (item.attack_bonus > 0 ? `공격 +${item.attack_bonus} ` : '') +
                  (item.defense_bonus > 0 ? `방어 +${item.defense_bonus}` : '')
                }
                price={item.sell_price}
                priceColor="#9aa08f"
                actionLabel="판매"
                disabled={pendingId === item.id}
                onAction={() => handleSell(item.id, item.sell_price)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
