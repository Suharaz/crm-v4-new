'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, Check, Info, AlertCircle, CheckCircle, Package, CreditCard, Users } from 'lucide-react';
import { api } from '@/lib/api-client';

interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string;
  isRead: boolean;
  createdAt: string;
  referenceId?: string;
  referenceType?: string;
}

interface NotificationsResponse {
  data: Notification[];
  nextCursor?: string;
}

interface UnreadCountResponse {
  data: { count: number };
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'Vừa xong';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
  return `${Math.floor(seconds / 86400)} ngày trước`;
}

function NotificationIcon({ type }: { type: string }) {
  const cls = 'w-5 h-5 flex-shrink-0';
  if (type.includes('ORDER') || type.includes('order')) return <Package className={`${cls} text-blue-500`} />;
  if (type.includes('PAYMENT') || type.includes('payment')) return <CreditCard className={`${cls} text-green-500`} />;
  if (type.includes('LEAD') || type.includes('CUSTOMER') || type.includes('lead') || type.includes('customer')) return <Users className={`${cls} text-purple-500`} />;
  if (type.includes('SUCCESS') || type.includes('success')) return <CheckCircle className={`${cls} text-green-500`} />;
  if (type.includes('ERROR') || type.includes('WARN') || type.includes('error') || type.includes('warn')) return <AlertCircle className={`${cls} text-red-500`} />;
  return <Info className={`${cls} text-sky-500`} />;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get<UnreadCountResponse>('/notifications/unread-count');
      setUnreadCount(res.data.count ?? 0);
    } catch {
      // silent fail
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<NotificationsResponse>('/notifications?limit=20');
      setNotifications(res.data ?? []);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll unread count every 30s
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close on click outside or Escape
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const markAsRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silent fail
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silent fail
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) markAsRead(notification.id);
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label="Thông báo"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0 flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-gray-200 bg-white shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="font-semibold text-gray-800 text-sm">Thông báo</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-sm text-sky-500 hover:text-sky-600 transition-colors"
              >
                <Check size={14} />
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-sm text-gray-400">
                Đang tải...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-gray-400">
                <Bell size={28} className="text-gray-300" />
                Không có thông báo nào
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 transition-colors last:border-b-0 ${
                    !notification.isRead ? 'bg-sky-50' : ''
                  }`}
                >
                  <div className="mt-0.5">
                    <NotificationIcon type={notification.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${!notification.isRead ? 'font-medium text-gray-800' : 'text-gray-700'}`}>
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">{notification.message}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">{timeAgo(notification.createdAt)}</p>
                  </div>
                  {!notification.isRead && (
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-sky-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
