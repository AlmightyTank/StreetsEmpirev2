import { z } from 'zod';

/** rc.2. Bug reports players send from the game, and account closure. */

export const BUG_REPORT_CATEGORIES = ['GAMEPLAY', 'DISPLAY', 'ACCOUNT', 'PERFORMANCE', 'OTHER'] as const;
export type BugReportCategory = (typeof BUG_REPORT_CATEGORIES)[number];

export const BUG_REPORT_CATEGORY_LABELS: Record<BugReportCategory, string> = {
  GAMEPLAY: 'Something in the game works wrong',
  DISPLAY: 'Something looks wrong or is hard to use',
  ACCOUNT: 'Signing in, email or account settings',
  PERFORMANCE: 'Slow, stuck or errors',
  OTHER: 'Something else',
};

/** A player may send this many bug reports per hour. */
export const BUG_REPORTS_PER_HOUR = 5;

export const bugReportSchema = z.object({
  category: z.enum(BUG_REPORT_CATEGORIES),
  summary: z.string().trim().min(5, 'Say what went wrong in a few words.').max(120),
  details: z.string().trim().min(10, 'Tell us a little more: what you did, and what happened.').max(4000),
  /** The game page they were on, filled in by the client. */
  pagePath: z.string().max(200).optional(),
}).strict();
export type BugReportInput = z.infer<typeof bugReportSchema>;

export const BUG_REPORT_RESOLUTIONS = ['FIXED', 'WONT_FIX', 'DUPLICATE'] as const;
export type BugReportResolution = (typeof BUG_REPORT_RESOLUTIONS)[number];
export type AdminBugReportStatus = 'open' | 'resolved';

export interface AdminBugReportDto {
  id: string;
  accountId: string | null;
  username: string;
  category: BugReportCategory;
  summary: string;
  details: string;
  pagePath: string | null;
  userAgent: string | null;
  appVersion: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByUsername: string | null;
  resolution: BugReportResolution | null;
  resolutionNote: string | null;
}

export interface AdminBugReportQueueDto {
  status: AdminBugReportStatus;
  page: number;
  totalPages: number;
  total: number;
  counts: { open: number; resolved: number };
  reports: AdminBugReportDto[];
}

/**
 * Closing your own account: the password confirms it (a session that signed in with
 * Discord may leave it out, since a Discord-made account never chose one), and the
 * word CLOSE guards against a slip.
 */
export const closeAccountSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  confirm: z.literal('CLOSE', { errorMap: () => ({ message: 'Type CLOSE to confirm.' }) }),
}).strict();
export type CloseAccountInput = z.infer<typeof closeAccountSchema>;
