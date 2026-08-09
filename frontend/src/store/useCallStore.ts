import { create } from 'zustand';
import { clampPipPosition, defaultPipPosition, type PipPosition } from '../lib/pipPosition';

export type CallView = 'fullscreen' | 'pip';

export type ActiveCall = {
  conversationId: string;
  roomName: string;
  conversationName: string;
  view: CallView;
  pipPosition: PipPosition;
};

export type OutgoingCall = {
  conversationId: string;
  roomName: string;
  conversationName: string;
  callerName: string;
};

type CallSignalingActions = {
  inviteToCall: (
    conversationId: string,
    roomName: string,
    callerName: string,
    conversationName: string,
  ) => void;
  acceptCall?: (
    conversationId: string,
    callerId: string,
    roomName: string,
    conversationName: string,
  ) => void;
  endCall: (conversationId: string, roomName?: string) => void;
  declineCall: (conversationId: string, callerId: string) => void;
  cancelCall?: (
    conversationId: string,
    roomName: string,
    callerName: string,
  ) => void;
  joinCall?: (
    conversationId: string,
    roomName: string,
    conversationName: string,
  ) => void;
};

type CallStore = {
  activeCall: ActiveCall | null;
  outgoingCall: OutgoingCall | null;
  callNotice: string | null;
  signaling: CallSignalingActions | null;
  registerSignaling: (actions: CallSignalingActions) => void;
  startCall: (call: Omit<ActiveCall, 'view' | 'pipPosition'> & { view?: CallView }) => void;
  startOutgoingCall: (
    conversationId: string,
    roomName: string,
    conversationName: string,
    callerName: string,
  ) => void;
  cancelOutgoingCall: () => void;
  clearOutgoingCall: () => void;
  joinCall: (
    conversationId: string,
    roomName: string,
    conversationName: string,
  ) => void;
  acceptIncomingCall: (
    conversationId: string,
    callerId: string,
    roomName: string,
    conversationName: string,
  ) => void;
  setCallNotice: (msg: string | null) => void;
  minimizeCall: () => void;
  expandCall: () => void;
  setPipPosition: (x: number, y: number) => void;
  endCall: () => void;
  inviteToCall: CallSignalingActions['inviteToCall'];
  declineCall: CallSignalingActions['declineCall'];
  signalEndCall: () => void;
};

export const useCallStore = create<CallStore>((set, get) => ({
  activeCall: null,
  outgoingCall: null,
  callNotice: null,
  signaling: null,

  registerSignaling: (actions) => set({ signaling: actions }),

  startCall: (call) =>
    set({
      outgoingCall: null,
      activeCall: {
        conversationId: call.conversationId,
        roomName: call.roomName,
        conversationName: call.conversationName,
        view: call.view ?? 'fullscreen',
        pipPosition: defaultPipPosition(),
      },
    }),

  startOutgoingCall: (conversationId, roomName, conversationName, callerName) => {
    set({
      outgoingCall: { conversationId, roomName, conversationName, callerName },
      callNotice: null,
    });
    get().signaling?.inviteToCall(conversationId, roomName, callerName, conversationName);
  },

  cancelOutgoingCall: () => {
    const call = get().outgoingCall;
    if (call) {
      get().signaling?.cancelCall?.(call.conversationId, call.roomName, call.callerName);
    }
    set({ outgoingCall: null });
  },

  clearOutgoingCall: () => {
    set({ outgoingCall: null });
  },

  joinCall: (conversationId, roomName, conversationName) => {
    get().signaling?.joinCall?.(conversationId, roomName, conversationName);
    get().startCall({ conversationId, roomName, conversationName });
  },

  acceptIncomingCall: (conversationId, callerId, roomName, conversationName) => {
    get().signaling?.acceptCall?.(conversationId, callerId, roomName, conversationName);
    get().startCall({ conversationId, roomName, conversationName });
  },

  setCallNotice: (msg) => set({ callNotice: msg }),

  minimizeCall: () => {
    const call = get().activeCall;
    if (!call) return;
    set({
      activeCall: {
        ...call,
        view: 'pip',
        pipPosition: call.pipPosition ?? defaultPipPosition(),
      },
    });
  },

  expandCall: () => {
    const call = get().activeCall;
    if (!call) return;
    set({ activeCall: { ...call, view: 'fullscreen' } });
  },

  setPipPosition: (x, y) => {
    const call = get().activeCall;
    if (!call) return;
    const clamped = clampPipPosition(x, y);
    set({
      activeCall: {
        ...call,
        pipPosition: clamped,
      },
    });
  },

  endCall: () => set({ activeCall: null, outgoingCall: null }),

  inviteToCall: (conversationId, roomName, callerName, conversationName) => {
    get().signaling?.inviteToCall(conversationId, roomName, callerName, conversationName);
  },

  declineCall: (conversationId, callerId) => {
    get().signaling?.declineCall(conversationId, callerId);
  },

  signalEndCall: () => {
    const call = get().activeCall;
    if (call) {
      get().signaling?.endCall(call.conversationId, call.roomName);
    }
    set({ activeCall: null, outgoingCall: null });
  },
}));
