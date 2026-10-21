import { useEffect, useRef, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../../shared/contracts.ts';
import type { SiteConfig } from '../../../config/schema.ts';
import { App } from '../../app/App.tsx';
import { Providers } from '../../app/providers.tsx';
import { ConfigContext, publicConfig } from '../../data/config.ts';
import { ApiContext } from '../../data/hooks.ts';
import { groupKey } from '../../data/queries.ts';
import { NavigationQueryContext } from '../../components/TransitionLink.tsx';
import { createDraft, type Draft } from './draft.ts';
import { createPreviewClient, previewConfig } from './mock.ts';
import { EditorWorkspace } from './EditorWorkspace.tsx';
import './editor.css';

function runtime(config: SiteConfig, revision: number, cache: QueryClient) {
  const pub = previewConfig(config, `editor-preview-${revision}`);
  pub.build = publicConfig.build;
  const client = createPreviewClient(config, pub);
  for (const group of pub.groups)
    cache.setQueryData(groupKey(pub.configVersion, group.id), client.snapshot(group.id));
  return { pub, client };
}
export function EditorRoot({ productionClient }: { productionClient: ApiClient }) {
  const [draft, setDraft] = useState(createDraft);
  const [cache] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Infinity,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
        },
      }),
  );
  const revision = useRef(0);
  const [preview, setPreview] = useState(() => runtime(draft.valid, 0, cache));
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (active) document.body.dataset.configEditor = 'on';
    else delete document.body.dataset.configEditor;
    return () => {
      delete document.body.dataset.configEditor;
    };
  }, [active]);
  useEffect(() => {
    cache.removeQueries({
      type: 'inactive',
      predicate: (query) => query.queryKey[1] !== preview.pub.configVersion,
    });
  }, [cache, preview.pub.configVersion]);
  const change = (next: Draft) => {
    setDraft(next);
    if (next.valid !== draft.valid) setPreview(runtime(next.valid, ++revision.current, cache));
  };
  const exit = () => {
    const url = new URL(location.href);
    url.searchParams.delete('configeditor');
    let state = history.state;
    if (typeof state?.usr?.returnTo === 'string' && state.usr.returnTo.startsWith('/?')) {
      const returnTo = new URL(state.usr.returnTo, location.origin);
      returnTo.searchParams.delete('configeditor');
      state = {
        ...state,
        usr: { ...state.usr, returnTo: returnTo.pathname + returnTo.search + returnTo.hash },
      };
    }
    history.replaceState(state, '', url.pathname + url.search + url.hash);
    void cache.cancelQueries();
    cache.clear();
    setActive(false);
  };
  if (!active)
    return (
      <ApiContext.Provider value={productionClient}>
        <Providers key="production">
          <App />
        </Providers>
      </ApiContext.Provider>
    );
  return (
    <ConfigContext.Provider value={preview.pub}>
      <ApiContext.Provider value={preview.client}>
        <Providers client={cache}>
          <NavigationQueryContext.Provider value="configeditor=on">
            <App>
              <EditorWorkspace draft={draft} onChange={change} onExit={exit} />
            </App>
          </NavigationQueryContext.Provider>
        </Providers>
      </ApiContext.Provider>
    </ConfigContext.Provider>
  );
}
