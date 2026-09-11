import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useCharacterStore } from '../stores/characterStore';

export function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireActiveCharacter() {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter);
  if (!activeCharacter) return <Navigate to="/characters" replace />;
  return <Outlet />;
}
