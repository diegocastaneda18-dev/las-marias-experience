import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { JwtUser } from "@bluecup/types";
import type { Role } from "./role.type";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException("Invalid credentials");
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException("Invalid credentials");
    return user;
  }

  private async getTeamIdForUser(userId: string): Promise<string | null> {
    const membership = await this.prisma.teamMember.findFirst({ where: { userId } });
    return membership?.teamId ?? null;
  }

  async login(params: { email: string; password: string; ctx?: { ip?: string; userAgent?: string } }) {
    const user = await this.validateUser(params.email, params.password);
    const teamId = await this.getTeamIdForUser(user.id);
    const payload: JwtUser = {
      sub: user.id,
      email: user.email,
      role: user.role as unknown as Role,
      teamId
    };
    const accessToken = await this.jwt.signAsync(payload);

    await this.audit.log({
      ctx: { actorId: user.id, ip: params.ctx?.ip, userAgent: params.ctx?.userAgent },
      action: "auth.login",
      entity: "User",
      entityId: user.id,
      meta: { email: user.email, role: user.role }
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        teamId
      }
    };
  }

  getJwtSecret() {
    return this.config.get<string>("JWT_ACCESS_SECRET") ?? "dev_access_secret";
  }
}

