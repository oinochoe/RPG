import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireActiveCharacter } from './components/RouteGuards';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { CharactersPage } from './pages/CharactersPage';
import { SessionReplacedModal } from './components/SessionReplacedModal';
import { LoadingScreen } from './components/ui/spinner';

// The 3D game (three.js + R3F) is most of the bundle — split it out so the login and
// character screens load without waiting on it.
const GamePage = lazy(() => import('./pages/GamePage').then((m) => ({ default: m.GamePage })));
// A design-kit page (every shared UI part on one screen) — lazily loaded, so it costs nothing until visited.
const DevUiPage = lazy(() => import('./pages/DevUiPage').then((m) => ({ default: m.DevUiPage })));

// The public guide: no login, and it must stay free of the 3D game bundle.
const GuidePage = lazy(() => import('./pages/GuidePage').then((m) => ({ default: m.GuidePage })));

export function App() {
  return (
    <BrowserRouter>
      <SessionReplacedModal />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
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
        <Route
          path="/dev/ui"
          element={
            <Suspense fallback={<LoadingScreen label="불러오는 중..." />}>
              <DevUiPage />
            </Suspense>
          }
        />
        <Route
          path="/guide"
          element={
            <Suspense fallback={<LoadingScreen label="불러오는 중..." />}>
              <GuidePage />
            </Suspense>
          }
        />
        <Route
          path="/guide/:tab"
          element={
            <Suspense fallback={<LoadingScreen label="불러오는 중..." />}>
              <GuidePage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
