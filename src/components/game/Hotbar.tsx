import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';

/**
 * Bottom-center quickbar for consumables — 4 slots, keys 1-4 (wired in GamePage's keydown
 * handler). Assignments are session-local only (see characterStore's hotbar field), so
 * clicking a slot here just shows what's currently bound; assigning happens from
 * CharacterPanel's inventory tab.
 */
export function Hotbar() {
  const hotbar = useCharacterStore((s) => s.hotbar);
  const inventory = useCharacterStore((s) => s.inventory);
  const useHotbarSlot = useCharacterStore((s) => s.useHotbarSlot);

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        pointerEvents: 'none',
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      {Array.from({ length: HOTBAR_SIZE }).map((_, i) => {
        const itemTemplateId = hotbar[i];
        const row = itemTemplateId != null ? inventory.find((item) => item.item_template_id === itemTemplateId) : null;
        const quantity = row?.quantity ?? 0;
        return (
          <button
            key={i}
            onClick={() => useHotbarSlot(i)}
            disabled={!row || quantity <= 0}
            style={{
              pointerEvents: 'auto',
              width: 52,
              height: 52,
              borderRadius: 8,
              border: '1px solid rgba(232, 201, 122, 0.5)',
              background: 'rgba(15, 17, 13, 0.65)',
              color: row && quantity > 0 ? '#f4f1e8' : '#5c6058',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: row && quantity > 0 ? 'pointer' : 'default',
              position: 'relative',
              padding: 0,
            }}
          >
            <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 10, color: '#9aa08f' }}>{i + 1}</span>
            {row ? (
              <>
                <span style={{ fontSize: 10, lineHeight: 1.2, textAlign: 'center', padding: '0 2px' }}>
                  {row.item_name}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#e8c97a' }}>{quantity}</span>
              </>
            ) : (
              <span style={{ fontSize: 10, color: '#5c6058' }}>빈 슬롯</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
