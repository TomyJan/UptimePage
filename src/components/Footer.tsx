import type { ReactNode } from 'react';

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

export function Footer({ value }: { value: string }) {
  return <>{renderFooter(value)}</>;
}
