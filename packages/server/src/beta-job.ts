import { dueReminders, judgeEnrollment, type Reminder } from './beta-lifecycle.js';
import { surveyStates, type BetaEnrollment, type BetaEnrollments } from './beta.js';
import { SURVEYS } from './beta-surveys.js';
import type { Mail, Mailer } from './mailer.js';
import type { Workspace } from './workspaces.js';

/**
 * The beta's daily job (docs/BETA-ENROLLMENT-PLAN.md, third PR), run every hour so a late run catches up: records each
 * team's judged status, holds the scheduled and webhook analyses of a paused or ended team, and sends the reminders.
 * Every mail is sent once (its key is kept in the enrollment); a failed send is tried again on the next run.
 */
export interface BetaJobDeps {
  beta: BetaEnrollments;
  mailer: Mailer;
  operatorEmails: string[];
  publicUrl: string;
  pauseAfterDays: number;
  /** The workspaces of an organization. */
  workspacesOf: (orgId: string) => Workspace[];
  /** Audits in the team's workspace. */
  audit: (orgId: string, summary: string, at: string) => Promise<void>;
  log: (o: object, msg: string) => void;
}

const day = (iso: string) => iso.slice(0, 10);

/** The mails of the beta, plain text. `link` is the app's address for the team's workspace or the survey. */
export const betaMails = {
  applied: (e: BetaEnrollment): Mail => ({
    to: [e.application.contactEmail],
    subject: 'Quorum beta: we have your application',
    text: `Hello ${e.application.contactName},\n\nthank you for applying for the Quorum closed beta with ${e.application.team} at ${e.application.org}. We read every application and will write back. If your team is chosen, you get a one-time link to log in with Atlassian.\n`,
  }),
  newApplication: (e: BetaEnrollment, operators: string[], appUrl: string): Mail => ({
    to: operators,
    subject: `Quorum beta: new application from ${e.application.org}`,
    text: `${e.application.contactName} (${e.application.contactEmail}) applied with ${e.application.team} at ${e.application.org}: ${e.application.writers} writing, ${e.application.builders} building, sources ${e.application.sources.join(', ')}.\n\nDecide on ${appUrl}/#/operator\n`,
  }),
  invited: (e: BetaEnrollment, link: string, weeks: number): Mail => ({
    to: [e.application.contactEmail],
    subject: 'Quorum beta: your invitation',
    text: `Hello ${e.application.contactName},\n\n${e.application.team} is in the Quorum closed beta. Log in with the Atlassian account of ${e.application.contactEmail} through this one-time link, valid for 7 days:\n\n${link}\n\nThe beta runs for ${weeks} weeks from your first login. It starts with a 7-minute entry survey; after that, a 5-minute survey every two weeks.\n`,
  }),
  reminder: (e: BetaEnrollment, r: Reminder, appUrl: string, pauseOn?: string): Mail => {
    const s = r.survey;
    const name = s ? SURVEYS[s.kind].title.toLowerCase() : '';
    const link = s ? `${appUrl}/#/w/${e.workspace}/survey/${s.id}` : `${appUrl}/#/w/${e.workspace}/survey`;
    const subject = {
      survey_open: `Quorum beta: the ${name} is open`,
      survey_due: `Quorum beta: the ${name} is due ${s ? day(s.dueAt) : ''}`,
      survey_late: `Quorum beta: the ${name} is overdue`,
      pause_warning: `Quorum beta: analyses pause on ${pauseOn ? day(pauseOn) : 'soon'}`,
    }[r.kind];
    const body = {
      survey_open: `The ${name} is open (about ${s ? SURVEYS[s.kind].minutes : 5} minutes, due ${s ? day(s.dueAt) : ''}).`,
      survey_due: `The ${name} is due ${s ? day(s.dueAt) : ''}.`,
      survey_late: `The ${name} was due ${s ? day(s.dueAt) : ''}. Without it, analyses pause ${pauseOn ? `on ${day(pauseOn)}` : 'soon'}.`,
      pause_warning: `A survey is still waiting. Unless it is answered, analyses and AI reviews in Quorum pause on ${pauseOn ? day(pauseOn) : 'soon'}. Your data stays; answering resumes them at once.`,
    }[r.kind];
    return { to: [e.application.contactEmail], subject, text: `Hello ${e.application.contactName},\n\n${body}\n\n${link}\n`, key: `${e.id}:${r.key}` };
  },
  pauseWarningOperator: (e: BetaEnrollment, operators: string[], pauseOn: string, appUrl: string): Mail => ({
    to: operators,
    subject: `Quorum beta: ${e.application.org} pauses on ${day(pauseOn)}`,
    text: `${e.application.team} at ${e.application.org} has an overdue survey and pauses on ${day(pauseOn)}. To hold it off (holiday, a change in the team), use "No pause for…" on ${appUrl}/#/operator\n`,
    key: `${e.id}:operator-pause:${pauseOn}`,
  }),
  paused: (e: BetaEnrollment, reason: string, appUrl: string): Mail => ({
    to: [e.application.contactEmail],
    subject: 'Quorum beta: analyses are paused',
    text: `Hello ${e.application.contactName},\n\nanalyses and AI reviews in Quorum are paused for ${e.application.team}: ${reason}. Everything else stays readable, and answering the survey resumes them at once:\n\n${appUrl}/#/w/${e.workspace}/survey\n`,
  }),
  resumed: (e: BetaEnrollment, appUrl: string): Mail => ({
    to: [e.application.contactEmail],
    subject: 'Quorum beta: analyses resumed',
    text: `Hello ${e.application.contactName},\n\nthank you — analyses in Quorum run again for ${e.application.team}.\n\n${appUrl}/#/w/${e.workspace}/overview\n`,
  }),
  ended: (e: BetaEnrollment, appUrl: string): Mail => ({
    to: [e.application.contactEmail],
    subject: 'Quorum beta: the beta has ended — one last survey',
    text: `Hello ${e.application.contactName},\n\nthe Quorum beta for ${e.application.team} has ended. Your data stays readable for now. Please fill in the exit survey (about 10 minutes): it decides what Quorum becomes, and its price.\n\n${appUrl}/#/w/${e.workspace}/survey/exit\n`,
  }),
};

