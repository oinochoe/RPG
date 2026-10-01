import { http, HttpResponse } from 'msw';
import type {
  CharacterProfile,
  CharacterSummary,
  EnterMapResponse,
  ProgressSnapshot,
} from '../types/api';
// The real server's game-economy rules (a pure module): the mock applies the SAME math so a dev
// session behaves like production instead of inventing its own numbers.
import {
  BOSSES,
  applyExperience,
  killExp,
  killGoldRange,
  parseKillBatch,
  statPointCost,
} from '../../supabase/functions/api/economyRules';

const BASE = 'http://localhost:8000/api/v1';

// Handler state normally lives only in the JS module instance of the page that
// called `worker.start()`. That instance is torn down on every full browser
// navigation (typing a new URL, following an emailed verification link, etc.),
// which is exactly how a human walks through register -> verify-email -> login
// during manual verification. To make that flow actually work across full page
// loads within the same tab/session, state is persisted to sessionStorage and
// rehydrated on module init, while still resetting for a brand new session.
const STORAGE_KEY = '__msw_mock_state__';

interface StoredUser {
  id: number;
  password: string;
  verified: boolean;
}

interface MockState {
  nextUserId: number;
  users: [string, StoredUser][];
  pendingVerificationToken: string | null;
  // Password reset: the (single) emailed token and whose account it is for.
  pendingResetToken?: string | null;
  pendingResetEmail?: string | null;
  nextCharacterId: number;
  characters: CharacterSummary[];
  activeCharacterId: number | null;
  // Keyed by character id — mirrors the real backend's PATCH /characters/me/position, which
  // persists last-known position separately from the rest of the character row.
  characterPositions: Record<number, { x: number; y: number; z: number; mapId: number }>;
  // The mock has no real per-request auth/session lookup (the login handler hands out a
  // fixed 'mock-access' token regardless of which user logged in), so there is no way to
  // identify "the calling user" from a request alone. For this single-session local mock,
  // the email of the most recently logged-in user stands in for that session.
  currentUserEmail: string | null;
  // Server-owned economy state per character (what the real DB columns hold) — see mockProgress().
  progress?: Record<number, MockProgress>;
}

interface MockProgress {
  level: number;
  experience: number;
  gold: number;
  skillPoints: number;
  skillUpgradePoints: number;
  maxHp: number;
  maxMp: number;
  attack: number;
  defense: number;
  stats: { str: number; dex: number; con: number; int: number; wis: number };
  rev: number;
}

function defaultState(): MockState {
  return {
    nextUserId: 1,
    users: [],
    pendingVerificationToken: null,
    nextCharacterId: 1,
    characters: [],
    activeCharacterId: null,
    characterPositions: {},
    currentUserEmail: null,
  };
}

function loadState(): MockState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    // sessionStorage unavailable or corrupted; fall back to a fresh mock state
  }
  return defaultState();
}

const state = loadState();
// Backfill for state persisted by an older session shape that predates this field.
state.characterPositions ??= {};
state.progress ??= {};
const users = new Map<string, StoredUser>(state.users);

function persist(): void {
  state.users = Array.from(users.entries());
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort persistence only
  }
}

function mockProgress(characterId: number): MockProgress {
  const progress = (state.progress ??= {});
  return (progress[characterId] ??= {
    level: 1,
    experience: 0,
    gold: 100,
    skillPoints: 0,
    skillUpgradePoints: 0,
    maxHp: 100,
    maxMp: 20,
    attack: 10,
    defense: 5,
    stats: { str: 5, dex: 5, con: 5, int: 5, wis: 5 },
    rev: 0,
  });
}

function toSnapshot(p: MockProgress, expGained = 0, goldGained = 0, leveledUp = false): ProgressSnapshot {
  return {
    level: p.level,
    experience: p.experience,
    gold: p.gold,
    skill_points: p.skillPoints,
    skill_upgrade_points: p.skillUpgradePoints,
    max_hp: p.maxHp,
    max_mp: p.maxMp,
    attack_power: p.attack,
    defense_power: p.defense,
    stat_str: p.stats.str,
    stat_dex: p.stats.dex,
    stat_con: p.stats.con,
    stat_int: p.stats.int,
    stat_wis: p.stats.wis,
    progress_rev: p.rev,
    exp_gained: expGained,
    gold_gained: goldGained,
    leveled_up: leveledUp,
  };
}

