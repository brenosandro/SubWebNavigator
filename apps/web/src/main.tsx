import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/roboto/latin-300.css';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-600.css';
import App from './App';
import './index.css';
import { applyRootTheme, parsePersistedLayoutTheme, parsePersistedTheme, THEME_STORAGE_KEY } from '@/lib/themeStorage';
import { fetchSession } from '@/lib/api';

// Tema antes do primeiro paint (mesmo formato do index.html).
try {
  const persisted = localStorage.getItem(THEME_STORAGE_KEY);
  const pref = parsePersistedTheme(persisted);
  if (pref) applyRootTheme(pref, parsePersistedLayoutTheme(persisted));
} catch {
  /* noop */
}

// Sessão vem do servidor (cookie HttpOnly). Nada de token no armazenamento local.
void fetchSession().catch(() => {});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
