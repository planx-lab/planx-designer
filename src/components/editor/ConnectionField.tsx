import { useEffect, useRef, useState } from 'react';
import { getConnection, getConnectionImpact, getConnectionKinds, getConnections, saveConnection } from '@/api/connections';
import { ApiError } from '@/types/api';
import type { ConnectionImpact, ConnectionKind, ConnectionMetadata, ConnectionMutation, ConnectionResource, ConnectionSecretAction } from '@/types/connection';

const INPUT = 'w-full bg-muted border border-border rounded-md h-8 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60';
const ACTION = 'text-accent text-[11px] hover:underline disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded';
type Props = { id: string; tenantId: string; driver?: string; value: string; onChange: (id: string) => void };
type Field = ConnectionKind['fields'][number];

function defaultSecret(field: Field, base: ConnectionResource | null): ConnectionSecretAction {
  if (base?.configuredSecrets[field.name]) return { action: 'keep' };
  return field.required ? { action: 'replace', value: '' } : { action: 'clear' };
}

function draftOf(connection: ConnectionResource): ConnectionMetadata {
  return { id: connection.id, tenantId: connection.tenantId, driver: connection.driver, name: connection.name, parameters: { ...connection.parameters } };
}

/** Keyed scope discards local credentials and pending callbacks when the selection changes. */
export function ConnectionField(props: Props) {
  return <ScopedConnectionField key={JSON.stringify([props.tenantId, props.driver ?? '', props.value])} {...props} />;
}

function ScopedConnectionField({ id, tenantId, driver, value, onChange }: Props) {
  const [connections, setConnections] = useState<ConnectionResource[]>([]);
  const [loading, setLoading] = useState(!!tenantId.trim());
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{ base: ConnectionResource | null; generation: number } | null>(null);
  const editorGeneration = useRef(0);

  useEffect(() => {
    const abort = new AbortController();
    let current = true;
    if (tenantId.trim()) {
      getConnections(tenantId, abort.signal).then((items) => {
        if (current) setConnections(items);
      }).catch(() => {
        if (current) setError('Connection resources unavailable. Refresh before choosing a connection.');
      }).finally(() => { if (current) setLoading(false); });
    }
    return () => { current = false; abort.abort(); };
  }, [tenantId, refresh]);

  const available = connections.filter((connection) => !driver || connection.driver === driver);
  const selected = available.find((connection) => connection.id === value);
  const disabled = !tenantId.trim() || loading || editor !== null;
  const open = (base: ConnectionResource | null) => {
    setError('');
    setEditor({ base, generation: ++editorGeneration.current });
  };

  return <div className="space-y-1.5">
    <select id={id} className={INPUT} value={value} disabled={disabled}
      data-config-invalid={value && (!selected || !selected.ready) ? 'true' : undefined}
      onChange={(event) => {
        const next = event.target.value;
        if (!next || available.some((connection) => connection.id === next)) onChange(next);
      }}>
      <option value="">Select a tenant connection</option>
      {value && !selected && <option value={value} disabled>{value} (not available)</option>}
      {available.map((connection) => <option key={connection.id} value={connection.id}>
        {connection.name || connection.id} ({connection.driver}){!connection.ready ? ' - setup required' : ''}
      </option>)}
    </select>
    {!tenantId.trim() ? <p className="text-[11px] text-warning">Tenant context is required for connections.</p> : <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={ACTION} disabled={disabled} onClick={() => open(null)}>New connection</button>
      {selected && <button type="button" className={ACTION} disabled={disabled} onClick={() => open(selected)}>
        {selected.ready ? 'Edit connection' : 'Complete setup'}
      </button>}
      <button type="button" className={ACTION} disabled={disabled} onClick={() => { setLoading(true); setError(''); setRefresh((n) => n + 1); }}>Refresh resources</button>
      {selected && <span className="text-[10px] text-foreground/50">Version {String(selected.version)}</span>}
    </div>}
    {selected && !selected.ready && <p className="text-[11px] text-warning">This connection needs structured setup before testing or running. Its existing reference is preserved.</p>}
    {loading && <p role="status" className="text-[11px] text-foreground/50">Loading connections...</p>}
    {error && <p role="alert" className="text-[11px] text-destructive break-words">{error}</p>}
    {editor && <ConnectionEditor key={editor.generation} id={id} tenantId={tenantId} driver={driver} initial={editor.base}
      onClose={() => { ++editorGeneration.current; setEditor(null); }}
      onSaved={(saved) => {
        if (editorGeneration.current !== editor.generation) return;
        setConnections((items) => [...items.filter((item) => item.id !== saved.id), saved]);
        onChange(saved.id);
        setEditor(null);
      }} />}
  </div>;
}

