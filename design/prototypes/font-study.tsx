import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Link, Routes, Route } from 'react-router';
import { Activity } from 'lucide-react';
import { Providers } from '../../src/app/providers.tsx';
import { ConfigContext } from '../../src/data/config.ts';
import { ApiContext } from '../../src/data/hooks.ts';
import { editorTemplate } from '../../src/features/editor/template.ts';
import { createPreviewClient, previewConfig } from '../../src/features/editor/mock.ts';
import { StatusPage } from '../../src/features/status/StatusPage.tsx';
import { MonitorPage } from '../../src/features/monitor/MonitorPage.tsx';
import { PreferencesMenu } from '../../src/features/preferences/PreferencesMenu.tsx';
import { usePreferences } from '../../src/features/preferences/store.ts';
import { localize } from '../../src/features/preferences/locale.ts';
import { Footer } from '../../src/components/Footer.tsx';
import { ToastViewport } from '../../src/features/toasts/ToastViewport.tsx';
import '../../src/styles/tokens.css';
import '../../src/styles/global.css';
import './font-study.css';

// Reuse current page components with an isolated router, mock data and no analytics.
const choice = document.documentElement.dataset.fontStudy === 'b' ? 'b' : 'a';
const detail = new URLSearchParams(location.search).get('view') === 'detail';
const config = structuredClone(editorTemplate);
config.site.name = { en: 'UptimePage', 'zh-CN': '服务状态' };
config.site.footer = '';
const pub = previewConfig(config, 'font-study');
const client = createPreviewClient(config, pub);
document.documentElement.style.setProperty('--sans', "'MiSans', 'Microsoft YaHei', sans-serif");
document.documentElement.style.setProperty(
  '--mono',
  choice === 'b' ? 'var(--sans)' : "ui-monospace, 'Cascadia Code', Consolas, monospace",
);
const path = (variant: string, showDetail = detail) =>
  `/design/prototypes/font-${variant}.html${showDetail ? '?view=detail' : ''}`;

function FontStudy() {
  const { preferences, locale } = usePreferences();
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      document.documentElement.dataset.theme =
        preferences.theme === 'auto' ? (media.matches ? 'dark' : 'light') : preferences.theme;
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [preferences.theme]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = choice === 'a' ? 'A · MiSans + 当前等宽' : 'B · MiSans + 等宽数字';
  }, [locale]);
  return (
    <MemoryRouter initialEntries={[detail ? `/services/${pub.groups[0].id}/web-3` : '/']}>
      <header className="site-nav">
        <div className="nav-inner">
          <Link to="/" className="brand">
            <span className="brand-mark"><Activity size={23} /></span>
            <span className="brand-name">{localize(pub.site.name, locale)}</span>
          </Link>
          <div className="nav-links">
            {pub.site.nav.map((item, i) => (
              <a key={i} href={item.href}>{localize(item.label, locale)}</a>
            ))}
          </div>
          <PreferencesMenu />
        </div>
      </header>
      <main className="shell">
        <Routes>
          <Route path="/" element={<StatusPage />} />
          <Route path="/services/:groupId/:monitorId" element={<MonitorPage />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <Footer value="" commit={pub.build.commit} commitUrl={pub.build.commitUrl} />
      </footer>
      <ToastViewport topVisible={false} />
      <aside className="font-study-tools" aria-label="字体对比">
        <span>{choice === 'a' ? 'MiSans + 当前等宽' : 'MiSans + 等宽数字'}</span>
        <a href={path('a')} aria-current={choice === 'a' ? 'page' : undefined}>A</a>
        <a href={path('b')} aria-current={choice === 'b' ? 'page' : undefined}>B</a>
        <i />
        <a href={path(choice, false)}>首页</a>
        <a href={path(choice, true)}>详情</a>
      </aside>
    </MemoryRouter>
  );
}
createRoot(document.getElementById('root')!).render(
  <ConfigContext.Provider value={pub}>
    <ApiContext.Provider value={client}>
      <Providers><FontStudy /></Providers>
    </ApiContext.Provider>
  </ConfigContext.Provider>,
);
