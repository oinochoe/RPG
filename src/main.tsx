import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { getActiveCharacterProfile } from './api/characters';
import { useAuthStore } from './stores/authStore';
import { useCharacterStore, loadHotbar } from './stores/characterStore';

async function bootstrap() {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }

  useAuthStore.getState().restoreSession();

  if (useAuthStore.getState().isAuthenticated) {
    try {
      const profile = await getActiveCharacterProfile();
      // A page reload/re-login never goes through characterStore's own selectCharacter
      // action (that's only the character-select screen's flow), so it has to redo that
      // action's hotbar hydration here too — otherwise every reload silently reset the
      // hotbar to empty even after it was made to survive one (see characterStore.ts's
      // loadHotbar/saveHotbar).
      useCharacterStore.setState({
        activeCharacter: profile,
        inventory: profile.inventory,
        hotbar: loadHotbar(profile.id),
      });
    } catch {
      // No active character selected server-side yet, or the session is
      // actually stale — either way, route guards handle it correctly
      // (RequireActiveCharacter redirects to /characters if this is null).
    }
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
