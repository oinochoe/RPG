import { FormEvent, useEffect, useState } from 'react';
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
  const navigate = useNavigate();

  useEffect(() => {
    fetchCharacters().catch((err) => setError(translateApiError(err)));
  }, [fetchCharacters]);

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
    try {
      await selectCharacter(characterId);
      navigate('/game');
    } catch (err) {
      setError(translateApiError(err));
    } finally {
      setBusyId(null);
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
        {isLoading && <p className="mb-4 text-xs text-gold-dim">불러오는 중...</p>}

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
                      선택
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => handleDelete(character.id)}
                      aria-label="삭제"
                    >
                      <Trash2 className="size-3.5" />
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
