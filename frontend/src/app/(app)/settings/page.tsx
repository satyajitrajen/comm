'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  KeyRound,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
  XCircle,
} from 'lucide-react';
import { adminAPI } from '../../../services/api';
import Portal from '../../components/Portal';
import PasswordInput from '../../components/PasswordInput';
import {
  CAPABILITY_KEYS,
  CAPABILITY_LABELS,
  MODULE_OPTIONS,
  WORKSPACE_ROLE_COLUMNS,
  hasCapability,
  type CapabilityKey,
  type ModuleKey,
  type RolePermissionsMap,
  type WorkspaceRole,
} from '../../../lib/permissions';
import { AVAILABILITY_PICKER_OPTIONS } from '../../../lib/statusAvailability';
import { roleLabel } from '../../../lib/enumLabels';
import { isValidName, sanitizeName } from '../../../lib/nameValidation';

type AdminUser = {
  userId: string;
  email?: string | null;
  phoneNumber?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  aboutText?: string | null;
  presence?: string | null;
  availability?: string | null;
  lastSeen?: string | null;
  lastLoginAt?: string | null;
  role: string;
  department?: string | null;
  isActive: boolean;
  joinedAt?: string;
  createdAt?: string;
};

type UserForm = {
  userId?: string;
  displayName: string;
  email: string;
  phoneNumber: string;
  password: string;
  role: string;
  department: string;
  statusAvailability: string;
  aboutText: string;
  isActive: boolean;
};

type ApprovalSettings = {
  enabled: boolean;
  requiredApprovals: number;
  approverRole: string;
  appliesTo: string[];
  autoApproveAdmins: boolean;
  escalationHours: number;
};

const ROLE_OPTIONS = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'GUEST'];
const APPROVER_ROLE_OPTIONS = ['OWNER', 'ADMIN', 'MANAGER'];
const APPROVAL_SCOPE_OPTIONS = [
  { value: 'USER_CREATION', label: 'User creation' },
  { value: 'USER_EDITS', label: 'User edits' },
  { value: 'CHANNEL_CREATION', label: 'Channel creation' },
  { value: 'FILE_DOWNLOADS', label: 'File downloads' },
];

const emptyUserForm: UserForm = {
  displayName: '',
  email: '',
  phoneNumber: '',
  password: '',
  role: 'MEMBER',
  department: '',
  // Offline until they actually connect — presence is connection-derived.
  statusAvailability: '',
  aboutText: '',
  isActive: true,
};

