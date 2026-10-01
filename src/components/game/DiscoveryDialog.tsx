import { useEffect, useRef, useState } from 'react';
import { claimDiscovery } from '../../api/characters';
import { ApiError } from '../../types/api';
import { useCharacterStore } from '../../stores/characterStore';
import { useCombatStore } from '../../stores/combatStore';
import { useDiscoveryStore } from '../../stores/discoveryStore';
import { useUIStore } from '../../stores/uiStore';
import { Button } from '../ui/button';
import { GamePanel } from '../ui/game-panel';
import { getDiscovery, type DiscoveryDef } from './discoveries';
import { advance, linesFor, startPhase, type DialogPhase } from './discoveryDialogLogic';
import { useDraggablePanel } from './useDraggablePanel';

const PANEL_WIDTH = 320;

/** Dialogue for an inspected prop / hidden-thing NPC; the reward (if any) is claimed from the server at the end. */
export function DiscoveryDialog() {
  const id = useUIStore((s) => s.discoveryDialogId);
  const def = id ? getDiscovery(id) : undefined;
  if (!def) return null;
  return <Dialog key={def.id} def={def} />;
}

function rewardText(def: DiscoveryDef, r: { gold: number; xp: number; item_qty: number; item_template_id: number | null }): string {
  const parts: string[] = [];
  if (r.gold > 0) parts.push(`골드 ${r.gold}`);
  if (r.xp > 0) parts.push(`경험치 ${r.xp}`);
  if (r.item_template_id !== null) parts.push(`${def.reward?.itemName ?? '아이템'} x${r.item_qty}`);
  return `획득: ${parts.join(' · ')}`;
}

function Dialog({ def }: { def: DiscoveryDef }) {
  const closeDiscovery = useUIStore((s) => s.closeDiscovery);
  const alreadySeen = useDiscoveryStore.getState().seen.has(def.id);
  const [phase, setPhase] = useState<DialogPhase>(() => startPhase(def, alreadySeen));
  const [gained, setGained] = useState<string | null>(null);
  const claiming = useRef(false);
  const { frameStyle, onHeaderPointerDown } = useDraggablePanel(() => ({
    x: window.innerWidth / 2 - PANEL_WIDTH / 2,
    y: Math.max(16, window.innerHeight / 2 - 160),
  }), PANEL_WIDTH);

  async function claim() {
    if (claiming.current) return;
    claiming.current = true;
    setPhase({ step: 'reward', status: 'pending' });
    try {
      const result = await claimDiscovery(def.id);
      useDiscoveryStore.getState().markClaimed(def.id);
      useCombatStore.getState().adoptProgress(result.progress);
      useCharacterStore.getState().receiveInventory(result.inventory);
      setGained(rewardText(def, result.reward));
      setPhase({ step: 'reward', status: 'done' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.reason === 'discovery_already_claimed') {
        useDiscoveryStore.getState().markClaimed(def.id);
        setPhase({ step: 'reward', status: 'already' });
      } else {
        setPhase({ step: 'reward', status: 'failed' });
      }
    } finally {
      claiming.current = false;
    }
  }

  function finishWithoutReward() {
    if (!def.reward) {
      const characterId = useCharacterStore.getState().activeCharacter?.id;
      if (characterId !== undefined) useDiscoveryStore.getState().markSeen(characterId, def.id);
    }
    closeDiscovery();
  }

  // Next / Space / Enter: one entry point for all three.
  function next() {
    if (phase.step === 'lines') {
      const to = advance(def, phase);
      if (to.step === 'reward' && to.status === 'idle') void claim();
      else if (to.step === 'reward') finishWithoutReward();
      else setPhase(to);
      return;
    }
    if (phase.status === 'failed') void claim();
    else if (phase.status === 'done' || phase.status === 'already') closeDiscovery();
  }

  // The dialog is not on uiStore.openPanelStack, so Escape is handled here (and kept from GamePage's pause-menu
  // toggle); Space is kept from CharacterMesh's talkToNearby, which would otherwise restart the dialog.
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeDiscovery();
      } else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) nextRef.current();
      }
    }
    // A focused button would also "click" on key release; the keydown above already handled it.
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
    }
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [closeDiscovery]);

  const lines = linesFor(def, phase.step === 'lines' ? phase.seen === true : alreadySeen);
  let body: string;
  let button: string;
  let disabled = false;
  if (phase.step === 'lines') {
    body = lines[phase.index];
    button = '다음';
  } else if (phase.status === 'failed') {
    body = '…아무것도 찾지 못한 것 같다.';
    button = '다시 시도';
  } else if (phase.status === 'already') {
    body = '이미 받은 보상이다.';
    button = '닫기';
  } else if (phase.status === 'done') {
    body = gained ?? '';
    button = '닫기';
  } else {
    body = '…';
    button = '다음';
    disabled = true;
  }

  return (
    <GamePanel
      title={def.name}
      onClose={closeDiscovery}
      frameStyle={frameStyle}
      onHeaderPointerDown={onHeaderPointerDown}
      className="z-[2147483647]"
    >
      <p className="mb-3 text-sm italic leading-relaxed text-ink-soft">{body}</p>
      <Button onClick={next} disabled={disabled} className="w-full">
        {button}
      </Button>
    </GamePanel>
  );
}
