import { Controller, Get, UseGuards } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import request from 'supertest';

import { UserRole } from '../../src/domain/enums/user-role.enum';
import { Roles } from '../../src/infrastructure/http/decorators/roles.decorator';
import { RolesGuard } from '../../src/infrastructure/http/guards/roles.guard';
import { setupTestApp, teardownTestApp, TestContext } from '../helpers/test-app.helper';
import { signTestStaffToken } from '../helpers/staff-jwt.helper';

@Controller('probe')
class ProbeController {
  @Get()
  read(): { ok: true } {
    return { ok: true };
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  readAsAdmin(): { ok: true } {
    return { ok: true };
  }
}

const CLAIMS = { sub: 'user-uuid-123', email: 'ana@oficina.local', name: 'Ana', role: 'ADMIN' };

const customerKey = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
}).privateKey;

describe('Authentication (E2E)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestApp({ controllers: [ProbeController], withSwagger: true });
  }, 180_000);

  afterAll(async () => {
    await teardownTestApp(ctx);
  });

  it('should reject a request without token with the public error body', async () => {
    const response = await request(ctx.httpServer).get('/api/probe').expect(401);

    expect(response.body).toEqual({
      statusCode: 401,
      error: expect.any(String),
      message: 'Token de autenticação inválido ou ausente',
    });
  });

  it('should accept a valid token', async () => {
    await request(ctx.httpServer)
      .get('/api/probe')
      .set('Authorization', `Bearer ${signTestStaffToken(CLAIMS)}`)
      .expect(200, { ok: true });
  });

  it.each([
    ['HS256', () => sign({ ...CLAIMS, typ: 'access' }, 'secret', { algorithm: 'HS256' })],
    ['from another issuer', () => signTestStaffToken(CLAIMS, { issuer: 'other-issuer' })],
    ['for another audience', () => signTestStaffToken(CLAIMS, { audience: 'other-audience' })],
    ['expired', () => signTestStaffToken(CLAIMS, { expiresIn: -10 })],
    [
      'issued to a customer',
      () =>
        sign({ sub: 'customer-uuid', email: 'cliente@email.com' }, customerKey, {
          algorithm: 'RS256',
          issuer: 'oficina-customer-auth',
          audience: 'oficina-api',
          expiresIn: 600,
        }),
    ],
  ])('should reject a token %s', async (_case, token) => {
    await request(ctx.httpServer)
      .get('/api/probe')
      .set('Authorization', `Bearer ${token()}`)
      .expect(401);
  });

  it('should forbid a valid token without the required role', async () => {
    await request(ctx.httpServer)
      .get('/api/probe/admin')
      .set('Authorization', `Bearer ${signTestStaffToken({ ...CLAIMS, role: 'MECHANIC' })}`)
      .expect(403);
  });

  it('should serve health and Swagger without token', async () => {
    await request(ctx.httpServer).get('/api/health/live').expect(200);
    await request(ctx.httpServer).get('/api/docs-json').expect(200);
  });
});
