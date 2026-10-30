import type { ReactNode } from 'react';
import { TransitionLink } from './TransitionLink.tsx';
import { usePrivacyCopy } from '../features/privacy/copy.ts';

const linkPattern = /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;

export function renderFooter(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(linkPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(value.slice(cursor, index));
    nodes.push(
      <a href={match[2]} key={`${match[2]}-${index}`} target="_blank" rel="noreferrer">
        {match[1]}
      </a>,
    );
    cursor = index + match[0].length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

export function Footer({
  value,
  commit,
  commitUrl,
}: {
  value: string;
  commit: string;
  commitUrl: string;
}) {
  const copy = usePrivacyCopy();
  return (
    <>
      <nav className="footer-default" aria-label={copy.navigation}>
        <TransitionLink to="/privacy">{copy.title}</TransitionLink>{' '}
        <span aria-hidden="true">|</span> Powered by{' '}
        <a href="https://github.com/TomyJan/UptimePage" target="_blank" rel="noreferrer">
          UptimePage
        </a>{' '}
        <a href={commitUrl} target="_blank" rel="noreferrer">
          {commit}
        </a>{' '}
        <span aria-hidden="true">|</span>{' '}
        <a href="https://vov.moe" target="_blank" rel="noreferrer">
          TomyJan
        </a>
      </nav>
      {value ? <span className="footer-custom">{renderFooter(value)}</span> : null}
    </>
  );
}
