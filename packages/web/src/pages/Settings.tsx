import type { AiEffort, AiProviderKind, Settings as SettingsData } from '@ci/core';
import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../App';
import { api, ApiError, currentUser, errMsg, setCurrentUser, type AtlassianStatus } from '../api';
import { Card, Sdot, SourceLogo, Spinner, StatusIcon } from '../components/ui';
import { parseFigmaFileKey } from '../components/figmaFileKey';
import { SparkleIcon, SyncIcon } from '../components/icons';

const EFFORTS: readonly AiEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

const PROVIDERS: readonly { id: AiProviderKind; label: string; hint: string }[] = [
  { id: 'none', label: 'Deterministic rules only', hint: 'No data leaves this machine.' },
  { id: 'bedrock', label: 'Amazon Bedrock', hint: 'Claude inside your AWS account and policies. Uses the standard AWS credential chain.' },
  { id: 'anthropic', label: 'Anthropic', hint: 'Claude API. Key from ANTHROPIC_API_KEY.' },
  { id: 'openai', label: 'OpenAI', hint: 'Key from OPENAI_API_KEY.' },
  { id: 'azure-openai', label: 'Azure OpenAI', hint: 'Model = deployment name. Key from AZURE_OPENAI_API_KEY.' },
  { id: 'custom', label: 'Custom endpoint', hint: 'Any OpenAI-compatible endpoint (vLLM, gateway…). Key from CUSTOM_AI_API_KEY.' },
];

