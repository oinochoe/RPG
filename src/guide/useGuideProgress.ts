import { useCallback, useEffect, useMemo, useState } from 'react';
import { listCharacters, listClaimedDiscoveriesFor } from '../api/characters';
import { readSeenIds } from '../stores/discoveryStore';
import { useAuthStore } from '../stores/authStore';
import type { CharacterSummary } from '../types/api';
import { chooseDefaultCharacter, mergeFound } from './guideProgress';

const CHOSEN_KEY = 'rpg.guide.character';

export type GuideProgress =
  | { status: 'anonymous' | 'loading' | 'error'; found: ReadonlySet<string> }
  | {
      status: 'ready';
      characters: CharacterSummary[];
      selectedId: number | null;
      select: (id: number) => void;
      found: ReadonlySet<string>;
    };

const NONE: ReadonlySet<string> = new Set();

function readChosen(): number | null {
  try {
    const n = Number(localStorage.getItem(CHOSEN_KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Which discoveries the logged-in player has found, for the public guide. Anonymous visitors cause no network
 * calls. found = ids the server says were claimed (read-only route, no game session) ∪ ids this browser saw.
 */
export function useGuideProgress(): GuideProgress {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [list, setList] = useState<{ status: 'loading' | 'error' | 'ready'; characters: CharacterSummary[] }>({ status: 'loading', characters: [] });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Tagged with the character it belongs to, so a response for a previously selected character never shows.
  const [claimed, setClaimed] = useState<{ id: number; ids: string[] } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setList({ status: 'loading', characters: [] });
    listCharacters(1, 50)
      .then((res) => {
        if (cancelled) return;
        setList({ status: 'ready', characters: res.items });
        setSelectedId(chooseDefaultCharacter(res.items, readChosen()));
      })
      .catch(() => {
        if (!cancelled) setList({ status: 'error', characters: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || selectedId === null) return;
    let cancelled = false;
    listClaimedDiscoveriesFor(selectedId)
      .then((res) => {
        if (!cancelled) setClaimed({ id: selectedId, ids: res.claimed });
      })
      .catch(() => {
        if (!cancelled) setClaimed({ id: selectedId, ids: [] }); // degrade to what this browser remembers
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, selectedId]);

  const select = useCallback((id: number) => {
    setSelectedId(id);
    try {
      localStorage.setItem(CHOSEN_KEY, String(id));
    } catch {
      // Storage blocked: the choice just lasts for this page load.
    }
  }, []);

  const found = useMemo(
    () => (selectedId === null ? NONE : mergeFound(claimed?.id === selectedId ? claimed.ids : [], readSeenIds(selectedId))),
    [selectedId, claimed],
  );

  if (!isAuthenticated) return { status: 'anonymous', found: NONE };
  if (list.status !== 'ready') return { status: list.status, found: NONE };
  return { status: 'ready', characters: list.characters, selectedId, select, found };
}
