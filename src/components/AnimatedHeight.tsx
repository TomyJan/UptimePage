import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// Animate the measured content height so async states and responsive text can
// change size without snapping the panels below them. No fixed maximum height.
export function AnimatedHeight({
  children,
  className = '',
  contentKey,
  initialHeight,
}: {
  children: ReactNode;
  className?: string;
  contentKey?: string;
  initialHeight?: number;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = outer.current!;
    const content = inner.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let target = initialHeight ?? content.getBoundingClientRect().height;
    let animation: Animation | null = null;
    let frame = 0;
    container.style.height = `${target}px`;
    const stop = () => {
      animation?.cancel();
      animation = null;
      delete container.dataset.resizing;
    };
    const measure = () => {
      const next = content.getBoundingClientRect().height;
      if (Math.abs(next - target) < 0.5) return;
      const from = container.getBoundingClientRect().height;
      stop();
      target = next;
      container.style.height = `${next}px`;
      if (reduced.matches || document.visibilityState === 'hidden') return;
      container.dataset.resizing = 'true';
      animation = container.animate([{ height: `${from}px` }, { height: `${next}px` }], {
        duration: 440,
        easing: 'cubic-bezier(.22,.75,.25,1)',
      });
      animation.onfinish = () => {
        animation = null;
        delete container.dataset.resizing;
      };
    };
    const onMotionChange = () => {
      if (reduced.matches) stop();
    };
    // Nested cards can resize their parents. Write outside the observer delivery
    // cycle so a parent's height update cannot trigger a ResizeObserver loop.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(content);
    measure();
    reduced.addEventListener('change', onMotionChange);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      reduced.removeEventListener('change', onMotionChange);
      stop();
    };
  }, []);
  return (
    <div ref={outer} className={`resize-surface ${className}`}>
      <div ref={inner} className="resize-content">
        {contentKey === undefined ? (
          children
        ) : (
          <AnimatedContent contentKey={contentKey}>{children}</AnimatedContent>
        )}
      </div>
    </div>
  );
}

/** Keep the outgoing view mounted for its exit, then measure and reveal the next view. */
function AnimatedContent({ children, contentKey }: { children: ReactNode; contentKey: string }) {
  const view = useRef<HTMLDivElement>(null);
  const phase = useRef(false);
  const [shown, setShown] = useState({ key: contentKey, children });
  const [leaving, setLeaving] = useState(false);
  useLayoutEffect(() => {
    const setPhase = (next: boolean) => {
      if (phase.current !== next && view.current)
        view.current.style.setProperty('--content-opacity', getComputedStyle(view.current).opacity);
      phase.current = next;
      setLeaving(next);
    };
    const commit = () => {
      setPhase(false);
      setShown({ key: contentKey, children });
    };
    if (shown.key === contentKey) {
      setShown((current) =>
        current.children === children ? current : { key: contentKey, children },
      );
      setPhase(false);
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || document.visibilityState === 'hidden') {
      commit();
      return;
    }
    setPhase(true);
    const timer = window.setTimeout(commit, 160);
    const skip = () => {
      if (reduced.matches || document.visibilityState === 'hidden') {
        clearTimeout(timer);
        commit();
      }
    };
    reduced.addEventListener('change', skip);
    document.addEventListener('visibilitychange', skip);
    return () => {
      clearTimeout(timer);
      reduced.removeEventListener('change', skip);
      document.removeEventListener('visibilitychange', skip);
    };
  }, [children, contentKey, shown.key]);
  return (
    <div
      ref={view}
      key={shown.key}
      className={`content-swap ${leaving ? 'is-leaving' : ''}`}
      inert={leaving || undefined}
      aria-hidden={leaving || undefined}
    >
      {shown.key === contentKey ? children : shown.children}
    </div>
  );
}
