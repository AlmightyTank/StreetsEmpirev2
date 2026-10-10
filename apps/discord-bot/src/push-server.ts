import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** A member as the admin account page shows them; see moderation.ts. */
export interface DiscordMemberStatus {
  inServer: boolean;
  displayName: string | null;
  timedOutUntil: string | null;
  canModerate: boolean;
  /** Why the bot cannot time them out, in words an admin can act on. */
  problem: string | null;
}

export interface PushServerOptions {
  host: string;
  port: number;
  token: string;
  onWake: () => Promise<void>;
  /** Admin account page: the member's server status. Off when not given. */
  onMember?: (discordId: string) => Promise<DiscordMemberStatus>;
  /** Admin account page: time a member out (minutes) or lift it (null). Off when not given. */
  onTimeout?: (input: { discordId: string; minutes: number | null; reason: string }) => Promise<DiscordMemberStatus>;
}

const snowflake = z.string().regex(/^[0-9]{17,20}$/);
const memberSchema = z.object({ discordId: snowflake }).strict();
// Discord caps a timeout at 28 days.
const timeoutSchema = z.object({ discordId: snowflake, minutes: z.number().int().min(1).max(28 * 24 * 60).nullable(), reason: z.string().trim().min(1).max(500) }).strict();

/** Thrown by a handler for a refusal the admin should read, sent back as 409. */
export class MemberActionError extends Error {}

const BODY_LIMIT = 4_096;

function bearerMatches(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header.slice('Bearer '.length)), digest(token));
}

function drain(request: http.IncomingMessage): void {
  request.resume();
}

function readJson(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('Body too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

async function answer<S extends z.ZodTypeAny>(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  schema: S,
  handler: (input: z.infer<S>) => Promise<DiscordMemberStatus>,
): Promise<void> {
  let input: z.infer<S>;
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) {
      sendJson(response, 400, { error: { message: 'That request was not valid.' } });
      return;
    }
    input = parsed.data;
  } catch {
    sendJson(response, 400, { error: { message: 'That request was not valid JSON.' } });
    return;
  }
  try {
    sendJson(response, 200, { member: await handler(input) });
  } catch (error) {
    if (error instanceof MemberActionError) {
      sendJson(response, 409, { error: { message: error.message } });
      return;
    }
    console.error(`Bot listener ${request.url} failed:`, error);
    sendJson(response, 502, { error: { message: 'Discord did not answer. Try again in a minute.' } });
  }
}

/**
 * The bot's local listener for the game server: wake-up nudges, and for the admin
 * account page a member's status and timeouts. Localhost only, behind the bot token.
 */
export async function startPushServer(options: PushServerOptions): Promise<() => Promise<void>> {
  const server = http.createServer((request, response) => {
    const route = request.method === 'POST' ? request.url : null;
    const known = route === '/internal/wake'
      || (route === '/internal/member' && options.onMember)
      || (route === '/internal/timeout' && options.onTimeout);
    if (!known) {
      drain(request);
      response.writeHead(404).end();
      return;
    }

    if (!bearerMatches(request.headers.authorization, options.token)) {
      drain(request);
      response.writeHead(401).end();
      return;
    }

    if (route === '/internal/member') {
      void answer(request, response, memberSchema, (input) => options.onMember!(input.discordId));
      return;
    }
    if (route === '/internal/timeout') {
      void answer(request, response, timeoutSchema, (input) => options.onTimeout!(input));
      return;
    }

    drain(request);
    response.writeHead(202).end();
    options.onWake().catch((error: unknown) => console.error('Discord push wake failed:', error));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  console.log(`Listening for game-server Discord wake nudges on http://${options.host}:${options.port}/internal/wake.`);

  return () => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function startOptionalPushServer(options: PushServerOptions): Promise<(() => Promise<void>) | null> {
  try {
    return await startPushServer(options);
  } catch (error) {
    console.warn(
      `Discord push wake listener is off: could not bind http://${options.host}:${options.port}/internal/wake. `
      + 'The bot will continue and use polling as the fallback.',
      error,
    );
    return null;
  }
}
