import type { ReactNode } from 'react';
import { ArrowUpRightIcon, SearchIcon } from './icons';

export const DIMENSION_LABELS: Record<string, string> = {
  requirements: 'Requirements',
  design: 'Design',
  documentation: 'Documentation',
  architecture: 'Architecture',
  userJourneys: 'User journeys',
  errorHandling: 'Error handling',
  dependencies: 'Dependencies',
  delivery: 'Release plan',
};

export const STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  loading: 'Loading / Submitting',
  processing: 'Processing',
  success: 'Success',
  validation_error: 'Validation error',
  server_error: 'Server error',
  timeout: 'Timeout',
  retry: 'Retry',
  empty: 'Empty',
  confirmation: 'Confirmation',
  session_expired: 'Session expired',
  network_failure: 'Network failure',
  permission_denied: 'Permission denied',
};

export const JOURNEY_LABELS: Record<string, string> = {
  happy_path: 'Happy path',
  validation_error: 'Validation error',
  server_error: 'Server error',
  timeout: 'Timeout',
  retry: 'Retry',
  session_expired: 'Session expired',
  network_failure: 'Network failure',
  permission_denied: 'Permission denied',
  empty_state: 'Empty state',
  cancel: 'Cancel / leave flow',
};

export const CATEGORY_LABELS: Record<string, string> = {
  GAP: 'Gap',
  CONFLICT: 'Conflict',
  AMBIGUITY: 'Ambiguity',
  OUTDATED: 'Outdated',
  MISSING_COVERAGE: 'Missing coverage',
  DRIFT: 'Drift',
};

export const SOURCE_LABELS: Record<string, string> = { jira: 'Jira', confluence: 'Confluence', figma: 'Figma', decision: 'Decision', code: 'Code (tf)', test: 'Tests', api: 'API (OpenAPI)' };

export function healthTone(status: string): 'ok' | 'warn' | 'bad' {
  return status === 'healthy' || status === 'ready' || status === 'ok' ? 'ok' : status === 'critical' || status === 'not_ready' || status === 'fail' ? 'bad' : 'warn';
}

/** 6–7px dot in the status-solid color, used by every status/severity badge instead of an emoji. */
export function Sdot({ tone, size = 'md' }: { tone: 'ok' | 'warn' | 'bad'; size?: 'sm' | 'md' }) {
  return <span className={`sdot sdot-${tone} sdot-${size}`} aria-hidden="true" />;
}

export function StatusBadge({ status }: { status: string }) {
  const label =
    { healthy: 'Healthy', needs_attention: 'Needs attention', critical: 'Critical', ready: 'Ready', not_ready: 'Not ready' }[status] ??
    status.replace('_', ' ');
  return (
    <span className={`badge ${healthTone(status)}`}>
      <Sdot tone={healthTone(status)} /> {label}
    </span>
  );
}

export function ReadinessBadge({ readiness }: { readiness: string }) {
  const label = { ready: 'READY FOR IMPLEMENTATION', needs_attention: 'NEEDS ATTENTION', not_ready: 'NOT READY' }[readiness] ?? readiness;
  return (
    <span className={`badge ${healthTone(readiness)}`}>
      <Sdot tone={healthTone(readiness)} /> {label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone = severity === 'critical' ? 'bad' : severity === 'warning' ? 'warn' : undefined;
  const label = severity === 'critical' ? 'Critical' : severity === 'warning' ? 'Warning' : 'Info';
  return (
    <span className={`badge ${tone ?? ''}`}>
      {tone ? <Sdot tone={tone} /> : <span className="sdot sdot-info" aria-hidden="true" />} {label}
    </span>
  );
}

/** Square 14px tile: ✓ for OK, ! for Warning, × for Critical — replaces the old ✓ ⚠ ✗ glyphs everywhere. */
export function StatusIcon({ status }: { status: 'ok' | 'warn' | 'bad' }) {
  return (
    <span className={`status-icon status-icon-${status}`} aria-hidden="true">
      {status === 'ok' && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2l2.4 2.3 4.6-5" />
        </svg>
      )}
      {status === 'warn' && <span className="status-icon-bang">!</span>}
      {status === 'bad' && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
        </svg>
      )}
    </span>
  );
}

/** Black 20px circle with a white "?" — replaces the ❓ emoji in Decisions and FindingCard questions. */
export function QuestionMark() {
  return <span className="qmark" aria-hidden="true">?</span>;
}

