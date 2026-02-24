import { generateId } from '@nova/core';
import type { Intent, IntentResult, IntentHandler } from './types.js';

export class IntentPipeline {
  private handlers: Map<string, IntentHandler> = new Map();

  registerHandler(handler: IntentHandler): void {
    this.handlers.set(handler.intent_type, handler);
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

    return handler.execute(intent, intentId);
  }
}
