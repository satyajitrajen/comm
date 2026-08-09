export function timeAgo(dateString?: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function formatFileSize(bytes?: number | string | null): string {
  if (bytes === undefined || bytes === null) return '0 B';
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(num) || num <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  return `${(num / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function initials(name?: string | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarAccent(id?: string | null): string {
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-indigo-100 text-indigo-700',
    'bg-violet-100 text-violet-700',
    'bg-purple-100 text-purple-700',
    'bg-pink-100 text-pink-700',
    'bg-emerald-100 text-emerald-700',
  ];
  if (!id) return colors[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export type HasStatus = {
  presence?: string | null;
  availability?: string | null;
};

export function isOnlineUser(item?: HasStatus | string | null): boolean {
  if (!item) return false;
  if (typeof item === 'string') {
    return item.toUpperCase() === 'ONLINE' || item.toUpperCase() === 'AVAILABLE';
  }
  return item.presence === 'ONLINE' || item.presence === 'online';
}

export function statusDotClass(item?: HasStatus | string | null): string {
  if (!item) return 'bg-slate-300';
  if (typeof item === 'object') {
    if (item.availability === 'AWAY') return 'bg-amber-500';
    if (item.availability === 'DND') return 'bg-rose-500';
    if (item.availability === 'OUT_OF_OFFICE') return 'bg-purple-500';
    if (item.presence === 'ONLINE' || item.presence === 'online') return 'bg-emerald-500';
    return 'bg-slate-300';
  }
  if (item === 'away' || item === 'AWAY') return 'bg-amber-500';
  if (item === 'dnd' || item === 'DND' || item === 'BUSY') return 'bg-rose-500';
  if (item === 'online' || item === 'ONLINE') return 'bg-emerald-500';
  return 'bg-slate-300';
}

export function statusLabel(item?: HasStatus | string | null): string {
  if (!item) return 'Offline';
  if (typeof item === 'object') {
    if (item.availability === 'AWAY') return 'Away';
    if (item.availability === 'DND') return 'Do Not Disturb';
    if (item.availability === 'OUT_OF_OFFICE') return 'Out of Office';
    if (item.presence === 'ONLINE' || item.presence === 'online') return 'Online';
    return 'Offline';
  }
  if (item === 'away' || item === 'AWAY') return 'Away';
  if (item === 'dnd' || item === 'DND' || item === 'BUSY') return 'Do Not Disturb';
  if (item === 'online' || item === 'ONLINE') return 'Online';
  return 'Offline';
}
