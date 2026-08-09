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
  'calls',
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
  dms: 'Chat',
  calls: 'Calls',
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

export const WORKSPACE_ROLE_COLUMNS: WorkspaceRole[] = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'MEMBER',
  'GUEST',
];

export const MODULE_OPTIONS = MODULE_KEYS.map((key) => ({
  key,
  label: MODULE_LABELS[key],
}));

export const EDITABLE_ROLES: WorkspaceRole[] = [
  'ADMIN',
  'MANAGER',
  'MEMBER',
  'GUEST',
];

export const PATH_TO_NAV_KEY: Record<string, ModuleKey> = {
  '/home': 'home',
  '/teams': 'teams',
  '/dms': 'dms',
  '/calls': 'calls',
  '/activity': 'activity',
  '/announcements': 'announcements',
  '/calendar': 'calendar',
  '/files': 'files',
  '/people': 'people',
  '/apps': 'apps',
  '/settings': 'settings',
};

export function pathnameToNavKey(pathname: string): ModuleKey | null {
  const normalized = pathname.split('?')[0]?.replace(/\/$/, '') || '/';
  for (const [prefix, navKey] of Object.entries(PATH_TO_NAV_KEY)) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return navKey;
    }
  }
  return null;
}

export type StoredCapabilities = RoleCapabilities;

export type StoredUserPermissions = {
  allowedNavKeys?: string[] | null;
  capabilities?: StoredCapabilities | null;
  canPostAnnouncements?: boolean;
  isAdmin?: boolean;
  workspaceRole?: string | null;
};

export function navKeyAllowed(
  navKey: string,
  user: StoredUserPermissions | null | undefined,
): boolean {
  if (navKey === 'settings' || navKey === 'calls') {
    return true;
  }

  const keys = user?.allowedNavKeys;
  if (!keys || keys.length === 0) {
    return true;
  }
  return keys.includes(navKey);
}

export function hasCapability(
  user: StoredUserPermissions | null | undefined,
  capability: CapabilityKey,
): boolean {
  if (user?.capabilities && capability in user.capabilities) {
    return Boolean(user.capabilities[capability]);
  }
  if (user?.isAdmin) {
    return true;
  }
  return false;
}
