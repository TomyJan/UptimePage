import {useScrollChrome} from '../features/scroll/useScrollChrome.ts';
import {BackToTop} from '../features/scroll/BackToTop.tsx';
import {ToastViewport} from '../features/toasts/ToastViewport.tsx';
import {TransitionLink} from '../components/TransitionLink.tsx';
import { lazy,Suspense } from 'react';
const MonitorPage=lazy(()=>import('../features/monitor/MonitorPage.tsx').then(m=>({default:m.MonitorPage})));
import { StatusPage } from '../features/status/StatusPage.tsx';
import { useEffect } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { Activity } from 'lucide-react';
import publicConfig from '../../.generated/public-config.ts';
import { PreferencesMenu } from '../features/preferences/PreferencesMenu.tsx';
import { useCopy } from '../features/preferences/copy.ts';
import { usePreferences } from '../features/preferences/store.ts';
import { localize } from '../features/preferences/locale.ts';
export function Unavailable(){const t=useCopy();return <><TransitionLink className="back" to="/">← {t('back')}</TransitionLink><div className="empty">{t('notFound')}</div></>}
export function App(){
 const {preferences,locale}=usePreferences(),t=useCopy(),chrome=useScrollChrome();
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const sync=()=>document.documentElement.dataset.theme=preferences.theme==='auto'?(media.matches?'dark':'light'):preferences.theme;sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync)},[preferences.theme]);
 useEffect(()=>{document.documentElement.lang=locale;document.title=localize(publicConfig.site.name,locale)},[locale]);
 return <BrowserRouter><a className="skip" href="#main">{t('skip')}</a><header className="site-nav" ref={chrome.nav}><div className="nav-inner"><TransitionLink to="/" className="brand">{publicConfig.site.logo?<img className="brand-mark" src={publicConfig.site.logo} alt=""/>:<span className="brand-mark"><Activity size={23}/></span>}{localize(publicConfig.site.name,locale)}</TransitionLink><div className="nav-links">{publicConfig.site.nav.map(item=><a key={item.href} href={item.href}>{localize(item.label,locale)}</a>)}</div><PreferencesMenu/></div></header><main id="main" className="shell" tabIndex={-1}><Routes><Route path="/" element={<StatusPage/>}/><Route path="/services/:groupId/:monitorId" element={<Suspense fallback={<div className="skeleton" aria-busy="true"><div/></div>}><MonitorPage/></Suspense>}/><Route path="*" element={<Unavailable/>}/></Routes></main><footer className="site-footer">{localize(publicConfig.site.footer,locale)}</footer><BackToTop visible={chrome.topVisible} onClick={chrome.toTop}/><ToastViewport topVisible={chrome.topVisible}/></BrowserRouter>;
}

