import type { FastifyInstance } from 'fastify';
import type { ProjectionEngine, SnapshotService } from '@nova/core';

interface SnapshotRestoreBody {
  snapshot_id: string;
}

interface RebuildBody {
  batch_size?: number;
}

export function registerProjectionOpsRoutes(
  app: FastifyInstance,
  projectionEngine: ProjectionEngine,
  snapshotService: SnapshotService,
): void {
  // POST /projections/:type/rebuild — trigger projection rebuild
  app.post<{ Params: { type: string }; Body: RebuildBody }>(
    '/projections/:type/rebuild',
    async (request, reply) => {
      const result = await projectionEngine.rebuild(request.params.type, {
        batchSize: request.body?.batch_size,
      });
      return reply.send({
        projection_type: request.params.type,
        events_processed: result.eventsProcessed,
        dead_lettered: result.deadLettered,
      });
    },
  );

  // POST /projections/:type/snapshot — create snapshot
  app.post<{ Params: { type: string } }>(
    '/projections/:type/snapshot',
    async (request, reply) => {
      const snapshot = await snapshotService.createSnapshot(request.params.type);
      return reply.status(201).send({
        snapshot_id: snapshot.snapshot_id,
        projection_type: snapshot.projection_type,
        sequence_number: snapshot.sequence_number.toString(),
        is_stale: snapshot.is_stale,
      });
    },
  );

  // POST /projections/:type/snapshot/restore — restore from snapshot
  app.post<{ Params: { type: string }; Body: SnapshotRestoreBody }>(
    '/projections/:type/snapshot/restore',
    async (request, reply) => {
      if (!request.body?.snapshot_id) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'snapshot_id is required',
        });
      }

      const snapshot = await snapshotService.restoreFromSnapshot(
        request.params.type,
        request.body.snapshot_id,
      );
      return reply.send({
        snapshot_id: snapshot.snapshot_id,
        projection_type: snapshot.projection_type,
        sequence_number: snapshot.sequence_number.toString(),
        restored: true,
      });
    },
  );

  // GET /projections/:type/snapshots — list snapshots
  app.get<{ Params: { type: string } }>(
    '/projections/:type/snapshots',
    async (request, reply) => {
      const snapshots = await snapshotService.listSnapshots(request.params.type);
      return reply.send(
        snapshots.map((s) => ({
          snapshot_id: s.snapshot_id,
          projection_type: s.projection_type,
          sequence_number: s.sequence_number.toString(),
          is_stale: s.is_stale,
          created_at: s.created_at,
        })),
      );
    },
  );

  // GET /projections/:type/dead-letters — list dead-letter events
  app.get<{ Params: { type: string } }>(
    '/projections/:type/dead-letters',
    async (request, reply) => {
      const entries = await projectionEngine.getDeadLetterEvents(request.params.type);
      return reply.send(
        entries.map((e) => ({
          ...e,
          event_sequence: e.event_sequence?.toString() ?? null,
        })),
      );
    },
  );
}
