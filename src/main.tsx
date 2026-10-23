import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './app/providers.tsx';
import { App } from './app/App.tsx';
import { ApiContext } from './data/hooks.ts';
import { createHttpClient } from './data/client.ts';
import { publicConfig } from './data/config.ts';
import { loadUmami } from './app/analytics.ts';
import './styles/tokens.css';
import './styles/global.css';
import { installResourceRecovery, resourceRecovery } from './app/resource-runtime.ts';
installResourceRecovery();
const client =
  import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true'
    ? (await import('./demo/client.ts')).demoClient
    : createHttpClient();
let content: ReactNode = null;
const editing =
  __UPTIMEPAGE_CONFIG_EDITOR__ && new URLSearchParams(location.search).get('configeditor') === 'on';
if (editing) {
  try {
    const { EditorRoot } = await import('./features/editor/EditorRoot.tsx');
    content = <EditorRoot productionClient={client} />;
  } catch {
    void resourceRecovery.failed();
  }
}
content ??= (
  <ApiContext.Provider value={client}>
    <Providers>
      <App editorUnavailable={editing} />
    </Providers>
  </ApiContext.Provider>
);
createRoot(document.getElementById('root')!).render(<StrictMode>{content}</StrictMode>);
loadUmami(publicConfig.site.umami, { production: import.meta.env.PROD });