export function Settings() {
  const { toast, refresh } = useApp();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.settings>>>();
  const [s, setS] = useState<SettingsData>();
  const [rules, setRules] = useState<Awaited<ReturnType<typeof api.rules>>>([]);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<Record<string, string>>();
  const [user, setUser] = useState(currentUser());
  const [atlassian, setAtlassian] = useState<AtlassianStatus>();

  const load = async () => {
    const d = await api.settings();
    setData(d);
    setS(structuredClone(d.settings));
    if (d.connectMode === 'oauth') setAtlassian((await api.connections()).atlassian);
  };
  useEffect(() => {
    void load();
    void api.rules().then(setRules);
    // Back from Atlassian's consent page: say how it went, then drop the parameters from the address.
    const q = new URLSearchParams(location.search);
    const outcome = q.get('connect_error') ?? (q.get('connected') === 'atlassian' ? 'Atlassian connected' : undefined);
    if (outcome) {
      toast(outcome);
      history.replaceState(null, '', `${location.pathname}${location.hash}`);
    }
  }, []);
  if (!s || !data) return <div className="empty"><Spinner /></div>;

  const set = (path: string, value: unknown) => {
    const next = structuredClone(s);
    const keys = path.split('.');
    let o = next as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
    o[keys.at(-1)!] = value;
    setS(next);
  };
  // Settings saved before the story-shape rules have no storyShape; the server fills in the defaults.
  const shape = s.policy.storyShape ?? {};
  const setShape = (key: string, value: unknown) => set('policy.storyShape', { ...shape, [key]: value });
  const release = s.policy.release ?? {};
  const setRelease = (key: string, value: unknown) => set('policy.release', { ...release, [key]: value });
  const save = async () => {
    setSaving(true);
    try {
      setCurrentUser(user);
      const r = await api.saveSettings(s, data.etag);
      setS(r.settings);
      setData((d) => d && { ...d, settings: r.settings, etag: r.etag });
      toast('Settings saved');
      await api.analyze();
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 412 || e.status === 428)) {
        await load();
        toast('Settings were changed elsewhere and have been reloaded. Apply your change again.');
      } else toast(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  const secret = (name: string) => (
    <span className={`badge ${data.secrets[name] ? 'ok' : 'warn'}`} title="Secrets are read from server environment variables and never stored by the app">
      {name} {data.secrets[name] ? 'configured' : 'missing'}
    </span>
  );
  const origin = location.origin;
  const oauth = data.connectMode === 'oauth';
  /** In oauth mode Jira and Confluence show the connection instead of the token badge. */
  const atlassianBadge = (
    <span className={`badge ${atlassian?.connected ? 'ok' : 'warn'}`} title="One-click Atlassian connection (OAuth); no token is stored in settings">
      {atlassian?.connected ? `Connected — ${atlassian.site?.name ?? ''}` : 'Not connected'}
    </span>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Integrations, AI provider, security and policy. Secrets are never stored by the app — they are read from the server environment.</p>
        </div>
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : 'Save & re-analyze'}
        </button>
      </div>

      <Card title="Workspace">
        <div className="grid g3">
          <Field label="Mode">
            <select className="input" value={s.mode} onChange={(e) => set('mode', e.target.value)}>
              <option value="demo">Demo workspace (Checkout)</option>
              <option value="live">Live — Jira / Confluence / Figma</option>
            </select>
          </Field>
          <Field label="Project name">
            <input className="input" value={s.project.name} onChange={(e) => set('project.name', e.target.value)} />
          </Field>
          <Field label="Your name (recorded on decisions)">
            <input className="input" value={user} onChange={(e) => setUser(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Integrations" actions={<button className="btn sm" onClick={async () => setTest(await api.testConnections())}>Test connections</button>}>
        {test && (
          <div className={`banner ${test.error ? 'bad' : ''}`} style={{ marginBottom: 12 }}>
            {Object.entries(test).map(([k, v]) => (
              <div key={k}>
                <strong>{k}:</strong> {v}
              </div>
            ))}
            {Object.keys(test).length === 0 && 'No integration enabled.'}
          </div>
        )}
        <div className="col" style={{ gap: 18 }}>
          {oauth && <AtlassianConnect status={atlassian} onChange={setAtlassian} toast={toast} />}
          <Integration title="Jira" source="jira" enabled={s.integrations.jira.enabled} onToggle={(v) => set('integrations.jira.enabled', v)} badges={oauth ? atlassianBadge : secret('JIRA_API_TOKEN')}>
            {!oauth && <Field label="Site URL"><input className="input" placeholder="https://your-site.atlassian.net" value={s.integrations.jira.baseUrl} onChange={(e) => set('integrations.jira.baseUrl', e.target.value)} /></Field>}
            {!oauth && <Field label="Account e-mail"><input className="input" value={s.integrations.jira.email} onChange={(e) => set('integrations.jira.email', e.target.value)} /></Field>}
            <Field label="Project key"><input className="input" placeholder="PAY" value={s.integrations.jira.projectKey} onChange={(e) => set('integrations.jira.projectKey', e.target.value)} /></Field>
            <Field label="Acceptance criteria field (optional)"><input className="input" placeholder="customfield_10035 — else parsed from description" value={s.integrations.jira.acceptanceCriteriaField ?? ''} onChange={(e) => set('integrations.jira.acceptanceCriteriaField', e.target.value || undefined)} /></Field>
            <Field label="Release line R1…Rn from">
              <select className="input" value={s.integrations.jira.releaseLineSource ?? 'label'} onChange={(e) => set('integrations.jira.releaseLineSource', e.target.value)}>
                <option value="label">Labels with a prefix (release:R1)</option>
                <option value="fixVersion">Fix versions named R1, R2…</option>
                <option value="field">A field</option>
              </select>
            </Field>
            {(s.integrations.jira.releaseLineSource ?? 'label') === 'label' && <Field label="Release label prefix"><input className="input" placeholder="release:" value={s.integrations.jira.releaseLabelPrefix ?? ''} onChange={(e) => set('integrations.jira.releaseLabelPrefix', e.target.value || undefined)} /></Field>}
            {s.integrations.jira.releaseLineSource === 'field' && <Field label="Release line field"><input className="input" placeholder="customfield_10060" value={s.integrations.jira.releaseLineField ?? ''} onChange={(e) => set('integrations.jira.releaseLineField', e.target.value || undefined)} /></Field>}
            <Field label="Feature flag field (optional)"><input className="input" placeholder="customfield_10050 — else flag: labels" value={s.integrations.jira.flagField ?? ''} onChange={(e) => set('integrations.jira.flagField', e.target.value || undefined)} /></Field>
            {!s.integrations.jira.flagField && <Field label="Feature flag label prefix"><input className="input" placeholder="flag:" value={s.integrations.jira.flagLabelPrefix ?? ''} onChange={(e) => set('integrations.jira.flagLabelPrefix', e.target.value || undefined)} /></Field>}
            <Field label="pdi change label prefix"><input className="input" placeholder="change:" value={s.integrations.jira.changeLabelPrefix ?? ''} onChange={(e) => set('integrations.jira.changeLabelPrefix', e.target.value || undefined)} /></Field>
            <Field label="Additional JQL (optional)"><input className="input" placeholder="AND statusCategory != Done" value={s.integrations.jira.jqlFilter ?? ''} onChange={(e) => set('integrations.jira.jqlFilter', e.target.value || undefined)} /></Field>
            <IssueTypeMap value={s.integrations.jira.issueTypeMap ?? {}} onChange={(m) => set('integrations.jira.issueTypeMap', m)} />
          </Integration>
          <Integration title="Confluence" source="confluence" enabled={s.integrations.confluence.enabled} onToggle={(v) => set('integrations.confluence.enabled', v)} badges={oauth ? atlassianBadge : secret('CONFLUENCE_API_TOKEN')}>
            {!oauth && <Field label="Site URL"><input className="input" placeholder="https://your-site.atlassian.net" value={s.integrations.confluence.baseUrl} onChange={(e) => set('integrations.confluence.baseUrl', e.target.value)} /></Field>}
            {!oauth && <Field label="Account e-mail"><input className="input" value={s.integrations.confluence.email} onChange={(e) => set('integrations.confluence.email', e.target.value)} /></Field>}
            <Field label="Space keys (comma separated)"><input className="input" placeholder="PAY, CHK" value={s.integrations.confluence.spaceKeys.join(', ')} onChange={(e) => set('integrations.confluence.spaceKeys', e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean))} /></Field>
          </Integration>
          <Integration title="Figma" source="figma" enabled={s.integrations.figma.enabled} onToggle={(v) => set('integrations.figma.enabled', v)} badges={secret('FIGMA_TOKEN')}>
            <Field label="File keys (comma separated)"><input className="input" placeholder="from figma.com/design/<FILE_KEY>/…" value={s.integrations.figma.fileKeys.join(', ')} onChange={(e) => set('integrations.figma.fileKeys', e.target.value.split(',').map((x: string) => parseFigmaFileKey(x)).filter(Boolean))} /></Field>
          </Integration>
        </div>
      </Card>

      <Card title="AI provider">
        <div className="grid g3" style={{ marginBottom: 14 }}>
          {PROVIDERS.map((p) => (
            <label key={p.id} className={`card card-pad check provider-option ${s.ai.provider === p.id ? 'selected' : ''}`} style={{ alignItems: 'flex-start' }}>
              <input type="radio" name="provider" checked={s.ai.provider === p.id} onChange={() => (set('ai.provider', p.id), setS((x) => x && { ...x, ai: { ...x.ai, provider: p.id, model: data.defaultModels[p.id] ?? '' } }))} />
              <span className="col" style={{ gap: 2 }}>
                <strong>{p.label}</strong>
                <span className="small muted">{p.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {s.ai.provider !== 'none' && (
          <div className="grid g3">
            <Field label="Model"><input className="input" value={s.ai.model} onChange={(e) => set('ai.model', e.target.value)} /></Field>
            {(s.ai.provider === 'anthropic' || s.ai.provider === 'bedrock') && (
              <Field label="Effort">
                <select className="input" value={s.ai.effort ?? 'high'} onChange={(e) => set('ai.effort', e.target.value)}>
                  {EFFORTS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
            )}
            {!['anthropic', 'bedrock'].includes(s.ai.provider) && (
              <Field label="Temperature"><input className="input" type="number" min={0} max={1} step={0.1} value={s.ai.temperature ?? 0.2} onChange={(e) => set('ai.temperature', Number(e.target.value))} /></Field>
            )}
            {s.ai.provider === 'bedrock' && <Field label="AWS region"><input className="input" placeholder="eu-central-1" value={s.ai.region ?? ''} onChange={(e) => set('ai.region', e.target.value)} /></Field>}
            {(s.ai.provider === 'custom' || s.ai.provider === 'azure-openai') && <Field label="Endpoint base URL"><input className="input" value={s.ai.baseUrl ?? ''} onChange={(e) => set('ai.baseUrl', e.target.value)} /></Field>}
            {s.ai.provider === 'azure-openai' && <Field label="API version"><input className="input" value={s.ai.apiVersion ?? '2024-10-21'} onChange={(e) => set('ai.apiVersion', e.target.value)} /></Field>}
            <Field label="Run semantic review">
              <select className="input" value={s.ai.runOn} onChange={(e) => set('ai.runOn', e.target.value)}>
                <option value="on_demand">On demand (AI review button per item)</option>
                <option value="every_analysis">On every analysis (cached per unchanged item)</option>
              </select>
            </Field>
            <div className="row" style={{ alignSelf: 'end' }}>
              {s.ai.provider === 'anthropic' && secret('ANTHROPIC_API_KEY')}
              {s.ai.provider === 'openai' && secret('OPENAI_API_KEY')}
              {s.ai.provider === 'azure-openai' && secret('AZURE_OPENAI_API_KEY')}
              {s.ai.provider === 'custom' && secret('CUSTOM_AI_API_KEY')}
              {s.ai.provider === 'bedrock' && secret('AWS_CREDENTIALS')}
            </div>
          </div>
        )}
      </Card>

      <div className="grid g2">
        <Card title="Security & privacy">
          <div className="col">
            <Check label="Organization-managed AI provider" v={s.security.organizationManagedAi} on={(v) => set('security.organizationManagedAi', v)} />
            <Check label="Redact personal data (e-mails, card numbers, secrets) before AI calls" v={s.security.redactPersonalData} on={(v) => set('security.redactPersonalData', v)} />
            <Check label="Local cache only (context is never stored outside this server)" v={s.security.localCacheOnly} on={(v) => set('security.localCacheOnly', v)} />
            <Check label={<>Encrypt stored context (AES-256-GCM) {secret('CI_ENCRYPTION_KEY')}</>} v={s.security.encryptStoredContext} on={(v) => set('security.encryptStoredContext', v)} />
            <Check label="Audit AI decisions" v={s.security.auditAiDecisions} on={(v) => set('security.auditAiDecisions', v)} />
            <Check label="Record evidence sources sent to AI" v={s.security.recordEvidenceSources} on={(v) => set('security.recordEvidenceSources', v)} />
            <div className="small muted row" style={{ gap: 6 }}>
              <StatusIcon status="ok" />
              Source code is never read or sent — the product analyzes product definition only.
            </div>
            <Field label="Max characters per source sent to AI (data minimization)">
              <input className="input" type="number" min={500} step={500} value={s.security.maxCharsPerSource} onChange={(e) => set('security.maxCharsPerSource', Number(e.target.value))} />
            </Field>
          </div>
        </Card>

        <Card title="Analysis schedule">
          <div className="col">
            {[
              ['on_demand', 'On demand'],
              ['interval', 'Every N minutes'],
              ['continuous', 'Continuous (every 5 minutes + change notifications)'],
            ].map(([id, label]) => (
              <label key={id} className="check">
                <input type="radio" name="schedule" checked={s.schedule.mode === id} onChange={() => set('schedule.mode', id)} /> {label}
              </label>
            ))}
            {s.schedule.mode === 'interval' && (
              <Field label="Interval (minutes)">
                <input className="input" type="number" min={1} value={s.schedule.intervalMinutes} onChange={(e) => set('schedule.intervalMinutes', Number(e.target.value))} />
              </Field>
            )}
            <Check label="On Jira changes" v={s.schedule.onJiraChange} on={(v) => set('schedule.onJiraChange', v)} />
            <Check label="On Confluence changes" v={s.schedule.onConfluenceChange} on={(v) => set('schedule.onConfluenceChange', v)} />
            <Check label="On Figma changes" v={s.schedule.onFigmaChange} on={(v) => set('schedule.onFigmaChange', v)} />
            <div className="small muted">
              Webhook URLs (secured with <span className="kbd">CI_WEBHOOK_SECRET</span>):
              <div className="mono">{origin}/api/webhooks/jira</div>
              <div className="mono">{origin}/api/webhooks/confluence</div>
              <div className="mono">{origin}/api/webhooks/figma</div>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Policy">
        <div className="grid g3">
          {(['critical', 'warning', 'info'] as const).map((sev) => (
            <Field
              key={sev}
              label={
                <span className="policy-label">
                  <span className={`badge ${sev === 'critical' ? 'bad' : sev === 'warning' ? 'warn' : ''}`}>
                    {sev === 'info' ? <span className="sdot sdot-info" aria-hidden="true" /> : <Sdot tone={sev === 'critical' ? 'bad' : 'warn'} />}
                    {sev === 'critical' ? 'Critical' : sev === 'warning' ? 'Warning' : 'Info'}
                  </span>
                  findings
                </span>
              }
            >
              <select className="input" value={s.policy.actions[sev]} onChange={(e) => set(`policy.actions.${sev}`, e.target.value)}>
                <option value="block">Block implementation (NOT READY)</option>
                <option value="notify">Notify (NEEDS ATTENTION)</option>
                <option value="record">Record only</option>
              </select>
            </Field>
          ))}
          <Field
            label={
              <span className="policy-label">
                <SparkleIcon size={15} /> AI findings that would block
              </span>
            }
          >
            <select className="input" value={s.policy.aiFindings ?? 'require_confirmation'} onChange={(e) => set('policy.aiFindings', e.target.value)}>
              <option value="require_confirmation">Block after human confirmation</option>
              <option value="block">Block immediately</option>
              <option value="notify">Notify only (NEEDS ATTENTION)</option>
            </select>
          </Field>
          <Field
            label={
              <span className="policy-label">
                <SyncIcon size={15} /> When an approved story changes in meaning
              </span>
            }
          >
            <select className="input" value={s.policy.driftReaction ?? 'review_required'} onChange={(e) => set('policy.driftReaction', e.target.value)}>
              <option value="review_required">Require review and re-approval (NOT READY)</option>
              <option value="warn">Warn only (NEEDS ATTENTION)</option>
              <option value="invalidate">Revoke the approval</option>
            </select>
          </Field>
        </div>
        <h3 style={{ margin: '18px 0 8px' }}>Story shape</h3>
        <div className="grid g3">
          <Field label="Acceptance criteria format (AC-001)">
            <select className="input" value={shape.acFormat ?? 'gwt'} onChange={(e) => setShape('acFormat', e.target.value)}>
              <option value="gwt">Given / When / Then</option>
              <option value="ears">EARS</option>
              <option value="any">Any of the two</option>
              <option value="off">Off (lists and free text accepted)</option>
            </select>
          </Field>
          <Field label="Max scenarios per story (STORY-002)">
            <input className="input" type="number" min={1} max={50} value={shape.maxScenarios ?? 6} onChange={(e) => setShape('maxScenarios', Number(e.target.value))} />
          </Field>
          <Field label="Max actions per story (STORY-002)">
            <input className="input" type="number" min={1} max={20} value={shape.maxActions ?? 3} onChange={(e) => setShape('maxActions', Number(e.target.value))} />
          </Field>
          <Field label="Story points that make a story too large (STORY-002)">
            <input className="input" type="number" min={1} max={100} value={shape.maxStoryPoints ?? 13} onChange={(e) => setShape('maxStoryPoints', Number(e.target.value))} />
          </Field>
        </div>
        <h3 style={{ margin: '18px 0 8px' }}>Release plan</h3>
        <div className="grid g3">
          <Field label="Max share of stories in the MVP, % (REL-003)">
            <input className="input" type="number" min={1} max={100} value={release.maxMvpPercent ?? 60} onChange={(e) => setRelease('maxMvpPercent', Number(e.target.value))} />
          </Field>
          <Field label="Stories in a release line need a feature flag (REL-006)">
            <select className="input" value={release.requireFlag ?? 'user_facing'} onChange={(e) => setRelease('requireFlag', e.target.value)}>
              <option value="user_facing">User-facing stories</option>
              <option value="all">All stories</option>
              <option value="off">Off</option>
            </select>
          </Field>
        </div>
        <h3 style={{ margin: '18px 0 8px' }}>Rules</h3>
        <table className="table">
          <tbody>
            {rules.map((r) => {
              const off = s.policy.disabledRules.includes(r.id);
              return (
                <tr key={r.id}>
                  <td style={{ width: 30 }}>
                    <input type="checkbox" aria-label={`Enable ${r.id} ${r.name}`} checked={!off} onChange={() => set('policy.disabledRules', off ? s.policy.disabledRules.filter((x: string) => x !== r.id) : [...s.policy.disabledRules, r.id])} />
                  </td>
                  <td className="mono small" style={{ width: 90 }}>{r.id}</td>
                  <td>
                    <strong>{r.name}</strong>
                    <div className="small muted">{r.description}</div>
                  </td>
                  <td className="small muted" style={{ width: 140 }}>{r.appliesTo.join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const LEVELS = [
  ['epic', 'Epic'],
  ['feature', 'Feature (readiness from its stories)'],
  ['story', 'Story'],
  ['bug', 'Bug'],
  ['task', 'Task'],
  ['subtask', 'Sub-task'],
] as const;

/** Jira issue type → hierarchy level. Unlisted types are stories; without a Feature type the hierarchy is epic → story. */
function IssueTypeMap({ value, onChange }: { value: Record<string, string>; onChange: (m: Record<string, string>) => void }) {
  const rows = Object.entries(value);
  const update = (i: number, k: string, v: string) => onChange(Object.fromEntries(rows.map((r, j) => (j === i ? [k, v] : r))));
  return (
    <Field label="Issue type → hierarchy level (unlisted types are stories)">
      <div className="col" style={{ gap: 6 }}>
        {rows.map(([k, v], i) => (
          <div className="row" key={i}>
            <input className="input" placeholder="Jira issue type, e.g. Initiative" value={k} onChange={(e) => update(i, e.target.value, v)} />
            <select className="input" value={v} onChange={(e) => update(i, k, e.target.value)}>
              {LEVELS.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
            <button className="btn sm" onClick={() => onChange(Object.fromEntries(rows.filter((_, j) => j !== i)))} title="Remove mapping">✕</button>
          </div>
        ))}
        <div><button className="btn sm" onClick={() => onChange({ ...value, '': 'story' })} disabled={'' in value}>+ Add issue type</button></div>
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}

function Check({ label, v, on }: { label: ReactNode; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} /> <span>{label}</span>
    </label>
  );
}

/** CI_CONNECT_MODE=oauth: one button connects Jira and Confluence through Atlassian's consent page. */
function AtlassianConnect({ status, onChange, toast }: { status?: AtlassianStatus; onChange: (s: AtlassianStatus) => void; toast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  if (!status) return <Spinner />;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const connect = () => run(async () => location.assign((await api.connectAtlassian()).url));
  const disconnect = () =>
    run(async () => {
      if (!window.confirm('Disconnect Atlassian? Jira and Confluence stop being read until someone connects again. To revoke the app completely, remove it in your Atlassian account settings too.')) return;
      onChange(await api.disconnectAtlassian());
      toast('Atlassian disconnected');
    });
  const chooseSite = (cloudId: string) => run(async () => onChange(await api.selectAtlassianSite(cloudId)));

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row wrap">
        <SourceLogo source="jira" size={17} />
        <SourceLogo source="confluence" size={17} />
        <strong>Atlassian account</strong>
        <span className="right row wrap">
          {status.connected && (
            <button className="btn sm" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          )}
          <button className="btn sm primary" onClick={connect} disabled={busy || !status.configured}>
            {busy ? <Spinner /> : status.connected || status.lastError ? 'Reconnect Atlassian' : 'Connect Atlassian'}
          </button>
        </span>
      </div>
      {!status.configured && (
        <div className="banner bad">
          Set {status.missing.join(', ')} on the server to enable the button. Register <code>{status.callbackUrl}</code> as the callback URL of the Atlassian app.
        </div>
      )}
      {status.lastError && <div className="banner bad">The connection stopped working ({status.lastError}). Connect again.</div>}
      {status.connected && (
        <div className="small muted">
          Connected{status.connectedBy ? ` by ${status.connectedBy}` : ''}
          {status.connectedAt ? ` on ${new Date(status.connectedAt).toLocaleString()}` : ''}. Jira and Confluence are read from {status.site?.url ?? 'the chosen site'}.
        </div>
      )}
      {status.sites.length > 1 && (
        <Field label="Atlassian site">
          <select className="input" value={status.site?.id ?? ''} onChange={(e) => void chooseSite(e.target.value)} disabled={busy}>
            {status.sites.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} — {x.url}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

function Integration({ title, source, enabled, onToggle, badges, children }: { title: string; source?: string; enabled: boolean; onToggle: (v: boolean) => void; badges: ReactNode; children: ReactNode }) {
  return (
    <div className="col">
      <div className="row wrap">
        <label className="check">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          {source && <SourceLogo source={source} size={17} />}
          <strong>{title}</strong>
        </label>
        <span className="right">{badges}</span>
      </div>
      {enabled && <div className="grid g3">{children}</div>}
    </div>
  );
}
