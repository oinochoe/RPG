import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { useCharacterStore } from '../stores/characterStore';
import { useSessionStore } from '../stores/sessionStore';
import { Scene } from '../components/game/Scene';
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

  if (error) return <p role="alert">{error}</p>;
  if (!activeCharacter || !currentMap) return <p>맵 입장 중...</p>;

  return (
    <Canvas shadows style={{ width: '100vw', height: '100vh' }}>
      <Scene character={activeCharacter} map={currentMap} />
    </Canvas>
  );
}
