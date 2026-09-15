import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useCharacterStore } from '../stores/characterStore';
import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';
import { Scene } from '../components/game/Scene';
import { HUD } from '../components/game/HUD';
import { WorldMap } from '../components/game/WorldMap';
import { translateApiError } from './errorMessages';

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
      } else if (e.code === 'Escape') {
        useUIStore.getState().closeMap();
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
      <HUD character={activeCharacter} />
      <WorldMap />
    </>
  );
}
