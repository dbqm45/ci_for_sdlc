import type { FastifyInstance } from 'fastify';

/** PUT /api/settings with the current ETag, as the web client does. */
export async function putSettings(app: FastifyInstance, payload: unknown) {
  const etag = (await app.inject({ method: 'GET', url: '/api/settings' })).headers.etag as string;
  return app.inject({ method: 'PUT', url: '/api/settings', headers: { 'if-match': etag }, payload: payload as object });
}
