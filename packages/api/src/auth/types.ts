export interface JwtPayload {
  sub: string;
  name: string;
  actor_type: 'human' | 'agent' | 'system' | 'external' | 'import';
  legal_entity: string;
  capabilities: string[];
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply): Promise<void>;
  }
}
