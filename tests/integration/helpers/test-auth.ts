import jwt from 'jsonwebtoken';

export const TEST_JWT_SECRET = 'test-secret-key-for-integration-tests';

export interface TestTokenOptions {
  sub?: string;
  name?: string;
  actor_type?: 'human' | 'agent' | 'system' | 'external' | 'import';
  legal_entity?: string;
  capabilities?: string[];
  expiresIn?: string;
}

export function createTestToken(options: TestTokenOptions = {}): string {
  const payload = {
    sub: options.sub ?? 'test-user-1',
    name: options.name ?? 'Test User',
    actor_type: options.actor_type ?? 'human',
    legal_entity: options.legal_entity ?? 'default',
    capabilities: options.capabilities ?? [
      'mdm.vendor.create',
      'mdm.vendor.update',
      'mdm.item.create',
      'mdm.vendor.add_contact',
    ],
  };

  return jwt.sign(payload, TEST_JWT_SECRET, {
    expiresIn: options.expiresIn ?? '1h',
  });
}

export function createExpiredToken(): string {
  const payload = {
    sub: 'test-user-1',
    name: 'Test User',
    actor_type: 'human',
    legal_entity: 'default',
    capabilities: ['mdm.vendor.create'],
  };

  return jwt.sign(payload, TEST_JWT_SECRET, {
    expiresIn: '0s',
  });
}
