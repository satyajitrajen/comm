import React, { useState, useEffect } from 'react';
import {
  Home as HomeIcon,
  Users,
  MessageSquare,
  PhoneCall,
  Bell,
  Megaphone,
  CalendarDays,
  Files,
  AppWindow,
  Settings,
  Hash,
  Lock,
  Plus,
  ChevronDown,
  UserPlus,
  Sparkles,
  Check,
  X,
  UserCircle2,
  KeyRound,
  LogOut,
} from 'lucide-react';
import { useAppStore, ActiveTabMode } from '../store/useAppStore';

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    userStatus,
    setUserStatus,
    teams,
    activeTeam,
    setActiveTeam,
    channels,
    activeChannel,
    setActiveChannel,
    directMessages,
    activeDM,
    setActiveDM,
    addChannel,
  } = useAppStore();

  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamIcon, setNewTeamIcon] = useState('💬');
  const [newTeamDesc, setNewTeamDesc] = useState('');

  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showInviteToast, setShowInviteToast] = useState(false);

  useEffect(() => {
    const handleClick = () => {
      setShowTeamDropdown(false);
      setShowStatusMenu(false);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleStatusChange = (status: 'online' | 'away' | 'dnd') => {
    setUserStatus(status);
    if (window.electronAPI) {
      window.electronAPI.setTrayStatus(status);
    }
  };

  const handleCreateTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    const createdTeam = {
      id: `team_${Date.now()}`,
      name: newTeamName.trim(),
      icon: newTeamIcon || '🚀',
      description: newTeamDesc.trim() || 'New team workspace',
    };

    useAppStore.setState((state) => ({
      teams: [...state.teams, createdTeam],
      activeTeam: createdTeam,
    }));

    setNewTeamName('');
    setNewTeamIcon('💬');
    setNewTeamDesc('');
    setShowAddTeamModal(false);
    setShowTeamDropdown(false);
  };

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    const channel = {
      id: `ch_${Date.now()}`,
      teamId: activeTeam?.id || 'team_core',
      name: newChannelName.trim().toLowerCase().replace(/\s+/g, '-'),
      isPrivate,
      topic: 'New discussion channel',
      unreadCount: 0,
    };

    addChannel(channel);
    setActiveChannel(channel);
    setNewChannelName('');
    setShowAddChannel(false);
  };

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(`https://comm.internal/join/${activeTeam?.id || 'team_core'}`);
    setShowInviteToast(true);
    setTimeout(() => setShowInviteToast(false), 2000);
    setShowTeamDropdown(false);
  };

  const isChatTab = activeTab === 'channels' || activeTab === 'dms' || activeTab === 'teams';

  // Navigation Items exactly matching web app AppShell.tsx
  const navItems: { id: ActiveTabMode; label: string; icon: React.ElementType }[] = [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'teams', label: 'Teams', icon: Users },
    { id: 'dms', label: 'Chat', icon: MessageSquare },
    { id: 'calls', label: 'Calls', icon: PhoneCall },
    { id: 'activity', label: 'Activity', icon: Bell },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'files', label: 'Files', icon: Files },
    { id: 'people', label: 'People', icon: Users },
    { id: 'apps', label: 'Apps', icon: AppWindow },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-full select-none border-r border-slate-200 bg-white relative">
      {/* ------------------------------------------------------------- */}
      {/* PRIMARY SIDEBAR NAVIGATION PANEL (MATCHING WEB APP) */}
      {/* ------------------------------------------------------------- */}
      <div className="w-[200px] bg-white flex flex-col h-full border-r border-slate-200 shrink-0">
        
        {/* Workspace Brand Header */}
        <div className="h-14 px-4 border-b border-slate-100 flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
            T
          </div>
          <div className="min-w-0">
            <span className="font-bold text-slate-900 text-sm block leading-tight truncate">TeamTime</span>
            <span className="text-[10px] text-slate-400 font-medium block truncate">Workspace</span>
          </div>
        </div>

        {/* 11 Sidebar Options list matching web frontend */}
        <nav className="flex-1 space-y-0.5 p-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              activeTab === item.id ||
              (item.id === 'teams' && activeTab === 'channels') ||
              (item.id === 'dms' && activeTab === 'dms');

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'teams') {
                    setActiveTab('channels');
                    if (channels.length > 0 && !activeChannel) setActiveChannel(channels[0]);
                  } else if (item.id === 'dms') {
                    setActiveTab('dms');
                    if (directMessages.length > 0 && !activeDM) setActiveDM(directMessages[0]);
                  } else {
                    setActiveTab(item.id);
                  }
                }}
                className={`relative flex w-full items-center space-x-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  active
                    ? 'bg-blue-50 text-blue-600 font-bold shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-blue-600 rounded-r-full" />
                )}
                <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom User Card */}
        <div className="p-3 border-t border-slate-100 relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowStatusMenu(!showStatusMenu);
            }}
            className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={currentUser?.avatarUrl}
                  alt={currentUser?.name}
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200"
                />
                <span
                  className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                    userStatus === 'online' ? 'bg-emerald-500' : userStatus === 'away' ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                />
              </div>
              <div className="text-left min-w-0">
                <span className="font-bold text-xs text-slate-900 truncate block">{currentUser?.name}</span>
                <span className="text-[10px] text-slate-400 capitalize block truncate">{userStatus}</span>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECONDARY CONTEXTUAL PANEL (FOR CHANNELS / DMs) */}
      {/* ------------------------------------------------------------- */}
      {isChatTab && (
        <aside className="w-56 flex flex-col h-full bg-slate-50 border-r border-slate-200">
          
          {/* Header ONLY for Channels / Teams Mode */}
          {activeTab === 'channels' || activeTab === 'teams' ? (
            <div className="p-3 border-b border-slate-200 bg-white relative shadow-2xs">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTeamDropdown(!showTeamDropdown);
                }}
                className="w-full flex items-center justify-between p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="text-base">{activeTeam?.icon || '⚡'}</span>
                  <div className="text-left min-w-0">
                    <h2 className="text-xs font-bold text-slate-900 truncate">{activeTeam?.name || 'Comm Engineering'}</h2>
                    <span className="text-[10px] text-slate-500 font-medium block truncate">
                      {activeTeam?.description || 'Core Workspace'}
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {/* Workspace Dropdown Menu */}
              {showTeamDropdown && (
                <div
                  className="absolute top-14 left-3 right-3 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 text-xs text-slate-800 space-y-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Switch Workspace Team
                  </div>
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setActiveTeam(t);
                        setShowTeamDropdown(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                        activeTeam?.id === t.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span>{t.icon}</span>
                        <span className="truncate">{t.name}</span>
                      </div>
                      {activeTeam?.id === t.id && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                    </button>
                  ))}

                  <div className="pt-1 border-t border-slate-100 space-y-0.5">
                    <button
                      onClick={() => {
                        setShowAddTeamModal(true);
                        setShowTeamDropdown(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 flex items-center space-x-2 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Create New Workspace</span>
                    </button>
                    <button
                      onClick={handleCopyInviteLink}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 flex items-center space-x-2 font-medium"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Invite Team Members</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Header ONLY for Direct Messages Mode */
            <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between shadow-2xs">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <h2 className="text-xs font-bold text-slate-900">Direct Messages</h2>
              </div>
              <button
                onClick={() => setActiveTab('people')}
                className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                title="Find People to DM"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* List Content strictly contextual */}
          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {activeTab === 'dms' ? (
              /* ONLY Direct Messages List */
              <div>
                <div className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  <span>Recent Conversations</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {directMessages.map((dm) => {
                    const isActive = activeDM?.id === dm.id;
                    return (
                      <button
                        key={dm.id}
                        onClick={() => setActiveDM(dm)}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 shadow-2xs'
                            : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <img src={dm.avatarUrl} alt={dm.name} className="w-6 h-6 rounded-full object-cover" />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-white ${
                                dm.status === 'online' ? 'bg-emerald-500' : dm.status === 'away' ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                            />
                          </div>
                          <div className="text-left truncate">
                            <span className="font-bold truncate block text-xs">{dm.name}</span>
                            <span className="text-[10px] text-slate-400 truncate block">Direct Message</span>
                          </div>
                        </div>
                        {dm.unreadCount && dm.unreadCount > 0 ? (
                          <span className="px-1.5 py-0.2 bg-indigo-600 text-white text-[10px] font-bold rounded-full">
                            {dm.unreadCount}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ONLY Team Channels List */
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  <span>Channels</span>
                  <button
                    onClick={() => setShowAddChannel(!showAddChannel)}
                    className="text-slate-400 hover:text-slate-900 transition-colors"
                    title="Create Channel"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Inline Channel Creation Form */}
                {showAddChannel && (
                  <form onSubmit={handleCreateChannel} className="p-2 my-1 bg-white border border-slate-200 rounded-lg space-y-2 shadow-xs">
                    <input
                      type="text"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      placeholder="channel-name"
                      className="w-full text-xs px-2 py-1 bg-slate-100 border border-slate-200 rounded text-slate-900 focus:outline-none"
                      autoFocus
                    />
                    <div className="flex items-center justify-between text-[11px]">
                      <label className="flex items-center space-x-1 cursor-pointer text-slate-600">
                        <input
                          type="checkbox"
                          checked={isPrivate}
                          onChange={(e) => setIsPrivate(e.target.checked)}
                          className="accent-indigo-600"
                        />
                        <span>Private</span>
                      </label>
                      <button type="submit" className="px-2.5 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold">
                        Create
                      </button>
                    </div>
                  </form>
                )}

                <div className="mt-1 space-y-0.5">
                  {channels.map((ch) => {
                    const isActive = activeChannel?.id === ch.id;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => setActiveChannel(ch)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 shadow-2xs'
                            : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          {ch.isPrivate ? (
                            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                          <span className="truncate text-xs">{ch.name}</span>
                        </div>
                        {ch.unreadCount && ch.unreadCount > 0 ? (
                          <span className="px-1.5 py-0.2 bg-indigo-600 text-white text-[10px] font-bold rounded-full">
                            {ch.unreadCount}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* User Status Selector Menu */}
      {showStatusMenu && (
        <div className="fixed bottom-16 left-4 z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 text-xs text-slate-800 space-y-0.5">
          <div className="px-2 py-1 font-bold text-slate-400 text-[10px] uppercase tracking-wider">
            Set Presence Status
          </div>
          <button
            onClick={() => handleStatusChange('online')}
            className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center space-x-2 font-medium ${
              userStatus === 'online' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>🟢 Online</span>
          </button>
          <button
            onClick={() => handleStatusChange('away')}
            className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center space-x-2 font-medium ${
              userStatus === 'away' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>🟡 Away</span>
          </button>
          <button
            onClick={() => handleStatusChange('dnd')}
            className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center space-x-2 font-medium ${
              userStatus === 'dnd' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>🔴 Do Not Disturb</span>
          </button>
          <div className="border-t border-slate-100 pt-1 mt-1 space-y-0.5">
            <button
              onClick={() => {
                setShowStatusMenu(false);
                setActiveTab('settings');
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 flex items-center space-x-2 font-medium text-slate-700"
            >
              <UserCircle2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Edit Profile</span>
            </button>
            <button
              onClick={() => {
                setShowStatusMenu(false);
                useAppStore.getState().logout();
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 flex items-center space-x-2 font-bold transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-500" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {showAddTeamModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Create New Team Workspace</h3>
              </div>
              <button
                onClick={() => setShowAddTeamModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTeamSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Team Icon / Emoji
                </label>
                <div className="flex items-center space-x-2">
                  {['💬', '🚀', '⚡', '🎨', '🔥', '⚙️', '🌐'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewTeamIcon(emoji)}
                      className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border transition-all ${
                        newTeamIcon === emoji
                          ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/30'
                          : 'border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Team Name
                </label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Frontend Engineers"
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="What is this team working on?"
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTeamModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-xs transition-colors"
                >
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy Invite Link Toast */}
      {showInviteToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-2 animate-bounce">
          <Check className="w-4 h-4" />
          <span>Team Invite Link copied to clipboard!</span>
        </div>
      )}
    </div>
  );
};
