import pg from 'pg';
import { AuthorizationError, EntityNotFoundError } from '@nova/core';
import { INTENT_STORE_QUERIES } from './intent-store.queries.js';
import type { Intent } from './types.js';

export interface StoredIntent {
  id: string;
  type: string;
  status: string;
  actor_id: string;
  actor_name: string;
  actor_type: string;
  legal_entity: string;
  data: Record<string, unknown>;
  required_approver_role: string | null;
  approved_by_id: string | null;
  approved_by_name: string | null;
  approval_reason: string | null;
  rejected_by_id: string | null;
  rejected_by_name: string | null;
  rejection_reason: string | null;
  result_event_id: string | null;
  result_error: string | null;
  correlation_id: string | null;
  idempotency_key: string | null;
  effective_date: string | null;
  occurred_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function rowToStoredIntent(row: Record<string, unknown>): StoredIntent {
  return {
    id: row.id as string,
    type: row.type as string,
    status: row.status as string,
    actor_id: row.actor_id as string,
    actor_name: row.actor_name as string,
    actor_type: row.actor_type as string,
    legal_entity: row.legal_entity as string,
    data: row.data as Record<string, unknown>,
    required_approver_role: (row.required_approver_role as string) ?? null,
    approved_by_id: (row.approved_by_id as string) ?? null,
    approved_by_name: (row.approved_by_name as string) ?? null,
    approval_reason: (row.approval_reason as string) ?? null,
    rejected_by_id: (row.rejected_by_id as string) ?? null,
    rejected_by_name: (row.rejected_by_name as string) ?? null,
    rejection_reason: (row.rejection_reason as string) ?? null,
    result_event_id: (row.result_event_id as string) ?? null,
    result_error: (row.result_error as string) ?? null,
    correlation_id: (row.correlation_id as string) ?? null,
    idempotency_key: (row.idempotency_key as string) ?? null,
    effective_date: (row.effective_date as string) ?? null,
    occurred_at: (row.occurred_at as Date) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export class IntentStoreService {
  constructor(private readonly pool: pg.Pool) {}

  async create(
    intentId: string,
    intent: Intent,
    status: string,
    requiredApproverRole?: string,
  ): Promise<StoredIntent> {
    const { rows } = await this.pool.query(INTENT_STORE_QUERIES.INSERT, [
      intentId,
      intent.intent_type,
      status,
      intent.actor.id,
      intent.actor.name,
      intent.actor.type,
      intent.legal_entity ?? 'default',
      JSON.stringify(intent.data),
      requiredApproverRole ?? null,
      intent.correlation_id ?? null,
      intent.idempotency_key ?? null,
      intent.effective_date ?? null,
      intent.occurred_at ?? null,
    ]);
    return rowToStoredIntent(rows[0]);
  }

  async getById(intentId: string): Promise<StoredIntent | null> {
    const { rows } = await this.pool.query(INTENT_STORE_QUERIES.GET_BY_ID, [intentId]);
    return rows.length > 0 ? rowToStoredIntent(rows[0]) : null;
  }

  async approve(
    intentId: string,
    approverId: string,
    approverName: string,
    reason?: string,
  ): Promise<StoredIntent> {
    const existing = await this.getById(intentId);
    if (!existing) {
      throw new EntityNotFoundError('intent', intentId);
    }

    if (existing.status !== 'pending_approval') {
      throw new AuthorizationError(
        `Intent ${intentId} is not pending approval (current status: ${existing.status})`,
      );
    }

    // Separation of Duties: approver cannot be the same as the actor
    if (existing.actor_id === approverId) {
      throw new AuthorizationError(
        'Separation of duties violation: approver cannot be the same as the intent actor',
      );
    }

    const { rows } = await this.pool.query(INTENT_STORE_QUERIES.APPROVE, [
      intentId,
      approverId,
      approverName,
      reason ?? null,
    ]);

    if (rows.length === 0) {
      throw new AuthorizationError(
        `Failed to approve intent ${intentId} — may have been already processed`,
      );
    }

    return rowToStoredIntent(rows[0]);
  }

  async reject(
    intentId: string,
    rejectorId: string,
    rejectorName: string,
    reason?: string,
  ): Promise<StoredIntent> {
    const existing = await this.getById(intentId);
    if (!existing) {
      throw new EntityNotFoundError('intent', intentId);
    }

    if (existing.status !== 'pending_approval') {
      throw new AuthorizationError(
        `Intent ${intentId} is not pending approval (current status: ${existing.status})`,
      );
    }

    const { rows } = await this.pool.query(INTENT_STORE_QUERIES.REJECT, [
      intentId,
      rejectorId,
      rejectorName,
      reason ?? null,
    ]);

    if (rows.length === 0) {
      throw new AuthorizationError(
        `Failed to reject intent ${intentId} — may have been already processed`,
      );
    }

    return rowToStoredIntent(rows[0]);
  }

  async markExecuted(intentId: string, eventId: string): Promise<StoredIntent> {
    const { rows } = await this.pool.query(INTENT_STORE_QUERIES.MARK_EXECUTED, [
      intentId,
      eventId,
    ]);
    return rowToStoredIntent(rows[0]);
  }

  async markFailed(intentId: string, error: string): Promise<StoredIntent> {
    const { rows } = await this.pool.query(INTENT_STORE_QUERIES.MARK_FAILED, [
      intentId,
      error,
    ]);
    return rowToStoredIntent(rows[0]);
  }

  /**
   * Reconstitute a stored intent back into an Intent object for deferred execution.
   */
  toIntent(stored: StoredIntent): Intent {
    return {
      intent_type: stored.type,
      actor: {
        type: stored.actor_type as Intent['actor']['type'],
        id: stored.actor_id,
        name: stored.actor_name,
      },
      data: stored.data,
      correlation_id: stored.correlation_id ?? undefined,
      idempotency_key: stored.idempotency_key ?? undefined,
      effective_date: stored.effective_date ?? undefined,
      occurred_at: stored.occurred_at ?? undefined,
      legal_entity: stored.legal_entity,
    };
  }
}
