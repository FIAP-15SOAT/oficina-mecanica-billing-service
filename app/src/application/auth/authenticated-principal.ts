import { UserRole } from '@domain/enums/user-role.enum';

export interface AuthenticatedPrincipal {
  sub: string;
  email: string;
  role: UserRole;
}
