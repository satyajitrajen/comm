'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, Loader2, UserRound } from 'lucide-react';
import { authAPI, filesAPI, usersAPI } from '../../services/api';
import { resolveApiBaseUrl } from '../../lib/desktopRuntime';
import { isValidName, sanitizeName } from '../../lib/nameValidation';
import ChangePasswordModal from './ChangePasswordModal';

type ProfileFields = {
  displayName: string;
  aboutText: string;
  avatarUrl: string | null;
};

type CurrentUser = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl?: string | null;
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
const FILE_VIEW_PATH = /^\/api\/v1\/files\/([a-zA-Z0-9-]+)\/view\/?$/;
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-50 disabled:text-slate-500';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50';

export default function ProfileSettings({ className }: { className?: string }) {
  const [draft, setDraft] = useState<ProfileFields>({ displayName: '', aboutText: '', avatarUrl: null });
  const [savedProfile, setSavedProfile] = useState<ProfileFields | null>(null);
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarAttempt, setAvatarAttempt] = useState(0);
  const [preview, setPreview] = useState<{ source: string; url: string } | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');

    async function loadProfile() {
      try {
        // /auth/me omits aboutText; the directory returns the current profile's About field.
        const [current, directory]: [CurrentUser, { userId: string; aboutText?: string }[]] = await Promise.all([
          authAPI.me(),
          usersAPI.getDirectory(),
        ]);
        const ownProfile = directory.find((person) => person.userId === current.id);
        if (typeof ownProfile?.aboutText !== 'string') throw new Error('Profile unavailable');
        if (cancelled) return;
        const fields = {
          displayName: current.displayName,
          aboutText: ownProfile.aboutText,
          avatarUrl: current.avatarUrl || null,
        };
        setUserId(current.id);
        setEmail(current.email || '');
        setDraft(fields);
        setSavedProfile(fields);
      } catch {
        if (!cancelled) setLoadError('Your profile could not be loaded. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    const source = draft.avatarUrl;
    setPreview(null);
    setAvatarError('');
    setAvatarLoading(Boolean(source));

    async function loadAvatar() {
      if (!source) return;
      try {
        const url = new URL(source, window.location.href);
        const apiOrigin = new URL(resolveApiBaseUrl() || window.location.origin, window.location.href).origin;
        const local = source.startsWith('/api/v1/files/') || url.origin === window.location.origin || url.origin === apiOrigin;
        const fileId = local ? url.pathname.match(FILE_VIEW_PATH)?.[1] : undefined;
        if (fileId) {
          const response = await filesAPI.view(fileId);
          if (cancelled) return;
          if (!IMAGE_TYPES.includes(response.data.type)) throw new Error('Unsupported image');
          objectUrl = URL.createObjectURL(response.data);
          setPreview({ source, url: objectUrl });
        } else {
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
            throw new Error('Invalid photo URL');
          }
          setPreview({ source, url: url.href });
        }
      } catch {
        if (!cancelled) setAvatarError('Your photo could not be loaded. Retry or choose another image.');
      } finally {
        if (!cancelled) setAvatarLoading(false);
      }
    }

    void loadAvatar();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [draft.avatarUrl, avatarAttempt]);

  const busy = loading || saving || uploading || avatarLoading;
  const disabled = busy || !savedProfile;
  const dirty = savedProfile && (
    draft.displayName.trim() !== savedProfile.displayName ||
    draft.aboutText.trim() !== savedProfile.aboutText ||
    draft.avatarUrl !== savedProfile.avatarUrl
  );
  const previewUrl = preview?.source === draft.avatarUrl ? preview.url : '';

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled) return;
    setFeedback(null);
    if (!IMAGE_TYPES.includes(file.type)) {
      setFeedback({ error: true, message: 'Choose a JPG, PNG, GIF, WebP or BMP image.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFeedback({ error: true, message: 'Your photo must be 10 MB or smaller.' });
      return;
    }

    setUploading(true);
    try {
      const uploaded: { id: string } = await filesAPI.upload(file);
      if (!uploaded.id || !/^[a-zA-Z0-9-]+$/.test(uploaded.id)) throw new Error('Missing file ID');
      if (!mounted.current) return;
      setDraft((current) => ({ ...current, avatarUrl: `/api/v1/files/${uploaded.id}/view` }));
      setFeedback({ error: false, message: 'Photo uploaded. Save changes to apply it.' });
    } catch {
      if (mounted.current) setFeedback({ error: true, message: 'Your photo could not be uploaded. Please try again.' });
    } finally {
      if (mounted.current) setUploading(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setFeedback(null);
    if (!isValidName(draft.displayName)) {
      setFeedback({ error: true, message: 'Enter a display name using letters, numbers, spaces, dots, hyphens or apostrophes.' });
      return;
    }

    setSaving(true);
    try {
      const updated: ProfileFields = await usersAPI.updateProfile({
        displayName: draft.displayName.trim(),
        aboutText: draft.aboutText.trim(),
        avatarUrl: draft.avatarUrl,
      });
      const fields: ProfileFields = {
        displayName: updated.displayName,
        aboutText: updated.aboutText,
        avatarUrl: updated.avatarUrl,
      };
      let synced = false;
      try {
        const stored = localStorage.getItem('veloce_user');
        const latest = stored ? JSON.parse(stored) : null;
        if (latest && latest.id === userId) {
          localStorage.setItem('veloce_user', JSON.stringify({ ...latest, ...fields }));
          window.dispatchEvent(new Event('storage'));
          synced = true;
        }
      } catch {
        synced = false;
      }
      if (!mounted.current) return;
      setDraft(fields);
      setSavedProfile(fields);
      setFeedback(synced
        ? { error: false, message: 'Profile updated successfully.' }
        : { error: true, message: 'Profile saved, but account details could not refresh in this browser. Reload to sync.' });
    } catch {
      if (mounted.current) setFeedback({ error: true, message: 'Your profile could not be saved. Please try again.' });
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <section className={className} aria-labelledby="profile-settings-title">
      <header className="mb-8">
        <h2 id="profile-settings-title" className="text-xl font-semibold tracking-tight text-slate-950">Profile</h2>
        <p className="mt-1.5 text-sm text-slate-500">Manage your personal information and account security.</p>
      </header>

      {loading && (
        <p role="status" className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Loading your profile…
        </p>
      )}
      {loadError && (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{loadError}</p>
          <button type="button" disabled={busy} onClick={() => setLoadAttempt((attempt) => attempt + 1)} className={buttonClass}>Retry</button>
        </div>
      )}

      <form onSubmit={saveProfile} aria-busy={busy}>
        <fieldset disabled={disabled} className="space-y-6">
          <legend className="sr-only">Personal information</legend>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="profile-display-name" className="mb-2 block text-sm font-medium text-slate-800">Display name</label>
              <input
                id="profile-display-name"
                name="displayName"
                autoComplete="name"
                required
                value={draft.displayName}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, displayName: sanitizeName(event.target.value) }));
                  setFeedback(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="profile-email" className="mb-2 block text-sm font-medium text-slate-800">Account email</label>
              <input id="profile-email" type="email" autoComplete="email" value={email} readOnly aria-describedby="profile-email-help" placeholder={loading ? '' : 'No email address'} className={`${inputClass} bg-slate-50 text-slate-500`} />
              <p id="profile-email-help" className="mt-2 text-xs text-slate-500">Your account email cannot be changed here.</p>
            </div>
          </div>

          <div>
            <label htmlFor="profile-about" className="mb-2 block text-sm font-medium text-slate-800">About</label>
            <textarea
              id="profile-about"
              name="aboutText"
              rows={3}
              value={draft.aboutText}
              placeholder="Tell your team a little about yourself"
              onChange={(event) => {
                setDraft((current) => ({ ...current, aboutText: event.target.value }));
                setFeedback(null);
              }}
              className={`${inputClass} resize-y`}
            />
          </div>

          <div>
            <label htmlFor="profile-photo" className="mb-3 block text-sm font-medium text-slate-800">Profile photo</label>
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400">
                {avatarLoading || uploading ? (
                  <Loader2 aria-label={uploading ? 'Uploading photo' : 'Loading photo'} className="h-6 w-6 animate-spin" />
                ) : previewUrl ? (
                  <Image
                    key={previewUrl}
                    src={previewUrl}
                    alt="Your profile photo"
                    width={80}
                    height={80}
                    unoptimized
                    referrerPolicy="no-referrer"
                    className="h-20 w-20 object-cover"
                    onError={() => {
                      setPreview(null);
                      setAvatarError('Your photo could not be displayed. Retry or choose another image.');
                    }}
                  />
                ) : <UserRound aria-label="No profile photo" className="h-8 w-8" />}
              </div>
              <div>
                <input ref={fileInput} id="profile-photo" type="file" accept={IMAGE_TYPES.join(',')} onChange={uploadPhoto} aria-describedby="profile-photo-help" className="sr-only" tabIndex={-1} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => fileInput.current?.click()} className={buttonClass}>
                    <Camera aria-hidden="true" className="h-4 w-4" />{uploading ? 'Uploading…' : 'Upload photo'}
                  </button>
                  <button
                    type="button"
                    disabled={!draft.avatarUrl || disabled}
                    onClick={() => {
                      setDraft((current) => ({ ...current, avatarUrl: null }));
                      setFeedback({ error: false, message: 'Photo removed. Save changes to apply it.' });
                    }}
                    className={buttonClass}
                  >Remove</button>
                </div>
                <p id="profile-photo-help" className="mt-2 text-xs text-slate-500">JPG, PNG, GIF, WebP or BMP. Maximum 10 MB.</p>
              </div>
            </div>
            {avatarError && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-red-600">
                <p role="alert">{avatarError}</p>
                <button type="button" onClick={() => setAvatarAttempt((attempt) => attempt + 1)} className="rounded font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-600">Retry photo</button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button type="submit" disabled={disabled || !dirty} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50">
              {saving && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {feedback && <p role={feedback.error ? 'alert' : 'status'} className={`text-sm ${feedback.error ? 'text-red-600' : 'text-emerald-700'}`}>{feedback.message}</p>}
          </div>
        </fieldset>
      </form>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-7">
        <div>
          <h3 className="text-sm font-medium text-slate-900">Password</h3>
          <p className="mt-1 text-sm text-slate-500">You’ll be signed out after changing your password.</p>
        </div>
        <button type="button" disabled={disabled} onClick={() => setPasswordOpen(true)} className={buttonClass}>Change password</button>
      </div>
      <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </section>
  );
}
