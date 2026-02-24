// Shared
export { generateId, ok, err } from './shared/types.js';
export type { Result } from './shared/types.js';
export {
  EventStoreError,
  ValidationError,
  ConcurrencyConflictError,
  IdempotencyConflictError,
  EntityNotFoundError,
} from './shared/errors.js';
export { createPool, runMigrations } from './shared/database.js';
export type { DatabaseConfig } from './shared/database.js';

// Event Store
export { EventStoreService } from './event-store/index.js';
export type {
  BaseEvent,
  AppendEventInput,
  EventPage,
  ReadStreamParams,
  EventScope,
  EventActor,
  EntityReference,
  RuleEvaluationSummary,
  EventSource,
} from './event-store/index.js';

// Entity Graph
export { EntityGraphService } from './entity-graph/index.js';
export type { Entity, EntityRelationship } from './entity-graph/index.js';

// Rules Engine
export { evaluate, evaluateCondition, VENDOR_CREATE_RULES } from './rules-engine/index.js';
export type {
  Rule,
  Condition,
  ConditionOperator,
  RuleContext,
  EvaluationResult,
  EvaluationTrace,
} from './rules-engine/index.js';

// Projection Engine
export { ProjectionEngine } from './projection-engine/index.js';
export type { ProjectionHandler, ProjectionSubscription } from './projection-engine/index.js';

// Projections
export { vendorListHandler } from './projections/vendor-list/vendor-list.handler.js';
export { VENDOR_LIST_QUERIES } from './projections/vendor-list/vendor-list.queries.js';