/** Credentials live only in this mounted editor, never the pipeline or any store. */
function ConnectionEditor({ id, tenantId, driver, initial, onClose, onSaved }: {
  id: string; tenantId: string; driver?: string; initial: ConnectionResource | null;
  onClose: () => void; onSaved: (connection: ConnectionResource) => void;
}) {
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState<ConnectionMetadata>(() => initial ? draftOf(initial) : { id: '', tenantId, driver: driver ?? '', name: '', parameters: {} });
  const [secrets, setSecrets] = useState<Record<string, ConnectionSecretAction>>({});
  const [kinds, setKinds] = useState<ConnectionKind[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [busy, setBusy] = useState<'impact' | 'save' | 'query' | null>(null);
  const [error, setError] = useState('');
  const [review, setReview] = useState<{ impact: ConnectionImpact; generation: number } | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [canQuery, setCanQuery] = useState(false);
  const [queried, setQueried] = useState<ConnectionResource | null>(null);
  const active = useRef(true);
  const generation = useRef(0);

  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    getConnectionKinds(tenantId, abort.signal).then((profiles) => {
      if (active.current && !abort.signal.aborted) setKinds(profiles);
    }).catch(() => {
      if (active.current && !abort.signal.aborted) setCatalogError('Connection fields are unavailable from the Catalog. Close and reopen to retry; no fallback driver form is used.');
    }).finally(() => { if (active.current && !abort.signal.aborted) setCatalogLoading(false); });
    return () => { active.current = false; abort.abort(); };
  }, [tenantId]);

  const kind = kinds.find((profile) => profile.kind === draft.driver);
  const visibleKinds = kinds.filter((profile) => !driver || profile.kind === driver);
  const unknownParameters = kind ? Object.keys(draft.parameters).filter((name) => !kind.fields.some((field) => field.name === name && !field.secret)) : [];
  const changed = () => { ++generation.current; setReview(null); setQueried(null); setError(''); };
  const update = (next: ConnectionMetadata) => { changed(); setDraft(next); };
  const secretFor = (field: Field) => secrets[field.name] ?? defaultSecret(field, base);
  const changeSecret = (name: string, action: ConnectionSecretAction) => { changed(); setSecrets((current) => ({ ...current, [name]: action })); };

  const mutation = (): ConnectionMutation | null => {
    if (!draft.id.trim() || draft.id.length > 128 || !draft.name.trim() || !kind) {
      setError('Enter a connection ID, name and a kind declared by the Catalog.'); return null;
    }
    if (unknownParameters.length) {
      setError('Resolve the undeclared saved parameters before applying this connection.'); return null;
    }
    const actions: Record<string, ConnectionSecretAction> = {};
    for (const field of kind.fields) {
      if (field.secret) {
        const action = secretFor(field);
        if ((action.action === 'replace' && !action.value.length)
          || (action.action === 'keep' && !base?.configuredSecrets[field.name])
          || (field.required && action.action === 'clear')
          || (field.options && action.action === 'replace' && !field.options.includes(action.value))) {
          setError(`Choose a valid credential action and value for ${field.label}.`); return null;
        }
        actions[field.name] = action;
      } else {
        const value = draft.parameters[field.name];
        if ((field.required && !value?.trim()) || (value && field.options && !field.options.includes(value))) {
          setError(`Enter a valid value for ${field.label}.`); return null;
        }
      }
    }
    return { connection: { ...draft, parameters: { ...draft.parameters } }, ...(base ? { expectedRevision: base.revision } : {}), secrets: actions };
  };

  const apply = async (candidate: ConnectionMutation) => {
    const current = generation.current;
    setBusy('save'); setError('');
    try {
      const saved = await saveConnection(candidate, base?.runtimeRevision);
      if (!active.current || generation.current !== current) return;
      setSecrets({}); onSaved(saved);
    } catch (failure) {
      if (!active.current || generation.current !== current) return;
      setReview(null);
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.status !== 408) {
        setCanQuery(failure.status === 409);
        setError(failure.status === 409
          ? 'The saved revision or affected users changed. Nothing was automatically replayed. Query the saved connection or review the impact again.'
          : 'The connection was not accepted. Check the required settings and credential actions; your draft is preserved.');
      } else {
        setSecrets({}); setUnknown(true); setCanQuery(true);
        setError('Save outcome unknown. Do not submit again. Query the saved connection to inspect its committed revision; a query cannot prove which request wrote it.');
      }
    } finally { if (active.current && generation.current === current) setBusy(null); }
  };

  const submit = async () => {
    if (busy || unknown) return;
    const candidate = mutation();
    if (!candidate) return;
    if (!base) { await apply(candidate); return; }
    if (review) {
      if (review.generation !== generation.current) { setReview(null); return; }
      await apply({ ...candidate, impactToken: review.impact.token, stopAffected: review.impact.runtimeChanged && review.impact.users.length > 0 });
      return;
    }
    const current = generation.current;
    setBusy('impact'); setError('');
    try {
      const impact = await getConnectionImpact(candidate);
      if (active.current && generation.current === current) setReview({ impact, generation: current });
    } catch (failure) {
      if (active.current && generation.current === current) {
        setCanQuery(failure instanceof ApiError && failure.status === 409);
        setError(failure instanceof ApiError && failure.status === 409
          ? 'The editor-base revision is stale. No stop or save was requested. Query the saved connection before continuing.'
          : 'Impact could not be confirmed. No stop or save was requested; your draft is preserved.');
      }
    } finally { if (active.current && generation.current === current) setBusy(null); }
  };

  const querySaved = async () => {
    if (busy) return;
    const current = generation.current;
    setBusy('query'); setQueried(null);
    try {
      const saved = await getConnection(draft.id, tenantId);
      if (active.current && generation.current === current) setQueried(saved);
    } catch (failure) {
      if (active.current && generation.current === current) setError(failure instanceof ApiError && failure.status === 404
        ? 'No saved connection was returned. This does not prove an earlier save failed. Do not automatically resubmit.'
        : 'The saved connection could not be queried. The earlier save outcome remains unconfirmed.');
    } finally { if (active.current && generation.current === current) setBusy(null); }
  };

  const stopRequired = review?.impact.runtimeChanged && review.impact.users.length > 0;
  return <form aria-label="Connection settings" className="space-y-3 rounded-md border border-border bg-card p-3"
    noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <p className="text-[11px] text-foreground/60">Tenant: {tenantId}. Configure credentials here; no redeployment is needed. Saving does not test a connection or start a pipeline.</p>
    {base && <p className="break-all text-[10px] text-foreground/50">Editor revision: {base.revision}</p>}
    {base?.migrationRequired && <p className="text-[11px] text-warning">Complete the structured fields and credentials for this existing connection. No legacy DSN or environment reference is exposed.</p>}
    <div className="space-y-1">
      <label className="block text-[11px] text-foreground/70" htmlFor={`${id}-id`}>Connection ID</label>
      <input id={`${id}-id`} className={INPUT} required maxLength={128} readOnly={!!base || unknown} disabled={!!busy}
        value={draft.id} onChange={(event) => update({ ...draft, id: event.target.value })} />
    </div>
    <div className="space-y-1">
      <label className="block text-[11px] text-foreground/70" htmlFor={`${id}-name`}>Connection name</label>
      <input id={`${id}-name`} className={INPUT} required disabled={!!busy} value={draft.name}
        onChange={(event) => update({ ...draft, name: event.target.value })} />
    </div>
    <div className="space-y-1">
      <label className="block text-[11px] text-foreground/70" htmlFor={`${id}-driver`}>Connection kind</label>
      <select id={`${id}-driver`} className={INPUT} required disabled={!!busy || !!base || !!driver || catalogLoading || unknown}
        value={draft.driver} onChange={(event) => {
          changed(); setSecrets({}); setDraft({ ...draft, driver: event.target.value, parameters: {} });
        }}>
        <option value="">Select a kind</option>
        {draft.driver && !visibleKinds.some((profile) => profile.kind === draft.driver) && <option value={draft.driver}>{draft.driver} (Catalog unavailable)</option>}
        {visibleKinds.map((profile) => <option key={profile.kind} value={profile.kind}>{profile.kind}</option>)}
      </select>
    </div>
    {catalogLoading && <p role="status" className="text-[11px] text-foreground/50">Loading connection fields...</p>}
    {catalogError && <p role="alert" className="text-[11px] text-destructive">{catalogError}</p>}
    {!catalogLoading && !catalogError && draft.driver && !kind && <p role="alert" className="text-[11px] text-warning">This connection kind is not available from the Catalog. Saving is disabled.</p>}
    {unknownParameters.length > 0 && <div role="alert" className="space-y-1 text-[11px] text-warning">
      <p>Undeclared saved parameters: {unknownParameters.join(', ')}. They are not silently discarded.</p>
      <button type="button" className={ACTION} disabled={!!busy} onClick={() => update({ ...draft, parameters: Object.fromEntries(Object.entries(draft.parameters).filter(([name]) => !unknownParameters.includes(name))) })}>Remove undeclared parameters</button>
    </div>}
    {kind?.fields.map((field) => {
      const fieldId = `${id}-parameter-${field.name}`;
      const helpId = `${fieldId}-help`;
      const action = field.secret ? secretFor(field) : undefined;
      return <div key={field.name} className="space-y-1">
        <label className="block text-[11px] text-foreground/70" htmlFor={field.secret ? `${fieldId}-action` : fieldId}>
          {field.label}{field.required ? ' (required)' : ''}
        </label>
        {field.secret && action ? <>
          <p className="text-[10px] text-foreground/50">{base?.configuredSecrets[field.name] ? 'Configured; the stored value is never returned.' : 'Not configured.'}</p>
          <select id={`${fieldId}-action`} aria-label={`${field.label} action`} className={INPUT} disabled={!!busy || unknown}
            value={action.action} onChange={(event) => changeSecret(field.name, event.target.value === 'replace'
              ? { action: 'replace', value: '' } : { action: event.target.value as 'keep' | 'clear' })}>
            {base?.configuredSecrets[field.name] && <option value="keep">Keep stored credential</option>}
            <option value="replace">Replace with a new value</option>
            <option value="clear" disabled={field.required}>Clear credential{field.required ? ' (required)' : ''}</option>
          </select>
          {action.action === 'replace' && <input id={fieldId} type="password" aria-label={`${field.label} new value`} className={INPUT}
            autoComplete="new-password" spellCheck={false} required aria-describedby={field.description ? helpId : undefined}
            disabled={!!busy || unknown} value={action.value}
            onChange={(event) => changeSecret(field.name, { action: 'replace', value: event.target.value })} />}
        </> : field.options ? <select id={fieldId} className={INPUT} required={field.required} disabled={!!busy}
          aria-describedby={field.description ? helpId : undefined} value={draft.parameters[field.name] ?? ''}
          onChange={(event) => update({ ...draft, parameters: { ...draft.parameters, [field.name]: event.target.value } })}>
          <option value="">Not configured</option>
          {draft.parameters[field.name] && !field.options.includes(draft.parameters[field.name]) && <option value={draft.parameters[field.name]}>{draft.parameters[field.name]} (not declared)</option>}
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select> : <input id={fieldId} className={INPUT} required={field.required} disabled={!!busy} autoComplete="off"
          aria-describedby={field.description ? helpId : undefined} value={draft.parameters[field.name] ?? ''}
          onChange={(event) => update({ ...draft, parameters: { ...draft.parameters, [field.name]: event.target.value } })} />}
        {field.description && <p id={helpId} className="text-[10px] text-foreground/50">{field.description}</p>}
      </div>;
    })}
    {review && <section aria-label="Connection change impact" className="space-y-2 rounded-md border border-border bg-muted p-2.5 text-[11px]">
      <p>{review.impact.runtimeChanged ? 'Runtime parameters or credentials will change.' : 'Display-only change. Running work will not be stopped.'}</p>
      <p className="font-medium">Saved pipelines using this connection ({review.impact.pipelines.length})</p>
      <ul className="space-y-1">{review.impact.pipelines.map((pipeline) => <li key={pipeline.id}>{pipeline.name} ({pipeline.id})</li>)}</ul>
      <p className="font-medium">Actual users ({review.impact.users.length})</p>
      <ul className="space-y-1">{review.impact.users.map((user) => <li key={`${user.kind}:${user.id}`}>
        {user.kind}: {user.id}{user.pipelineId ? ` / pipeline ${user.pipelineId}` : ''}{user.executionId ? ` / execution ${user.executionId}` : ''}
      </li>)}</ul>
      <p>{stopRequired ? 'Applying will stop all listed actual users and wait for resource release. Pipelines will not restart automatically.' : 'No stop is requested. Pipelines will not start or restart automatically.'}</p>
      <p>New users or a changed revision can invalidate this review. A conflict is not automatically retried.</p>
    </section>}
    {error && <p role="alert" className="text-[11px] text-destructive break-words">{error}</p>}
    {canQuery && <button type="button" className={ACTION} disabled={!!busy} onClick={() => void querySaved()}>{busy === 'query' ? 'Querying saved connection...' : 'Query saved connection'}</button>}
    {queried && <section aria-label="Current saved connection" className="space-y-2 rounded-md border border-border p-2 text-[11px]">
      <p>Current saved revision: <span className="break-all">{queried.revision}</span></p>
      <p>{queried.name} ({queried.driver}); {queried.ready ? 'ready' : 'setup required'}. This is saved metadata, not proof of the earlier request outcome.</p>
      <dl className="space-y-1">{Object.entries(queried.parameters).map(([name, value]) => <div key={name}><dt>{name}</dt><dd className="break-all">{value}</dd></div>)}</dl>
      <p>Configured credential names: {Object.entries(queried.configuredSecrets).filter(([, configured]) => configured).map(([name]) => name).join(', ') || 'none'}.</p>
      <button type="button" className={ACTION} disabled={!!busy || (!!driver && queried.driver !== driver)} onClick={() => {
        changed(); setBase(queried); setDraft(draftOf(queried)); setSecrets({}); setUnknown(false); setCanQuery(false);
      }}>Replace draft with saved revision</button>
      <p>This discards the visible draft. Any new credential value must be entered again.</p>
    </section>}
    <div className="flex flex-wrap gap-3">
      <button type="submit" className={ACTION} disabled={!!busy || catalogLoading || !!catalogError || !kind || unknown}>
        {busy === 'save' ? 'Saving connection...' : busy === 'impact' ? 'Reviewing impact...' : !base ? 'Save connection' : review ? stopRequired ? 'Stop affected users and apply' : 'Apply changes' : 'Review changes'}
      </button>
      {review && <button type="button" className={ACTION} disabled={!!busy} onClick={() => { changed(); }}>Back to editing</button>}
      <button type="button" className={ACTION} disabled={busy === 'save'} onClick={() => { setSecrets({}); onClose(); }}>Cancel</button>
    </div>
  </form>;
}
