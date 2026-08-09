# Change Password Modal Implementation Plan

> **For Cursor:** Use executing-plans skill to implement this plan task-by-task.

**Goal:** Remove the Change Password section from the Settings page and implement a dedicated Change Password modal accessible from the user profile options in the navigation shell.

**Architecture:** Create a standalone `ChangePasswordModal` component rendered via `Portal`. Connect this modal to both the sidebar user status dropdown and topbar profile dropdown in `AppShell`. Clean up the password management form and associated state from `settings/page.tsx`.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS, Lucide Icons, Axios authAPI.

---

### Task 1: Create `ChangePasswordModal` Component

**Files to create:**
* `frontend/src/app/components/ChangePasswordModal.tsx`

**Step 1: Implement `ChangePasswordModal.tsx`**
```tsx
'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Lock, Save, X } from 'lucide-react';
import { authAPI } from '@/services/api';
import { useChatStore } from '@/store/useChatStore';
import PasswordInput from './PasswordInput';
import Portal from './Portal';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: { message?: string | string[] } } }).response?.data;
    const msg = data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && msg[0]) return String(msg[0]);
  }
  return fallback;
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  if (!isOpen) return null;

  function handleClose() {
    if (savingPassword) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword.trim()) {
      setPasswordError('Current password is required.');
      return;
    }
    if (newPassword.trim().length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from the current password.');
      return;
    }

    setSavingPassword(true);
    try {
      await authAPI.changePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password updated — please sign in again.');
      localStorage.removeItem('veloce_token');
      localStorage.removeItem('veloce_refresh');
      localStorage.removeItem('veloce_session');
      localStorage.removeItem('veloce_user');
      useChatStore.getState().logout();
      window.setTimeout(() => {
        router.replace('/login?notice=password-updated');
      }, 600);
    } catch (saveError) {
      setPasswordError(errorMessage(saveError, 'Password could not be updated.'));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity cursor-pointer"
          onClick={handleClose}
        />

        {/* Modal Card */}
        <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl transition-all modal-card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-950">Change password</h3>
                <p className="text-xs text-slate-500">Update your account credentials</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={savingPassword}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-xs font-semibold text-slate-700">
              Current password
              <PasswordInput
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                required
              />
            </label>

            <label className="block text-xs font-semibold text-slate-700">
              New password
              <PasswordInput
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                minLength={8}
                required
              />
            </label>

            <label className="block text-xs font-semibold text-slate-700">
              Confirm new password
              <PasswordInput
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                minLength={8}
                required
              />
            </label>

            {passwordError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                {passwordSuccess}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={savingPassword}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPassword}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {savingPassword ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
```

---

### Task 2: Integrate `ChangePasswordModal` in `AppShell`

**Files to modify:**
* `frontend/src/app/components/AppShell.tsx`

**Step 1: Add State and Import**
* Import `ChangePasswordModal` from `./ChangePasswordModal`.
* Add state: `const [showPasswordModal, setShowPasswordModal] = useState(false);`
* Update the sidebar profile dropdown "Change password" button:
  ```tsx
  <button
    onClick={(e) => { e.stopPropagation(); setShowStatusDropdown(false); setShowPasswordModal(true); }}
    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
  >
    <KeyRound className="h-4 w-4 text-slate-400" />
    Change password
  </button>
  ```
* Update the top-right user profile dropdown "Change password" button:
  ```tsx
  <button
    onClick={() => {
      setShowUserDropdown(false);
      setShowPasswordModal(true);
    }}
    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
  >
    <KeyRound className="h-4 w-4 text-slate-400" />
    Change password
  </button>
  ```
* Render `<ChangePasswordModal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} />`.

---

### Task 3: Clean up Settings Page

**Files to modify:**
* `frontend/src/app/(app)/settings/page.tsx`

**Step 1: Remove Password Change section & state**
* Remove `currentPassword`, `newPassword`, `confirmPassword`, `passwordError`, `passwordSuccess`, `savingPassword`.
* Remove `handleChangePassword`.
* Remove `<section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">` containing the password form.
* Remove unused `PasswordInput` import.
* Update header description from `canManageAdmin ? 'Account and workspace administration' : 'Account settings'` to `canManageAdmin ? 'Workspace administration' : 'Workspace settings'`.
* For non-admins visiting `/settings`, render a clean message state indicating workspace settings are managed by workspace administrators.

---

### Task 4: Verification and Build Validation

**Step 1: Run TypeScript compiler check**
* Run `npm run build` or `npx tsc --noEmit` in `frontend` directory to verify zero compile or type errors.

**Step 2: Manual UI validation**
* Verify clicking "Change password" in sidebar profile menu opens the modal.
* Verify clicking "Change password" in top-right header menu opens the modal.
* Verify form validation works (empty fields, mismatched passwords, < 8 chars).
* Verify Settings page no longer displays the password change section.
