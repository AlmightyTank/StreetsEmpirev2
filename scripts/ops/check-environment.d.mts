/** Types for check-environment.mjs, so server tests can hold it to the server's rules. */
export declare const ENVIRONMENTS: readonly string[];
export declare const PRODUCTION_SESSION_COOKIE: string;
export declare function parseEnvFile(text: string): Map<string, string>;
export declare function environmentOf(values: Map<string, string>): string;
export declare function configProblems(values: Map<string, string>, expect: string): string[];
export declare function metaProblems(
  meta: { environment?: string; app?: { version?: string; commit?: string | null } } | null,
  expect: string,
  commit: string | undefined,
): string[];