function toProfile(summary: CharacterSummary): CharacterProfile {
  const savedPosition = state.characterPositions[summary.id];
  const progress = mockProgress(summary.id);
  return {
    id: summary.id,
    user_id: 1,
    name: summary.name,
    character_class: summary.character_class,
    level: progress.level,
    experience: progress.experience,
    current_hp: Math.min(summary.current_hp, progress.maxHp),
    max_hp: progress.maxHp,
    current_mp: Math.min(20, progress.maxMp),
    max_mp: progress.maxMp,
    attack_power: progress.attack,
    defense_power: progress.defense,
    gold: progress.gold,
    progress_rev: progress.rev,
    skill_points: progress.skillPoints,
    skill_upgrade_points: progress.skillUpgradePoints,
    stat_str: progress.stats.str,
    stat_dex: progress.stats.dex,
    stat_con: progress.stats.con,
    stat_int: progress.stats.int,
    stat_wis: progress.stats.wis,
    skills: [],
    active_quests: [],
    boss_cooldowns: [],
    current_map_id: savedPosition?.mapId ?? summary.current_map_id,
    position_x: savedPosition?.x ?? 0,
    position_y: savedPosition?.y ?? 0,
    position_z: savedPosition?.z ?? 0,
    created_at: new Date().toISOString(),
    equipped_items: [],
    inventory: [],
  };
}

