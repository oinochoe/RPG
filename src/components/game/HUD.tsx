import { useCombatStore } from '../../stores/combatStore';
import { useQuestStore, findQuestByGiver } from '../../stores/questStore';
import { useLootStore } from '../../stores/lootStore';
import { useUIStore } from '../../stores/uiStore';
import { Hotbar } from './Hotbar';

const SHOP_NPC_LABEL: Record<'merchant' | 'blacksmith', string> = {
  merchant: '상인',
  blacksmith: '대장장이',
};

const STATUS_BAR_WIDTH = 320;

function Bar({ ratio, color, label, height = 14 }: { ratio: number; color: string; label: string; height?: number }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <div
      style={{
        position: 'relative',
        width: STATUS_BAR_WIDTH,
        height,
        borderRadius: 4,
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(232, 201, 122, 0.3)',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${clamped * 100}%`, height: '100%', background: color, transition: 'width 200ms ease-out' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: '#f4f1e8',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function HUD() {
  const player = useCombatStore((s) => s.player);
  const nearShopKind = useUIStore((s) => s.nearShopKind);
  const nearQuestNpcName = useUIStore((s) => s.nearQuestNpcName);
  const quests = useQuestStore((s) => s.quests);
  const nearDropId = useUIStore((s) => s.nearDropId);
  const drops = useLootStore((s) => s.drops);
  const toggleSystemMenu = useUIStore((s) => s.toggleSystemMenu);
  const nearDrop = nearDropId !== null ? drops.find((d) => d.id === nearDropId) : undefined;

  // Only relevant while standing near a quest NPC — null otherwise, so the JSX below can
  // stay a single `nearQuestNpcName &&` guard without re-deriving this every render.
  const nearQuest = nearQuestNpcName ? findQuestByGiver(nearQuestNpcName, quests) : undefined;
  const nearQuestState = nearQuest ? quests[nearQuest.id] : undefined;
  const nearQuestPrompt = nearQuestNpcName
    ? nearQuestState?.status === 'in_progress' && nearQuestState.progress_count >= (nearQuest?.targetCount ?? Infinity)
      ? `${nearQuestNpcName}에게 보상 받기: Space`
      : `${nearQuestNpcName}에게 말 걸기: Space`
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      {nearShopKind && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 96,
            transform: 'translateX(-50%)',
            color: '#e8c97a',
            fontWeight: 700,
            fontSize: 13,
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}
        >
          {SHOP_NPC_LABEL[nearShopKind]}에게 말 걸기: Space
        </div>
      )}

      {!nearShopKind && nearQuestPrompt && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 96,
            transform: 'translateX(-50%)',
            color: '#e8c97a',
            fontWeight: 700,
            fontSize: 13,
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}
        >
          {nearQuestPrompt}
        </div>
      )}

      {!nearShopKind && !nearQuestPrompt && nearDrop && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 96,
            transform: 'translateX(-50%)',
            color: '#e8c97a',
            fontWeight: 700,
            fontSize: 13,
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}
        >
          {nearDrop.itemName} 줍기: F4 (클릭도 가능)
        </div>
      )}

      {/* Bottom-left: menu entry point (name/gold/keybinds now live behind it — name is
          already visible as the nametag above the character, and gold is visible in the
          inventory panel, so neither needs to be duplicated here). */}
      <button
        onClick={toggleSystemMenu}
        style={{
          pointerEvents: 'auto',
          position: 'absolute',
          left: 16,
          bottom: 16,
          padding: '8px 14px',
          borderRadius: 8,
          border: '1px solid rgba(232, 201, 122, 0.5)',
          background: 'rgba(15, 17, 13, 0.65)',
          color: '#e8c97a',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        메뉴 (F1)
      </button>

      {/* Lineage1-style status bars: level + HP/MP/EXP, centered — no name (already shown
          as the nametag above the character) or gold (visible in the inventory panel). */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 16,
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          padding: '8px 12px',
          borderRadius: 10,
          background: 'rgba(15, 17, 13, 0.65)',
          border: '1px solid rgba(232, 201, 122, 0.4)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        }}
      >
        <span style={{ color: '#e8c97a', fontWeight: 700, fontSize: 12 }}>Lv.{player.level}</span>
        <Bar ratio={player.currentHp / player.maxHp} color="#57c25b" label={`HP ${player.currentHp}/${player.maxHp}`} />
        <Bar ratio={player.maxMp > 0 ? player.currentMp / player.maxMp : 0} color="#5b8bd5" label={`MP ${player.currentMp}/${player.maxMp}`} />
        <Bar
          ratio={player.experience / player.expToNext}
          color="#d5a85b"
          label={`EXP ${player.experience}/${player.expToNext}`}
          height={10}
        />
      </div>

      {/* Far right: item hotbar, detached from the status cluster. */}
      <div style={{ position: 'absolute', right: 16, bottom: 16 }}>
        <Hotbar />
      </div>
    </div>
  );
}
