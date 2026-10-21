import { parseConfig } from '../../../config/schema.ts';

// A public example, independent of the deployed server configuration.
export const editorTemplate = parseConfig({
  site: {
    name: { en: 'My status page', 'zh-CN': '我的服务状态' },
    nav: [{ label: { en: 'Home', 'zh-CN': '首页' }, href: 'https://example.com', newTab: true }],
    footer: '',
    refreshIntervalSeconds: 60,
    pinAbnormal: true,
  },
  groups: [
    {
      id: 'core',
      name: { en: 'Our services', 'zh-CN': '自有服务' },
      source: {
        type: 'peekaping',
        baseUrl: 'https://peekaping.example.com',
        apiKeyEnv: 'PEEKAPING_API_KEY',
      },
      subgroups: [
        { id: 'web', name: { en: 'Websites', 'zh-CN': '网站' }, slug: 'web' },
        { id: 'api', name: { en: 'APIs', 'zh-CN': '接口' }, slug: 'api' },
      ],
      monitors: {
        'web-1': {
          name: { en: 'Homepage', 'zh-CN': '主页' },
          description: { en: 'Public website', 'zh-CN': '公开网站' },
        },
      },
    },
    {
      id: 'external',
      name: { en: 'External services', 'zh-CN': '外部服务' },
      source: { type: 'uptimerobot', apiKeyEnv: 'UPTIMEROBOT_API_KEY' },
      subgroups: [
        {
          id: 'tools',
          name: { en: 'Tools', 'zh-CN': '工具' },
          monitorIds: ['123456789', '123456790'],
        },
      ],
    },
  ],
  cache: {},
});
