import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';

/**
 * Loads the fine-grained permission keys a staff member's role grants
 * (P1.7.1F), from the existing `Role` / `RolePermission` tables. Only
 * `allowed = true` keys are returned. A staff member with no role, or a role
 * with no granted permissions, yields an empty set (deny-by-default).
 *
 * Read per request (like the P1.7.1E status re-check) so permission/role
 * changes take effect without waiting for token expiry.
 */
@Injectable()
export class StaffPermissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissionKeys(staffMemberId: string): Promise<Set<string>> {
    try {
      const row = await this.prisma.staffMember.findUnique({
        where: { id: staffMemberId },
        select: {
          role: {
            select: {
              permissions: {
                where: { allowed: true },
                select: { permissionKey: true },
              },
            },
          },
        },
      });
      return new Set((row?.role?.permissions ?? []).map((p) => p.permissionKey));
    } catch {
      // Malformed id (e.g. forged token subject) -> no permissions.
      return new Set<string>();
    }
  }
}
