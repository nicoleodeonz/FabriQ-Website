import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { chatAPI } from '../services/chatAPI';

interface ChatMessage {
  id: string;
  sender: 'user' | 'admin';
  text: string;
  timestamp: Date;
}

interface FloatingChatProps {
  showTooltip?: boolean;
  customerId?: string;
  guestToken?: string;
  onOpenContactModal?: () => void;
  user?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string;
  } | null;
}

const GUEST_TOKEN_KEY = 'fabriq_chat_guest_token';
const CONTACT_MODAL_REPLY = 'Please contact us through here';
const STAFF_HANDOFF_PATTERN = /\b((may i|can i|could i|i would like to|i want to|can you|could you|would you|please)\s+(speak|talk|connect|reconnect|speak with|talk with)\s+(to|me to|with)?\s*(a\s+)?(person|staff|staff member|admin|someone))\b|\b(speak to a person|talk to a person|speak to staff|talk to staff|speak to a staff member|talk to a staff member|speak with a person|talk with a person|speak with staff|talk with staff|connect me to an admin|reconnect me to an admin|connect me to staff|reconnect me to staff|speak to an admin|talk to an admin|speak with an admin|talk with an admin|speak to a staff member|talk to a staff member)\b/i;

function isStaffHandoffRequest(text: string): boolean {
  return STAFF_HANDOFF_PATTERN.test(String(text || '').trim());
}

function ensureGuestToken(): string {
  let token = '';
  if (typeof localStorage !== 'undefined') {
    token = localStorage.getItem(GUEST_TOKEN_KEY) || '';
  }
  if (!token) {
    token = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GUEST_TOKEN_KEY, token);
    }
  }
  return token;
}

