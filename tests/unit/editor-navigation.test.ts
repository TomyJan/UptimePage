import { expect, it } from 'vitest';
import { withNavigationQuery } from '../../src/components/linkQuery.ts';

it('retains the preview query across detail and home navigation without losing filters or hashes', () => {
  expect(withNavigationQuery('/services/a/b?range=7d#history', 'configeditor=on')).toBe(
    '/services/a/b?range=7d&configeditor=on#history',
  );
  expect(withNavigationQuery({ pathname: '/', search: '?g=external' }, 'configeditor=on')).toEqual({
    pathname: '/',
    search: '?g=external&configeditor=on',
  });
  expect(withNavigationQuery('/?g=core', null)).toBe('/?g=core');
});
