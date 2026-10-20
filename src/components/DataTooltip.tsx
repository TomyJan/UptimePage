import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect, useRef, useState, type ReactNode, type ReactElement } from 'react';
export function DataTooltip({ children, content }: { children: ReactElement; content: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pointerOpen = useRef<boolean | null>(null);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, []);
  return (
    <Tooltip.Root open={open} onOpenChange={setOpen} delayDuration={0}>
      <Tooltip.Trigger
        asChild
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
        <Tooltip.Content className="data-tooltip" sideOffset={10} collisionPadding={12}>
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
