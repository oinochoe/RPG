import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useCharacterStore } from '../stores/characterStore';
import { useCombatStore } from '../stores/combatStore';
import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';
import { Scene } from '../components/game/Scene';
import { THEME } from '../lib/theme';
import { HUD } from '../components/game/HUD';
import { LevelUpToast } from '../components/game/LevelUpToast';
import { BossRespawnToast } from '../components/game/BossRespawnToast';
import { BuffIndicator } from '../components/game/BuffIndicator';
import { PoisonIndicator } from '../components/game/PoisonIndicator';
import { SlowIndicator } from '../components/game/SlowIndicator';
import { WorldMap } from '../components/game/WorldMap';
import { MiniMap } from '../components/game/MiniMap';
import { CharacterPanel } from '../components/game/CharacterPanel';
import { InventoryPanel } from '../components/game/InventoryPanel';
import { ShopPanel } from '../components/game/ShopPanel';
import { QuestPanel } from '../components/game/QuestPanel';
import { DiscoveryDialog } from '../components/game/DiscoveryDialog';
import { QuestLogPanel } from '../components/game/QuestLogPanel';
import { SystemMenu } from '../components/game/SystemMenu';
import { TutorialModal } from '../components/game/TutorialModal';
import { LoadingScreen } from '../components/ui/spinner';
import { translateApiError } from './errorMessages';
import { useIsTouch } from '../lib/device';

const HOTBAR_KEYS: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit7: 6,
  Digit8: 7,
};

// Ragnarok-style targeting reticle — swapped in for the default cursor while a skill is
// armed (see combatStore's armedSkillId) so "click to fire" has an obvious visual cue.
const AIM_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="9" fill="none" stroke="${THEME.color.danger}" stroke-width="3"/></svg>`,
)}") 14 14, crosshair`;

export function GamePage() {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter);
  const currentMap = useSessionStore((s) => s.currentMap);
  const enterMap = useSessionStore((s) => s.enterMap);
  const armedSkillId = useCombatStore((s) => s.armedSkillId);
  const isTouch = useIsTouch();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeCharacter) {
      enterMap(activeCharacter.current_map_id).catch((err) => setError(translateApiError(err)));
    }
  }, [activeCharacter, enterMap]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'KeyM') {
        e.preventDefault();
        useUIStore.getState().toggleMap();
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        useUIStore.getState().toggleCharacterPanel();
      } else if (e.code === 'KeyI') {
        e.preventDefault();
        useUIStore.getState().toggleInventory();
      } else if (e.code === 'KeyQ') {
        e.preventDefault();
        useUIStore.getState().toggleQuestLog();
      } else if (e.code === 'F1') {
        e.preventDefault();
        useUIStore.getState().toggleSystemMenu();
      } else if (e.code === 'Escape') {
        // DiscoveryDialog isn't on openPanelStack and closes itself on Escape; don't also toggle the menu.
        if (useUIStore.getState().discoveryDialogId) return;
        // Cancels an armed skill aim first, if one's active, rather than also closing
        // whatever panel happens to be open underneath it — Escape backing out of aiming
        // should feel like its own single step.
        if (useCombatStore.getState().armedSkillId !== null) {
          useCombatStore.getState().cancelAimSkill();
        } else {
          const ui = useUIStore.getState();
          // Standard pause-menu convention: Escape backs out of whatever's open, or opens
          // the menu itself when nothing is — not just a close key. F1 still works too.
          if (ui.openPanelStack.length > 0) {
            ui.closeTopPanel();
          } else {
            ui.toggleSystemMenu();
          }
        }
      } else if (e.code in HOTBAR_KEYS) {
        const ui = useUIStore.getState();
        if (
          ui.isMapOpen ||
          ui.isCharacterPanelOpen ||
          ui.isInventoryOpen ||
          ui.isShopOpen ||
          ui.isSystemMenuOpen ||
          ui.isQuestOpen ||
          ui.isQuestLogOpen
        )
          return;
        e.preventDefault();
        const slot = HOTBAR_KEYS[e.code];
        const assignment = useCharacterStore.getState().hotbar[slot];
        // Mirrors Hotbar.tsx's onClick branch — this is the number-key shortcut for the same
        // slots, so a skill assignment arms aiming (see toggleAimSkill) the same way, not
        // through useHotbarSlot (which only knows how to consume an item).
        if (assignment?.kind === 'skill') useCombatStore.getState().toggleAimSkill(assignment.skillTemplateId);
        else useCharacterStore.getState().useHotbarSlot(slot);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!activeCharacter || !currentMap) return <LoadingScreen label="맵 입장 중..." />;

  return (
    <>
      <Canvas
        // Phones: cheaper shadows and a lower pixel ratio — soft shadows at dpr 2 is what makes
        // the field stutter on a mid-range phone.
        shadows={isTouch ? 'basic' : 'soft'}
        dpr={isTouch ? [1, 1.5] : [1, 2]}
        gl={{ toneMapping: THREE.NoToneMapping }}
        onContextMenu={(e) => e.preventDefault()}
        // 100dvh, not 100vh: on mobile browsers 100vh is the height WITHOUT the URL bar
        // showing, so the bottom of the game (hotbar, joystick) hid behind the browser chrome.
        style={{
          width: '100vw',
          height: '100dvh',
          display: 'block',
          touchAction: 'none',
          cursor: armedSkillId !== null ? AIM_CURSOR : 'auto',
        }}
      >
        <Scene character={activeCharacter} map={currentMap} />
      </Canvas>
      <HUD />
      <LevelUpToast />
      <BossRespawnToast />
      <BuffIndicator />
      <PoisonIndicator />
      <SlowIndicator />
      <MiniMap />
      <WorldMap />
      <CharacterPanel character={activeCharacter} />
      <InventoryPanel character={activeCharacter} />
      <ShopPanel character={activeCharacter} />
      <QuestPanel />
      <DiscoveryDialog />
      <QuestLogPanel />
      <SystemMenu />
      <TutorialModal />
    </>
  );
}
