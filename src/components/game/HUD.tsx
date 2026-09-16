import { useCombatStore } from '../../stores/combatStore';
import { useUIStore } from '../../stores/uiStore';
import { Hotbar } from './Hotbar';
import type { CharacterProfile } from '../../types/api';

const CLASS_ACCENT: Record<CharacterProfile['character_class'], string> = {
  warrior: '#f4c430',
  mage: '#9be7ff',
  archer: '#d7f79b',
};

const SHOP_NPC_LABEL: Record<'merchant' | 'blacksmith', string> = {
  merchant: '상인',
  blacksmith: '대장장이',
};

const STATUS_BAR_WIDTH = 380;

function Bar({ ratio, color, label, height = 16 }: { ratio: number; color: string; label: string; height?: number }) {
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

export function HUD({ character }: { character: CharacterProfile }) {
  const player = useCombatStore((s) => s.player);
  const accent = CLASS_ACCENT[character.character_class];
  const nearShopKind = useUIStore((s) => s.nearShopKind);

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
            bottom: 108,
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

      <div style={{ position: 'absolute', right: 10, bottom: 6, color: 'rgba(244, 241, 232, 0.5)', fontSize: 11 }}>
        F1: 메뉴
      </div>

      {/* Lineage1-style status bar: name/level + long HP/EXP bars, with the item hotbar
          attached to its right so the two read as one unit along the bottom edge. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 16,
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '8px 12px',
            borderRadius: 10,
            background: 'rgba(15, 17, 13, 0.65)',
            border: `1px solid ${accent}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ color: '#f4f1e8', fontWeight: 700, fontSize: 14 }}>
              {character.name} <span style={{ color: accent }}>Lv.{player.level}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#ffd54a', fontWeight: 700, fontSize: 12 }}>{player.gold} G</span>
              {player.skillPoints > 0 && (
                <span
                  style={{
                    color: '#e8c97a',
                    fontWeight: 700,
                    fontSize: 11,
                    padding: '2px 6px',
                    borderRadius: 999,
                    background: 'rgba(232, 201, 122, 0.2)',
                    border: '1px solid #e8c97a',
                  }}
                >
                  스킬 포인트 {player.skillPoints}
                </span>
              )}
            </span>
          </div>
          <Bar ratio={player.currentHp / player.maxHp} color="#57c25b" label={`HP ${player.currentHp}/${player.maxHp}`} />
          <Bar
            ratio={player.experience / player.expToNext}
            color="#5b9bd5"
            label={`EXP ${player.experience}/${player.expToNext}`}
            height={10}
          />
        </div>

        <Hotbar />
      </div>
    </div>
  );
}
