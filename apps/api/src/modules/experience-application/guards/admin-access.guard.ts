import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import type { Request } from "express";
import { getAdminAuthMode } from "../config/experience.config";
import { getSupabaseAdminClient } from "../lib/supabase-admin.client";

/** Dev: x-admin-password. Production: Supabase Auth Bearer JWT. */
@Injectable()
export class AdminAccessGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const mode = getAdminAuthMode();

    if (mode === "supabase") {
      return this.validateSupabaseSession(req);
    }

    return this.validateDevPassword(req);
  }

  private validateDevPassword(req: Request): boolean {
    const header = req.headers["x-admin-password"];
    const password = Array.isArray(header) ? header[0]?.trim() : header?.trim();
    const expected = getAdminAccessPassword();

    if (!password || password !== expected) {
      throw new UnauthorizedException("Acceso admin no autorizado.");
    }

    return true;
  }

  private async validateSupabaseSession(req: Request): Promise<boolean> {
    const authHeader = req.headers.authorization;
    const token =
      authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

    console.log("[AdminAccessGuard] auth check", {
      hasAuthorizationHeader: Boolean(authHeader),
      hasBearerToken: Boolean(token),
      tokenLength: token.length,
      adminAllowedEmails: process.env.ADMIN_ALLOWED_EMAILS || null,
      supabaseUrl: process.env.SUPABASE_URL || null
    });

    if (!token) {
      throw new UnauthorizedException("Sesión admin requerida.");
    }

    try {
      const { data, error } = await getSupabaseAdminClient().auth.getUser(token);

      if (error || !data.user) {
        console.error("[AdminAccessGuard] Supabase getUser failed", {
          errorMessage: error?.message || null,
          errorStatus: error?.status || null,
          hasUser: Boolean(data.user)
        });

        throw new UnauthorizedException("Sesión admin no válida.");
      }

      const email = data.user.email?.trim().toLowerCase() || "";
      const allowedEmails = getAllowedAdminEmails();

      console.log("[AdminAccessGuard] Supabase user resolved", {
        email,
        allowedEmails,
        isAllowed: allowedEmails.includes(email)
      });

      if (!allowedEmails.includes(email)) {
        throw new ForbiddenException("Tu correo no está autorizado como administrador.");
      }

      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException || err instanceof ForbiddenException) {
        throw err;
      }

      console.error("[AdminAccessGuard] Unexpected validation error", {
        message: err instanceof Error ? err.message : String(err)
      });

      throw new UnauthorizedException("No se pudo validar la sesión admin.");
    }
  }
}

export function getAdminAccessPassword(): string {
  return process.env.ADMIN_ACCESS_PASSWORD?.trim() || "admin123";
}

export function getAllowedAdminEmails(): string[] {
  return (process.env.ADMIN_ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}