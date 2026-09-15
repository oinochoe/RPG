import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { getActiveCharacterProfile } from './api/characters';
import { useAuthStore } from './stores/authStore';
import { useCharacterStore } from './stores/characterStore';

async function bootstrap() {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }

  useAuthStore.getState().restoreSession();

  if (useAuthStore.getState().isAuthenticated) {
    try {
      const profile = await getActiveCharacterProfile();
      useCharacterStore.setState({ activeCharacter: profile });
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
