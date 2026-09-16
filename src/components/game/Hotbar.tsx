import { useState } from 'react';
import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';

// Custom mime type for the drag payload (an item_template_id) — namespaced so this never
// collides with a browser default type or an unrelated drag source on the page.
export const HOTBAR_DRAG_MIME = 'application/x-rpg-item-template-id';

/**
 * Quickbar for consumables — 4 slots, keys 1-4 (wired in GamePage's keydown handler).
 * Assignments are session-local only (see characterStore's hotbar field). A slot is filled
 * by dragging a consumable from InventoryPanel's grid onto it (see GridCell's
 * draggable/onDragStart); right-click clears a slot. Positioned by its parent (HUD.tsx,
 * next to the status bar) rather than self-positioning, so the two form one visual unit at
 * the bottom of the screen.
 */
export function Hotbar() {
  const hotbar = useCharacterStore((s) => s.hotbar);
  const inventory = useCharacterStore((s) => s.inventory);
  const useHotbarSlot = useCharacterStore((s) => s.useHotbarSlot);
  const setHotbarSlot = useCharacterStore((s) => s.setHotbarSlot);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {Array.from({ length: HOTBAR_SIZE }).map((_, i) => {
        const itemTemplateId = hotbar[i];
        const row = itemTemplateId != null ? inventory.find((item) => item.item_template_id === itemTemplateId) : null;
        const quantity = row?.quantity ?? 0;
        const isDragTarget = dragOverSlot === i;
        return (
          <button
            key={i}
            onClick={() => useHotbarSlot(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (itemTemplateId != null) setHotbarSlot(i, null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (dragOverSlot !== i) setDragOverSlot(i);
            }}
            onDragLeave={() => setDragOverSlot((s) => (s === i ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverSlot(null);
              const raw = e.dataTransfer.getData(HOTBAR_DRAG_MIME);
              const id = Number(raw);
              if (raw && Number.isInteger(id)) setHotbarSlot(i, id);
            }}
            disabled={!row || quantity <= 0}
            title={row ? `${row.item_name} — 우클릭으로 해제` : '아이템을 드래그해서 등록'}
            style={{
              pointerEvents: 'auto',
              width: 52,
              height: 52,
              borderRadius: 8,
              border: `1px solid ${isDragTarget ? '#e8c97a' : 'rgba(232, 201, 122, 0.5)'}`,
              background: isDragTarget ? 'rgba(232, 201, 122, 0.25)' : 'rgba(15, 17, 13, 0.65)',
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
