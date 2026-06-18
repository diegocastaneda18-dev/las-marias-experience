import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "./user-role.type";
import type { JwtUser } from "@bluecup/types";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { CreateUserDto } from "./dto/create-user.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserService } from "./user.service";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  @Roles("admin")
  async list(
    @Query("q") q?: string,
    @Query("role") role?: string,
    @Query("isActive") isActive?: string
  ) {
    return this.users.listUsers({ q, role, isActive });
  }

  @Post()
  @Roles("admin")
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: JwtUser) {
    return this.users.createUser({
      email: dto.email,
      displayName: dto.displayName,
      role: dto.role as Role,
      password: dto.password,
      isActive: dto.isActive,
      teamId: dto.teamId,
      actorId: actor.sub
    });
  }

  @Patch(":id")
  @Roles("admin")
  async update(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: JwtUser) {
    return this.users.updateUser({
      userId: id,
      actorId: actor.sub,
      email: dto.email,
      displayName: dto.displayName,
      role: dto.role as Role | undefined,
      isActive: dto.isActive,
      teamId: dto.teamId
    });
  }

  @Post(":id/reset-password")
  @Roles("admin")
  async resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: JwtUser
  ) {
    return this.users.resetPassword({
      userId: id,
      password: dto.password,
      actorId: actor.sub
    });
  }
}

