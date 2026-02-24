export class EventStoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'EventStoreError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConcurrencyConflictError extends Error {
  constructor(
    public readonly entityId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      `Concurrency conflict on entity ${entityId}: expected version ${expectedVersion}, actual ${actualVersion}`,
    );
    this.name = 'ConcurrencyConflictError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor(
    public readonly idempotencyKey: string,
    public readonly existingEventId: string,
  ) {
    super(`Idempotency key "${idempotencyKey}" already exists with event ${existingEventId}`);
    this.name = 'IdempotencyConflictError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly requiredCapabilities?: string[],
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class EntityNotFoundError extends Error {
  constructor(
    public readonly entityType: string,
    public readonly entityId: string,
  ) {
    super(`Entity not found: ${entityType}/${entityId}`);
    this.name = 'EntityNotFoundError';
  }
}
