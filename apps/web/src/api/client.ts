import type { ApiErrorBody } from '@streets/shared';

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Errors arrive from the server already written for a player. The client's
 * only job is to keep the message intact and hand the field map to the form.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** The client cannot know whether the server committed before this failed. */
  get isUncertain(): boolean {
    return this.status === 0 || this.status >= 500;
  }

  /** Safe to offer another attempt. Resource-changing calls still reuse actionId. */
  get isRetryable(): boolean {
    return this.isUncertain || this.status === 408 || this.status === 425 || this.status === 429;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const externalSignal = init.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      ...init,
      signal: controller.signal,
      // The session lives in an http-only cookie, never in localStorage.
      credentials: 'include',
      headers: {
        // Only declare a JSON body when there actually is one - a bodyless
        // POST that claims application/json is rejected before it is routed.
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    });
  } catch {
    if (timedOut) {
      throw new ApiError(
        0,
        'REQUEST_TIMEOUT',
        'The game server took too long to answer. Your action can be retried safely.',
      );
    }

    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the game server. Check your connection and try again.',
    );
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }

  const text = await response.text();
  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(
        response.ok ? 502 : response.status,
        'INVALID_RESPONSE',
        'The game server returned an unreadable response. Try again.',
      );
    }
  }

  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Something went wrong. Try that again.',
      error?.fields,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, payload?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
  put: <T>(path: string, payload?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
};
