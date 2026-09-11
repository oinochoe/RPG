import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireActiveCharacter } from './components/RouteGuards';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { CharactersPage } from './pages/CharactersPage';
import { GamePage } from './pages/GamePage';

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
            <Route path="/game" element={<GamePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
