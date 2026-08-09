export type CallConversationType = 'DIRECT' | 'TEAM' | 'GROUP';

/** Canonical Jitsi room name for a conversation's video calls. */
export function callRoomName(conversationId: string): string {
  return `veloce-call-${conversationId}`;
}
