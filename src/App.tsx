import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireActiveCharacter } from './components/RouteGuards';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { CharactersPage } from './pages/CharactersPage';
import { LoadingScreen } from './components/ui/spinner';

// The 3D game (three.js + R3F) is most of the bundle — split it out so the login and
// character screens load without waiting on it.
const GamePage = lazy(() => import('./pages/GamePage').then((m) => ({ default: m.GamePage })));

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/characters" element={<CharactersPage />} />
          <Route element={<RequireActiveCharacter />}>
            <Route
              path="/game"
              element={
                <Suspense fallback={<LoadingScreen label="게임 불러오는 중..." />}>
                  <GamePage />
                </Suspense>
              }
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
