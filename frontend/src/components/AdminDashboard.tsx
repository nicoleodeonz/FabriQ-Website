import { useState, useEffect, useRef } from 'react';
import { Package, Users, TrendingUp, MapPin, AlertCircle, Edit, Trash2, Plus, X, Mail, Phone, Calendar, Clock, Send, MessageSquare, Upload, Link, Archive, RotateCcw } from 'lucide-react';
import * as inventoryAPI from '../services/inventoryAPI';
import { INVENTORY_UPDATED_EVENT } from '../services/inventoryAPI';
import type { InventoryItem, BranchPerformanceStats, BranchPerformanceSummary } from '../services/inventoryAPI';
import { GownDetailsModal } from './GownDetailsModal';
import type { GownDetails } from './GownDetailsModal';
import * as usersAPI from '../services/usersAPI';
import type { AdminActionEntry, CreateManagedUserPayload, ManagedUser, ManagedUserRole } from '../services/usersAPI';
import * as rentalAPI from '../services/rentalAPI';
import type { AdminRentalDetail } from '../services/rentalAPI';
import { appointmentAPI } from '../services/appointmentAPI';
import type { AdminAppointmentDetail } from '../services/appointmentAPI';
import { adminCustomOrderAPI } from '../services/adminCustomOrderAPI';
import type { AdminCustomOrderRecord, AdminCustomOrderStatus } from '../services/adminCustomOrderAPI';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';

export type { InventoryItem };

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  branch: string;
  role: ManagedUserRole;
  joinDate: string;
  status: 'active' | 'archived';
  lastActivity: string;
}

interface NewUserForm {
  role: ManagedUserRole;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

interface PendingReturn {
  id: string;
  gownName: string;
  customer: string;
  dueDate: string;
  daysLate: number;
}

interface RentalFollowUpTarget {
  id: string;
  gownName: string;
  customer: string;
  dueDate: string;
  daysLate: number;
  status: 'pending' | 'active' | 'for-payment' | 'for-pickup';
}

interface AdminRentalCard {
  id: string;
  referenceId?: string;
  gownName: string;
  customerName: string;
  endDate: string;
  status: AdminRentalDetail['status'];
  totalPrice: number;
  branch: string;
}

interface CurrentAdminUser {
  id?: string;
  role?: string;
}

interface AdminDashboardProps {
  token: string;
  currentUserRole?: string;
  currentUser?: CurrentAdminUser | null;
}

type AdminTab = 'overview' | 'inventory' | 'rentals' | 'appointments' | 'bespoke' | 'users' | 'history';

type AddItemField =
  | 'name'
  | 'category'
  | 'color'
  | 'price'
  | 'branch'
  | 'status'
  | 'stock'
  | 'image'
  | 'description';

const INVENTORY_PREVIEW_DELAY_MS = 2000;
const INVENTORY_PAGE_SIZE = 9;
const APPOINTMENT_PAGE_SIZE = 3;
const RENTAL_PAGE_SIZE = 5;
const RENTAL_LATE_FEE_PER_DAY = 200;
const CUSTOM_ORDER_PAGE_SIZE = 4;
const ADMIN_HISTORY_PAGE_SIZE = 8;
const USER_PAGE_SIZE = 5;
const CUSTOM_ORDER_STATUS_OPTIONS: AdminCustomOrderStatus[] = ['inquiry', 'design-approval', 'in-progress', 'fitting', 'completed', 'rejected'];
const CUSTOM_ORDER_FILTER_TABS: AdminCustomOrderStatus[] = ['inquiry', 'design-approval', 'in-progress', 'fitting', 'completed'];
const ADMIN_TABS: AdminTab[] = ['overview', 'inventory', 'rentals', 'appointments', 'bespoke', 'users', 'history'];

function parseAdminTabFromHash(hash: string): AdminTab {
  const normalizedHash = hash.replace(/^#\/?/, '');
  const [pathPart = '', searchPart = ''] = normalizedHash.split('?');
  const normalizedPath = pathPart.replace(/^\/+|\/+$/g, '');

  if (normalizedPath !== 'admin') {
    return 'overview';
  }

  const nextTab = new URLSearchParams(searchPart).get('tab');
  return ADMIN_TABS.includes(nextTab as AdminTab) ? (nextTab as AdminTab) : 'overview';
}

function buildAdminHash(tab: AdminTab) {
  const searchParams = new URLSearchParams();
  if (tab !== 'overview') {
    searchParams.set('tab', tab);
  }

  const queryString = searchParams.toString();
  return `#/admin${queryString ? `?${queryString}` : ''}`;
}

function compareInventoryItemsAscending(left: InventoryItem, right: InventoryItem) {
  const leftKey = (left.sku || left.id || '').trim();
  const rightKey = (right.sku || right.id || '').trim();

  return leftKey.localeCompare(rightKey, undefined, { numeric: true, sensitivity: 'base' });
}

function toInventoryPreviewDetails(item: InventoryItem): GownDetails {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    color: item.color,
    size: Array.isArray(item.size) ? item.size : [],
    price: item.price,
    status: item.status === 'available' || item.status === 'rented' || item.status === 'reserved'
      ? item.status
      : 'maintenance',
    branch: item.branch,
    image: item.image?.trim() || 'https://images.unsplash.com/photo-1763336016192-c7b62602e993?w=800',
    rating: typeof item.rating === 'number' ? item.rating : 0,
  };
}

function normalizeBranchName(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.startsWith('taguig main')) return 'Taguig Main';
  if (normalized === 'bgc branch') return 'BGC Branch';
  if (normalized === 'makati branch') return 'Makati Branch';
  if (normalized === 'quezon city') return 'Quezon City';
  return String(value || '').trim();
}

function matchesSelectedBranch(branch: string | null | undefined, selectedBranch: string): boolean {
  if (selectedBranch === 'All Branches') return true;
  return normalizeBranchName(branch) === normalizeBranchName(selectedBranch);
}

