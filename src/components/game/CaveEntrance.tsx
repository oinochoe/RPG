import { DUNGEON_ENTRANCES, type DungeonId } from './worldColliders';
import { DUNGEON_META } from './Dungeon';
import { NameTag } from './NameTag';

/**
 * A dungeon's cave mouth, visible from the field. Purely decorative — the actual
 * enter-dungeon trigger is a proximity check in AreaTransitions.tsx, not a click. One of
 * these per DUNGEON_ENTRANCES entry (see worldColliders.ts) — same rock-pile shape reused for
 * all 3 (told apart by their name tag and where they sit in the world, not by silhouette).
 */
function SingleCaveEntrance({ dungeonId }: { dungeonId: DungeonId }) {
  const { point } = DUNGEON_ENTRANCES[dungeonId];
  const { name } = DUNGEON_META[dungeonId];
  return (
    <group position={[point[0], 0, point[1]]}>
      <mesh castShadow receiveShadow position={[-2.2, 1.1, -1.2]}>
        <dodecahedronGeometry args={[2, 0]} />
        <meshStandardMaterial color="#6b655a" roughness={0.95} flatShading />
      </mesh>
      <mesh castShadow receiveShadow position={[2.2, 1.3, -1.2]}>
        <dodecahedronGeometry args={[2.2, 0]} />
        <meshStandardMaterial color="#5e584e" roughness={0.95} flatShading />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[1.6, 24]} />
        <meshStandardMaterial color="#0a0a0c" roughness={1} />
      </mesh>
      <pointLight position={[0, 1, 0.5]} color="#ff9a3c" intensity={0.5} distance={5} />
      <NameTag position={[0, 2.6, -1.2]} label={name} accent="#c084fc" />
    </group>
  );
}

export function CaveEntrance() {
  return (
    <>
      {(Object.keys(DUNGEON_ENTRANCES) as DungeonId[]).map((id) => (
        <SingleCaveEntrance key={id} dungeonId={id} />
      ))}
    </>
  );
}
