export const WORKSPACE_ROLES = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'MEMBER',
  'GUEST',
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const MODULE_KEYS = [
  'home',
  'teams',
  'dms',
  'activity',
  'announcements',
  'calendar',
  'files',
  'people',
  'apps',
  'settings',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const CAPABILITY_KEYS = [
  'postAnnouncements',
  'manageUsers',
  'importUsers',
  'manageRoles',
  'manageSettings',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export type RoleCapabilities = Record<CapabilityKey, boolean>;

export type RolePermissionEntry = {
  modules: ModuleKey[];
  capabilities: RoleCapabilities;
};

export type RolePermissionsMap = Record<WorkspaceRole, RolePermissionEntry>;

export const MODULE_LABELS: Record<ModuleKey, string> = {
  home: 'Home',
  teams: 'Teams',
  dms: 'DMs',
  activity: 'Activity',
  announcements: 'Announcements',
  calendar: 'Calendar',
  files: 'Files',
  people: 'People',
  apps: 'Apps',
  settings: 'Settings',
};

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  postAnnouncements: 'Post announcements',
  manageUsers: 'Manage users',
  importUsers: 'Import users',
  manageRoles: 'Manage roles & permissions',
  manageSettings: 'Manage workspace settings',
};

export const ALLOWED_NAV_KEYS = new Set<string>(MODULE_KEYS);

export const ROLE_PERMISSIONS_SETTING_KEY = 'role_permissions';

const ALL_MODULES: ModuleKey[] = [...MODULE_KEYS];

const ALL_CAPABILITIES: RoleCapabilities = {
  postAnnouncements: true,
  manageUsers: true,
  importUsers: true,
  manageRoles: true,
  manageSettings: true,
};

const NO_CAPABILITIES: RoleCapabilities = {
  postAnnouncements: false,
  manageUsers: false,
  importUsers: false,
  manageRoles: false,
  manageSettings: false,
};

const modulesExcept = (...exclude: ModuleKey[]): ModuleKey[] =>
  ALL_MODULES.filter((key) => !exclude.includes(key));

export function buildDefaultRolePermissions(): RolePermissionsMap {
  return {
    OWNER: {
      modules: [...ALL_MODULES],
      capabilities: { ...ALL_CAPABILITIES },
    },
    ADMIN: {
      modules: [...ALL_MODULES],
      capabilities: { ...ALL_CAPABILITIES },
    },
    MANAGER: {
      modules: modulesExcept('settings'),
      capabilities: {
        ...NO_CAPABILITIES,
        postAnnouncements: true,
      },
    },
    MEMBER: {
      modules: modulesExcept('settings'),
      capabilities: { ...NO_CAPABILITIES },
    },
    GUEST: {
      modules: ['home', 'teams', 'dms', 'people'],
      capabilities: { ...NO_CAPABILITIES },
    },
  };
}

export const DEFAULT_ROLE_PERMISSIONS = buildDefaultRolePermissions();

export type EffectivePermissions = {
  allowedNavKeys: string[];
  capabilities: RoleCapabilities;
  canPostAnnouncements: boolean;
  isAdmin: boolean;
};

export function parseUserNavOverride(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value) && value.every((x) => typeof x === 'string')) {
    return value;
  }
  return null;
}

export function resolveEffectivePermissions(
  workspaceUser: {
    role: string;
    allowedNavKeys?: unknown;
    canPostAnnouncements: boolean;
  },
  rolePermissionsMap: RolePermissionsMap,
  hasCustomRolePermissions: boolean,
): EffectivePermissions {
  const role = workspaceUser.role.toUpperCase() as WorkspaceRole;
  const defaults = rolePermissionsMap[role] ?? DEFAULT_ROLE_PERMISSIONS.MEMBER;

  let capabilities: RoleCapabilities = { ...defaults.capabilities };

  if (!hasCustomRolePermissions && ['OWNER', 'ADMIN'].includes(role)) {
    capabilities = { ...ALL_CAPABILITIES };
  }

  const userNavOverride = parseUserNavOverride(workspaceUser.allowedNavKeys);
  const allowedNavKeys =
    userNavOverride !== null ? userNavOverride : [...defaults.modules];

  const canPostAnnouncements =
    workspaceUser.canPostAnnouncements || capabilities.postAnnouncements;

  const isAdmin =
    capabilities.manageUsers ||
    capabilities.manageSettings ||
    capabilities.manageRoles;

  return {
    allowedNavKeys,
    capabilities,
    canPostAnnouncements,
    isAdmin,
  };
}
