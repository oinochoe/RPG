import type { CharacterProfile } from '../../types/api';

/** Each class's signature color for panel headings and level text — all dark enough to read on cream. */
export const CLASS_ACCENT: Record<CharacterProfile['character_class'], string> = {
  warrior: 'var(--color-gold-ink)',
  mage: 'var(--color-sky-ink)',
  archer: 'var(--color-mint-ink)',
};
