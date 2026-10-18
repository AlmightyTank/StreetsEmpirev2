export declare function lastVersionCommit(): string | null;
export declare function planRelease(input: {
  to: string;
  branch?: string;
  repo?: string;
  from?: string | null;
  pullsFor?: (from: string, to: string) => Array<{ title?: string; body?: string | null; labels?: string[] }>;
}): { level: 'major' | 'minor' | 'patch'; previous: string; version: string } | null;
