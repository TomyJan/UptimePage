import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Cookie } from 'lucide-react';
import { TransitionLink } from '../../components/TransitionLink.tsx';
import { usePrivacyCopy } from './copy.ts';

const storageKey = 'uptimepage.privacy-notice';
const noticeVersion = '1';
let acknowledgedThisVisit = false;

function acknowledged() {
  if (acknowledgedThisVisit) return true;
  try {
    return localStorage.getItem(storageKey) === noticeVersion;
  } catch {
    return false;
  }
}

export function CookieNotice() {
  const copy = usePrivacyCopy();
  const [open, setOpen] = useState(() => !acknowledged());
  const [leaving, setLeaving] = useState(false);
  const notice = useRef<HTMLElement>(null);
  const dismiss = useCallback(() => {
    acknowledgedThisVisit = true;
    if (notice.current?.contains(document.activeElement))
      document.getElementById('main')?.focus({ preventScroll: true });
    setLeaving(true);
  }, []);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey || event.newValue !== noticeVersion) return;
      try {
        if (event.storageArea === localStorage) dismiss();
      } catch {
        // The local store may be unavailable in restricted browsing contexts.
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [dismiss]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(
      () => setOpen(false),
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240,
    );
    return () => clearTimeout(timer);
  }, [leaving]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = notice.current!;
    const root = document.documentElement;
    let frame = 0;
    const measure = () =>
      root.style.setProperty('--privacy-notice-offset', `${el.offsetHeight + 12}px`);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(el);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      root.style.removeProperty('--privacy-notice-offset');
    };
  }, [open]);

  if (!open) return null;
  const acknowledge = () => {
    try {
      localStorage.setItem(storageKey, noticeVersion);
    } catch {
      // A blocked store must not prevent dismissal for the current visit.
    }
    dismiss();
  };
  return (
    <aside
      ref={notice}
      className={`privacy-notice${leaving ? ' is-leaving' : ''}`}
      role="region"
      aria-labelledby="cookie-notice-title"
      aria-describedby="cookie-notice-description"
      inert={leaving}
    >
      <Cookie className="privacy-notice-icon" size={21} aria-hidden="true" />
      <div className="privacy-notice-copy">
        <h2 id="cookie-notice-title">{copy.noticeTitle}</h2>
        <p id="cookie-notice-description">
          {copy.noticeBody} {copy.noticePolicyLead}
          <TransitionLink to="/privacy">{copy.title}</TransitionLink>
          {copy.noticePolicyEnd}
        </p>
      </div>
      <div className="privacy-notice-actions">
        <button type="button" className="privacy-confirm" onClick={acknowledge}>
          {copy.acknowledge}
        </button>
      </div>
    </aside>
  );
}