/** One run of the job at `now`. */
export async function runBetaJob(d: BetaJobDeps, now = Date.now()) {
  const at = new Date(now).toISOString();
  const send = async (m: Mail) => {
    try {
      await d.mailer.send(m);
      return true;
    } catch (err) {
      d.log({ err: err instanceof Error ? err.message : String(err), subject: m.subject }, 'beta mail failed; the next run tries again');
      return false;
    }
  };
  for (const e of d.beta.enrollments()) {
    if (!e.startedAt || !e.orgId || !['active', 'overdue', 'paused', 'ended'].includes(e.status)) continue;
    const states = surveyStates(e, now);
    const j = judgeEnrollment(e, states, now, d.pauseAfterDays);

    // Scheduled and webhook analyses wait while the team is paused or the beta has ended.
    const hold = j.status === 'paused' ? `beta paused: ${j.reason}` : j.status === 'ended' ? 'beta ended' : undefined;
    for (const w of d.workspacesOf(e.orgId)) w.engine.hold = hold;

    if (j.status !== e.status) {
      const was = e.status;
      await d.beta.record(e.id, j.status, at, j.reason);
      const summary = j.status === 'paused' ? `Beta paused: ${j.reason}` : j.status === 'ended' ? 'Beta ended' : was === 'paused' ? 'Beta resumed' : j.status === 'overdue' ? 'Beta: a survey is overdue' : `Beta ${j.status}`;
      await d.audit(e.orgId, summary, at);
      const mail = j.status === 'paused' ? betaMails.paused(e, j.reason!, d.publicUrl) : j.status === 'ended' ? betaMails.ended(e, d.publicUrl) : was === 'paused' ? betaMails.resumed(e, d.publicUrl) : undefined;
      if (mail) {
        await send({ ...mail, key: `${e.id}:status:${j.status}:${at.slice(0, 13)}` });
        if (j.status === 'paused' && d.operatorEmails.length) await send({ to: d.operatorEmails, subject: `Quorum beta: ${e.application.org} is paused`, text: `${e.application.team} at ${e.application.org}: ${j.reason}.\n\n${d.publicUrl}/#/operator\n` });
      }
    }

    const { send: due, skip } = dueReminders(e, j, states, now);
    const done: string[] = [...skip];
    for (const r of due) {
      const ok = await send(betaMails.reminder(e, r, d.publicUrl, j.pauseOn));
      if (ok && r.kind === 'pause_warning' && d.operatorEmails.length) await send(betaMails.pauseWarningOperator(e, d.operatorEmails, j.pauseOn!, d.publicUrl));
      if (ok) done.push(r.key);
    }
    await d.beta.markReminders(e.id, done, at);
  }
}
