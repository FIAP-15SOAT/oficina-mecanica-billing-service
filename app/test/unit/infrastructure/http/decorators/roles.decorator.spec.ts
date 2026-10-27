import { UserRole } from '@domain/enums/user-role.enum';
import { Roles, ROLES_KEY } from '@infrastructure/http/decorators/roles.decorator';

describe('Roles', () => {
  it('should store the required roles in the handler metadata', () => {
    class TestController {
      @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
      handler(): void {}
    }

    expect(Reflect.getMetadata(ROLES_KEY, TestController.prototype.handler)).toEqual([
      UserRole.ADMIN,
      UserRole.ATTENDANT,
    ]);
  });
});
