import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { VENDOR_LIST_QUERIES } from '@nova/core';

export function registerProjectionRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
): void {
  app.get('/projections/vendor_list', async (_request, reply) => {
    const { rows } = await pool.query(VENDOR_LIST_QUERIES.LIST);
    return reply.send(rows);
  });
}
