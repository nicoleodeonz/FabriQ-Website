import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { View } from '../App';
import { Bell, BellDot, User, Settings, X, MessageSquare } from 'lucide-react';
import { notificationAPI, type CustomerNotificationEntry } from '../services/notificationAPI';
import { chatAPI } from '../services/chatAPI';

const NOTIFICATION_POLL_INTERVAL_MS = 15000;

interface NavigationProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  isAdmin: boolean;
  setIsAdmin: (isAdmin: boolean) => void;
  isLoggedIn: boolean;
  setIsLoggedIn: (val: boolean) => void;
  notificationToken: string | null;
  showCustomerNotifications: boolean;
  onNotificationSelect: (notification: CustomerNotificationEntry) => void;
  navigateProtected: (view: View) => void;
}


export function Navigation({
  currentView,
  setCurrentView,
  isAdmin,
  setIsAdmin,
  isLoggedIn,
  notificationToken,
  showCustomerNotifications,
  onNotificationSelect,
  navigateProtected
}: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');
  const [customerNotifications, setCustomerNotifications] = useState<CustomerNotificationEntry[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationLoadError, setNotificationLoadError] = useState<string | null>(null);
  const [adminUnreadChatCount, setAdminUnreadChatCount] = useState<number>(0);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);
  const notificationActionShift: CSSProperties = { position: 'relative', left: '375px' };
  const messagesActionShift: CSSProperties = { position: 'relative', left: '350px' };
  const profileActionShift: CSSProperties = { position: 'relative', left: '325px' };
  const adminActionShift: CSSProperties = { position: 'relative', left: '300px' };

  useEffect(() => {
    if (!showNotificationModal) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotificationModal(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showNotificationModal]);

  useEffect(() => {
    if (!showCustomerNotifications && showNotificationModal) {
      setShowNotificationModal(false);
    }
  }, [showCustomerNotifications, showNotificationModal]);

  useEffect(() => {
    if (!showNotificationModal) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (notificationPanelRef.current && !notificationPanelRef.current.contains(event.target as Node)) {
        setShowNotificationModal(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [showNotificationModal]);

  useEffect(() => {
    if (!showCustomerNotifications || !notificationToken) {
      setCustomerNotifications([]);
      setNotificationsLoading(false);
      setNotificationLoadError(null);
      return;
    }

    let isCancelled = false;
    let intervalId: number | null = null;

    const loadNotifications = async ({ showLoading = false, surfaceErrors = false } = {}) => {
      if (showLoading) {
        setNotificationsLoading(true);
      }
      if (surfaceErrors) {
        setNotificationLoadError(null);
      }

      try {
        const notifications = await notificationAPI.getMyNotifications(notificationToken);
        if (!isCancelled) {
          setCustomerNotifications(notifications);
        }
      } catch (error) {
        if (!isCancelled && surfaceErrors) {
          setNotificationLoadError(error instanceof Error ? error.message : 'Failed to load notifications.');
        }
      } finally {
        if (!isCancelled && showLoading) {
          setNotificationsLoading(false);
        }
      }
    };

    void loadNotifications({
      showLoading: showNotificationModal || customerNotifications.length === 0,
      surfaceErrors: showNotificationModal,
    });

    intervalId = window.setInterval(() => {
      void loadNotifications({
        showLoading: false,
        surfaceErrors: showNotificationModal,
      });
    }, NOTIFICATION_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [customerNotifications.length, notificationToken, showCustomerNotifications, showNotificationModal]);

  useEffect(() => {
    if (!isAdmin || !notificationToken) {
      setAdminUnreadChatCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const n = await chatAPI.getAdminUnreadCount(notificationToken);
        if (!cancelled) setAdminUnreadChatCount(Number.isFinite(n) ? n : 0);
      } catch (_e) { /* ignore */ }
    };
    void load();
    const intervalId = window.setInterval(() => { void load(); }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isAdmin, notificationToken]);

  const filteredNotifications = notificationFilter === 'unread'
    ? customerNotifications.filter((notification) => !notification.readAt)
    : customerNotifications;
  const unreadNotificationCount = customerNotifications.filter((notification) => !notification.readAt).length;

  const markNotificationAsRead = async (notification: CustomerNotificationEntry) => {
    const optimisticReadAt = new Date().toISOString();

    setCustomerNotifications((prev) => prev.map((entry) => (
      entry.id === notification.id ? { ...entry, readAt: entry.readAt || optimisticReadAt } : entry
    )));

    if (!notificationToken || notification.readAt) {
      return;
    }

    try {
      const updatedNotification = await notificationAPI.markNotificationRead(notificationToken, notification.id);
      if (!updatedNotification) {
        return;
      }

      setCustomerNotifications((prev) => prev.map((entry) => (
        entry.id === updatedNotification.id ? updatedNotification : entry
      )));
    } catch {
      setCustomerNotifications((prev) => prev.map((entry) => (
        entry.id === notification.id ? { ...entry, readAt: notification.readAt } : entry
      )));
    }
  };

  const formatNotificationMeta = (notification: CustomerNotificationEntry) => {
    const details = [notification.type, notification.status]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    return details.join(' | ');
  };

  const formatNotificationTimestamp = (notification: CustomerNotificationEntry) => {
    const createdAt = String(notification.createdAt || '').trim();
    if (!createdAt) {
      return '';
    }

    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
    const day = `${parsed.getDate()}`.padStart(2, '0');
    const hours = `${parsed.getHours()}`.padStart(2, '0');
    const minutes = `${parsed.getMinutes()}`.padStart(2, '0');

    return `${year}-${month}-${day} | ${hours}:${minutes}`;
  };

  const isPhoneVerifiedNotification = (notification: CustomerNotificationEntry) => {
    const notificationTitle = String(notification.title || '').trim().toLowerCase();
    const notificationItemLabel = String(notification.itemLabel || '').trim().toLowerCase();

    return notification.type === 'bespoke'
      && (notificationTitle === 'phone number verified' || notificationItemLabel === 'verified phone number');
  };

  const navItems: { view: View; label: string; protected?: boolean }[] = isAdmin
    ? []
    : [
        { view: 'catalog', label: 'Collections' },
        { view: 'rentals', label: 'Rentals', protected: true },
        { view: 'custom-orders', label: 'Bespoke', protected: true },
        { view: 'appointments', label: 'Book', protected: true }
      ];

  const renderButton = (view: View, label: string, type?: 'profile' | 'admin' | 'notifications' | 'messages', style?: CSSProperties) => {
    const isIconOnlyDesktop = type === 'profile' || type === 'admin' || type === 'notifications' || type === 'messages';
    const hasUnreadNotifications = type === 'notifications' && unreadNotificationCount > 0;
    const hasUnreadChats = type === 'messages' && adminUnreadChatCount > 0;
    const Icon = type === 'profile'
      ? User
      : type === 'admin'
        ? Settings
        : type === 'notifications'
          ? (hasUnreadNotifications ? BellDot : Bell)
          : type === 'messages'
            ? MessageSquare
            : undefined;

    return (
      <button
        key={view}
        onClick={(event) => {
          if (type === 'profile') navigateProtected('profile');
          else if (type === 'messages') navigateProtected('messages');
          else if (type === 'notifications') {
            event.stopPropagation();
            setShowNotificationModal((prev) => !prev);
          }
          else if (type === 'admin') {
            setCurrentView('admin');
          } else if (navItems.find(item => item.view === view)?.protected) {
            navigateProtected(view);
          } else {
            setCurrentView(view);
          }
          setMobileMenuOpen(false);
        }}
        className={`flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.15em] transition-colors ${
          currentView === view ? 'text-[#1a1a1a]' : 'text-[#6B5D4F] hover:text-[#1a1a1a]'
        } ${isIconOnlyDesktop ? 'relative justify-center w-10 h-10 rounded-full overflow-visible' : ''}`}
        style={style}
      >
        {Icon && (
          <span
            className="relative flex items-center justify-center"
            style={hasUnreadNotifications ? { color: '#D62828' } : undefined}
          >
            <Icon className="h-5 w-5" />
            {hasUnreadChats && (
              <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D4AF37] px-1 text-[9px] font-bold text-white shadow-sm">
                {adminUnreadChatCount > 99 ? '99+' : adminUnreadChatCount}
              </span>
            )}
          </span>
        )}
        {!isIconOnlyDesktop && label}
      </button>
    );
  };

  return (
    <nav className="fixed top-0 w-full bg-[#FAF7F0]/95 backdrop-blur-sm border-b border-[#E8DCC8] z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center h-20">
          {/* Left: Logo */}
          <div className="flex-1">
            <button
              onClick={() => setCurrentView('home')}
              className="font-serif text-3xl font-light tracking-tight text-[#1a1a1a] hover:text-[#D4AF37] transition-colors"
            >
              Hannah Vanessa
            </button>
          </div>

          {/* Center: Desktop Tabs */}
          <div className="hidden md:flex flex-1 items-center justify-center gap-4">
            {navItems.map((item) => renderButton(item.view, item.label))}
          </div>

          {/* Right: Desktop Actions */}
          <div className="hidden md:flex flex-1 items-center justify-end gap-2 pl-6 lg:pl-10 md:translate-x-2 lg:translate-x-3">
            {showCustomerNotifications && (
              <div ref={notificationPanelRef} className="relative">
                {renderButton('profile', '', 'notifications', notificationActionShift)}
                {showNotificationModal && (
                  <div
                    className="absolute top-full z-[80] mt-5 flex flex-col overflow-hidden rounded-[2rem] border border-[#E8DCC8] shadow-[0_24px_80px_rgba(26,26,26,0.18)]"
                    style={{ backgroundColor: '#FFFDF9', opacity: 1, right: 0, transform: 'translateX(320px)', width: '384px', maxHeight: '600px' }}
                  >
                    <div
                      className="flex items-center justify-between border-b border-[#EFE3D0] px-6 py-5"
                      style={{ backgroundColor: '#FFFDF9' }}
                    >
                      <div style={{ paddingTop: '15px', paddingBottom: '15px' }}>
                        <p className="font-serif text-2xl font-light text-[#1a1a1a]">Notifications</p>
                        <p
                          className="mt-1 uppercase text-[#8A7763]"
                          style={{ fontSize: '9px', lineHeight: '11px', letterSpacing: '0.12em' }}
                        >
                          Recent updates from Hannah Vanessa
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowNotificationModal(false)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5EEE2] text-[#6B5D4F] transition-colors hover:bg-[#EBDDCA] hover:text-[#1a1a1a]"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 px-6 py-4" style={{ backgroundColor: '#FFFDF9' }}>
                      <button
                        type="button"
                        onClick={() => setNotificationFilter('all')}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                          notificationFilter === 'all'
                            ? 'bg-[#1a1a1a] text-white'
                            : 'bg-[#F5EEE2] text-[#6B5D4F] hover:bg-[#EBDDCA]'
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotificationFilter('unread')}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                          notificationFilter === 'unread'
                            ? 'bg-[#1a1a1a] text-white'
                            : 'bg-[#F5EEE2] text-[#6B5D4F] hover:bg-[#EBDDCA]'
                        }`}
                      >
                        Unread
                      </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto pb-[30px] pt-2" style={{ backgroundColor: '#FFFDF9' }}>
                      {notificationsLoading ? (
                        <div className="px-5 py-8 text-center text-sm text-[#6B5D4F]">Loading notifications...</div>
                      ) : notificationLoadError ? (
                        <div className="mx-5 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                          {notificationLoadError}
                        </div>
                      ) : filteredNotifications.length > 0 ? (
                        <div className="space-y-3 px-3">
                          {filteredNotifications.map((notification) => (
                            <div
                              key={notification.id}
                              className={`mx-2 cursor-pointer rounded-[1.25rem] border px-4 py-4 transition-colors hover:border-[#D4AF37] ${
                                notification.readAt
                                  ? 'border-[#E8DCC8] bg-[#FCF8F1]'
                                  : 'border-[#D4AF37] bg-[#FFF4DD] shadow-[0_8px_24px_rgba(212,175,55,0.12)]'
                              }`}
                              role="button"
                              tabIndex={0}
                              onClick={async () => {
                                await markNotificationAsRead(notification);

                                if (isPhoneVerifiedNotification(notification)) {
                                  return;
                                }

                                onNotificationSelect(notification);
                                setShowNotificationModal(false);
                              }}
                              onKeyDown={async (event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  await markNotificationAsRead(notification);

                                  if (isPhoneVerifiedNotification(notification)) {
                                    return;
                                  }

                                  onNotificationSelect(notification);
                                  setShowNotificationModal(false);
                                }
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-serif text-lg text-[#1a1a1a]">{notification.title}</p>
                                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#8A7763]">
                                    {formatNotificationMeta(notification)}
                                  </p>
                                </div>
                                {!notification.readAt && (
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="rounded-full bg-[#1a1a1a] font-semibold uppercase text-white"
                                      style={{ fontSize: '10px', lineHeight: '10px', letterSpacing: '0.08em', padding: '4px 8px', minHeight: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                      New
                                    </span>
                                    <span className="mt-0.5 h-2.5 w-2.5 rounded-full bg-[#1a1a1a]" />
                                  </div>
                                )}
                              </div>
                              <p className="mt-3 text-xs leading-5 text-[#6B5D4F]">{notification.message}</p>
                              <div className="mt-3 flex items-end justify-between gap-3">
                                {notification.location ? (
                                  <p className="text-[11px] uppercase tracking-[0.1em] text-[#8A7763]">
                                    {notification.location}
                                  </p>
                                ) : (
                                  <span />
                                )}
                                {formatNotificationTimestamp(notification) && (
                                  <p
                                    className="text-right text-[#8A7763]"
                                    style={{ fontSize: '10px', lineHeight: '12px' }}
                                  >
                                    {formatNotificationTimestamp(notification)}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                          <div aria-hidden="true" className="h-2.5" />
                        </div>
                      ) : (
                        <div
                          className="rounded-[1.5rem] border border-dashed border-[#D9C9B4] px-5 py-8 text-center"
                          style={{
                            backgroundColor: '#FCF8F1',
                            width: 'calc(100% - 40px)',
                            margin: '-5px 20px 20px',
                          }}
                        >
                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1E4CF] text-[#1a1a1a]">
                            <Bell className="h-6 w-6" />
                          </div>
                          <h3 className="mt-4 font-serif text-xl font-light text-[#1a1a1a]">
                            {notificationFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                          </h3>
                          <p className="mt-2 text-xs leading-5 text-[#6B5D4F]">
                            Updates about your rentals, appointments, and bespoke orders will appear here once they are available.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {isAdmin && renderButton('messages', '', 'messages', messagesActionShift)} {/* Message icon left of profile for admin */}
            {renderButton('profile', '', 'profile', profileActionShift)} {/* Profile icon only */}
            {isAdmin && renderButton('admin', '', 'admin', adminActionShift)} {/* Admin gear icon only if admin */}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden ml-auto p-2 text-[#6B5D4F] hover:text-[#1a1a1a] transition-colors"
          >
            {mobileMenuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#FAF7F0] border-t border-[#E8DCC8] px-6 py-6 space-y-1">
          {navItems.map((item) => renderButton(item.view, item.label))}
          {showCustomerNotifications && renderButton('profile', 'Notifications', 'notifications')}
          {isAdmin && renderButton('messages', 'Messages', 'messages')}
          {renderButton('profile', 'Profile', 'profile')} {/* Icon + text */}
          {isAdmin && renderButton('admin', 'Admin', 'admin')}       {/* Icon + text if admin */}
        </div>
      )}

    </nav>
  );
}