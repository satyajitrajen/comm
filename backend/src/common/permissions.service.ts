import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  CAPABILITY_KEYS,
  EffectivePermissions,
  MODULE_KEYS,
  ROLE_PERMISSIONS_SETTING_KEY,
  RoleCapabilities,
  RolePermissionEntry,
  RolePermissionsMap,
  WORKSPACE_ROLES,
  buildDefaultRolePermissions,
  resolveEffectivePermissions,
} from './permissions.constants';

type WorkspaceUserLike = {
  role: string;
  allowedNavKeys?: unknown;
  canPostAnnouncements: boolean;
};

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  async loadRolePermissionsMap(workspaceId: string): Promise<{
    map: RolePermissionsMap;
    hasCustom: boolean;
  }> {
    const setting = await this.prisma.setting.findUnique({
      where: {
        tenantType_tenantId_key: {
          tenantType: 'WORKSPACE',
          tenantId: workspaceId,
          key: ROLE_PERMISSIONS_SETTING_KEY,
        },
      },
    });

    if (!setting) {
      return {
        map: buildDefaultRolePermissions(),
        hasCustom: false,
      };
    }

    try {
      return {
        map: this.normalizeRolePermissionsMap(JSON.parse(setting.value)),
        hasCustom: true,
      };
    } catch {
      return {
        map: buildDefaultRolePermissions(),
        hasCustom: false,
      };
    }
  }

  normalizeRolePermissionsMap(value: unknown): RolePermissionsMap {
    const defaults = buildDefaultRolePermissions();
    const input =
      value && typeof value === 'object'
        ? (value as Partial<Record<string, Partial<RolePermissionEntry>>>)
        : {};

    const map = {} as RolePermissionsMap;

    for (const role of WORKSPACE_ROLES) {
      const source = input[role];
      const fallback = defaults[role];

      const modulesRaw = Array.isArray(source?.modules)
        ? source.modules.map((item) => String(item).trim())
        : fallback.modules;
      const modules = modulesRaw.filter(
        (key): key is (typeof MODULE_KEYS)[number] =>
          (MODULE_KEYS as readonly string[]).includes(key),
      );

      const capabilities = { ...fallback.capabilities };
      if (source?.capabilities && typeof source.capabilities === 'object') {
        for (const key of CAPABILITY_KEYS) {
          const raw = (source.capabilities as Record<string, unknown>)[key];
          if (typeof raw === 'boolean') {
            capabilities[key] = raw;
          }
        }
      }

      if (role === 'OWNER') {
        map[role] = {
          modules: [...MODULE_KEYS],
          capabilities: {
            postAnnouncements: true,
            manageUsers: true,
            importUsers: true,
            manageRoles: true,
            manageSettings: true,
          },
        };
      } else {
        map[role] = {
          modules: modules.length > 0 ? modules : [...fallback.modules],
          capabilities,
        };
      }
    }

    return map;
  }

  async resolveForWorkspaceUser(
    workspaceId: string,
    workspaceUser: WorkspaceUserLike,
  ): Promise<EffectivePermissions> {
    const { map, hasCustom } = await this.loadRolePermissionsMap(workspaceId);
    return resolveEffectivePermissions(workspaceUser, map, hasCustom);
  }

  hasCapability(
    effective: EffectivePermissions,
    capability: keyof RoleCapabilities,
  ): boolean {
    return Boolean(effective.capabilities[capability]);
  }
}
