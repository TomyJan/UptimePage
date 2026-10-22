import { describe, it, expect } from 'vitest';
import { parseConfig, splitConfig } from '../../config/schema.ts';
const fixture = () => ({
  site: { name: 'Test', nav: [], refreshIntervalSeconds: 60 },
  groups: [
    {
      id: 'core',
      name: { en: 'Core', 'zh-CN': '自有服务' },
      source: {
        type: 'peekaping',
        baseUrl: 'https://private.example.test',
        apiKeyEnv: 'PRIVATE_PEEK_KEY',
      },
      subgroups: [
        { id: 'web', name: 'Web', slug: 'private-slug' },
        { id: 'api', name: 'API', slug: 'other' },
      ],
    },
    {
      id: 'external',
      name: 'External',
      source: { type: 'uptimerobot', apiKeyEnv: 'ROBOT_KEY' },
      subgroups: [
        { id: 'tools', name: 'Tools', monitorIds: ['same'] },
        { id: 'cloud', name: 'Cloud', monitorIds: ['same'] },
      ],
    },
  ],
});
describe('configuration boundary', () => {
  it('keeps Umami disabled by default and exposes its public configuration when provided', () => {
    expect(parseConfig(fixture()).site.umami).toBeNull();
    const f: any = fixture();
    f.site.umami = {
      scriptUrl: 'https://analytics.example.test/script.js',
      websiteId: '94db1cb1-74f4-4a40-ad6c-962362670409',
    };
    expect(splitConfig(parseConfig(f), 'version').publicConfig.site.umami).toEqual(f.site.umami);
  });
  it.each([
    { scriptUrl: 'javascript:alert(1)', websiteId: '94db1cb1-74f4-4a40-ad6c-962362670409' },
    {
      scriptUrl: 'https://user:password@analytics.example.test/script.js',
      websiteId: '94db1cb1-74f4-4a40-ad6c-962362670409',
    },
    { scriptUrl: 'https://analytics.example.test/script.js', websiteId: 'not-a-website-id' },
  ])('rejects malformed Umami configuration', (umami) => {
    const f: any = fixture();
    f.site.umami = umami;
    expect(() => parseConfig(f)).toThrow('site.umami');
  });
  it('keeps the optional new-tab setting for public navigation links', () => {
    const f: any = fixture();
    f.site.nav = [{ label: 'Blog', href: 'https://example.test', newTab: true }];
    expect(splitConfig(parseConfig(f), 'version').publicConfig.site.nav).toEqual([
      { label: 'Blog', href: 'https://example.test', newTab: true },
    ]);
  });
  it('splits private connection and selection fields from static public output', () => {
    const result = splitConfig(parseConfig(fixture()), 'version');
    expect(JSON.stringify(result.publicConfig)).not.toMatch(
      /private.example.test|PRIVATE_PEEK_KEY|private-slug|monitorIds|apiKeyEnv|source/,
    );
    expect(result.serverConfig.groups[0].source.apiKeyEnv).toBe('PRIVATE_PEEK_KEY');
  });
  it('keeps build commit metadata in the public config for the fixed footer', () => {
    const result = splitConfig(parseConfig(fixture()), 'version', {
      commit: 'aabbccd',
      commitUrl: 'https://github.com/TomyJan/UptimePage/commit/aabbccd',
    });
    expect(result.publicConfig.build).toEqual({
      commit: 'aabbccd',
      commitUrl: 'https://github.com/TomyJan/UptimePage/commit/aabbccd',
    });
    expect(result.publicConfig.site.footer).toBe('');
  });
  it('accepts duplicate monitor membership and arbitrarily many groups', () => {
    expect(parseConfig(fixture()).groups).toHaveLength(2);
    const f = fixture();
    f.groups = Array.from({ length: 150 }, (_, i) => ({ ...f.groups[0], id: `group-${i}` }));
    expect(parseConfig(f).groups).toHaveLength(150);
  });
  it.each([
    ['groups', (f: any) => (f.groups = [])],
    ['groups.1.id', (f: any) => (f.groups[1].id = 'core')],
    ['groups.0.subgroups.1.id', (f: any) => (f.groups[0].subgroups[1].id = 'web')],
    ['groups.0.subgroups.0.id', (f: any) => (f.groups[0].subgroups[0].id = 'all')],
    ['groups.0.logo', (f: any) => (f.groups[0].logo = 'javascript:alert(1)')],
    ['groups.1.subgroups.0.order', (f: any) => (f.groups[1].subgroups[0].order = ['not-selected'])],
  ])('reports invalid configuration at %s', (path, change) => {
    const f = fixture();
    change(f);
    expect(() => parseConfig(f)).toThrow(path);
  });
  it('rejects unknown fields rather than shipping credentials under another property', () => {
    const f: any = fixture();
    f.groups[0].source.apiKey = 'secret';
    expect(() => parseConfig(f)).toThrow('source');
  });
  it.each([
    'not-a-url',
    'https://user:secret@example.test',
    'https://example.test?key=secret',
    'https://example.test#fragment',
  ])('rejects malformed or credential-bearing source URLs: %s', (url) => {
    const f = fixture();
    f.groups[0].source.baseUrl = url;
    expect(() => parseConfig(f)).toThrow('groups.0.source.baseUrl');
  });
});
