import type { ReactNode } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { useQuestStore, findQuestByGiver } from '../../stores/questStore';
import { useLootStore } from '../../stores/lootStore';
import { useUIStore } from '../../stores/uiStore';
import { Hotbar } from './Hotbar';
import { TouchHud } from './TouchHud';
import { useIsTouch } from '../../lib/device';
import { Badge } from '../ui/badge';
import { Bar } from '../ui/bar';
import { Button } from '../ui/button';

const SHOP_NPC_LABEL: Record<'merchant' | 'blacksmith', string> = {
  merchant: '상인',
  blacksmith: '대장장이',
};

/** The "press a key to interact" hint floating above the status bars. */
function HudPrompt({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute bottom-[136px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-[3px] border-edge bg-cream/95 px-4 py-1 font-display text-base text-ink shadow-chunk-sm"
    >
      {children}
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
  const isTouch = useIsTouch();
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

  // Phones get their own layout (joystick, action button, compact status/hotbar) — the desktop
  // one below assumes a keyboard and a 1000px+ wide screen.
  if (isTouch) return <TouchHud />;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      {nearShopKind && <HudPrompt>{SHOP_NPC_LABEL[nearShopKind]}에게 말 걸기: Space</HudPrompt>}

      {!nearShopKind && nearQuestPrompt && <HudPrompt>{nearQuestPrompt}</HudPrompt>}

      {!nearShopKind && !nearQuestPrompt && nearDrop && <HudPrompt>{nearDrop.itemName} 줍기: F4 (클릭도 가능)</HudPrompt>}

      {/* Bottom-left: menu entry point (name/gold/keybinds now live behind it — name is
          already visible as the nametag above the character, and gold is visible in the
          inventory panel, so neither needs to be duplicated here). */}
      <Button variant="ghost" size="sm" onClick={toggleSystemMenu} className="pointer-events-auto absolute bottom-4 left-4">
        메뉴 (F1)
      </Button>

      {/* Lineage1-style status bars: level + HP/MP/EXP, centered — no name (already shown
          as the nametag above the character) or gold (visible in the inventory panel). */}
      <div className="absolute bottom-4 left-1/2 flex w-[300px] -translate-x-1/2 flex-col gap-1 rounded-panel border-[3px] border-edge bg-cream/95 px-3 py-2 shadow-panel">
        <div>
          <Badge tone="gold">Lv.{player.level}</Badge>
        </div>
        <Bar kind="hp" ratio={player.currentHp / player.maxHp} label={`HP ${player.currentHp}/${player.maxHp}`} />
        <Bar
          kind="mp"
          ratio={player.maxMp > 0 ? player.currentMp / player.maxMp : 0}
          label={`MP ${player.currentMp}/${player.maxMp}`}
        />
        <Bar kind="xp" ratio={player.experience / player.expToNext} label={`EXP ${player.experience}/${player.expToNext}`} height={14} />
      </div>

      {/* Far right: item hotbar, detached from the status cluster. */}
      <div style={{ position: 'absolute', right: 16, bottom: 16 }}>
        <Hotbar />
      </div>
    </div>
  );
}
