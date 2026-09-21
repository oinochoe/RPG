// Lightweight sound-effect layer — swing/hit/cast/potion/coin/footstep cues (Kenney.nl RPG
// Audio + Impact Sounds packs, CC0, credited in SystemMenu). No background music and no
// per-UI-button clicks in this pass; this covers the core combat/movement/economy loop,
// which is where a "light" sound pass pays off most.
const SOUND_FILES = {
  swing: '/audio/swing.ogg',
  hit: '/audio/hit.ogg',
  hitHeavy: '/audio/hit-heavy.ogg',
  cast: '/audio/cast.ogg',
  potion: '/audio/potion.ogg',
  coin: '/audio/coin.ogg',
  footstep0: '/audio/footstep0.ogg',
  footstep1: '/audio/footstep1.ogg',
  footstep2: '/audio/footstep2.ogg',
  footstep3: '/audio/footstep3.ogg',
} as const;

export type SoundName = keyof typeof SOUND_FILES;

const FOOTSTEP_VARIANTS: SoundName[] = ['footstep0', 'footstep1', 'footstep2', 'footstep3'];

// One base <audio> per sound, preloaded once; playSound clones it so two overlapping plays
// (e.g. two quick attacks) don't cut each other off the way reusing one element would.
const bases = new Map<SoundName, HTMLAudioElement>();

function getBase(name: SoundName): HTMLAudioElement {
  let audio = bases.get(name);
  if (!audio) {
    audio = new Audio(SOUND_FILES[name]);
    audio.preload = 'auto';
    bases.set(name, audio);
  }
  return audio;
}

export function playSound(name: SoundName, volume = 0.5): void {
  const node = getBase(name).cloneNode(true) as HTMLAudioElement;
  node.volume = volume;
  // Autoplay-policy rejections (e.g. no user gesture yet) are expected and harmless here —
  // every call site is already inside a keydown/click handler, so this is just a safety net.
  node.play().catch(() => {});
}

let footstepIndex = 0;

/** Cycles through the 4 footstep variants instead of replaying the same one every step. */
export function playFootstep(volume = 0.3): void {
  playSound(FOOTSTEP_VARIANTS[footstepIndex % FOOTSTEP_VARIANTS.length], volume);
  footstepIndex += 1;
}
