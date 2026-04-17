// Shared data contract between scripts/fetch-data.ts and the React app.
// All JSON files under public/data/ follow these shapes.

export type MilestoneState = 'open' | 'closed';

/** Derived status used for visual grouping in UI */
export type MilestoneDerivedStatus = 'done' | 'in_progress' | 'overdue' | 'no_due';

export interface Totals {
  repos: number;            // active repos (with at least one milestone)
  allRepos: number;         // all repos fetched (incl. empty)
  milestones: number;
  openMilestones: number;
  closedMilestones: number;
  overdueMilestones: number;
  openIssues: number;
  closedIssues: number;
}

export interface RepoSummary {
  name: string;
  description: string | null;
  htmlUrl: string;
  isPrivate: boolean;
  language: string | null;
  updatedAt: string;       // ISO 8601
  milestoneCount: number;
  openMilestoneCount: number;
  closedMilestoneCount: number;
  overdueCount: number;
  completionRate: number;  // 0–1
  openIssues: number;
  closedIssues: number;
  nextDueMilestone: {
    number: number;
    title: string;
    dueOn: string;
    htmlUrl: string;
  } | null;
}

export interface Summary {
  generatedAt: string;     // ISO 8601
  totals: Totals;
  repos: RepoSummary[];    // sorted by: hasMilestones desc, name asc
}

export interface IssueLite {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: { name: string; color: string }[];
  assignees: string[];     // GitHub usernames
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface Milestone {
  number: number;
  title: string;
  description: string | null;
  state: MilestoneState;
  dueOn: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  openIssues: number;
  closedIssues: number;
  completion: number;      // 0–1 based on issues count
  htmlUrl: string;
  issues: IssueLite[];
}

/** public/data/repos/{name}.json */
export interface RepoDetail {
  name: string;
  description: string | null;
  htmlUrl: string;
  isPrivate: boolean;
  language: string | null;
  updatedAt: string;
  milestones: Milestone[];
}
