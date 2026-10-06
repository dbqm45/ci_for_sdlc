import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type AnalysisResult, errMsg } from './api';
import { ago, Spinner } from './components/ui';
import { Overview } from './pages/Overview';
import { Backlog } from './pages/Backlog';
import { ItemPage } from './pages/ItemPage';
import { Decisions } from './pages/Decisions';
import { Drift } from './pages/Drift';
import { Impact } from './pages/Impact';
import { Settings } from './pages/Settings';
import { Audit } from './pages/Audit';

type Analysis = AnalysisResult & { running?: boolean; lastReason?: string };

interface AppCtx {
  analysis?: Analysis;
  refresh: () => Promise<void>;
  runAnalysis: () => Promise<void>;
  setAnalysis: (a: Analysis) => void;
  toast: (msg: string) => void;
  navigate: (path: string) => void;
  version: number;
}

const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

function useHashRoute(): [string, (p: string) => void] {
  const [path, setPath] = useState(() => location.hash.slice(1) || '/overview');
  useEffect(() => {
    const on = () => setPath(location.hash.slice(1) || '/overview');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [path, (p: string) => (location.hash = p)];
}

const NAV = [
  { path: '/overview', label: 'Project health', icon: '◎' },
  { path: '/backlog', label: 'Backlog', icon: '☰' },
  { path: '/decisions', label: 'Decisions', icon: '✓' },
  { path: '/drift', label: 'Drift', icon: '↯' },
  { path: '/impact', label: 'Impact analysis', icon: '⌖' },
];
const ADMIN = [
  { path: '/settings', label: 'Settings', icon: '⚙' },
  { path: '/audit', label: 'Audit log', icon: '⧉' },
];

export function App() {
  const [path, navigate] = useHashRoute();
  const [analysis, setAnalysis] = useState<Analysis>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const [toastMsg, setToastMsg] = useState<string>();
  const [version, setVersion] = useState(0);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg((x) => (x === m ? undefined : x)), 4000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setAnalysis(await api.analysis());
      setVersion((v) => v + 1);
      setError(undefined);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    setRunning(true);
    try {
      const r = await api.analyze();
      setAnalysis(r);
      setVersion((v) => v + 1);
      toast(`Analysis complete — ${r.counts.critical} critical, ${r.drift.length} drift events`);
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setRunning(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
    // Live updates: server pushes an event after every analysis (schedule, webhook, other users).
    const es = new EventSource('/api/events');
    es.addEventListener('analysis', () => void refresh());
    es.addEventListener('status', (e) => setRunning(!!JSON.parse((e as MessageEvent).data).running));
    return () => es.close();
  }, [refresh]);

  const ctx = useMemo<AppCtx>(
    () => ({ analysis, refresh, runAnalysis, setAnalysis: (a) => (setAnalysis(a), setVersion((v) => v + 1)), toast, navigate, version }),
    [analysis, refresh, runAnalysis, toast, navigate, version],
  );

  const [section, param] = path.split('/').filter(Boolean);
  let page;
  if (!analysis && !error) page = <div className="empty"><Spinner /> Discovering context and analyzing…</div>;
  else if (!analysis) page = <div className="empty">Could not load analysis: {error}</div>;
  else if (section === 'backlog') page = <Backlog />;
  else if (section === 'item' && param) page = <ItemPage key={param} itemKey={decodeURIComponent(param)} />;
  else if (section === 'decisions') page = <Decisions />;
  else if (section === 'drift') page = <Drift />;
  else if (section === 'impact') page = <Impact />;
  else if (section === 'settings') page = <Settings />;
  else if (section === 'audit') page = <Audit />;
  else page = <Overview />;

  const debt = analysis ? analysis.metrics.decisionDebt.critical + analysis.metrics.decisionDebt.important : 0;
  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">CI</div>
            <div>
              <strong>Continuous Intelligence</strong>
              <small>Product definition quality gate</small>
            </div>
          </div>
          {NAV.map((n) => (
            <a key={n.path} className={`nav-item ${('/' + (section ?? 'overview')) === n.path || (section === 'item' && n.path === '/backlog') ? 'active' : ''}`} href={`#${n.path}`}>
              <span style={{ width: 16, textAlign: 'center' }}>{n.icon}</span>
              {n.label}
              {n.path === '/backlog' && analysis && <span className="count">{analysis.counts.stories + analysis.counts.bugs}</span>}
              {n.path === '/decisions' && analysis && debt > 0 && <span className="count">{debt}</span>}
              {n.path === '/drift' && analysis && analysis.metrics.drift > 0 && <span className="count">{analysis.metrics.drift}</span>}
            </a>
          ))}
          <div className="nav-section">Administration</div>
          {ADMIN.map((n) => (
            <a key={n.path} className={`nav-item ${'/' + section === n.path ? 'active' : ''}`} href={`#${n.path}`}>
              <span style={{ width: 16, textAlign: 'center' }}>{n.icon}</span>
              {n.label}
            </a>
          ))}
          <div className="spacer" />
          <div className="small faint" style={{ padding: '0 10px' }}>
            Sources: Jira · Confluence · Figma
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <div>
              <div className="small muted">Project</div>
              <strong>{analysis?.project.name ?? '…'}</strong>
            </div>
            <div className="small muted">
              Last analysis: <strong style={{ color: 'var(--text)' }}>{ago(analysis?.analyzedAt)}</strong>
              {analysis?.ai.enabled && <span className="badge accent" style={{ marginLeft: 8 }}>AI: {analysis.ai.model}</span>}
            </div>
            <div className="grow" />
            {analysis && (
              <div className="row small">
                <span className="badge bad">{analysis.counts.critical} critical</span>
                <span className="badge warn">{analysis.counts.needsAttention} need attention</span>
                <span className="badge ok">{analysis.counts.healthy} healthy</span>
              </div>
            )}
            <button className="btn primary" onClick={runAnalysis} disabled={running}>
              {running ? <Spinner /> : '↻'} Analyze now
            </button>
          </header>
          <main className="content">{page}</main>
        </div>
      </div>
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </Ctx.Provider>
  );
}
