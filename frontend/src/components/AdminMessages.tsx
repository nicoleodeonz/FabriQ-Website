import { useEffect, useRef, useState } from 'react';
import { Send, ArrowLeft, User as UserIcon, Mail as MailIcon, Phone as PhoneIcon } from 'lucide-react';
import { chatAPI, type AdminConversationSummary, type ChatMessageRecord } from '../services/chatAPI';
import { createAdminDashboardEventSource } from '../services/adminRealtime';

interface AdminMessagesPageProps {
  token: string;
  currentUser: {
    id?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
  } | null;
  onBack?: () => void;
}

function formatTime(ts: string | Date | null | undefined): string {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateLabel(ts: string | Date | null | undefined): string {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTimeLabel(ts: string | Date | null | undefined): string {
  const date = formatDateLabel(ts);
  const time = formatTime(ts);
  return [date, time].filter(Boolean).join(' ');
}

function fullName(u: AdminMessagesPageProps['currentUser']): string {
  if (!u) return 'Admin';
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Admin';
}

export function AdminMessages({ token, currentUser, onBack }: AdminMessagesPageProps) {
  const [conversations, setConversations] = useState<AdminConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  async function loadConversations() {
    setLoadingConversations(true);
    try {
      const list = await chatAPI.getAdminConversations(token);
      setConversations(list);
    } catch (err) {
      console.error('[AdminMessages] loadConversations', err);
    } finally {
      setLoadingConversations(false);
    }
  }

  async function loadMessages(conversationId: string) {
    setLoadingMessages(true);
    try {
      const list = await chatAPI.getAdminConversationMessages(token, conversationId);
      setMessages(list);
      setSelectedId(conversationId);
      setConversations((prev) => prev.map((c) => (c.conversationId === conversationId ? { ...c, unreadCount: 0 } : c)));
    } catch (err) {
      console.error('[AdminMessages] loadMessages', err);
    } finally {
      setLoadingMessages(false);
    }
  }

  const refreshConversationState = async (conversationId?: string) => {
    const targetConversationId = conversationId || selectedId;
    try {
      await loadConversations();
      if (targetConversationId) {
        await loadMessages(targetConversationId);
      }
    } catch (err) {
      console.error('[AdminMessages] refreshConversationState', err);
    }
  };

  useEffect(() => {
    void loadConversations();
    const interval = window.setInterval(() => {
      void refreshConversationState(selectedId);
    }, 2000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedId]);

  useEffect(() => {
    if (!token) return;

    const eventSource = createAdminDashboardEventSource(token);
    const handleDashboardUpdate = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (payload.entity !== 'chat-message') return;

        const targetConversationId = payload.conversationId || selectedId;
        if (payload.action === 'customer-message' || payload.action === 'ai-reply') {
          void loadConversations();
          if (selectedId && targetConversationId === selectedId) {
            void loadMessages(selectedId);
          }
          return;
        }

        void refreshConversationState(targetConversationId);
      } catch {
        return;
      }
    };

    const handleLocalChatUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ conversationId?: string }>;
      const targetConversationId = customEvent.detail?.conversationId || selectedId;

      void loadConversations();
      if (selectedId && targetConversationId === selectedId) {
        void loadMessages(selectedId);
      }
    };

    eventSource.addEventListener('chat-conversation-update', handleDashboardUpdate);
    eventSource.addEventListener('admin-dashboard-update', handleDashboardUpdate);
    window.addEventListener('fabriq-chat-updated', handleLocalChatUpdated);
    eventSource.onerror = () => {
      void refreshConversationState(selectedId);
    };

    return () => {
      eventSource.removeEventListener('chat-conversation-update', handleDashboardUpdate);
      eventSource.removeEventListener('admin-dashboard-update', handleDashboardUpdate);
      window.removeEventListener('fabriq-chat-updated', handleLocalChatUpdated);
      eventSource.close();
    };
  }, [selectedId, token, refreshConversationState]);

  useEffect(() => {
    if (!selectedId || !token) return;

    void chatAPI.markAdminConversationOpen(token, selectedId).catch((err) => {
      console.error('[AdminMessages] markAdminConversationOpen failed', err);
    });

    return () => {
      void chatAPI.markAdminConversationClosed(token, selectedId).catch((err) => {
        console.error('[AdminMessages] markAdminConversationClosed failed', err);
      });
    };
  }, [selectedId, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedId]);

  async function handleSendReply() {
    const text = inputValue.trim();
    if (!text || !selectedId) return;
    try {
      const reply = await chatAPI.postAdminReply(token, selectedId, {
        text,
        adminId: currentUser?.id,
        adminName: fullName(currentUser),
      });
      setMessages((prev) => [...prev, reply]);
      setInputValue('');
      setConversations((prev) => prev.map((c) => c.conversationId === selectedId
        ? { ...c, lastMessageText: reply.text, lastMessageAt: reply.createdAt }
        : c));
      void refreshConversationState(selectedId);
    } catch (err) {
      console.error('[AdminMessages] handleSendReply', err);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSendReply();
    }
  }

  const selected = conversations.find((c) => c.conversationId === selectedId) || null;

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#FAF7F0] px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            <h1 className="text-3xl font-light tracking-wide text-[#1a1a1a]">Messages</h1>
            <p className="mt-1 text-sm text-[#6B5D4F]">Chat with your customers</p>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .messages-layout { flex-direction: row !important; }
          .messages-conversations { width: 340px !important; flex-shrink: 0; }
          .messages-chat { flex: 1 1 0% !important; min-width: 0; }
        }
        @media (min-width: 1024px) {
          .messages-conversations { width: 380px !important; }
        }
      `}</style>
      <div className="messages-layout flex gap-6" style={{ flexDirection: 'column', minWidth: 0 }}>
        {/* Conversation list */}
        <aside className="messages-conversations rounded-2xl border border-[#E8DCC8] bg-white shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '620px', maxHeight: '82vh', width: '100%' }}>
          <div className="border-b border-[#E8DCC8] px-6 py-4 flex items-center">
            <h2 className="font-medium text-[#1a1a1a]">Conversations</h2>
          </div>
          <div className="overflow-y-auto flex-1">
            {loadingConversations && conversations.length === 0 && (
              <p className="px-5 py-8 text-sm text-[#8A7763] text-center">Loading conversations...</p>
            )}
            {!loadingConversations && conversations.length === 0 && (
              <p className="px-5 py-8 text-sm text-[#8A7763] text-center">No customer messages yet.</p>
            )}
            <ul>
              {conversations.map((conv) => {
                const isActive = conv.conversationId === selectedId;
                const hasUnread = conv.unreadCount > 0;
                return (
                  <li key={conv.conversationId}>
                    <button
                      onClick={() => void loadMessages(conv.conversationId)}
                      className={`w-full text-left pl-7 pr-7 py-4 border-b border-[#F0E6D2] transition-colors ${
                        isActive
                          ? 'bg-[#F9F4E8]'
                          : hasUnread
                            ? 'bg-[#FFF8EC] hover:bg-[#FDF1DD]'
                            : 'hover:bg-[#FDFAF4]'
                      }`}
                      style={hasUnread && !isActive ? { boxShadow: 'inset 3px 0 0 #D4AF37' } : undefined}
                    >
                      <div className="flex items-stretch justify-between gap-4">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#6B5D4F] text-white">
                            <UserIcon className="h-6 w-6" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className="truncate text-[#1a1a1a]"
                                style={{ fontWeight: hasUnread ? 700 : 400 }}
                              >
                                {conv.customerName || 'Guest Customer'}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex min-w-[112px] shrink-0 items-end justify-end text-right">
                          <p
                            style={{
                              fontSize: '12px',
                              lineHeight: 1,
                              color: hasUnread ? '#6B5D4F' : '#A79580',
                              whiteSpace: 'nowrap',
                              paddingRight: '14px',
                              fontWeight: hasUnread ? 700 : 400,
                            }}
                          >
                            {formatDateTimeLabel(conv.lastMessageAt)}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Chat area */}
        <section className="messages-chat rounded-2xl border border-[#E8DCC8] bg-white shadow-sm flex flex-col overflow-hidden" style={{ minHeight: '620px', maxHeight: '82vh', width: '100%' }}>
          {!selected && (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F5EEE2] mb-4">
                <Send className="h-7 w-7 text-[#6B5D4F]" />
              </div>
              <h3 className="text-xl font-light text-[#1a1a1a]">Select a conversation</h3>
              <p className="mt-2 text-sm text-[#8A7763]">Choose a customer from the list on the left to view their messages and reply.</p>
            </div>
          )}

          {selected && (
            <>
              <header className="border-b border-[#E8DCC8] px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6B5D4F] text-white">
                    <UserIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-[#1a1a1a] truncate">{selected.customerName || 'Guest Customer'}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-0.5 text-xs text-[#8A7763]">
                      {selected.customerEmail && (
                        <span className="inline-flex items-center gap-1"><MailIcon className="h-3.5 w-3.5" />{selected.customerEmail}</span>
                      )}
                      {selected.customerPhone && (
                        <span className="inline-flex items-center gap-1"><PhoneIcon className="h-3.5 w-3.5" />{selected.customerPhone}</span>
                      )}
                    </div>
                  </div>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto bg-[#FAF7F0] px-6 py-5 space-y-3">
                {loadingMessages && messages.length === 0 && (
                  <p className="text-sm text-[#8A7763] text-center py-10">Loading messages...</p>
                )}
                {!loadingMessages && messages.length === 0 && (
                  <p className="text-sm text-[#8A7763] text-center py-10">No messages yet.</p>
                )}
                {messages.map((msg) => {
                  const isAdmin = msg.sender === 'admin';
                  const isAiResponse = msg.sender === 'system';
                  const isReplyBubble = isAdmin || isAiResponse;
                  return (
                    <div key={msg._id || (msg as any).id || msg.createdAt + msg.text} className="flex w-full" style={{ justifyContent: isReplyBubble ? 'flex-end' : 'flex-start' }}>
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${
                          isReplyBubble
                            ? 'bg-[#1a1a1a] text-white'
                            : 'bg-white text-[#1a1a1a] border border-[#E8DCC8]'
                        }`}
                        style={{
                          borderBottomRightRadius: isReplyBubble ? '4px' : '16px',
                          borderBottomLeftRadius: isReplyBubble ? '16px' : '4px',
                        }}
                      >
                        {isAdmin && msg.adminName && (
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-white/60">{msg.adminName}</p>
                        )}
                        <p className="text-sm leading-5 whitespace-pre-wrap break-words">{msg.text}</p>
                        {isAiResponse && (
                          <p className="mt-2 text-right text-[10px] italic tracking-wide text-white/60">
                            AI Response
                          </p>
                        )}
                        <p className={`mt-1 text-right text-[10px] ${isReplyBubble ? 'text-white/60' : 'text-[#8A7763]'}`}>
                          {formatTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-[#E8DCC8] bg-white px-5 py-4">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={`Reply to ${selected.customerName || 'this customer'}...`}
                    className="flex-1 rounded-full bg-[#F5EEE2] border-0 px-4 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#8A7763] outline-none focus:bg-white ring-0 focus:ring-0"
                  />
                  <button
                    onClick={() => void handleSendReply()}
                    disabled={!inputValue.trim()}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#1a1a1a] text-white hover:bg-[#D4AF37] disabled:opacity-40 disabled:hover:bg-[#1a1a1a] transition-colors"
                    aria-label="Send reply"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default AdminMessages;
