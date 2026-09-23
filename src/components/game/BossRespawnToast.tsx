import { useEffect, useState } from 'react';
import { useCharacterStore } from '../../stores/characterStore';

const VISIBLE_MS = 4000;

function formatRemaining(availableAt: string): string {
  const ms = new Date(availableAt).getTime() - Date.now();
  const hours = Math.max(0, Math.round(ms / (60 * 60 * 1000)));
  return hours <= 1 ? '약 1시간' : `약 ${hours}시간`;
}

/**
 * Watches characterStore's bossKillNotice (set by CharacterMesh right after a tracked boss
 * dies — see BOSS_KEY_BY_NAME) and announces when it'll be back, since the boss otherwise
 * just quietly stops spawning with no explanation.
 */
export function BossRespawnToast() {
  const notice = useCharacterStore((s) => s.bossKillNotice);
  const clearNotice = useCharacterStore((s) => s.clearBossKillNotice);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!notice) return;
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), VISIBLE_MS);
    const clear = setTimeout(() => clearNotice(), VISIBLE_MS + 500);
    return () => {
      clearTimeout(hide);
      clearTimeout(clear);
    };
  }, [notice, clearNotice]);

  if (!notice || !visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '30%',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 26px',
        borderRadius: 10,
        background: 'rgba(15, 17, 13, 0.85)',
        border: '2px solid #d5555b',
        color: '#f4a0a4',
        fontWeight: 700,
        fontSize: 16,
        textAlign: 'center',
        zIndex: 2147483647,
        pointerEvents: 'none',
      }}
    >
      {notice.bossName} 처치! {formatRemaining(notice.availableAt)} 후 다시 나타납니다.
    </div>
  );
}
