import React, { useEffect, useState, useMemo, FormEvent } from 'react';
import { Megaphone, Pin, RefreshCw, Send, Users, ThumbsUp, Heart } from 'lucide-react';
import { chatsAPI, messagesAPI } from '../api/api';
import { avatarAccent, initials, timeAgo } from '../utils/utils';

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

export const AnnouncementsView: React.FC = () => {
  const [spaces, setSpaces] = useState<AnnouncementSpace[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messagesBySpace, setMessagesBySpace] = useState<Record<string, BackendMessage[]>>({});
  const [composer, setComposer] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const loadAnnouncements = async () => {
    setLoading(true);
    setError('');
    try {
      const feed = await chatsAPI.getFeed();
      const items = Array.isArray(feed) ? feed : [];
      const announcementSpaces = items.filter(
        (chat: any) =>
          ['BROADCAST'].includes(chat.type || '') ||
          ['ORG_FEED', 'ANNOUNCEMENT', 'LEADERSHIP'].includes(chat.group?.spaceType || ''),
      ) as AnnouncementSpace[];

      setSpaces(announcementSpaces);
      if (announcementSpaces.length > 0 && !selectedId) {
        setSelectedId(announcementSpaces[0].conversationId);
      }
    } catch (err) {
      console.warn('Failed to load announcement spaces:', err);
      setError('Announcements could not be loaded.');
      setSpaces([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSpaceHistory = async (conversationId: string) => {
    if (!conversationId) return;
    try {
      const history = await chatsAPI.getHistory(conversationId);
      if (history && Array.isArray(history.messages)) {
        setMessagesBySpace((curr) => ({
          ...curr,
          [conversationId]: history.messages,
        }));
      }
    } catch (err) {
      console.warn('Failed to load space history:', err);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadSpaceHistory(selectedId);
    }
  }, [selectedId]);

  const selectedSpace = spaces.find((s) => s.conversationId === selectedId) || null;
  const selectedMessages = useMemo(
    () => [...(messagesBySpace[selectedId] || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [messagesBySpace, selectedId],
  );

  const sendAnnouncement = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSpace || !composer.trim()) return;
    setSending(true);
    setError('');
    try {
      const msg = await messagesAPI.send({
        conversationId: selectedSpace.conversationId,
        content: composer.trim(),
        messageType: 'BROADCAST',
      });
      setMessagesBySpace((curr) => ({
        ...curr,
        [selectedSpace.conversationId]: [msg, ...(curr[selectedSpace.conversationId] || [])],
      }));
      setComposer('');
    } catch {
      setError('Announcement could not be posted.');
    } finally {
      setSending(false);
    }
  };

  const addReaction = async (message: BackendMessage, emoji: string) => {
    try {
      await messagesAPI.react(message.id, emoji);
      await loadSpaceHistory(selectedId);
    } catch {
      setError('Reaction could not be saved.');
    }
  };

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-slate-50 select-none">
      {/* Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <Megaphone className="h-5 w-5 text-indigo-600" />
          <h1 className="text-base font-bold text-slate-900">Announcements</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{spaces.length}</span>
        </div>
        <button
          onClick={loadAnnouncements}
          disabled={loading}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          title="Refresh announcements"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Workspace Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left Spaces Sidebar */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Users className="h-4 w-4" />
            <span>Announcement Spaces</span>
          </div>
          {loading ? (
            <div className="text-xs text-slate-500">Loading spaces...</div>
          ) : spaces.length === 0 ? (
            <div className="text-xs text-slate-400 italic">No broadcast spaces found.</div>
          ) : (
            <div className="space-y-1">
              {spaces.map((space) => (
                <button
                  key={space.conversationId}
                  onClick={() => setSelectedId(space.conversationId)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                    selectedId === space.conversationId ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold truncate">{space.group?.name || space.name || 'Broadcast Channel'}</div>
                  <div className="text-[10px] text-slate-400 capitalize">{space.group?.spaceType || space.type}</div>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Right Main Stream */}
        <main className="flex flex-1 flex-col min-w-0 bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-6 py-3">
            <div className="text-sm font-bold text-slate-900">{selectedSpace?.group?.name || selectedSpace?.name || 'Company Feed'}</div>
            <div className="text-xs text-slate-500">{selectedSpace?.group?.description || 'Broadcast updates & news'}</div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 font-semibold">
                <span>{error}</span>
                <button onClick={loadAnnouncements} className="hover:underline">
                  Retry
                </button>
              </div>
            )}

            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading stream...</div>
            ) : !selectedSpace ? (
              <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
                <Megaphone className="h-10 w-10 text-slate-300" />
                <p className="text-xs font-semibold">Select an announcement space to view posts.</p>
              </div>
            ) : selectedMessages.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
                <Megaphone className="h-10 w-10 text-slate-300" />
                <p className="text-xs font-semibold">No announcements posted in this space yet.</p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-3">
                {selectedMessages.map((message, index) => {
                  const author = message.sender?.profile?.displayName || 'Workspace Broadcast';
                  const pinned = index === 0;
                  return (
                    <article
                      key={message.id}
                      className={`rounded-xl border bg-white p-5 shadow-2xs ${pinned ? 'border-indigo-300 ring-1 ring-indigo-500/10' : 'border-slate-200'}`}
                    >
                      {pinned && (
                        <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold text-indigo-600">
                          <Pin className="h-3.5 w-3.5" />
                          <span>Pinned Announcement</span>
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarAccent(author)}`}>
                          {initials(author)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 text-xs">
                            <span className="font-bold text-slate-900">{author}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-500">
                              {selectedSpace.group?.spaceType || 'Broadcast'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">{timeAgo(message.createdAt)}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">{message.content || 'No text content'}</p>
                          
                          {/* Reaction Pills */}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {reactionCounts(message.reactions).map(([emoji, count]) => (
                              <button
                                key={emoji}
                                onClick={() => addReaction(message, emoji)}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                              >
                                {emoji} {count}
                              </button>
                            ))}
                            <button
                              onClick={() => addReaction(message, '👍')}
                              className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                              👍
                            </button>
                            <button
                              onClick={() => addReaction(message, '❤️')}
                              className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                              ❤️
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

          {/* Composer Form */}
          {selectedSpace && (
            <form onSubmit={sendAnnouncement} className="border-t border-slate-200 bg-white p-4">
              <div className="max-w-3xl mx-auto flex items-end gap-3">
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-slate-200 p-2.5 text-xs outline-none focus:border-indigo-500"
                  placeholder="Post an official broadcast update..."
                  required
                />
                <button
                  type="submit"
                  disabled={sending || !composer.trim()}
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-xs"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Post</span>
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
};
