import type { Finding } from '@ci/core';

/**
 * R1: questions people asked, as the item page shows them. The newest question comes first, above the rules'
 * findings (their order is kept). Times are stored in UTC (ISO 8601) and shown in the viewer's own time zone; `Intl`
 * applies that zone's daylight saving time for the date in question, so a question asked at 20:35 UTC shows as 21:35
 * in Warsaw in November and 22:35 in July.
 */
export function orderFindings(list: readonly Finding[]): Finding[] {
  const asked = list.filter((f) => f.human).sort((a, b) => b.human!.askedAt.localeCompare(a.human!.askedAt));
  return [...asked, ...list.filter((f) => !f.human)];
}

/** A stored UTC time in the viewer's time zone (or the given one, for tests), date and time. */
export const localDateTime = (iso: string, timeZone?: string, locale?: string): string =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone && { timeZone }) }).format(new Date(iso));

/** The line under a person's question: who asked and when, in the viewer's time zone, and whether it counts yet. */
export function askedLine(human: NonNullable<Finding['human']>, timeZone?: string, locale?: string): string {
  const when = localDateTime(human.askedAt, timeZone, locale);
  const state = human.accepted
    ? `accepted for refinement by ${human.acceptedBy ?? 'the Product Owner'}`
    : 'waiting for the Product Owner to accept it — until then it does not change readiness';
  return `Asked by ${human.author} on ${when}; ${state}.`;
}
