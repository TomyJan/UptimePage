import { useEffect, useRef, useState } from 'react';
export function useScrollChrome() {
  const nav = useRef<HTMLElement>(null),
    [topVisible, setTopVisible] = useState(false),
    returning = useRef(false);
  useEffect(() => {
    const el = nav.current!;
    let last = Math.max(0, scrollY),
      shift = 0,
      frame = 0;
    function paint(value: number) {
      const height = el.getBoundingClientRect().height;
      shift = Math.max(0, Math.min(height, value));
      el.style.transform = `translate3d(0,-${shift}px,0)`;
      el.dataset.hidden = String(shift > height * 0.8);
      el.classList.toggle('is-scrolled', scrollY > 0);
    }
    function tick() {
      frame = 0;
      const y = Math.max(
          0,
          Math.min(scrollY, Math.max(0, document.documentElement.scrollHeight - innerHeight)),
        ),
        delta = y - last;
      last = y;
      if (delta === 0) return;
      if (y <= 1) {
        paint(0);
        setTopVisible(false);
        returning.current = false;
        return;
      }
      // Scroll distance drives the position; stopping must not snap to either end.
      paint(shift + delta);
      setTopVisible(delta < 0 && !returning.current);
    }
    const scroll = () => {
        if (!frame) frame = requestAnimationFrame(tick);
      },
      intent = () => {
        returning.current = false;
      };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('wheel', intent, { passive: true });
    window.addEventListener('touchstart', intent, { passive: true });
    const focus = () => {
      paint(0);
    };
    el.addEventListener('focusin', focus);
    paint(0);
    return () => {
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('wheel', intent);
      window.removeEventListener('touchstart', intent);
      el.removeEventListener('focusin', focus);
      cancelAnimationFrame(frame);
    };
  }, []);
  function toTop() {
    returning.current = true;
    // Hiding an inert, focused trigger can cancel the browser's smooth scroll.
    document.getElementById('main')?.focus({ preventScroll: true });
    setTopVisible(false);
    scrollTo({
      top: 0,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
  return { nav, topVisible, toTop };
}
