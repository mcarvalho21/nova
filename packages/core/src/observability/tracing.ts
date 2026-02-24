import { trace, type Span, SpanStatusCode } from '@opentelemetry/api';

const TRACER_NAME = 'nova';

export function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

export function startSpan(name: string, attributes?: Record<string, string>): Span {
  const tracer = getTracer();
  const span = tracer.startSpan(name);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
  }
  return span;
}

export function endSpan(span: Span, error?: Error): void {
  if (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

export { SpanStatusCode } from '@opentelemetry/api';
