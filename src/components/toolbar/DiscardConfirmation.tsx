/* This module intentionally exports an imperative Promise API beside its dialog component. */
/* The backdrop click has equivalent Cancel and Escape controls inside the alert dialog. */
/* eslint-disable react-refresh/only-export-components, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

let confirmationOpen = false;

function DiscardDialog({ tenantId, decide }: { tenantId: string; decide: (accepted: boolean) => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const discard = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); decide(false); }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (document.activeElement === cancel.current) discard.current?.focus();
        else cancel.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [decide]);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-sm"
    onClick={(event) => { if (event.target === event.currentTarget) decide(false); }}>
    <section role="alertdialog" aria-modal="true" aria-labelledby="discard-confirmation-title" aria-describedby="discard-confirmation-message"
      className="w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl">
      <h2 id="discard-confirmation-title" className="text-lg font-semibold text-foreground">丢弃当前草稿？</h2>
      <p id="discard-confirmation-message" className="mt-4 whitespace-pre-line break-words text-sm leading-6 text-foreground/80">
        仅清空当前浏览器中的任务草稿与画布，包括节点配置、连接和撤销记录，然后在当前工作空间新建空白任务。已保存的服务端任务保持不变，不发送保存或执行请求。
        {'\n\n'}工作空间：{tenantId || '未设置（保持不变）'}
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <button ref={cancel} type="button" onClick={() => decide(false)}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">取消</button>
        <button ref={discard} type="button" onClick={() => decide(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">丢弃并新建</button>
      </div>
    </section>
  </div>;
}

/** Local draft consent only; the toolbar owns the existing reset behavior. */
export function confirmDiscardDraft(tenantId: string): Promise<boolean> {
  if (confirmationOpen) return Promise.resolve(false);
  confirmationOpen = true;
  const previousFocus = document.activeElement;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const background = Array.from(document.body.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== host)
    .map((element) => ({ element, inert: element.inert }));
  for (const { element } of background) element.inert = true;
  const root = createRoot(host);
  return new Promise((resolve) => {
    let settled = false;
    const decide = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      root.unmount();
      host.remove();
      for (const { element, inert } of background) element.inert = inert;
      confirmationOpen = false;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      resolve(accepted);
    };
    flushSync(() => root.render(<DiscardDialog tenantId={tenantId} decide={decide} />));
  });
}
