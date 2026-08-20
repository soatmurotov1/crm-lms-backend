import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { AuthedRequest } from './current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<AuthedRequest>();
    const roles = this.reflector.get<Role[]>('roles', context.getHandler());

    if (!roles?.length || !user?.role || !roles.includes(user.role)) {
      throw new ForbiddenException();
    }

    return true;
  }
}