export function AdminDashboard({ token, currentUserRole, currentUser }: AdminDashboardProps) {
  const getCurrentUserId = (jwtToken: string) => {
    try {
      const payloadPart = jwtToken.split('.')[1];
      if (!payloadPart) return '';
      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      return String(payload?.id || '');
    } catch {
      return '';
    }
  };

  const currentUserId = String(currentUser?.id || '').trim() || getCurrentUserId(token);

  type InventoryConfirmAction =
    | { type: 'delete'; item: InventoryItem }
    | { type: 'restore'; item: InventoryItem }
    | null;

  const [activeTab, setActiveTab] = useState<AdminTab>(() => parseAdminTabFromHash(window.location.hash));
  const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');

  const setActiveTabWithHash = (tab: AdminTab, history: 'push' | 'replace' = 'push') => {
    setActiveTab(tab);

    const nextHash = buildAdminHash(tab);
    if (window.location.hash === nextHash) {
      return;
    }

    if (history === 'replace') {
      window.history.replaceState(null, '', nextHash);
      return;
    }

    window.history.pushState(null, '', nextHash);
  };
  
  // Inventory State
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [branchStats, setBranchStats] = useState<BranchPerformanceStats[]>([]);
  const [branchSummary, setBranchSummary] = useState<BranchPerformanceSummary>({
    totalProducts: 0,
    totalStockUnits: 0,
    availableProducts: 0,
    rentedProducts: 0,
    activeRentals: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    totalItemsSold: 0,
    inventoryTurnoverRate: 0,
    inventoryValue: 0
  });
  const [branchPerformanceLoading, setBranchPerformanceLoading] = useState(false);
  const [branchPerformanceError, setBranchPerformanceError] = useState<string | null>(null);
  const [inventoryView, setInventoryView] = useState<'active' | 'archive'>('active');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryMessage, setInventoryMessage] = useState<string | null>(null);
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [archivedItems, setArchivedItems] = useState<InventoryItem[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<InventoryConfirmAction>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [hoverPreviewItem, setHoverPreviewItem] = useState<InventoryItem | null>(null);
  const cancelConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const primaryConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const inventoryPreviewTimerRef = useRef<number | null>(null);
  const hoveredInventoryIdRef = useRef<string | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemErrors, setAddItemErrors] = useState<Partial<Record<AddItemField, string>>>({});
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: '',
    category: 'Evening Gown',
    color: '',
    size: [],
    price: 0,
    branch: 'Taguig Main',
    status: 'available',
    description: '',
    image: '',
    stock: 1
  });

  // Users State
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersMessage, setUsersMessage] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'admin' | 'staff' | 'customer'>('all');
  const [showArchivedUsersOnly, setShowArchivedUsersOnly] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [confirmUserArchive, setConfirmUserArchive] = useState<User | null>(null);
  const [isConfirmingUserArchive, setIsConfirmingUserArchive] = useState(false);
  const [confirmUserRestore, setConfirmUserRestore] = useState<User | null>(null);
  const [isConfirmingUserRestore, setIsConfirmingUserRestore] = useState(false);
  const [archivingUserId, setArchivingUserId] = useState<string | null>(null);
  const [restoringUserId, setRestoringUserId] = useState<string | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserError, setNewUserError] = useState<string | null>(null);
  const [adminHistory, setAdminHistory] = useState<AdminActionEntry[]>([]);
  const [adminHistoryLoading, setAdminHistoryLoading] = useState(false);
  const [adminHistoryError, setAdminHistoryError] = useState<string | null>(null);
  const [adminHistorySearchQuery, setAdminHistorySearchQuery] = useState('');
  const [adminHistoryFrom, setAdminHistoryFrom] = useState('');
  const [adminHistoryTo, setAdminHistoryTo] = useState('');
  const [adminHistoryFromTime, setAdminHistoryFromTime] = useState('');
  const [adminHistoryToTime, setAdminHistoryToTime] = useState('');
  const [adminHistoryPage, setAdminHistoryPage] = useState(1);
  const [newUserForm, setNewUserForm] = useState<NewUserForm>({
    role: 'Customer',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phoneNumber: ''
  });
  const normalizedCurrentUserRole = String(currentUser?.role || currentUserRole || '').trim().toLowerCase();
  const isCurrentUserStaff = normalizedCurrentUserRole === 'staff';

  useEffect(() => {
    const syncActiveTabFromHash = () => {
      setActiveTab(parseAdminTabFromHash(window.location.hash));
    };

    syncActiveTabFromHash();
    window.addEventListener('hashchange', syncActiveTabFromHash);

    return () => {
      window.removeEventListener('hashchange', syncActiveTabFromHash);
    };
  }, []);

  // Rental Management State
  const [adminRentals, setAdminRentals] = useState<AdminRentalDetail[]>([]);
  const [adminRentalsLoading, setAdminRentalsLoading] = useState(false);
  const [adminRentalsError, setAdminRentalsError] = useState<string | null>(null);
  const [rentalSearchQuery, setRentalSearchQuery] = useState('');
  const [rentalManagementView, setRentalManagementView] = useState<'active' | 'archive'>('active');
  const [rentalPage, setRentalPage] = useState(1);
  const [appointmentManagementView, setAppointmentManagementView] = useState<'active' | 'archive'>('active');
  const [appointmentPage, setAppointmentPage] = useState(1);
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<'pending' | 'scheduled'>('pending');
  const [appointmentSearchQuery, setAppointmentSearchQuery] = useState('');
  const [adminAppointments, setAdminAppointments] = useState<AdminAppointmentDetail[]>([]);
  const [adminAppointmentsLoading, setAdminAppointmentsLoading] = useState(false);
  const [adminAppointmentsError, setAdminAppointmentsError] = useState<string | null>(null);
  const [appointmentStatusUpdatingId, setAppointmentStatusUpdatingId] = useState<string | null>(null);
  const [selectedPendingAppointment, setSelectedPendingAppointment] = useState<AdminAppointmentDetail | null>(null);
  const [isApproveAppointmentConfirmOpen, setIsApproveAppointmentConfirmOpen] = useState(false);
  const [selectedScheduledAppointment, setSelectedScheduledAppointment] = useState<AdminAppointmentDetail | null>(null);
  const [isCompleteAppointmentConfirmOpen, setIsCompleteAppointmentConfirmOpen] = useState(false);
  const [selectedCancelAppointment, setSelectedCancelAppointment] = useState<AdminAppointmentDetail | null>(null);
  const [isCancelAppointmentConfirmOpen, setIsCancelAppointmentConfirmOpen] = useState(false);
  const [appointmentCancelReason, setAppointmentCancelReason] = useState('');
  const [appointmentCancelError, setAppointmentCancelError] = useState<string | null>(null);
  const [adminCustomOrders, setAdminCustomOrders] = useState<AdminCustomOrderRecord[]>([]);
  const [adminCustomOrdersLoading, setAdminCustomOrdersLoading] = useState(false);
  const [adminCustomOrdersError, setAdminCustomOrdersError] = useState<string | null>(null);
  const [customOrderManagementView, setCustomOrderManagementView] = useState<'active' | 'archive'>('active');
  const [customOrderSearchQuery, setCustomOrderSearchQuery] = useState('');
  const [customOrderPage, setCustomOrderPage] = useState(1);
  const [customOrderStatusFilter, setCustomOrderStatusFilter] = useState<AdminCustomOrderStatus>('inquiry');
  const [customOrderStatusUpdatingId, setCustomOrderStatusUpdatingId] = useState<string | null>(null);
  const [selectedCustomOrder, setSelectedCustomOrder] = useState<AdminCustomOrderRecord | null>(null);
  const [isApproveCustomOrderConfirmOpen, setIsApproveCustomOrderConfirmOpen] = useState(false);
  const [isDoneCustomOrderConfirmOpen, setIsDoneCustomOrderConfirmOpen] = useState(false);
  const [isArchiveCompletedCustomOrderConfirmOpen, setIsArchiveCompletedCustomOrderConfirmOpen] = useState(false);
  const [isRejectCustomOrderConfirmOpen, setIsRejectCustomOrderConfirmOpen] = useState(false);
  const [rejectCustomOrderReason, setRejectCustomOrderReason] = useState('');
  const [rejectCustomOrderError, setRejectCustomOrderError] = useState<string | null>(null);
  const [rentalViewFilter, setRentalViewFilter] = useState<'pending' | 'for-payment' | 'for-pickup' | 'active' | 'returns'>('pending');
  const [selectedPendingRental, setSelectedPendingRental] = useState<AdminRentalDetail | null>(null);
  const [showPendingRentalModal, setShowPendingRentalModal] = useState(false);
  const [isApproveRentalConfirmOpen, setIsApproveRentalConfirmOpen] = useState(false);
  const [isRejectRentalConfirmOpen, setIsRejectRentalConfirmOpen] = useState(false);
  const [isPickedUpConfirmOpen, setIsPickedUpConfirmOpen] = useState(false);
  const [rejectRentalReason, setRejectRentalReason] = useState('');
  const [rejectRentalError, setRejectRentalError] = useState<string | null>(null);
  const [rentalStatusUpdating, setRentalStatusUpdating] = useState(false);
  const [rentalStatusError, setRentalStatusError] = useState<string | null>(null);
  const [rentalActionInProgress, setRentalActionInProgress] = useState<'approve' | 'reject' | 'picked-up' | 'returned' | null>(null);
  const [isItemReturnedConfirmOpen, setIsItemReturnedConfirmOpen] = useState(false);
  const [selectedReturnRental, setSelectedReturnRental] = useState<PendingReturn | null>(null);

  // Notification State
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [selectedRental, setSelectedRental] = useState<RentalFollowUpTarget | null>(null);
  const [notificationMethod, setNotificationMethod] = useState<'sms' | 'email' | 'both'>('both');

  const [isSendReminderConfirmOpen, setIsSendReminderConfirmOpen] = useState(false);
  const [isReminderSentSuccessOpen, setIsReminderSentSuccessOpen] = useState(false);

  const isAnyDashboardModalOpen = Boolean(
    confirmAction ||
    showAddItem ||
    editingItem ||
    hoverPreviewItem ||
    selectedUser ||
    confirmUserArchive ||
    confirmUserRestore ||
    showAddUserModal ||
    showPendingRentalModal ||
    isApproveRentalConfirmOpen ||
    isRejectRentalConfirmOpen ||
    isPickedUpConfirmOpen ||
    isItemReturnedConfirmOpen ||
    showNotificationModal ||
    isSendReminderConfirmOpen ||
    isReminderSentSuccessOpen ||
    isApproveAppointmentConfirmOpen ||
    isCompleteAppointmentConfirmOpen ||
    isCancelAppointmentConfirmOpen ||
    selectedCustomOrder ||
    isApproveCustomOrderConfirmOpen ||
    isArchiveCompletedCustomOrderConfirmOpen ||
    isRejectCustomOrderConfirmOpen
  );

  useModalInteractionLock(isAnyDashboardModalOpen);

  // Image upload state
  const [imageInputMode, setImageInputMode] = useState<'url' | 'file'>('url');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load inventory from DB on mount
  useEffect(() => {
    loadInventory();
    loadUsers();
  }, []);

  useEffect(() => {
    loadBranchPerformance(selectedBranch);
  }, [selectedBranch]);

  useEffect(() => {
    if (activeTab !== 'history') return;
    loadAdminHistory();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'rentals') return;
    loadAdminRentals();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'appointments') return;
    loadAdminAppointments();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'bespoke') return;
    loadAdminCustomOrders();
    loadAdminHistory();
  }, [activeTab]);

  useEffect(() => {
    const onInventoryUpdated = () => {
      loadInventory();
      loadBranchPerformance(selectedBranch);
    };

    window.addEventListener(INVENTORY_UPDATED_EVENT, onInventoryUpdated);
    return () => window.removeEventListener(INVENTORY_UPDATED_EVENT, onInventoryUpdated);
  }, [selectedBranch]);

  useEffect(() => {
    if (!confirmAction) return;

    cancelConfirmButtonRef.current?.focus();

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isConfirmingAction) {
        setConfirmAction(null);
        return;
      }

      if (event.key === 'Tab') {
        const active = document.activeElement;
        const cancelEl = cancelConfirmButtonRef.current;
        const confirmEl = primaryConfirmButtonRef.current;
        if (!cancelEl || !confirmEl) return;

        if (event.shiftKey && active === cancelEl) {
          event.preventDefault();
          confirmEl.focus();
        } else if (!event.shiftKey && active === confirmEl) {
          event.preventDefault();
          cancelEl.focus();
        }
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [confirmAction, isConfirmingAction]);

  useEffect(() => () => {
    if (inventoryPreviewTimerRef.current !== null) {
      window.clearTimeout(inventoryPreviewTimerRef.current);
    }
  }, []);

  function clearInventoryPreviewTimer() {
    if (inventoryPreviewTimerRef.current !== null) {
      window.clearTimeout(inventoryPreviewTimerRef.current);
      inventoryPreviewTimerRef.current = null;
    }
  }

  function handleInventoryRowHoverStart(item: InventoryItem) {
    hoveredInventoryIdRef.current = item.id;
    clearInventoryPreviewTimer();
    inventoryPreviewTimerRef.current = window.setTimeout(() => {
      if (hoveredInventoryIdRef.current === item.id) {
        setHoverPreviewItem(item);
      }
    }, INVENTORY_PREVIEW_DELAY_MS);
  }

  function handleInventoryRowHoverEnd(itemId?: string) {
    if (!itemId || hoveredInventoryIdRef.current === itemId) {
      hoveredInventoryIdRef.current = null;
    }
    clearInventoryPreviewTimer();
  }

  async function loadInventory() {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const items = await inventoryAPI.getInventory(token);
      setInventory(items);
    } catch (err) {
      setInventoryError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setInventoryLoading(false);
    }
  }

  async function loadArchivedInventory() {
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const items = await inventoryAPI.getArchivedInventory(token);
      setArchivedItems(items);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Failed to load archive');
    } finally {
      setArchiveLoading(false);
    }
  }

  async function loadAdminRentals() {
    setAdminRentalsLoading(true);
    setAdminRentalsError(null);
    try {
      const rentals = await rentalAPI.rentalAPI.getAdminRentals(token);
      setAdminRentals(rentals);
    } catch (err) {
      setAdminRentalsError(err instanceof Error ? err.message : 'Failed to load rentals');
    } finally {
      setAdminRentalsLoading(false);
    }
  }

  async function loadAdminAppointments() {
    setAdminAppointmentsLoading(true);
    setAdminAppointmentsError(null);
    try {
      const appointments = await appointmentAPI.getAdminAppointments(token);
      setAdminAppointments(appointments);
    } catch (err) {
      setAdminAppointmentsError(err instanceof Error ? err.message : 'Failed to load appointments');
    } finally {
      setAdminAppointmentsLoading(false);
    }
  }

  async function loadAdminCustomOrders() {
    setAdminCustomOrdersLoading(true);
    setAdminCustomOrdersError(null);
    try {
      const orders = await adminCustomOrderAPI.getAllCustomOrders(token);
      setAdminCustomOrders(orders);
    } catch (err) {
      setAdminCustomOrdersError(err instanceof Error ? err.message : 'Failed to load custom orders');
    } finally {
      setAdminCustomOrdersLoading(false);
    }
  }

  async function handleCustomOrderStatusUpdate(id: string, status: AdminCustomOrderStatus, reason?: string) {
    setCustomOrderStatusUpdatingId(id);
    setAdminCustomOrdersError(null);
    try {
      const updated = await adminCustomOrderAPI.updateCustomOrderStatus(token, id, status, reason);
      setAdminCustomOrders((prev) => prev.map((order) => {
        const orderId = String(order.id || order._id || '');
        return orderId === id ? updated : order;
      }));
      await Promise.all([loadAdminCustomOrders(), loadAdminHistory()]);
      return updated;
    } catch (err) {
      setAdminCustomOrdersError(err instanceof Error ? err.message : 'Failed to update custom order status');
      return null;
    } finally {
      setCustomOrderStatusUpdatingId(null);
    }
  }

  async function handleConfirmRejectCustomOrder() {
    if (!selectedCustomOrder) return;

    const orderId = String(selectedCustomOrder.id || selectedCustomOrder._id || '');
    const trimmedReason = rejectCustomOrderReason.trim();
    if (!orderId) return;
    if (!trimmedReason) {
      setRejectCustomOrderError('Rejection reason is required.');
      return;
    }

    setIsRejectCustomOrderConfirmOpen(false);
    setSelectedCustomOrder(null);
    setRejectCustomOrderReason('');
    setRejectCustomOrderError(null);

    const updated = await handleCustomOrderStatusUpdate(orderId, 'rejected', trimmedReason);
    if (!updated && adminCustomOrdersError) {
      setRejectCustomOrderError(adminCustomOrdersError);
    }
  }

  async function handleConfirmApproveCustomOrder() {
    if (!selectedCustomOrder) return;

    const orderId = String(selectedCustomOrder.id || selectedCustomOrder._id || '');
    const nextStatus = getNextCustomOrderStatus(selectedCustomOrder.status);
    if (!orderId || !nextStatus) return;

    setIsApproveCustomOrderConfirmOpen(false);
    setSelectedCustomOrder(null);
    await handleCustomOrderStatusUpdate(orderId, nextStatus);
  }

  async function handleConfirmArchiveCompletedCustomOrder() {
    if (!selectedCustomOrder) return;

    const orderId = String(selectedCustomOrder.id || selectedCustomOrder._id || '');
    if (!orderId) return;

    setCustomOrderStatusUpdatingId(orderId);
    setAdminCustomOrdersError(null);
    try {
      const updated = await adminCustomOrderAPI.archiveCustomOrder(token, orderId);
      setAdminCustomOrders((prev) => prev.map((order) => {
        const currentOrderId = String(order.id || order._id || '');
        return currentOrderId === orderId ? updated : order;
      }));
      setIsArchiveCompletedCustomOrderConfirmOpen(false);
      setSelectedCustomOrder(null);
      setCustomOrderManagementView('archive');
      await loadAdminHistory();
    } catch (err) {
      setAdminCustomOrdersError(err instanceof Error ? err.message : 'Failed to archive custom order');
    } finally {
      setCustomOrderStatusUpdatingId(null);
    }
  }

  async function handleAppointmentStatusUpdate(id: string, status: 'scheduled' | 'completed' | 'cancelled', reason?: string) {
    setAppointmentStatusUpdatingId(id);
    setAdminAppointmentsError(null);
    try {
      const updated = await appointmentAPI.updateAppointmentStatus(token, id, status, reason);
      setAdminAppointments((prev) => prev.map((item) => (item.id === id ? updated : item)));
      await loadAdminHistory();
    } catch (err) {
      setAdminAppointmentsError(err instanceof Error ? err.message : 'Failed to update appointment');
    } finally {
      setAppointmentStatusUpdatingId(null);
    }
  }

  async function handleConfirmApproveAppointment() {
    if (!selectedPendingAppointment) return;

    await handleAppointmentStatusUpdate(selectedPendingAppointment.id, 'scheduled');
    setIsApproveAppointmentConfirmOpen(false);
    setSelectedPendingAppointment(null);
  }

  async function handleConfirmCompleteAppointment() {
    if (!selectedScheduledAppointment) return;

    await handleAppointmentStatusUpdate(selectedScheduledAppointment.id, 'completed');
    setIsCompleteAppointmentConfirmOpen(false);
    setSelectedScheduledAppointment(null);
  }

  async function handleConfirmCancelAppointment() {
    if (!selectedCancelAppointment) return;

    const trimmedReason = appointmentCancelReason.trim();
    if (!trimmedReason) {
      setAppointmentCancelError('Cancellation reason is required.');
      return;
    }

    await handleAppointmentStatusUpdate(selectedCancelAppointment.id, 'cancelled', trimmedReason);
    setIsCancelAppointmentConfirmOpen(false);
    setSelectedCancelAppointment(null);
    setAppointmentCancelReason('');
    setAppointmentCancelError(null);
  }

  function mapManagedUserToDashboardUser(user: ManagedUser): User {
    return {
      id: user.id,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phone: user.phoneNumber || 'N/A',
      branch: user.preferredBranch || '',
      role: user.role,
      joinDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A',
      status: user.status || 'active',
      lastActivity: user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : 'N/A'
    };
  }

  async function loadUsers() {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const data = await usersAPI.getUsers(token);
      setUsers(data.map(mapManagedUserToDashboardUser));
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadAdminHistory() {
    setAdminHistoryLoading(true);
    setAdminHistoryError(null);
    try {
      const data = await usersAPI.getAdminActions(token);
      setAdminHistory(data);
    } catch (err) {
      setAdminHistoryError(err instanceof Error ? err.message : 'Failed to load admin history');
    } finally {
      setAdminHistoryLoading(false);
    }
  }

  function formatHistoryAction(action: string) {
    const normalized = String(action || '').trim().toLowerCase();
    if (normalized === 'user_created') return 'User Created';
    if (normalized === 'user_archived') return 'User Archived';
    if (normalized === 'user_restored') return 'User Restored';
    if (normalized === 'appointment_status_updated') return 'Appointment Status Updated';
    if (normalized === 'custom_order_status_updated') return 'Custom Order Status Updated';
    return normalized
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Action';
  }

  const formatUserDisplayId = (value: unknown, role: string) => {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';

    const normalizedRole = String(role || '').trim().toLowerCase();
    const isAdmin = normalizedRole === 'admin' || normalizedRole === 'staff';
    const isClient = normalizedRole === 'customer' || normalizedRole === 'client';
    if (!isAdmin && !isClient) return rawValue;

    let hash = 0;
    for (let index = 0; index < rawValue.length; index += 1) {
      hash = ((hash * 31) + rawValue.charCodeAt(index)) >>> 0;
    }

    if (isAdmin) {
      // Always starts with 'A', followed by 5 alphanumeric chars
      const suffix = hash.toString(36).toUpperCase().padStart(5, '0').slice(-5);
      return 'A' + suffix;
    }

    // Customer/client: 6 chars, first char must NOT be 'A'
    const base = hash.toString(36).toUpperCase().padStart(6, '0').slice(-6);
    if (base.charAt(0) !== 'A') return base;
    const NON_A_CHARS = '0123456789BCDEFGHIJKLMNOPQRSTUVWXYZ';
    const altHash = ((hash >>> 3) ^ (hash * 7)) >>> 0;
    return NON_A_CHARS[altHash % NON_A_CHARS.length] + base.slice(1);
  };

  function formatHistoryDetails(entry: AdminActionEntry) {
    const formatStatusLabel = (status: unknown) => String(status || '')
      .trim()
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    const parts: string[] = [];
    if (entry.targetRole) parts.push(`targetRole: ${entry.targetRole}`);

    const archivedEmail =
      entry.action === 'user_archived' &&
      entry.details &&
      typeof entry.details.email === 'string'
        ? entry.details.email
        : '';

    const restoredEmail =
      entry.action === 'user_restored' &&
      entry.details &&
      typeof entry.details.email === 'string'
        ? entry.details.email
        : '';

    if (entry.action === 'user_archived' && archivedEmail) {
      parts.push(`archivedEmail: ${archivedEmail}`);
    } else if (entry.action === 'user_restored' && restoredEmail) {
      parts.push(`restoredEmail: ${restoredEmail}`);
    } else if (entry.targetUserId) {
      const targetRole = String(entry.targetRole || '').trim().toLowerCase();
      const detailsRole = entry.details && typeof entry.details.role === 'string'
        ? entry.details.role
        : entry.details && typeof entry.details.accountType === 'string'
          ? entry.details.accountType
          : '';
      const normalizedDetailsRole = String(detailsRole).trim().toLowerCase();
      const matchedUserRole = users.find((user) => user.id === entry.targetUserId)?.role || '';
      const normalizedMatchedUserRole = String(matchedUserRole).trim().toLowerCase();
      const resolvedTargetRole = targetRole || normalizedDetailsRole || normalizedMatchedUserRole;
      const targetUserIdValue = formatUserDisplayId(entry.targetUserId, resolvedTargetRole);
      parts.push(`targetUserId: ${targetUserIdValue}`);
    }

    if (entry.action === 'rental_status_updated') {
      const details = entry.details ?? {};
      if (details && typeof details === 'object') {
        const rawReferenceId =
          typeof details.rentalReferenceId === 'string' && details.rentalReferenceId.trim()
            ? details.rentalReferenceId
            : (typeof details.referenceId === 'string' ? details.referenceId : '');

        const normalizedReferenceId = rawReferenceId
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 7);

        if (/^[A-Z0-9]{7}$/.test(normalizedReferenceId)) {
          parts.push(`rentalReferenceId: ${normalizedReferenceId}`);
        }

        if (typeof details.gownName === 'string' && details.gownName.trim()) {
          parts.push(`gownName: ${details.gownName}`);
        }
        if (typeof details.customerName === 'string' && details.customerName.trim()) {
          parts.push(`customerName: ${details.customerName}`);
        }

        const newStatusLabel = formatStatusLabel(details.newStatus);
        const previousStatusLabel = formatStatusLabel(details.previousStatus);

        if (newStatusLabel) {
          parts.push(`setStatusTo: ${newStatusLabel}`);
        }
        if (previousStatusLabel) {
          parts.push(`fromStatus: ${previousStatusLabel}`);
        }

        if (typeof details.reason === 'string' && details.reason.trim()) {
          parts.push(`reason: ${details.reason}`);
        }

        if (typeof details.pickupScheduleDate === 'string' && details.pickupScheduleDate.trim()) {
          parts.push(`pickupDate: ${details.pickupScheduleDate}`);
        }
        if (typeof details.pickupScheduleTime === 'string' && details.pickupScheduleTime.trim()) {
          parts.push(`pickupTime: ${details.pickupScheduleTime}`);
        }
      }

      return parts.join(' | ') || '-';
    }

    if (entry.action === 'appointment_status_updated' || entry.action === 'custom_order_status_updated') {
      const details = entry.details ?? {};
      if (details && typeof details === 'object') {
        const nextStatusLabel = formatStatusLabel(details.newStatus);
        const previousStatusLabel = formatStatusLabel(details.previousStatus);

        if (typeof details.customOrderReferenceId === 'string' && details.customOrderReferenceId.trim()) {
          parts.push(`customOrderReferenceId: ${details.customOrderReferenceId}`);
        }

        if (typeof details.customerName === 'string' && details.customerName.trim()) {
          parts.push(`customerName: ${details.customerName}`);
        }
        if (typeof details.appointmentType === 'string' && details.appointmentType.trim()) {
          parts.push(`appointmentType: ${details.appointmentType}`);
        }
        if (typeof details.orderType === 'string' && details.orderType.trim()) {
          parts.push(`orderType: ${details.orderType}`);
        }
        if (typeof details.branch === 'string' && details.branch.trim()) {
          parts.push(`branch: ${details.branch}`);
        }
        if (typeof details.date === 'string' && details.date.trim()) {
          parts.push(`date: ${details.date}`);
        }
        if (typeof details.time === 'string' && details.time.trim()) {
          parts.push(`time: ${details.time}`);
        }
        if (typeof details.eventDate === 'string' && details.eventDate.trim()) {
          parts.push(`eventDate: ${details.eventDate}`);
        }
        if (nextStatusLabel) {
          parts.push(`setStatusTo: ${nextStatusLabel}`);
        }
        if (previousStatusLabel) {
          parts.push(`fromStatus: ${previousStatusLabel}`);
        }
        if (typeof details.reason === 'string' && details.reason.trim()) {
          parts.push(`reason: ${details.reason}`);
        }
      }

      return parts.join(' | ') || '-';
    }

    if (entry.details) {
      for (const [key, value] of Object.entries(entry.details)) {
        if ((entry.action === 'user_archived' || entry.action === 'user_restored') && key === 'email') {
          continue;
        }
        if ((entry.action === 'inventory_archived' || entry.action === 'inventory_restored') && (key === 'gownName' || key === 'sku')) {
          continue;
        }
        parts.push(`${key}: ${String(value)}`);
      }
    }

    return parts.join(' | ') || '-';
  }

  function parseTimeInput(value: string): { hours: number; minutes: number } | null {
    const input = value.trim();
    if (!input) return null;

    const match = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!match) return null;

    let hours = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    const meridiem = match[3] ? match[3].toLowerCase() : null;

    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
      return null;
    }

    if (meridiem) {
      if (hours < 1 || hours > 12) return null;
      if (meridiem === 'am') {
        hours = hours === 12 ? 0 : hours;
      } else {
        hours = hours === 12 ? 12 : hours + 12;
      }
    } else if (hours < 0 || hours > 23) {
      return null;
    }

    return { hours, minutes };
  }

  function buildFilterDateTime(dateValue: string, timeValue: string, isEnd: boolean): Date | null {
    if (!dateValue) return null;

    const parts = dateValue.split('-').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
      return null;
    }

    const [year, month, day] = parts;
    const parsedTime = parseTimeInput(timeValue);
    if (timeValue.trim() && !parsedTime) {
      return null;
    }

    const hours = parsedTime ? parsedTime.hours : (isEnd ? 23 : 0);
    const minutes = parsedTime ? parsedTime.minutes : (isEnd ? 59 : 0);
    const seconds = isEnd ? 59 : 0;
    const milliseconds = isEnd ? 999 : 0;

    return new Date(year, month - 1, day, hours, minutes, seconds, milliseconds);
  }

  const hasFromTimeInput = adminHistoryFromTime.trim().length > 0;
  const hasToTimeInput = adminHistoryToTime.trim().length > 0;
  const isFromTimeValid = !hasFromTimeInput || parseTimeInput(adminHistoryFromTime) !== null;
  const isToTimeValid = !hasToTimeInput || parseTimeInput(adminHistoryToTime) !== null;
  const adminHistoryQuery = adminHistorySearchQuery.trim().toLowerCase();

  const filteredAdminHistory = adminHistory.filter((entry) => {
    const createdAt = entry.createdAt ? new Date(entry.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return false;

    const fromDate = buildFilterDateTime(adminHistoryFrom, adminHistoryFromTime, false);
    const toDate = buildFilterDateTime(adminHistoryTo, adminHistoryToTime, true);

    if (fromDate && !Number.isNaN(fromDate.getTime()) && createdAt < fromDate) {
      return false;
    }

    if (toDate && !Number.isNaN(toDate.getTime()) && createdAt > toDate) {
      return false;
    }

    if (adminHistoryQuery) {
      const detailEmailValues = entry.details
        ? Object.entries(entry.details)
            .filter(([key]) => key.toLowerCase().includes('email'))
            .map(([, value]) => String(value))
        : [];

      const targetRole = String(entry.targetRole || '').trim().toLowerCase();
      const detailsRole = entry.details && typeof entry.details.role === 'string'
        ? entry.details.role
        : entry.details && typeof entry.details.accountType === 'string'
          ? entry.details.accountType
          : '';
      const normalizedDetailsRole = String(detailsRole).trim().toLowerCase();
      const matchedUserRole = entry.targetUserId
        ? users.find((user) => user.id === entry.targetUserId)?.role || ''
        : '';
      const normalizedMatchedUserRole = String(matchedUserRole).trim().toLowerCase();
      const resolvedTargetRole = targetRole || normalizedDetailsRole || normalizedMatchedUserRole;
      const formattedTargetUserId = formatUserDisplayId(entry.targetUserId, resolvedTargetRole);

      const searchTargets = [
        entry.adminLabel,
        entry.adminEmail,
        entry.targetUserId,
        formattedTargetUserId,
        ...detailEmailValues,
        entry.action,
        formatHistoryAction(entry.action),
        formatHistoryDetails(entry),
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      if (!searchTargets.some((value) => value.includes(adminHistoryQuery))) {
        return false;
      }
    }

    return true;
  });
  const adminHistoryTotalPages = Math.max(1, Math.ceil(filteredAdminHistory.length / ADMIN_HISTORY_PAGE_SIZE));
  const safeAdminHistoryPage = Math.min(adminHistoryPage, adminHistoryTotalPages);
  const paginatedAdminHistory = filteredAdminHistory.slice(
    (safeAdminHistoryPage - 1) * ADMIN_HISTORY_PAGE_SIZE,
    safeAdminHistoryPage * ADMIN_HISTORY_PAGE_SIZE,
  );

  async function handleArchiveUser(user: User) {
    if (user.status === 'archived') {
      return;
    }

    const isElevatedTarget = user.role === 'Admin' || user.role === 'Staff';

    if (isElevatedTarget && user.id === currentUserId) {
      setUsersError('You cannot archive your own admin account.');
      return;
    }

    if (isCurrentUserStaff && isElevatedTarget) {
      setUsersError('Staff accounts cannot archive admin or staff accounts.');
      return;
    }

    setConfirmUserArchive(user);
  }

  async function handleConfirmArchiveUser() {
    if (!confirmUserArchive) return;

    setIsConfirmingUserArchive(true);
    setArchivingUserId(confirmUserArchive.id);
    setUsersError(null);
    try {
      await usersAPI.archiveUser(token, confirmUserArchive.role, confirmUserArchive.id);
      setUsers((prev) => prev.map((row) => (
        row.id === confirmUserArchive.id
          ? {
              ...row,
              status: 'archived',
              lastActivity: new Date().toLocaleDateString()
            }
          : row
      )));
      setSelectedUser((prev) => (
        prev && prev.id === confirmUserArchive.id
          ? {
              ...prev,
              status: 'archived',
              lastActivity: new Date().toLocaleDateString()
            }
          : prev
      ));
      showUsersTempMessage('User moved to archived.');
      setConfirmUserArchive(null);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to archive user');
    } finally {
      setIsConfirmingUserArchive(false);
      setArchivingUserId(null);
    }
  }

  async function handleCreateUser() {
    setNewUserError(null);

    if (!newUserForm.email.trim() || !newUserForm.password.trim()) {
      setNewUserError('Email and password are required.');
      return;
    }

    if (!newUserForm.firstName.trim() || !newUserForm.lastName.trim()) {
      setNewUserError('First name and last name are required.');
      return;
    }

    if (newUserForm.password.trim().length < 8) {
      setNewUserError('Password must be at least 8 characters long.');
      return;
    }

    if (
      newUserForm.role === 'Customer' &&
      (!newUserForm.firstName.trim() || !newUserForm.lastName.trim() || !newUserForm.phoneNumber.trim())
    ) {
      setNewUserError('First name, last name, and phone number are required for customer accounts.');
      return;
    }

    const payload: CreateManagedUserPayload = {
      role: newUserForm.role,
      email: newUserForm.email.trim(),
      password: newUserForm.password,
      firstName: newUserForm.firstName.trim(),
      lastName: newUserForm.lastName.trim(),
      ...(newUserForm.role === 'Customer'
        ? {
            phoneNumber: newUserForm.phoneNumber.trim()
          }
        : {})
    };

    setCreatingUser(true);
    try {
      await usersAPI.createUser(token, payload);
      await loadUsers();
      setShowAddUserModal(false);
      setNewUserForm({
        role: 'Customer',
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        phoneNumber: ''
      });
    } catch (err) {
      setNewUserError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleRestoreUser(user: User) {
    if (user.status !== 'archived') {
      return;
    }

    setConfirmUserRestore(user);
  }

  async function handleConfirmRestoreUser() {
    if (!confirmUserRestore) return;

    setIsConfirmingUserRestore(true);
    setRestoringUserId(confirmUserRestore.id);
    setUsersError(null);
    try {
      await usersAPI.restoreUser(token, confirmUserRestore.role, confirmUserRestore.id);
      setUsers((prev) => prev.map((row) => (
        row.id === confirmUserRestore.id
          ? {
              ...row,
              status: 'active',
              lastActivity: new Date().toLocaleDateString()
            }
          : row
      )));
      setSelectedUser((prev) => (
        prev && prev.id === confirmUserRestore.id
          ? {
              ...prev,
              status: 'active',
              lastActivity: new Date().toLocaleDateString()
            }
          : prev
      ));
      setConfirmUserRestore(null);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to restore user');
    } finally {
      setIsConfirmingUserRestore(false);
      setRestoringUserId(null);
    }
  }

  async function loadBranchPerformance(branchFilter: string) {
    setBranchPerformanceLoading(true);
    setBranchPerformanceError(null);

    try {
      if (branchFilter === 'All Branches') {
        const data = await inventoryAPI.getBranchPerformance(token);
        setBranchStats(data.branches);
        setBranchSummary(data.summary);
      } else {
        const data = await inventoryAPI.getBranchInventory(token, branchFilter);
        setBranchStats([data.stats]);
        setBranchSummary({
          totalProducts: data.stats.totalProducts,
          totalStockUnits: data.stats.totalStockUnits,
          availableProducts: data.stats.availableProducts,
          rentedProducts: data.stats.rentedProducts,
          activeRentals: data.stats.activeRentals,
          lowStockItems: data.stats.lowStockItems,
          outOfStockItems: data.stats.outOfStockItems,
          totalItemsSold: data.stats.totalItemsSold,
          inventoryTurnoverRate: data.stats.inventoryTurnoverRate,
          inventoryValue: data.stats.inventoryValue
        });
      }
    } catch (err) {
      setBranchPerformanceError(err instanceof Error ? err.message : 'Failed to load branch performance');
    } finally {
      setBranchPerformanceLoading(false);
    }
  }

  function showTempMessage(msg: string) {
    setInventoryMessage(msg);
    setTimeout(() => setInventoryMessage(null), 3000);
  }

  function showUsersTempMessage(msg: string) {
    setUsersMessage(msg);
    setTimeout(() => setUsersMessage(null), 3000);
  }

  async function handleConfirmApproveRental() {
    if (!selectedPendingRental) return;

    const nextStatus = selectedPendingRental.status === 'paid_for_confirmation' ? 'for_pickup' : 'for_payment';

    setRentalStatusUpdating(true);
    setRentalActionInProgress('approve');
    setRentalStatusError(null);

    try {
      await rentalAPI.rentalAPI.updateRentalStatus(token, selectedPendingRental.id, nextStatus);
      setAdminRentals((prev) =>
        prev.map((rental) =>
          rental.id === selectedPendingRental.id ? { ...rental, status: nextStatus } : rental
        )
      );
      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
      setIsApproveRentalConfirmOpen(false);
      setShowPendingRentalModal(false);
      setSelectedPendingRental(null);
    } catch (err) {
      setRentalStatusError(
        err instanceof Error
          ? err.message
          : (nextStatus === 'for_pickup' ? 'Failed to schedule pickup.' : 'Failed to approve rental.')
      );
    } finally {
      setRentalStatusUpdating(false);
      setRentalActionInProgress(null);
    }
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_MIME = ['image/jpeg', 'image/png'];

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      setImageUploadError('Invalid file type. Please use JPG or PNG.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setImageUploadError('File exceeds 5 MB limit.');
      e.target.value = '';
      return;
    }
    setImageUploadError(null);
    setIsUploadingImage(true);
    try {
      const url = await inventoryAPI.uploadImage(token, file);
      if (editingItem) {
        setEditingItem(prev => prev ? { ...prev, image: url } : prev);
      } else {
        setNewItem(prev => ({ ...prev, image: url }));
        setAddItemErrors(prev => ({ ...prev, image: '' }));
      }
    } catch (err) {
      setImageUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  };

  const resetImageModal = () => {
    setImageInputMode('url');
    setImageUploadError(null);
    setIsUploadingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validateAddItem = () => {
    const errors: Partial<Record<AddItemField, string>> = {};

    if (!newItem.name?.trim()) errors.name = 'This field is required';
    if (!newItem.category?.trim()) errors.category = 'This field is required';
    if (!newItem.color?.trim()) errors.color = 'This field is required';
    if (newItem.price === undefined || Number.isNaN(Number(newItem.price)) || Number(newItem.price) <= 0) {
      errors.price = 'This field is required';
    }
    if (!newItem.branch?.trim()) errors.branch = 'This field is required';
    if (!newItem.status?.trim()) errors.status = 'This field is required';
    if (newItem.stock === undefined || Number.isNaN(Number(newItem.stock)) || Number(newItem.stock) <= 0) {
      errors.stock = 'This field is required';
    }
    if (!newItem.image?.trim()) errors.image = 'This field is required';
    if (!newItem.description?.trim()) errors.description = 'This field is required';

    setAddItemErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const totalInventoryValue = branchSummary.inventoryValue;
  const totalProducts = branchSummary.totalProducts;
  const totalLowStock = branchSummary.lowStockItems;
  const totalOutOfStock = branchSummary.outOfStockItems;
  const isArchiveView = inventoryView === 'archive';

  // Inventory CRUD Functions
  const handleAddItem = async () => {
    if (!validateAddItem()) {
      setInventoryError('Please fill in all required fields');
      return;
    }
    setInventoryError(null);
    try {
      const created = await inventoryAPI.createProduct(token, {
        name: newItem.name!,
        category: newItem.category!,
        color: newItem.color!,
        size: newItem.size || [],
        price: newItem.price!,
        branch: newItem.branch!,
        status: newItem.status as 'available' | 'rented' | 'reserved' | 'maintenance',
        lastRented: newItem.lastRented ?? null,
        description: newItem.description || '',
        image: newItem.image || '',
        stock: newItem.stock ?? 1
      });
      setInventory(prev => [created, ...prev]);
      setShowAddItem(false);
      setAddItemErrors({});
      setNewItem({ name: '', category: 'Evening Gown', color: '', size: [], price: 0, branch: 'Taguig Main', status: 'available', description: '', image: '', stock: 1 });
      resetImageModal();
      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
      showTempMessage('Gown added successfully!');
    } catch (err) {
      setInventoryError(err instanceof Error ? err.message : 'Failed to add gown');
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    setInventoryError(null);
    try {
      const updated = await inventoryAPI.updateProduct(token, editingItem.id, {
        name: editingItem.name,
        category: editingItem.category,
        color: editingItem.color,
        size: editingItem.size,
        price: editingItem.price,
        branch: editingItem.branch,
        status: editingItem.status,
        lastRented: editingItem.lastRented ?? null,
        description: editingItem.description || '',
        image: editingItem.image || '',
        stock: editingItem.stock ?? 1
      });
      setInventory(prev => prev.map(item => item.id === editingItem.id ? updated : item));
      setEditingItem(null);
      resetImageModal();
      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
      showTempMessage('Gown updated successfully!');
    } catch (err) {
      setInventoryError(err instanceof Error ? err.message : 'Failed to update gown');
    }
  };

  const handleDeleteItem = async (id: string) => {
    const target = inventory.find(item => item.id === id);
    if (!target) return;
    setConfirmAction({ type: 'delete', item: target });
  };

  const handleConfirmDelete = async (item: InventoryItem) => {
    setIsConfirmingAction(true);
    setInventoryError(null);
    try {
      await inventoryAPI.deleteProduct(token, item.id);
      setInventory(prev => prev.filter(row => row.id !== item.id));
      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
      showTempMessage('Gown moved to archive.');
      if (inventoryView === 'archive') {
        loadArchivedInventory();
      }
    } catch (err) {
      setInventoryError(err instanceof Error ? err.message : 'Failed to delete gown');
    } finally {
      setIsConfirmingAction(false);
      setConfirmAction(null);
    }
  };

  const handleToggleArchiveView = async () => {
    if (inventoryView === 'active') {
      setInventoryView('archive');
      await loadArchivedInventory();
      return;
    }

    setInventoryView('active');
    setArchiveError(null);
  };

  const handleRestoreItem = async (id: string) => {
    const target = archivedItems.find(item => item.id === id);
    if (!target) return;
    setConfirmAction({ type: 'restore', item: target });
  };

  const handleConfirmRestore = async (item: InventoryItem) => {
    setIsConfirmingAction(true);
    setRestoringItemId(item.id);
    setArchiveError(null);
    try {
      const restored = await inventoryAPI.restoreProduct(token, item.id);
      setArchivedItems(prev => prev.filter(row => row.id !== item.id));
      setInventory(prev => [restored, ...prev]);
      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
      showTempMessage(`Restored ${restored.name} successfully.`);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Failed to restore item');
    } finally {
      setRestoringItemId(null);
      setIsConfirmingAction(false);
      setConfirmAction(null);
    }
  };

  // User Management Filters
  const filteredUsers = users.filter((user) => {
    const fullName = `${user.firstName} ${user.lastName}`.trim().toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      fullName.includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.phone.toLowerCase().includes(query);

    const matchesRole =
      userFilter === 'all' ||
      (userFilter === 'admin' && user.role === 'Admin') ||
      (userFilter === 'staff' && user.role === 'Staff') ||
      (userFilter === 'customer' && user.role === 'Customer');
    const matchesArchiveView = showArchivedUsersOnly
      ? user.status === 'archived'
      : user.status !== 'archived';
    const matchesBranch = matchesSelectedBranch(user.branch, selectedBranch);
    return matchesSearch && matchesRole && matchesArchiveView && matchesBranch;
  });
  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / USER_PAGE_SIZE));
  const safeUserPage = Math.min(userPage, userTotalPages);
  const paginatedUsers = filteredUsers.slice(
    (safeUserPage - 1) * USER_PAGE_SIZE,
    safeUserPage * USER_PAGE_SIZE,
  );

  useEffect(() => {
    setUserPage(1);
  }, [searchQuery, userFilter, showArchivedUsersOnly, selectedBranch]);

  const changeUserPage = (nextPage: number) => {
    setUserPage(nextPage);
  };

  const inventoryQuery = inventorySearchQuery.trim().toLowerCase();
  const filteredInventory = inventory
    .filter((item) => {
      if (!matchesSelectedBranch(item.branch, selectedBranch)) return false;
      if (!inventoryQuery) return true;
      return (
        item.name.toLowerCase().includes(inventoryQuery) ||
        (item.sku || '').toLowerCase().includes(inventoryQuery) ||
        item.category.toLowerCase().includes(inventoryQuery) ||
        item.color.toLowerCase().includes(inventoryQuery) ||
        item.branch.toLowerCase().includes(inventoryQuery) ||
        item.status.toLowerCase().includes(inventoryQuery)
      );
    })
    .sort(compareInventoryItemsAscending);

  const filteredArchivedItems = archivedItems
    .filter((item) => {
      if (!matchesSelectedBranch(item.branch, selectedBranch)) return false;
      if (!inventoryQuery) return true;
      return (
        item.name.toLowerCase().includes(inventoryQuery) ||
        (item.sku || '').toLowerCase().includes(inventoryQuery) ||
        item.category.toLowerCase().includes(inventoryQuery) ||
        item.color.toLowerCase().includes(inventoryQuery) ||
        item.branch.toLowerCase().includes(inventoryQuery)
      );
    })
    .sort(compareInventoryItemsAscending);

  useEffect(() => {
    setInventoryPage(1);
  }, [inventorySearchQuery, inventoryView, selectedBranch]);

  const inventoryItemsForCurrentView = inventoryView === 'archive' ? filteredArchivedItems : filteredInventory;
  const inventoryTotalPages = Math.max(1, Math.ceil(inventoryItemsForCurrentView.length / INVENTORY_PAGE_SIZE));
  const safeInventoryPage = Math.min(inventoryPage, inventoryTotalPages);
  const paginatedInventoryItems = inventoryItemsForCurrentView.slice(
    (safeInventoryPage - 1) * INVENTORY_PAGE_SIZE,
    safeInventoryPage * INVENTORY_PAGE_SIZE,
  );
  const inventoryCurrentPageCount = paginatedInventoryItems.length;

  const changeInventoryPage = (nextPage: number) => {
    setInventoryPage(nextPage);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentRentalCards: AdminRentalCard[] = adminRentals
    .filter((rental) => rental.status === 'active' || rental.status === 'pending')
    .map((rental) => ({
      id: rental.id,
      referenceId: rental.referenceId,
      gownName: rental.gownName,
      customerName: rental.customerName,
      endDate: rental.endDate,
      status: rental.status,
      totalPrice: rental.totalPrice,
      branch: rental.branch,
    }));

  const pendingRentalCards = currentRentalCards.filter((rental) => rental.status === 'pending');
  const activeRentalCards = currentRentalCards.filter((rental) => rental.status === 'active');
  const archivedRentalCards: AdminRentalCard[] = adminRentals
    .map((rental) => ({
      id: rental.id,
      referenceId: rental.referenceId,
      gownName: rental.gownName,
      customerName: rental.customerName,
      endDate: rental.endDate,
      status: rental.status,
      totalPrice: rental.totalPrice,
      branch: rental.branch,
    }));
  const forPaymentRentals = adminRentals.filter(
    (rental) => rental.status === 'for_payment' || rental.status === 'paid_for_confirmation'
  );
  const forPickupRentals = adminRentals.filter((rental) => rental.status === 'for_pickup');

  const isPickupScheduled = (rental: AdminRentalDetail) =>
    Boolean(rental.pickupScheduleDate && rental.pickupScheduleTime);

  const getRentalStatusLabel = (rental: AdminRentalDetail) => {
    if (rental.status === 'paid_for_confirmation') return 'Paid - For Confirmation';
    if (rental.status === 'for_pickup') {
      return isPickupScheduled(rental) ? 'Pickup is Scheduled' : 'Schedule Pickup';
    }
    const status = rental.status;
    return status
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const normalizeRentalStatus = (status: unknown) => String(status || '').trim().toLowerCase();
  const isCancelledRentalStatus = (status: unknown) => normalizeRentalStatus(status).includes('cancel');
  const rentalQuery = rentalSearchQuery.trim().toLowerCase();

  const matchesRentalSearch = (rental: {
    id?: string;
    referenceId?: string;
    gownName?: string;
    customerName?: string;
    branch?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    if (!rentalQuery) return true;

    return [
      rental.id,
      rental.referenceId,
      rental.gownName,
      rental.customerName,
      rental.branch,
      rental.status,
      rental.startDate,
      rental.endDate,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(rentalQuery));
  };

  const filteredPendingRentalCards = pendingRentalCards.filter((rental) => matchesSelectedBranch(rental.branch, selectedBranch) && matchesRentalSearch(rental));
  const filteredActiveRentalCards = activeRentalCards.filter((rental) => matchesSelectedBranch(rental.branch, selectedBranch) && matchesRentalSearch(rental));
  const filteredForPaymentRentals = forPaymentRentals.filter((rental) => matchesSelectedBranch(rental.branch, selectedBranch) && matchesRentalSearch(rental));
  const filteredForPickupRentals = forPickupRentals.filter((rental) => matchesSelectedBranch(rental.branch, selectedBranch) && matchesRentalSearch(rental));
  const filteredArchivedRentalCards = archivedRentalCards.filter((rental) => matchesSelectedBranch(rental.branch, selectedBranch) && matchesRentalSearch(rental));

  const pendingReturns: PendingReturn[] = activeRentalCards
    .map((rental) => {
      const due = new Date(rental.endDate);
      due.setHours(0, 0, 0, 0);
      if (Number.isNaN(due.getTime())) return null;

      const threeDaysBeforeDue = new Date(due);
      threeDaysBeforeDue.setDate(threeDaysBeforeDue.getDate() - 3);

      if (today < threeDaysBeforeDue) return null;

      const daysLate = Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        id: rental.id,
        gownName: rental.gownName,
        customer: rental.customerName,
        dueDate: rental.endDate,
        daysLate,
      };
    })
    .filter((rental): rental is PendingReturn => rental !== null);

  const isWithinReturnFollowUpWindow = (endDate: string) => {
    const due = new Date(endDate);
    due.setHours(0, 0, 0, 0);
    if (Number.isNaN(due.getTime())) {
      return false;
    }

    const threeDaysBeforeDue = new Date(due);
    threeDaysBeforeDue.setDate(threeDaysBeforeDue.getDate() - 3);
    return today >= threeDaysBeforeDue;
  };

  const filteredPendingReturns = pendingReturns.filter((rental) => {
    const rentalBranch = activeRentalCards.find((activeRental) => activeRental.id === rental.id)?.branch;
    if (!matchesSelectedBranch(rentalBranch, selectedBranch)) return false;
    if (!rentalQuery) return true;
    return [rental.id, rental.gownName, rental.customer, rental.dueDate]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(rentalQuery));
  });
  const rentalItemsForCurrentView = rentalManagementView === 'archive'
    ? filteredArchivedRentalCards
    : rentalViewFilter === 'pending'
      ? filteredPendingRentalCards
      : rentalViewFilter === 'active'
        ? filteredActiveRentalCards
        : rentalViewFilter === 'for-payment'
          ? filteredForPaymentRentals
          : rentalViewFilter === 'for-pickup'
            ? filteredForPickupRentals
            : filteredPendingReturns;
  const rentalTotalPages = Math.max(1, Math.ceil(rentalItemsForCurrentView.length / RENTAL_PAGE_SIZE));
  const safeRentalPage = Math.min(rentalPage, rentalTotalPages);
  const paginatedPendingRentalCards = filteredPendingRentalCards.slice(
    (safeRentalPage - 1) * RENTAL_PAGE_SIZE,
    safeRentalPage * RENTAL_PAGE_SIZE,
  );
  const paginatedActiveRentalCards = filteredActiveRentalCards.slice(
    (safeRentalPage - 1) * RENTAL_PAGE_SIZE,
    safeRentalPage * RENTAL_PAGE_SIZE,
  );
  const paginatedForPaymentRentals = filteredForPaymentRentals.slice(
    (safeRentalPage - 1) * RENTAL_PAGE_SIZE,
    safeRentalPage * RENTAL_PAGE_SIZE,
  );
  const paginatedForPickupRentals = filteredForPickupRentals.slice(
    (safeRentalPage - 1) * RENTAL_PAGE_SIZE,
    safeRentalPage * RENTAL_PAGE_SIZE,
  );
  const paginatedPendingReturns = filteredPendingReturns.slice(
    (safeRentalPage - 1) * RENTAL_PAGE_SIZE,
    safeRentalPage * RENTAL_PAGE_SIZE,
  );
  const paginatedArchivedRentalCards = filteredArchivedRentalCards.slice(
    (safeRentalPage - 1) * RENTAL_PAGE_SIZE,
    safeRentalPage * RENTAL_PAGE_SIZE,
  );

  const createRentalFollowUpTarget = (
    rental: Pick<AdminRentalCard, 'id' | 'gownName' | 'customerName' | 'endDate' | 'status'>
  ): RentalFollowUpTarget => {
    const due = new Date(rental.endDate);
    due.setHours(0, 0, 0, 0);
    const hasValidDueDate = !Number.isNaN(due.getTime());
    const daysLate = hasValidDueDate
      ? Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    return {
      id: rental.id,
      gownName: rental.gownName,
      customer: rental.customerName,
      dueDate: rental.endDate,
      daysLate,
      status: rental.status === 'active' ? 'active' : rental.status === 'pending' ? 'pending' : 'for-payment',
    };
  };

  const openRentalFollowUp = (target: RentalFollowUpTarget) => {
    setSelectedRental(target);
    setShowNotificationModal(true);
  };

  const appointmentQuery = appointmentSearchQuery.trim().toLowerCase();
  const matchesAppointmentSearch = (appointment: AdminAppointmentDetail) => {
    if (!matchesSelectedBranch(appointment.branch, selectedBranch)) return false;
    if (!appointmentQuery) return true;

    return [
      appointment.id,
      appointment.customerName,
      appointment.customerEmail,
      appointment.contactNumber,
      appointment.type,
      appointment.branch,
      appointment.date,
      appointment.time,
      appointment.status,
      appointment.selectedGownName,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(appointmentQuery));
  };

  const pendingAppointments = adminAppointments.filter((appointment) => appointment.status === 'pending');
  const scheduledAppointments = adminAppointments.filter((appointment) => appointment.status === 'scheduled');
  const archivedAppointments = adminAppointments.filter(
    (appointment) => appointment.status === 'completed' || appointment.status === 'cancelled'
  );
  const filteredPendingAppointments = pendingAppointments.filter(matchesAppointmentSearch);
  const filteredScheduledAppointments = scheduledAppointments.filter(matchesAppointmentSearch);
  const filteredArchivedAppointments = archivedAppointments.filter(matchesAppointmentSearch);
  const appointmentItemsForCurrentView = appointmentManagementView === 'archive'
    ? filteredArchivedAppointments
    : appointmentStatusFilter === 'pending'
      ? filteredPendingAppointments
      : filteredScheduledAppointments;
  const appointmentTotalPages = Math.max(1, Math.ceil(appointmentItemsForCurrentView.length / APPOINTMENT_PAGE_SIZE));
  const safeAppointmentPage = Math.min(appointmentPage, appointmentTotalPages);
  const paginatedAppointments = appointmentItemsForCurrentView.slice(
    (safeAppointmentPage - 1) * APPOINTMENT_PAGE_SIZE,
    safeAppointmentPage * APPOINTMENT_PAGE_SIZE,
  );

  useEffect(() => {
    setAppointmentPage(1);
  }, [appointmentSearchQuery, appointmentManagementView, appointmentStatusFilter, selectedBranch]);

  const changeAppointmentPage = (nextPage: number) => {
    setAppointmentPage(nextPage);
  };

  useEffect(() => {
    setRentalPage(1);
  }, [rentalSearchQuery, rentalManagementView, rentalViewFilter, selectedBranch]);

  const changeRentalPage = (nextPage: number) => {
    setRentalPage(nextPage);
  };

  const customOrderQuery = customOrderSearchQuery.trim().toLowerCase();
  const filteredAdminCustomOrders = adminCustomOrders.filter((order) => {
    const isArchivedOrder = Boolean(order.isArchived);
    if (!matchesSelectedBranch(order.branch, selectedBranch)) return false;
    const matchesStatus = customOrderManagementView === 'archive'
      ? isArchivedOrder || order.status === 'rejected'
      : !isArchivedOrder && order.status === customOrderStatusFilter;
    if (!matchesStatus) return false;
    if (!customOrderQuery) return true;

    return [
      order.id,
      order._id,
      order.referenceId,
      order.customerName,
      order.email,
      order.contactNumber,
      order.orderType,
      order.branch,
      order.status,
      order.eventDate,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(customOrderQuery));
  });
  const customOrderTotalPages = Math.max(1, Math.ceil(filteredAdminCustomOrders.length / CUSTOM_ORDER_PAGE_SIZE));
  const safeCustomOrderPage = Math.min(customOrderPage, customOrderTotalPages);
  const paginatedAdminCustomOrders = filteredAdminCustomOrders.slice(
    (safeCustomOrderPage - 1) * CUSTOM_ORDER_PAGE_SIZE,
    safeCustomOrderPage * CUSTOM_ORDER_PAGE_SIZE,
  );

  useEffect(() => {
    setCustomOrderPage(1);
  }, [customOrderSearchQuery, customOrderManagementView, customOrderStatusFilter, selectedBranch]);

  const changeCustomOrderPage = (nextPage: number) => {
    setCustomOrderPage(nextPage);
  };

  const getAppointmentTypeLabel = (type: string) => {
    if (type === 'consultation') return 'Design Consultation';
    if (type === 'measurement') return 'Measurement Session';
    if (type === 'fitting') return 'Fitting Appointment';
    if (type === 'pickup') return 'Pickup/Return';
    return type;
  };

  const getCustomOrderStatusLabel = (status: string) => status
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  const getCustomOrderStatusBadgeClass = (status: AdminCustomOrderStatus) => {
    if (status === 'inquiry') return 'bg-amber-100 text-amber-800';
    if (status === 'design-approval') return 'bg-violet-100 text-violet-800';
    if (status === 'in-progress') return 'bg-blue-100 text-blue-800';
    if (status === 'fitting') return 'bg-cyan-100 text-cyan-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-green-100 text-green-800';
  };

  const getNextCustomOrderStatus = (status: AdminCustomOrderStatus): AdminCustomOrderStatus | null => {
    if (status === 'completed' || status === 'rejected') {
      return null;
    }

    const currentIndex = CUSTOM_ORDER_STATUS_OPTIONS.indexOf(status);
    if (currentIndex === -1 || currentIndex === CUSTOM_ORDER_STATUS_OPTIONS.length - 1) {
      return null;
    }

    return CUSTOM_ORDER_STATUS_OPTIONS[currentIndex + 1];
  };

  const formatCustomOrderBudget = (value: string | number | undefined) => {
    if (value === undefined || value === null) return 'N/A';

    const rawValue = String(value).trim();
    if (!rawValue) return 'N/A';

    const normalizedValue = rawValue.replace(/[₱,\s]/g, '');
    const numericValue = Number(normalizedValue);

    if (Number.isFinite(numericValue) && /^-?\d+(\.\d+)?$/.test(normalizedValue)) {
      return `₱${numericValue.toLocaleString()}`;
    }

    return rawValue;
  };

  const formatConsultationTimeLabel = (value: string | undefined | null) => {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';

    const match = rawValue.match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      return rawValue;
    }

    const hours24 = Number(match[1]);
    const minutes = match[2];
    if (!Number.isInteger(hours24) || hours24 < 0 || hours24 > 23) {
      return rawValue;
    }

    const meridiem = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    return `${hours12}:${minutes} ${meridiem}`;
  };

  const canAdvanceCustomOrderStatus = (order: AdminCustomOrderRecord | null) => {
    if (!order) return false;

    const nextStatus = getNextCustomOrderStatus(order.status);
    if (!nextStatus) {
      return false;
    }

    if (order.status !== 'design-approval' && order.status !== 'fitting') {
      return true;
    }

    const scheduledDate = order.status === 'design-approval'
      ? String(order.consultationDate || '').trim()
      : String(order.fittingDate || '').trim();
    if (!scheduledDate) {
      return false;
    }

    const today = new Date().toISOString().slice(0, 10);
    return scheduledDate <= today;
  };

  const getCustomOrderApproveDisabledReason = (order: AdminCustomOrderRecord | null) => {
    if (!order || (order.status !== 'design-approval' && order.status !== 'fitting')) {
      return '';
    }

    const isDesignApproval = order.status === 'design-approval';
    const scheduledDate = isDesignApproval
      ? String(order.consultationDate || '').trim()
      : String(order.fittingDate || '').trim();
    const scheduledTime = isDesignApproval
      ? String(order.consultationTime || '').trim()
      : String(order.fittingTime || '').trim();
    const scheduleLabel = isDesignApproval ? 'design consultation' : 'fitting appointment';

    if (!scheduledDate) {
      return `Waiting for the customer to schedule a ${scheduleLabel}.`;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (scheduledDate > today) {
      return `The ${scheduleLabel} is scheduled on ${scheduledDate}${scheduledTime ? ` at ${formatConsultationTimeLabel(scheduledTime)}` : ''}.`;
    }

    return '';
  };

  const getCustomOrderConsultationScheduleMessage = (order: AdminCustomOrderRecord | null) => {
    if (!order || order.status !== 'design-approval') {
      return '';
    }

    const consultationDate = String(order.consultationDate || '').trim();
    const consultationTime = String(order.consultationTime || '').trim();
    if (!consultationDate) {
      return '';
    }

   
  };

  const getCustomOrderFittingScheduleMessage = (order: AdminCustomOrderRecord | null) => {
    if (!order || order.status !== 'fitting') {
      return '';
    }

    const fittingDate = String(order.fittingDate || '').trim();
    const fittingTime = String(order.fittingTime || '').trim();
    if (!fittingDate) {
      return '';
    }

  };

  const getCustomOrderRejectionReason = (order: AdminCustomOrderRecord | null) => {
    if (!order) return '';

    const directReason = String(order.rejectionReason || '').trim();
    if (directReason) {
      return directReason;
    }

    const orderId = String(order.id || order._id || '').trim();
    const referenceId = String(order.referenceId || '').trim().toUpperCase();

    const matchingHistoryEntry = adminHistory.find((entry) => {
      if (entry.action !== 'custom_order_status_updated') {
        return false;
      }

      const details = entry.details;
      if (!details || typeof details !== 'object') {
        return false;
      }

      const detailNewStatus = String(details.newStatus || '').trim().toLowerCase();
      if (detailNewStatus !== 'rejected') {
        return false;
      }

      const detailOrderId = String(details.customOrderId || '').trim();
      const detailReferenceId = String(details.customOrderReferenceId || '').trim().toUpperCase();

      return (orderId && detailOrderId === orderId) || (referenceId && detailReferenceId === referenceId);
    });

    if (!matchingHistoryEntry || !matchingHistoryEntry.details || typeof matchingHistoryEntry.details !== 'object') {
      return '';
    }

    return String(matchingHistoryEntry.details.reason || '').trim();
  };

  const adminHistoryActionButtonClass = 'px-4 inline-flex items-center justify-center rounded-lg border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors';
  const adminHistoryClearFiltersButtonClass = `${adminHistoryActionButtonClass} py-2 whitespace-nowrap`;

  useEffect(() => {
    setAdminHistoryPage(1);
  }, [adminHistorySearchQuery, adminHistoryFrom, adminHistoryTo, adminHistoryFromTime, adminHistoryToTime]);

  const changeAdminHistoryPage = (nextPage: number) => {
    setAdminHistoryPage(nextPage);
  };

  const notificationMethodText = notificationMethod === 'both'
    ? 'SMS and Email'
    : notificationMethod === 'sms'
      ? 'SMS'
      : 'Email';

  const reminderMessage = selectedRental
    ? selectedRental.status === 'pending'
      ? `Dear ${selectedRental.customer}, this is a follow-up regarding your rental request for '${selectedRental.gownName}'. Your request is currently pending review with Hannah Vanessa Boutique. Please keep your phone and email available for the next update. Thank you!`
      : selectedRental.status === 'for-payment'
        ? `Dear ${selectedRental.customer}, this is a follow-up for your rental of '${selectedRental.gownName}'. Your rental is currently awaiting payment. Please settle the required payment so we can proceed with the next step. Thank you!`
        : selectedRental.status === 'for-pickup'
          ? `Dear ${selectedRental.customer}, this is a follow-up for your rental of '${selectedRental.gownName}'. Your rental is ready for pickup. Please check your scheduled pickup details and coordinate with Hannah Vanessa Boutique if you need any changes. Thank you!`
      : `Dear ${selectedRental.customer}, this is a friendly reminder that your rented gown '${selectedRental.gownName}' is due for return on ${selectedRental.dueDate}. ${selectedRental.daysLate > 0 ? `You currently have a late fee of ₱${(selectedRental.daysLate * RENTAL_LATE_FEE_PER_DAY).toLocaleString()}. ` : ''}Please return it to Hannah Vanessa Boutique at your earliest convenience. Thank you!`
    : '';

  // Notification Handler
  const handleSendNotification = () => {
    if (!selectedRental) return;

    setShowNotificationModal(false);
    setIsSendReminderConfirmOpen(true);
  };

  const handleConfirmSendNotification = () => {
    if (!selectedRental) return;

    setIsSendReminderConfirmOpen(false);
    setShowNotificationModal(false);
    setIsReminderSentSuccessOpen(true);
  };

  const handleDismissReminderSentSuccess = () => {
    setIsReminderSentSuccessOpen(false);
    setSelectedRental(null);
    setNotificationMethod('both');
  };

  return (
    <div className="min-h-screen py-8 px-4 bg-[#FAF7F0]">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-light mb-2">Admin Dashboard</h1>
          <p className="text-[#6B5D4F]">Manage your boutique operations across all branches</p>
        </div>

        {/* Branch Selector */}
        <div className="mb-6">
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="px-6 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors bg-white"
          >
            <option value="All Branches">All Branches</option>
            <option value="Taguig Main">Taguig Main - Cadena de Amor</option>
            <option value="BGC Branch">BGC Branch</option>
            <option value="Makati Branch">Makati Branch</option>
            <option value="Quezon City">Quezon City</option>
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-[#E8DCC8]">
          <button
            onClick={() => setActiveTabWithHash('overview')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTabWithHash('inventory')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'inventory'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Inventory
          </button>
          <button
            onClick={() => setActiveTabWithHash('rentals')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'rentals'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Rentals
          </button>
          <button
            onClick={() => setActiveTabWithHash('appointments')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'appointments'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Appointments
          </button>
          <button
            onClick={() => setActiveTabWithHash('bespoke')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'bespoke'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Bespoke
          </button>
          <button
            onClick={() => setActiveTabWithHash('users')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'users'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTabWithHash('history')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Admin History
          </button>
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-[#E8DCC8]">
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="w-8 h-8 text-[#D4AF37] text-3xl leading-none inline-flex items-center justify-center"
                    role="img"
                    aria-label="Philippine Peso"
                  >
                    ₱
                  </span>
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-sm text-[#6B5D4F] mb-1">Inventory Value</p>
                <p className="text-2xl font-light">₱{totalInventoryValue.toLocaleString()}</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-[#E8DCC8]">
                <Package className="w-8 h-8 text-[#D4AF37] mb-4" />
                <p className="text-sm text-[#6B5D4F] mb-1">Total Products</p>
                <p className="text-2xl font-light">{totalProducts}</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-[#E8DCC8]">
                <AlertCircle className="w-8 h-8 text-[#D4AF37] mb-4" />
                <p className="text-sm text-[#6B5D4F] mb-1">Low Stock Items</p>
                <p className="text-2xl font-light">{totalLowStock}</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-[#E8DCC8]">
                <Users className="w-8 h-8 text-[#D4AF37] mb-4" />
                <p className="text-sm text-[#6B5D4F] mb-1">Out of Stock</p>
                <p className="text-2xl font-light">{totalOutOfStock}</p>
              </div>
            </div>

            {/* Branch Performance */}
            <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
              <h2 className="text-2xl font-light mb-6">Branch Performance</h2>
              {branchPerformanceError && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {branchPerformanceError}
                </div>
              )}
              {branchPerformanceLoading && (
                <div className="mb-4 text-sm text-[#6B5D4F]">Loading branch performance...</div>
              )}
              <div className="space-y-6">
                {branchStats.map((branch) => (
                  <div key={branch.branch} className="pt-1">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-[#6B5D4F]" />
                        <h3 className="font-medium">{branch.branch}</h3>
                      </div>
                      <span className="text-xl font-light">₱{branch.inventoryValue.toLocaleString()}</span>
                    </div>

                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div className="bg-[#FAF7F0] rounded-2xl border border-[#EDE1CE] shadow-sm px-4 py-4 md:px-5 md:py-5">
                        <p className="text-[#6B5D4F]">Total Products</p>
                        <p className="font-medium">{branch.totalProducts}</p>
                      </div>
                      <div className="bg-[#FAF7F0] rounded-2xl border border-[#EDE1CE] shadow-sm px-4 py-4 md:px-5 md:py-5">
                        <p className="text-[#6B5D4F]">Available</p>
                        <p className="font-medium text-green-600">{branch.availableProducts}</p>
                      </div>
                      <div className="bg-[#FAF7F0] rounded-2xl border border-[#EDE1CE] shadow-sm px-4 py-4 md:px-5 md:py-5">
                        <p className="text-[#6B5D4F]">Rented</p>
                        <p className="font-medium text-blue-600">{branch.rentedProducts}</p>
                      </div>
                      <div className="bg-[#FAF7F0] rounded-2xl border border-[#EDE1CE] shadow-sm px-4 py-4 md:px-5 md:py-5">
                        <p className="text-[#6B5D4F]">Low Stock</p>
                        <p className="font-medium text-amber-600">{branch.lowStockItems}</p>
                      </div>
                      <div className="bg-[#FAF7F0] rounded-2xl border border-[#EDE1CE] shadow-sm px-4 py-4 md:px-5 md:py-5">
                        <p className="text-[#6B5D4F]">Out of Stock</p>
                        <p className="font-medium text-red-600">{branch.outOfStockItems}</p>
                      </div>

                      <div className="hidden sm:block bg-transparent rounded-2xl border border-dashed border-[#EDE1CE] px-4 py-4 md:px-5 md:py-5" aria-hidden="true" />
                    </div>

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="bg-[#FAF7F0] rounded-2xl border border-[#EDE1CE] shadow-sm px-4 py-4 md:px-5 md:py-5">
                        <p className="text-[#6B5D4F]">Items Sold</p>
                        <p className="font-medium">{branch.totalItemsSold}</p>
                      </div>
                      <div className="bg-[#FAF7F0] rounded-2xl border border-[#EDE1CE] shadow-sm px-4 py-4 md:px-5 md:py-5">
                        <p className="text-[#6B5D4F]">Turnover Rate</p>
                        <p className="font-medium">{branch.inventoryTurnoverRate}</p>
                      </div>
                      <div className="bg-[#FAF7F0] rounded-2xl border border-[#EDE1CE] shadow-sm px-4 py-4 md:px-5 md:py-5">
                        <p className="text-[#6B5D4F]">Inventory Health</p>
                        <p className={`font-medium ${
                          branch.outOfStockItems > 0
                            ? 'text-red-600'
                            : branch.lowStockItems > 0
                              ? 'text-amber-600'
                              : 'text-green-600'
                        }`}>
                          {branch.outOfStockItems > 0
                            ? 'At Risk'
                            : branch.lowStockItems > 0
                              ? 'Watch'
                              : 'Healthy'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {!branchPerformanceLoading && branchStats.length === 0 && (
                  <p className="text-sm text-[#6B5D4F]">No branch inventory data available.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="space-y-6">
            {/* Header with Add Button */}
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-light">Inventory Management</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowAddItem(true)}
                  disabled={isArchiveView}
                  title={isArchiveView ? 'Switch back to active inventory to add a new gown' : 'Add a new gown'}
                  aria-label={isArchiveView ? 'Add New Gown disabled in archive view' : 'Add New Gown'}
                  className={`px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${
                    isArchiveView
                      ? 'bg-[#1a1a1a]/40 text-white/80 cursor-not-allowed'
                      : 'bg-[#1a1a1a] text-white hover:bg-[#D4AF37]'
                  }`}
                >
                  <Plus className="w-5 h-5" />
                  Add New Gown
                </button>
                <button
                  onClick={handleToggleArchiveView}
                  className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center gap-2"
                  aria-label={inventoryView === 'archive' ? 'Back to active inventory' : 'Show archive'}
                >
                  <Archive className="w-5 h-5" />
                  {inventoryView === 'archive' ? 'Back' : 'Archive'}
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <input
                type="text"
                placeholder="Search Inventory"
                value={inventorySearchQuery}
                onChange={(e) => setInventorySearchQuery(e.target.value)}
                className="px-4 py-2 border border-[#E8DCC8] rounded-lg focus:outline-none focus:border-[#D4AF37] w-full md:w-[380px] lg:w-[460px]"
              />
            </div>

            <p className="text-sm text-[#6B5D4F]">
              Hover over a product to preview its details.
            </p>

            <div className="text-sm text-[#6B5D4F]">
              Showing {inventoryCurrentPageCount} of {inventoryItemsForCurrentView.length} {inventoryItemsForCurrentView.length === 1 ? 'gown' : 'gowns'}
            </div>

            {/* Inventory status messages */}
            {inventoryError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {inventoryError}
              </div>
            )}
            {inventoryMessage && (
              <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                {inventoryMessage}
              </div>
            )}
            {inventoryView === 'archive' && archiveError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {archiveError}
              </div>
            )}
            {inventoryLoading && (
              <div className="py-12 text-center text-[#6B5D4F]">Loading inventory...</div>
            )}
            {inventoryView === 'archive' && archiveLoading && (
              <div className="py-12 text-center text-[#6B5D4F]">Loading archive...</div>
            )}

            {/* Inventory Table */}
            <div className="bg-white rounded-2xl border border-[#E8DCC8] overflow-hidden">
              <div style={{ height: '650px' }} className="overflow-y-auto overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#FAF7F0]">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">ID</th>
                      <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Name</th>
                      {inventoryView === 'archive' && <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Image</th>}
                      <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Category</th>
                      <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Color</th>
                      <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Price</th>
                      <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Branch</th>
                      {inventoryView === 'archive'
                        ? <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Deleted</th>
                        : <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Status</th>
                      }
                      <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8DCC8]">
                    {inventoryView === 'active' && !inventoryLoading && filteredInventory.length === 0 && (
                      <tr><td colSpan={8} className="px-6 py-8 text-center text-[#6B5D4F] text-sm">{inventoryQuery ? 'No inventory items match your search.' : 'No items in inventory. Add a gown to get started.'}</td></tr>
                    )}
                    {inventoryView === 'archive' && !archiveLoading && filteredArchivedItems.length === 0 && (
                      <tr><td colSpan={9} className="px-6 py-8 text-center text-[#6B5D4F] text-sm">{inventoryQuery ? 'No archived gowns match your search.' : 'No archived gowns found.'}</td></tr>
                    )}
                    {inventoryView === 'active' && paginatedInventoryItems.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-[#FAF7F0] transition-colors cursor-help"
                        onMouseEnter={() => handleInventoryRowHoverStart(item)}
                        onMouseLeave={() => handleInventoryRowHoverEnd(item.id)}
                      >
                        <td className="px-6 py-4 text-sm">{item.sku ?? item.id}</td>
                        <td className="px-6 py-4 text-sm font-medium">{item.name}</td>
                        <td className="px-6 py-4 text-sm text-[#6B5D4F]">{item.category}</td>
                        <td className="px-6 py-4 text-sm text-[#6B5D4F]">{item.color}</td>
                        <td className="px-6 py-4 text-sm">₱{item.price.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-[#6B5D4F]">{item.branch}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            item.status === 'available'
                              ? 'bg-green-100 text-green-800'
                              : item.status === 'rented'
                              ? 'bg-blue-100 text-blue-800'
                              : item.status === 'reserved'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                handleInventoryRowHoverEnd(item.id);
                                setEditingItem(item);
                              }}
                              className="p-2 hover:bg-[#FAF7F0] rounded-full transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4 text-[#6B5D4F]" />
                            </button>
                            <button
                              onClick={() => {
                                handleInventoryRowHoverEnd(item.id);
                                handleDeleteItem(item.id);
                              }}
                              className="p-2 hover:bg-red-50 rounded-full transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {inventoryView === 'archive' && paginatedInventoryItems.map((item) => (
                      <tr key={item.id} className="hover:bg-[#FAF7F0] transition-colors">
                        <td className="px-6 py-4 text-sm">{item.sku ?? item.id}</td>
                        <td className="px-6 py-4 text-sm font-medium">{item.name}</td>
                        <td className="px-6 py-4">
                          <div className="w-10 h-10 rounded-md bg-[#FAF7F0] border border-[#E8DCC8] overflow-hidden">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-[#9E8E80]">N/A</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#6B5D4F]">{item.category}</td>
                        <td className="px-6 py-4 text-sm text-[#6B5D4F]">{item.color}</td>
                        <td className="px-6 py-4 text-sm">₱{item.price.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-[#6B5D4F]">{item.branch}</td>
                        <td className="px-6 py-4 text-sm text-[#6B5D4F]">
                          {item.deletedAt ? new Date(item.deletedAt).toLocaleString() : 'Unknown'}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleRestoreItem(item.id)}
                            disabled={restoringItemId === item.id}
                            className="px-3 py-2 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <RotateCcw className="w-4 h-4" />
                            {restoringItemId === item.id ? 'Restoring...' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {inventoryItemsForCurrentView.length > INVENTORY_PAGE_SIZE && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-[#6B5D4F] leading-none">
                  Page {safeInventoryPage} of {inventoryTotalPages}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => changeInventoryPage(Math.max(1, safeInventoryPage - 1))}
                    disabled={safeInventoryPage === 1}
                    className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => changeInventoryPage(Math.min(inventoryTotalPages, safeInventoryPage + 1))}
                    disabled={safeInventoryPage === inventoryTotalPages}
                    className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'rentals' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-light">Rental Management</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={loadAdminRentals}
                  className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg"
                >
                  Refresh
                </button>
                <button
                  onClick={() => setRentalManagementView((prev) => (prev === 'active' ? 'archive' : 'active'))}
                  className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center gap-2"
                  aria-label={rentalManagementView === 'archive' ? 'Back to active rentals' : 'Show archived rentals'}
                >
                  <Archive className="w-5 h-5" />
                  {rentalManagementView === 'archive' ? 'Back' : 'Archive'}
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <input
                type="text"
                placeholder="Search Rental"
                value={rentalSearchQuery}
                onChange={(e) => setRentalSearchQuery(e.target.value)}
                className="px-4 py-2 border border-[#E8DCC8] rounded-lg focus:outline-none focus:border-[#D4AF37] w-full md:w-[380px] lg:w-[460px]"
              />
            </div>

            {adminRentalsError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status" aria-live="polite">
                {adminRentalsError}
              </div>
            )}

            <div
              style={{ height: '650px' }}
              className="bg-white rounded-2xl border border-[#E8DCC8] p-8 overflow-y-auto overflow-x-auto"
            >
              {rentalManagementView === 'active' && (
              <div className="flex flex-wrap gap-3 mb-6">
                <button
                  onClick={() => setRentalViewFilter('pending')}
                  className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                    rentalViewFilter === 'pending'
                      ? 'bg-amber-50 border-amber-200 text-amber-800 font-medium'
                      : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37]'
                  }`}
                >
                  Pending Rentals
                </button>
                <button
                  onClick={() => setRentalViewFilter('for-payment')}
                  className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                    rentalViewFilter === 'for-payment'
                      ? 'bg-amber-50 border-amber-200 text-amber-800 font-medium'
                      : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37]'
                  }`}
                >
                  For Payment
                </button>
                <button
                  onClick={() => setRentalViewFilter('for-pickup')}
                  className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                    rentalViewFilter === 'for-pickup'
                      ? 'bg-amber-50 border-amber-200 text-amber-800 font-medium'
                      : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37]'
                  }`}
                >
                  Schedule Pickup
                </button>
                <button
                  onClick={() => setRentalViewFilter('active')}
                  className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                    rentalViewFilter === 'active'
                      ? 'bg-amber-50 border-amber-200 text-amber-800 font-medium'
                      : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37]'
                  }`}
                >
                  Active Rentals
                </button>
                <button
                  onClick={() => setRentalViewFilter('returns')}
                  className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                    rentalViewFilter === 'returns'
                      ? 'bg-amber-50 border-amber-200 text-amber-800 font-medium'
                      : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37]'
                  }`}
                >
                  Pending Returns
                </button>
              </div>
              )}

              {rentalManagementView === 'archive' && (
                <p className="text-sm text-[#6B5D4F] mb-6">Showing all rental records from rental details.</p>
              )}

              {adminRentalsLoading && (
                <p className="text-center py-8 text-[#6B5D4F]" role="status" aria-live="polite">
                  Loading rental details...
                </p>
              )}

              {!adminRentalsLoading && rentalManagementView === 'active' && rentalViewFilter === 'pending' && (
                <div className="space-y-3">
                  {paginatedPendingRentalCards.map((rental) => (
                    <div
                      key={rental.id}
                      className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{rental.gownName}</h4>
                            <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs rounded-full font-medium">
                              Pending
                            </span>
                          </div>
                          <div className="flex items-center gap-6 text-sm text-[#6B5D4F]">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{rental.customerName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>Ends: {rental.endDate}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm text-[#6B5D4F] mb-1">Total Rental</p>
                            <p className="text-lg font-light">₱{rental.totalPrice.toLocaleString()}</p>
                          </div>
                          <button
                            onClick={() => {
                              const full = adminRentals.find((r) => r.id === rental.id) ?? null;
                              setSelectedPendingRental(full);
                              setShowPendingRentalModal(true);
                            }}
                            className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-white border border-[#6B5D4F] text-[#3D2B1F] hover:bg-[#FAF7F0] whitespace-nowrap"
                            title="View Rental Details"
                          >
                            <span className="text-sm">View Details</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredPendingRentalCards.length === 0 && (
                    <p className="text-center py-8 text-[#6B5D4F]">{rentalQuery ? 'No pending rentals match your search' : 'No pending rentals'}</p>
                  )}
                </div>
              )}

              {!adminRentalsLoading && rentalManagementView === 'active' && rentalViewFilter === 'active' && (
                <div className="space-y-3">
                  {paginatedActiveRentalCards.map((rental) => (
                    <div
                      key={rental.id}
                      className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{rental.gownName}</h4>
                            <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs rounded-full font-medium">
                              Active
                            </span>
                          </div>
                          <div className="flex items-center gap-6 text-sm text-[#6B5D4F]">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{rental.customerName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{rental.branch}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>Ends: {rental.endDate}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm text-[#6B5D4F] mb-1">Total Rental</p>
                            <p className="text-lg font-light">₱{rental.totalPrice.toLocaleString()}</p>
                          </div>
                          {isWithinReturnFollowUpWindow(rental.endDate) && (
                            <button
                              onClick={() => openRentalFollowUp(createRentalFollowUpTarget(rental))}
                              className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] whitespace-nowrap"
                              title="Send Follow Up"
                            >
                              <Send className="w-4 h-4" />
                              <span className="text-sm">Follow Up</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const full = adminRentals.find((r) => r.id === rental.id) ?? null;
                              setSelectedPendingRental(full);
                              setShowPendingRentalModal(true);
                            }}
                            className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-white border border-[#6B5D4F] text-[#3D2B1F] hover:bg-[#FAF7F0] whitespace-nowrap"
                            title="View Rental Details"
                          >
                            <span className="text-sm">View Details</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredActiveRentalCards.length === 0 && (
                    <p className="text-center py-8 text-[#6B5D4F]">{rentalQuery ? 'No active rentals match your search' : 'No active rentals'}</p>
                  )}
                </div>
              )}

              {!adminRentalsLoading && rentalManagementView === 'active' && rentalViewFilter === 'for-payment' && (
                <div className="space-y-3">
                  {paginatedForPaymentRentals.map((rental) => (
                    <div
                      key={rental.id}
                      className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{rental.gownName}</h4>
                            <span
                              className={`px-3 py-1 text-xs rounded-full font-medium ${
                                rental.status === 'paid_for_confirmation'
                                  ? 'bg-violet-100 text-violet-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {rental.status === 'paid_for_confirmation' ? 'Paid - For Confirmation' : 'For Payment'}
                            </span>
                          </div>
                          <div className="flex items-center gap-6 text-sm text-[#6B5D4F]">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{rental.customerName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>Ends: {rental.endDate}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs text-[#6B5D4F] mb-1">Balance Due</p>
                            <p className="text-lg font-light text-rose-700">
                              ₱{Math.max(0, rental.totalPrice - rental.downpayment).toLocaleString()}
                            </p>
                          </div>
                          {rental.status !== 'paid_for_confirmation' && (
                            <button
                              onClick={() => openRentalFollowUp({
                                id: rental.id,
                                gownName: rental.gownName,
                                customer: rental.customerName,
                                dueDate: rental.endDate,
                                daysLate: 0,
                                status: 'for-payment',
                              })}
                              className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] whitespace-nowrap"
                              title="Send Follow Up"
                            >
                              <Send className="w-4 h-4" />
                              <span className="text-sm">Follow Up</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedPendingRental(rental);
                              setShowPendingRentalModal(true);
                            }}
                            className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-white border border-[#6B5D4F] text-[#3D2B1F] hover:bg-[#FAF7F0] whitespace-nowrap"
                            title="View Rental Details"
                          >
                            <span className="text-sm">View Details</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredForPaymentRentals.length === 0 && (
                    <p className="text-center py-8 text-[#6B5D4F]">{rentalQuery ? 'No rentals for payment match your search' : 'No rentals for payment'}</p>
                  )}
                </div>
              )}

              {!adminRentalsLoading && rentalManagementView === 'active' && rentalViewFilter === 'for-pickup' && (
                <div className="space-y-3">
                  {paginatedForPickupRentals.map((rental) => (
                    <div
                      key={rental.id}
                      className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{rental.gownName}</h4>
                            <span className="px-3 py-1 bg-cyan-100 text-cyan-800 text-xs rounded-full font-medium">
                              {getRentalStatusLabel(rental)}
                            </span>
                          </div>
                          <div className="flex items-center gap-6 text-sm text-[#6B5D4F]">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{rental.customerName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{rental.branch}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>Start: {rental.startDate}</span>
                            </div>
                            {isPickupScheduled(rental) && (
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                <span>Pickup: {rental.pickupScheduleDate} {rental.pickupScheduleTime}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs text-[#6B5D4F] mb-1">Paid</p>
                            <p className="text-lg font-light text-cyan-700">₱{rental.totalPrice.toLocaleString()}</p>
                          </div>
                          <button
                            onClick={() => openRentalFollowUp({
                              id: rental.id,
                              gownName: rental.gownName,
                              customer: rental.customerName,
                              dueDate: rental.endDate,
                              daysLate: 0,
                              status: 'for-pickup',
                            })}
                            className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] whitespace-nowrap"
                            title="Send Follow Up"
                          >
                            <Send className="w-4 h-4" />
                            <span className="text-sm">Follow Up</span>
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPendingRental(rental);
                              setShowPendingRentalModal(true);
                            }}
                            className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-white border border-[#6B5D4F] text-[#3D2B1F] hover:bg-[#FAF7F0] whitespace-nowrap"
                            title="View Rental Details"
                          >
                            <span className="text-sm">View Details</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredForPickupRentals.length === 0 && (
                    <p className="text-center py-8 text-[#6B5D4F]">{rentalQuery ? 'No rentals for pick up match your search' : 'No rentals for pick up'}</p>
                  )}
                </div>
              )}

              {!adminRentalsLoading && rentalManagementView === 'active' && rentalViewFilter === 'returns' && (
                <div className="space-y-3">
                  {paginatedPendingReturns.map((rental) => (
                    <div
                      key={rental.id}
                      className={`p-4 rounded-lg border transition-colors ${
                        rental.daysLate > 0
                          ? 'border-red-300 bg-red-50/30'
                          : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{rental.gownName}</h4>
                            {rental.daysLate > 0 && (
                              <span className="px-3 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">
                                {rental.daysLate} {rental.daysLate === 1 ? 'day' : 'days'} late
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-6 text-sm text-[#6B5D4F]">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{rental.customer}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>Due: {rental.dueDate}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {rental.daysLate > 0 && (
                            <div className="text-right">
                              <p className="text-xs text-[#6B5D4F] mb-1">Late Fee</p>
                              <p className="text-lg font-light text-red-600">
                                ₱{(rental.daysLate * RENTAL_LATE_FEE_PER_DAY).toLocaleString()}
                              </p>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              openRentalFollowUp({
                                id: rental.id,
                                gownName: rental.gownName,
                                customer: rental.customer,
                                dueDate: rental.dueDate,
                                daysLate: rental.daysLate,
                                status: 'active',
                              });
                            }}
                            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                              rental.daysLate > 0
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'bg-[#D4AF37] text-white hover:bg-[#1a1a1a]'
                            }`}
                            title="Send Return Reminder"
                          >
                            <Send className="w-4 h-4" />
                            <span className="text-sm">Follow Up</span>
                          </button>
                          <button
                            onClick={() => {
                              const full = adminRentals.find((r) => r.id === rental.id) ?? null;
                              setSelectedPendingRental(full);
                              setShowPendingRentalModal(true);
                            }}
                            className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-white border border-[#6B5D4F] text-[#3D2B1F] hover:bg-[#FAF7F0]"
                            title="View Rental Details"
                          >
                            <span className="text-sm">View Details</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredPendingReturns.length === 0 && (
                    <p className="text-center py-8 text-[#6B5D4F]">{rentalQuery ? 'No pending returns match your search' : 'No pending returns'}</p>
                  )}
                </div>
              )}

              {!adminRentalsLoading && rentalManagementView === 'archive' && (
                <div className="space-y-3">
                  {paginatedArchivedRentalCards.map((rental) => (
                    <div
                      key={rental.id}
                      className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{rental.gownName}</h4>
                            <span
                              style={isCancelledRentalStatus(rental.status) ? { backgroundColor: '#fee2e2', color: '#991b1b' } : undefined}
                              className={`px-3 py-1 text-xs rounded-full font-medium ${
                                rental.status === 'completed'
                                  ? 'bg-green-100 text-green-800'
                                  : isCancelledRentalStatus(rental.status)
                                  ? 'bg-red-100 text-red-800'
                                  : rental.status === 'for_payment'
                                  ? 'bg-rose-100 text-rose-800'
                                  : rental.status === 'paid_for_confirmation'
                                  ? 'bg-violet-100 text-violet-800'
                                  : rental.status === 'for_pickup'
                                  ? 'bg-cyan-100 text-cyan-800'
                                  : rental.status === 'active'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {rental.status === 'paid_for_confirmation'
                                ? 'Paid - For Confirmation'
                                : rental.status
                                    .split('_')
                                    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                                    .join(' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-6 text-sm text-[#6B5D4F]">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{rental.customerName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{rental.branch}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>Ended: {rental.endDate}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm text-[#6B5D4F] mb-1">Total Rental</p>
                            <p className="text-lg font-light">₱{rental.totalPrice.toLocaleString()}</p>
                          </div>
                          <button
                            onClick={() => {
                              const full = adminRentals.find((r) => r.id === rental.id) ?? null;
                              setSelectedPendingRental(full);
                              setShowPendingRentalModal(true);
                            }}
                            className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-white border border-[#6B5D4F] text-[#3D2B1F] hover:bg-[#FAF7F0] whitespace-nowrap"
                            title="View Rental Details"
                          >
                            <span className="text-sm">View Details</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredArchivedRentalCards.length === 0 && (
                    <p className="text-center py-8 text-[#6B5D4F]">{rentalQuery ? 'No rental records match your search' : 'No rental records found'}</p>
                  )}
                </div>
              )}

              {!adminRentalsLoading && rentalItemsForCurrentView.length > RENTAL_PAGE_SIZE && (
                <div className="mt-6 flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-[#6B5D4F]">
                    Page {safeRentalPage} of {rentalTotalPages}
                  </p>
                  <div className="flex justify-end gap-3 md:ml-auto">
                    <button
                      type="button"
                      onClick={() => changeRentalPage(Math.max(1, safeRentalPage - 1))}
                      disabled={safeRentalPage === 1}
                      className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => changeRentalPage(Math.min(rentalTotalPages, safeRentalPage + 1))}
                      disabled={safeRentalPage === rentalTotalPages}
                      className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {hoverPreviewItem && (
          <GownDetailsModal
            gown={toInventoryPreviewDetails(hoverPreviewItem)}
            isAdmin={true}
            onClose={() => setHoverPreviewItem(null)}
            onBookRental={() => {}}
            onScheduleFitting={() => {}}
          />
        )}

        {activeTab === 'appointments' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-light">Appointment Management</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={loadAdminAppointments}
                  className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg"
                >
                  Refresh
                </button>
                <button
                  onClick={() => setAppointmentManagementView((prev) => (prev === 'active' ? 'archive' : 'active'))}
                  className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center gap-2"
                  aria-label={appointmentManagementView === 'archive' ? 'Back to active appointments' : 'Show archived appointments'}
                >
                  <Archive className="w-5 h-5" />
                  {appointmentManagementView === 'archive' ? 'Back' : 'Archive'}
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <input
                type="text"
                placeholder="Search Appointment"
                value={appointmentSearchQuery}
                onChange={(e) => setAppointmentSearchQuery(e.target.value)}
                className="px-4 py-2 border border-[#E8DCC8] rounded-lg focus:outline-none focus:border-[#D4AF37] w-full md:w-[380px] lg:w-[460px]"
              />
            </div>

            {adminAppointmentsError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {adminAppointmentsError}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8 overflow-x-auto">
              {appointmentManagementView === 'active' && (
                <div className="flex flex-wrap gap-3 mb-6">
                  <button
                    onClick={() => setAppointmentStatusFilter('pending')}
                    className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                      appointmentStatusFilter === 'pending'
                        ? 'bg-amber-50 border-amber-200 text-amber-800 font-medium'
                        : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37]'
                    }`}
                  >
                    Pending Appointments
                  </button>
                  <button
                    onClick={() => setAppointmentStatusFilter('scheduled')}
                    className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                      appointmentStatusFilter === 'scheduled'
                        ? 'bg-blue-50 border-blue-200 text-blue-800 font-medium'
                        : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37]'
                    }`}
                  >
                    Scheduled
                  </button>
                </div>
              )}

              {appointmentManagementView === 'archive' && (
                <p className="text-sm text-[#6B5D4F] mb-6">Showing archived appointments.</p>
              )}

              {adminAppointmentsLoading && (
                <p className="text-center py-8 text-[#6B5D4F]">Loading appointments...</p>
              )}

              {!adminAppointmentsLoading && appointmentManagementView === 'active' && appointmentStatusFilter === 'pending' && (
                <div className="space-y-3">
                  {paginatedAppointments.map((appointment) => (
                    <div key={appointment.id} className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{getAppointmentTypeLabel(appointment.type)}</h4>
                            <span className={`px-3 py-1 text-xs rounded-full font-medium ${
                              appointment.rescheduleReason
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {appointment.rescheduleReason ? 'Rescheduled' : 'Pending'}
                            </span>
                          </div>
                          <div className="grid md:grid-cols-3 gap-3 text-sm text-[#6B5D4F] mb-3">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{appointment.customerName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4" />
                              <span>{appointment.customerEmail}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4" />
                              <span>{appointment.contactNumber}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>{appointment.date}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>{appointment.time}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{appointment.branch}</span>
                            </div>
                          </div>
                          {appointment.selectedGownName && (
                            <p className="text-sm text-[#6B5D4F] mb-2">Gown: {appointment.selectedGownName}</p>
                          )}
                          {appointment.notes && (
                            <p className="text-sm text-[#6B5D4F] italic mb-2">{appointment.notes}</p>
                          )}
                          {appointment.rescheduleReason && (
                            <div className="mb-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                              <span className="font-medium">Reschedule reason: </span>
                              <span>{appointment.rescheduleReason}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setAdminAppointmentsError(null);
                              setSelectedPendingAppointment(appointment);
                              setIsApproveAppointmentConfirmOpen(true);
                            }}
                            disabled={appointmentStatusUpdatingId === appointment.id}
                            className="px-4 py-2 rounded-lg bg-black text-white hover:bg-[#D4AF37] transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {appointmentStatusUpdatingId === appointment.id ? 'Updating...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => {
                              setAdminAppointmentsError(null);
                              setAppointmentCancelError(null);
                              setAppointmentCancelReason('');
                              setSelectedCancelAppointment(appointment);
                              setIsCancelAppointmentConfirmOpen(true);
                            }}
                            disabled={appointmentStatusUpdatingId === appointment.id}
                            className="px-4 py-2 rounded-lg border border-red-300 text-red-600 hover:border-red-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {appointmentItemsForCurrentView.length === 0 && (
                    <p className="text-center py-8 text-[#6B5D4F]">
                      {appointmentQuery ? 'No pending appointments match your search' : 'No pending appointments'}
                    </p>
                  )}
                </div>
              )}

              {!adminAppointmentsLoading && appointmentManagementView === 'active' && appointmentStatusFilter === 'scheduled' && (
                <div className="space-y-3">
                  {paginatedAppointments.map((appointment) => (
                    <div key={appointment.id} className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{getAppointmentTypeLabel(appointment.type)}</h4>
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">Scheduled</span>
                          </div>
                          <div className="grid md:grid-cols-3 gap-3 text-sm text-[#6B5D4F] mb-3">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{appointment.customerName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4" />
                              <span>{appointment.customerEmail}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4" />
                              <span>{appointment.contactNumber}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>{appointment.date}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>{appointment.time}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{appointment.branch}</span>
                            </div>
                          </div>
                          {appointment.selectedGownName && (
                            <p className="text-sm text-[#6B5D4F] mb-2">Gown: {appointment.selectedGownName}</p>
                          )}
                          {appointment.notes && (
                            <p className="text-sm text-[#6B5D4F] italic">{appointment.notes}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setAdminAppointmentsError(null);
                              setSelectedScheduledAppointment(appointment);
                              setIsCompleteAppointmentConfirmOpen(true);
                            }}
                            disabled={appointmentStatusUpdatingId === appointment.id}
                            className="px-4 py-2 rounded-lg bg-black text-white hover:bg-[#D4AF37] transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {appointmentStatusUpdatingId === appointment.id ? 'Updating...' : 'Complete'}
                          </button>
                          <button
                            onClick={() => {
                              setAdminAppointmentsError(null);
                              setAppointmentCancelError(null);
                              setAppointmentCancelReason('');
                              setSelectedCancelAppointment(appointment);
                              setIsCancelAppointmentConfirmOpen(true);
                            }}
                            disabled={appointmentStatusUpdatingId === appointment.id}
                            className="px-4 py-2 rounded-lg border border-red-300 text-red-600 hover:border-red-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {appointmentItemsForCurrentView.length === 0 && (
                    <p className="text-center py-8 text-[#6B5D4F]">
                      {appointmentQuery ? 'No scheduled appointments match your search' : 'No scheduled appointments'}
                    </p>
                  )}
                </div>
              )}

              {!adminAppointmentsLoading && appointmentManagementView === 'archive' && (
                <div className="space-y-3">
                  {paginatedAppointments.map((appointment) => (
                    <div key={appointment.id} className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{getAppointmentTypeLabel(appointment.type)}</h4>
                            <span className={`px-3 py-1 text-xs rounded-full font-medium ${
                              appointment.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                            </span>
                          </div>
                          <div className="grid md:grid-cols-3 gap-3 text-sm text-[#6B5D4F] mb-3">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{appointment.customerName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4" />
                              <span>{appointment.customerEmail}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4" />
                              <span>{appointment.contactNumber}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>{appointment.date}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>{appointment.time}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{appointment.branch}</span>
                            </div>
                          </div>
                          {appointment.selectedGownName && (
                            <p className="text-sm text-[#6B5D4F] mb-2">Gown: {appointment.selectedGownName}</p>
                          )}
                          {appointment.notes && (
                            <p className="text-sm text-[#6B5D4F] italic">{appointment.notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {appointmentItemsForCurrentView.length === 0 && (
                    <p className="text-center py-8 text-[#6B5D4F]">
                      {appointmentQuery ? 'No archived appointments match your search' : 'No archived appointments yet'}
                    </p>
                  )}
                </div>
              )}

              {!adminAppointmentsLoading && appointmentItemsForCurrentView.length > 0 && (
                <div className="mt-8 flex items-center justify-between gap-4 pt-6">
                  <p className="text-sm text-[#6B5D4F]">
                    Page {safeAppointmentPage} of {appointmentTotalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => changeAppointmentPage(Math.max(1, safeAppointmentPage - 1))}
                      disabled={safeAppointmentPage === 1}
                      className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => changeAppointmentPage(Math.min(appointmentTotalPages, safeAppointmentPage + 1))}
                      disabled={safeAppointmentPage === appointmentTotalPages}
                      className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'bespoke' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center gap-4">
              <h2 className="text-2xl font-light">Bespoke Management</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={loadAdminCustomOrders}
                  className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg"
                >
                  Refresh
                </button>
                <button
                  onClick={() => setCustomOrderManagementView((prev) => (prev === 'active' ? 'archive' : 'active'))}
                  className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center gap-2"
                  aria-label={customOrderManagementView === 'archive' ? 'Back to active custom orders' : 'Show archived custom orders'}
                >
                  <Archive className="w-5 h-5" />
                  {customOrderManagementView === 'archive' ? 'Back' : 'Archive'}
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <input
                type="text"
                placeholder="Search Custom Orders"
                value={customOrderSearchQuery}
                onChange={(e) => setCustomOrderSearchQuery(e.target.value)}
                className="px-4 py-2 border border-[#E8DCC8] rounded-lg focus:outline-none focus:border-[#D4AF37] w-full md:w-[380px] lg:w-[460px]"
              />
            </div>

            {customOrderManagementView === 'active' && (
              <div className="flex flex-wrap gap-3">
                {CUSTOM_ORDER_FILTER_TABS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setCustomOrderStatusFilter(status)}
                    className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                      customOrderStatusFilter === status
                        ? 'bg-amber-50 border-amber-200 text-amber-800 font-medium'
                        : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37]'
                    }`}
                  >
                    {status === 'fitting' ? 'Fitting Appointment' : getCustomOrderStatusLabel(status)}
                  </button>
                ))}
              </div>
            )}

            {customOrderManagementView === 'archive' && (
              <p className="text-sm text-[#6B5D4F]">Showing archived custom orders.</p>
            )}

            {adminCustomOrdersError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {adminCustomOrdersError}
              </div>
            )}

            <div
              style={{ height: '650px' }}
              className="bg-white rounded-2xl border border-[#E8DCC8] p-8 overflow-y-auto overflow-x-auto"
            >
              {adminCustomOrdersLoading && (
                <p className="text-center py-8 text-[#6B5D4F]">Loading custom orders...</p>
              )}

              {!adminCustomOrdersLoading && filteredAdminCustomOrders.length === 0 && (
                <p className="text-center py-8 text-[#6B5D4F]">
                  {customOrderManagementView === 'archive'
                    ? (customOrderQuery ? 'No archived custom orders match your search.' : 'No archived custom orders yet.')
                    : (customOrderQuery || adminCustomOrders.length > 0
                        ? 'No custom orders match your filters.'
                        : 'No custom orders yet.')}
                </p>
              )}

              {!adminCustomOrdersLoading && filteredAdminCustomOrders.length > 0 && (
                <div className="space-y-3">
                  {paginatedAdminCustomOrders.map((order) => {
                    const orderId = String(order.id || order._id || '');
                    const orderReferenceId = String(order.referenceId || orderId || '').trim();

                    return (
                      <div key={orderId} className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <h4 className="font-medium">{order.orderType || 'Custom Order'}</h4>
                              <span className={`px-3 py-1 text-xs rounded-full font-medium ${getCustomOrderStatusBadgeClass(order.status)}`}>
                                {getCustomOrderStatusLabel(order.status)}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-6 text-sm text-[#6B5D4F]">
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                <span>{order.customerName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4" />
                                <span>{order.email || 'No email'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4" />
                                <span>{order.contactNumber || 'No phone'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                <span>{order.branch || 'No branch'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                <span>Event: {order.eventDate || 'Not set'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                <span>Order Reference ID: {orderReferenceId || 'N/A'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right min-w-[120px]">
                              <p className="text-sm text-[#6B5D4F] mb-1">Budget</p>
                              <p className="text-lg font-light">{formatCustomOrderBudget(order.budget)}</p>
                            </div>
                            <button
                              onClick={() => setSelectedCustomOrder(order)}
                              className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-white border border-[#6B5D4F] text-[#3D2B1F] hover:bg-[#FAF7F0] whitespace-nowrap"
                            >
                              <span className="text-sm">View Details</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!adminCustomOrdersLoading && filteredAdminCustomOrders.length > CUSTOM_ORDER_PAGE_SIZE && (
                <div className="mt-6 flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-[#6B5D4F]">
                    Page {safeCustomOrderPage} of {customOrderTotalPages}
                  </p>
                  <div className="flex justify-end gap-3 md:ml-auto">
                    <button
                      type="button"
                      onClick={() => changeCustomOrderPage(Math.max(1, safeCustomOrderPage - 1))}
                      disabled={safeCustomOrderPage === 1}
                      className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => changeCustomOrderPage(Math.min(customOrderTotalPages, safeCustomOrderPage + 1))}
                      disabled={safeCustomOrderPage === customOrderTotalPages}
                      className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-light">User Management</h2>
              <div className="flex gap-2 shrink-0">
                {!showArchivedUsersOnly && !isCurrentUserStaff && (
                  <button
                    onClick={() => {
                      setNewUserError(null);
                      setShowAddUserModal(true);
                    }}
                    className="px-6 py-3 min-w-[150px] rounded-lg flex items-center justify-center gap-2 whitespace-nowrap transition-colors bg-[#1a1a1a] text-white hover:bg-[#D4AF37]"
                  >
                    <Plus className="w-5 h-5" />
                    Add User
                  </button>
                )}
                <button
                  onClick={() => setShowArchivedUsersOnly((prev) => !prev)}
                  className={`px-6 py-3 rounded-lg flex items-center gap-2 transition-colors border ${
                    showArchivedUsersOnly
                      ? 'bg-[#EDE1CE] text-[#5B4A36] border-[#D4AF37]'
                      : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black'
                  }`}
                >
                  <Archive className="w-5 h-5" />
                  {showArchivedUsersOnly ? 'Back' : 'Archive'}
                </button>
                <button
                  onClick={loadUsers}
                  className="px-6 py-3 rounded-lg border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <input
                type="text"
                placeholder="Search User"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 border border-[#E8DCC8] rounded-lg focus:outline-none focus:border-[#D4AF37] w-full md:w-[380px] lg:w-[460px]"
              />
            </div>

            {showArchivedUsersOnly && (
              <p className="text-sm text-[#6B5D4F]">Showing archived users only.</p>
            )}

            {usersError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {usersError}
              </div>
            )}

            {usersMessage && (
              <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                {usersMessage}
              </div>
            )}

            {/* Stats */}
            <div className="grid md:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => setUserFilter('all')}
                className={`text-left bg-white p-6 rounded-2xl border transition-colors ${
                  userFilter === 'all' ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/20' : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                }`}
              >
                <p className="text-sm text-[#6B5D4F] mb-1">Total Users</p>
                <p className="text-2xl font-light">{users.length}</p>
              </button>
              <button
                type="button"
                onClick={() => setUserFilter('admin')}
                className={`text-left bg-white p-6 rounded-2xl border transition-colors ${
                  userFilter === 'admin' ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/20' : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                }`}
              >
                <p className="text-sm text-[#6B5D4F] mb-1">Admin Accounts</p>
                <p className="text-2xl font-light text-[#1a1a1a]">{users.filter(u => u.role === 'Admin').length}</p>
              </button>
              <button
                type="button"
                onClick={() => setUserFilter('staff')}
                className={`text-left bg-white p-6 rounded-2xl border transition-colors ${
                  userFilter === 'staff' ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/20' : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                }`}
              >
                <p className="text-sm text-[#6B5D4F] mb-1">Staff Accounts</p>
                <p className="text-2xl font-light text-[#1a1a1a]">{users.filter(u => u.role === 'Staff').length}</p>
              </button>
              <button
                type="button"
                onClick={() => setUserFilter('customer')}
                className={`text-left bg-white p-6 rounded-2xl border transition-colors ${
                  userFilter === 'customer' ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/20' : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                }`}
              >
                <p className="text-sm text-[#6B5D4F] mb-1">Customer Accounts</p>
                <p className="text-2xl font-light text-[#1a1a1a]">{users.filter(u => u.role === 'Customer').length}</p>
              </button>
            </div>

            {/* Users List */}
            <div className="space-y-4">
              {usersLoading && (
                <p className="text-center py-8 text-[#6B5D4F]">Loading users...</p>
              )}
              {!usersLoading && filteredUsers.length === 0 && (
                <p className="text-center py-8 text-[#6B5D4F]">No users found for the selected filters.</p>
              )}
              {paginatedUsers.map((user) => (
                <div key={user.id} className="bg-white rounded-2xl border border-[#E8DCC8] p-6 hover:border-[#D4AF37] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-full bg-[#D4AF37] text-white flex items-center justify-center font-medium">
                        {(user.firstName || user.email || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-medium">{`${user.firstName} ${user.lastName}`.trim() || 'Unnamed User'}</h3>
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#EDE1CE] text-[#5B4A36]">
                            {user.role}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            user.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {user.status === 'active' ? 'Active' : 'Archived'}
                          </span>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4 text-sm text-[#6B5D4F]">
                          <div className="flex items-center gap-2">
                            <Mail className="w-3 h-3" />
                            <span>{user.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="w-3 h-3" />
                            <span>{user.phone}</span>
                          </div>
                          <div>
                            <span>Joined: {user.joinDate}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="px-4 py-2 text-sm bg-[#FAF7F0] hover:bg-[#E8DCC8] rounded-lg transition-colors"
                      >
                        View Details
                      </button>
                      {showArchivedUsersOnly ? (
                        <button
                          onClick={() => handleRestoreUser(user)}
                          disabled={restoringUserId === user.id}
                          className="px-3 py-2 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RotateCcw className="w-4 h-4" />
                          {restoringUserId === user.id ? 'Restoring...' : 'Restore'}
                        </button>
                      ) : (
                        (() => {
                          const isElevatedTarget = user.role === 'Admin' || user.role === 'Staff';
                          const isSelfAdmin = isElevatedTarget && user.id === currentUserId;
                          const isStaffRestricted = isCurrentUserStaff && isElevatedTarget;
                          const archiveTitle = isSelfAdmin
                            ? 'You cannot archive your own account'
                            : isStaffRestricted
                              ? 'Staff accounts cannot archive admin or staff accounts'
                              : undefined;
                          return (
                        <button
                          onClick={() => handleArchiveUser(user)}
                          disabled={user.status === 'archived' || archivingUserId === user.id || isSelfAdmin || isStaffRestricted}
                          className="px-4 py-2 text-sm bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={archiveTitle}
                        >
                          {user.status === 'archived'
                            ? 'Archived'
                            : isSelfAdmin
                              ? 'Logged In'
                            : isStaffRestricted
                              ? 'Restricted'
                            : archivingUserId === user.id
                              ? 'Archiving...'
                              : 'Archive'}
                        </button>
                          );
                        })()
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {filteredUsers.length > USER_PAGE_SIZE && (
                <div className="flex flex-col gap-3 border-t border-[#E8DCC8] px-2 py-4 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-[#6B5D4F]">
                    Page {safeUserPage} of {userTotalPages}
                  </p>
                  <div className="flex justify-end gap-3 md:ml-auto">
                    <button
                      type="button"
                      onClick={() => changeUserPage(Math.max(1, safeUserPage - 1))}
                      disabled={safeUserPage === 1}
                      className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => changeUserPage(Math.min(userTotalPages, safeUserPage + 1))}
                      disabled={safeUserPage === userTotalPages}
                      className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-light">Admin History</h2>
              <button
                onClick={loadAdminHistory}
                className={`${adminHistoryActionButtonClass} py-2`}
              >
                Refresh
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setAdminHistorySearchQuery('');
                    setAdminHistoryFrom('');
                    setAdminHistoryTo('');
                    setAdminHistoryFromTime('');
                    setAdminHistoryToTime('');
                  }}
                  className={adminHistoryClearFiltersButtonClass}
                >
                  Clear Filters
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#8A7A69]">From</label>
                  <input
                    type="date"
                    value={adminHistoryFrom}
                    onChange={(e) => setAdminHistoryFrom(e.target.value)}
                    className="px-4 py-2 border border-[#E8DCC8] rounded-lg focus:outline-none focus:border-[#D4AF37] bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#8A7A69]">From Time</label>
                  <input
                    type="text"
                    value={adminHistoryFromTime}
                    onChange={(e) => setAdminHistoryFromTime(e.target.value)}
                    placeholder="e.g. 9:30 AM or 14:30"
                    aria-invalid={!isFromTimeValid}
                    className="px-3 py-2 w-full md:w-44 border border-[#E8DCC8] rounded-lg focus:outline-none focus:border-[#D4AF37] bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#8A7A69]">To</label>
                  <input
                    type="date"
                    value={adminHistoryTo}
                    onChange={(e) => setAdminHistoryTo(e.target.value)}
                    className="px-4 py-2 border border-[#E8DCC8] rounded-lg focus:outline-none focus:border-[#D4AF37] bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#8A7A69]">To Time</label>
                  <input
                    type="text"
                    value={adminHistoryToTime}
                    onChange={(e) => setAdminHistoryToTime(e.target.value)}
                    placeholder="e.g. 6:00 PM or 18:00"
                    aria-invalid={!isToTimeValid}
                    className="px-3 py-2 w-full md:w-44 border border-[#E8DCC8] rounded-lg focus:outline-none focus:border-[#D4AF37] bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <input
                type="text"
                placeholder="Search Admin History"
                value={adminHistorySearchQuery}
                onChange={(e) => setAdminHistorySearchQuery(e.target.value)}
                className="px-4 py-2 border border-[#E8DCC8] rounded-lg focus:outline-none focus:border-[#D4AF37] w-full md:w-[380px] lg:w-[460px]"
              />
            </div>

            {(!isFromTimeValid || !isToTimeValid) && (
              <p className="text-sm text-red-600">
                Invalid time format. Use HH:mm (24-hour) or h:mm AM/PM.
              </p>
            )}

            {adminHistoryError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {adminHistoryError}
              </div>
            )}

            {adminHistoryLoading && (
              <p className="text-center py-8 text-[#6B5D4F]">Loading admin history...</p>
            )}

            {!adminHistoryLoading && !adminHistoryError && filteredAdminHistory.length === 0 && (
              <p className="text-center py-8 text-[#6B5D4F]">
                {adminHistory.length === 0 ? 'No admin actions recorded yet.' : 'No admin actions match the selected filters.'}
              </p>
            )}

            {!adminHistoryLoading && filteredAdminHistory.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E8DCC8] overflow-hidden">
                <div style={{ height: '650px' }} className="overflow-y-auto overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead className="bg-[#FAF7F0] sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Admin</th>
                        <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Action</th>
                        <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Date / Time</th>
                        <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DCC8]">
                      {paginatedAdminHistory.map((entry) => (
                        <tr key={entry.id} className="hover:bg-[#FAF7F0] transition-colors align-top">
                          <td className="px-6 py-4 text-sm">
                            <p className="font-medium">{entry.adminLabel || 'Admin'}</p>
                            {entry.adminEmail && <p className="text-[#6B5D4F]">{entry.adminEmail}</p>}
                          </td>
                          <td className="px-6 py-4 text-sm">{formatHistoryAction(entry.action)}</td>
                          <td className="px-6 py-4 text-sm text-[#6B5D4F]">
                            {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-sm text-[#6B5D4F] break-words">
                            {formatHistoryDetails(entry)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredAdminHistory.length > ADMIN_HISTORY_PAGE_SIZE && (
                  <div className="flex flex-col gap-3 border-t border-[#E8DCC8] px-6 py-4 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-[#6B5D4F]">
                      Page {safeAdminHistoryPage} of {adminHistoryTotalPages}
                    </p>
                    <div className="flex justify-end gap-3 md:ml-auto">
                      <button
                        type="button"
                        onClick={() => changeAdminHistoryPage(Math.max(1, safeAdminHistoryPage - 1))}
                        disabled={safeAdminHistoryPage === 1}
                        className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => changeAdminHistoryPage(Math.min(adminHistoryTotalPages, safeAdminHistoryPage + 1))}
                        disabled={safeAdminHistoryPage === adminHistoryTotalPages}
                        className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Add/Edit Item Modal */}
        {(showAddItem || editingItem) && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-2xl font-light mb-6">
                {editingItem ? 'Edit Gown' : 'Add New Gown'}
              </h3>

              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Gown Name *</label>
                    <input
                      type="text"
                      required={!editingItem}
                      aria-invalid={!editingItem && Boolean(addItemErrors.name)}
                      aria-describedby={!editingItem && addItemErrors.name ? 'add-item-name-error' : undefined}
                      value={editingItem?.name || newItem.name}
                      onChange={(e) => editingItem 
                        ? setEditingItem({ ...editingItem, name: e.target.value })
                        : (setNewItem({ ...newItem, name: e.target.value }), setAddItemErrors(prev => ({ ...prev, name: '' })))
                      }
                      className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.name ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                      placeholder="e.g., Midnight Elegance"
                    />
                    {!editingItem && addItemErrors.name && <p id="add-item-name-error" className="text-sm text-red-600 mt-1">{addItemErrors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Category *</label>
                    <select
                      required={!editingItem}
                      aria-invalid={!editingItem && Boolean(addItemErrors.category)}
                      aria-describedby={!editingItem && addItemErrors.category ? 'add-item-category-error' : undefined}
                      value={editingItem?.category || newItem.category}
                      onChange={(e) => editingItem
                        ? setEditingItem({ ...editingItem, category: e.target.value })
                        : (setNewItem({ ...newItem, category: e.target.value }), setAddItemErrors(prev => ({ ...prev, category: '' })))
                      }
                      className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.category ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                    >
                      <option value="Evening Gown">Evening Gown</option>
                      <option value="Wedding Dress">Wedding Dress</option>
                      <option value="Ball Gown">Ball Gown</option>
                      <option value="Cocktail Dress">Cocktail Dress</option>
                    </select>
                    {!editingItem && addItemErrors.category && <p id="add-item-category-error" className="text-sm text-red-600 mt-1">{addItemErrors.category}</p>}
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Color *</label>
                    <input
                      type="text"
                      required={!editingItem}
                      aria-invalid={!editingItem && Boolean(addItemErrors.color)}
                      aria-describedby={!editingItem && addItemErrors.color ? 'add-item-color-error' : undefined}
                      value={editingItem?.color || newItem.color}
                      onChange={(e) => editingItem
                        ? setEditingItem({ ...editingItem, color: e.target.value })
                        : (setNewItem({ ...newItem, color: e.target.value }), setAddItemErrors(prev => ({ ...prev, color: '' })))
                      }
                      className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.color ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                      placeholder="e.g., Navy Blue"
                    />
                    {!editingItem && addItemErrors.color && <p id="add-item-color-error" className="text-sm text-red-600 mt-1">{addItemErrors.color}</p>}
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Price (per day) *</label>
                    <input
                      type="number"
                      required={!editingItem}
                      min={1}
                      aria-invalid={!editingItem && Boolean(addItemErrors.price)}
                      aria-describedby={!editingItem && addItemErrors.price ? 'add-item-price-error' : undefined}
                      value={editingItem?.price || newItem.price}
                      onChange={(e) => editingItem
                        ? setEditingItem({ ...editingItem, price: Number(e.target.value) })
                        : (setNewItem({ ...newItem, price: Number(e.target.value) }), setAddItemErrors(prev => ({ ...prev, price: '' })))
                      }
                      className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.price ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                      placeholder="3500"
                    />
                    {!editingItem && addItemErrors.price && <p id="add-item-price-error" className="text-sm text-red-600 mt-1">{addItemErrors.price}</p>}
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Branch *</label>
                    <select
                      required={!editingItem}
                      aria-invalid={!editingItem && Boolean(addItemErrors.branch)}
                      aria-describedby={!editingItem && addItemErrors.branch ? 'add-item-branch-error' : undefined}
                      value={editingItem?.branch || newItem.branch}
                      onChange={(e) => editingItem
                        ? setEditingItem({ ...editingItem, branch: e.target.value })
                        : (setNewItem({ ...newItem, branch: e.target.value }), setAddItemErrors(prev => ({ ...prev, branch: '' })))
                      }
                      className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.branch ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                    >
                      <option value="Taguig Main">Taguig Main</option>
                      <option value="BGC Branch">BGC Branch</option>
                      <option value="Makati Branch">Makati Branch</option>
                      <option value="Quezon City">Quezon City</option>
                    </select>
                    {!editingItem && addItemErrors.branch && <p id="add-item-branch-error" className="text-sm text-red-600 mt-1">{addItemErrors.branch}</p>}
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Status *</label>
                    <select
                      required={!editingItem}
                      aria-invalid={!editingItem && Boolean(addItemErrors.status)}
                      aria-describedby={!editingItem && addItemErrors.status ? 'add-item-status-error' : undefined}
                      value={editingItem?.status || newItem.status}
                      onChange={(e) => editingItem
                        ? setEditingItem({ ...editingItem, status: e.target.value as any })
                        : (setNewItem({ ...newItem, status: e.target.value as any }), setAddItemErrors(prev => ({ ...prev, status: '' })))
                      }
                      className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.status ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                    >
                      <option value="available">Available</option>
                      <option value="rented">Rented</option>
                      <option value="reserved">Reserved</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                    {!editingItem && addItemErrors.status && <p id="add-item-status-error" className="text-sm text-red-600 mt-1">{addItemErrors.status}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Stock Quantity</label>
                  <input
                    type="number"
                    required={!editingItem}
                    min={1}
                    aria-invalid={!editingItem && Boolean(addItemErrors.stock)}
                    aria-describedby={!editingItem && addItemErrors.stock ? 'add-item-stock-error' : undefined}
                    value={editingItem?.stock ?? newItem.stock ?? 1}
                    onChange={(e) => editingItem
                      ? setEditingItem({ ...editingItem, stock: Number(e.target.value) })
                      : (setNewItem({ ...newItem, stock: Number(e.target.value) }), setAddItemErrors(prev => ({ ...prev, stock: '' })))
                    }
                    className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.stock ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                    placeholder="1"
                  />
                  {!editingItem && addItemErrors.stock && <p id="add-item-stock-error" className="text-sm text-red-600 mt-1">{addItemErrors.stock}</p>}
                </div>

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Product Image</label>

                  {/* Preview */}
                  {(editingItem?.image || newItem.image) && (
                    <div className="mb-3 relative w-full h-40 rounded-lg overflow-hidden border border-[#E8DCC8] bg-[#FAF7F0] flex items-center justify-center">
                      <img
                        src={editingItem?.image ?? newItem.image ?? ''}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}

                  {/* Mode toggle */}
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => { setImageInputMode('url'); setImageUploadError(null); }}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border transition-colors ${
                        imageInputMode === 'url'
                          ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                          : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#1a1a1a]'
                      }`}
                    >
                      <Link className="w-3.5 h-3.5" />
                      Image URL
                    </button>
                    <button
                      type="button"
                      onClick={() => { setImageInputMode('file'); setImageUploadError(null); }}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border transition-colors ${
                        imageInputMode === 'file'
                          ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                          : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#1a1a1a]'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload File
                    </button>
                  </div>

                  {imageInputMode === 'url' ? (
                    <input
                      type="text"
                      required={!editingItem}
                      aria-invalid={!editingItem && Boolean(addItemErrors.image)}
                      aria-describedby={!editingItem && addItemErrors.image ? 'add-item-image-error' : undefined}
                      value={editingItem?.image ?? newItem.image ?? ''}
                      onChange={(e) => editingItem
                        ? setEditingItem({ ...editingItem, image: e.target.value })
                        : (setNewItem({ ...newItem, image: e.target.value }), setAddItemErrors(prev => ({ ...prev, image: '' })))
                      }
                      className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.image ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                      placeholder="https://..."
                    />
                  ) : (
                    <label
                      htmlFor="image-upload"
                      className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg transition-colors ${
                        isUploadingImage
                          ? 'border-[#E8DCC8] bg-[#FAF7F0] cursor-not-allowed'
                          : 'border-[#E8DCC8] cursor-pointer hover:border-[#D4AF37] hover:bg-[#FAF7F0]'
                      }`}
                    >
                      {isUploadingImage ? (
                        <span className="text-sm text-[#6B5D4F]">Uploading...</span>
                      ) : (
                        <>
                          <Upload className="w-7 h-7 text-[#6B5D4F] mb-2" />
                          <span className="text-sm text-[#6B5D4F]">Click to upload or drag &amp; drop</span>
                          <span className="text-xs text-[#9E8E80] mt-1">JPG or PNG — max 5 MB</span>
                        </>
                      )}
                      <input
                        id="image-upload"
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        onChange={handleImageFileChange}
                        disabled={isUploadingImage}
                      />
                    </label>
                  )}

                  {imageUploadError && (
                    <p className="mt-2 text-sm text-red-600">{imageUploadError}</p>
                  )}
                  {!editingItem && addItemErrors.image && !imageUploadError && (
                    <p id="add-item-image-error" className="mt-2 text-sm text-red-600">{addItemErrors.image}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Description</label>
                  <textarea
                    rows={3}
                    required={!editingItem}
                    aria-invalid={!editingItem && Boolean(addItemErrors.description)}
                    aria-describedby={!editingItem && addItemErrors.description ? 'add-item-description-error' : undefined}
                    value={editingItem?.description ?? newItem.description ?? ''}
                    onChange={(e) => editingItem
                      ? setEditingItem({ ...editingItem, description: e.target.value })
                      : (setNewItem({ ...newItem, description: e.target.value }), setAddItemErrors(prev => ({ ...prev, description: '' })))
                    }
                    className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] resize-none ${!editingItem && addItemErrors.description ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                    placeholder="Brief description of the gown..."
                  />
                  {!editingItem && addItemErrors.description && <p id="add-item-description-error" className="text-sm text-red-600 mt-1">{addItemErrors.description}</p>}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setEditingItem(null);
                      setShowAddItem(false);
                      setAddItemErrors({});
                      resetImageModal();
                    }}
                    className="flex-1 px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={editingItem ? handleUpdateItem : handleAddItem}
                    className="flex-1 px-6 py-3 bg-[#1a1a1a] text-white rounded-lg hover:bg-[#D4AF37] transition-colors"
                  >
                    {editingItem ? 'Update' : 'Add'} Gown
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete/Restore Confirmation Modal */}
        {confirmAction && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm inventory action"
            onClick={() => {
              if (!isConfirmingAction) setConfirmAction(null);
            }}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">
                {confirmAction.type === 'delete' ? 'Confirm Delete' : 'Confirm Restore'}
              </h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                {confirmAction.type === 'delete'
                  ? 'Are you sure you want to delete this gown?'
                  : 'Are you sure you want to restore this gown?'}
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6">
                <p className="font-medium">{confirmAction.item.name}</p>
                <p className="text-sm text-[#6B5D4F]">{confirmAction.item.sku}</p>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  ref={cancelConfirmButtonRef}
                  onClick={() => setConfirmAction(null)}
                  disabled={isConfirmingAction}
                  autoFocus
                  aria-label="Cancel action"
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  ref={primaryConfirmButtonRef}
                  onClick={() => {
                    if (confirmAction.type === 'delete') {
                      handleConfirmDelete(confirmAction.item);
                    } else {
                      handleConfirmRestore(confirmAction.item);
                    }
                  }}
                  disabled={isConfirmingAction}
                  aria-label={confirmAction.type === 'delete' ? 'Confirm delete gown' : 'Confirm restore gown'}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConfirmingAction
                    ? (confirmAction.type === 'delete' ? 'Deleting...' : 'Restoring...')
                    : (confirmAction.type === 'delete' ? 'Yes, Delete' : 'Yes, Restore')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Archive User Confirmation Modal */}
        {confirmUserArchive && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm archive user"
            onClick={() => {
              if (!isConfirmingUserArchive) setConfirmUserArchive(null);
            }}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Confirm Archive</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">Are you sure you want to archive this user account?</p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6">
                <p className="font-medium">{`${confirmUserArchive.firstName} ${confirmUserArchive.lastName}`.trim() || 'Unnamed User'}</p>
                <p className="text-sm text-[#6B5D4F]">{confirmUserArchive.email}</p>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  onClick={() => setConfirmUserArchive(null)}
                  disabled={isConfirmingUserArchive}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmArchiveUser}
                  disabled={isConfirmingUserArchive}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConfirmingUserArchive ? 'Archiving...' : 'Yes, Archive'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Restore User Confirmation Modal */}
        {confirmUserRestore && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm restore user"
            onClick={() => {
              if (!isConfirmingUserRestore) setConfirmUserRestore(null);
            }}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Confirm Restore</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">Are you sure you want to restore this user account?</p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6">
                <p className="font-medium">{`${confirmUserRestore.firstName} ${confirmUserRestore.lastName}`.trim() || 'Unnamed User'}</p>
                <p className="text-sm text-[#6B5D4F]">{confirmUserRestore.email}</p>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  onClick={() => setConfirmUserRestore(null)}
                  disabled={isConfirmingUserRestore}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRestoreUser}
                  disabled={isConfirmingUserRestore}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConfirmingUserRestore ? 'Restoring...' : 'Yes, Restore'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* User Detail Modal */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-8">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-2xl font-light">User Details</h3>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* User Info */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-[#D4AF37] text-white flex items-center justify-center text-2xl font-medium">
                    {(selectedUser.firstName || selectedUser.email || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xl font-medium mb-1">{`${selectedUser.firstName} ${selectedUser.lastName}`.trim() || 'Unnamed User'}</h4>
                    <p className="text-sm text-[#6B5D4F] mb-2">
                      {formatUserDisplayId(selectedUser.id, selectedUser.role) || selectedUser.id}
                    </p>
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-[#EDE1CE] text-[#5B4A36] mr-2">
                      {selectedUser.role}
                    </span>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      selectedUser.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {selectedUser.status === 'active' ? 'Active' : 'Archived'}
                    </span>
                  </div>
                </div>

                {/* Contact & Stats */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-[#6B5D4F] mb-1">Email</p>
                      <p className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-[#6B5D4F]" />
                        {selectedUser.email}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-[#6B5D4F] mb-1">Phone</p>
                      <p className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-[#6B5D4F]" />
                        {selectedUser.phone}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-[#6B5D4F] mb-1">Join Date</p>
                      <p className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#6B5D4F]" />
                        {selectedUser.joinDate}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-[#FAF7F0] p-4 rounded-lg">
                      <p className="text-sm text-[#6B5D4F] mb-1">Account Type</p>
                      <p className="text-2xl font-light">{selectedUser.role}</p>
                    </div>
                    <div className="bg-[#FAF7F0] p-4 rounded-lg">
                      <p className="text-sm text-[#6B5D4F] mb-1">Status</p>
                      <p className="text-2xl font-light">{selectedUser.status === 'active' ? 'Active' : 'Archived'}</p>
                    </div>
                    <div className="bg-[#FAF7F0] p-4 rounded-lg">
                      <p className="text-sm text-[#6B5D4F] mb-1">Last Activity</p>
                      <p className="text-sm">{selectedUser.lastActivity}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add User Modal */}
        {showAddUserModal && !isCurrentUserStaff && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-4 relative">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-light">Add User</h2>
                <button
                  onClick={() => {
                    if (creatingUser) return;
                    setShowAddUserModal(false);
                  }}
                  className="p-1 hover:bg-[#FAF7F0] rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {newUserError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {newUserError}
                </div>
              )}

              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleCreateUser();
                }}
              >
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Account Type</label>
                    <select
                      value={newUserForm.role}
                      onChange={(e) => setNewUserForm((prev) => ({ ...prev, role: e.target.value as ManagedUserRole }))}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    >
                      <option value="Customer">Customer</option>
                      <option value="Staff">Staff</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Email</label>
                    <input
                      type="email"
                      value={newUserForm.email}
                      onChange={(e) => setNewUserForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                      placeholder="name@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">First Name</label>
                    <input
                      type="text"
                      value={newUserForm.firstName}
                      onChange={(e) => setNewUserForm((prev) => ({ ...prev, firstName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Last Name</label>
                    <input
                      type="text"
                      value={newUserForm.lastName}
                      onChange={(e) => setNewUserForm((prev) => ({ ...prev, lastName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                      placeholder="Last name"
                    />
                  </div>

                  {newUserForm.role === 'Customer' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm text-[#6B5D4F] mb-2">Phone Number</label>
                      <input
                        type="text"
                        value={newUserForm.phoneNumber}
                        onChange={(e) => setNewUserForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                        className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                        placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                      />
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <label className="block text-sm text-[#6B5D4F] mb-2">Password</label>
                    <input
                      type="password"
                      value={newUserForm.password}
                      onChange={(e) => setNewUserForm((prev) => ({ ...prev, password: e.target.value }))}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                      placeholder="Minimum 8 characters"
                    />
                  </div>
                </div>

                <div className="flex gap-4 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (creatingUser) return;
                      setShowAddUserModal(false);
                    }}
                    className="px-8 py-3 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="px-8 py-3 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors disabled:opacity-50"
                  >
                    {creatingUser ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Rental Details Modal */}
        {showPendingRentalModal && selectedPendingRental && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-light">Rental Details</h3>
                  <span
                    style={isCancelledRentalStatus(selectedPendingRental.status) ? { backgroundColor: '#fee2e2', color: '#991b1b' } : undefined}
                    className={`inline-block mt-1 px-3 py-1 text-xs rounded-full font-medium ${
                      selectedPendingRental.status === 'pending'
                        ? 'bg-amber-100 text-amber-800'
                        : selectedPendingRental.status === 'for_payment'
                        ? 'bg-rose-100 text-rose-800'
                        : selectedPendingRental.status === 'paid_for_confirmation'
                        ? 'bg-violet-100 text-violet-800'
                        : selectedPendingRental.status === 'for_pickup'
                        ? 'bg-cyan-100 text-cyan-800'
                        : isCancelledRentalStatus(selectedPendingRental.status)
                        ? 'bg-red-100 text-red-800'
                        : selectedPendingRental.status === 'active'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-[#EDE1CE] text-[#5B4A36]'
                    }`}
                  >
                    {getRentalStatusLabel(selectedPendingRental)}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setShowPendingRentalModal(false);
                    setSelectedPendingRental(null);
                  }}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5">
                {/* Gown Info */}
                <div className="bg-[#FAF7F0] p-4 rounded-xl">
                  <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Gown</p>
                  <p className="text-lg font-medium text-[#3D2B1F]">{selectedPendingRental.gownName}</p>
                  <p className="text-sm text-[#6B5D4F] mt-0.5">SKU: {selectedPendingRental.sku}</p>
                  <p className="text-sm text-[#6B5D4F] mt-0.5">Reference ID: {selectedPendingRental.referenceId || selectedPendingRental.id}</p>
                </div>

                {/* Customer Info */}
                <div className="bg-[#FAF7F0] p-4 rounded-xl">
                  <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-3">Customer</p>
                  <div className="space-y-1.5 text-sm text-[#6B5D4F]">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 shrink-0" />
                      <span>{selectedPendingRental.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#9C8B7A]">Email:</span>
                      <span>{selectedPendingRental.customerEmail}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#9C8B7A]">Contact:</span>
                      <span>{selectedPendingRental.contactNumber}</span>
                    </div>
                  </div>
                </div>

                {/* Rental Period */}
                <div className="bg-[#FAF7F0] p-4 rounded-xl">
                  <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-3">Rental Period</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-[#9C8B7A] mb-0.5">Start Date</p>
                      <p className="font-medium text-[#3D2B1F]">{selectedPendingRental.startDate}</p>
                    </div>
                    <div>
                      <p className="text-[#9C8B7A] mb-0.5">End Date</p>
                      <p className="font-medium text-[#3D2B1F]">{selectedPendingRental.endDate}</p>
                    </div>
                    <div>
                      <p className="text-[#9C8B7A] mb-0.5">Branch</p>
                      <p className="font-medium text-[#3D2B1F]">{selectedPendingRental.branch}</p>
                    </div>
                    <div>
                      <p className="text-[#9C8B7A] mb-0.5">Event Type</p>
                      <p className="font-medium text-[#3D2B1F]">{selectedPendingRental.eventType}</p>
                    </div>
                    {isPickupScheduled(selectedPendingRental) && (
                      <>
                        <div>
                          <p className="text-[#9C8B7A] mb-0.5">Pickup Date</p>
                          <p className="font-medium text-[#3D2B1F]">{selectedPendingRental.pickupScheduleDate}</p>
                        </div>
                        <div>
                          <p className="text-[#9C8B7A] mb-0.5">Pickup Time</p>
                          <p className="font-medium text-[#3D2B1F]">{selectedPendingRental.pickupScheduleTime}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Payment */}
                <div className="bg-[#FAF7F0] p-4 rounded-xl">
                  <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-3">Payment</p>
                  <div className="flex justify-between text-sm">
                    <div>
                      <p className="text-[#9C8B7A] mb-0.5">Downpayment</p>
                      <p className="font-medium text-[#3D2B1F]">₱{selectedPendingRental.downpayment.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#9C8B7A] mb-0.5">Total Price</p>
                      <p className="text-lg font-medium text-[#3D2B1F]">₱{selectedPendingRental.totalPrice.toLocaleString()}</p>
                    </div>
                  </div>

                  {selectedPendingRental.paymentSubmittedAt && (
                    <div className="mt-4 border-t border-[#E8DCC8] pt-4 space-y-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <p className="text-[#9C8B7A]">Paid At</p>
                        <p className="font-medium text-right text-[#3D2B1F]">
                          {new Date(selectedPendingRental.paymentSubmittedAt).toLocaleString()}
                        </p>
                      </div>
                      {selectedPendingRental.paymentReferenceNumber && (
                        <div className="flex justify-between gap-4">
                          <p className="text-[#9C8B7A]">Reference Number</p>
                          <p className="font-medium text-right text-[#3D2B1F]">
                            {selectedPendingRental.paymentReferenceNumber}
                          </p>
                        </div>
                      )}

                      {selectedPendingRental.paymentReceiptUrl && (
                        <div>
                          <p className="text-[#9C8B7A] mb-2">Payment Receipt</p>
                          <a
                            href={selectedPendingRental.paymentReceiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block"
                          >
                            <img
                              src={selectedPendingRental.paymentReceiptUrl}
                              alt="Payment receipt"
                              className="w-full h-44 object-cover rounded-lg border border-[#E8DCC8]"
                            />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {rentalStatusError && (
                <p className="mt-4 text-sm text-red-600 text-center">{rentalStatusError}</p>
              )}

              <div className="mt-8 sticky bottom-0 bg-white pt-6 flex flex-wrap gap-3 relative">
                <div
                  className="absolute left-0 right-0 top-0 border-t border-[#E8DCC8]"
                  style={{ transform: 'translateY(-30px)' }}
                />
                <button
                  disabled={rentalStatusUpdating}
                  onClick={() => {
                    setShowPendingRentalModal(false);
                    setSelectedPendingRental(null);
                    setRentalStatusError(null);
                    setRentalActionInProgress(null);
                    setIsApproveRentalConfirmOpen(false);
                    setIsRejectRentalConfirmOpen(false);
                    setIsPickedUpConfirmOpen(false);
                    setRejectRentalReason('');
                    setRejectRentalError(null);
                  }}
                  className="flex-1 min-w-[140px] py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                >
                  Close
                </button>
                {(selectedPendingRental.status === 'pending' || selectedPendingRental.status === 'for_payment' || selectedPendingRental.status === 'paid_for_confirmation') && (
                  <>
                    <button
                      disabled={rentalStatusUpdating}
                      onClick={() => {
                        setRejectRentalReason('');
                        setRejectRentalError(null);
                        setIsRejectRentalConfirmOpen(true);
                      }}
                      className="flex-1 min-w-[140px] py-3 border-2 border-[#E8DCC8] bg-red-100 text-[#B86A6A] rounded-xl hover:bg-red-200 transition-colors font-semibold disabled:opacity-50"
                    >
                      <span style={{ color: '#B86A6A', WebkitTextFillColor: '#B86A6A' }}>
                        Reject
                      </span>
                    </button>
                    {(selectedPendingRental.status === 'pending' || selectedPendingRental.status === 'paid_for_confirmation') && (
                      <button
                        disabled={rentalStatusUpdating}
                        onClick={() => {
                          setRentalStatusError(null);
                          setIsApproveRentalConfirmOpen(true);
                        }}
                        className="flex-1 min-w-[140px] py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-green-800 rounded-xl hover:bg-[#F2EADF] transition-colors font-semibold shadow-sm disabled:opacity-50"
                      >
                        {rentalActionInProgress === 'approve'
                          ? 'Processing...'
                          : (selectedPendingRental.status === 'paid_for_confirmation' ? 'Schedule Pickup' : 'Approve')}
                      </button>
                    )}
                  </>
                )}
                {selectedPendingRental.status === 'for_pickup' && isPickupScheduled(selectedPendingRental) && (
                  <button
                    disabled={rentalStatusUpdating}
                    onClick={() => {
                      setRentalStatusError(null);
                      setIsPickedUpConfirmOpen(true);
                    }}
                    className="flex-1 min-w-[140px] py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-cyan-800 rounded-xl hover:bg-[#F2EADF] transition-colors font-semibold shadow-sm disabled:opacity-50"
                  >
                    Picked Up
                  </button>
                )}
                {selectedPendingRental.status === 'active' && (
                  <button
                    disabled={rentalStatusUpdating}
                    onClick={() => {
                      setRentalStatusError(null);
                      setSelectedReturnRental({
                        id: selectedPendingRental.id,
                        gownName: selectedPendingRental.gownName,
                        customer: selectedPendingRental.customerName,
                        dueDate: selectedPendingRental.endDate,
                        daysLate: 0,
                      });
                      setIsItemReturnedConfirmOpen(true);
                    }}
                    className="flex-1 min-w-[140px] py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-green-800 rounded-xl hover:bg-[#F2EADF] transition-colors font-semibold shadow-sm disabled:opacity-50"
                  >
                    Item Returned
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Custom Order Details Modal */}
        {selectedCustomOrder && (() => {
          const rejectionReason = getCustomOrderRejectionReason(selectedCustomOrder);

          return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div
                className="bg-white rounded-2xl w-full px-6 pt-10 pb-4 overflow-y-auto"
              style={{ maxWidth: '750px', height: 'calc(75vh + 20px)' }}
            >
              <div style={{ height: '20px' }} />
              <div className="flex justify-between items-start mb-6 pl-4 pr-2">
                <div className="pr-4">
                  <div className="flex items-center gap-3" style={{ paddingLeft: '32px', paddingTop: '16px' }}>
                    <h3 className="text-2xl font-light">Custom Order Details</h3>
                    <span className={`inline-block px-3 py-1 text-xs rounded-full font-medium ${getCustomOrderStatusBadgeClass(selectedCustomOrder.status)}`}>
                      {getCustomOrderStatusLabel(selectedCustomOrder.status)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomOrder(null)}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 340px',
                  gap: '6px',
                  alignItems: 'start',
                }}
              >
                <div className="min-w-0 flex-1 space-y-5" style={{ paddingLeft: '32px' }}>
                  <div className="bg-[#FAF7F0] p-5 rounded-xl">
                    <p className="text-sm font-bold text-[#7F6D5C] uppercase tracking-wide mb-2">Order</p>
                    <p className="text-lg font-medium text-[#3D2B1F]">{selectedCustomOrder.orderType || 'Custom Order'}</p>
                    <div className="mt-3 grid gap-2 text-sm text-[#6B5D4F]">
                      <p><span className="font-medium text-[#3D2B1F]">Event Date:</span> {selectedCustomOrder.eventDate || 'Not set'}</p>
                      <p><span className="font-medium text-[#3D2B1F]">Branch:</span> {selectedCustomOrder.branch || 'No branch selected'}</p>
                      <p><span className="font-medium text-[#3D2B1F]">Budget:</span> {formatCustomOrderBudget(selectedCustomOrder.budget)}</p>
                      <p><span className="font-medium text-[#3D2B1F]">Order Reference ID:</span> {selectedCustomOrder.referenceId || selectedCustomOrder.id || selectedCustomOrder._id || 'N/A'}</p>
                      <p><span className="font-medium text-[#3D2B1F]">Design Consultation:</span> {selectedCustomOrder.consultationDate
                        ? `${selectedCustomOrder.consultationDate}${selectedCustomOrder.consultationTime ? ` at ${formatConsultationTimeLabel(selectedCustomOrder.consultationTime)}` : ''}`
                        : 'Not scheduled yet'}</p>
                      <p><span className="font-medium text-[#3D2B1F]">Fitting Appointment:</span> {selectedCustomOrder.fittingDate
                        ? `${selectedCustomOrder.fittingDate}${selectedCustomOrder.fittingTime ? ` at ${formatConsultationTimeLabel(selectedCustomOrder.fittingTime)}` : ''}`
                        : 'Not scheduled yet'}</p>
                    </div>
                  </div>

                  <div className="bg-[#FAF7F0] p-5 rounded-xl mt-6">
                    <p className="text-sm font-bold text-[#7F6D5C] uppercase tracking-wide mb-3">Customer</p>
                    <div className="grid gap-2 text-sm text-[#6B5D4F]">
                      <p><span className="font-medium text-[#3D2B1F]">Name:</span> {selectedCustomOrder.customerName}</p>
                      <p><span className="font-medium text-[#3D2B1F]">Email:</span> {selectedCustomOrder.email || 'No email'}</p>
                      <p><span className="font-medium text-[#3D2B1F]">Phone:</span> {selectedCustomOrder.contactNumber || 'No phone'}</p>
                    </div>
                  </div>

                  <div className="bg-[#FAF7F0] p-5 rounded-xl mt-6">
                    <p className="text-sm font-bold text-[#7F6D5C] uppercase tracking-wide mb-3">Design Notes</p>
                    <div className="space-y-3 text-sm text-[#6B5D4F]">
                      <p><span className="font-medium text-[#3D2B1F]">Preferred Colors:</span> {selectedCustomOrder.preferredColors || 'None provided'}</p>
                      <p><span className="font-medium text-[#3D2B1F]">Fabric Preference:</span> {selectedCustomOrder.fabricPreference || 'None provided'}</p>
                      <p><span className="font-medium text-[#3D2B1F]">Special Requests:</span> {selectedCustomOrder.specialRequests || 'None provided'}</p>
                    </div>
                  </div>
                </div>

                <div style={{ width: '180px' }} className="space-y-5">
                  <div className="bg-[#FAF7F0] p-4 rounded-xl flex flex-col">
                    <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-3">Design Inspiration</p>
                    {selectedCustomOrder.designImageUrl ? (
                      <div
                        className="rounded-xl border border-[#E8DCC8] bg-white overflow-y-auto overflow-x-hidden"
                        style={{ height: '400px', width: '300px' }}
                      >
                        <img
                          src={selectedCustomOrder.designImageUrl}
                          alt={`${selectedCustomOrder.orderType || 'Custom order'} inspiration`}
                          className="block w-full object-contain bg-white"
                          style={{ height: '600px' }}
                        />
                      </div>
                    ) : (
                      <div className="flex-1 min-h-[12rem] rounded-xl border border-dashed border-[#D8C8B2] bg-white/60 flex items-center justify-center text-sm text-[#8A7A69] text-center px-6">
                        No design inspiration image was provided for this custom order.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {selectedCustomOrder.status === 'rejected' && rejectionReason && (
                <div className="mt-6 px-8">
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <p className="font-semibold uppercase tracking-wide text-red-600">Reason for Rejection</p>
                    <p className="mt-1 whitespace-pre-wrap">{rejectionReason}</p>
                  </div>
                </div>
              )}

              {customOrderManagementView !== 'archive' && getCustomOrderConsultationScheduleMessage(selectedCustomOrder) && (
                <div className="mt-6 px-8">
                  <p className="text-sm text-[#6B5D4F]">
                    {getCustomOrderConsultationScheduleMessage(selectedCustomOrder)}
                  </p>
                </div>
              )}

              {customOrderManagementView !== 'archive' && getCustomOrderFittingScheduleMessage(selectedCustomOrder) && (
                <div className="mt-6 px-8">
                  <p className="text-sm text-[#6B5D4F]">
                    {getCustomOrderFittingScheduleMessage(selectedCustomOrder)}
                  </p>
                </div>
              )}

              {(customOrderManagementView !== 'archive' || selectedCustomOrder.status === 'completed') && (
                <div className="mt-8 sticky bottom-0 bg-white pt-6 pb-3 px-1 flex flex-wrap gap-3 relative">
                  {(() => {
                    const orderId = String(selectedCustomOrder.id || selectedCustomOrder._id || '');
                    const isUpdating = customOrderStatusUpdatingId === orderId;
                    const nextStatus = getNextCustomOrderStatus(selectedCustomOrder.status);
                    const canAdvance = canAdvanceCustomOrderStatus(selectedCustomOrder);
                    const approveDisabledReason = getCustomOrderApproveDisabledReason(selectedCustomOrder);
                    const canReject = selectedCustomOrder.status !== 'rejected' && selectedCustomOrder.status !== 'completed';
                    const isInquiryStage = selectedCustomOrder.status === 'inquiry';
                    const isCompletedOrder = selectedCustomOrder.status === 'completed';
                    const isArchivedCompletedOrder = isCompletedOrder && Boolean(selectedCustomOrder.isArchived);

                    return (
                      <>
                        <button
                          onClick={() => setSelectedCustomOrder(null)}
                          className="flex-1 min-w-[140px] py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium"
                        >
                          Close
                        </button>
                        {canReject && (
                          <button
                            onClick={() => {
                              if (!orderId || !canReject) return;
                              setAdminCustomOrdersError(null);
                              setRejectCustomOrderReason('');
                              setRejectCustomOrderError(null);
                              setIsRejectCustomOrderConfirmOpen(true);
                            }}
                            disabled={isUpdating || !canReject}
                            className="flex-1 min-w-[140px] py-3 border-2 border-red-200 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              {isUpdating && canReject ? (isInquiryStage ? 'Rejecting...' : 'Cancelling...') : (isInquiryStage ? 'Reject' : 'Cancel')}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (isArchivedCompletedOrder) {
                              setSelectedCustomOrder(null);
                              return;
                            }
                            if (isCompletedOrder) {
                              setAdminCustomOrdersError(null);
                              setIsArchiveCompletedCustomOrderConfirmOpen(true);
                              return;
                            }
                            if (!orderId || !nextStatus || !canAdvance) return;
                            setAdminCustomOrdersError(null);
                            setIsDoneCustomOrderConfirmOpen(true);
                          }}
                          disabled={isArchivedCompletedOrder ? false : isCompletedOrder ? isUpdating : isUpdating || !nextStatus || !canAdvance}
                          className="flex-1 min-w-[140px] py-3 border-2 border-[#E8DCC8] bg-[#1a1a1a] text-white rounded-xl hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          title={isCompletedOrder ? undefined : approveDisabledReason || undefined}
                        >
                          {isArchivedCompletedOrder
                            ? 'Done'
                            : isCompletedOrder
                            ? 'Done'
                            : isUpdating && !!nextStatus
                              ? 'Approving...'
                              : selectedCustomOrder?.status === 'inquiry'
                                ? 'Approve'
                                : 'Done'}
                        </button>
                              {isDoneCustomOrderConfirmOpen && selectedCustomOrder && (() => {
                                const nextStatus = getNextCustomOrderStatus(selectedCustomOrder.status);
                                if (!nextStatus || !canAdvanceCustomOrderStatus(selectedCustomOrder)) return null;

                                const orderId = String(selectedCustomOrder.id || selectedCustomOrder._id || '');
                                const isUpdating = customOrderStatusUpdatingId === orderId;

                                return (
                                  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                                    <div className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
                                      <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-2xl font-light">Confirm Mark as Done</h3>
                                        <button
                                          type="button"
                                          disabled={isUpdating}
                                          onClick={() => setIsDoneCustomOrderConfirmOpen(false)}
                                          className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                                          aria-label="Close done confirmation"
                                        >
                                          <X className="w-5 h-5" />
                                        </button>
                                      </div>

                                      <p className="text-sm text-[#6B5D4F] mb-4">
                                        This will move the custom order to {getCustomOrderStatusLabel(nextStatus)}.
                                      </p>

                                      <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                                        <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Custom Order</p>
                                        <p className="font-medium text-[#3D2B1F]">{selectedCustomOrder.orderType || 'Custom Order'}</p>
                                        <p className="text-sm text-[#6B5D4F]">Customer: {selectedCustomOrder.customerName}</p>
                                        <p className="text-sm text-[#6B5D4F]">Next Status: {getCustomOrderStatusLabel(nextStatus)}</p>
                                      </div>

                                      {adminCustomOrdersError && (
                                        <p className="mb-4 text-sm text-red-600">{adminCustomOrdersError}</p>
                                      )}

                                      <div className="mt-6 flex gap-3">
                                        <button
                                          type="button"
                                          disabled={isUpdating}
                                          onClick={() => setIsDoneCustomOrderConfirmOpen(false)}
                                          className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isUpdating}
                                          onClick={async () => {
                                            setIsDoneCustomOrderConfirmOpen(false);
                                            await handleConfirmApproveCustomOrder();
                                          }}
                                          className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-green-800 rounded-xl hover:bg-[#F2EADF] transition-colors font-semibold shadow-sm disabled:opacity-50"
                                        >
                                          {isUpdating ? 'Processing...' : 'Yes, Approve'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {isRejectCustomOrderConfirmOpen && selectedCustomOrder && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
              {(() => {
                const isInquiryStage = selectedCustomOrder.status === 'inquiry';

                return (
                  <>
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-light">{isInquiryStage ? 'Confirm Rejection' : 'Confirm Cancellation'}</h3>
                <button
                  type="button"
                  disabled={customOrderStatusUpdatingId === String(selectedCustomOrder.id || selectedCustomOrder._id || '')}
                  onClick={() => {
                    setIsRejectCustomOrderConfirmOpen(false);
                    setRejectCustomOrderReason('');
                    setRejectCustomOrderError(null);
                  }}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                  aria-label="Close custom order rejection confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-[#6B5D4F] mb-4">
                {isInquiryStage
                  ? 'Please provide a reason before rejecting this custom order.'
                  : 'Please provide a reason before cancelling this custom order.'}
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Custom Order</p>
                <p className="font-medium text-[#3D2B1F]">{selectedCustomOrder.orderType || 'Custom Order'}</p>
                <p className="text-sm text-[#6B5D4F]">Customer: {selectedCustomOrder.customerName}</p>
                <p className="text-sm text-[#6B5D4F]">Current Status: {getCustomOrderStatusLabel(selectedCustomOrder.status)}</p>
              </div>

              <label className="block text-sm text-[#6B5D4F] mb-2">
                {isInquiryStage ? 'Reason for rejection *' : 'Reason for cancellation *'}
              </label>
              <textarea
                value={rejectCustomOrderReason}
                onChange={(e) => {
                  setRejectCustomOrderReason(e.target.value);
                  if (rejectCustomOrderError) setRejectCustomOrderError(null);
                }}
                rows={4}
                placeholder={isInquiryStage
                  ? 'State why this custom order is being rejected'
                  : 'State why this custom order is being cancelled'}
                className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors resize-none"
                disabled={customOrderStatusUpdatingId === String(selectedCustomOrder.id || selectedCustomOrder._id || '')}
              />

              {rejectCustomOrderError && (
                <p className="mt-3 text-sm text-red-600">{rejectCustomOrderError}</p>
              )}

              {adminCustomOrdersError && !rejectCustomOrderError && (
                <p className="mt-3 text-sm text-red-600">{adminCustomOrdersError}</p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={customOrderStatusUpdatingId === String(selectedCustomOrder.id || selectedCustomOrder._id || '')}
                  onClick={() => {
                    setIsRejectCustomOrderConfirmOpen(false);
                    setRejectCustomOrderReason('');
                    setRejectCustomOrderError(null);
                  }}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={customOrderStatusUpdatingId === String(selectedCustomOrder.id || selectedCustomOrder._id || '')}
                  onClick={handleConfirmRejectCustomOrder}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-red-100 text-[#B86A6A] rounded-xl hover:bg-red-200 transition-colors font-semibold disabled:opacity-50"
                >
                  {customOrderStatusUpdatingId === String(selectedCustomOrder.id || selectedCustomOrder._id || '')
                    ? (isInquiryStage ? 'Rejecting...' : 'Cancelling...')
                    : (isInquiryStage ? 'Confirm Reject' : 'Confirm Cancel')}
                </button>
              </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {isApproveCustomOrderConfirmOpen && selectedCustomOrder && (() => {
          const nextStatus = getNextCustomOrderStatus(selectedCustomOrder.status);
          if (!nextStatus || !canAdvanceCustomOrderStatus(selectedCustomOrder)) return null;

          const orderId = String(selectedCustomOrder.id || selectedCustomOrder._id || '');
          const isUpdating = customOrderStatusUpdatingId === orderId;

          return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-2xl font-light">Confirm Approval</h3>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => setIsApproveCustomOrderConfirmOpen(false)}
                    className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                    aria-label="Close custom order approval confirmation"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-sm text-[#6B5D4F] mb-4">
                  This will move the custom order to {getCustomOrderStatusLabel(nextStatus)}.
                </p>

                <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                  <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Custom Order</p>
                  <p className="font-medium text-[#3D2B1F]">{selectedCustomOrder.orderType || 'Custom Order'}</p>
                  <p className="text-sm text-[#6B5D4F]">Customer: {selectedCustomOrder.customerName}</p>
                  <p className="text-sm text-[#6B5D4F]">Next Status: {getCustomOrderStatusLabel(nextStatus)}</p>
                </div>

                {adminCustomOrdersError && (
                  <p className="mb-4 text-sm text-red-600">{adminCustomOrdersError}</p>
                )}

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => setIsApproveCustomOrderConfirmOpen(false)}
                    className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={handleConfirmApproveCustomOrder}
                    className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-green-800 rounded-xl hover:bg-[#F2EADF] transition-colors font-semibold shadow-sm disabled:opacity-50"
                  >
                    {isUpdating ? 'Approving...' : `Confirm`}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {isArchiveCompletedCustomOrderConfirmOpen && selectedCustomOrder && selectedCustomOrder.status === 'completed' && (() => {
          const orderId = String(selectedCustomOrder.id || selectedCustomOrder._id || '');
          const isUpdating = customOrderStatusUpdatingId === orderId;

          return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-2xl font-light">Confirm Completed Order</h3>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => setIsArchiveCompletedCustomOrderConfirmOpen(false)}
                    className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                    aria-label="Close completed custom order confirmation"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-sm text-[#6B5D4F] mb-4">
                  Is this order complete? If confirmed, it will be moved to the bespoke management archive.
                </p>

                <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                  <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Custom Order</p>
                  <p className="font-medium text-[#3D2B1F]">{selectedCustomOrder.orderType || 'Custom Order'}</p>
                  <p className="text-sm text-[#6B5D4F]">Customer: {selectedCustomOrder.customerName}</p>
                  <p className="text-sm text-[#6B5D4F]">Reference ID: {selectedCustomOrder.referenceId || selectedCustomOrder.id || selectedCustomOrder._id || 'N/A'}</p>
                </div>

                {adminCustomOrdersError && (
                  <p className="mb-4 text-sm text-red-600">{adminCustomOrdersError}</p>
                )}

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => setIsArchiveCompletedCustomOrderConfirmOpen(false)}
                    className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={handleConfirmArchiveCompletedCustomOrder}
                    className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-green-800 rounded-xl hover:bg-[#F2EADF] transition-colors font-semibold shadow-sm disabled:opacity-50"
                  >
                    {isUpdating ? 'Archiving...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {isItemReturnedConfirmOpen && selectedReturnRental && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-light">Confirm Item Returned</h3>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => {
                    setIsItemReturnedConfirmOpen(false);
                    setSelectedReturnRental(null);
                  }}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                  aria-label="Close item returned confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-[#6B5D4F] mb-4">
                Confirm that the customer has returned the gown.
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Rental</p>
                <p className="font-medium text-[#3D2B1F]">{selectedReturnRental.gownName}</p>
                <p className="text-sm text-[#6B5D4F]">Customer: {selectedReturnRental.customer}</p>
                <p className="text-sm text-[#6B5D4F]">Due: {selectedReturnRental.dueDate}</p>
              </div>

              {rentalStatusError && rentalActionInProgress === 'returned' && (
                <p className="text-red-600 text-sm mb-3">{rentalStatusError}</p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => {
                    setIsItemReturnedConfirmOpen(false);
                    setSelectedReturnRental(null);
                  }}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={async () => {
                    if (!selectedReturnRental) return;
                    setRentalStatusUpdating(true);
                    setRentalActionInProgress('returned');
                    setRentalStatusError(null);
                    try {
                      await rentalAPI.rentalAPI.updateRentalStatus(token, selectedReturnRental.id, 'completed');
                      setAdminRentals((prev) =>
                        prev.map((r) =>
                          r.id === selectedReturnRental.id ? { ...r, status: 'completed' } : r
                        )
                      );
                      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
                      setIsItemReturnedConfirmOpen(false);
                      setShowPendingRentalModal(false);
                      setSelectedPendingRental(null);
                      setSelectedReturnRental(null);
                    } catch (err) {
                      setRentalStatusError(err instanceof Error ? err.message : 'Failed to mark rental as completed.');
                    } finally {
                      setRentalStatusUpdating(false);
                      setRentalActionInProgress(null);
                    }
                  }}
                  className="flex-1 py-3 border-2 border-green-300 bg-green-50 text-green-800 rounded-xl hover:bg-green-100 transition-colors font-semibold shadow-sm disabled:opacity-50"
                >
                  {rentalActionInProgress === 'returned' ? 'Processing...' : 'Yes, Item Returned'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isPickedUpConfirmOpen && selectedPendingRental && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-light">Confirm Picked Up</h3>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => setIsPickedUpConfirmOpen(false)}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                  aria-label="Close picked up confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-[#6B5D4F] mb-4">
                Confirm that this customer has already picked up the gown.
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Rental</p>
                <p className="font-medium text-[#3D2B1F]">{selectedPendingRental.gownName}</p>
                <p className="text-sm text-[#6B5D4F]">Customer: {selectedPendingRental.customerName}</p>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => setIsPickedUpConfirmOpen(false)}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={async () => {
                    if (!selectedPendingRental) return;
                    setRentalStatusUpdating(true);
                    setRentalActionInProgress('picked-up');
                    setRentalStatusError(null);
                    try {
                      await rentalAPI.rentalAPI.updateRentalStatus(token, selectedPendingRental.id, 'active');
                      setAdminRentals((prev) =>
                        prev.map((r) =>
                          r.id === selectedPendingRental.id ? { ...r, status: 'active' } : r
                        )
                      );
                      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
                      setIsPickedUpConfirmOpen(false);
                      setShowPendingRentalModal(false);
                      setSelectedPendingRental(null);
                    } catch (err) {
                      setRentalStatusError(err instanceof Error ? err.message : 'Failed to mark rental as picked up.');
                    } finally {
                      setRentalStatusUpdating(false);
                      setRentalActionInProgress(null);
                    }
                  }}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-cyan-800 rounded-xl hover:bg-[#F2EADF] transition-colors font-semibold shadow-sm disabled:opacity-50"
                >
                  {rentalActionInProgress === 'picked-up' ? 'Processing...' : 'Yes, Mark as Picked Up'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isRejectRentalConfirmOpen && selectedPendingRental && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-light">Confirm Rejection</h3>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => {
                    setIsRejectRentalConfirmOpen(false);
                    setRejectRentalReason('');
                    setRejectRentalError(null);
                  }}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                  aria-label="Close rejection confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-[#6B5D4F] mb-4">
                {selectedPendingRental.status === 'for_payment' || selectedPendingRental.status === 'paid_for_confirmation'
                  ? 'Please provide a reason before rejecting this payment.'
                  : 'Please provide a reason before rejecting this rental request.'}
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Rental</p>
                <p className="font-medium text-[#3D2B1F]">{selectedPendingRental.gownName}</p>
                <p className="text-sm text-[#6B5D4F]">Customer: {selectedPendingRental.customerName}</p>
              </div>

              <label className="block text-sm text-[#6B5D4F] mb-2">Reason for rejection *</label>
              <textarea
                value={rejectRentalReason}
                onChange={(e) => {
                  setRejectRentalReason(e.target.value);
                  if (rejectRentalError) setRejectRentalError(null);
                }}
                rows={4}
                placeholder="State why this rental is being rejected"
                className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors resize-none"
                disabled={rentalStatusUpdating}
              />

              {rejectRentalError && (
                <p className="mt-3 text-sm text-red-600">{rejectRentalError}</p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => {
                    setIsRejectRentalConfirmOpen(false);
                    setRejectRentalReason('');
                    setRejectRentalError(null);
                  }}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={async () => {
                    if (!selectedPendingRental) return;

                    const trimmedReason = rejectRentalReason.trim();
                    if (!trimmedReason) {
                      setRejectRentalError('Rejection reason is required.');
                      return;
                    }

                    setRentalStatusUpdating(true);
                    setRentalActionInProgress('reject');
                    setRentalStatusError(null);
                    setRejectRentalError(null);

                    try {
                      await rentalAPI.rentalAPI.updateRentalStatus(
                        token,
                        selectedPendingRental.id,
                        'cancelled',
                        trimmedReason
                      );
                      setAdminRentals((prev) => prev.filter((r) => r.id !== selectedPendingRental.id));
                      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
                      setIsRejectRentalConfirmOpen(false);
                      setRejectRentalReason('');
                      setShowPendingRentalModal(false);
                      setSelectedPendingRental(null);
                    } catch (err) {
                      const message = err instanceof Error ? err.message : 'Failed to reject rental.';
                      setRejectRentalError(message);
                      setRentalStatusError(message);
                    } finally {
                      setRentalStatusUpdating(false);
                      setRentalActionInProgress(null);
                    }
                  }}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-red-100 text-[#B86A6A] rounded-xl hover:bg-red-200 transition-colors font-semibold disabled:opacity-50"
                >
                  {rentalActionInProgress === 'reject' ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isApproveRentalConfirmOpen && selectedPendingRental && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-light">
                  {selectedPendingRental.status === 'paid_for_confirmation' ? 'Confirm Pickup Scheduling' : 'Confirm Approval'}
                </h3>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => setIsApproveRentalConfirmOpen(false)}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                  aria-label="Close approval confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-[#6B5D4F] mb-4">
                {selectedPendingRental.status === 'paid_for_confirmation'
                  ? 'This will confirm the submitted payment and move the rental to For Pickup.'
                  : 'This will approve the rental request and move it to For Payment.'}
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Rental</p>
                <p className="font-medium text-[#3D2B1F]">{selectedPendingRental.gownName}</p>
                <p className="text-sm text-[#6B5D4F]">Customer: {selectedPendingRental.customerName}</p>
                <p className="text-sm text-[#6B5D4F]">Reference ID: {selectedPendingRental.referenceId || selectedPendingRental.id}</p>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => setIsApproveRentalConfirmOpen(false)}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={handleConfirmApproveRental}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-green-800 rounded-xl hover:bg-[#F2EADF] transition-colors font-semibold shadow-sm disabled:opacity-50"
                >
                  {rentalActionInProgress === 'approve'
                    ? 'Processing...'
                    : (selectedPendingRental.status === 'paid_for_confirmation' ? 'Yes, Schedule Pickup' : 'Yes, Approve')}
                </button>
              </div>
            </div>
          </div>
        )}

        {isApproveAppointmentConfirmOpen && selectedPendingAppointment && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-light">Confirm Appointment Approval</h3>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedPendingAppointment.id}
                  onClick={() => {
                    setIsApproveAppointmentConfirmOpen(false);
                    setSelectedPendingAppointment(null);
                  }}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                  aria-label="Close appointment approval confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-[#6B5D4F] mb-4">
                This will approve the appointment request and move it to Scheduled.
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Appointment</p>
                <p className="font-medium text-[#3D2B1F]">{getAppointmentTypeLabel(selectedPendingAppointment.type)}</p>
                <p className="text-sm text-[#6B5D4F]">Customer: {selectedPendingAppointment.customerName}</p>
                <p className="text-sm text-[#6B5D4F]">Date: {selectedPendingAppointment.date}</p>
                <p className="text-sm text-[#6B5D4F]">Time: {selectedPendingAppointment.time}</p>
                <p className="text-sm text-[#6B5D4F]">Branch: {selectedPendingAppointment.branch}</p>
              </div>

              {selectedPendingAppointment.notes && (
                <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                  <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Additional Comments</p>
                  <p className="text-sm text-[#6B5D4F]">{selectedPendingAppointment.notes}</p>
                </div>
              )}

              {selectedPendingAppointment.rescheduleReason && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 mb-4">
                  <p className="text-xs text-orange-700 uppercase tracking-wide mb-2">Rescheduled</p>
                  <p className="text-sm text-orange-900">{selectedPendingAppointment.rescheduleReason}</p>
                </div>
              )}

              {adminAppointmentsError && appointmentStatusUpdatingId === selectedPendingAppointment.id && (
                <p className="text-red-600 text-sm mb-3">{adminAppointmentsError}</p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedPendingAppointment.id}
                  onClick={() => {
                    setIsApproveAppointmentConfirmOpen(false);
                    setSelectedPendingAppointment(null);
                  }}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedPendingAppointment.id}
                  onClick={handleConfirmApproveAppointment}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-green-800 rounded-xl hover:bg-[#F2EADF] transition-colors font-semibold shadow-sm disabled:opacity-50"
                >
                  {appointmentStatusUpdatingId === selectedPendingAppointment.id ? 'Approving...' : 'Yes, Approve'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isCompleteAppointmentConfirmOpen && selectedScheduledAppointment && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-light">Confirm Appointment Completion</h3>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedScheduledAppointment.id}
                  onClick={() => {
                    setIsCompleteAppointmentConfirmOpen(false);
                    setSelectedScheduledAppointment(null);
                  }}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                  aria-label="Close appointment completion confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-[#6B5D4F] mb-4">
                This will mark the appointment as completed and move it to the archive.
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Appointment</p>
                <p className="font-medium text-[#3D2B1F]">{getAppointmentTypeLabel(selectedScheduledAppointment.type)}</p>
                <p className="text-sm text-[#6B5D4F]">Customer: {selectedScheduledAppointment.customerName}</p>
                <p className="text-sm text-[#6B5D4F]">Date: {selectedScheduledAppointment.date}</p>
                <p className="text-sm text-[#6B5D4F]">Time: {selectedScheduledAppointment.time}</p>
                <p className="text-sm text-[#6B5D4F]">Branch: {selectedScheduledAppointment.branch}</p>
              </div>

              {adminAppointmentsError && appointmentStatusUpdatingId === selectedScheduledAppointment.id && (
                <p className="text-red-600 text-sm mb-3">{adminAppointmentsError}</p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedScheduledAppointment.id}
                  onClick={() => {
                    setIsCompleteAppointmentConfirmOpen(false);
                    setSelectedScheduledAppointment(null);
                  }}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedScheduledAppointment.id}
                  onClick={handleConfirmCompleteAppointment}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-green-800 rounded-xl hover:bg-[#F2EADF] transition-colors font-semibold shadow-sm disabled:opacity-50"
                >
                  {appointmentStatusUpdatingId === selectedScheduledAppointment.id ? 'Completing...' : 'Yes, Complete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isCancelAppointmentConfirmOpen && selectedCancelAppointment && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-light">Confirm Cancellation</h3>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedCancelAppointment.id}
                  onClick={() => {
                    setIsCancelAppointmentConfirmOpen(false);
                    setSelectedCancelAppointment(null);
                    setAppointmentCancelReason('');
                    setAppointmentCancelError(null);
                  }}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                  aria-label="Close appointment cancellation confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-[#6B5D4F] mb-4">
                Please provide a reason before cancelling this appointment.
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Appointment</p>
                <p className="font-medium text-[#3D2B1F]">{getAppointmentTypeLabel(selectedCancelAppointment.type)}</p>
                <p className="text-sm text-[#6B5D4F]">Customer: {selectedCancelAppointment.customerName}</p>
                <p className="text-sm text-[#6B5D4F]">Date: {selectedCancelAppointment.date}</p>
                <p className="text-sm text-[#6B5D4F]">Time: {selectedCancelAppointment.time}</p>
              </div>

              <label className="block text-sm text-[#6B5D4F] mb-2">Reason for cancellation *</label>
              <textarea
                value={appointmentCancelReason}
                onChange={(e) => {
                  setAppointmentCancelReason(e.target.value);
                  if (appointmentCancelError) setAppointmentCancelError(null);
                }}
                rows={4}
                placeholder="State why this appointment is being cancelled"
                className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors resize-none"
                disabled={appointmentStatusUpdatingId === selectedCancelAppointment.id}
              />

              {appointmentCancelError && (
                <p className="mt-3 text-sm text-red-600">{appointmentCancelError}</p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedCancelAppointment.id}
                  onClick={() => {
                    setIsCancelAppointmentConfirmOpen(false);
                    setSelectedCancelAppointment(null);
                    setAppointmentCancelReason('');
                    setAppointmentCancelError(null);
                  }}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedCancelAppointment.id}
                  onClick={handleConfirmCancelAppointment}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-red-100 text-[#B86A6A] rounded-xl hover:bg-red-200 transition-colors font-semibold disabled:opacity-50"
                >
                  {appointmentStatusUpdatingId === selectedCancelAppointment.id ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rental Follow Up Modal */}
        {showNotificationModal && selectedRental && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-2xl font-light">Send Follow Up</h3>
                <button
                  onClick={() => {
                    setIsSendReminderConfirmOpen(false);
                    setIsReminderSentSuccessOpen(false);
                    setShowNotificationModal(false);
                    setSelectedRental(null);
                    setNotificationMethod('both');
                  }}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Rental Info */}
                <div className="bg-[#FAF7F0] p-4 rounded-lg">
                  <h4 className="font-medium mb-2">{selectedRental.gownName}</h4>
                  <div className="space-y-1 text-sm text-[#6B5D4F]">
                    <p>Customer: {selectedRental.customer}</p>
                    <p>{selectedRental.status === 'pending' ? 'Status: Pending Rental Request' : `Due Date: ${selectedRental.dueDate}`}</p>
                    {selectedRental.status === 'pending' && (
                      <p>Requested End Date: {selectedRental.dueDate}</p>
                    )}
                    {selectedRental.status === 'active' && selectedRental.daysLate > 0 && (
                      <p className="text-red-600 font-medium">
                        {selectedRental.daysLate} {selectedRental.daysLate === 1 ? 'day' : 'days'} late • ₱{(selectedRental.daysLate * RENTAL_LATE_FEE_PER_DAY).toLocaleString()} late fee
                      </p>
                    )}
                  </div>
                </div>

                {/* Notification Method */}
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-3">Select Notification Method</label>
                  <div className="space-y-3">
                    <button
                      onClick={() => setNotificationMethod('sms')}
                      className={`w-full p-4 rounded-lg border-2 transition-colors flex items-center gap-3 ${
                        notificationMethod === 'sms'
                          ? 'border-[#D4AF37] bg-[#FAF7F0]'
                          : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                      }`}
                    >
                      <MessageSquare className="w-5 h-5 text-[#D4AF37]" />
                      <div className="text-left">
                        <p className="font-medium">SMS Only</p>
                        <p className="text-xs text-[#6B5D4F]">Send via text message</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setNotificationMethod('email')}
                      className={`w-full p-4 rounded-lg border-2 transition-colors flex items-center gap-3 ${
                        notificationMethod === 'email'
                          ? 'border-[#D4AF37] bg-[#FAF7F0]'
                          : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                      }`}
                    >
                      <Mail className="w-5 h-5 text-[#D4AF37]" />
                      <div className="text-left">
                        <p className="font-medium">Email Only</p>
                        <p className="text-xs text-[#6B5D4F]">Send via email</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setNotificationMethod('both')}
                      className={`w-full p-4 rounded-lg border-2 transition-colors flex items-center gap-3 ${
                        notificationMethod === 'both'
                          ? 'border-[#D4AF37] bg-[#FAF7F0]'
                          : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                      }`}
                    >
                      <Send className="w-5 h-5 text-[#D4AF37]" />
                      <div className="text-left">
                        <p className="font-medium">SMS & Email</p>
                        <p className="text-xs text-[#6B5D4F]">Send via both channels</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setIsSendReminderConfirmOpen(false);
                      setIsReminderSentSuccessOpen(false);
                      setShowNotificationModal(false);
                      setSelectedRental(null);
                      setNotificationMethod('both');
                    }}
                    className="flex-1 px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendNotification}
                    className="flex-1 px-6 py-3 bg-[#1a1a1a] text-white rounded-lg hover:bg-[#D4AF37] transition-colors flex items-center justify-center gap-2"
                  >
                    <Send className="w-5 h-5" />
                    Send Follow Up
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isSendReminderConfirmOpen && selectedRental && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            style={{ zIndex: 60 }}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm send follow up"
            onClick={() => {
              setIsSendReminderConfirmOpen(false);
              setShowNotificationModal(true);
            }}
          >
            <div
              className="bg-white rounded-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-light">Confirm Send Follow Up</h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsSendReminderConfirmOpen(false);
                    setShowNotificationModal(true);
                  }}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors"
                  aria-label="Close send reminder confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-[#6B5D4F] mb-4">
                Follow up will be sent to {selectedRental.customer} via {notificationMethodText}.
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6">
                <p className="text-xs text-[#9C8B7A] uppercase tracking-wide mb-2">Message</p>
                <p className="text-sm text-[#3D2B1F] leading-relaxed">{reminderMessage}</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsSendReminderConfirmOpen(false);
                    setShowNotificationModal(true);
                  }}
                  className="flex-1 px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSendNotification}
                  className="flex-1 px-6 py-3 bg-[#1a1a1a] text-white rounded-lg hover:bg-[#D4AF37] transition-colors"
                >
                  Send Follow Up
                </button>
              </div>
            </div>
          </div>
        )}

        {isReminderSentSuccessOpen && selectedRental && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            style={{ zIndex: 60 }}
            role="dialog"
            aria-modal="true"
            aria-label="Follow up sent"
            onClick={handleDismissReminderSentSuccess}
          >
            <div
              className="bg-white rounded-2xl max-w-md w-full p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-light mb-3">Follow Up Sent</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Follow up has been sent to {selectedRental.customer} via {notificationMethodText}.
              </p>

              <button
                type="button"
                onClick={handleDismissReminderSentSuccess}
                className="w-full px-6 py-3 bg-[#1a1a1a] text-white rounded-lg hover:bg-[#D4AF37] transition-colors"
              >
                Okay
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}