import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { AuthenticationError } from '@nova/core';
import type { JwtPayload } from './types.js';

export interface JwtAuthOptions {
  jwtSecret?: string;
}

async function jwtAuthPlugin(app: FastifyInstance, opts: JwtAuthOptions): Promise<void> {
  if (!opts.jwtSecret) {
    // No secret configured — auth disabled (dev mode)
    return;
  }

  app.register(fastifyJwt, {
    secret: opts.jwtSecret,
  });

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new AuthenticationError('Invalid or missing authentication token');
    }
  });
}

export default fp(jwtAuthPlugin, {
  name: 'jwt-auth',
});

// Helper to extract JwtPayload from request (returns undefined if auth not configured)
export function getJwtPayload(request: FastifyRequest): JwtPayload | undefined {
  return (request as FastifyRequest & { user?: JwtPayload }).user;
}
