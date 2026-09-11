import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCharacterStore } from '../stores/characterStore';
import { useAuthStore } from '../stores/authStore';
import type { CharacterClass } from '../types/api';
import { translateApiError } from './errorMessages';

const CLASS_OPTIONS: CharacterClass[] = ['warrior', 'mage', 'archer'];

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
    try {
      await selectCharacter(characterId);
      navigate('/game');
    } catch (err) {
      setError(translateApiError(err));
    }
  }

  async function handleDelete(characterId: number) {
    setError(null);
    try {
      await deleteCharacter(characterId);
    } catch (err) {
      setError(translateApiError(err));
    }
  }

  return (
    <div>
      <h1>캐릭터 선택</h1>
      {error && <p role="alert">{error}</p>}
      {isLoading && <p>불러오는 중...</p>}
      <ul>
        {characters.map((character) => (
          <li key={character.id}>
            {character.name} (Lv.{character.level} {character.character_class})
            <button onClick={() => handleSelect(character.id)}>선택</button>
            <button onClick={() => handleDelete(character.id)}>삭제</button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleCreate}>
        <h2>새 캐릭터 생성</h2>
        <label>
          이름
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={16}
            required
          />
        </label>
        <label>
          직업
          <select
            value={characterClass}
            onChange={(e) => setCharacterClass(e.target.value as CharacterClass)}
          >
            {CLASS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">생성</button>
      </form>

      <button onClick={() => logout()}>로그아웃</button>
    </div>
  );
}
