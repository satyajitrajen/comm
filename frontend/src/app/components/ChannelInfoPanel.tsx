'use client';

import { useEffect, useMemo, useState } from 'react';
import { Edit3, LogOut, Shield, ShieldOff, Trash2, UserMinus, UserPlus, Volume2, VolumeX, X } from 'lucide-react';
import { chatsAPI, usersAPI } from '../../services/api';
import { avatarAccent, initials } from '../(app)/_utils';
import ConfirmDialog from './ConfirmDialog';
import Portal from './Portal';

type ChannelMember = {
  userId: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  role: string;
  joinedAt?: string;
};

type TransferCandidate = {
  userId: string;
  displayName: string;
  role: string;
};

type ChannelDetails = {
  conversationId: string;
  group: {
    name: string;
    description?: string | null;
    teamName?: string | null;
    channelSlug?: string | null;
    spaceType?: string | null;
    isReadOnly?: boolean;
    createdBy?: string | null;
  };
  members: ChannelMember[];
  isMember: boolean;
  myRole: string;
  canManageMembers: boolean;
  isOwner: boolean;
  transferCandidates: TransferCandidate[];
  memberCount: number;
};

type DirectoryPerson = {
  userId: string;
  displayName: string;
  email?: string | null;
};

type ChannelInfoPanelProps = {
  conversationId: string;
  channelName: string;
  isMember: boolean;
  currentUserId?: string;
  onClose: () => void;
  onMembersChanged: () => void;
  onRequestLeave: (details: {
    isOwner: boolean;
    transferCandidates: TransferCandidate[];
  }) => void;
};

function roleLabel(role: string) {
  if (role === 'OWNER') return 'Owner';
  if (role === 'ADMIN') return 'Admin';
  if (role === 'GUEST') return 'Guest';
  return 'Member';
}