export const handlers = [
  http.post(`${BASE}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (users.has(body.email)) {
      return HttpResponse.json(
        { error: 'conflict', reason: 'email_already_registered', message: 'Email already registered.' },
        { status: 409 },
      );
    }
    users.set(body.email, { id: state.nextUserId++, password: body.password, verified: false });
    state.pendingVerificationToken = 'mock-verify-token';
    persist();
    return HttpResponse.json({}, { status: 201 });
  }),

  http.post(`${BASE}/auth/resend-verification`, async () => {
    return HttpResponse.json({}, { status: 200 });
  }),

  // Mirrors the real routes: forgot-password always answers 200 (no account enumeration) and the
  // "emailed" token is the fixed 'mock-reset-token'; reset-password enforces the same password
  // rule and consumes the token on success.
  http.post(`${BASE}/auth/forgot-password`, async ({ request }) => {
    const body = (await request.json()) as { email: string };
    if (users.has(body.email)) {
      state.pendingResetToken = 'mock-reset-token';
      state.pendingResetEmail = body.email;
      persist();
    }
    return HttpResponse.json({}, { status: 200 });
  }),

  http.post(`${BASE}/auth/reset-password`, async ({ request }) => {
    const body = (await request.json()) as { token: string; password: string };
    const strong =
      body.password.length >= 8 && /[A-Z]/.test(body.password) && /[a-z]/.test(body.password) && /[0-9]/.test(body.password);
    if (!strong) {
      return HttpResponse.json(
        { error: 'validation_failed', reason: 'weak_password', message: 'Weak password.', field: 'password' },
        { status: 400 },
      );
    }
    const email = state.pendingResetEmail;
    const user = email ? users.get(email) : undefined;
    if (!state.pendingResetToken || body.token !== state.pendingResetToken || !user) {
      return HttpResponse.json(
        { error: 'invalid_token', reason: 'token_expired_or_invalid', message: 'Invalid token.', field: 'token' },
        { status: 400 },
      );
    }
    if (user.password === body.password) {
      return HttpResponse.json(
        { error: 'validation_failed', reason: 'same_password', message: 'Same password.', field: 'password' },
        { status: 400 },
      );
    }
    user.password = body.password;
    state.pendingResetToken = null;
    state.pendingResetEmail = null;
    persist();
    return HttpResponse.json({}, { status: 200 });
  }),

  http.post(`${BASE}/auth/verify-email`, async ({ request }) => {
    const body = (await request.json()) as { token: string };
    if (body.token !== state.pendingVerificationToken) {
      return HttpResponse.json(
        { error: 'validation_failed', reason: 'token_expired_or_invalid', message: 'Invalid token.' },
        { status: 400 },
      );
    }
    for (const user of users.values()) user.verified = true;
    persist();
    return HttpResponse.json({}, { status: 200 });
  }),

  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    const user = users.get(body.email);
    if (!user || user.password !== body.password) {
      return HttpResponse.json(
        { error: 'unauthorized', reason: 'invalid_credentials', message: 'Invalid credentials.' },
        { status: 401 },
      );
    }
    state.currentUserEmail = body.email;
    persist();
    return HttpResponse.json({ access_token: 'mock-access', refresh_token: 'mock-refresh' });
  }),

  http.post(`${BASE}/auth/refresh`, () =>
    HttpResponse.json({ access_token: 'mock-access-2', refresh_token: 'mock-refresh-2' }),
  ),

  http.post(`${BASE}/auth/logout`, () => {
    state.currentUserEmail = null;
    persist();
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/characters`, async ({ request }) => {
    const body = (await request.json()) as { name: string; character_class: CharacterSummary['character_class'] };
    const currentUser = state.currentUserEmail ? users.get(state.currentUserEmail) : undefined;
    if (!currentUser || !currentUser.verified) {
      return HttpResponse.json(
        { error: 'forbidden', reason: 'email_unverified', message: 'Email not verified.' },
        { status: 403 },
      );
    }
    if (state.characters.some((c) => c.name === body.name)) {
      return HttpResponse.json(
        { error: 'conflict', reason: 'name_already_taken', message: 'Name already taken.' },
        { status: 409 },
      );
    }
    if (state.characters.length >= 4) {
      return HttpResponse.json(
        { error: 'validation_failed', reason: 'max_characters_reached', message: 'Character limit reached.' },
        { status: 400 },
      );
    }
    const summary: CharacterSummary = {
      id: state.nextCharacterId++,
      name: body.name,
      character_class: body.character_class,
      level: 1,
      current_hp: 100,
      max_hp: 100,
      current_map_id: 1,
    };
    state.characters.push(summary);
    persist();
    return HttpResponse.json(summary, { status: 201 });
  }),

  http.get(`${BASE}/characters`, () =>
    HttpResponse.json({ items: state.characters, page: 1, page_size: 20, total: state.characters.length }),
  ),

  http.post(`${BASE}/characters/:id/select`, ({ params }) => {
    const characterId = Number(params.id);
    const exists = state.characters.some((c) => c.id === characterId);
    if (!exists) {
      return HttpResponse.json(
        { error: 'not_found', reason: 'character_not_found', message: 'Character not found.' },
        { status: 404 },
      );
    }
    state.activeCharacterId = characterId;
    persist();
    return HttpResponse.json({ game_session_id: crypto.randomUUID() }, { status: 200 });
  }),

  http.delete(`${BASE}/characters/:id`, ({ params }) => {
    const index = state.characters.findIndex((c) => c.id === Number(params.id));
    if (index >= 0) state.characters.splice(index, 1);
    persist();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/characters/me`, () => {
    const active = state.characters.find((c) => c.id === state.activeCharacterId);
    if (!active) {
      return HttpResponse.json(
        { error: 'not_found', reason: 'no_active_character', message: 'No active character.' },
        { status: 404 },
      );
    }
    return HttpResponse.json(toProfile(active));
  }),

  // ---- the server-owned economy (mirrors supabase/functions/api/characters.ts) -------------------

  // Only HP/MP are the client's to save; the mock just accepts them.
  http.patch(`${BASE}/characters/me/progress`, () => HttpResponse.json({}, { status: 200 })),

  http.post(`${BASE}/characters/me/kills`, async ({ request }) => {
    const active = state.characters.find((c) => c.id === state.activeCharacterId);
    if (!active) {
      return HttpResponse.json({ error: 'not_found', reason: 'no_active_character', message: 'No active character.' }, { status: 404 });
    }
    const body = (await request.json()) as { kills?: unknown };
    const parsed = parseKillBatch(body.kills);
    if (!parsed.ok) {
      return HttpResponse.json({ error: 'validation_failed', reason: 'invalid_kills', message: 'Invalid kills.' }, { status: 400 });
    }
    const p = mockProgress(active.id);
    let exp = 0;
    let gold = 0;
    parsed.kills.forEach((k) => {
      exp += killExp(k.level);
      const [min, max] = killGoldRange(k.level);
      gold += min + Math.floor(Math.random() * (max - min + 1));
    });
    const applied = applyExperience(
      { level: p.level, experience: p.experience, maxHp: p.maxHp, attackPower: p.attack, statPoints: p.skillPoints, skillUpgradePoints: p.skillUpgradePoints },
      exp,
    );
    p.level = applied.state.level;
    p.experience = applied.state.experience;
    p.maxHp = applied.state.maxHp;
    p.attack = applied.state.attackPower;
    p.skillPoints = applied.state.statPoints;
    p.skillUpgradePoints = applied.state.skillUpgradePoints;
    p.gold = Math.min(999_999_999, p.gold + gold);
    p.rev += 1;
    persist();
    // The mock rolls no drops and tracks no boss cooldowns/quests — those need the real database.
    return HttpResponse.json({
      progress: toSnapshot(p, exp, gold, applied.leveledUp),
      results: parsed.kills.map((_, index) => ({ index, accepted: true })),
      quests_updated: [],
      boss_cooldowns: parsed.kills.some((k) => k.boss_key && k.boss_key in BOSSES) ? [] : null,
    });
  }),

  http.post(`${BASE}/characters/me/stats/allocate`, async ({ request }) => {
    const active = state.characters.find((c) => c.id === state.activeCharacterId);
    if (!active) {
      return HttpResponse.json({ error: 'not_found', reason: 'no_active_character', message: 'No active character.' }, { status: 404 });
    }
    const { stat } = (await request.json()) as { stat: 'str' | 'dex' | 'con' | 'int' | 'wis' };
    const p = mockProgress(active.id);
    if (!(stat in p.stats)) {
      return HttpResponse.json({ error: 'validation_failed', reason: 'invalid_stat', message: 'Bad stat.' }, { status: 400 });
    }
    const cost = statPointCost(p.stats[stat]);
    if (p.skillPoints < cost) {
      return HttpResponse.json({ error: 'validation_failed', reason: 'insufficient_points', message: 'Not enough points.' }, { status: 400 });
    }
    p.skillPoints -= cost;
    p.stats[stat] += 1;
    const primary = { warrior: 'str', archer: 'dex', mage: 'int' }[active.character_class];
    if (stat === primary) p.attack += 1;
    if (stat === 'con') {
      p.maxHp += 8;
      p.defense += 1;
    }
    if (stat === 'wis') p.maxMp += 4;
    p.rev += 1;
    persist();
    return HttpResponse.json({ progress: toSnapshot(p) });
  }),

  http.patch(`${BASE}/characters/me/position`, async ({ request }) => {
    const active = state.characters.find((c) => c.id === state.activeCharacterId);
    if (!active) {
      return HttpResponse.json(
        { error: 'not_found', reason: 'no_active_character', message: 'No active character.' },
        { status: 404 },
      );
    }
    const body = (await request.json()) as {
      position_x: number;
      position_y: number;
      position_z: number;
      current_map_id?: number;
    };
    state.characterPositions[active.id] = {
      x: body.position_x,
      y: body.position_y,
      z: body.position_z,
      mapId: body.current_map_id ?? active.current_map_id,
    };
    persist();
    return HttpResponse.json({}, { status: 200 });
  }),

  http.post(`${BASE}/exploration/enter-map`, async ({ request }) => {
    const body = (await request.json()) as { map_id: number };
    const response: EnterMapResponse = {
      map_id: body.map_id,
      map_name: 'Starter Field',
      position_x: 0,
      position_y: 0,
      position_z: 0,
      dungeon_instance_id: null,
      monsters: [
        {
          instance_id: 1001,
          monster_template_id: 1,
          name: 'Slime',
          level: 1,
          current_hp: 20,
          max_hp: 20,
          position_x: 4,
          position_y: 0,
          position_z: 2,
        },
        {
          instance_id: 1002,
          monster_template_id: 1,
          name: 'Slime',
          level: 1,
          current_hp: 20,
          max_hp: 20,
          position_x: -3,
          position_y: 0,
          position_z: 6,
        },
      ],
    };
    return HttpResponse.json(response);
  }),
];
