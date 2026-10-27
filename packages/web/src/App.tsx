import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, currentUser, readToken, type AnalysisResult, errMsg } from './api';
import { ago, Sdot, Source, Spinner } from './components/ui';
import {
  ActivityIcon,
  ChevronIcon,
  CircleCheckIcon,
  ClockIcon,
  CloseIcon,
  FileTextIcon,
  GitCompareIcon,
  ListIcon,
  LogOutIcon,
  MenuIcon,
  PanelLeftIcon,
  RefreshIcon,
  SettingsIcon,
  TargetIcon,
  UserIcon,
} from './components/icons';
import { disclosureReducer } from './lib/disclosure';
import { subscribeEvents } from './lib/sse';
import { trapTabKey } from './lib/focusTrap';
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
  { path: '/overview', label: 'Project health', Icon: ActivityIcon },
  { path: '/backlog', label: 'Backlog', Icon: ListIcon },
  { path: '/decisions', label: 'Decisions', Icon: CircleCheckIcon },
  { path: '/drift', label: 'Drift', Icon: GitCompareIcon },
  { path: '/impact', label: 'Impact analysis', Icon: TargetIcon },
];
const ADMIN = [
  { path: '/settings', label: 'Settings', Icon: SettingsIcon },
  { path: '/audit', label: 'Audit log', Icon: FileTextIcon },
];

/** Quorum brand mark — three arcs around a dot, per docs/redesign-roadmap.md. */
function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M17.74 6.15A10 10 0 0 1 25.40 19.42" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
      <path d="M23.66 22.43A10 10 0 0 1 8.34 22.43" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
      <path d="M6.60 19.42A10 10 0 0 1 14.26 6.15" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
      <circle cx="16" cy="16" r="3" fill="#fff" />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/** Avatar button + dropdown menu. Open/close state and focus trap are shared,
 * framework-free building blocks tested in test/disclosure.test.ts and test/focusTrap.test.ts. */
