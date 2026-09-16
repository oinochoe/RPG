import { useState } from 'react';
import { useCharacterStore, HOTBAR_SIZE } from '../../stores/characterStore';

// Custom mime types for the drag payload — namespaced so they never collide with a browser
// default type or an unrelated drag source on the page. Assignment itself (inventory ->
// hotbar) goes through InventoryPanel's numbered buttons, not drag-and-drop — real-browser
// mouse drags onto a slot turned out unreliable for at least one user, so that path was
// reverted. These mime types now only serve hotbar-to-hotbar interactions (rearranging, and
// dragging a slot's item out to clear it), which are self-contained within this component
// and don't depend on any other component's drag source.
export const HOTBAR_DRAG_MIME = 'application/x-rpg-item-template-id';
// Set on every hotbar-originated drag so the drop handler knows to clear the source slot
// (a move) rather than just filling the target — always present now since only hotbar
// slots (never InventoryPanel) call setData(HOTBAR_DRAG_MIME, ...).
const HOTBAR_SOURCE_SLOT_MIME = 'application/x-rpg-hotbar-source-slot';

/**
 * Quickbar for consumables — 4 slots, keys 1-4 (wired in GamePage's keydown handler).
 * Assignments are session-local only (see characterStore's hotbar field) and made from
 * InventoryPanel's numbered buttons next to a selected consumable. A filled slot can be
 * rearranged by dragging it onto another slot, or cleared by dragging it out and releasing
 * anywhere that isn't a hotbar slot, or by right-clicking it. Positioned by its parent
 * (HUD.tsx, next to the status bar) rather than self-positioning, so the two form one
 * visual unit at the bottom of the screen.
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
            // from a real mouse drag (a synthetic/dispatched drop event bypasses that
            // gating, which is why this didn't show up in earlier dispatch-based testing).
            // The click-to-use guard just lives in the handler instead.
            onClick={() => {
              if (usable) useHotbarSlot(i);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (itemTemplateId != null) setHotbarSlot(i, null);
            }}
            draggable={itemTemplateId != null}
            onDragStart={(e) => {
              if (itemTemplateId == null) return;
              e.dataTransfer.setData(HOTBAR_DRAG_MIME, String(itemTemplateId));
              e.dataTransfer.setData(HOTBAR_SOURCE_SLOT_MIME, String(i));
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={(e) => {
              // Fires on the drag SOURCE after the gesture ends. dropEffect stays 'none'
              // unless some onDragOver along the way opted in by setting it — i.e. the item
              // was released somewhere that doesn't accept it (empty space, the 3D canvas,
              // outside the window). Dropping onto another hotbar slot is handled by that
              // slot's own onDrop instead (which explicitly clears this source slot itself,
              // covered below), so this only needs to catch the "dropped nowhere" case.
              if (e.dataTransfer.dropEffect === 'none') setHotbarSlot(i, null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverSlot !== i) setDragOverSlot(i);
            }}
            onDragLeave={() => setDragOverSlot((s) => (s === i ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverSlot(null);
              const raw = e.dataTransfer.getData(HOTBAR_DRAG_MIME);
              const id = Number(raw);
              if (!raw || !Number.isInteger(id)) return;
              setHotbarSlot(i, id);

              const sourceRaw = e.dataTransfer.getData(HOTBAR_SOURCE_SLOT_MIME);
              const sourceSlot = sourceRaw ? Number(sourceRaw) : NaN;
              if (Number.isInteger(sourceSlot) && sourceSlot !== i) setHotbarSlot(sourceSlot, null);
            }}
            title={row ? `${row.item_name} — 드래그로 이동, 우클릭/드래그해서 빼기` : '인벤토리에서 등록하세요'}
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
