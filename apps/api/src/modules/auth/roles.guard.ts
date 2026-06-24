import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtUser } from "@bluecup/types";
import type { Role } from "./role.type";
import { ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("Not authenticated");
    if (!requiredRoles.includes(user.role)) throw new ForbiddenException("Insufficient role");
    return true;
  }
}

