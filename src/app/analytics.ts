import type { PublicConfig } from '../shared/config.ts';

/** One tracker per production visit, using the deployed site configuration. */
export function loadUmami(
  config: PublicConfig['site']['umami'] | undefined,
  runtime: { production: boolean; document?: Document },
) {
  if (!config || !runtime.production) return;
  const target = runtime.document ?? document;
  if (target.getElementById('uptimepage-umami')) return;
  const script = target.createElement('script');
  script.id = 'uptimepage-umami';
  script.src = config.scriptUrl;
  script.async = true;
  script.dataset.websiteId = config.websiteId;
  target.head.append(script);
}
