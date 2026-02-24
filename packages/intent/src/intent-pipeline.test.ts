import { describe, it, expect, vi } from 'vitest';
import { IntentPipeline } from './intent-pipeline.js';
import type { IntentHandler, Intent, IntentResult } from './types.js';

describe('IntentPipeline', () => {
  it('should route intent to registered handler', async () => {
    const pipeline = new IntentPipeline();

    const mockResult: IntentResult = {
      success: true,
      intent_id: 'test-intent-id',
      event_id: 'test-event-id',
    };

    const handler: IntentHandler = {
      intent_type: 'test.create',
      execute: vi.fn().mockResolvedValue(mockResult),
    };

    pipeline.registerHandler(handler);

    const intent: Intent = {
      intent_type: 'test.create',
      actor: { type: 'human', id: 'u1', name: 'User' },
      data: { name: 'Test' },
    };

    const result = await pipeline.execute(intent);

    expect(result.success).toBe(true);
    expect(handler.execute).toHaveBeenCalledWith(intent, expect.any(String));
  });

  it('should return error for unregistered intent type', async () => {
    const pipeline = new IntentPipeline();

    const intent: Intent = {
      intent_type: 'unknown.type',
      actor: { type: 'human', id: 'u1', name: 'User' },
      data: {},
    };

    const result = await pipeline.execute(intent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No handler registered');
    expect(result.error).toContain('unknown.type');
  });

  it('should generate unique intent_id per execution', async () => {
    const pipeline = new IntentPipeline();

    const capturedIds: string[] = [];
    const handler: IntentHandler = {
      intent_type: 'test.create',
      execute: vi.fn().mockImplementation((_intent, intentId) => {
        capturedIds.push(intentId);
        return { success: true, intent_id: intentId };
      }),
    };

    pipeline.registerHandler(handler);

    const intent: Intent = {
      intent_type: 'test.create',
      actor: { type: 'human', id: 'u1', name: 'User' },
      data: {},
    };

    await pipeline.execute(intent);
    await pipeline.execute(intent);

    expect(capturedIds).toHaveLength(2);
    expect(capturedIds[0]).not.toBe(capturedIds[1]);
  });
});
