import { OrthographicCamera } from '@react-three/drei';
import { Ground } from './Ground';
import { CharacterMesh } from './CharacterMesh';
import { MonsterMesh } from './MonsterMesh';
import type { CharacterProfile, EnterMapResponse } from '../../types/api';

export function Scene({
  character,
  map,
}: {
  character: CharacterProfile;
  map: EnterMapResponse;
}) {
  return (
    <>
      <OrthographicCamera makeDefault position={[20, 20, 20]} zoom={40} near={0.1} far={200} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <Ground />
      <CharacterMesh character={character} />
      {map.monsters.map((monster) => (
        <MonsterMesh key={monster.instance_id} monster={monster} />
      ))}
    </>
  );
}
