import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useCharacterStore } from '../stores/characterStore';
import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';
import { Scene } from '../components/game/Scene';
import { HUD } from '../components/game/HUD';
import { LevelUpToast } from '../components/game/LevelUpToast';
import { WorldMap } from '../components/game/WorldMap';
import { CharacterPanel } from '../components/game/CharacterPanel';
import { InventoryPanel } from '../components/game/InventoryPanel';
import { ShopPanel } from '../components/game/ShopPanel';
import { SystemMenu } from '../components/game/SystemMenu';
import { translateApiError } from './errorMessages';

const HOTBAR_KEYS: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };

export function GamePage() {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter);
  const currentMap = useSessionStore((s) => s.currentMap);
  const enterMap = useSessionStore((s) => s.enterMap);
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
      } else if (e.code === 'F1') {
        e.preventDefault();
        useUIStore.getState().toggleSystemMenu();
      } else if (e.code === 'Escape') {
        useUIStore.getState().closeTopPanel();
      } else if (e.code in HOTBAR_KEYS) {
        const ui = useUIStore.getState();
        if (ui.isMapOpen || ui.isCharacterPanelOpen || ui.isInventoryOpen || ui.isShopOpen || ui.isSystemMenuOpen) return;
        e.preventDefault();
        useCharacterStore.getState().useHotbarSlot(HOTBAR_KEYS[e.code]);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!activeCharacter || !currentMap) return <p>맵 입장 중...</p>;

  return (
    <>
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        style={{ width: '100vw', height: '100vh', display: 'block' }}
      >
        <Scene character={activeCharacter} map={currentMap} />
      </Canvas>
      <HUD />
      <LevelUpToast />
      <WorldMap />
      <CharacterPanel character={activeCharacter} />
      <InventoryPanel character={activeCharacter} />
      <ShopPanel character={activeCharacter} />
      <SystemMenu />
    </>
  );
}
