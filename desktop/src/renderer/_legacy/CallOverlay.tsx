import React from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, PhoneCall, Check, Monitor, MonitorOff } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const CallOverlay: React.FC = () => {
  const { callState, acceptCall, declineCall, endCall, toggleMute, toggleVideo, toggleScreenShare } = useAppStore();

  if (!callState.isCallActive) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      {callState.isIncoming ? (
        /* Incoming Call Banner Modal */
        <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center flex flex-col items-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-indigo-50 border-2 border-indigo-500 flex items-center justify-center animate-bounce">
            <PhoneCall className="w-10 h-10 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{callState.callerName || 'Incoming Call'}</h3>
            <p className="text-xs text-slate-500 mt-1">
              Incoming {callState.callType === 'video' ? 'Video' : 'Audio'} Call...
            </p>
          </div>
          <div className="flex items-center justify-center space-x-6 pt-2">
            <button
              onClick={declineCall}
              className="w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105"
              title="Decline"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
            <button
              onClick={acceptCall}
              className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105"
              title="Accept"
            >
              <Check className="w-6 h-6" />
            </button>
          </div>
        </div>
      ) : (
        /* Active WebRTC Call View */
        <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl h-[520px] flex flex-col overflow-hidden shadow-2xl">
          {/* Active Call Header */}
          <div className="h-12 px-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <span className="text-xs font-bold text-slate-900">
              {callState.callType === 'video' ? '📹 Video Meeting' : '🎙️ Voice Call'} with {callState.callerName}
            </span>
            <span className="text-xs font-mono font-bold text-emerald-600">00:04:12</span>
          </div>

          {/* Media Viewport */}
          <div className="flex-1 bg-slate-100 relative flex items-center justify-center p-4">
            {callState.isScreenSharing ? (
              <div className="w-full h-full bg-white rounded-xl border border-indigo-300 flex flex-col items-center justify-center text-center p-6 shadow-inner">
                <Monitor className="w-16 h-16 text-indigo-600 mb-3 animate-pulse" />
                <h4 className="text-sm font-bold text-slate-900">Screen Sharing Active</h4>
                <p className="text-xs text-slate-500 max-w-md mt-1">Sharing primary monitor workspace with call participants.</p>
              </div>
            ) : callState.isVideoOff ? (
              <div className="flex flex-col items-center space-y-3">
                <div className="w-24 h-24 rounded-full bg-indigo-600 flex items-center justify-center text-2xl font-bold text-white shadow-md">
                  {callState.callerName?.slice(0, 2).toUpperCase() || 'CM'}
                </div>
                <span className="text-sm font-semibold text-slate-800">{callState.callerName}</span>
                <span className="text-xs text-slate-500">Camera turned off</span>
              </div>
            ) : (
              <div className="w-full h-full bg-white rounded-xl border border-slate-200 flex items-center justify-center relative overflow-hidden shadow-inner">
                <div className="text-center text-slate-600">
                  <Video className="w-12 h-12 mx-auto mb-2 text-indigo-600 animate-pulse" />
                  <p className="text-xs font-semibold text-slate-800">WebRTC HD Stream Active</p>
                </div>
                {/* Local Camera PiP */}
                <div className="absolute bottom-4 right-4 w-36 h-24 bg-slate-100 border border-slate-300 rounded-lg flex items-center justify-center shadow-lg">
                  <span className="text-[10px] text-slate-700 font-bold">You (Local HD)</span>
                </div>
              </div>
            )}
          </div>

          {/* Call Controls Footer */}
          <div className="h-16 border-t border-slate-200 bg-slate-50 flex items-center justify-center space-x-4">
            <button
              onClick={toggleMute}
              className={`p-3 rounded-full transition-colors shadow-xs ${
                callState.isMuted
                  ? 'bg-rose-600 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
              title={callState.isMuted ? 'Unmute Mic' : 'Mute Mic'}
            >
              {callState.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full transition-colors shadow-xs ${
                callState.isVideoOff
                  ? 'bg-rose-600 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
              title={callState.isVideoOff ? 'Turn On Camera' : 'Turn Off Camera'}
            >
              {callState.isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleScreenShare}
              className={`p-3 rounded-full transition-colors shadow-xs ${
                callState.isScreenSharing
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
              title={callState.isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
            >
              {callState.isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </button>

            <button
              onClick={endCall}
              className="p-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white transition-transform hover:scale-105 shadow-md"
              title="End Call"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
