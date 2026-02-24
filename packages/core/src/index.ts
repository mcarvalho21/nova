// Shared
export { generateId, ok, err } from './shared/types.js';
export type { Result } from './shared/types.js';
export {
  EventStoreError,
  ValidationError,
  ConcurrencyConflictError,
  IdempotencyConflictError,
  EntityNotFoundError,
  AuthenticationError,
  AuthorizationError,
} from './shared/errors.js';
export { createPool, runMigrations } from './shared/database.js';
export type { DatabaseConfig } from './shared/database.js';

// Event Store
export { EventStoreService } from './event-store/index.js';
export { EventTypeRegistryService } from './event-store/index.js';
export type { RegisteredEventType } from './event-store/index.js';
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
export {
  evaluate,
  evaluatePhased,
  filterActiveRules,
  evaluateCondition,
  loadRulesFromFile,
  loadRulesFromDirectory,
  VENDOR_CREATE_RULES,
  ITEM_CREATE_RULES,
  VENDOR_CONTACT_RULES,
} from './rules-engine/index.js';
export type {
  Rule,
  Condition,
  ConditionOperator,
  RulePhase,
  RuleAction,
  RuleContext,
  EvaluationResult,
  EvaluationTrace,
} from './rules-engine/index.js';

// Projection Engine
export { ProjectionEngine } from './projection-engine/index.js';
export { SnapshotService, registerProjectionTable } from './projection-engine/index.js';
export { SubscriptionService } from './projection-engine/index.js';
export type { ProjectionHandler, ProjectionSubscription } from './projection-engine/index.js';
export type { ProjectionSnapshot, ProjectionTableConfig } from './projection-engine/index.js';
export type { Subscription } from './projection-engine/index.js';
export type { DeadLetterEntry, RebuildOptions } from './projection-engine/index.js';

// Observability
export { getTracer, startSpan, endSpan, SpanStatusCode } from './observability/index.js';

// Projections
export { vendorListHandler } from './projections/vendor-list/vendor-list.handler.js';
export { VENDOR_LIST_QUERIES } from './projections/vendor-list/vendor-list.queries.js';
export { itemListHandler } from './projections/item-list/item-list.handler.js';
export { ITEM_LIST_QUERIES } from './projections/item-list/item-list.queries.js';
