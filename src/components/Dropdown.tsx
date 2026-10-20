import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
export interface Option {
  value: string;
  label: string;
}
export function Dropdown({
  label,
  children,
  value,
  options,
  onChange,
  className = 'nav-button',
}: {
  label: string;
  children: ReactNode;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, []);
  return (
    <Menu.Root open={open} onOpenChange={setOpen} modal={false}>
      <Menu.Trigger className={className} aria-label={label}>
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="dropdown-panel"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          loop
        >
          <Menu.Label className="menu-label">{label}</Menu.Label>
          <Menu.RadioGroup value={value} onValueChange={onChange}>
            {options.map((o) => (
              <Menu.RadioItem className="menu-option" key={o.value} value={o.value}>
                <span>{o.label}</span>
                <Menu.ItemIndicator>
                  <Check size={14} />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
