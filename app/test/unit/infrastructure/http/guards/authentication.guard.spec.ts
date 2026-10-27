import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '@infrastructure/http/decorators/public.decorator';
import { AuthenticationGuard } from '@infrastructure/http/guards/authentication.guard';
import { JwtAuthGuard } from '@infrastructure/http/guards/jwt-auth.guard';

function handler(): void {}

class Controller {}

function buildContext(): ExecutionContext {
  return { getHandler: () => handler, getClass: () => Controller } as unknown as ExecutionContext;
}

describe('AuthenticationGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let jwtAuthGuard: jest.Mocked<JwtAuthGuard>;
  let guard: AuthenticationGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    jwtAuthGuard = {
      canActivate: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<JwtAuthGuard>;
    guard = new AuthenticationGuard(reflector, jwtAuthGuard);
  });

  it('allows a route marked public without calling the JWT guard', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = buildContext();

    expect(guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    expect(jwtAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('delegates every other route to the JWT guard', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwtAuthGuard.canActivate.mockResolvedValue(false);
    const context = buildContext();

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(jwtAuthGuard.canActivate).toHaveBeenCalledWith(context);
  });
});
