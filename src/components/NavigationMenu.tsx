import * as Menu from '@radix-ui/react-dropdown-menu';
import { Menu as MenuIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePublicConfig } from '../data/config.ts';
import { useCopy } from '../features/preferences/copy.ts';
import { localize } from '../features/preferences/locale.ts';
import { usePreferences } from '../features/preferences/store.ts';

export function NavigationMenu() {
  const { site } = usePublicConfig(),
    { locale } = usePreferences(),
    t = useCopy();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, []);
  if (!site.nav.length) return null;
  return (
    <Menu.Root open={open} onOpenChange={setOpen} modal={false}>
      <Menu.Trigger className="nav-button nav-links-mobile" aria-label={t('navigation')}>
        <MenuIcon size={17} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="dropdown-panel"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label={t('navigation')}
          loop
        >
          <Menu.Label className="menu-label">{t('navigation')}</Menu.Label>
          {site.nav.map((item, index) => (
            <Menu.Item key={index} className="menu-option" asChild>
              <a href={item.href} target={item.newTab ? '_blank' : undefined}>
                {localize(item.label, locale)}
              </a>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
