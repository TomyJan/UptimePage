import type { PublicConfig } from '../shared/config.ts';

/** One tracker per production visit; editing sessions never send analytics. */
export function loadUmami(
  config: PublicConfig['site']['umami'] | undefined,
  runtime: { production: boolean; editor: boolean; document?: Document },
) {
  if (!config || !runtime.production || runtime.editor) return;
  const target = runtime.document ?? document;
  if (target.getElementById('uptimepage-umami')) return;
  const script = target.createElement('script');
  script.id = 'uptimepage-umami';
  script.src = config.scriptUrl;
  script.async = true;
  script.dataset.websiteId = config.websiteId;
  target.head.append(script);
}