function errorStatus(error: unknown) {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    return response?.status;
  }
  return undefined;
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: { message?: string | string[] } } }).response?.data;
    const message = data?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && message[0]) return String(message[0]);
  }
  return fallback;
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatLastSeen(value?: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'approval' | 'roles'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [approvalDraft, setApprovalDraft] = useState<ApprovalSettings | null>(null);
  const [roleDraft, setRoleDraft] = useState<RolePermissionsMap | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [formError, setFormError] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [savingApproval, setSavingApproval] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    skipped: number;
    errors: Array<{ line: number; message: string }>;
  } | null>(null);

  function readSessionUser() {
    try {
      const stored = localStorage.getItem('veloce_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  const sessionUser = readSessionUser();
  const canManageUsers = hasCapability(sessionUser, 'manageUsers');
  const canImportUsers = hasCapability(sessionUser, 'importUsers');
  const canManageSettings = hasCapability(sessionUser, 'manageSettings');
  const canManageRoles = hasCapability(sessionUser, 'manageRoles');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    const session = readSessionUser();
    const loadUsers = hasCapability(session, 'manageUsers');
    const loadApproval = hasCapability(session, 'manageSettings');
    const loadRoles =
      hasCapability(session, 'manageRoles') || hasCapability(session, 'manageSettings');

    try {
      const requests: Promise<void>[] = [];

      if (loadUsers) {
        requests.push(
          adminAPI.getUsers().then((usersData) => {
            if (!Array.isArray(usersData)) {
              throw new Error('Invalid users response');
            }
            setUsers(usersData);
          }),
        );
      } else {
        setUsers([]);
      }

      if (loadApproval) {
        requests.push(
          adminAPI.getApprovalCycle().then((approvalData) => {
            setApprovalDraft(approvalData as ApprovalSettings);
          }),
        );
      } else {
        setApprovalDraft(null);
      }

      if (loadRoles) {
        requests.push(
          adminAPI.getRolePermissions().then((roleData) => {
            setRoleDraft(roleData as RolePermissionsMap);
          }),
        );
      } else {
        setRoleDraft(null);
      }

      if (requests.length > 0) {
        await Promise.all(requests);
      }
    } catch (loadError) {
      setUsers([]);
      setApprovalDraft(null);
      setRoleDraft(null);
      setError(
        errorStatus(loadError) === 403
          ? 'Admin access is required for workspace administration.'
          : 'Workspace settings could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSettings();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  useEffect(() => {
    if (!formMode && !showImportModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savingUser && !importBusy) {
        if (formMode) setFormMode(null);
        if (showImportModal) setShowImportModal(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [formMode, showImportModal, savingUser, importBusy]);

  const departments = useMemo(() => {
    const set = new Set(users.map((u) => u.department || 'General'));
    return ['ALL', ...Array.from(set).sort()];
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      const statusText = user.isActive ? 'active' : 'inactive';
      if (
        q &&
        !`${user.displayName} ${user.email || ''} ${user.role} ${user.department || ''} ${statusText}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      if (roleFilter !== 'ALL' && user.role !== roleFilter) return false;
      if (departmentFilter !== 'ALL' && (user.department || 'General') !== departmentFilter) return false;
      return true;
    });
  }, [query, roleFilter, departmentFilter, users]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [query, roleFilter, departmentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedUsers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, safePage, pageSize]);

  const activeUsers = users.filter((user) => user.isActive).length;
  const adminUsers = users.filter((user) => ['OWNER', 'ADMIN'].includes(user.role)).length;

  function openImportModal() {
    setImportCsvText('');
    setImportResult(null);
    setShowImportModal(true);
  }

  async function downloadImportTemplate() {
    try {
      const csv = await adminAPI.getImportTemplate();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users-import-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not download template.');
    }
  }

  async function runCsvImport() {
    setImportBusy(true);
    setImportResult(null);
    setError('');
    try {
      const res = await adminAPI.importUsersCsv(importCsvText);
      setImportResult(res);
      await loadSettings();
    } catch {
      setError('Import failed.');
    } finally {
      setImportBusy(false);
    }
  }

  function openCreateUser() {
    setFormMode('create');
    setFormError('');
    setUserForm(emptyUserForm);
  }

  function openEditUser(user: AdminUser) {
    setFormMode('edit');
    setFormError('');
    setUserForm({
      userId: user.userId,
      displayName: user.displayName,
      email: user.email || '',
      phoneNumber: user.phoneNumber || '',
      password: '',
      role: user.role || 'MEMBER',
      department: user.department || '',
      statusAvailability: user.availability || '',
      aboutText: user.aboutText || '',
      isActive: user.isActive,
    });
  }

  async function submitUserForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    if (!userForm.displayName.trim() || !userForm.email.trim()) {
      setFormError('Name and email are required.');
      return;
    }
    if (!isValidName(userForm.displayName)) {
      setFormError('Symbols and special characters are not allowed in Name.');
      return;
    }
    const currentId = sessionUser?.id || sessionUser?.userId;
    const isSelf = Boolean(userForm.userId && userForm.userId === currentId);

    if (isSelf && !userForm.isActive) {
      setFormError('You cannot deactivate your own account.');
      return;
    }

    if (formMode === 'create' && userForm.password.trim().length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }

    setSavingUser(true);
    try {
      const payload = {
        displayName: userForm.displayName.trim(),
        email: userForm.email.trim(),
        phoneNumber: userForm.phoneNumber.trim() || null,
        role: userForm.role,
        department: userForm.department.trim() || null,
        statusAvailability: userForm.statusAvailability,
        aboutText: userForm.aboutText.trim() || undefined,
        isActive: userForm.isActive,
      };

      if (formMode === 'create') {
        await adminAPI.createUser({
          ...payload,
          password: userForm.password,
        });
      } else if (userForm.userId) {
        await adminAPI.updateUser(userForm.userId, {
          ...payload,
          password: userForm.password.trim() || undefined,
        });
      }

      setFormMode(null);
      setUserForm(emptyUserForm);
      await loadSettings();
    } catch (saveError) {
      setFormError(
        errorStatus(saveError) === 403
          ? 'Admin access is required for this action.'
          : errorMessage(saveError, 'User could not be saved.'),
      );
    } finally {
      setSavingUser(false);
    }
  }

  function updateApproval<K extends keyof ApprovalSettings>(
    key: K,
    value: ApprovalSettings[K],
  ) {
    setApprovalDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function toggleApprovalScope(scope: string) {
    setApprovalDraft((current) => {
      if (!current) return current;
      const exists = current.appliesTo.includes(scope);
      return {
        ...current,
        appliesTo: exists
          ? current.appliesTo.filter((item) => item !== scope)
          : [...current.appliesTo, scope],
      };
    });
  }

  async function saveApprovalCycle() {
    if (!approvalDraft) return;

    setSavingApproval(true);
    setError('');
    try {
      const saved = await adminAPI.updateApprovalCycle(approvalDraft);
      setApprovalDraft(saved as ApprovalSettings);
    } catch (saveError) {
      setError(
        errorStatus(saveError) === 403
          ? 'Admin access is required for settings.'
          : errorMessage(saveError, 'Approval cycle could not be saved.'),
      );
    } finally {
      setSavingApproval(false);
    }
  }

  function toggleRoleModule(role: WorkspaceRole, module: ModuleKey) {
    if (role === 'OWNER' || !roleDraft) return;
    setRoleDraft((current) => {
      if (!current) return current;
      const entry = current[role];
      const hasModule = entry.modules.includes(module);
      return {
        ...current,
        [role]: {
          ...entry,
          modules: hasModule
            ? entry.modules.filter((item) => item !== module)
            : [...entry.modules, module],
        },
      };
    });
  }

  function toggleRoleCapability(role: WorkspaceRole, capability: CapabilityKey) {
    if (role === 'OWNER' || !roleDraft) return;
    setRoleDraft((current) => {
      if (!current) return current;
      const entry = current[role];
      return {
        ...current,
        [role]: {
          ...entry,
          capabilities: {
            ...entry.capabilities,
            [capability]: !entry.capabilities[capability],
          },
        },
      };
    });
  }

  async function saveRolePermissions() {
    if (!roleDraft) return;

    setSavingRoles(true);
    setError('');
    try {
      const saved = await adminAPI.updateRolePermissions(roleDraft);
      setRoleDraft(saved as RolePermissionsMap);
    } catch (saveError) {
      setError(
        errorStatus(saveError) === 403
          ? 'You do not have permission to edit roles.'
          : errorMessage(saveError, 'Role permissions could not be saved.'),
      );
    } finally {
      setSavingRoles(false);
    }
  }

  const canManageAdmin =
    canManageUsers || canManageSettings || canManageRoles || canImportUsers;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-blue-700" />
          <div>
            <h1 className="text-lg font-bold text-slate-950">Settings</h1>
            <p className="text-xs text-slate-500">
              {canManageAdmin ? 'Workspace administration' : 'Workspace settings'}
            </p>
          </div>
        </div>
        {canManageAdmin && (
          <button
            onClick={loadSettings}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{error}</span>
              <button onClick={loadSettings} className="font-semibold hover:text-red-900">
                Retry
              </button>
            </div>
          )}

          {canManageAdmin ? (
          <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-lg border border-slate-200 bg-white p-1">
              <button
                onClick={() => setActiveTab('users')}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${
                  activeTab === 'users' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Users className="h-4 w-4" />
                Users
              </button>
              <button
                onClick={() => setActiveTab('approval')}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${
                  activeTab === 'approval' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                Approval cycle
              </button>
              {(canManageRoles || canManageSettings) && (
                <button
                  onClick={() => setActiveTab('roles')}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${
                    activeTab === 'roles' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <KeyRound className="h-4 w-4" />
                  Roles & permissions
                </button>
              )}
            </div>

            {activeTab === 'users' ? (
              <div className="flex flex-wrap items-center gap-2">
                {/* Total */}
                <div
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-2xs transition hover:border-slate-300"
                  title="Total registered users"
                >
                  <Users className="h-4 w-4 text-slate-500 shrink-0" />
                  <span className="text-xs font-extrabold text-slate-900">{users.length}</span>
                  <span className="text-xs font-medium text-slate-500">total</span>
                </div>

                {/* Active */}
                <div
                  className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 shadow-2xs transition hover:bg-emerald-100/50"
                  title="Active accounts"
                >
                  <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-extrabold text-emerald-900">{activeUsers}</span>
                  <span className="text-xs font-semibold text-emerald-700">active</span>
                </div>

                {/* Inactive (if any) */}
                {users.length - activeUsers > 0 && (
                  <div
                    className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-1.5 shadow-2xs transition hover:bg-amber-100/50"
                    title="Inactive accounts"
                  >
                    <UserX className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-xs font-extrabold text-amber-900">{users.length - activeUsers}</span>
                    <span className="text-xs font-semibold text-amber-700">inactive</span>
                  </div>
                )}

                {/* Admins */}
                <div
                  className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-1.5 shadow-2xs transition hover:bg-blue-100/50"
                  title="Workspace administrators"
                >
                  <ShieldCheck className="h-4 w-4 text-blue-700 shrink-0" />
                  <span className="text-xs font-extrabold text-blue-900">{adminUsers}</span>
                  <span className="text-xs font-semibold text-blue-700">admins</span>
                </div>
              </div>
            ) : null}
          </div>

          {activeTab === 'users' ? (
            <section>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative min-w-48 max-w-xs flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400"
                    placeholder="Search users..."
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                >
                  <option value="ALL">All roles</option>
                  <option value="OWNER">Owner</option>
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="MEMBER">Member</option>
                </select>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>{d === 'ALL' ? 'All departments' : d}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={openImportModal}
                  disabled={!canImportUsers}
                  className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileUp className="h-4 w-4" />
                  Import CSV
                </button>
                <button
                  onClick={openCreateUser}
                  disabled={!canManageUsers}
                  className="flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UserPlus className="h-4 w-4" />
                  New user
                </button>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {loading ? (
                  <div className="p-6 text-sm text-slate-500">Loading users...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex h-56 flex-col items-center justify-center gap-3 text-slate-400">
                    <Users className="h-10 w-10 text-slate-300" />
                    <p className="text-sm">No users match your filters.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                        <tr>
                          <th className="w-16 px-4 py-3 text-slate-500">Sr No</th>
                          <th className="px-4 py-3">User</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Department</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Last login</th>
                          <th className="px-4 py-3">Last seen</th>
                          <th className="px-4 py-3">Joined</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedUsers.map((user, index) => {
                          const isCurrentUser = Boolean(
                            (sessionUser?.id && user.userId === sessionUser.id) ||
                            (sessionUser?.userId && user.userId === sessionUser.userId)
                          );
                          const srNo = (safePage - 1) * pageSize + index + 1;
                          return (
                            <tr key={user.userId} className="hover:bg-slate-50">
                              <td className="px-4 py-3 text-xs font-semibold text-slate-400">
                                {srNo}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-slate-950">{user.displayName}</span>
                                  {isCurrentUser && (
                                    <span className="rounded-md bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500">{user.email || 'No email'}</div>
                              </td>
                            <td className="px-4 py-3">
                              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                                {roleLabel(user.role)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{user.department || 'General'}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  user.isActive
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}
                              >
                                {user.isActive ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                )}
                                <span>{user.isActive ? 'Active' : 'Inactive'}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{formatLastSeen(user.lastLoginAt)}</td>
                            <td className="px-4 py-3 text-slate-500">{formatLastSeen(user.lastSeen)}</td>
                            <td className="px-4 py-3 text-slate-500">{formatDate(user.joinedAt)}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => openEditUser(user)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                            </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Pagination Footer */}
                    {filteredUsers.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs font-medium text-slate-600">
                        <div className="flex items-center gap-2">
                          <span>
                            Showing <span className="font-bold text-slate-900">{(safePage - 1) * pageSize + 1}</span> to{' '}
                            <span className="font-bold text-slate-900">
                              {Math.min(safePage * pageSize, filteredUsers.length)}
                            </span>{' '}
                            of <span className="font-bold text-slate-900">{filteredUsers.length}</span> users
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          {/* Rows Per Page */}
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">Rows per page:</span>
                            <select
                              value={pageSize}
                              onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(1);
                              }}
                              className="h-8 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-500 cursor-pointer"
                            >
                              {[10, 25, 50, 100].map((size) => (
                                <option key={size} value={size}>
                                  {size}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Navigation Buttons */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={safePage <= 1}
                              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                              title="Previous page"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>

                            <span className="px-2 font-semibold text-slate-700">
                              Page <span className="font-bold text-slate-950">{safePage}</span> of{' '}
                              <span className="font-bold text-slate-950">{totalPages}</span>
                            </span>

                            <button
                              type="button"
                              disabled={safePage >= totalPages}
                              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                              title="Next page"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          ) : activeTab === 'approval' ? (
            <section className="max-w-3xl">
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                {loading ? (
                  <div className="text-sm text-slate-500">Loading approval cycle...</div>
                ) : !approvalDraft ? (
                  <div className="text-sm text-slate-500">No approval settings returned from the backend.</div>
                ) : (
                  <div className="space-y-5">
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">Require approvals</span>
                        <span className="text-xs text-slate-500">Workspace approval controls</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={approvalDraft.enabled}
                        onChange={(event) => updateApproval('enabled', event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-700"
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="block text-sm font-medium text-slate-700">
                        Required approvals
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={approvalDraft.requiredApprovals}
                          onChange={(event) => updateApproval('requiredApprovals', Number(event.target.value))}
                          className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                        />
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        Approver role
                        <select
                          value={approvalDraft.approverRole}
                          onChange={(event) => updateApproval('approverRole', event.target.value)}
                          className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                        >
                          {APPROVER_ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-sm font-medium text-slate-700">
                        Escalation hours
                        <input
                          type="number"
                          min={1}
                          max={168}
                          value={approvalDraft.escalationHours}
                          onChange={(event) => updateApproval('escalationHours', Number(event.target.value))}
                          className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                        />
                      </label>
                    </div>

                    <div>
                      <div className="mb-2 text-sm font-semibold text-slate-800">Applies to</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {APPROVAL_SCOPE_OPTIONS.map((scope) => (
                          <label
                            key={scope.value}
                            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
                          >
                            {scope.label}
                            <input
                              type="checkbox"
                              checked={approvalDraft.appliesTo.includes(scope.value)}
                              onChange={() => toggleApprovalScope(scope.value)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-700"
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
                      <span className="text-sm font-semibold text-slate-900">Auto-approve admins</span>
                      <input
                        type="checkbox"
                        checked={approvalDraft.autoApproveAdmins}
                        onChange={(event) => updateApproval('autoApproveAdmins', event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-700"
                      />
                    </label>

                    <button
                      onClick={saveApprovalCycle}
                      disabled={savingApproval}
                      className="flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      {savingApproval ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {savingApproval ? 'Saving...' : 'Save approval cycle'}
                    </button>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="max-w-5xl">
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <p className="mb-4 text-sm text-slate-600">
                  Role defaults apply to all users unless overridden on People.
                </p>
                {loading ? (
                  <div className="text-sm text-slate-500">Loading role permissions...</div>
                ) : !roleDraft ? (
                  <div className="text-sm text-slate-500">No role permissions returned from the backend.</div>
                ) : (
                  <div className="space-y-6">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                            <th className="px-3 py-2">Permission</th>
                            {WORKSPACE_ROLE_COLUMNS.map((role) => (
                              <th key={role} className="px-3 py-2 text-center">
                                {role}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td
                              colSpan={WORKSPACE_ROLE_COLUMNS.length + 1}
                              className="bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500"
                            >
                              Modules
                            </td>
                          </tr>
                          {MODULE_OPTIONS.map(({ key, label }) => (
                            <tr key={key} className="border-b border-slate-100">
                              <td className="px-3 py-2 font-medium text-slate-800">{label}</td>
                              {WORKSPACE_ROLE_COLUMNS.map((role) => {
                                const checked = roleDraft[role].modules.includes(key);
                                const readOnly = role === 'OWNER' || !canManageRoles;
                                return (
                                  <td key={`${role}-${key}`} className="px-3 py-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={readOnly || savingRoles}
                                      onChange={() => toggleRoleModule(role, key)}
                                      className="h-4 w-4 rounded border-slate-300 text-blue-700 disabled:opacity-60"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          <tr>
                            <td
                              colSpan={WORKSPACE_ROLE_COLUMNS.length + 1}
                              className="bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500"
                            >
                              Capabilities
                            </td>
                          </tr>
                          {CAPABILITY_KEYS.map((capability) => (
                            <tr key={capability} className="border-b border-slate-100">
                              <td className="px-3 py-2 font-medium text-slate-800">
                                {CAPABILITY_LABELS[capability]}
                              </td>
                              {WORKSPACE_ROLE_COLUMNS.map((role) => {
                                const checked = roleDraft[role].capabilities[capability];
                                const readOnly = role === 'OWNER' || !canManageRoles;
                                return (
                                  <td key={`${role}-${capability}`} className="px-3 py-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={readOnly || savingRoles}
                                      onChange={() => toggleRoleCapability(role, capability)}
                                      className="h-4 w-4 rounded border-slate-300 text-blue-700 disabled:opacity-60"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {canManageRoles ? (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={saveRolePermissions}
                          disabled={savingRoles}
                          className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                          {savingRoles ? 'Saving…' : 'Save role permissions'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">You can view role permissions but need manage roles to edit.</p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
          </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-slate-400 mb-3" />
              <h2 className="text-base font-bold text-slate-800">Workspace Administration</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Workspace settings and member management are restricted to workspace administrators.
              </p>
            </div>
          )}
        </main>
      </div>

      {formMode && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div
              className="absolute inset-0"
              aria-hidden
              onClick={() => !savingUser && setFormMode(null)}
            />
            <div className="relative z-10 w-full max-w-2xl sm:max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <h2 className="text-base font-bold text-slate-950">
                    {formMode === 'create' ? 'New user' : 'Edit user'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {formMode === 'create' ? 'Create workspace access' : userForm.email}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingUser}
                  onClick={() => setFormMode(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
                  title="Close user form"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable Form Body with 2-Column Grid */}
              <form onSubmit={submitUserForm} className="flex flex-col min-h-0 flex-1">
                <div className="overflow-y-auto p-6 flex-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                    {/* Full Name */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Full name
                      </label>
                      <input
                        value={userForm.displayName}
                        onChange={(event) =>
                          setUserForm((current) => ({
                            ...current,
                            displayName: sanitizeName(event.target.value),
                          }))
                        }
                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                        placeholder="User full name"
                        required
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Email
                      </label>
                      <input
                        value={userForm.email}
                        onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                        type="email"
                        placeholder="user@organization.com"
                        required
                      />
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Phone
                      </label>
                      <input
                        value={userForm.phoneNumber}
                        onChange={(event) => setUserForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                        placeholder="Optional phone number"
                      />
                    </div>

                    {/* Password / Password reset */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        {formMode === 'create' ? 'Password' : 'Password reset'}
                      </label>
                      <PasswordInput
                        value={userForm.password}
                        onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                        className="h-10 text-sm"
                        frameClassName="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/10"
                        minLength={formMode === 'create' ? 8 : undefined}
                        required={formMode === 'create'}
                        placeholder={formMode === 'create' ? 'At least 8 characters' : 'Leave empty to keep current'}
                      />
                      {formMode === 'edit' && (
                        <span className="mt-1 block text-xs font-normal text-slate-400">
                          Leave blank to keep existing password.
                        </span>
                      )}
                    </div>

                    {/* Role */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Role
                      </label>
                      <select
                        disabled={Boolean(userForm.userId && (userForm.userId === sessionUser?.id || userForm.userId === sessionUser?.userId))}
                        value={userForm.role}
                        onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}
                        className={`h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 cursor-pointer ${
                          userForm.userId && (userForm.userId === sessionUser?.id || userForm.userId === sessionUser?.userId)
                            ? 'opacity-60 cursor-not-allowed bg-slate-100'
                            : ''
                        }`}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      {userForm.userId && (userForm.userId === sessionUser?.id || userForm.userId === sessionUser?.userId) && (
                        <span className="mt-1 block text-xs font-normal text-slate-400">
                          You cannot modify your own administrative role.
                        </span>
                      )}
                    </div>

                    {/* Status */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Status
                      </label>
                      <select
                        value={userForm.statusAvailability}
                        onChange={(event) => setUserForm((current) => ({ ...current, statusAvailability: event.target.value }))}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
                      >
                        {AVAILABILITY_PICKER_OPTIONS.map((status) => (
                          <option key={status.value || 'none'} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs font-normal text-slate-400">
                        Connection presence is managed automatically.
                      </span>
                    </div>

                    {/* Department */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Department
                      </label>
                      <input
                        value={userForm.department}
                        onChange={(event) => setUserForm((current) => ({ ...current, department: event.target.value }))}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                        placeholder="e.g. IT, Engineering, Product"
                      />
                    </div>

                    {/* Active User Toggle */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Account Status
                      </label>
                      {(() => {
                        const isSelf = Boolean(
                          userForm.userId &&
                            (userForm.userId === sessionUser?.id || userForm.userId === sessionUser?.userId),
                        );
                        return (
                          <>
                            <label
                              className={`flex h-10 items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-700 transition-colors ${
                                isSelf ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'hover:bg-slate-50 cursor-pointer'
                              }`}
                            >
                              <span>Active user</span>
                              <input
                                type="checkbox"
                                disabled={isSelf}
                                checked={isSelf ? true : userForm.isActive}
                                onChange={(event) => {
                                  if (!isSelf) {
                                    setUserForm((current) => ({ ...current, isActive: event.target.checked }));
                                  }
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </label>
                            {isSelf && (
                              <span className="mt-1 block text-xs font-medium text-amber-600">
                                You cannot deactivate your own account.
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* About */}
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        About
                      </label>
                      <textarea
                        value={userForm.aboutText}
                        onChange={(event) => setUserForm((current) => ({ ...current, aboutText: event.target.value }))}
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 resize-y"
                        placeholder="Brief user bio or workspace notes"
                      />
                    </div>

                    {/* Form Error */}
                    {formError && (
                      <div className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                        {formError}
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                  <button
                    type="button"
                    disabled={savingUser}
                    onClick={() => setFormMode(null)}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingUser}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-6 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {savingUser ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {savingUser ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Portal>
      )}

      {showImportModal && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <div
              className="absolute inset-0"
              aria-hidden
              onClick={() => !importBusy && setShowImportModal(false)}
            />
            <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-950">Import users (CSV)</h2>
                <button
                  type="button"
                  disabled={importBusy}
                  onClick={() => setShowImportModal(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Required columns: <span className="font-mono">email</span>,{' '}
                <span className="font-mono">displayName</span> (or name),{' '}
                <span className="font-mono">password</span>. Optional: phoneNumber, role, department.
              </p>
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={downloadImportTemplate}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Download template
                </button>
                <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Upload file
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setImportCsvText(String(reader.result || ''));
                      };
                      reader.readAsText(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <textarea
                value={importCsvText}
                onChange={(e) => setImportCsvText(e.target.value)}
                className="mb-3 min-h-40 w-full rounded-lg border border-slate-200 p-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-500"
                placeholder="Paste CSV here..."
              />
              {importResult && (
                <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <div>
                    Created: <strong>{importResult.created}</strong> — Skipped:{' '}
                    <strong>{importResult.skipped}</strong>
                  </div>
                  {importResult.errors.length > 0 && (
                    <ul className="mt-2 max-h-32 list-inside list-disc overflow-y-auto text-red-700">
                      {importResult.errors.slice(0, 20).map((err) => (
                        <li key={`${err.line}-${err.message}`}>
                          Line {err.line}: {err.message}
                        </li>
                      ))}
                      {importResult.errors.length > 20 && (
                        <li>…and {importResult.errors.length - 20} more</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={importBusy}
                  onClick={() => setShowImportModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={importBusy || !importCsvText.trim()}
                  onClick={runCsvImport}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {importBusy ? 'Importing…' : 'Run import'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
