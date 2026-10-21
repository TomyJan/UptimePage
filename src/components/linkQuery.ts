import type { To } from 'react-router';
export function withNavigationQuery(to: To, query: string | null): To {
  if (!query) return to;
  if (typeof to === 'string') {
    const hashIndex = to.indexOf('#');
    const hash = hashIndex < 0 ? '' : to.slice(hashIndex);
    const path = hashIndex < 0 ? to : to.slice(0, hashIndex);
    const index = path.indexOf('?');
    const params = new URLSearchParams(index < 0 ? '' : path.slice(index + 1));
    new URLSearchParams(query).forEach((v, k) => params.set(k, v));
    return `${index < 0 ? path : path.slice(0, index)}?${params}${hash}`;
  }
  const params = new URLSearchParams(to.search);
  new URLSearchParams(query).forEach((v, k) => params.set(k, v));
  return { ...to, search: `?${params}` };
}
