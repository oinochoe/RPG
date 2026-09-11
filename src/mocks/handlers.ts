import { http, HttpResponse } from 'msw';
import type {
  CharacterProfile,
  CharacterSummary,
  EnterMapResponse,
} from '../types/api';

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
  nextCharacterId: number;
  characters: CharacterSummary[];
  activeCharacterId: number | null;
  // The mock has no real per-request auth/session lookup (the login handler hands out a
  // fixed 'mock-access' token regardless of which user logged in), so there is no way to
  // identify "the calling user" from a request alone. For this single-session local mock,
  // the email of the most recently logged-in user stands in for that session.
  currentUserEmail: string | null;
}

function defaultState(): MockState {
  return {
    nextUserId: 1,
    users: [],
    pendingVerificationToken: null,
    nextCharacterId: 1,
    characters: [],
    activeCharacterId: null,
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
const users = new Map<string, StoredUser>(state.users);

function persist(): void {
  state.users = Array.from(users.entries());
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort persistence only
  }
}

function toProfile(summary: CharacterSummary): CharacterProfile {
  return {
    id: summary.id,
    user_id: 1,
    name: summary.name,
    character_class: summary.character_class,
    level: summary.level,
    experience: 0,
    current_hp: summary.current_hp,
    max_hp: summary.max_hp,
    current_mp: 20,
    max_mp: 20,
    attack_power: 10,
    defense_power: 5,
    gold: 100,
    skill_points: 0,
    current_map_id: summary.current_map_id,
    position_x: 0,
    position_y: 0,
    position_z: 0,
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
    return new HttpResponse(null, { status: 204 });
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
