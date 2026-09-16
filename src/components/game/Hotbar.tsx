import { useState } from 'react';
import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';

// Custom mime type for the drag payload (an item_template_id) — namespaced so it never
// collides with a browser default type or an unrelated drag source on the page. Set by a
// consumable GridCell in InventoryPanel.tsx; read here to assign a slot.
export const HOTBAR_DRAG_MIME = 'application/x-rpg-item-template-id';

/**
 * Quickbar for consumables — 4 slots, keys 1-4 (wired in GamePage's keydown handler).
 * Assignments are session-local only (see characterStore's hotbar field). A slot can be
 * filled two ways — whichever the player prefers — both driven from InventoryPanel: drag a
 * consumable from the grid onto a slot here, or click one of the numbered buttons next to a
 * selected consumable there. Clearing a slot is deliberately right-click-only (not
 * drag-out) — an earlier version also cleared a slot when its item was dragged out and
 * released outside the bar, but that made an accidental drag (e.g. a slightly-off click)
 * silently wipe the assignment, so it was removed per feedback; right-click is a clearer,
 * harder-to-trigger-by-accident gesture. Positioned by its parent (HUD.tsx, next to the
 * status bar) rather than self-positioning, so the two form one visual unit at the bottom
 * of the screen.
 */
export function Hotbar() {
  const hotbar = useCharacterStore((s) => s.hotbar);
  const hotbarPending = useCharacterStore((s) => s.hotbarPending);
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
        const usable = !!row && quantity > 0 && !hotbarPending[i];
        const isDragTarget = dragOverSlot === i;
        return (
          <button
            key={i}
            // Deliberately NOT using the `disabled` attribute here (even though an empty
            // slot or a used-up one shouldn't be clickable) — disabled form controls also
            // stop receiving real browser drag/drop pointer interaction in most engines, so
            // an "empty, therefore disabled" slot would silently refuse to accept a drop
            // from a real mouse drag. The click-to-use guard just lives in the handler.
            onClick={() => {
              if (usable) useHotbarSlot(i);
            }}
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
            title={row ? `${row.item_name} — 우클릭으로 해제` : '인벤토리에서 드래그하거나 번호를 눌러 등록'}
            style={{
              pointerEvents: 'auto',
              width: 52,
              height: 52,
              borderRadius: 8,
              border: `1px solid ${isDragTarget ? '#e8c97a' : 'rgba(232, 201, 122, 0.5)'}`,
              background: isDragTarget ? 'rgba(232, 201, 122, 0.25)' : 'rgba(15, 17, 13, 0.65)',
              color: usable ? '#f4f1e8' : '#5c6058',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: usable ? 'pointer' : 'default',
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
