import React, { useState, useRef, useEffect } from 'react';
import { Hash, Send, Paperclip, Smile, Phone, Video, Info, Lock, FileText, Image as ImageIcon, ThumbsUp, Heart } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Message, FileAttachment } from '../types';
import { chatsAPI, messagesAPI } from '../api/api';

export const ChatView: React.FC = () => {
  const {
    activeChannel,
    activeDM,
    channels,
    messages,
    currentUser,
    addMessage,
    addReaction,
    startCall,
    searchQuery,
  } = useAppStore();

  const [inputContent, setInputContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileAttachment | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetId = activeDM ? activeDM.id : activeChannel ? activeChannel.id : channels[0]?.id || '';
  const currentChannelObj = activeChannel || (activeDM ? null : channels[0]);
  const chatName = activeDM ? activeDM.name : currentChannelObj?.name || 'general';
  const isPrivate = activeDM ? true : currentChannelObj?.isPrivate;

  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      try {
        const data = await chatsAPI.getHistory(targetId);
        if (isMounted && data && Array.isArray(data.messages)) {
          const formattedMsgs: Message[] = data.messages.map((m: any) => ({
            id: m.id,
            channelId: targetId,
            senderId: m.sender?.id || m.senderId || 'usr_1',
            senderName: m.sender?.profile?.displayName || m.senderName || 'Member',
            senderAvatar: m.sender?.profile?.avatarUrl,
            content: m.content || '',
            timestamp: new Date(m.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }));
          useAppStore.getState().setMessages(targetId, formattedMsgs);
        }
      } catch (err) {
        console.warn(`Could not fetch message history for ${targetId} from API, using store messages:`, err);
      }
    };
    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [targetId]);

  const rawMessages: Message[] = messages[targetId] || [];

  const filteredMessages = rawMessages.filter((msg) =>
    searchQuery ? msg.content.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [rawMessages.length]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      const isImg = file.type.startsWith('image/');
      setSelectedFile({
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        url: URL.createObjectURL(file),
        type: isImg ? 'image' : 'document',
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputContent.trim() && !selectedFile) return;

    const contentText = inputContent.trim();
    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      channelId: targetId,
      senderId: currentUser?.id || 'usr_1',
      senderName: currentUser?.name || 'Alex Mercer',
      senderAvatar: currentUser?.avatarUrl,
      content: contentText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: selectedFile ? [selectedFile] : undefined,
    };

    addMessage(targetId, newMessage);
    setInputContent('');
    setSelectedFile(null);

    try {
      await messagesAPI.send({
        conversationId: targetId,
        content: contentText,
      });
      const data = await chatsAPI.getHistory(targetId);
      if (data && Array.isArray(data.messages)) {
        const formattedMsgs: Message[] = data.messages.map((m: any) => ({
          id: m.id,
          channelId: targetId,
          senderId: m.sender?.id || m.senderId || 'usr_1',
          senderName: m.sender?.profile?.displayName || m.senderName || 'Member',
          senderAvatar: m.sender?.profile?.avatarUrl,
          content: m.content || '',
          timestamp: new Date(m.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
        useAppStore.getState().setMessages(targetId, formattedMsgs);
      }
    } catch (err) {
      console.warn('API send failed:', err);
    }
  };

  const handleEmojiClick = async (messageId: string, emoji: string) => {
    addReaction(targetId, messageId, emoji, currentUser?.id || 'usr_1');
    try {
      await messagesAPI.react(messageId, emoji);
    } catch (err) {
      console.warn('API react failed:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50">
      {/* Light Chat View Header */}
      <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between bg-white shadow-2xs">
        <div className="flex items-center space-x-2.5">
          {activeDM ? (
            <img src={activeDM.avatarUrl} alt={activeDM.name} className="w-7 h-7 rounded-full object-cover ring-2 ring-indigo-500/30" />
          ) : isPrivate ? (
            <Lock className="w-5 h-5 text-indigo-600" />
          ) : (
            <Hash className="w-5 h-5 text-indigo-600" />
          )}
          <div>
            <h1 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <span>{chatName}</span>
            </h1>
            <p className="text-[11px] text-slate-500 truncate max-w-md">
              {activeDM ? `Direct messaging with ${activeDM.name}` : activeChannel?.topic}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => startCall(chatName, 'audio')}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="Start Voice Call"
          >
            <Phone className="w-4 h-4 text-emerald-600" />
          </button>
          <button
            onClick={() => startCall(chatName, 'video')}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="Start Video Call"
          >
            <Video className="w-4 h-4 text-indigo-600" />
          </button>
          <button
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="Details"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Light Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
            <Hash className="w-12 h-12 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">Welcome to #{chatName}</p>
            <p className="text-xs text-slate-400">Start of message history in this conversation.</p>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            return (
              <div key={msg.id} className="flex items-start space-x-3 group">
                <img
                  src={msg.senderAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                  alt={msg.senderName}
                  className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 ring-1 ring-slate-200"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline space-x-2">
                    <span className="text-xs font-bold text-slate-900">{msg.senderName}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{msg.timestamp}</span>
                  </div>

                  {/* Light Message Card */}
                  <div className="mt-1 text-xs text-slate-800 bg-white p-3 rounded-xl border border-slate-200 max-w-2xl leading-relaxed shadow-2xs">
                    {msg.content}

                    {/* Light Attachment Card */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {msg.attachments.map((att, idx) => (
                          <div
                            key={idx}
                            className="flex items-center space-x-2.5 p-2 bg-slate-100 border border-slate-200 rounded-lg text-xs"
                          >
                            {att.type === 'image' ? (
                              <ImageIcon className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <FileText className="w-4 h-4 text-indigo-600" />
                            )}
                            <div className="flex-1 truncate">
                              <p className="font-semibold text-slate-900 truncate">{att.name}</p>
                              <span className="text-[10px] text-slate-500">{att.size}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Emoji Reactions Bar */}
                  <div className="flex items-center space-x-1.5 mt-1.5">
                    {msg.reactions &&
                      Object.entries(msg.reactions).map(([emoji, users]) =>
                        users.length > 0 ? (
                          <button
                            key={emoji}
                            onClick={() => handleEmojiClick(msg.id, emoji)}
                            className="px-2 py-0.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded-full text-[11px] font-medium flex items-center space-x-1 transition-colors shadow-2xs"
                          >
                            <span>{emoji}</span>
                            <span className="text-slate-700 font-bold">{users.length}</span>
                          </button>
                        ) : null
                      )}
                    <button
                      onClick={() => handleEmojiClick(msg.id, '👍')}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 transition-opacity"
                      title="React 👍"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleEmojiClick(msg.id, '❤️')}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 transition-opacity"
                      title="React ❤️"
                    >
                      <Heart className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Selected File Banner Preview */}
      {selectedFile && (
        <div className="px-4 py-2 bg-indigo-50 border-t border-indigo-200 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span className="font-semibold text-slate-800">{selectedFile.name}</span>
            <span className="text-slate-500 text-[10px]">({selectedFile.size})</span>
          </div>
          <button
            onClick={() => setSelectedFile(null)}
            className="text-slate-500 hover:text-slate-800 font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Light Message Composer Box */}
      <div className="p-3 border-t border-slate-200 bg-white">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-indigo-500 focus-within:bg-white transition-all shadow-2xs">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-slate-400 hover:text-slate-700 transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={inputContent}
            onChange={(e) => setInputContent(e.target.value)}
            placeholder={`Message ${chatName}...`}
            className="flex-1 bg-transparent text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          <button type="button" className="text-slate-400 hover:text-slate-700 transition-colors">
            <Smile className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={!inputContent.trim() && !selectedFile}
            className="p-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-lg transition-all shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
