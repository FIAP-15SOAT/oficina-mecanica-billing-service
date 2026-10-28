import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { JwtHeader, sign } from 'jsonwebtoken';

import { JwtStrategy, TokenPayload } from '@infrastructure/http/strategies/jwt.strategy';
import { UserRole } from '@domain/enums/user-role.enum';
import {
  STAFF_JWT_TEST_AUDIENCE,
  STAFF_JWT_TEST_ISSUER,
  STAFF_JWT_TEST_KEY_ID,
  STAFF_JWT_TEST_PRIVATE_KEY,
  STAFF_JWT_TEST_PUBLIC_KEY,
  signTestStaffToken,
} from '../../../../helpers/staff-jwt.helper';

const CONFIG: Record<string, string> = {
  STAFF_JWT_PUBLIC_KEY: STAFF_JWT_TEST_PUBLIC_KEY,
  STAFF_JWT_KEY_ID: STAFF_JWT_TEST_KEY_ID,
  STAFF_JWT_ISSUER: STAFF_JWT_TEST_ISSUER,
  STAFF_JWT_AUDIENCE: STAFF_JWT_TEST_AUDIENCE,
};

const CLAIMS = { sub: 'user-uuid-123', email: 'john@example.com', name: 'John', role: 'ADMIN' };

function configWith(values: Record<string, string>): ConfigService {
  return { getOrThrow: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function asVerifiedToken(
  payload: Partial<TokenPayload>,
  header: JwtHeader = { alg: 'RS256', kid: STAFF_JWT_TEST_KEY_ID },
) {
  return {
    header,
    payload: {
      ...CLAIMS,
      typ: 'access',
      exp: Math.floor(Date.now() / 1000) + 600,
      ...payload,
    } as TokenPayload,
  };
}

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = new JwtStrategy(configWith(CONFIG));
  });

  it('returns the principal from a valid access token', () => {
    expect(strategy.validate(asVerifiedToken({}))).toEqual({
      sub: CLAIMS.sub,
      email: CLAIMS.email,
      role: UserRole.ADMIN,
    });
  });

  it.each([
    [
      'whose kid differs from the configured one',
      asVerifiedToken({}, { alg: 'RS256', kid: 'other' }),
    ],
    ['without kid', asVerifiedToken({}, { alg: 'RS256' })],
    ['whose typ is refresh', asVerifiedToken({ typ: 'refresh' })],
    ['without exp', asVerifiedToken({ exp: undefined })],
    ['with a null role', asVerifiedToken({ role: null })],
    ['without role', asVerifiedToken({ role: undefined })],
    ['with a role outside the user roles', asVerifiedToken({ role: 'CUSTOMER' as UserRole })],
    ['without sub', asVerifiedToken({ sub: undefined })],
    ['without email', asVerifiedToken({ email: undefined })],
  ])('rejects a token %s', (_case, token) => {
    expect(() => strategy.validate(token)).toThrow(new UnauthorizedException('Token inválido'));
  });

  it('fails to start when STAFF_JWT_PUBLIC_KEY is not PEM', () => {
    expect(
      () => new JwtStrategy(configWith({ ...CONFIG, STAFF_JWT_PUBLIC_KEY: 'not-a-key' })),
    ).toThrow('STAFF_JWT_PUBLIC_KEY não é uma chave pública PEM válida');
  });

  describe('authenticate', () => {
    type Outcome = { success: unknown } | { fail: unknown } | { error: unknown };

    function authenticate(token: string): Promise<Outcome> {
      return new Promise((resolve) => {
        Object.assign(strategy, {
          success: (user: unknown) => resolve({ success: user }),
          fail: (info: unknown) => resolve({ fail: info }),
          error: (error: unknown) => resolve({ error }),
        });
        strategy.authenticate({ headers: { authorization: `Bearer ${token}` } } as never);
      });
    }

    it('authenticates a valid access token', async () => {
      await expect(authenticate(signTestStaffToken(CLAIMS))).resolves.toEqual({
        success: { sub: CLAIMS.sub, email: CLAIMS.email, role: UserRole.ADMIN },
      });
    });

    it('authenticates with the configured issuer and audience', async () => {
      strategy = new JwtStrategy(
        configWith({
          ...CONFIG,
          STAFF_JWT_ISSUER: 'custom-issuer',
          STAFF_JWT_AUDIENCE: 'custom-audience',
        }),
      );
      const token = signTestStaffToken(CLAIMS, {
        issuer: 'custom-issuer',
        audience: 'custom-audience',
      });

      await expect(authenticate(token)).resolves.toHaveProperty('success');
      await expect(authenticate(signTestStaffToken(CLAIMS))).resolves.toHaveProperty('fail');
    });

    const otherKey = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    }).privateKey;

    it.each([
      ['HS256', () => sign({ ...CLAIMS, typ: 'access' }, 'secret', { algorithm: 'HS256' })],
      [
        'unsigned (alg none)',
        () => sign({ ...CLAIMS, typ: 'access' }, null as never, { algorithm: 'none' }),
      ],
      ['signed by another RS256 key', () => signTestStaffToken(CLAIMS, {}, otherKey)],
      [
        'with another issuer',
        () => signTestStaffToken(CLAIMS, { issuer: 'oficina-customer-auth' }),
      ],
      ['with another audience', () => signTestStaffToken(CLAIMS, { audience: 'oficina-api' })],
      ['expired', () => signTestStaffToken(CLAIMS, { expiresIn: -10 })],
    ])('fails a token %s', async (_case, token) => {
      await expect(authenticate(token())).resolves.toHaveProperty('fail');
    });

    it('errors with 401 a token without exp', async () => {
      const token = sign({ ...CLAIMS, typ: 'access' }, STAFF_JWT_TEST_PRIVATE_KEY, {
        algorithm: 'RS256',
        keyid: STAFF_JWT_TEST_KEY_ID,
        issuer: STAFF_JWT_TEST_ISSUER,
        audience: STAFF_JWT_TEST_AUDIENCE,
      });

      await expect(authenticate(token)).resolves.toEqual({
        error: new UnauthorizedException('Token inválido'),
      });
    });
  });
});
