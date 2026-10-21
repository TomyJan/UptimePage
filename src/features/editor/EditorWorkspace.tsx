import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useLocation } from 'react-router';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  Braces,
  ClipboardPaste,
  Copy,
  Download,
  MoreHorizontal,
  PanelRightClose,
  PencilLine,
  Pin,
  Upload,
  X,
} from 'lucide-react';
import { GroupTabs } from '../status/GroupTabs.tsx';
import { toastStore } from '../toasts/store.ts';
import { Action } from './fields.tsx';
import { EditorForm, type EditorCategory } from './EditorForm.tsx';
import { createDraft, editForm, editJSON, type Draft } from './draft.ts';
import { useEditorCopy } from './copy.ts';
import { editorMarker } from './mock.ts';

export function EditorWorkspace({
  draft,
  onChange,
  onExit,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onExit: () => void;
}) {
  const t = useEditorCopy(),
    location = useLocation();
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [category, setCategory] = useState<EditorCategory>('site');
  const [displayCategory, setDisplayCategory] = useState(category),
    [leaving, setLeaving] = useState(false);
  const [docked, setDocked] = useState(false),
    [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false),
    menuOpen = useRef(false),
    panel = useRef<HTMLElement>(null),
    json = useRef<HTMLTextAreaElement>(null),
    file = useRef<HTMLInputElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    sequence = useRef(0);
  const latest = useRef(draft);
  latest.current = draft;
  const change = (next: Draft) => {
    sequence.current++;
    latest.current = next;
    onChange(next);
  };
  useEffect(() => {
    if (new URLSearchParams(location.search).get('configeditor') !== 'on') onExit();
  }, [location.search, onExit]);
  useEffect(() => {
    if (category === displayCategory) {
      setLeaving(false);
      return;
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayCategory(category);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const task = setTimeout(() => {
      setDisplayCategory(category);
      setLeaving(false);
    }, 140);
    return () => clearTimeout(task);
  }, [category, displayCategory]);
  const expand = (focus = false) => {
    clearTimeout(timer.current);
    setDocked(false);
    if (focus)
      requestAnimationFrame(() =>
        panel.current?.querySelector<HTMLButtonElement>('[data-mode]')?.focus(),
      );
  };
  const scheduleDock = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = panel.current;
      if (
        !pinnedRef.current &&
        !menuOpen.current &&
        el &&
        !el.matches(':hover') &&
        !el.contains(document.activeElement)
      )
        setDocked(true);
    }, 850);
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        panel.current &&
        !panel.current.contains(event.target as Node) &&
        !(event.target as Element).closest?.('.ce-menu')
      ) {
        if (panel.current.contains(document.activeElement))
          (document.activeElement as HTMLElement).blur();
        scheduleDock();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !menuOpen.current) {
        if (panel.current?.contains(document.activeElement))
          (document.activeElement as HTMLElement).blur();
        setDocked(true);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    scheduleDock();
    return () => {
      clearTimeout(timer.current);
      sequence.current++;
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  const changeMode = (next: 'form' | 'json') => {
    if (next === 'form' && mode === 'json' && draft.error) {
      toastStore.push(t('fixJSON'), 5000, 'warning');
      return;
    }
    setMode(next);
  };
  const warn = (message: string) => toastStore.push(message, 5000, 'warning');
  const copy = async () => {
    if (draft.error) return;
    try {
      await navigator.clipboard.writeText(draft.text);
      toastStore.push(t('copied'), 5000, 'success');
    } catch {
      json.current?.focus();
      json.current?.select();
      warn(t('copyFallback'));
    }
  };
  const paste = async () => {
    const current = ++sequence.current;
    try {
      const text = await navigator.clipboard.readText();
      if (current !== sequence.current) return;
      change(editJSON(latest.current, text));
      toastStore.push(t('pasted'));
    } catch {
      if (current !== sequence.current) return;
      json.current?.focus();
      warn(t('pasteFallback'));
    }
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    const current = ++sequence.current;
    if (selected.size > 4 * 1024 * 1024) {
      warn(t('tooLarge'));
      return;
    }
    try {
      const text = await selected.text();
      if (current !== sequence.current) return;
      setMode('json');
      change(editJSON(latest.current, text));
      toastStore.push(t('imported'));
    } catch {
      if (current !== sequence.current) return;
      warn(t('fileError'));
    }
  };
  const format = () => {
    try {
      change(editJSON(draft, JSON.stringify(JSON.parse(draft.text), null, 2)));
    } catch {
      warn(t('invalidJSON'));
    }
  };
  const download = () => {
    if (draft.error) {
      warn(t('invalid'));
      return;
    }
    const url = URL.createObjectURL(new Blob([draft.text + '\n'], { type: 'application/json' })),
      anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'site.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastStore.push(t('exported'), 5000, 'success');
  };
  const [exiting, setExiting] = useState(false);
  const exit = () => {
    sequence.current++;
    setExiting(true);
    setTimeout(onExit, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
  };
  return (
    <div className="ce-workspace" data-exiting={exiting} data-editor-marker={editorMarker}>
      <div className="ce-top">
        <div>
          <span className="ce-edit-badge">{t('editing')}</span>
          <span className="ce-top-note">{t('mock')}</span>
        </div>
        <div>
          <button onClick={() => expand(true)}>{t('edit')}</button>
          <button onClick={exit}>{t('exit')}</button>
        </div>
      </div>
      <div className="ce-bottom">
        <strong>{t('local')}</strong>
        <span>{t('deploy')}</span>
      </div>
      <aside
        className="ce-panel"
        ref={panel}
        data-docked={docked}
        aria-label={t('editor')}
        onPointerEnter={() => expand()}
        onPointerLeave={scheduleDock}
        onFocusCapture={() => clearTimeout(timer.current)}
        onBlurCapture={scheduleDock}
      >
        <button
          className="ce-dock-edge"
          aria-label={t('expand')}
          tabIndex={docked ? 0 : -1}
          onClick={() => expand(true)}
          onFocus={() => {
            if (docked) expand(true);
          }}
        >
          <PencilLine size={15} />
          <span>{t('edit')}</span>
        </button>
        <div className="ce-inner" inert={docked}>
          <div className="ce-head">
            <div className="ce-title">
              <span>
                <PencilLine size={15} />
              </span>
              <strong>{t('editor')}</strong>
            </div>
            <div className="ce-actions">
              <Menu.Root
                modal={false}
                onOpenChange={(open) => {
                  menuOpen.current = open;
                  if (!open) scheduleDock();
                }}
              >
                <Menu.Trigger className="ce-icon" aria-label={t('more')}>
                  <MoreHorizontal size={16} />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Content
                    className="dropdown-panel ce-menu"
                    align="end"
                    sideOffset={8}
                    collisionPadding={12}
                  >
                    <Menu.Item
                      className="menu-option"
                      onSelect={() => {
                        change(createDraft());
                        toastStore.push(t('resetDone'));
                      }}
                    >
                      {t('reset')}
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Portal>
              </Menu.Root>
              <Action
                label={pinned ? t('unpin') : t('pinned')}
                pressed={pinned}
                onClick={() => {
                  pinnedRef.current = !pinnedRef.current;
                  setPinned(pinnedRef.current);
                  if (!pinnedRef.current) scheduleDock();
                }}
              >
                <Pin size={15} />
              </Action>
              <Action
                label={t('dock')}
                onClick={() => {
                  (document.activeElement as HTMLElement)?.blur();
                  setDocked(true);
                }}
              >
                <PanelRightClose size={15} />
              </Action>
            </div>
          </div>
          <div className={`ce-modes ${mode === 'json' ? 'is-json' : ''}`}>
            <span className="ce-mode-cursor" aria-hidden="true" />
            {(['form', 'json'] as const).map((value) => (
              <button
                key={value}
                data-mode={value}
                aria-pressed={mode === value}
                onClick={() => changeMode(value)}
              >
                {t(value)}
              </button>
            ))}
          </div>
          <div className="ce-stage">
            <section
              className="ce-mode-panel ce-form-panel"
              data-active={mode === 'form'}
              inert={mode !== 'form'}
              aria-label={t('form')}
            >
              <div className="ce-categories">
                <GroupTabs
                  sub
                  label={t('editor')}
                  selected={category}
                  onChange={(value) => setCategory(value as EditorCategory)}
                  items={(['site', 'groups', 'monitors', 'cache'] as const).map((id) => ({
                    id,
                    name: t(id),
                    logo: null,
                  }))}
                />
              </div>
              <div className="ce-scroll" data-leaving={leaving}>
                <EditorForm
                  category={displayCategory}
                  config={draft.form}
                  change={(mutate) => {
                    const next = structuredClone(draft.form);
                    mutate(next);
                    change(editForm(draft, next));
                  }}
                  t={t}
                />
              </div>
            </section>
            <section
              className="ce-mode-panel ce-json-panel"
              data-active={mode === 'json'}
              inert={mode !== 'json'}
              aria-label={t('json')}
            >
              <div className="ce-json-tools">
                <span className="mono">site.json</span>
                <div className="ce-actions">
                  <Action label={t('paste')} onClick={() => void paste()}>
                    <ClipboardPaste size={15} />
                  </Action>
                  <Action label={t('import')} onClick={() => file.current?.click()}>
                    <Upload size={15} />
                  </Action>
                  <Action label={t('copy')} disabled={!!draft.error} onClick={() => void copy()}>
                    <Copy size={15} />
                  </Action>
                  <Action label={t('format')} onClick={format}>
                    <Braces size={15} />
                  </Action>
                </div>
              </div>
              <div className="ce-json-area">
                <textarea
                  ref={json}
                  spellCheck={false}
                  aria-label={t('json')}
                  aria-invalid={!!draft.error}
                  value={draft.text}
                  onChange={(e) => change(editJSON(draft, e.target.value))}
                />
              </div>
            </section>
          </div>
          {draft.error && (
            <div className="ce-error" role="alert">
              <X size={13} />
              <div>
                <strong>{t('configurationError')}</strong>
                <p>{draft.error}</p>
              </div>
            </div>
          )}
          <div className="ce-foot">
            <button className="ce-export" onClick={download} disabled={!!draft.error}>
              <Download size={14} />
              {t('export')}
            </button>
          </div>
        </div>
      </aside>
      <input
        ref={file}
        type="file"
        hidden
        accept=".json,application/json"
        onChange={(event) => void importFile(event)}
      />
    </div>
  );
}
