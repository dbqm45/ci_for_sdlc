import type { ReactNode } from 'react';

export const DIMENSION_LABELS: Record<string, string> = {
  requirements: 'Requirements',
  design: 'Design',
  documentation: 'Documentation',
  architecture: 'Architecture',
  userJourneys: 'User journeys',
  errorHandling: 'Error handling',
  dependencies: 'Dependencies',
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

export const SOURCE_LABELS: Record<string, string> = { jira: 'Jira', confluence: 'Confluence', figma: 'Figma', decision: 'Decision' };

export function healthTone(status: string): 'ok' | 'warn' | 'bad' {
  return status === 'healthy' || status === 'ready' || status === 'ok' ? 'ok' : status === 'critical' || status === 'not_ready' || status === 'fail' ? 'bad' : 'warn';
}

export function StatusBadge({ status }: { status: string }) {
  const label =
    { healthy: 'Healthy', needs_attention: 'Needs attention', critical: 'Critical', ready: 'Ready', not_ready: 'Not ready' }[status] ??
    status.replace('_', ' ');
  const icon = { ok: '●', warn: '●', bad: '●' }[healthTone(status)];
  return (
    <span className={`badge ${healthTone(status)}`}>
      {icon} {label}
    </span>
  );
}

export function ReadinessBadge({ readiness }: { readiness: string }) {
  const label = { ready: '🟢 READY FOR IMPLEMENTATION', needs_attention: '🟡 NEEDS ATTENTION', not_ready: '🔴 NOT READY' }[readiness] ?? readiness;
  return <span className={`badge ${healthTone(readiness)}`} style={{ fontSize: 12.5, padding: '4px 10px' }}>{label}</span>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone = severity === 'critical' ? 'bad' : severity === 'warning' ? 'warn' : '';
  return <span className={`badge ${tone}`}>{severity === 'critical' ? '🔴 Critical' : severity === 'warning' ? '🟡 Warning' : '⚪ Info'}</span>;
}

export function Source({ source }: { source?: string }) {
  if (!source) return null;
  return <span className={`src ${source}`}>{SOURCE_LABELS[source] ?? source}</span>;
}

export function Bar({ value, tone }: { value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const t = tone ?? (value >= 85 ? 'ok' : value >= 60 ? 'warn' : 'bad');
  return (
    <div className="bar">
      <span style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: `var(--${t})` }} />
    </div>
  );
}

export function HealthNumber({ value, status }: { value: number; status: string }) {
  return <span className="health" style={{ color: `var(--${healthTone(status)})` }}>{value}</span>;
}

export function Card({ title, actions, children, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          <h2>{title}</h2>
          {actions}
        </div>
      )}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
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
