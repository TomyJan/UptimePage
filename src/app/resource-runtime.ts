import { createResourceRecovery } from './resource-recovery.ts';

function entryBuild(document: Document, origin: string): string | null {
  const src = document
    .querySelector<HTMLScriptElement>('script[type="module"][src]')
    ?.getAttribute('src');
  if (!src) return null;
  try {
    const url = new URL(src, origin);
    return url.origin === origin &&
      /^\/assets\/.+\.js$/.test(url.pathname) &&
      !url.search &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export const resourceRecovery = createResourceRecovery({
  currentBuild: () => entryBuild(document, location.origin),
  latestBuild: async () => {
    const response = await fetch(new URL('/', location.origin), {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return null;
    return entryBuild(
      new DOMParser().parseFromString(await response.text(), 'text/html'),
      location.origin,
    );
  },
  isEditing: () => document.body.dataset.configEditor === 'on',
  isOnline: () => navigator.onLine,
  storage: () => sessionStorage,
  reload: () => location.reload(),
});

export function installResourceRecovery() {
  // Leave the original rejection intact so React can catch the failed lazy route.
  window.addEventListener('vite:preloadError', () => {
    void resourceRecovery.failed();
  });
  window.addEventListener('online', resourceRecovery.refreshProtection);
  window.addEventListener('offline', resourceRecovery.refreshProtection);
}
