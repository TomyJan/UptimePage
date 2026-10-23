import { Component, useSyncExternalStore, type ReactNode } from 'react';
import { CircleAlert, LoaderCircle, RotateCw } from 'lucide-react';
import { useLocation } from 'react-router';
import { useCopy } from '../features/preferences/copy.ts';
import { resourceRecovery } from './resource-runtime.ts';

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    resourceRecovery.showFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function ResourceBoundary({
  children,
  editorUnavailable = false,
}: {
  children: ReactNode;
  editorUnavailable?: boolean;
}) {
  const { pathname, search } = useLocation();
  if (editorUnavailable && new URLSearchParams(search).get('configeditor') === 'on') return null;
  return <Boundary key={pathname}>{children}</Boundary>;
}

export function ResourceNotice() {
  const state = useSyncExternalStore(resourceRecovery.subscribe, resourceRecovery.getSnapshot);
  const t = useCopy();
  if (state === 'idle') return null;
  const busy = state === 'checking' || state === 'reloading';
  return (
    <section className="panel resource-notice detail-alert" role={busy ? 'status' : 'alert'}>
      <span className="resource-notice-icon" aria-hidden="true">
        {busy ? <LoaderCircle size={22} className="loading-spinner" /> : <CircleAlert size={22} />}
      </span>
      <div>
        <h2>{t(state === 'reloading' ? 'resourceReloading' : 'resourceFailed')}</h2>
        {state !== 'reloading' && (
          <p>
            {t(
              state === 'checking'
                ? 'resourceChecking'
                : state === 'editor'
                  ? 'resourceEditor'
                  : state === 'offline'
                    ? 'resourceOffline'
                    : 'resourceRetry',
            )}
          </p>
        )}
      </div>
      {!busy && state !== 'editor' && (
        <button className="retry" onClick={resourceRecovery.reload}>
          <RotateCw size={14} aria-hidden="true" /> {t('reloadPage')}
        </button>
      )}
    </section>
  );
}
