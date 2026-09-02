'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Megaphone, Pin, RefreshCw, Send, Users } from 'lucide-react';
import { chatsAPI, messagesAPI } from '../../../services/api';
import { getChatsFeedCached } from '../../../lib/chatsFeedCache';
import { avatarAccent, initials, timeAgo } from '../_utils';
import { spaceTypeLabel } from '../../../lib/enumLabels';

type AnnouncementSpace = {
  conversationId: string;
  type: string;
  name?: string;
  group?: {
    name?: string | null;
    description?: string | null;
    spaceType?: string | null;
    isReadOnly?: boolean | null;
  } | null;
};

type BackendMessage = {
  id: string;
  content?: string | null;
  createdAt: string;
  sender?: { profile?: { displayName?: string | null } | null } | null;
  reactions?: Array<{ emoji: string }>;
};

function reactionCounts(reactions?: Array<{ emoji: string }>) {
  return Object.entries(
    (reactions || []).reduce<Record<string, number>>((counts, reaction) => {
      counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
      return counts;
    }, {}),
  );
}

export default function AnnouncementsPage() {
  const [spaces, setSpaces] = useState<AnnouncementSpace[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messagesBySpace, setMessagesBySpace] = useState<Record<string, BackendMessage[]>>({});
  const [composer, setComposer] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    workspaceRole?: string | null;
    canPostAnnouncements?: boolean;
    capabilities?: { postAnnouncements?: boolean } | null;
    announcementPublisherConversationIds?: string[];
  } | null>(null);

  async function loadAnnouncements() {
    setLoading(true);
    setError('');
    try {
      const feed = await getChatsFeedCached();
      const announcementSpaces = feed.filter(
        (chat) =>
          ['BROADCAST'].includes(chat.type || '') ||
          ['ORG_FEED', 'ANNOUNCEMENT', 'LEADERSHIP'].includes(chat.group?.spaceType || ''),
      ) as AnnouncementSpace[];
      setSpaces(announcementSpaces);
      const selected = selectedId && announcementSpaces.some((space: AnnouncementSpace) => space.conversationId === selectedId)
        ? selectedId
        : announcementSpaces[0]?.conversationId || '';
      setSelectedId(selected);
    } catch {
      setError('Announcements could not be loaded.');
      setSpaces([]);
      setMessagesBySpace({});
    } finally {
      setLoading(false);
    }
  }

  async function loadSpaceHistory(conversationId: string) {
    if (!conversationId) return;
    try {
      const history = await chatsAPI.getHistory(conversationId);
      setMessagesBySpace((current) => ({
        ...current,
        [conversationId]: Array.isArray(history?.messages)
          ? (history.messages as BackendMessage[])
          : [],
      }));
    } catch {
      setMessagesBySpace((current) => ({
        ...current,
        [conversationId]: [],
      }));
    }
  }

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('veloce_user');
      if (userStr) setCurrentUser(JSON.parse(userStr));
    } catch {}

    const timer = window.setTimeout(() => {
      loadAnnouncements();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) {
      void loadSpaceHistory(selectedId);
    }
  }, [selectedId]);
  const selectedSpace = spaces.find((space) => space.conversationId === selectedId) || null;
  const selectedMessages = useMemo(
    () => [...(messagesBySpace[selectedId] || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [messagesBySpace, selectedId],
  );

  const canPostInSelectedSpace =
    !!selectedSpace &&
    !!currentUser &&
    (['ADMIN', 'OWNER'].includes(currentUser.workspaceRole || '') ||
      !!currentUser.canPostAnnouncements ||
      !!currentUser.capabilities?.postAnnouncements ||
      (Array.isArray(currentUser.announcementPublisherConversationIds) &&
        currentUser.announcementPublisherConversationIds.includes(selectedId)));

  async function sendAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSpace || !composer.trim() || !canPostInSelectedSpace) return;
    setSending(true);
    setError('');
    try {
      const message = await messagesAPI.send({
        conversationId: selectedSpace.conversationId,
        content: composer.trim(),
        messageType: 'BROADCAST',
        priority: 'IMPORTANT',
      });
      setMessagesBySpace((current) => ({
        ...current,
        [selectedSpace.conversationId]: [...(current[selectedSpace.conversationId] || []), message],
      }));
      setComposer('');
    } catch {
      setError('Announcement could not be posted.');
    } finally {
      setSending(false);
    }
  }

  async function addReaction(message: BackendMessage, emoji: string) {
    setError('');
    try {
      await messagesAPI.react(message.id, emoji);
      await loadAnnouncements();
    } catch {
      setError('Reaction could not be saved.');
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <Megaphone className="h-5 w-5 text-blue-700" />
          <h1 className="text-lg font-bold text-slate-950">Announcements</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{spaces.length}</span>
        </div>
        <button
          onClick={loadAnnouncements}
          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          title="Refresh announcements"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
            <Users className="h-4 w-4" />
            Spaces
          </div>
          {loading ? (
            <div className="text-sm text-slate-500">Loading spaces...</div>
          ) : spaces.length === 0 ? (
            <div className="text-sm text-slate-500">No announcement spaces returned.</div>
          ) : (
            <div className="space-y-1">
              {spaces.map((space) => (
                <button
                  key={space.conversationId}
                  onClick={() => setSelectedId(space.conversationId)}
                  className={`w-full rounded-lg px-3 py-2 text-left ${
                    selectedId === space.conversationId ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-semibold">{space.group?.name || space.name || 'Announcement space'}</div>
                  <div className="text-xs text-slate-400">{spaceTypeLabel(space.group?.spaceType || space.type)}</div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-slate-200 bg-white px-6 py-4">
            <div className="text-base font-bold text-slate-950">{selectedSpace?.group?.name || 'Announcements'}</div>
            <div className="mt-1 text-sm text-slate-500">{selectedSpace?.group?.description || 'Announcement history'}</div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span>{error}</span>
                <button onClick={loadAnnouncements} className="font-semibold hover:text-red-900">
                  Retry
                </button>
              </div>
            )}

            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading announcements...</div>
            ) : !selectedSpace ? (
              <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
                <Megaphone className="h-10 w-10 text-slate-300" />
                <p className="text-sm">No announcement space selected.</p>
              </div>
            ) : selectedMessages.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
                <Megaphone className="h-10 w-10 text-slate-300" />
                <p className="text-sm">No announcements in this space yet.</p>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-3">
                {selectedMessages.map((message, index) => {
                  const author = message.sender?.profile?.displayName || 'Workspace';
                  const pinned = index === 0 && !!selectedSpace.group?.isReadOnly;
                  return (
                    <article
                      key={message.id}
                      className={`rounded-xl border bg-white p-5 ${pinned ? 'border-blue-200 shadow-sm' : 'border-slate-200'}`}
                    >
                      {pinned && (
                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-blue-700">
                          <Pin className="h-3.5 w-3.5" />
                          Pinned
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarAccent(author)}`}>
                          {initials(author)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 text-sm">
                            <span className="font-semibold text-slate-950">{author}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                              {spaceTypeLabel(selectedSpace.group?.spaceType) || 'Broadcast'}
                            </span>
                            <span className="text-xs text-slate-400">{timeAgo(message.createdAt)}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{message.content || 'No content'}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {reactionCounts(message.reactions).map(([emoji, count]) => (
                              <button
                                key={emoji}
                                onClick={() => addReaction(message, emoji)}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                {emoji} {count}
                              </button>
                            ))}
                            <button
                              onClick={() => addReaction(message, '👍')}
                              className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              👍
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {selectedSpace && canPostInSelectedSpace && (
            <form onSubmit={sendAnnouncement} className="border-t border-slate-200 bg-white p-4">
              <div className="mx-auto flex max-w-3xl items-end gap-3">
                <textarea
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  className="max-h-32 min-h-12 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  placeholder="Post an organization update..."
                  required
                />
                <button
                  type="submit"
                  disabled={sending || !composer.trim()}
                  className="flex h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  Post
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
