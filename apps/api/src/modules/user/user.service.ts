import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Role } from "./user-role.type";
import * as argon2 from "argon2";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const ASSIGNABLE_ROLES: Role[] = [Role.admin, Role.committee, Role.captain, Role.team_member];

function roleRequiresTeam(role: Role): boolean {
  return role === Role.captain || role === Role.team_member;
}

type UserWithTeams = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  teamMemberships: {
    team: { id: string; name: string; tournamentId: string };
  }[];
};

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  private serializeUser(user: UserWithTeams) {
    const membership = user.teamMemberships[0];
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      team: membership
        ? {
            id: membership.team.id,
            name: membership.team.name,
            tournamentId: membership.team.tournamentId
          }
        : null
    };
  }

  private userInclude() {
    return {
      teamMemberships: {
        include: { team: { select: { id: true, name: true, tournamentId: true } } },
        orderBy: { createdAt: "asc" as const }
      }
    };
  }

  private assertAssignableRole(role: Role) {
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new BadRequestException(`Role must be one of: ${ASSIGNABLE_ROLES.join(", ")}`);
    }
  }

  private assertSelfSafety(params: {
    actorId: string;
    targetId: string;
    nextRole?: Role;
    nextIsActive?: boolean;
  }) {
    if (params.actorId !== params.targetId) return;
    if (params.nextRole != null && params.nextRole !== Role.admin) {
      throw new BadRequestException("You cannot remove your own admin role.");
    }
    if (params.nextIsActive === false) {
      throw new BadRequestException("You cannot deactivate your own account.");
    }
  }

  async listUsers(filters: { q?: string; role?: string; isActive?: string }) {
    const where: {
      OR?: { email?: { contains: string; mode: "insensitive" }; displayName?: { contains: string; mode: "insensitive" } }[];
      role?: Role;
      isActive?: boolean;
    } = {};

    const q = filters.q?.trim();
    if (q) {
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } }
      ];
    }

    const role = filters.role?.trim();
    if (role) {
      this.assertAssignableRole(role as Role);
      where.role = role as Role;
    }

    if (filters.isActive === "true") where.isActive = true;
    if (filters.isActive === "false") where.isActive = false;

    const users = await this.prisma.user.findMany({
      where,
      include: this.userInclude(),
      orderBy: { createdAt: "desc" },
      take: 200
    });

    return users.map((u) => this.serializeUser(u));
  }

  async createUser(params: {
    email: string;
    displayName: string;
    role: Role;
    password: string;
    isActive?: boolean;
    teamId?: string;
    actorId: string;
  }) {
    this.assertAssignableRole(params.role);
    const email = params.email.toLowerCase().trim();
    const displayName = params.displayName.trim();
    if (displayName.length < 2) throw new BadRequestException("displayName must be at least 2 characters.");

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("A user with this email already exists.");

    const passwordHash = await argon2.hash(params.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          displayName,
          role: params.role,
          passwordHash,
          isActive: params.isActive ?? true
        }
      });

      if (roleRequiresTeam(params.role)) {
        const teamId = params.teamId?.trim();
        if (!teamId) throw new BadRequestException("teamId is required for captain and team_member roles.");
        const team = await tx.team.findUnique({ where: { id: teamId } });
        if (!team) throw new NotFoundException("Team not found.");
        await tx.teamMember.create({
          data: {
            userId: created.id,
            teamId,
            roleLabel: params.role === Role.captain ? "Captain" : "Member"
          }
        });
        if (params.role === Role.captain) {
          await tx.team.update({ where: { id: teamId }, data: { captainUserId: created.id } });
        }
      }

      return tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: this.userInclude()
      });
    });

    await this.audit.log({
      ctx: { actorId: params.actorId },
      action: "user.create",
      entity: "User",
      entityId: user.id,
      meta: { email: user.email, role: user.role, isActive: user.isActive }
    });

    return this.serializeUser(user);
  }

  async updateUser(params: {
    userId: string;
    actorId: string;
    email?: string;
    displayName?: string;
    role?: Role;
    isActive?: boolean;
    teamId?: string | null;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { id: params.userId },
      include: this.userInclude()
    });
    if (!existing) throw new NotFoundException("User not found.");

    const nextRole = params.role ?? existing.role;
    this.assertAssignableRole(nextRole);
    this.assertSelfSafety({
      actorId: params.actorId,
      targetId: params.userId,
      nextRole: params.role,
      nextIsActive: params.isActive
    });

    const email = params.email != null ? params.email.toLowerCase().trim() : undefined;
    if (email && email !== existing.email) {
      const clash = await this.prisma.user.findUnique({ where: { email } });
      if (clash && clash.id !== params.userId) {
        throw new ConflictException("A user with this email already exists.");
      }
    }

    const displayName = params.displayName?.trim();
    if (displayName != null && displayName.length < 2) {
      throw new BadRequestException("displayName must be at least 2 characters.");
    }

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: params.userId },
        data: {
          ...(email != null ? { email } : {}),
          ...(displayName != null ? { displayName } : {}),
          ...(params.role != null ? { role: params.role } : {}),
          ...(params.isActive != null ? { isActive: params.isActive } : {})
        }
      });

      const shouldSyncTeam =
        params.role != null ||
        params.teamId !== undefined ||
        (params.role == null && roleRequiresTeam(nextRole));

      if (shouldSyncTeam) {
        const teamId =
          params.teamId !== undefined
            ? params.teamId
            : existing.teamMemberships[0]?.team.id ?? null;

        await tx.teamMember.deleteMany({ where: { userId: params.userId } });
        await tx.team.updateMany({
          where: { captainUserId: params.userId },
          data: { captainUserId: null }
        });

        if (roleRequiresTeam(nextRole)) {
          const resolvedTeamId = teamId?.trim();
          if (!resolvedTeamId) {
            throw new BadRequestException("teamId is required for captain and team_member roles.");
          }
          const team = await tx.team.findUnique({ where: { id: resolvedTeamId } });
          if (!team) throw new NotFoundException("Team not found.");
          await tx.teamMember.create({
            data: {
              userId: params.userId,
              teamId: resolvedTeamId,
              roleLabel: nextRole === Role.captain ? "Captain" : "Member"
            }
          });
          if (nextRole === Role.captain) {
            await tx.team.update({
              where: { id: resolvedTeamId },
              data: { captainUserId: params.userId }
            });
          }
        }
      }

      return tx.user.findUniqueOrThrow({
        where: { id: params.userId },
        include: this.userInclude()
      });
    });

    await this.audit.log({
      ctx: { actorId: params.actorId },
      action: "user.update",
      entity: "User",
      entityId: user.id,
      meta: {
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        teamId: user.teamMemberships[0]?.team.id ?? null
      }
    });

    return this.serializeUser(user);
  }

  async resetPassword(params: { userId: string; password: string; actorId: string }) {
    const existing = await this.prisma.user.findUnique({ where: { id: params.userId } });
    if (!existing) throw new NotFoundException("User not found.");

    const passwordHash = await argon2.hash(params.password);
    await this.prisma.user.update({
      where: { id: params.userId },
      data: { passwordHash }
    });

    await this.audit.log({
      ctx: { actorId: params.actorId },
      action: "user.resetPassword",
      entity: "User",
      entityId: params.userId,
      meta: { email: existing.email }
    });

    return { ok: true };
  }
}

