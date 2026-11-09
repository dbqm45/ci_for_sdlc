/**
 * The closed beta in the UI (docs/BETA-ENROLLMENT-PLAN.md): the public application form at `#/beta`, the operator's
 * panel at `#/operator`, and the days left shown to a beta team.
 */
export type BetaStatus = 'applied' | 'rejected' | 'invited' | 'active' | 'ended';

/** How the beta looks to its team (GET /api/auth/me → `beta`). */
export interface BetaView {
  status: BetaStatus;
  startedAt?: string;
  endsAt?: string;
  daysLeft?: number;
}

export const SOURCES = [
  { id: 'jira', label: 'Jira Cloud' },
  { id: 'confluence', label: 'Confluence Cloud' },
  { id: 'figma', label: 'Figma' },
  { id: 'repo', label: 'A repository with change plans (tf/pdi)' },
  { id: 'other', label: 'Other' },
] as const;
export type SourceId = (typeof SOURCES)[number]['id'];

export interface ApplicationForm {
  org: string;
  team: string;
  contactName: string;
  contactEmail: string;
  contactRole: string;
  writers: string;
  builders: string;
  sources: SourceId[];
  realData: '' | 'yes' | 'one_project' | 'test_only';
  reference: '' | 'yes' | 'ask_first' | 'no';
  terms: boolean;
  measurement: boolean;
  surveys: boolean;
  /** Honeypot: hidden from people, left empty. */
  website: string;
}

export const EMPTY_FORM: ApplicationForm = {
  org: '',
  team: '',
  contactName: '',
  contactEmail: '',
  contactRole: '',
  writers: '',
  builders: '',
  sources: [],
  realData: '',
  reference: '',
  terms: false,
  measurement: false,
  surveys: false,
  website: '',
};

const count = (v: string) => (/^\d{1,4}$/.test(v.trim()) ? Number(v.trim()) : undefined);

/** What still stops the form from being sent, in the order of the fields; empty = it can be sent. */
export function formProblems(f: ApplicationForm): string[] {
  const out: string[] = [];
  if (!f.org.trim()) out.push('Organization is required');
  if (!f.team.trim()) out.push('Team is required');
  if (!f.contactName.trim()) out.push('Your name is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim())) out.push('A work e-mail is required');
  if (count(f.writers) === undefined) out.push('How many people write stories: a number');
  if (count(f.builders) === undefined) out.push('How many people build them: a number');
  if (!f.sources.length) out.push('Pick at least one source');
  if (!f.realData) out.push('Say whether you can connect real data');
  if (!f.terms || !f.measurement || !f.surveys) out.push('All three consents are needed to take part');
  return out;
}

/** The body of POST /api/beta/apply; call only when formProblems() is empty. */
export function applicationBody(f: ApplicationForm) {
  return {
    org: f.org.trim(),
    team: f.team.trim(),
    contactName: f.contactName.trim(),
    contactEmail: f.contactEmail.trim(),
    ...(f.contactRole.trim() && { contactRole: f.contactRole.trim() }),
    writers: count(f.writers)!,
    builders: count(f.builders)!,
    sources: f.sources,
    realData: f.realData as Exclude<ApplicationForm['realData'], ''>,
    ...(f.reference && { reference: f.reference }),
    consents: { terms: true as const, measurement: true as const, surveys: true as const },
    ...(f.website && { website: f.website }),
  };
}

/** A workspace id proposed from a team or organization name: lower case, digits and `-`, at most 40 characters. */
export function workspaceIdFrom(name: string): string {
  const id = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return id || 'team';
}

/** The label beside the workspace for a beta team; undefined outside the beta. */
export function betaLabel(beta: BetaView | null | undefined): string | undefined {
  if (!beta) return undefined;
  if (beta.status === 'ended') return 'Beta ended';
  if (beta.status !== 'active' || beta.daysLeft === undefined) return undefined;
  return beta.daysLeft === 1 ? 'Beta: last day' : `Beta: ${beta.daysLeft} days left`;
}

export const STATUS_LABEL: Record<BetaStatus, string> = { applied: 'Waiting', rejected: 'Rejected', invited: 'Invited', active: 'Active', ended: 'Ended' };
