import { generateId } from '@nova/core';
import { checkCapabilities } from './capabilities.js';
import type { IntentStoreService } from './intent-store.service.js';
import type { Intent, IntentResult, IntentHandler } from './types.js';

export class IntentPipeline {
  private handlers: Map<string, IntentHandler> = new Map();
  private intentStore?: IntentStoreService;

  registerHandler(handler: IntentHandler): void {
    this.handlers.set(handler.intent_type, handler);
  }

  setIntentStore(store: IntentStoreService): void {
    this.intentStore = store;
  }

  getHandler(intentType: string): IntentHandler | undefined {
    return this.handlers.get(intentType);
  }

  async execute(intent: Intent): Promise<IntentResult> {
    const intentId = generateId();

    const handler = this.handlers.get(intent.intent_type);
    if (!handler) {
      return {
        success: false,
        intent_id: intentId,
        error: `No handler registered for intent type: ${intent.intent_type}`,
      };
    }

    // Check capabilities before executing handler
    checkCapabilities(intent.intent_type, intent.capabilities);

    const result = await handler.execute(intent, intentId);

    // If handler signals pending_approval, persist the intent
    if (!result.success && result.status === 'pending_approval' && this.intentStore) {
      await this.intentStore.create(
        intentId,
        intent,
        'pending_approval',
        result.required_approver_role,
      );
    }

    return result;
  }
}
