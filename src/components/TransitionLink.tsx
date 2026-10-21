import { Link, useNavigate, type LinkProps } from 'react-router';
import { transition } from '../app/transitions.ts';
import { createContext, useContext } from 'react';
import { withNavigationQuery } from './linkQuery.ts';
export const NavigationQueryContext = createContext<string | null>(null);
export function TransitionLink({ onClick, to, state, ...props }: LinkProps) {
  const navigate = useNavigate();
  const destination = withNavigationQuery(to, useContext(NavigationQueryContext));
  return (
    <Link
      {...props}
      to={destination}
      state={state}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          props.target === '_blank'
        )
          return;
        e.preventDefault();
        transition('page-content', () => {
          void navigate(destination, { state });
          scrollTo(0, 0);
        });
      }}
    />
  );
}
