import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Shield, Sparkles, Swords, Target, Trash2 } from 'lucide-react';
import { useCharacterStore } from '../stores/characterStore';
import { useAuthStore } from '../stores/authStore';
import type { CharacterClass } from '../types/api';
import { translateApiError } from './errorMessages';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Spinner } from '../components/ui/spinner';
import { cn } from '../lib/utils';

const CLASS_OPTIONS: { value: CharacterClass; label: string; icon: typeof Swords }[] = [
  { value: 'warrior', label: '전사', icon: Swords },
  { value: 'mage', label: '마법사', icon: Sparkles },
  { value: 'archer', label: '궁수', icon: Target },
];

export function CharactersPage() {
  const characters = useCharacterStore((s) => s.characters);
  const isLoading = useCharacterStore((s) => s.isLoading);
  const fetchCharacters = useCharacterStore((s) => s.fetchCharacters);
  const createCharacter = useCharacterStore((s) => s.createCharacter);
  const selectCharacter = useCharacterStore((s) => s.selectCharacter);
  const deleteCharacter = useCharacterStore((s) => s.deleteCharacter);
  const logout = useAuthStore((s) => s.logout);

  const [name, setName] = useState('');
  const [characterClass, setCharacterClass] = useState<CharacterClass>('warrior');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Separate from busyId (which also covers delete) so the 선택 button's spinner only shows
  // for an actual character-entry attempt, not while a different row's delete is in flight.
  const [selectingId, setSelectingId] = useState<number | null>(null);
  // Deleting a character was a single unconfirmed click away from permanently losing it —
  // this arms a "확인" state on the first click (auto-reverting after a few seconds) and only
  // actually deletes on a second click while armed, same lightweight inline-confirm pattern
  // as GitHub's delete buttons, rather than a jarring native confirm() popup.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const confirmDeleteTimer = useRef<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCharacters().catch((err) => setError(translateApiError(err)));
  }, [fetchCharacters]);

  useEffect(() => {
    return () => {
      if (confirmDeleteTimer.current) window.clearTimeout(confirmDeleteTimer.current);
    };
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createCharacter(name, characterClass);
      setName('');
    } catch (err) {
      setError(translateApiError(err));
    }
  }

  async function handleSelect(characterId: number) {
    setError(null);
    setBusyId(characterId);
    setSelectingId(characterId);
    try {
      await selectCharacter(characterId);
      navigate('/game');
    } catch (err) {
      setError(translateApiError(err));
    } finally {
      setBusyId(null);
      setSelectingId(null);
    }
  }

  async function handleDelete(characterId: number) {
    setError(null);
    setBusyId(characterId);
    try {
      await deleteCharacter(characterId);
    } catch (err) {
      setError(translateApiError(err));
    } finally {
      setBusyId(null);
    }
  }

  function handleDeleteClick(characterId: number) {
    if (confirmDeleteTimer.current) window.clearTimeout(confirmDeleteTimer.current);
    if (confirmDeleteId === characterId) {
      setConfirmDeleteId(null);
      handleDelete(characterId);
      return;
    }
    setConfirmDeleteId(characterId);
    confirmDeleteTimer.current = window.setTimeout(() => setConfirmDeleteId(null), 3000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-ink">캐릭터 선택</h1>
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            <LogOut className="size-3.5" />
            로그아웃
          </Button>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
        {isLoading && (
          <div className="mb-4 flex items-center gap-2 text-xs text-gold-dim">
            <Spinner size={16} />
            불러오는 중...
          </div>
        )}

        {characters.length > 0 && (
          <ul className="mb-6 flex flex-col gap-2">
            {characters.map((character) => {
              const ClassIcon = CLASS_OPTIONS.find((c) => c.value === character.character_class)?.icon ?? Shield;
              const busy = busyId === character.id;
              return (
                <li
                  key={character.id}
                  className="flex items-center justify-between rounded-lg border border-gold/20 bg-black/20 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <ClassIcon className="size-4 text-gold" strokeWidth={1.5} />
                    <span className="text-sm text-ink">
                      {character.name} <span className="text-gold-dim">Lv.{character.level}</span>
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" disabled={busy} onClick={() => handleSelect(character.id)}>
                      {selectingId === character.id && <Spinner size={12} />}
                      선택
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => handleDeleteClick(character.id)}
                      aria-label={confirmDeleteId === character.id ? '삭제 확인 (다시 누르면 삭제됩니다)' : '삭제'}
                    >
                      {confirmDeleteId === character.id ? (
                        <span className="whitespace-nowrap px-0.5 text-xs">정말 삭제?</span>
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={handleCreate} className="flex flex-col gap-4 border-t border-gold/15 pt-5">
          <h2 className="text-sm font-bold text-ink">새 캐릭터 생성</h2>
          <div>
            <Label htmlFor="char-name">이름</Label>
            <Input
              id="char-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={16}
              required
            />
          </div>
          <div>
            <Label>직업</Label>
            <div className="grid grid-cols-3 gap-2">
              {CLASS_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCharacterClass(value)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition-colors',
                    characterClass === value
                      ? 'border-gold bg-gold/15 text-gold'
                      : 'border-gold/20 text-gold-dim hover:border-gold/40',
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full">
            생성
          </Button>
        </form>
      </Card>
    </div>
  );
}
