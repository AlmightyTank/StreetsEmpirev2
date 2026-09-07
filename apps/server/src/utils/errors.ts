/**
 * Player-facing errors. Section 50.
 *
 * Every message here is written for someone playing the game, not someone
 * reading a stack trace. "400 Bad Request" is never an acceptable answer.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(code: string, message: string, fields?: Record<string, string>) {
    return new AppError(400, code, message, fields);
  }

  static unauthenticated(message = 'You need to log in first.') {
    return new AppError(401, 'UNAUTHENTICATED', message);
  }

  static forbidden(message = 'You cannot do that.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(code: string, message: string) {
    return new AppError(404, code, message);
  }

  static conflict(code: string, message: string, fields?: Record<string, string>) {
    return new AppError(409, code, message, fields);
  }
}
