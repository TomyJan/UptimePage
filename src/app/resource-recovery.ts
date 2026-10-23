export type RecoveryState = 'idle' | 'checking' | 'reloading' | 'offline' | 'editor' | 'failed';

interface RecoveryRuntime {
  currentBuild: () => string | null;
  latestBuild: () => Promise<string | null>;
  isEditing: () => boolean;
  isOnline: () => boolean;
  storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  reload: () => void;
}

/** Recover failed page resources without reload loops or losing editor drafts. */
export function createResourceRecovery(runtime: RecoveryRuntime) {
  let state: RecoveryState = 'idle';
  let attempted = false;
  let flight: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const set = (next: RecoveryState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const protectedState = () =>
    runtime.isEditing() ? 'editor' : !runtime.isOnline() ? 'offline' : null;
  const reload = () => {
    const protectedBy = protectedState();
    if (protectedBy) {
      set(protectedBy);
      return;
    }
    if (state === 'reloading') return;
    set('reloading');
    runtime.reload();
  };
  const recover = async () => {
    const protectedBy = protectedState();
    if (protectedBy) {
      set(protectedBy);
      return;
    }
    set('checking');
    try {
      const current = runtime.currentBuild();
      const latest = current ? await runtime.latestBuild() : null;
      const protectedAfterProbe = protectedState();
      if (protectedAfterProbe) {
        set(protectedAfterProbe);
        return;
      }
      if (state === 'reloading') return;
      if (current && latest && latest !== current) {
        const storage = runtime.storage();
        const key = 'uptimepage.resource-recovery';
        const attempts: unknown = JSON.parse(storage.getItem(key) ?? '[]');
        if (!Array.isArray(attempts) || attempts.some((entry) => typeof entry !== 'string')) {
          set('failed');
          return;
        }
        if (!attempts.includes(latest)) {
          const next = JSON.stringify([...attempts, latest]);
          storage.setItem(key, next);
          if (storage.getItem(key) !== next) {
            set('failed');
            return;
          }
          reload();
          return;
        }
      }
      set('failed');
    } catch {
      if (state !== 'reloading') set(protectedState() ?? 'failed');
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    failed() {
      if (flight) return flight;
      if (attempted) return Promise.resolve();
      attempted = true;
      flight = recover().finally(() => {
        flight = null;
      });
      return flight;
    },
    showFailure() {
      if (state === 'idle') set(protectedState() ?? 'failed');
    },
    refreshProtection() {
      if (['editor', 'offline', 'failed'].includes(state)) set(protectedState() ?? 'failed');
    },
    reload,
  };
}
