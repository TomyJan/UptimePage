import { expect, it, vi } from 'vitest';
import { loadUmami } from '../../src/app/analytics.ts';

const config = {
  scriptUrl: 'https://analytics.example.test/script.js',
  websiteId: '94db1cb1-74f4-4a40-ad6c-962362670409',
};
function environment(production = true, editor = false) {
  const script = { id: '', src: '', async: false, dataset: {} as Record<string, string> };
  const document = {
    getElementById: vi.fn(() => null),
    createElement: vi.fn(() => script),
    head: { append: vi.fn() },
  };
  return { production, editor, document: document as unknown as Document, script, dom: document };
}
it.each([null, undefined])('does not load a tracker without configuration', (value) => {
  const env = environment();
  loadUmami(value, env);
  expect(env.dom.createElement).not.toHaveBeenCalled();
});
it.each([
  [false, false],
  [true, true],
])('skips development and editor sessions', (production, editor) => {
  const env = environment(production, editor);
  loadUmami(config, env);
  expect(env.dom.createElement).not.toHaveBeenCalled();
});
it('loads one asynchronous tracker with the public website ID', () => {
  const env = environment();
  loadUmami(config, env);
  expect(env.script.src).toBe(config.scriptUrl);
  expect(env.script.async).toBe(true);
  expect(env.script.dataset.websiteId).toBe(config.websiteId);
  expect(env.dom.head.append).toHaveBeenCalledWith(env.script);
  env.dom.getElementById.mockReturnValueOnce(env.script as never);
  loadUmami(config, env);
  expect(env.dom.head.append).toHaveBeenCalledTimes(1);
});