function roleBadgeClass(role: string) {
  if (role === 'OWNER') return 'bg-violet-100 text-violet-700';
  if (role === 'ADMIN') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

export default function ChannelInfoPanel({
  conversationId,
  channelName,
  isMember,
  currentUserId,
  onClose,
  onMembersChanged,
  onRequestLeave,
}: ChannelInfoPanelProps) {
  const [details, setDetails] = useState<ChannelDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [addSearch, setAddSearch] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<ChannelMember | null>(null);

  // Mute & Edit & Delete state
  const [isMuted, setIsMuted] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editReadOnly, setEditReadOnly] = useState(false);
  const [updatingGroup, setUpdatingGroup] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);

  async function loadDetails() {
    setLoading(true);
    setError('');
    try {
      const data = await chatsAPI.getDetails(conversationId);
      setDetails(data as ChannelDetails);
      setEditName(data.group?.name || channelName);
      setEditDesc(data.group?.description || '');
      setEditReadOnly(!!data.group?.isReadOnly);
    } catch {
      setError('Channel details could not be loaded.');
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetails();
  }, [conversationId]);

  const canAddMembers = useMemo(() => {
    return !!details?.isMember && !details?.group?.isReadOnly;
  }, [details]);

  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  useEffect(() => {
    if (!canAddMembers) return;
    usersAPI
      .getDirectory()
      .then((data) => setPeople(Array.isArray(data) ? data : []))
      .catch(() => setPeople([]));
  }, [canAddMembers]);

  const memberIds = useMemo(
    () => new Set(details?.members.map((m) => m.userId) || []),
    [details?.members],
  );

  const filteredChannelMembers = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase();
    if (!q || !details) return details?.members || [];
    return details.members.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q),
    );
  }, [details, memberSearchQuery]);

  const addCandidates = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    return people.filter((p) => {
      if (memberIds.has(p.userId)) return false;
      if (!q) return true;
      return (
        p.displayName.toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      );
    });
  }, [people, memberIds, addSearch]);

  async function handleAddMembers() {
    if (selectedToAdd.length === 0) return;
    setAdding(true);
    setError('');
    try {
      await chatsAPI.addMembers(conversationId, selectedToAdd);
      setSelectedToAdd([]);
      setShowAddForm(false);
      setAddSearch('');
      await loadDetails();
      onMembersChanged();
    } catch {
      setError('Members could not be added.');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemovingId(userId);
    setError('');
    try {
      await chatsAPI.removeMember(conversationId, userId);
      setMemberToRemove(null);
      await loadDetails();
      onMembersChanged();
    } catch {
      setError('Member could not be removed.');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleToggleRole(member: ChannelMember) {
    if (!details?.isOwner) return;
    const newRole = member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    setError('');
    try {
      await chatsAPI.updateMemberRole(conversationId, member.userId, newRole);
      await loadDetails();
      onMembersChanged();
    } catch {
      setError('Member role could not be updated.');
    }
  }

  async function handleToggleMute() {
    setError('');
    try {
      if (isMuted) {
        await chatsAPI.unmute(conversationId);
        setIsMuted(false);
      } else {
        await chatsAPI.mute(conversationId);
        setIsMuted(true);
      }
    } catch {
      setError('Failed to update mute state.');
    }
  }

  async function handleUpdateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    setUpdatingGroup(true);
    setError('');
    try {
      await chatsAPI.updateGroup(conversationId, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        isReadOnly: editReadOnly,
      });
      setShowEditModal(false);
      await loadDetails();
      onMembersChanged();
    } catch {
      setError('Channel could not be updated.');
    } finally {
      setUpdatingGroup(false);
    }
  }

  async function handleDeleteGroup() {
    setDeletingGroup(true);
    setError('');
    try {
      await chatsAPI.deleteGroup(conversationId);
      setShowDeleteConfirm(false);
      onClose();
      onMembersChanged();
    } catch {
      setError('Channel could not be deleted.');
    } finally {
      setDeletingGroup(false);
    }
  }

  function toggleAddSelection(userId: string) {
    setSelectedToAdd((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  function handleLeaveClick() {
    if (!details) return;
    onRequestLeave({
      isOwner: details.isOwner,
      transferCandidates: details.transferCandidates,
    });
  }

  return (
    <>
      <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop Overlay */}
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
          
          {/* Modal Container */}
          <div className="relative z-10 flex w-full max-w-xl sm:max-w-2xl max-h-[85vh] flex-col rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl modal-card overflow-hidden">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 shrink-0">
              <h3 className="text-base font-bold text-slate-950">Channel info</h3>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loading ? (
                <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
              ) : !details ? (
                <div className="py-12 text-center text-sm text-red-600">{error || 'Unavailable'}</div>
              ) : (
                <>
                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-base font-bold text-slate-950">{details.group.name || channelName}</h4>
                      {details.canManageMembers && (
                        <button
                          onClick={() => setShowEditModal(true)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                          title="Edit channel details"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {details.group.teamName && (
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {details.group.teamName}
                      </p>
                    )}
                    {details.group.description && (
                      <p className="mt-2 text-sm leading-6 text-slate-600">{details.group.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {details.group.spaceType && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                          {details.group.spaceType.replace('_', ' ')}
                        </span>
                      )}
                      {details.group.isReadOnly && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                          Read only
                        </span>
                      )}
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">
                        {details.memberCount} member{details.memberCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </section>

                  {/* Members section */}
                  <section className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Members ({details.members.length})
                      </h4>
                      {canAddMembers && (
                        <button
                          type="button"
                          onClick={() => setShowAddForm((v) => !v)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Add Member
                        </button>
                      )}
                    </div>

                    {showAddForm && canAddMembers && (
                      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <input
                          type="search"
                          value={addSearch}
                          onChange={(e) => setAddSearch(e.target.value)}
                          placeholder="Search workspace people to add…"
                          className="mb-2 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                        />
                        <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-100 space-y-0.5 p-1">
                          {addCandidates.length === 0 ? (
                            <div className="p-2 text-xs text-slate-500">No new workspace members found.</div>
                          ) : (
                            addCandidates.map((person) => (
                              <label
                                key={person.userId}
                                className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 transition"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={selectedToAdd.includes(person.userId)}
                                    onChange={() => toggleAddSelection(person.userId)}
                                    className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 shrink-0"
                                  />
                                  <span className="text-xs font-medium text-slate-800 truncate">{person.displayName}</span>
                                </div>
                                {person.email && (
                                  <span className="text-[10px] text-slate-400 truncate ml-2">{person.email}</span>
                                )}
                              </label>
                            ))
                          )}
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddForm(false);
                              setSelectedToAdd([]);
                              setAddSearch('');
                            }}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={adding || selectedToAdd.length === 0}
                            onClick={() => void handleAddMembers()}
                            className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition"
                          >
                            {adding ? 'Adding…' : `Add ${selectedToAdd.length || ''}`}
                          </button>
                        </div>
                      </div>
                    )}

                    {details.members.length > 5 && (
                      <input
                        type="search"
                        value={memberSearchQuery}
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        placeholder="Search channel members…"
                        className="mb-2 h-8 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                      />
                    )}

                    <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                      {filteredChannelMembers.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">No matching members found.</div>
                      ) : (
                        filteredChannelMembers.map((member) => (
                          <div
                            key={member.userId}
                            className="flex items-center justify-between rounded-lg p-2 hover:bg-slate-50 transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarAccent(member.displayName)}`}>
                                {initials(member.displayName)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-semibold text-slate-900">{member.displayName}</span>
                                  {member.userId === currentUserId && <span className="text-[10px] text-slate-400">(you)</span>}
                                </div>
                                {member.email && <div className="truncate text-[10px] text-slate-400">{member.email}</div>}
                              </div>
                            </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {details.isOwner && member.role !== 'OWNER' && member.userId !== currentUserId ? (
                              <button
                                type="button"
                                onClick={() => handleToggleRole(member)}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold hover:opacity-80 transition cursor-pointer ${roleBadgeClass(member.role)}`}
                                title={`Click to ${member.role === 'ADMIN' ? 'demote to Member' : 'promote to Admin'}`}
                              >
                                {roleLabel(member.role)}
                              </button>
                            ) : (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleBadgeClass(member.role)}`}>
                                {roleLabel(member.role)}
                              </span>
                            )}

                            {details.canManageMembers && member.role !== 'OWNER' && member.userId !== currentUserId && (
                              <button
                                type="button"
                                disabled={removingId === member.userId}
                                onClick={() => setMemberToRemove(member)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                title="Remove member"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    </div>
                  </section>

                  {/* Actions */}
                  <section className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Actions</h5>
                    <button
                      onClick={handleToggleMute}
                      className="flex w-full items-center justify-between rounded-lg p-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center gap-2">
                        {isMuted ? <VolumeX className="h-4 w-4 text-slate-400" /> : <Volume2 className="h-4 w-4 text-slate-400" />}
                        <span>{isMuted ? 'Unmute channel' : 'Mute channel'}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{isMuted ? 'Notifications muted' : 'Silence alerts'}</span>
                    </button>
                    {details.isMember && (
                      <button
                        onClick={handleLeaveClick}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 p-2.5 text-xs font-bold text-white hover:bg-red-700 transition shadow-sm"
                      >
                        <LogOut className="h-4 w-4" />
                        Leave channel
                      </button>
                    )}
                    {details.canManageMembers && (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2 text-xs font-bold text-red-700 hover:bg-red-100 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete channel
                      </button>
                    )}
                  </section>
                </>
              )}

              {error && !loading && details && (
                <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</div>
              )}
            </div>
          </div>
        </div>
      </Portal>

      {/* Edit Modal */}
      {showEditModal && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
            <form onSubmit={handleUpdateGroup} className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-950">Edit Channel</h3>
                <button type="button" onClick={() => setShowEditModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Channel Name</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 resize-none h-20"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editReadOnly}
                    onChange={(e) => setEditReadOnly(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span className="text-xs font-semibold text-slate-700">Read only channel (only admins can post)</span>
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={updatingGroup} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {updatingGroup ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </Portal>
      )}

      {/* Remove Member Confirmation */}
      <ConfirmDialog
        open={!!memberToRemove}
        title="Remove member?"
        description={
          memberToRemove
            ? `Remove ${memberToRemove.displayName} from #${channelName}? They will lose access to this channel.`
            : undefined
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        loading={!!removingId}
        onConfirm={() => {
          if (memberToRemove) void handleRemoveMember(memberToRemove.userId);
        }}
        onCancel={() => setMemberToRemove(null)}
      />

      {/* Delete Channel Confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Channel?"
        description={`Are you sure you want to permanently delete #${channelName}? All messages, files, and member history will be erased.`}
        confirmLabel="Delete Permanently"
        cancelLabel="Cancel"
        variant="danger"
        loading={deletingGroup}
        onConfirm={() => void handleDeleteGroup()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}

