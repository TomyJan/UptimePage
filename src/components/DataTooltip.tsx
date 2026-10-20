import * as Tooltip from '@radix-ui/react-tooltip';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
  type RefObject,
} from 'react';
export function DataTooltip({
  children,
  content,
  anchorRef,
}: {
  children: ReactElement;
  content: ReactNode;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [popup, setPopup] = useState<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);
  const pointerOpen = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    if (!open || !popup || !anchorRef?.current || !trigger.current) return;
    const measure = () => {
      if (!anchorRef.current || !trigger.current) return;
      const anchor = anchorRef.current.getBoundingClientRect();
      const parent = trigger.current.getBoundingClientRect();
      setOffset(anchor.left + anchor.width / 2 - parent.left - popup.offsetWidth / 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(popup);
    observer.observe(trigger.current);
    return () => observer.disconnect();
  }, [open, popup, anchorRef, content]);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, []);
  return (
    <Tooltip.Root open={open} onOpenChange={setOpen} delayDuration={0}>
      <Tooltip.Trigger
        asChild
        ref={trigger}
        onPointerDown={() => {
          pointerOpen.current = open;
        }}
        onClick={(event) => {
          event.preventDefault();
          setOpen((v) => !(pointerOpen.current ?? v));
          pointerOpen.current = null;
        }}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          ref={setPopup}
          className="data-tooltip"
          sideOffset={10}
          collisionPadding={12}
          align={anchorRef ? 'start' : 'center'}
          alignOffset={anchorRef ? offset : 0}
        >
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
