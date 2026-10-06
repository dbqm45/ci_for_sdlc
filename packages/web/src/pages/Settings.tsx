import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../App';
import { api, currentUser, setCurrentUser } from '../api';
import { Card, Spinner } from '../components/ui';

const PROVIDERS = [
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
  const [s, setS] = useState<any>();
  const [rules, setRules] = useState<Awaited<ReturnType<typeof api.rules>>>([]);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<Record<string, string>>();
  const [user, setUser] = useState(currentUser());

  useEffect(() => {
    void api.settings().then((d) => (setData(d), setS(structuredClone(d.settings))));
    void api.rules().then(setRules);
  }, []);
  if (!s || !data) return <div className="empty"><Spinner /></div>;

  const set = (path: string, value: unknown) => {
    const next = structuredClone(s);
    const keys = path.split('.');
    let o = next;
    for (const k of keys.slice(0, -1)) o = o[k];
    o[keys.at(-1)!] = value;
    setS(next);
  };
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.saveSettings(s);
      setS(r.settings);
      setCurrentUser(user);
      toast('Settings saved');
      await api.analyze();
      await refresh();
    } catch (e) {
      toast((e as Error).message);
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
          <Integration title="Jira" enabled={s.integrations.jira.enabled} onToggle={(v) => set('integrations.jira.enabled', v)} badges={secret('JIRA_API_TOKEN')}>
            <Field label="Site URL"><input className="input" placeholder="https://your-site.atlassian.net" value={s.integrations.jira.baseUrl} onChange={(e) => set('integrations.jira.baseUrl', e.target.value)} /></Field>
            <Field label="Account e-mail"><input className="input" value={s.integrations.jira.email} onChange={(e) => set('integrations.jira.email', e.target.value)} /></Field>
            <Field label="Project key"><input className="input" placeholder="PAY" value={s.integrations.jira.projectKey} onChange={(e) => set('integrations.jira.projectKey', e.target.value)} /></Field>
            <Field label="Acceptance criteria field (optional)"><input className="input" placeholder="customfield_10035 — else parsed from description" value={s.integrations.jira.acceptanceCriteriaField ?? ''} onChange={(e) => set('integrations.jira.acceptanceCriteriaField', e.target.value || undefined)} /></Field>
            <Field label="Additional JQL (optional)"><input className="input" placeholder="AND statusCategory != Done" value={s.integrations.jira.jqlFilter ?? ''} onChange={(e) => set('integrations.jira.jqlFilter', e.target.value || undefined)} /></Field>
          </Integration>
          <Integration title="Confluence" enabled={s.integrations.confluence.enabled} onToggle={(v) => set('integrations.confluence.enabled', v)} badges={secret('CONFLUENCE_API_TOKEN')}>
            <Field label="Site URL"><input className="input" placeholder="https://your-site.atlassian.net" value={s.integrations.confluence.baseUrl} onChange={(e) => set('integrations.confluence.baseUrl', e.target.value)} /></Field>
            <Field label="Account e-mail"><input className="input" value={s.integrations.confluence.email} onChange={(e) => set('integrations.confluence.email', e.target.value)} /></Field>
            <Field label="Space keys (comma separated)"><input className="input" placeholder="PAY, CHK" value={s.integrations.confluence.spaceKeys.join(', ')} onChange={(e) => set('integrations.confluence.spaceKeys', e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean))} /></Field>
          </Integration>
          <Integration title="Figma" enabled={s.integrations.figma.enabled} onToggle={(v) => set('integrations.figma.enabled', v)} badges={secret('FIGMA_TOKEN')}>
            <Field label="File keys (comma separated)"><input className="input" placeholder="from figma.com/design/<FILE_KEY>/…" value={s.integrations.figma.fileKeys.join(', ')} onChange={(e) => set('integrations.figma.fileKeys', e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean))} /></Field>
          </Integration>
        </div>
      </Card>

      <Card title="AI provider">
        <div className="grid g3" style={{ marginBottom: 14 }}>
          {PROVIDERS.map((p) => (
            <label key={p.id} className={`card card-pad check`} style={{ alignItems: 'flex-start', borderColor: s.ai.provider === p.id ? 'var(--accent)' : undefined }}>
              <input type="radio" name="provider" checked={s.ai.provider === p.id} onChange={() => (set('ai.provider', p.id), setS((x: any) => ({ ...x, ai: { ...x.ai, provider: p.id, model: data.defaultModels[p.id] ?? '' } })))} />
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
                  {['low', 'medium', 'high', 'xhigh', 'max'].map((x) => <option key={x}>{x}</option>)}
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
            <div className="small muted">✓ Source code is never read or sent — the product analyzes product definition only.</div>
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
            <Field key={sev} label={`${sev === 'critical' ? '🔴 Critical' : sev === 'warning' ? '🟡 Warnings' : '⚪ Informational'} findings`}>
              <select className="input" value={s.policy.actions[sev]} onChange={(e) => set(`policy.actions.${sev}`, e.target.value)}>
                <option value="block">Block implementation (NOT READY)</option>
                <option value="notify">Notify (NEEDS ATTENTION)</option>
                <option value="record">Record only</option>
              </select>
            </Field>
          ))}
          <Field label="🤖 AI findings that would block">
            <select className="input" value={s.policy.aiFindings ?? 'require_confirmation'} onChange={(e) => set('policy.aiFindings', e.target.value)}>
              <option value="require_confirmation">Block after human confirmation</option>
              <option value="block">Block immediately</option>
              <option value="notify">Notify only (NEEDS ATTENTION)</option>
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
                    <input type="checkbox" checked={!off} onChange={() => set('policy.disabledRules', off ? s.policy.disabledRules.filter((x: string) => x !== r.id) : [...s.policy.disabledRules, r.id])} />
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

function Field({ label, children }: { label: string; children: ReactNode }) {
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

function Integration({ title, enabled, onToggle, badges, children }: { title: string; enabled: boolean; onToggle: (v: boolean) => void; badges: ReactNode; children: ReactNode }) {
  return (
    <div className="col">
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          <strong>{title}</strong>
        </label>
        <span className="right">{badges}</span>
      </div>
      {enabled && <div className="grid g3">{children}</div>}
    </div>
  );
}
