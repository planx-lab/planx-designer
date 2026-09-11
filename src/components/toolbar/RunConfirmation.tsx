/* This module intentionally exports an imperative Promise API beside its dialog component. */
/* The backdrop click has equivalent Cancel and Escape controls inside the alert dialog. */
/* eslint-disable react-refresh/only-export-components, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

let confirmationOpen = false;
const labels = { title: '\u8fd0\u884c\u524d\u786e\u8ba4', cancel: '\u53d6\u6d88', run: '\u786e\u8ba4\u8fd0\u884c', blocked: '\u914d\u7f6e\u4e2d\u6709\u5c1a\u672a\u5e94\u7528\u7684\u65e0\u6548\u8f93\u5165\u3002\u8bf7\u53d6\u6d88\u5e76\u8fd4\u56de\u914d\u7f6e\u4fee\u6b63\uff1b\u672c\u6b21\u4e0d\u4f1a\u521b\u5efa\u6267\u884c\u3002' };

function RunDialog({ message, blocked, decide }: {
  message: string;
  blocked: boolean;
  decide: (accepted: boolean) => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const run = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); decide(false); }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (document.activeElement === cancel.current && !blocked) run.current?.focus();
        else cancel.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [blocked, decide]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-sm"
      onClick={event => { if (event.target === event.currentTarget) decide(false); }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="run-confirmation-title" aria-describedby="run-confirmation-message"
        className="w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 id="run-confirmation-title" className="text-lg font-semibold text-foreground">{labels.title}</h2>
        <p id="run-confirmation-message" className="mt-4 whitespace-pre-line break-words text-sm leading-6 text-foreground/80">{message}</p>
        {blocked && <p role="alert" className="mt-4 text-sm text-destructive">{labels.blocked}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button ref={cancel} type="button" onClick={() => decide(false)}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{labels.cancel}</button>
          <button ref={run} type="button" disabled={blocked} onClick={() => decide(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{labels.run}</button>
        </div>
      </section>
    </div>
  );
}

/** A cancellable UI boundary only: callers retain all save and run semantics. */
export function confirmRun(message: string): Promise<boolean> {
  if (confirmationOpen) return Promise.resolve(false);
  confirmationOpen = true;
  const previousFocus = document.activeElement;
  const blocked = !!document.querySelector('[data-config-invalid="true"]');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const background = Array.from(document.body.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== host)
    .map(element => ({ element, inert: element.inert }));
  for (const { element } of background) element.inert = true;
  const root = createRoot(host);
  return new Promise(resolve => {
    let settled = false;
    const decide = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      root.unmount();
      host.remove();
      for (const { element, inert } of background) element.inert = inert;
      confirmationOpen = false;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      resolve(accepted && !blocked);
    };
    flushSync(() => root.render(<RunDialog message={message} blocked={blocked} decide={decide} />));
  });
}
