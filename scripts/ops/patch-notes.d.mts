/** Types for patch-notes.mjs, so server tests can check how PR bodies become news. */
export declare const TITLE_MAX: number;
export declare const BODY_MAX: number;
/** SemVer 2.0.0: MAJOR.MINOR.PATCH with optional pre-release and build metadata. */
export declare const SEMVER: RegExp;
export declare function readAppVersion(source: string): string;
export declare function writeAppVersion(source: string, version: string): string;
export declare function declaredLevel(body: string | null | undefined): 'major' | 'minor' | 'patch' | 'skip' | null;
export declare function classifyRelease(pull: {
  title?: string;
  body?: string | null;
  labels?: Array<string | { name?: string }>;
}): 'major' | 'minor' | 'patch' | 'skip';
export declare function releaseLevel(
  pulls: Array<{ title?: string; body?: string | null; labels?: Array<string | { name?: string }> }>,
  hasChanges?: boolean,
): 'major' | 'minor' | 'patch' | null;
export declare function bumpVersion(version: string, level: 'major' | 'minor' | 'patch'): string;
export declare function extractPatchNotes(body: string | null | undefined): string[];
export declare function buildPatchNotes(
  pulls: Array<{ number: number; mergedAt: string; body: string }>,
  version: string,
): { title: string; body: string } | null;
