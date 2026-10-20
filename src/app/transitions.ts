import { flushSync } from 'react-dom';
let active: ViewTransition | null = null;
export function transition(kind: 'page-content' | 'monitor-list', update: () => void) {
  const el = document.querySelector<HTMLElement>(
    kind === 'page-content' ? '#main' : '#monitor-content',
  );
  active?.skipTransition();
  if (
    !el ||
    !document.startViewTransition ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    flushSync(update);
    if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      el.animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: kind === 'page-content' ? 520 : 440, easing: 'cubic-bezier(.22,.75,.25,1)' },
      );
    return;
  }
  document.querySelectorAll<HTMLElement>('[data-transition-surface]').forEach((e) => {
    e.style.viewTransitionName = 'none';
    delete e.dataset.transitionSurface;
  });
  el.style.viewTransitionName = kind;
  el.dataset.transitionSurface = 'true';
  const current = document.startViewTransition(() => flushSync(update));
  active = current;
  void current.finished
    .catch(() => {})
    .finally(() => {
      if (active === current) {
        el.style.viewTransitionName = 'none';
        delete el.dataset.transitionSurface;
        active = null;
      }
    });
}
