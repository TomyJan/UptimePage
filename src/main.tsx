import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './app/providers.tsx';
import { App } from './app/App.tsx';
import { ApiContext } from './data/hooks.ts';
import { createHttpClient } from './data/client.ts';
import './styles/tokens.css';
import './styles/global.css';
const client =
  import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true'
    ? (await import('./demo/client.ts')).demoClient
    : createHttpClient();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiContext.Provider value={client}>
      <Providers>
        <App />
      </Providers>
    </ApiContext.Provider>
  </StrictMode>,
);
