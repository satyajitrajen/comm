const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  MEMBER: 'Member',
};

const SPACE_TYPE_LABELS: Record<string, string> = {
  LEADERSHIP: 'Leadership',
  ORG_FEED: 'Org feed',
  ANNOUNCEMENT: 'Announcement',
  BROADCAST: 'Broadcast',
  GENERAL: 'General',
};

const CALENDAR_STATUS_LABELS: Record<string, string> = {
  EVENT: 'Event',
  TASK: 'Task',
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In progress',
  PENDING: 'Pending',
  OVERDUE: 'Overdue',
  URGENT: 'Urgent',
  IMPORTANT: 'Important',
  NORMAL: 'Normal',
};

export function roleLabel(value?: string | null): string {
  if (!value) return 'Member';
  return ROLE_LABELS[value] ?? value;
}

export function spaceTypeLabel(value?: string | null): string {
  if (!value) return '';
  return SPACE_TYPE_LABELS[value] ?? value;
}

export function calendarStatusLabel(value?: string | null): string {
  if (!value) return '';
  return CALENDAR_STATUS_LABELS[value] ?? value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
