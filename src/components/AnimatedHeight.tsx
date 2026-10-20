import { useLayoutEffect, useRef, type ReactNode } from 'react';

// Animate the measured content height so async states and responsive text can
// change size without snapping the panels below them. No fixed maximum height.
export function AnimatedHeight({
  children,
  className = '',
  contentKey,
}: {
  children: ReactNode;
  className?: string;
  contentKey?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = outer.current!;
    const content = inner.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let target = content.getBoundingClientRect().height;
    let animation: Animation | null = null;
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
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    reduced.addEventListener('change', onMotionChange);
    return () => {
      observer.disconnect();
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
          <div key={contentKey} className="content-swap">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
