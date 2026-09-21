import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

export interface PushServerOptions {
  host: string;
  port: number;
  token: string;
  onWake: () => Promise<void>;
}

function bearerMatches(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header.slice('Bearer '.length)), digest(token));
}

function drain(request: http.IncomingMessage): void {
  request.resume();
}

export async function startPushServer(options: PushServerOptions): Promise<() => Promise<void>> {
  const server = http.createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/internal/wake') {
      drain(request);
      response.writeHead(404).end();
      return;
    }

    if (!bearerMatches(request.headers.authorization, options.token)) {
      drain(request);
      response.writeHead(401).end();
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