/** Thin chevron, rotated 90° when `open` — replaces the ▸ / ▾ glyphs used for expandable rows. */
export function Chevron({ open }: { open?: boolean }) {
  return (
    <svg className="chevron" style={open ? { transform: 'rotate(90deg)' } : undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

const SOURCE_COLOR: Record<string, string> = { jira: 'var(--src-jira)', confluence: 'var(--src-confluence)', figma: '', decision: 'var(--src-decision)' };

/** 17px logo mark shared by the sidebar, header Sources rows, Settings integrations and the Source badge. */
export function SourceLogo({ source, size = 17 }: { source: string; size?: number }) {
  // Jira / Confluence marks as in the design: 15px glyph centered in a 17px slot (viewBox padded by 1.6).
  if (source === 'jira') {
    return (
      <svg width={size} height={size} viewBox="-1.6 -1.6 27.2 27.2" aria-hidden="true">
        <path
          fill="var(--src-jira)"
          d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z"
        />
      </svg>
    );
  }
  if (source === 'confluence') {
    return (
      <svg width={size} height={size} viewBox="-1.6 -1.6 27.2 27.2" aria-hidden="true">
        <path
          fill="var(--src-confluence)"
          d="M.87 18.257c-.248.382-.53.875-.763 1.245a.764.764 0 0 0 .255 1.04l4.965 3.054a.764.764 0 0 0 1.058-.26c.199-.332.454-.763.733-1.221 1.967-3.247 3.945-2.853 7.508-1.146l4.957 2.337a.764.764 0 0 0 1.028-.382l2.364-5.346a.764.764 0 0 0-.382-1 599.851 599.851 0 0 1-4.965-2.361C10.911 10.97 5.224 11.185.87 18.257zM23.131 5.743c.249-.405.531-.875.764-1.25a.764.764 0 0 0-.256-1.034L18.675.404a.764.764 0 0 0-1.058.26c-.195.335-.451.763-.734 1.225-1.966 3.246-3.945 2.85-7.508 1.146L4.437.694a.764.764 0 0 0-1.027.382L1.046 6.422a.764.764 0 0 0 .382 1c1.039.49 3.105 1.467 4.965 2.361 6.698 3.246 12.392 3.029 16.738-4.04z"
        />
      </svg>
    );
  }
  if (source === 'figma') {
    // 11×16 mark centered in the 17px slot, as in the design
    return (
      <svg width={size} height={size} viewBox="-12.8 -2.3 63.6 61.6" aria-hidden="true">
        <path fill="var(--figma-5)" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
        <path fill="var(--figma-1)" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
        <path fill="var(--figma-4)" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
        <path fill="var(--figma-3)" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
        <path fill="var(--figma-2)" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
      </svg>
    );
  }
  if (source === 'api') {
    // An OpenAPI contract — no brand, a neutral { } mark
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 4c-2 0-2 2-2 4s-1 4-3 4c2 0 3 2 3 4s0 4 2 4M16 4c2 0 2 2 2 4s1 4 3 4c-2 0-3 2-3 4s0 4-2 4" fill="none" stroke="var(--src-decision)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (source === 'code') {
    // tf's reconstruction from code — no brand, a neutral </> mark
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" fill="none" stroke="var(--src-decision)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  // decision — no external brand, a simple neutral dot mark
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--src-decision)" strokeWidth="2" />
      <path d="m8 12 3 3 5-6" fill="none" stroke="var(--src-decision)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Source({ source, size = 14 }: { source?: string; size?: number }) {
  if (!source) return null;
  return (
    <span className={`src src-${source}`}>
      <SourceLogo source={source} size={size} /> <span className="src-label">{SOURCE_LABELS[source] ?? source}</span>
    </span>
  );
}

export function Bar({ value, tone }: { value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const t = tone ?? (value >= 85 ? 'ok' : value >= 60 ? 'warn' : 'bad');
  return (
    <div className="bar">
      <span style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: `var(--${t}-solid)` }} />
    </div>
  );
}

export function HealthNumber({ value, status }: { value: number; status: string }) {
  return (
    <span className="health" style={{ color: `var(--${healthTone(status)})` }}>
      {value}
    </span>
  );
}

export function Card({ title, actions, children, pad = true, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="card-head">
          <h2>{title}</h2>
          {actions}
        </div>
      )}
      <div className={pad ? 'card-pad card-body' : 'card-body'}>{children}</div>
    </section>
  );
}

/** `tone` colors the value; `tint` additionally fills the whole tile (only for headline Warnings/Critical tiles). */
export function Stat({ label, value, sub, tone, tint }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' | string; tint?: boolean }) {
  const toned = tint && (tone === 'warn' || tone === 'bad');
  return (
    <div className={`card stat ${toned ? `stat-${tone}` : ''}`}>
      <div className="label">{label}</div>
      <div className="value" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** `toLocaleString()` split into a date line + a small time line, used by every "When" table column. */
export function DateTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <span className="datetime">
      <span className="date">{d.toLocaleDateString()}</span>
      <span className="time">{d.toLocaleTimeString()}</span>
    </span>
  );
}

/** Shared empty-state block: dashed border, centered icon tile, bold line + muted explanation. */
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon ?? <SearchIcon size={18} />}</span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function LinkArrow({ children }: { children: ReactNode }) {
  return (
    <span className="row link-arrow">
      {children}
      <ArrowUpRightIcon size={13} />
    </span>
  );
}

export function ago(iso?: string): string {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function Spinner() {
  return <span className="spin" aria-label="Loading" />;
}
