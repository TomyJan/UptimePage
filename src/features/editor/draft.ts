import { parseConfig, type SiteConfig } from '../../../config/schema.ts';
import { editorTemplate } from './template.ts';
import type { LocalizedText, Locale } from '../../shared/contracts.ts';

export function editLocalizedText(
  value: LocalizedText | '' | undefined,
  text: string,
  language: Locale,
  optional: boolean,
): LocalizedText | undefined {
  const result: Exclude<LocalizedText, string> =
    typeof value === 'object' ? { ...value } : { en: value || '' };
  if (language === 'zh-CN' && !text) delete result['zh-CN'];
  else result[language] = text;
  if (optional && !result.en && !result['zh-CN']) return undefined;
  return result;
}

export interface Draft {
  text: string;
  form: SiteConfig;
  valid: SiteConfig;
  error: string | null;
}
export function createDraft(value: unknown = editorTemplate): Draft {
  const config = parseConfig(structuredClone(value));
  return { text: JSON.stringify(config, null, 2), form: config, valid: config, error: null };
}
export function editJSON(previous: Draft, text: string): Draft {
  try {
    const form = parseConfig(JSON.parse(text));
    return { text, form, valid: form, error: null };
  } catch (error) {
    return { ...previous, text, error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}
export function editForm(previous: Draft, form: SiteConfig): Draft {
  const text = JSON.stringify(form, null, 2);
  try {
    return { text, form, valid: parseConfig(form), error: null };
  } catch (error) {
    return {
      ...previous,
      text,
      form,
      error: error instanceof Error ? error.message : 'Invalid configuration',
    };
  }
}