function AccountMenu({ navigate }: { navigate: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const name = currentUser();

  const close = useCallback(() => {
    setOpen((o) => disclosureReducer(o, 'close'));
    btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen((o) => disclosureReducer(o, 'escape'));
        btnRef.current?.focus();
        return;
      }
      if (wrapRef.current) trapTabKey(e, wrapRef.current);
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div className="account-menu-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => disclosureReducer(o, 'toggle'))}
      >
        {initials(name)}
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-menu-user">
            <div className="avatar-btn" aria-hidden="true">
              {initials(name)}
            </div>
            <div>
              <div className="account-menu-user-name">{name}</div>
              <div className="account-menu-role">Recorded on decisions</div>
            </div>
          </div>
          <div className="account-menu-divider" />
          <button
            role="menuitem"
            className="account-menu-item"
            onClick={() => {
              navigate('/settings');
              close();
            }}
          >
            <UserIcon size={16} />
            Account settings
          </button>
          <button role="menuitem" className="account-menu-item" disabled title="No login system is configured yet">
            <LogOutIcon size={16} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [path, navigate] = useHashRoute();
  const [analysis, setAnalysis] = useState<Analysis>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const [toastMsg, setToastMsg] = useState<string>();
  const [version, setVersion] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

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
    // Read with fetch, not EventSource, so the read token (CI_READ_TOKEN) goes in a header (lib/sse.ts).
    return subscribeEvents('/api/events', { analysis: () => void refresh(), status: (data) => setRunning(!!JSON.parse(data).running) }, { token: readToken });
  }, [refresh]);

  // Close the drawer/rail-overlay on route change, and whenever the matching
  // breakpoint no longer applies (resize back to desktop).
  useEffect(() => {
    setDrawerOpen(false);
  }, [path]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen((o) => disclosureReducer(o, 'close'));
    menuBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer();
        return;
      }
      if (sidebarRef.current) trapTabKey(e, sidebarRef.current);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawerOpen, closeDrawer]);

  const ctx = useMemo<AppCtx>(
    () => ({ analysis, refresh, runAnalysis, setAnalysis: (a) => (setAnalysis(a), setVersion((v) => v + 1)), toast, navigate, version }),
    [analysis, refresh, runAnalysis, toast, navigate, version],
  );

  const [section, param, focus] = path.split('/').filter(Boolean);
  let page;
  if (!analysis && !error) page = <div className="empty"><Spinner /> Discovering context and analyzing…</div>;
  else if (!analysis) page = <div className="empty">Could not load analysis: {error}</div>;
  else if (section === 'backlog') page = <Backlog />;
  else if (section === 'item' && param) page = <ItemPage key={param} itemKey={decodeURIComponent(param)} focusFinding={focus && decodeURIComponent(focus)} />;
  else if (section === 'decisions') page = <Decisions />;
  else if (section === 'drift') page = <Drift />;
  else if (section === 'impact') page = <Impact />;
  else if (section === 'settings') page = <Settings />;
  else if (section === 'audit') page = <Audit />;
  else page = <Overview />;

  const debt = analysis ? analysis.metrics.decisionDebt.critical + analysis.metrics.decisionDebt.important : 0;
  const activePath = section === 'item' ? '/backlog' : '/' + (section ?? 'overview');

  const navLink = (n: { path: string; label: string; Icon: typeof ActivityIcon }, count?: number) => (
    <a
      key={n.path}
      className={`nav-item ${activePath === n.path ? 'active' : ''}`}
      href={`#${n.path}`}
      onClick={() => setDrawerOpen(false)}
    >
      <span className="nav-icon">
        <n.Icon size={17} />
      </span>
      <span className="nav-label">{n.label}</span>
      {!!count && (
        <span className="count">
          <span className="count-text">{count}</span>
        </span>
      )}
      <span className="rail-tooltip">{n.label}</span>
    </a>
  );

  const statusBadges = analysis && (
    <>
      <span className="badge bad"><Sdot tone="bad" size="sm" />{analysis.counts.critical} critical</span>
      <span className="badge warn"><Sdot tone="warn" size="sm" />{analysis.counts.needsAttention} need attention</span>
      <span className="badge ok"><Sdot tone="ok" size="sm" />{analysis.counts.healthy} healthy</span>
    </>
  );

  const sidebar = (
    <aside className={`sidebar ${drawerOpen ? 'is-open' : ''} ${railExpanded ? 'is-expanded' : ''}`} ref={sidebarRef}>
      <div className="brand">
        <div className="brand-mark">
          <BrandMark />
        </div>
        <div className="brand-text">
          <strong className="brand-name">Quorum</strong>
          <small className="brand-sub">Product definition quality gate</small>
        </div>
        <button className="btn ghost sm brand-close" aria-label="Close menu" onClick={closeDrawer}>
          <CloseIcon size={18} />
        </button>
      </div>
      <div className="sidebar-divider brand-divider" />
      <div className="nav-section">Overview</div>
      {NAV.map((n) =>
        navLink(
          n,
          n.path === '/backlog'
            ? analysis && analysis.counts.stories + analysis.counts.bugs
            : n.path === '/decisions'
              ? analysis && debt
              : n.path === '/drift'
                ? analysis && analysis.metrics.drift
                : undefined,
        ),
      )}
      <div className="nav-section">Administration</div>
      {ADMIN.map((n) => navLink(n))}
      <div className="sidebar-divider sources-divider" />
      <div className="nav-section sources-group-label">Sources</div>
      <div className="sources-group col">
        {(['jira', 'confluence', 'figma'] as const).map((s) => (
          <div key={s} className="source-row nav-item" style={{ cursor: 'default' }} title={s.charAt(0).toUpperCase() + s.slice(1)}>
            <Source source={s} size={17} />
          </div>
        ))}
      </div>
      <div className="spacer" />
      <button
        className="nav-expand-btn btn ghost sm"
        aria-label={railExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        onClick={() => setRailExpanded((o) => disclosureReducer(o, 'toggle'))}
      >
        <PanelLeftIcon size={17} />
      </button>
    </aside>
  );

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        {(drawerOpen || railExpanded) && (
          <div
            className={`scrim ${drawerOpen ? 'scrim-strong' : ''}`}
            onClick={() => {
              setDrawerOpen(false);
              setRailExpanded(false);
            }}
          />
        )}
        {sidebar}
        <div className="main">
          <div className="mobile-topbar">
            <div className="mobile-topbar-row">
              <button
                ref={menuBtnRef}
                className="mobile-topbar-menu-btn"
                aria-label="Open menu"
                aria-controls="sidebar"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen((o) => disclosureReducer(o, 'toggle'))}
              >
                <MenuIcon size={20} />
              </button>
              <div className="mobile-topbar-brand">
                <div className="brand-mark" style={{ width: 28, height: 28 }}>
                  <BrandMark size={16} />
                </div>
                Quorum
              </div>
              <div className="grow" />
              <AccountMenu navigate={navigate} />
            </div>
            {analysis && (
              <div className="mobile-status-row">
                <div className="mobile-status-row-top">
                  <span className="topbar-project">
                    Project: <strong>{analysis.project.name}</strong>
                  </span>
                  <span className="topbar-last-analysis">
                    <ClockIcon size={13} />
                    {ago(analysis.analyzedAt)}
                  </span>
                </div>
                <div className="mobile-status-badges header-badges">{statusBadges}</div>
                <button className="btn primary" onClick={runAnalysis} disabled={running}>
                  {running ? <Spinner /> : <RefreshIcon size={16} />} Analyze now
                </button>
              </div>
            )}
          </div>
          <header className="topbar">
            <div className="topbar-project">
              Project: <strong>{analysis?.project.name ?? '…'}</strong>
            </div>
            <div className="grow" />
            {analysis && <div className="row header-badges">{statusBadges}</div>}
            <div className="topbar-last-analysis">
              <ClockIcon size={14} />
              <span className="topbar-last-analysis-label">Last analysis: </span>
              <strong>{ago(analysis?.analyzedAt)}</strong>
              {analysis && <span className="topbar-last-analysis-ms"> in {analysis.durationMs} ms</span>}
              {analysis?.ai.enabled && <span className="badge accent">AI: {analysis.ai.model}</span>}
            </div>
            <button className="btn primary" onClick={runAnalysis} disabled={running}>
              {running ? <Spinner /> : <RefreshIcon size={16} />} Analyze now
            </button>
            <AccountMenu navigate={navigate} />
          </header>
          <main className="content">{page}</main>
        </div>
      </div>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
}
