/** Types for backup-lib.mjs, so backup.ts and the server tests can use it. */
export interface LibpqTarget { url: string; password: string; database: string; host: string; port: string }
export interface BackupName { name: string; environment: string; at: Date; label: string | null }
export interface TableManifest { tables: Record<string, number>; lastMigration: string | null }
export declare function libpqTarget(databaseUrl: string): LibpqTarget;
export declare function withDatabase(databaseUrl: string, database: string): string;
export declare function describeUrl(databaseUrl: string): string;
export declare function sameDatabase(a: string, b: string): boolean;
export declare function backupFileName(environment: string, at: Date, label?: string | null): string;
export declare function parseBackupFileName(name: string): BackupName | null;
export declare function retentionPlan(
  names: string[],
  now: Date,
  options?: { keepDaily?: number; keepWeekly?: number; keepLabelled?: number },
): { keep: string[]; remove: string[] };
export declare function compareManifest(
  expected: Partial<TableManifest>,
  actual: TableManifest,
): { ok: boolean; problems: string[]; tables: number; rows: number };
export declare function offsiteTarget(value: string | undefined | null): { kind: 'rclone' | 'rsync' | 's3'; dest: string } | null;
