import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';

/**
 * Application bootstrap + health endpoint tests (P1.6).
 * Requires a reachable database (uses DATABASE_URL from the environment).
 */
describe('NestJS application foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('bootstraps the application', () => {
    expect(app).toBeDefined();
    expect(app.getHttpServer()).toBeDefined();
  });

  it('GET /api/v1/health returns ok with db up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('unknown route returns the consistent API error shape', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      statusCode: 404,
      path: '/api/v1/does-not-exist',
    });
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.requestId).toBeDefined();
  });
});
