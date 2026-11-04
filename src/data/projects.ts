/**
 * Project → points rule. Shared by the server (authoritative award) and the
 * steward desk (preview before approval), so a review never shows a different
 * number from the ledger.
 */
export interface ProjectFacts {
  people: number;
  hours: number;
  amount: string;
}

export const PROJECT_MIN_POINTS = 50;
export const PROJECT_MAX_POINTS = 500;

export function projectPoints(facts: ProjectFacts): number {
  const raw = PROJECT_MIN_POINTS + Math.round(facts.hours * 4 + facts.people * 2);
  return Math.min(PROJECT_MAX_POINTS, Math.max(PROJECT_MIN_POINTS, raw));
}
