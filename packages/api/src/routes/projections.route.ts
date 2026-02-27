import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import {
  VENDOR_LIST_QUERIES,
  ITEM_LIST_QUERIES,
  AP_INVOICE_LIST_QUERIES,
  AP_AGING_QUERIES,
  AP_VENDOR_BALANCE_QUERIES,
  GL_POSTINGS_QUERIES,
} from '@nova/core';
import { getJwtPayload } from '../auth/index.js';

export function registerProjectionRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
): void {
  app.get('/projections/vendor_list', async (request, reply) => {
    const jwtPayload = getJwtPayload(request);
    const legalEntity = jwtPayload?.legal_entity;

    if (legalEntity) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL app.current_legal_entity = '${legalEntity}'`);
        const { rows } = await client.query(VENDOR_LIST_QUERIES.LIST);
        await client.query('COMMIT');
        return reply.send(rows);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const { rows } = await pool.query(VENDOR_LIST_QUERIES.LIST);
    return reply.send(rows);
  });

  app.get('/projections/item_list', async (request, reply) => {
    const jwtPayload = getJwtPayload(request);
    const legalEntity = jwtPayload?.legal_entity;

    if (legalEntity) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL app.current_legal_entity = '${legalEntity}'`);
        const { rows } = await client.query(ITEM_LIST_QUERIES.LIST);
        await client.query('COMMIT');
        return reply.send(rows);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const { rows } = await pool.query(ITEM_LIST_QUERIES.LIST);
    return reply.send(rows);
  });

  // AP Invoice List
  app.get('/projections/ap_invoice_list', async (request, reply) => {
    const jwtPayload = getJwtPayload(request);
    const legalEntity = jwtPayload?.legal_entity;

    if (legalEntity) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL app.current_legal_entity = '${legalEntity}'`);
        const { rows } = await client.query(AP_INVOICE_LIST_QUERIES.LIST);
        await client.query('COMMIT');
        return reply.send(rows);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const { rows } = await pool.query(AP_INVOICE_LIST_QUERIES.LIST);
    return reply.send(rows);
  });

  // AP Aging
  app.get('/projections/ap_aging', async (_request, reply) => {
    const { rows } = await pool.query(AP_AGING_QUERIES.LIST);
    return reply.send(rows);
  });

  // AP Vendor Balances
  app.get('/projections/ap_vendor_balance', async (_request, reply) => {
    const { rows } = await pool.query(AP_VENDOR_BALANCE_QUERIES.LIST);
    return reply.send(rows);
  });

  // GL Postings
  app.get('/projections/gl_postings', async (_request, reply) => {
    const { rows } = await pool.query(GL_POSTINGS_QUERIES.LIST);
    return reply.send(rows);
  });
}
