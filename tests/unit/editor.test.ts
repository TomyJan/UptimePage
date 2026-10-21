import { expect, it } from 'vitest';
import {
  createDraft,
  editJSON,
  editForm,
  editLocalizedText,
} from '../../src/features/editor/draft.ts';
import { editorTemplate } from '../../src/features/editor/template.ts';
import { createPreviewClient, previewConfig } from '../../src/features/editor/mock.ts';
import { groupSnapshotSchema, monitorDetailSchema } from '../../src/shared/contracts.ts';
import { editorBuildEnabled } from '../../scripts/editor-build.ts';

it('only explicitly enables the optional build', () => {
  expect(editorBuildEnabled(undefined)).toBe(false);
  expect(editorBuildEnabled('false')).toBe(false);
  expect(editorBuildEnabled('1')).toBe(false);
  expect(editorBuildEnabled('true')).toBe(true);
});
it('retains incomplete JSON and the last valid preview', () => {
  const first = createDraft(editorTemplate);
  const invalid = editJSON(first, '{"site":');
  expect(invalid.text).toBe('{"site":');
  expect(invalid.error).toBeTruthy();
  expect(invalid.valid).toEqual(first.valid);
  const unknown = editJSON(first, JSON.stringify({ ...editorTemplate, apiKey: 'must-not-export' }));
  expect(unknown.error).toBeTruthy();
  expect(unknown.valid).toEqual(first.valid);
});
it('round-trips bilingual labels, zero refresh, wildcard and display overrides', () => {
  const state = createDraft(editorTemplate);
  const value = structuredClone(state.form);
  value.site.name = { en: 'English name', 'zh-CN': '中文名称' };
  value.site.refreshIntervalSeconds = 0;
  value.groups[1].subgroups[0].monitorIds = ['*'];
  value.groups[1].monitors['monitor.with.dots'] = { name: 'A custom monitor' };
  const changed = editForm(state, value);
  expect(changed.error).toBeNull();
  const back = editJSON(state, changed.text);
  expect(back.form).toEqual(value);
  expect(back.valid.site.refreshIntervalSeconds).toBe(0);
  expect(back.valid.groups[1].monitors['monitor.with.dots'].name).toBe('A custom monitor');
});
it('rejects reserved subgroup IDs without replacing a valid preview', () => {
  const state = createDraft(editorTemplate);
  const value = structuredClone(state.form);
  value.groups[0].subgroups[0].id = 'all';
  expect(editForm(state, value).error).toContain('subgroups');
  expect(editForm(state, value).valid).toEqual(state.valid);
});
it('clearing optional Chinese text preserves English, and editing plain text preserves its fallback', () => {
  expect(editLocalizedText({ en: 'Original', 'zh-CN': '原文' }, '', 'zh-CN', true)).toEqual({
    en: 'Original',
  });
  expect(editLocalizedText('Original', '新内容', 'zh-CN', false)).toEqual({
    en: 'Original',
    'zh-CN': '新内容',
  });
  expect(editLocalizedText(undefined, '', 'en', true)).toBeUndefined();
});
it('mock data follows explicit selections and wildcard unions, including opaque IDs', async () => {
  const config = createDraft(editorTemplate).valid;
  config.groups[1].subgroups = [
    {
      id: 'specific',
      name: 'Specific',
      logo: null,
      monitorIds: ['id.with.dots', '123'],
      order: ['123'],
    },
    { id: 'another', name: 'Another', logo: null, monitorIds: ['123', '456'] },
  ];
  config.groups[1].monitors['id.with.dots'] = { name: 'Custom', description: 'Details' };
  const pub = previewConfig(config, 'preview-test');
  const api = createPreviewClient(config, pub);
  const signal = new AbortController().signal;
  const group = await api.getGroup(config.groups[1].id, signal);
  expect(groupSnapshotSchema.safeParse(group).success).toBe(true);
  expect(group.monitors.map((m) => m.id)).toEqual(['123', 'id.with.dots', '456']);
  expect(group.subgroups[0].monitorIds).toEqual(['123', 'id.with.dots']);
  const detail = await api.getMonitor(group.groupId, 'id.with.dots', '30d', signal);
  expect(monitorDetailSchema.safeParse(detail).success).toBe(true);
  expect(detail.monitor.name).toBe('Custom');
  expect(detail.monitor.description).toBe('Details');
  expect(detail.range).toBe('30d');
  expect(detail.intervalSeconds).toBe(300);
  config.groups[1].subgroups[0].monitorIds = ['*'];
  expect(
    (await createPreviewClient(config, pub).getGroup(group.groupId, signal)).monitors.length,
  ).toBeGreaterThan(3);
});
it('mock handles empty subgroups, missing monitors and cancelled work', async () => {
  const config = createDraft(editorTemplate).valid;
  config.groups[0].subgroups = [];
  const pub = previewConfig(config, 'preview-empty');
  const api = createPreviewClient(config, pub);
  const controller = new AbortController();
  expect((await api.getGroup(config.groups[0].id, controller.signal)).monitors).toEqual([]);
  await expect(
    api.getMonitor(config.groups[0].id, 'missing', '24h', controller.signal),
  ).rejects.toMatchObject({ code: 'not-found' });
  controller.abort();
  await expect(api.getGroup(config.groups[0].id, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});

it('Peekaping display overrides do not expand preview membership', () => {
  const config = createDraft(editorTemplate).valid;
  const group = config.groups[0];
  const original = createPreviewClient(config, previewConfig(config, 'before')).snapshot(group.id);
  group.monitors['not-in-status-page'] = { name: 'Must stay private' };
  group.monitors['web-1'] = { name: 'Renamed homepage' };
  const changed = createPreviewClient(config, previewConfig(config, 'after')).snapshot(group.id);
  expect(changed.monitors.map((m) => m.id)).toEqual(original.monitors.map((m) => m.id));
  expect(changed.monitors.find((m) => m.id === 'web-1')?.name).toBe('Renamed homepage');
});