export function FloatingChat({ showTooltip = true, customerId, guestToken, onOpenContactModal, user }: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const [conversationId, setConversationId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'admin',
      text: 'Hi there! Welcome to Hannah Vanessa. How can we help you today?',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const chatPanelRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const aiDisabledRef = useRef(false);
  const isSendingRef = useRef(false);
  const lastSeenMessageTimeRef = useRef(Date.now());

  const makeMessageSignature = (message: { sender: 'user' | 'admin'; text: string; timestamp: Date }) => {
    return `${message.sender}|${String(message.text || '').trim().toLowerCase()}|${Math.floor(message.timestamp.getTime() / 5000)}`;
  };

  const resolvedGuestToken = guestToken || (customerId ? '' : ensureGuestToken());

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-shared-contact-modal="true"]')) {
        return;
      }

      if (chatPanelRef.current && !chatPanelRef.current.contains(event.target as Node)) {
        if (!target.closest('[data-floating-chat-toggle]')) {
          setIsOpen(false);
        }
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    aiDisabledRef.current = false;
    lastSeenMessageTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    lastSeenMessageTimeRef.current = Date.now();

    const pollForNewMessages = async () => {
      try {
        const list = await chatAPI.getConversationMessages(conversationId);
        const unseenMessages = list.filter((message) => {
          const createdAt = new Date(message.createdAt).getTime();
          const isNewerThanLastSeen = Number.isFinite(createdAt) && createdAt > lastSeenMessageTimeRef.current;
          if (!isNewerThanLastSeen) {
            return false;
          }

          return true;
        });

        if (!unseenMessages.length) return;

        const mappedMessages = unseenMessages.map((message) => ({
          id: message._id || `${message.conversationId}-${message.createdAt}`,
          sender: message.sender === 'customer' ? 'user' : 'admin',
          text: message.text || message.chat || '',
          timestamp: new Date(message.createdAt),
        }));

        setMessages((prev) => {
          const existingSignatures = new Set(prev.map((message) => makeMessageSignature(message)));
          const newEntries = mappedMessages.filter((message) => {
            const signature = makeMessageSignature({
              sender: message.sender,
              text: message.text,
              timestamp: message.timestamp,
            });
            return !existingSignatures.has(signature);
          });

          if (!newEntries.length) return prev;
          const newestTimestamp = Math.max(...newEntries.map((message) => message.timestamp.getTime()));
          lastSeenMessageTimeRef.current = newestTimestamp;
          return [...prev, ...newEntries];
        });
      } catch (err) {
        console.error('[FloatingChat] pollForNewMessages failed', err);
      }
    };

    void pollForNewMessages();
    const intervalId = window.setInterval(() => {
      void pollForNewMessages();
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isSendingRef.current) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date(),
    };

    const payload: {
      customerId?: string;
      guestToken?: string;
      uid?: string;
      name?: string;
      chat: string;
      text: string;
      time: string;
      date: string;
      sender?: 'customer' | 'admin';
    } = {
      chat: text,
      text,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      date: new Date().toISOString().slice(0, 10),
      sender: 'customer',
    };

    const resolvedUid = String(user?.id || customerId || resolvedGuestToken || '').trim();
    const resolvedName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || 'Guest Customer';
    if (resolvedUid) payload.uid = resolvedUid;
    if (resolvedName) payload.name = resolvedName;
    if (customerId) payload.customerId = customerId;
    else if (resolvedGuestToken) payload.guestToken = resolvedGuestToken;

    isSendingRef.current = true;

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    try {
      const result = await chatAPI.postChatMessage(payload);
      const nextConversationId = result?.conversationId || conversationId;
      if (nextConversationId) {
        setConversationId(nextConversationId);
      }

      const botPayload = {
        conversationId: nextConversationId,
        customerId,
        guestToken: resolvedGuestToken,
        userQuery: text,
        uid: resolvedUid,
        name: resolvedName,
        time: payload.time,
        date: payload.date,
      };

      if (isStaffHandoffRequest(text)) {
        aiDisabledRef.current = true;
        const botReply = await chatAPI.postChatbotReply(botPayload);
        const staffReplyText = botReply?.message?.text || 'Please wait while I connect you to a Staff. It might take a few minutes.';
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-staff-handoff`,
            sender: 'admin',
            text: staffReplyText,
            timestamp: new Date(),
          },
        ]);
        window.dispatchEvent(new CustomEvent('fabriq-chat-updated', {
          detail: { conversationId: botReply.conversationId },
        }));
        return;
      }

      if (aiDisabledRef.current) {
        return;
      }

      const botReply = await chatAPI.postChatbotReply(botPayload);
      if (!botReply.skipped && botReply.message) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-reply`,
            sender: 'admin',
            text: botReply.message.text,
            timestamp: new Date(),
          },
        ]);
        window.dispatchEvent(new CustomEvent('fabriq-chat-updated', {
          detail: { conversationId: botReply.conversationId },
        }));
      }
    } catch (err) {
      console.error('[FloatingChat] Failed to persist chat message or get chatbot reply:', err);
      setTimeout(() => {
        const fallbackReply: ChatMessage = {
          id: `msg-${Date.now()}-reply`,
          sender: 'admin',
          text: 'Thank you for your message! Our team will get back to you shortly.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, fallbackReply]);
      }, 1200);
    } finally {
      isSendingRef.current = false;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const isContactModalReply = (text: string) => normalizeText(text).toLowerCase() === CONTACT_MODAL_REPLY.toLowerCase();

  const renderMessageText = (message: ChatMessage) => {
    if (message.sender === 'admin' && isContactModalReply(message.text)) {
      return (
        <p className="text-sm leading-5 whitespace-pre-wrap break-words">
          Please contact us through{' '}
          <button
            type="button"
            onClick={onOpenContactModal}
            className="font-medium underline underline-offset-2"
            style={{ color: '#C9A227' }}
          >
            here
          </button>
        </p>
      );
    }

    return <p className="text-sm leading-5 whitespace-pre-wrap break-words">{message.text}</p>;
  };

  function normalizeText(value: string) {
    return String(value || '').trim();
  }

  return (
    <div
      className="fixed"
      style={{
        bottom: '32px',
        right: '32px',
        zIndex: 40,
        pointerEvents: 'none',
      }}
    >
      <div style={{ pointerEvents: 'auto' }} ref={chatPanelRef}>
        {isOpen && (
          <div
            className="flex flex-col overflow-hidden rounded-[2rem] border border-[#E8DCC8] shadow-[0_24px_80px_rgba(26,26,26,0.18)]"
            style={{
              backgroundColor: '#FFFDF9',
              width: '384px',
              maxHeight: '600px',
              position: 'absolute',
              bottom: '76px',
              right: '0',
            }}
          >
            <div
              className="flex items-center justify-between border-b border-[#EFE3D0] px-6 py-5"
              style={{ backgroundColor: '#FFFDF9' }}
            >
              <div style={{ paddingTop: '8px', paddingBottom: '8px' }}>
                <p className="font-serif text-2xl font-light text-[#1a1a1a]">Chat with us</p>
                <p
                  className="mt-1 uppercase text-[#8A7763]"
                  style={{ fontSize: '9px', lineHeight: '11px', letterSpacing: '0.12em' }}
                >
                  We usually reply within a few minutes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5EEE2] text-[#6B5D4F] transition-colors hover:bg-[#EBDDCA] hover:text-[#1a1a1a]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto"
              style={{ backgroundColor: '#FAF7F0', maxHeight: '420px', paddingTop: '16px', paddingBottom: '16px' }}
            >
              <div className="space-y-3 px-4" style={{ width: '100%' }}>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className="flex w-full"
                    style={{ justifyContent: message.sender === 'user' ? 'flex-end' : 'flex-start' }}
                  >
                    <div
                      className={`max-w-[260px] rounded-2xl px-4 py-3 ${
                        message.sender === 'user'
                          ? 'bg-[#1a1a1a] text-white'
                          : 'bg-white text-[#1a1a1a] border border-[#E8DCC8]'
                      }`}
                      style={{
                        borderBottomRightRadius: message.sender === 'user' ? '4px' : '16px',
                        borderBottomLeftRadius: message.sender === 'user' ? '16px' : '4px',
                      }}
                    >
                      {renderMessageText(message)}
                      <p
                        className={`mt-1 text-right text-[10px] ${
                          message.sender === 'user' ? 'text-white/60' : 'text-[#8A7763]'
                        }`}
                      >
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div
              className="flex items-center gap-3 border-t border-[#EFE3D0] px-4 py-4"
              style={{ backgroundColor: '#FFFDF9' }}
            >
              <input
                type="text"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                className="flex-1 rounded-full bg-[#F5EEE2] border-0 px-4 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#8A7763] outline-none transition-colors focus:bg-white ring-0 focus:ring-0 focus:border-0"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={isSendingRef.current || !inputValue.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] text-white transition-colors hover:bg-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#1a1a1a]"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {showTooltip && !tooltipDismissed && (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setTooltipDismissed(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setTooltipDismissed(true);
              }
            }}
            className="absolute cursor-pointer flex items-center px-4 py-2.5 rounded-full shadow-[0_12px_32px_rgba(26,26,26,0.18)] border border-[#E8DCC8] whitespace-nowrap transition-transform duration-200 hover:scale-105 animate-bounce"
            style={{
              backgroundColor: '#FFFDF9',
              right: '72px',
              bottom: '14px',
            }}
          >
            <span className="font-serif text-base text-[#1a1a1a]">Chat with us!</span>
            <div
              className="absolute"
              style={{
                right: '-8px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '0',
                height: '0',
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                borderLeft: '10px solid #FFFDF9',
                filter: 'drop-shadow(2px 0px 0px #E8DCC8)',
              }}
            />
          </div>
        )}

        <button
          data-floating-chat-toggle
          type="button"
          onClick={() => {
            setTooltipDismissed(true);
            setIsOpen((prev) => !prev);
          }}
          className="flex items-center justify-center rounded-full text-white shadow-[0_16px_48px_rgba(26,26,26,0.35)] transition-all duration-300 hover:scale-105 hover:bg-[#D4AF37] hover:shadow-[0_20px_56px_rgba(212,175,55,0.45)]"
          style={{
            width: '60px',
            height: '60px',
            minWidth: '60px',
            minHeight: '60px',
            maxWidth: '60px',
            maxHeight: '60px',
            borderRadius: '50%',
            backgroundColor: '#6B5D4F',
          }}
          aria-label={isOpen ? 'Close chat' : 'Open chat'}
        >
          {isOpen ? <X style={{ width: '30px', height: '30px' }} /> : <MessageCircle style={{ width: '32px', height: '32px' }} />}
        </button>
      </div>
    </div>
  );
}
