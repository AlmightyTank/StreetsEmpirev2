/** Types for patch-notes.mjs, so server tests can check how PR bodies become news. */
export declare const TITLE_MAX: number;
export declare const BODY_MAX: number;
export declare function extractPatchNotes(body: string | null | undefined): string[];
export declare function buildPatchNotes(
  pulls: Array<{ number: number; mergedAt: string; body: string }>,
  date?: Date,
): { title: string; body: string } | null;
