import * as charactersApi from '../api/characters';
import { ApiError } from '../types/api';
import type { KillReport, KillReportResponse } from '../types/api';
import { BOSS_KEY_BY_NAME, useCombatStore, type KillInfo } from './combatStore';
import { useCharacterStore } from './characterStore';
import { useLootStore, type DropItemType } from './lootStore';
import { useQuestStore } from './questStore';

/**
 * Reports the monsters this client killed to the server and applies the server's answer.
 *
 * The server owns exp/gold/level-ups, quest progress, boss cooldowns and drops (see
 * docs/superpowers/specs/2026-09-29-server-authoritative-economy-design.md). combatStore still
 * predicts a kill's reward locally so the exp bar and gold move instantly; this module then
 *   - batches kills (100ms — an AoE that kills five monsters is one request),
 *   - sends one request at a time,
 *   - draws the drops the server issued at each monster's death position,
 *   - merges quest progress / boss cooldowns, and
 *   - lets combatStore adopt the authoritative snapshot once nothing is left unconfirmed.
 */

interface QueuedKill {
  report: KillReport;
  name: string;
  position: [number, number, number];
  // Reports are credited to whichever character is active server-side, so a kill made by a
  // character the player has since switched away from must never be sent.
  characterId: number | null;
}

const FLUSH_DELAY_MS = 100;
const MAX_BATCH = 25; // the server's per-request limit
const RETRY_DELAYS_MS = [1000, 2500];

let queue: QueuedKill[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

export function reportKills(kills: KillInfo[]): void {
  if (kills.length === 0) return;
  const characterId = useCharacterStore.getState().activeCharacter?.id ?? null;
  for (const kill of kills) {
    const bossKey = BOSS_KEY_BY_NAME[kill.name];
    queue.push({
      report: {
        template_id: kill.monsterTemplateId,
        level: kill.level,
        ...(bossKey ? { boss_key: bossKey } : {}),
      },
      name: kill.name,
      position: kill.position,
      characterId,
    });
  }
  useCombatStore.getState().beginKillReports(kills.length);
  schedule();
}

function schedule(): void {
  if (timer || inFlight) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

function isRetryable(err: unknown): boolean {
  // Network failure or a server-side (5xx) error — the kills may not have been counted, so it is
  // safe to try again. A 4xx (refused: too fast / implausible) will not change on retry.
  if (err instanceof ApiError) return err.status >= 500;
  return true;
}

async function send(batch: QueuedKill[]): Promise<KillReportResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await charactersApi.reportKills(batch.map((q) => q.report));
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === RETRY_DELAYS_MS.length) break;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

async function flush(): Promise<void> {
  if (inFlight || queue.length === 0) return;
  const combat = useCombatStore.getState();
  const activeId = useCharacterStore.getState().activeCharacter?.id ?? null;

  // Drop kills that belong to a character that is no longer the active one.
  const stale = queue.filter((q) => q.characterId !== activeId);
  if (stale.length > 0) {
    queue = queue.filter((q) => q.characterId === activeId);
    combat.endKillReports(stale.length);
  }
  if (queue.length === 0) return;

  const batch = queue.splice(0, MAX_BATCH);
  inFlight = true;
  try {
    const res = await send(batch);
    applyResponse(batch, res);
  } catch {
    // Gave up, or the server refused these kills: they never counted. Stop treating them as
    // pending and re-read the server's numbers, so the exp/gold the client showed for them is taken
    // back instead of quietly drifting ahead.
    useCombatStore.getState().endKillReports(batch.length);
    void useCombatStore.getState().resyncProgress().catch(() => {
      // Best-effort; the next successful response reconciles anyway.
    });
  } finally {
    inFlight = false;
    if (queue.length > 0) schedule();
  }
}

function applyResponse(batch: QueuedKill[], res: KillReportResponse): void {
  const loot = useLootStore.getState();
  for (const result of res.results) {
    if (!result || !result.accepted || !result.drop) continue;
    const queued = batch[result.index];
    if (!queued) continue;
    loot.spawnDrop({
      serverDropId: result.drop.drop_id,
      itemTemplateId: result.drop.item_template_id,
      itemName: result.drop.item_name,
      itemType: result.drop.item_type as DropItemType,
      position: queued.position,
    });
  }

  useQuestStore.getState().applyKillUpdates(res.quests_updated);

  if (res.boss_cooldowns) {
    const bossIndex = batch.findIndex((q, i) => q.report.boss_key && res.results.find((r) => r?.index === i)?.accepted);
    const boss = bossIndex >= 0 ? batch[bossIndex] : undefined;
    useCharacterStore.getState().applyBossCooldowns(res.boss_cooldowns, boss?.report.boss_key ?? null, boss?.name ?? null);
  }

  const combat = useCombatStore.getState();
  combat.endKillReports(batch.length);
  combat.adoptProgress(res.progress);
}

/** For tests: forget everything queued and stop any pending flush. */
export function resetKillReporter(): void {
  queue = [];
  inFlight = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
