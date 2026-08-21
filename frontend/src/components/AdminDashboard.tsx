import { useState, useEffect, useMemo, useRef } from 'react';
import { Package, Users, TrendingUp, TrendingDown, Minus, MapPin, AlertCircle, Edit, Trash2, Plus, X, Mail, Phone, Calendar, Clock, Send, MessageSquare, Upload, Link, Archive, RotateCcw, ChevronDown, Eye, Download } from 'lucide-react';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip as ChartTooltip } from 'chart.js';
import type { ChartOptions, TooltipItem } from 'chart.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Bar } from 'react-chartjs-2';
import * as inventoryAPI from '../services/inventoryAPI';
import { INVENTORY_UPDATED_EVENT } from '../services/inventoryAPI';
import type { InventoryItem, BranchPerformanceStats, BranchPerformanceSummary, BranchClickAnalysisItem } from '../services/inventoryAPI';
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
import { generateAnalyticsReportNarrative } from '../services/analyticsNarrativeAPI';
import type { AnalyticsNarrative, AnalyticsNarrativePayload } from '../services/analyticsNarrativeAPI';
import { notificationAPI } from '../services/notificationAPI';
import { createAdminDashboardEventSource } from '../services/adminRealtime';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';
import { ImageWithFallback } from './figma/ImageWithFallback';

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip, Legend);

export type { InventoryItem };

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  branch: string;
  preferredBranch?: string;
  role: ManagedUserRole;
  createdAt?: string;
  joinDate: string;
  status: 'active' | 'archived';
  lastActivity: string;
}

interface NewUserForm {
  role: ManagedUserRole;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  preferredBranch: string;
}

interface PendingReturn {
  id: string;
  gownName: string;
  sku?: string;
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
  status: 'pending' | 'active' | 'for-payment' | 'for-pickup' | 'item_lost';
}

interface AdminRentalCard {
  id: string;
  referenceId?: string;
  gownName: string;
  sku?: string;
  customerName: string;
  startDate?: string;
  endDate: string;
  status: AdminRentalDetail['status'];
  totalPrice: number;
  branch: string;
  rejectionReason?: string | null;
  pickupScheduleDate?: string | null;
  pickupScheduleTime?: string | null;
}

interface CurrentAdminUser {
  id?: string;
  role?: string;
  preferredBranch?: string;
}

interface AdminDashboardProps {
  token: string;
  currentUserRole?: string;
  currentUser?: CurrentAdminUser | null;
  onRequestLogout?: () => void;
}

type AdminTab = 'overview' | 'inventory' | 'rentals' | 'appointments' | 'bespoke' | 'users' | 'history';
type DashboardRefreshScope = 'overview' | 'rentals' | 'appointments' | 'bespoke' | 'users' | 'history' | null;
type ExportFormat = 'pdf' | 'csv' | 'xls';
const EXPORT_FORMAT_OPTIONS: ExportFormat[] = ['pdf', 'csv', 'xls'];
const MAX_INVENTORY_STOCK = 99;

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

type RentalExportFilter = 'archive' | 'all' | 'pending' | 'for-payment' | 'for-pickup' | 'active' | 'returns';
type OverviewExportTypeFilter = OverviewActivityRow['source'];
type AppointmentStatusFilter = 'all' | 'pending' | 'scheduled';
type AppointmentExportFilter = 'archive' | 'all' | 'pending' | 'scheduled';
type CustomOrderStatusFilter = 'all' | AdminCustomOrderStatus;
type CustomOrderExportFilter = 'archive' | 'all' | AdminCustomOrderStatus;
type AppointmentExportSelectableFilter = Exclude<AppointmentExportFilter, 'all'>;
type RentalExportSelectableFilter = Exclude<RentalExportFilter, 'all'>;
type CustomOrderExportSelectableFilter = Exclude<CustomOrderExportFilter, 'all'>;
type BranchComparisonMetric = 'revenue' | 'rents' | 'appointments' | 'bespoke';
type UserExportFilter = 'all' | 'admin' | 'staff' | 'customer';

const OVERVIEW_EXPORT_TYPE_OPTIONS = ['Rental', 'Appointment', 'Custom Order'] as const satisfies OverviewExportTypeFilter[];
const APPOINTMENT_EXPORT_FILTER_OPTIONS = ['archive', 'pending', 'scheduled'] as const satisfies AppointmentExportSelectableFilter[];
const RENTAL_EXPORT_FILTER_OPTIONS = ['archive', 'pending', 'active', 'for-payment', 'for-pickup', 'returns'] as const satisfies RentalExportSelectableFilter[];

const INVENTORY_PAGE_SIZE = 8;
const OVERVIEW_ACTIVITY_PAGE_SIZE = 8;
const APPOINTMENT_PAGE_SIZE = 3;
const RENTAL_PAGE_SIZE = 5;
const RENTAL_LATE_FEE_PER_DAY = 200;
const CUSTOM_ORDER_PAGE_SIZE = 4;
const ADMIN_HISTORY_PAGE_SIZE = 8;
const USER_PAGE_SIZE = 5;
const ADMIN_DASHBOARD_REFRESH_INTERVAL_MS = 15000;
const CUSTOM_ORDER_STATUS_OPTIONS: AdminCustomOrderStatus[] = ['inquiry', 'design-approval', 'in-progress', 'fitting', 'completed', 'rejected'];
const CUSTOM_ORDER_FILTER_TABS: AdminCustomOrderStatus[] = ['inquiry', 'design-approval', 'in-progress', 'fitting', 'completed'];
const CUSTOM_ORDER_EXPORT_FILTER_OPTIONS = ['archive', ...CUSTOM_ORDER_FILTER_TABS] as const satisfies readonly CustomOrderExportSelectableFilter[];
const ADMIN_TABS: AdminTab[] = ['overview', 'inventory', 'rentals', 'appointments', 'bespoke', 'users', 'history'];
const DEFAULT_INVENTORY_CATEGORIES = ['Evening Gown', 'Wedding Dress', 'Ball Gown', 'Cocktail Dress'];
const DEFAULT_INVENTORY_CATEGORY = DEFAULT_INVENTORY_CATEGORIES[0];
const NEW_CATEGORY_OPTION = '__new_category__';

type OverviewActivityRow = {
  id: string;
  source: 'Rental' | 'Appointment' | 'Custom Order';
  title: string;
  customerName: string;
  detail: string;
  branch: string;
  timeLabel: string;
  sortValue: number;
};

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

function normalizeManagedUserStatus(status: unknown): User['status'] {
  return String(status || '').trim().toLowerCase() === 'archived' ? 'archived' : 'active';
}

function compareInventoryItemsAscending(left: InventoryItem, right: InventoryItem) {
  const leftKey = (left.sku || left.id || '').trim();
  const rightKey = (right.sku || right.id || '').trim();

  return leftKey.localeCompare(rightKey, undefined, { numeric: true, sensitivity: 'base' });
}

function normalizeInventoryManagementStatus(status: InventoryItem['status'] | string | null | undefined): 'available' | 'maintenance' {
  const normalizedStatus = String(status || '').trim().toLowerCase();

  if (normalizedStatus === 'maintenance') return 'maintenance';
  return 'available';
}

function toInventoryPreviewDetails(item: InventoryItem): GownDetails {
  const normalizedStatus = normalizeInventoryManagementStatus(item.status);

  return {
    id: item.id,
    name: item.name,
    category: item.category,
    color: item.color,
    size: Array.isArray(item.size) ? item.size : [],
    price: item.price,
    status: normalizedStatus,
    branch: item.branch,
    image: item.image?.trim() || 'https://images.unsplash.com/photo-1763336016192-c7b62602e993?w=800',
    images: Array.isArray(item.images) ? item.images.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
    model3dUrl: String(item.model3dUrl || '').trim(),
    rating: typeof item.rating === 'number' ? item.rating : 0,
    ratings: Array.isArray(item.ratings) ? item.ratings : [],
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

function getShortBranchLabel(value: string | null | undefined): string {
  const normalizedBranch = normalizeBranchName(value);
  if (!normalizedBranch) return 'No branch';
  if (normalizedBranch === 'Taguig Main') return 'Taguig';
  if (normalizedBranch === 'BGC Branch') return 'BGC';
  if (normalizedBranch === 'Makati Branch') return 'Makati';
  return normalizedBranch;
}

function matchesSelectedBranch(branch: string | null | undefined, selectedBranch: string): boolean {
  if (selectedBranch === 'All Branches') return true;
  return normalizeBranchName(branch) === normalizeBranchName(selectedBranch);
}

const STAFF_BRANCH_OPTIONS = ['Taguig Main', 'BGC Branch', 'Makati Branch', 'Quezon City'];

function normalizePhoneDigits(value: string) {
  let digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length > 0 && !digits.startsWith('9')) {
    digits = `9${digits.slice(1)}`;
  }
  return digits;
}

function toLocalDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AdminDashboard({ token, currentUserRole, currentUser, onRequestLogout }: AdminDashboardProps) {
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

  const normalizedCurrentUserRole = String(currentUser?.role || currentUserRole || '').trim().toLowerCase();
  const isCurrentUserStaff = normalizedCurrentUserRole === 'staff';
  const assignedStaffBranch = isCurrentUserStaff
    ? normalizeBranchName(currentUser?.preferredBranch)
    : '';
  type InventoryConfirmAction =
    | { type: 'delete'; item: InventoryItem }
    | { type: 'restore'; item: InventoryItem }
    | null;

  const [activeTab, setActiveTab] = useState<AdminTab>(() => parseAdminTabFromHash(window.location.hash));
  const [selectedBranch, setSelectedBranch] = useState<string>(() => assignedStaffBranch || 'All Branches');
  const [overviewActivityPage, setOverviewActivityPage] = useState(1);
  const [branchComparisonMetric, setBranchComparisonMetric] = useState<BranchComparisonMetric>('revenue');

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
  const [branchClickAnalysis, setBranchClickAnalysis] = useState<BranchClickAnalysisItem[]>([]);
  const [branchClickAnalysisLoading, setBranchClickAnalysisLoading] = useState(false);
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
  const [incrementingItemId, setIncrementingItemId] = useState<string | null>(null);
  const [stockModalItem, setStockModalItem] = useState<InventoryItem | null>(null);
  const [stockQuantityToAdd, setStockQuantityToAdd] = useState('1');
  const [isAddStockConfirmOpen, setIsAddStockConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<InventoryConfirmAction>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [hoverPreviewItem, setHoverPreviewItem] = useState<InventoryItem | null>(null);
  const cancelConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const primaryConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [editingItem, setEditingItem] = useState<Partial<InventoryItem> | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemErrors, setAddItemErrors] = useState<Partial<Record<AddItemField, string>>>({});
  const [isCustomCategoryInputVisible, setIsCustomCategoryInputVisible] = useState(false);
  const [customCategoryDraft, setCustomCategoryDraft] = useState('');
  const [isConfirmCustomCategoryOpen, setIsConfirmCustomCategoryOpen] = useState(false);
  const [previousCategoryBeforeCustomInput, setPreviousCategoryBeforeCustomInput] = useState(DEFAULT_INVENTORY_CATEGORY);
  const [removedCategoryOptions, setRemovedCategoryOptions] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [pendingCategoryDeletion, setPendingCategoryDeletion] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: '',
    category: DEFAULT_INVENTORY_CATEGORY,
    color: '',
    size: [],
    price: 0,
    branch: 'Taguig Main',
    status: 'available',
    description: '',
    image: '',
    images: [],
    model3dUrl: '',
    stock: 1
  });
  const inventoryCategoryOptions = useMemo(() => {
    const categories = [
      ...DEFAULT_INVENTORY_CATEGORIES,
      ...inventory.map((item) => String(item.category || '').trim()),
      ...archivedItems.map((item) => String(item.category || '').trim()),
      String(editingItem?.category || '').trim(),
      String(newItem.category || '').trim(),
    ].filter(Boolean);

    return Array.from(new Set(categories)).filter((category) => !removedCategoryOptions.includes(category));
  }, [archivedItems, editingItem?.category, inventory, newItem.category, removedCategoryOptions]);
  const inventoryCategoryUsageCounts = useMemo(() => {
    return [...inventory, ...archivedItems].reduce<Record<string, number>>((counts, item) => {
      const category = String(item.category || '').trim();

      if (!category) {
        return counts;
      }

      counts[category] = (counts[category] || 0) + 1;
      return counts;
    }, {});
  }, [archivedItems, inventory]);
  const pendingCategoryDeletionUsageCount = pendingCategoryDeletion
    ? inventoryCategoryUsageCounts[pendingCategoryDeletion] || 0
    : 0;

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
  const [userArchiveReason, setUserArchiveReason] = useState('');
  const [userArchiveReasonError, setUserArchiveReasonError] = useState<string | null>(null);
  const [confirmUserRestore, setConfirmUserRestore] = useState<User | null>(null);
  const [isConfirmingUserRestore, setIsConfirmingUserRestore] = useState(false);
  const [archivingUserId, setArchivingUserId] = useState<string | null>(null);
  const [restoringUserId, setRestoringUserId] = useState<string | null>(null);
  const [showUserExportModal, setShowUserExportModal] = useState(false);
  const [userExportFilter, setUserExportFilter] = useState<UserExportFilter>('all');
  const [userExportFormat, setUserExportFormat] = useState<ExportFormat>('pdf');
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
  const [showAdminHistoryExportModal, setShowAdminHistoryExportModal] = useState(false);
  const [adminHistoryExportFormat, setAdminHistoryExportFormat] = useState<ExportFormat>('pdf');
  const [newUserForm, setNewUserForm] = useState<NewUserForm>({
    role: 'Customer',
    email: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    preferredBranch: 'Taguig Main'
  });
  const canExportPdfs = !isCurrentUserStaff;
  const canViewUsers = !isCurrentUserStaff;
  const canViewAdminHistory = !isCurrentUserStaff;
  const dashboardTitle = isCurrentUserStaff ? 'Staff Dashboard' : 'Admin Dashboard';

  const escapeCsvValue = (value: string) => {
    const sanitized = String(value || '').replace(/"/g, '""');
    return /[",\n\r]/.test(sanitized) ? `"${sanitized}"` : sanitized;
  };

  const createCsvContent = (headers: string[], rows: string[][]) => {
    const lines = [headers.map(escapeCsvValue).join(','), ...rows.map((row) => row.map(escapeCsvValue).join(','))];
    return lines.join('\r\n');
  };

  const createXlsContent = (headers: string[], rows: string[][]) => {
    const buildRow = (cells: string[]) => `      <tr>${cells.map((cell) => `<td>${cell.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}</tr>`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body><table border="1" cellpadding="5" cellspacing="0">\n${buildRow(headers)}\n${rows.map(buildRow).join('\n')}\n</table></body></html>`;
  };

  const saveFile = (content: string | Blob, filename: string, type: string) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderExportFormatOptions = (
    selectedFormat: ExportFormat,
    onChange: (format: ExportFormat) => void,
    groupName: string,
  ) => (
    <div className="flex items-stretch gap-3">
      {EXPORT_FORMAT_OPTIONS.map((formatOption) => {
        const isSelected = selectedFormat === formatOption;
        const label = formatOption.toUpperCase();

        return (
          <label
            key={`${groupName}-${formatOption}`}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              isSelected
                ? 'border-[#1a1a1a] bg-[#FAF7F0] text-[#1A1A1A]'
                : 'border-[#E8DCC8] bg-white text-[#6B5D4F] hover:border-[#D4AF37] hover:text-[#1A1A1A]'
            }`}
          >
            <input
              type="radio"
              name={groupName}
              value={formatOption}
              checked={isSelected}
              onChange={() => onChange(formatOption)}
              className="h-4 w-4 border-[#CBBBA5] text-[#1a1a1a] focus:ring-[#D4AF37]"
            />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );

  useEffect(() => {
    if (!assignedStaffBranch) {
      return;
    }

    setSelectedBranch(assignedStaffBranch);
  }, [assignedStaffBranch]);

  useEffect(() => {
    if (canViewUsers || activeTab !== 'users') {
      return;
    }

    setActiveTabWithHash('overview', 'replace');
  }, [activeTab, canViewUsers]);

  useEffect(() => {
    if (canViewAdminHistory || activeTab !== 'history') {
      return;
    }

    setActiveTabWithHash('overview', 'replace');
  }, [activeTab, canViewAdminHistory]);

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
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<AppointmentStatusFilter>('all');
  const [showAppointmentExportModal, setShowAppointmentExportModal] = useState(false);
  const [selectedAppointmentExportFilters, setSelectedAppointmentExportFilters] = useState<AppointmentExportSelectableFilter[]>(['pending', 'scheduled']);
  const [selectedAppointmentExportBranch, setSelectedAppointmentExportBranch] = useState<string>('All Branches');
  const [appointmentSearchQuery, setAppointmentSearchQuery] = useState('');
  const [adminAppointments, setAdminAppointments] = useState<AdminAppointmentDetail[]>([]);
  const [adminAppointmentsLoading, setAdminAppointmentsLoading] = useState(false);
  const [adminAppointmentsError, setAdminAppointmentsError] = useState<string | null>(null);
  const [showOverviewExportModal, setShowOverviewExportModal] = useState(false);
  const [showStoreOverviewExportModal, setShowStoreOverviewExportModal] = useState(false);
  const [showInventoryExportModal, setShowInventoryExportModal] = useState(false);
  const [isGeneratingAnalyticsPdf, setIsGeneratingAnalyticsPdf] = useState(false);
  const [overviewExportBranchFilter, setOverviewExportBranchFilter] = useState<string>('All Branches');
  const [overviewExportTypeFilter, setOverviewExportTypeFilter] = useState<OverviewExportTypeFilter[]>([...OVERVIEW_EXPORT_TYPE_OPTIONS]);
  const [overviewExportFormat, setOverviewExportFormat] = useState<ExportFormat>('pdf');
  const [storeOverviewExportFormat, setStoreOverviewExportFormat] = useState<ExportFormat>('pdf');
  const [inventoryExportFormat, setInventoryExportFormat] = useState<ExportFormat>('pdf');
  const [selectedStoreOverviewExportBranches, setSelectedStoreOverviewExportBranches] = useState<string[]>(['All Branches']);
  const [selectedInventoryExportBranches, setSelectedInventoryExportBranches] = useState<string[]>(['All Branches']);
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
  const [dashboardRefreshScope, setDashboardRefreshScope] = useState<DashboardRefreshScope>(null);
  const [customOrderManagementView, setCustomOrderManagementView] = useState<'active' | 'archive'>('active');
  const [customOrderSearchQuery, setCustomOrderSearchQuery] = useState('');
  const [customOrderPage, setCustomOrderPage] = useState(1);
  const [customOrderStatusFilter, setCustomOrderStatusFilter] = useState<CustomOrderStatusFilter>('all');
  const [showCustomOrderExportModal, setShowCustomOrderExportModal] = useState(false);
  const [selectedCustomOrderExportFilters, setSelectedCustomOrderExportFilters] = useState<CustomOrderExportSelectableFilter[]>([...CUSTOM_ORDER_FILTER_TABS]);
  const [selectedCustomOrderExportBranch, setSelectedCustomOrderExportBranch] = useState<string>('All Branches');
  const [customOrderExportFormat, setCustomOrderExportFormat] = useState<ExportFormat>('pdf');
  const [customOrderStatusUpdatingId, setCustomOrderStatusUpdatingId] = useState<string | null>(null);
  const [selectedCustomOrder, setSelectedCustomOrder] = useState<AdminCustomOrderRecord | null>(null);
  const [customOrderModalTab, setCustomOrderModalTab] = useState<'order' | 'customer' | 'notes'>('order');
  const [rentalModalTab, setRentalModalTab] = useState<'order' | 'payment' | 'customer'>('order');
  const [isApproveCustomOrderConfirmOpen, setIsApproveCustomOrderConfirmOpen] = useState(false);
  const [isDoneCustomOrderConfirmOpen, setIsDoneCustomOrderConfirmOpen] = useState(false);
  const [isArchiveCompletedCustomOrderConfirmOpen, setIsArchiveCompletedCustomOrderConfirmOpen] = useState(false);
  const [isRejectCustomOrderConfirmOpen, setIsRejectCustomOrderConfirmOpen] = useState(false);
  const [isAdjustCustomOrderConfirmOpen, setIsAdjustCustomOrderConfirmOpen] = useState(false);
  const [adjustCustomOrderReason, setAdjustCustomOrderReason] = useState('');
  const [adjustCustomOrderError, setAdjustCustomOrderError] = useState<string | null>(null);
  const [rejectCustomOrderReason, setRejectCustomOrderReason] = useState('');
  const [rejectCustomOrderError, setRejectCustomOrderError] = useState<string | null>(null);
  const [rentalViewFilter, setRentalViewFilter] = useState<'all' | 'pending' | 'for-payment' | 'for-pickup' | 'active' | 'returns'>('all');
  const [showRentalExportModal, setShowRentalExportModal] = useState(false);
  const [selectedRentalExportFilters, setSelectedRentalExportFilters] = useState<RentalExportSelectableFilter[]>(['pending', 'active', 'for-payment', 'for-pickup', 'returns']);
  const [selectedRentalExportBranch, setSelectedRentalExportBranch] = useState<string>('All Branches');
  const [rentalExportFormat, setRentalExportFormat] = useState<ExportFormat>('pdf');
  const [appointmentExportFormat, setAppointmentExportFormat] = useState<ExportFormat>('pdf');
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
  const [isItemLostConfirmOpen, setIsItemLostConfirmOpen] = useState(false);
  const [selectedReturnRental, setSelectedReturnRental] = useState<PendingReturn | null>(null);

  // Notification State
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [selectedRental, setSelectedRental] = useState<RentalFollowUpTarget | null>(null);
  const [notificationMethod, setNotificationMethod] = useState<'sms' | 'email' | 'both'>('both');
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationSending, setNotificationSending] = useState(false);

  const [isSendReminderConfirmOpen, setIsSendReminderConfirmOpen] = useState(false);
  const [isReminderSentSuccessOpen, setIsReminderSentSuccessOpen] = useState(false);

  const isAnyDashboardModalOpen = Boolean(
    confirmAction ||
    showAddItem ||
    editingItem ||
    stockModalItem ||
    hoverPreviewItem ||
    selectedUser ||
    confirmUserArchive ||
    confirmUserRestore ||
    showUserExportModal ||
    showAdminHistoryExportModal ||
    showAddUserModal ||
    showPendingRentalModal ||
    showOverviewExportModal ||
    showStoreOverviewExportModal ||
    showRentalExportModal ||
    showAppointmentExportModal ||
    showCustomOrderExportModal ||
    isApproveRentalConfirmOpen ||
    isRejectRentalConfirmOpen ||
    isPickedUpConfirmOpen ||
    isItemReturnedConfirmOpen ||
    isItemLostConfirmOpen ||
    showNotificationModal ||
    isSendReminderConfirmOpen ||
    isReminderSentSuccessOpen ||
    isApproveAppointmentConfirmOpen ||
    isCompleteAppointmentConfirmOpen ||
    isCancelAppointmentConfirmOpen ||
    selectedCustomOrder ||
    isApproveCustomOrderConfirmOpen ||
    isAdjustCustomOrderConfirmOpen ||
    isArchiveCompletedCustomOrderConfirmOpen ||
    isRejectCustomOrderConfirmOpen
  );

  useModalInteractionLock(isAnyDashboardModalOpen);

  // Image upload state
  const [imageInputMode, setImageInputMode] = useState<'url' | 'file'>('url');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading3DModel, setIsUploading3DModel] = useState(false);
  const [modelUploadError, setModelUploadError] = useState<string | null>(null);
  const modelFileInputRef = useRef<HTMLInputElement>(null);

  // Load inventory from DB on mount
  useEffect(() => {
    loadInventory();
    loadBranchClickAnalysis();
    loadUsers();
    loadAdminRentals();
    loadAdminAppointments();
    loadAdminCustomOrders();
  }, []);

  useEffect(() => {
    loadBranchPerformance(selectedBranch);
  }, [selectedBranch]);

  const refreshAdminDashboardData = async (showLoading = false) => {
    await Promise.all([
      loadAdminRentals(showLoading),
      loadAdminAppointments(showLoading),
      loadAdminCustomOrders(showLoading),
      loadBranchPerformance(selectedBranch, showLoading),
    ]);
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      void refreshAdminDashboardData(false);
    }, ADMIN_DASHBOARD_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [selectedBranch, token]);

  useEffect(() => {
    const eventSource = createAdminDashboardEventSource(token);

    const handleAdminDashboardUpdate = () => {
      void refreshAdminDashboardData(false);
    };

    eventSource.addEventListener('admin-dashboard-update', handleAdminDashboardUpdate);

    return () => {
      eventSource.removeEventListener('admin-dashboard-update', handleAdminDashboardUpdate);
      eventSource.close();
    };
  }, [selectedBranch, token]);

  useEffect(() => {
    if (!canViewAdminHistory || activeTab !== 'history') return;
    loadAdminHistory();
  }, [activeTab, canViewAdminHistory]);

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
    if (canViewAdminHistory) {
      loadAdminHistory();
    }
  }, [activeTab, canViewAdminHistory]);

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

  const runRefreshForScope = async (scope: Exclude<DashboardRefreshScope, null>, refreshAction: () => Promise<void>) => {
    setDashboardRefreshScope(scope);
    try {
      await refreshAction();
    } finally {
      setDashboardRefreshScope((current) => (current === scope ? null : current));
    }
  };

  const handleRefreshOverview = () => {
    void runRefreshForScope('overview', async () => {
      const refreshTasks = [
        loadInventory(),
        loadUsers(),
        loadAdminRentals(),
        loadAdminAppointments(),
        loadAdminCustomOrders(),
        loadBranchPerformance(selectedBranch),
      ];

      if (canViewAdminHistory) {
        refreshTasks.push(loadAdminHistory());
      }

      await Promise.all(refreshTasks);
    });
  };

  const handleRefreshAdminRentals = () => {
    void runRefreshForScope('rentals', async () => {
      await loadAdminRentals();
    });
  };

  const handleRefreshAdminAppointments = () => {
    void runRefreshForScope('appointments', async () => {
      await loadAdminAppointments();
    });
  };

  const handleRefreshAdminCustomOrders = () => {
    void runRefreshForScope('bespoke', async () => {
      await loadAdminCustomOrders();
    });
  };

  const handleRefreshUsers = () => {
    void runRefreshForScope('users', async () => {
      await loadUsers();
    });
  };

  const handleRefreshAdminHistory = () => {
    if (!canViewAdminHistory) return;
    void runRefreshForScope('history', async () => {
      await loadAdminHistory();
    });
  };

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

  async function loadBranchClickAnalysis() {
    setBranchClickAnalysisLoading(true);
    try {
      const analysis = await inventoryAPI.getBranchClickAnalysis(token);
      setBranchClickAnalysis(analysis);
    } catch (err) {
      console.error('Failed to load branch click analysis:', err);
    } finally {
      setBranchClickAnalysisLoading(false);
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

  async function loadAdminRentals(showLoading = true) {
    if (showLoading) {
      setAdminRentalsLoading(true);
    }
    setAdminRentalsError(null);
    try {
      const rentals = await rentalAPI.rentalAPI.getAdminRentals(token);
      setAdminRentals(rentals);
    } catch (err) {
      setAdminRentalsError(err instanceof Error ? err.message : 'Failed to load rentals');
    } finally {
      if (showLoading) {
        setAdminRentalsLoading(false);
      }
    }
  }

  async function loadAdminAppointments(showLoading = true) {
    if (showLoading) {
      setAdminAppointmentsLoading(true);
    }
    setAdminAppointmentsError(null);
    try {
      const appointments = await appointmentAPI.getAdminAppointments(token);
      setAdminAppointments(appointments);
    } catch (err) {
      setAdminAppointmentsError(err instanceof Error ? err.message : 'Failed to load appointments');
    } finally {
      if (showLoading) {
        setAdminAppointmentsLoading(false);
      }
    }
  }

  async function loadAdminCustomOrders(showLoading = true) {
    if (showLoading) {
      setAdminCustomOrdersLoading(true);
    }
    setAdminCustomOrdersError(null);
    try {
      const orders = await adminCustomOrderAPI.getAllCustomOrders(token);
      setAdminCustomOrders(orders);
    } catch (err) {
      setAdminCustomOrdersError(err instanceof Error ? err.message : 'Failed to load custom orders');
    } finally {
      if (showLoading) {
        setAdminCustomOrdersLoading(false);
      }
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
      const refreshTasks = [loadAdminCustomOrders()];
      if (canViewAdminHistory) {
        refreshTasks.push(loadAdminHistory());
      }
      await Promise.all(refreshTasks);
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

    setRejectCustomOrderError(null);

    const updated = await handleCustomOrderStatusUpdate(orderId, 'rejected', trimmedReason);
    if (updated) {
      setIsRejectCustomOrderConfirmOpen(false);
      setRejectCustomOrderReason('');
      setSelectedCustomOrder(null);
    } else {
      setRejectCustomOrderError(adminCustomOrdersError || 'Failed to reject order');
    }
  }

  async function handleConfirmAdjustCustomOrder() {
    if (!selectedCustomOrder) return;

    const orderId = String(selectedCustomOrder.id || selectedCustomOrder._id || '');
    const trimmedReason = adjustCustomOrderReason.trim();
    if (!orderId) return;
    if (!trimmedReason) {
      setAdjustCustomOrderError('Adjustment reason is required.');
      return;
    }

    setAdjustCustomOrderError(null);

    const updated = await handleCustomOrderStatusUpdate(orderId, 'in-progress', trimmedReason);
    if (updated) {
      setIsAdjustCustomOrderConfirmOpen(false);
      setSelectedCustomOrder(null);
      setAdjustCustomOrderReason('');
    } else {
      setAdjustCustomOrderError(adminCustomOrdersError || 'Failed to request adjustment');
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
      if (canViewAdminHistory) {
        await loadAdminHistory();
      }
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
      if (canViewAdminHistory) {
        await loadAdminHistory();
      }
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
    const normalizedPreferredBranch = normalizeBranchName(user.preferredBranch);

    return {
      id: user.id,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phone: user.phoneNumber || 'N/A',
      branch: normalizedPreferredBranch,
      preferredBranch: String(user.preferredBranch || '').trim(),
      role: user.role,
      createdAt: user.createdAt,
      joinDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A',
      status: normalizeManagedUserStatus(user.status),
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
    if (normalized === 'chat_reply_sent') return 'Chat Reply Sent';
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

  const createNarrativeTable = (title: string, columns: string[], rows: Array<Array<string | number>>) => ({
    title,
    columns,
    rowCount: rows.length,
    sampleRows: rows.slice(0, 5).map((row) => row.map((cell) => String(cell ?? ''))),
  });

  const createNarrativeChart = (title: string, dataPoints: Array<{ label: string; value: string | number }>) => ({
    title,
    dataPoints: dataPoints.slice(0, 8),
  });

  const getLastAutoTableFinalY = (pdfDocument: jsPDF, fallbackY = 48) => {
    const lastTable = (pdfDocument as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
    return lastTable?.finalY ?? fallbackY;
  };

  const writePdfNarrativeBlock = (
    pdfDocument: jsPDF,
    narrative: AnalyticsNarrative | null,
    options?: {
      title?: string;
      startY?: number;
      addPage?: boolean;
      summaryOnly?: boolean;
    },
  ) => {
    if (!narrative) {
      return options?.startY ?? 48;
    }

    const sectionMaxWidth = 515;
    const lineHeight = 16;
    const pageHeight = pdfDocument.internal.pageSize.getHeight();
    let currentY = options?.startY ?? 48;

    if (options?.addPage) {
      pdfDocument.addPage();
      currentY = 48;
    }

    const ensurePageSpace = (requiredHeight: number) => {
      if (currentY + requiredHeight <= pageHeight - 40) {
        return;
      }

      pdfDocument.addPage();
      currentY = 48;
    };

    const writeParagraph = (text: string, fontSize: number, color: [number, number, number], extraGap = 12) => {
      const lines = pdfDocument.splitTextToSize(text, sectionMaxWidth);
      ensurePageSpace(lines.length * lineHeight + extraGap);
      pdfDocument.setFont('times', 'normal');
      pdfDocument.setFontSize(fontSize);
      pdfDocument.setTextColor(...color);
      pdfDocument.text(lines, 40, currentY);
      currentY += (lines.length * lineHeight) + extraGap;
    };

    const writeBulletSection = (title: string, items: string[]) => {
      const normalizedItems = items.filter(Boolean);
      if (normalizedItems.length === 0) {
        return;
      }

      ensurePageSpace(32);
      pdfDocument.setFont('times', 'normal');
      pdfDocument.setFontSize(13);
      pdfDocument.setTextColor(26, 26, 26);
      pdfDocument.text(title, 40, currentY);
      currentY += 18;

      normalizedItems.forEach((item) => {
        const lines = pdfDocument.splitTextToSize(`• ${item}`, sectionMaxWidth - 8);
        ensurePageSpace(lines.length * lineHeight + 8);
        pdfDocument.setFontSize(11);
        pdfDocument.setTextColor(60, 50, 40);
        pdfDocument.text(lines, 48, currentY);
        currentY += (lines.length * lineHeight) + 8;
      });
    };

    if (options?.title) {
      ensurePageSpace(24);
      pdfDocument.setFont('times', 'normal');
      pdfDocument.setFontSize(16);
      pdfDocument.setTextColor(26, 26, 26);
      pdfDocument.text(options.title, 40, currentY);
      currentY += 20;
    }

    if (options?.summaryOnly) {
      writeParagraph(narrative.summary, 11, [60, 50, 40], 12);
      return currentY;
    }

    writeParagraph(narrative.headline, 14, [26, 26, 26], 14);
    writeParagraph(narrative.summary, 11, [60, 50, 40], 18);
    writeBulletSection('Highlights', narrative.highlights);
    writeBulletSection('Risks', narrative.risks);
    writeBulletSection('Recommended Actions', narrative.recommendedActions);

    return currentY;
  };

  const appendPdfSectionNarrative = (
    pdfDocument: jsPDF,
    narrative: AnalyticsNarrative | null,
    title: string,
    startY: number,
  ) => writePdfNarrativeBlock(pdfDocument, narrative, {
    title,
    startY,
    summaryOnly: true,
  });

  const appendPdfFinalSummaryPage = (pdfDocument: jsPDF, narrative: AnalyticsNarrative | null, startY?: number) => {
    writePdfNarrativeBlock(pdfDocument, narrative, {
      title: 'Final Summary',
      startY,
      addPage: startY === undefined,
    });
  };

  const formatNarrativeLabel = (value: string) => value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

  const isCurrencyNarrativeKey = (key: string) => /sales|revenue|price|amount|budget|value/i.test(key);

  const formatNarrativeValue = (key: string, value: string | number) => {
    if (typeof value === 'number' && isCurrencyNarrativeKey(key)) {
      return `Php ${value.toLocaleString()}`;
    }

    const numericValue = Number(value);
    if (!Number.isNaN(numericValue) && String(value).trim() !== '' && isCurrencyNarrativeKey(key)) {
      return `Php ${numericValue.toLocaleString()}`;
    }

    return String(value);
  };

  const parseNarrativeNumber = (value: string | number) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const normalized = String(value)
      .replace(/Php\s*/gi, '')
      .replace(/₱/g, '')
      .replace(/,/g, '')
      .trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const formatNarrativeMetric = (label: string, value: string | number) => {
    const numericValue = parseNarrativeNumber(value);
    if (numericValue !== null && isCurrencyNarrativeKey(label)) {
      return `Php ${numericValue.toLocaleString()}`;
    }
    if (numericValue !== null && Number.isInteger(numericValue)) {
      return numericValue.toLocaleString();
    }
    return String(value);
  };

  const buildChartFallbackSummary = (payload: AnalyticsNarrativePayload) => {
    const chart = payload.charts?.[0];
    if (!chart || chart.dataPoints.length === 0) {
      return null;
    }

    const numericPoints = chart.dataPoints
      .map((point) => ({
        label: String(point.label || '').trim(),
        value: parseNarrativeNumber(point.value),
      }))
      .filter((point): point is { label: string; value: number } => Boolean(point.label) && point.value !== null);

    if (numericPoints.length === 0) {
      return null;
    }

    const sortedPoints = [...numericPoints].sort((left, right) => right.value - left.value);
    const highestPoint = sortedPoints[0];
    const lowestPoint = sortedPoints[sortedPoints.length - 1];
    const metricLabel = chart.title.replace(/\s+by\s+branch$/i, '').replace(/\s+comparison$/i, '').trim();
    const formattedHighest = formatNarrativeMetric(metricLabel, highestPoint.value);
    const formattedLowest = formatNarrativeMetric(metricLabel, lowestPoint.value);
    const branchFilter = payload.filters?.branchFilter ? ` for ${payload.filters.branchFilter}` : '';

    const firstParagraph = `${chart.title} compares ${numericPoints.length} data point${numericPoints.length === 1 ? '' : 's'}${branchFilter}. ${highestPoint.label} records the highest ${metricLabel.toLowerCase()} at ${formattedHighest}${numericPoints.length > 1 ? `, making it the strongest value in this section.` : '.'}`;
    const secondParagraph = numericPoints.length > 1
      ? `${lowestPoint.label} records the lowest ${metricLabel.toLowerCase()} at ${formattedLowest}. Overall, the chart shows how performance is distributed across the included labels, with ${highestPoint.label} leading this view and ${lowestPoint.label} trailing the rest.`
      : `Overall, the chart provides a focused view of the current ${metricLabel.toLowerCase()} result for ${highestPoint.label}.`;

    return `${firstParagraph}\n\n${secondParagraph}`;
  };

  const buildSummaryMetricsFallback = (table: NonNullable<AnalyticsNarrativePayload['tables']>[number]) => {
    const metrics = Object.fromEntries(
      table.sampleRows
        .filter((row) => row.length >= 2)
        .map((row) => [String(row[0] || '').trim(), String(row[1] || '').trim()])
    );

    const totalSales = metrics['Total Sales'];
    const numberOfOrders = metrics['Number of Orders'];
    const newCustomers = metrics['New Customers'];
    const topSellingItem = metrics['Top Selling Item'];

    const firstParagraph = `The Summary Metrics section brings together the main performance figures for this report. Total sales reached ${formatNarrativeMetric('totalSales', totalSales || '0')}${numberOfOrders ? ` from ${formatNarrativeMetric('numberOfOrders', numberOfOrders)} orders` : ''}${newCustomers ? `, while ${formatNarrativeMetric('newCustomers', newCustomers)} new customers were recorded during the selected period` : ''}.`;
    const secondParagraph = topSellingItem
      ? `${topSellingItem} stands out as the top-selling item in this view. Overall, this section provides a quick snapshot of sales activity, order volume, and customer movement for the current filters.`
      : 'Overall, this section provides a quick snapshot of sales activity and customer movement for the current filters.';

    return `${firstParagraph}\n\n${secondParagraph}`;
  };

  const buildBranchComparisonFallback = (table: NonNullable<AnalyticsNarrativePayload['tables']>[number]) => {
    const rows = table.sampleRows
      .filter((row) => row.length >= 5)
      .map((row) => ({
        branch: String(row[0] || '').trim(),
        revenue: parseNarrativeNumber(row[1]) ?? 0,
        rents: parseNarrativeNumber(row[2]) ?? 0,
        appointments: parseNarrativeNumber(row[3]) ?? 0,
        bespoke: parseNarrativeNumber(row[4]) ?? 0,
      }))
      .filter((row) => row.branch);

    if (rows.length === 0) {
      return null;
    }

    const highestRevenue = [...rows].sort((left, right) => right.revenue - left.revenue)[0];
    const highestAppointments = [...rows].sort((left, right) => right.appointments - left.appointments)[0];
    const highestBespoke = [...rows].sort((left, right) => right.bespoke - left.bespoke)[0];
    const lowestRevenue = [...rows].sort((left, right) => left.revenue - right.revenue)[0];

    const firstParagraph = `The Branch Comparison section shows how each branch performed across revenue, rents, appointments, and bespoke orders. ${highestRevenue.branch} posted the highest revenue at ${formatNarrativeMetric('revenue', highestRevenue.revenue)}, while ${highestAppointments.branch} led appointments with ${formatNarrativeMetric('appointments', highestAppointments.appointments)} and ${highestBespoke.branch} led bespoke orders with ${formatNarrativeMetric('bespoke', highestBespoke.bespoke)}.`;
    const secondParagraph = `${lowestRevenue.branch} recorded the lowest revenue at ${formatNarrativeMetric('revenue', lowestRevenue.revenue)}. Overall, the table shows that branch performance is mixed across the tracked metrics rather than being led by a single branch in every category.`;

    return `${firstParagraph}\n\n${secondParagraph}`;
  };

  const buildTableFallbackSummary = (payload: AnalyticsNarrativePayload) => {
    const table = payload.tables?.[0];
    if (!table || table.rowCount === 0) {
      return null;
    }

    if (table.title === 'Summary Metrics') {
      return buildSummaryMetricsFallback(table);
    }

    if (table.title === 'Branch Comparison') {
      return buildBranchComparisonFallback(table);
    }

    const firstRow = table.sampleRows[0] ?? [];
    const previewText = firstRow.length > 0
      ? `The first visible row begins with ${firstRow.map((cell) => String(cell || '').trim()).filter(Boolean).slice(0, 2).join(' and ')}.`
      : '';
    const firstParagraph = `The ${table.title} section contains ${table.rowCount} row${table.rowCount === 1 ? '' : 's'} for the current export. It summarizes the detailed records included in this part of the report.`;
    const secondParagraph = `${previewText} Overall, this table is intended to support a closer review of the underlying records for the selected filters.`.trim();

    return `${firstParagraph}\n\n${secondParagraph}`;
  };

  const buildFallbackNarrative = (payload: AnalyticsNarrativePayload): AnalyticsNarrative => {
    const chartSummary = payload.charts?.length === 1 && (!payload.tables || payload.tables.length === 0)
      ? buildChartFallbackSummary(payload)
      : null;
    const tableSummary = payload.tables?.length === 1 && (!payload.charts || payload.charts.length === 0)
      ? buildTableFallbackSummary(payload)
      : null;
    const totals = Object.entries(payload.totals ?? {}).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
    const filterEntries = Object.entries(payload.filters ?? {}).filter(([, value]) => String(value || '').trim() !== '');
    const tables = payload.tables ?? [];
    const charts = payload.charts ?? [];
    const limitedTotals = totals.slice(0, 3).map(([key, value]) => `${formatNarrativeLabel(key)}: ${formatNarrativeValue(key, value)}`);
    const nonEmptyTables = tables.filter((table) => table.rowCount > 0);
    const nonEmptyCharts = charts.filter((chart) => chart.dataPoints.length > 0);
    const summaryParts: string[] = [];

    if (limitedTotals.length > 0) {
      summaryParts.push(`${payload.reportTitle} includes ${limitedTotals.join(', ')}.`);
    } else if (tables.length > 0 || charts.length > 0) {
      summaryParts.push(`${payload.reportTitle} includes ${tables.length} table${tables.length === 1 ? '' : 's'} and ${charts.length} chart${charts.length === 1 ? '' : 's'}.`);
    } else {
      summaryParts.push(`${payload.reportTitle} data was prepared for export.`);
    }

    if (filterEntries.length > 0) {
      summaryParts.push(`Applied filters: ${filterEntries.map(([key, value]) => `${formatNarrativeLabel(key)} ${value}`).join(', ')}.`);
    }

    if (nonEmptyTables.length > 0 || nonEmptyCharts.length > 0) {
      summaryParts.push(`Visible sections with data: ${[
        ...nonEmptyTables.map((table) => table.title),
        ...nonEmptyCharts.map((chart) => chart.title),
      ].slice(0, 3).join(', ')}${nonEmptyTables.length + nonEmptyCharts.length > 3 ? ', and more' : ''}.`);
    }

    const highlights = [
      ...limitedTotals,
      ...nonEmptyTables.slice(0, 2).map((table) => `${table.title} contains ${table.rowCount} row${table.rowCount === 1 ? '' : 's'}.`),
      ...nonEmptyCharts.slice(0, 2).map((chart) => `${chart.title} contains ${chart.dataPoints.length} data point${chart.dataPoints.length === 1 ? '' : 's'}.`),
    ].slice(0, 4);

    const risks = [
      ...tables.filter((table) => table.rowCount === 0).map((table) => `${table.title} has no rows in this export.`),
      ...charts.filter((chart) => chart.dataPoints.length === 0).map((chart) => `${chart.title} has no chart data in this export.`),
    ].slice(0, 3);

    const recommendedActions = [
      filterEntries.length > 0 ? `Review the export using the selected filters: ${filterEntries.map(([, value]) => value).join(', ')}.` : '',
      nonEmptyTables[0] ? `Check ${nonEmptyTables[0].title} for the detailed records behind this summary.` : '',
      nonEmptyCharts[0] ? `Use ${nonEmptyCharts[0].title} to compare values across the included data points.` : '',
    ].filter(Boolean).slice(0, 3);

    return {
      headline: `${payload.reportTitle} Summary`,
      summary: chartSummary || tableSummary || summaryParts.join(' '),
      highlights,
      risks,
      recommendedActions,
    };
  };

  const requestSectionNarrative = async (payload: AnalyticsNarrativePayload, sectionTitle: string, sectionKind: 'table' | 'chart') => {
    return requestAnalyticsNarrative({
      ...payload,
      reportTitle: `${payload.reportTitle} - ${sectionTitle}`,
      notes: [
        `Write exactly 2 short paragraphs for the ${sectionKind} titled "${sectionTitle}" only, with 2 to 3 grammatically correct sentences per paragraph.`,
        'In the first paragraph, explain what the section is summarizing and identify the strongest values when the data supports that comparison.',
        'In the second paragraph, mention weaker or lower values when supported and end with a brief overall takeaway.',
        'Do not copy labels mechanically or list values without explanation.',
      ],
    });
  };

  const requestAnalyticsNarrative = async (payload: AnalyticsNarrativePayload) => {
    try {
      return await generateAnalyticsReportNarrative(token, payload);
    } catch (error) {
      console.error('Analytics narrative generation failed:', error);
      return buildFallbackNarrative(payload);
    }
  };

  const openAdminHistoryExportModal = () => {
    if (!canExportPdfs) return;

    setAdminHistoryExportFormat('pdf');
    setShowAdminHistoryExportModal(true);
  };

  const handleSaveAdminHistoryAsPdf = async () => {
    if (!canExportPdfs) return;

    const generatedAt = new Date().toLocaleString();
    const rows = filteredAdminHistory.map((entry) => [
      entry.adminLabel || 'Admin',
      entry.adminEmail || 'No email',
      formatHistoryAction(entry.action),
      entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'N/A',
      formatHistoryDetails(entry),
    ]);
    const filenameBase = `activity-logs-report-${new Date().toISOString().slice(0, 10)}`;

    if (adminHistoryExportFormat === 'csv') {
      const csvContent = createCsvContent(
        ['Admin', 'Email', 'Action', 'Date / Time', 'Details'],
        rows,
      );

      saveFile(csvContent, `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
      setShowAdminHistoryExportModal(false);
      return;
    }

    if (adminHistoryExportFormat === 'xls') {
      const xlsContent = createXlsContent(
        ['Admin', 'Email', 'Action', 'Date / Time', 'Details'],
        rows,
      );

      saveFile(xlsContent, `${filenameBase}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
      setShowAdminHistoryExportModal(false);
      return;
    }

    const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const narrative = await requestAnalyticsNarrative({
      reportType: 'admin-history',
      reportTitle: 'Activity Logs Report',
      generatedAt,
      totals: {
        totalRecords: filteredAdminHistory.length,
      },
      tables: [createNarrativeTable('Activity Logs', ['Admin', 'Email', 'Action', 'Date / Time', 'Details'], rows)],
    });

    document.setFont('times', 'normal');
    document.setFontSize(22);
    document.text('Activity Logs Report', 40, 44);
    document.setFontSize(10);
    document.setTextColor(107, 93, 79);
    document.text(`Generated: ${generatedAt}`, 40, 64);
    document.text(`Total records: ${filteredAdminHistory.length}`, 40, 80);

    autoTable(document, {
      startY: 96,
      head: [['Admin', 'Email', 'Action', 'Date / Time', 'Details']],
      body: rows.length > 0 ? rows : [['-', '', 'No activity logs available for export.', '', '']],
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 7,
        textColor: [26, 26, 26],
        lineColor: [214, 198, 176],
        lineWidth: 0.45,
      },
      headStyles: {
        fillColor: [250, 247, 240],
        textColor: [107, 93, 79],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [252, 250, 245],
      },
      margin: { left: 40, right: 40, bottom: 40 },
      columnStyles: {
        4: { cellWidth: 280 },
      },
    });

    appendPdfSectionNarrative(document, narrative, 'Activity Logs Summary', getLastAutoTableFinalY(document, 96) + 20);
    appendPdfFinalSummaryPage(document, narrative);

    document.save(`${filenameBase}.pdf`);
    setShowAdminHistoryExportModal(false);
  };

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
    setUserArchiveReason('');
    setUserArchiveReasonError(null);
  }

  async function handleConfirmArchiveUser() {
    if (!confirmUserArchive) return;

    const isElevatedTarget = confirmUserArchive.role === 'Admin' || confirmUserArchive.role === 'Staff';
    if (isCurrentUserStaff && isElevatedTarget) {
      setUsersError('Staff accounts cannot archive admin or staff accounts.');
      setConfirmUserArchive(null);
      return;
    }

    const trimmedReason = userArchiveReason.trim();
    if (!trimmedReason) {
      setUserArchiveReasonError('Archive reason is required.');
      return;
    }

    setIsConfirmingUserArchive(true);
    setArchivingUserId(confirmUserArchive.id);
    setUsersError(null);
    setUserArchiveReasonError(null);
    try {
      await usersAPI.archiveUser(token, confirmUserArchive.role, confirmUserArchive.id, trimmedReason);
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
      setUserArchiveReason('');
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to archive user');
    } finally {
      setIsConfirmingUserArchive(false);
      setArchivingUserId(null);
    }
  }

  async function handleCreateUser() {
    setNewUserError(null);

    if (!newUserForm.email.trim()) {
      setNewUserError('Email is required.');
      return;
    }

    if (!newUserForm.firstName.trim() || !newUserForm.lastName.trim()) {
      setNewUserError('First name and last name are required.');
      return;
    }

    if (
      newUserForm.role === 'Customer' &&
      (!newUserForm.firstName.trim() || !newUserForm.lastName.trim() || !newUserForm.phoneNumber.trim())
    ) {
      setNewUserError('First name, last name, and phone number are required for customer accounts.');
      return;
    }

    if (newUserForm.phoneNumber && newUserForm.phoneNumber.length !== 10) {
      setNewUserError('Phone number must use the format 9123456789.');
      return;
    }

    if (newUserForm.role === 'Staff' && !newUserForm.preferredBranch.trim()) {
      setNewUserError('Branch assignment is required for staff accounts.');
      return;
    }

    const payload: CreateManagedUserPayload = {
      role: newUserForm.role,
      email: newUserForm.email.trim(),
      firstName: newUserForm.firstName.trim(),
      lastName: newUserForm.lastName.trim(),
      ...(newUserForm.role === 'Staff'
        ? {
            phoneNumber: newUserForm.phoneNumber ? `+63${newUserForm.phoneNumber}` : '',
            preferredBranch: newUserForm.preferredBranch.trim(),
          }
        : {}),
      ...(newUserForm.role === 'Customer'
        ? {
            phoneNumber: `+63${newUserForm.phoneNumber}`
          }
        : {})
    };

    setCreatingUser(true);
    try {
      await usersAPI.createUser(token, payload);
      await loadUsers();
      setShowAddUserModal(false);
      setUsersMessage('User created successfully. Login credentials were sent to their email.');
      setTimeout(() => setUsersMessage(null), 8000);
      setNewUserForm({
        role: 'Customer',
        email: '',
        firstName: '',
        lastName: '',
        phoneNumber: '',
        preferredBranch: 'Taguig Main'
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

  async function loadBranchPerformance(branchFilter: string, showLoading = true) {
    if (showLoading) {
      setBranchPerformanceLoading(true);
    }
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
      if (showLoading) {
        setBranchPerformanceLoading(false);
      }
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
      const updated = await rentalAPI.rentalAPI.updateRentalStatus(token, selectedPendingRental.id, nextStatus);
      setAdminRentals((prev) =>
        prev.map((rental) =>
          rental.id === selectedPendingRental.id ? updated : rental
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
  const MAX_ITEM_IMAGES = 6;
  const ALLOWED_MIME = ['image/jpeg', 'image/png'];
  const MAX_3D_MODEL_SIZE = 75 * 1024 * 1024;
  const ALLOWED_3D_MODEL_EXTENSIONS = ['.glb', '.gltf', '.usdz', '.zip'];

  const getModel3DUrl = (item: Partial<InventoryItem> | null | undefined): string => String(item?.model3dUrl || '').trim();

  const getDisplayFileName = (value: string): string => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';

    try {
      const parsed = new URL(trimmed);
      const pathname = parsed.pathname.split('/').filter(Boolean);
      return pathname[pathname.length - 1] || trimmed;
    } catch {
      const parts = trimmed.split('/').filter(Boolean);
      return parts[parts.length - 1] || trimmed;
    }
  };

  const getItemImageList = (item?: Partial<InventoryItem> | null) => {
    const primaryImage = String(item?.image || '').trim();
    const additionalImages = Array.isArray(item?.images)
      ? item.images.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];

    return (primaryImage
      ? [primaryImage, ...additionalImages.filter((entry) => entry !== primaryImage)]
      : additionalImages
    ).slice(0, MAX_ITEM_IMAGES);
  };

  const syncItemImages = (item: Partial<InventoryItem>, images: string[]): Partial<InventoryItem> => ({
    ...item,
    image: images[0] || '',
    images,
  });

  const updatePrimaryImage = (item: Partial<InventoryItem>, value: string): Partial<InventoryItem> => {
    const normalizedValue = value.trim();
    const remainingImages = getItemImageList(item).filter((_, index) => index !== 0);
    const nextImages = normalizedValue ? [normalizedValue, ...remainingImages] : remainingImages;
    return syncItemImages(item, nextImages.slice(0, MAX_ITEM_IMAGES));
  };

  const removeItemImageAtIndex = (indexToRemove: number) => {
    if (editingItem) {
      setEditingItem((prev) => {
        if (!prev) return prev;
        const nextImages = getItemImageList(prev).filter((_, index) => index !== indexToRemove);
        return syncItemImages(prev, nextImages);
      });
      return;
    }

    setNewItem((prev) => {
      const nextImages = getItemImageList(prev).filter((_, index) => index !== indexToRemove);
      return syncItemImages(prev, nextImages);
    });
    setAddItemErrors((prev) => ({ ...prev, image: '' }));
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const currentImages = getItemImageList(editingItem ?? newItem);
    const remainingSlots = MAX_ITEM_IMAGES - currentImages.length;

    if (files.length > remainingSlots) {
      setImageUploadError(`You can upload up to ${MAX_ITEM_IMAGES} images per item.`);
      e.target.value = '';
      return;
    }

    for (const file of files) {
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
    }

    setImageUploadError(null);
    setIsUploadingImage(true);
    try {
      const uploadedUrls = await Promise.all(files.map((file) => inventoryAPI.uploadImage(token, file)));
      const nextImages = [...currentImages, ...uploadedUrls].slice(0, MAX_ITEM_IMAGES);
      if (editingItem) {
        setEditingItem(prev => prev ? syncItemImages(prev, nextImages) : prev);
      } else {
        setNewItem(prev => syncItemImages(prev, nextImages));
        setAddItemErrors(prev => ({ ...prev, image: '' }));
      }
    } catch (err) {
      setImageUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  };

  const handle3DModelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = `.${String(file.name || '').split('.').pop() || ''}`.toLowerCase();
    if (!ALLOWED_3D_MODEL_EXTENSIONS.includes(extension)) {
      setModelUploadError('Invalid file type. Please use GLB, GLTF, USDZ, or ZIP.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_3D_MODEL_SIZE) {
      setModelUploadError('File exceeds 75 MB limit.');
      e.target.value = '';
      return;
    }

    setModelUploadError(null);
    setIsUploading3DModel(true);
    try {
      const uploadedUrl = await inventoryAPI.upload3DModel(token, file);
      if (editingItem) {
        setEditingItem((prev) => prev ? { ...prev, model3dUrl: uploadedUrl } : prev);
      } else {
        setNewItem((prev) => ({ ...prev, model3dUrl: uploadedUrl }));
      }
    } catch (err) {
      setModelUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading3DModel(false);
      e.target.value = '';
    }
  };

  const resetImageModal = () => {
    setImageInputMode('url');
    setImageUploadError(null);
    setIsUploadingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setModelUploadError(null);
    setIsUploading3DModel(false);
    if (modelFileInputRef.current) modelFileInputRef.current.value = '';
  };

  useEffect(() => {
    if (!showAddItem) {
      setIsCustomCategoryInputVisible(false);
      setCustomCategoryDraft('');
      setIsCategoryDropdownOpen(false);
      setPendingCategoryDeletion(null);
    }
  }, [showAddItem]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!categoryDropdownRef.current?.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  const cancelCustomCategorySelection = () => {
    const fallbackCategory = previousCategoryBeforeCustomInput || DEFAULT_INVENTORY_CATEGORY;

    setIsCustomCategoryInputVisible(false);
    setCustomCategoryDraft('');
    setIsConfirmCustomCategoryOpen(false);
    setIsCategoryDropdownOpen(false);
    setPendingCategoryDeletion(null);

    if (editingItem) {
      setEditingItem({ ...editingItem, category: fallbackCategory });
      return;
    }

    setNewItem({ ...newItem, category: fallbackCategory });
    setAddItemErrors((prev) => ({ ...prev, category: '' }));
  };

  const handleCategorySelectionChange = (nextValue: string) => {
    setIsCategoryDropdownOpen(false);

    if (nextValue === NEW_CATEGORY_OPTION) {
      setPreviousCategoryBeforeCustomInput(editingItem?.category || newItem.category || DEFAULT_INVENTORY_CATEGORY);
      setIsCustomCategoryInputVisible(true);
      setCustomCategoryDraft(editingItem?.category || '');

      if (editingItem) {
        setEditingItem({ ...editingItem, category: '' });
      } else {
        setNewItem({ ...newItem, category: '' });
        setAddItemErrors((prev) => ({ ...prev, category: '' }));
      }

      return;
    }

    setIsCustomCategoryInputVisible(false);
    setCustomCategoryDraft('');

    if (editingItem) {
      setEditingItem({ ...editingItem, category: nextValue });
    } else {
      setNewItem({ ...newItem, category: nextValue });
      setAddItemErrors((prev) => ({ ...prev, category: '' }));
    }
  };

  const handleCustomCategoryInputChange = (nextValue: string) => {
    setCustomCategoryDraft(nextValue);

    if (editingItem) {
      setEditingItem({ ...editingItem, category: nextValue });
    } else {
      setNewItem({ ...newItem, category: nextValue });
      setAddItemErrors((prev) => ({ ...prev, category: '' }));
    }
  };

  const handleAddCustomCategory = () => {
    const trimmedCategory = customCategoryDraft.trim();

    if (!trimmedCategory) {
      if (!editingItem) {
        setAddItemErrors((prev) => ({ ...prev, category: 'This field is required' }));
      }
      return;
    }

    setIsConfirmCustomCategoryOpen(true);
  };

  const confirmAddCustomCategory = () => {
    const trimmedCategory = customCategoryDraft.trim();

    if (!trimmedCategory) {
      if (!editingItem) {
        setAddItemErrors((prev) => ({ ...prev, category: 'This field is required' }));
      }
      setIsConfirmCustomCategoryOpen(false);
      return;
    }

    if (editingItem) {
      setEditingItem({ ...editingItem, category: trimmedCategory });
    } else {
      setNewItem({ ...newItem, category: trimmedCategory });
      setAddItemErrors((prev) => ({ ...prev, category: '' }));
    }

    setCustomCategoryDraft(trimmedCategory);
    setIsCustomCategoryInputVisible(false);
    setIsConfirmCustomCategoryOpen(false);
    setRemovedCategoryOptions((prev) => prev.filter((category) => category !== trimmedCategory));
  };

  const requestCategoryDeletion = (category: string) => {
    setIsCategoryDropdownOpen(false);
    setPendingCategoryDeletion(category);
  };

  const closeCategoryDeletionModal = () => {
    setPendingCategoryDeletion(null);
  };

  const confirmCategoryDeletion = () => {
    if (!pendingCategoryDeletion || pendingCategoryDeletionUsageCount > 0) {
      return;
    }

    setRemovedCategoryOptions((prev) => Array.from(new Set([...prev, pendingCategoryDeletion])));

    if (editingItem?.category === pendingCategoryDeletion) {
      setEditingItem({ ...editingItem, category: DEFAULT_INVENTORY_CATEGORY });
    }

    if (newItem.category === pendingCategoryDeletion) {
      setNewItem({ ...newItem, category: DEFAULT_INVENTORY_CATEGORY });
      setAddItemErrors((prev) => ({ ...prev, category: '' }));
    }

    if (customCategoryDraft.trim() === pendingCategoryDeletion) {
      setCustomCategoryDraft('');
    }

    setPendingCategoryDeletion(null);
  };

  const validateAddItem = () => {
    const errors: Partial<Record<AddItemField, string>> = {};
    const duplicateItem = inventory.find((item) => (
      String(item.name || '').trim().toLowerCase() === String(newItem.name || '').trim().toLowerCase()
    ));

    if (!newItem.name?.trim()) errors.name = 'This field is required';
    if (newItem.stock === undefined || Number.isNaN(Number(newItem.stock)) || Number(newItem.stock) <= 0) {
      errors.stock = 'This field is required';
    } else if (Number(newItem.stock) > MAX_INVENTORY_STOCK) {
      errors.stock = `Stock cannot exceed ${MAX_INVENTORY_STOCK}.`;
    }

    if (!duplicateItem) {
      if (!newItem.category?.trim()) errors.category = 'This field is required';
      if (!newItem.color?.trim()) errors.color = 'This field is required';
      if (newItem.price === undefined || Number.isNaN(Number(newItem.price)) || Number(newItem.price) <= 0) {
        errors.price = 'This field is required';
      }
      if (!newItem.branch?.trim()) errors.branch = 'This field is required';
      if (!newItem.status?.trim()) errors.status = 'This field is required';
      if (getItemImageList(newItem).length === 0) errors.image = 'At least one image is required';
      if (!newItem.description?.trim()) errors.description = 'This field is required';
    }

    setAddItemErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const isArchiveView = inventoryView === 'archive';
  const completedRentalStatuses = ['paid_for_confirmation', 'for_pickup', 'active', 'completed'];
  const now = new Date();
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  const previousWeekStart = new Date(now);
  previousWeekStart.setDate(previousWeekStart.getDate() - 14);
  const isWithinRange = (value: string | null | undefined, start: Date, end: Date) => {
    const parsed = value ? new Date(value) : null;
    return Boolean(parsed && !Number.isNaN(parsed.getTime()) && parsed >= start && parsed < end);
  };
  const buildTrendSummary = (current: number, previous: number) => {
    if (current === previous) {
      return {
        direction: 'flat' as const,
        label: '0% from last week',
        textClassName: 'text-[#9E8E80]',
        iconClassName: 'text-[#9E8E80]'
      };
    }

    if (previous <= 0) {
      return {
        direction: 'up' as const,
        label: current > 0 ? 'New this week' : '0% from last week',
        textClassName: current > 0 ? 'text-green-600' : 'text-[#9E8E80]',
        iconClassName: current > 0 ? 'text-green-600' : 'text-[#9E8E80]'
      };
    }

    const change = ((current - previous) / previous) * 100;
    const roundedChange = Math.round(Math.abs(change));

    if (change > 0) {
      return {
        direction: 'up' as const,
        label: `+${roundedChange}% from last week`,
        textClassName: 'text-green-600',
        iconClassName: 'text-green-600'
      };
    }

    return {
      direction: 'down' as const,
      label: `-${roundedChange}% from last week`,
      textClassName: 'text-red-600',
      iconClassName: 'text-red-600'
    };
  };
  const overviewTodayKey = toLocalDateKey(now);
  const formatOverviewScheduleTime = (value: string | null | undefined) => {
    const rawValue = String(value || '').trim();
    if (!rawValue) return 'Time not set';

    const hoursMinutesMatch = rawValue.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
    if (!hoursMinutesMatch) {
      return rawValue;
    }

    let hours = Number(hoursMinutesMatch[1]);
    const minutes = hoursMinutesMatch[2];
    const explicitMeridiem = hoursMinutesMatch[3]?.toUpperCase();

    if (explicitMeridiem) {
      if (explicitMeridiem === 'PM' && hours < 12) {
        hours += 12;
      }
      if (explicitMeridiem === 'AM' && hours === 12) {
        hours = 0;
      }
    }

    if (!Number.isInteger(hours) || hours < 0 || hours > 23) {
      return rawValue;
    }

    const meridiem = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes} ${meridiem}`;
  };
  const getOverviewTimeSortValue = (value: string | null | undefined) => {
    const rawValue = String(value || '').trim();
    if (!rawValue) return Number.MAX_SAFE_INTEGER;

    const hoursMinutesMatch = rawValue.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
    if (!hoursMinutesMatch) {
      return Number.MAX_SAFE_INTEGER;
    }

    let hours = Number(hoursMinutesMatch[1]);
    const minutes = Number(hoursMinutesMatch[2]);
    const explicitMeridiem = hoursMinutesMatch[3]?.toUpperCase();

    if (explicitMeridiem) {
      if (explicitMeridiem === 'PM' && hours < 12) {
        hours += 12;
      }
      if (explicitMeridiem === 'AM' && hours === 12) {
        hours = 0;
      }
    }

    if (!Number.isInteger(hours) || hours < 0 || hours > 23 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
      return Number.MAX_SAFE_INTEGER;
    }

    return hours * 60 + minutes;
  };
  const allTodaysActivity: OverviewActivityRow[] = [
    ...adminRentals
      .filter((rental) => (
        String(rental.pickupScheduleDate || '').trim() === overviewTodayKey
        || (rental.status === 'active' && String(rental.endDate || '').trim() === overviewTodayKey)
      ))
      .map((rental) => {
        const isReturnActivity = rental.status === 'active' && String(rental.endDate || '').trim() === overviewTodayKey;

        return {
          id: `rental-${rental.id}`,
          source: 'Rental' as const,
          title: isReturnActivity ? 'Return' : 'Pick Up',
          customerName: rental.customerName || 'Unknown customer',
          detail: rental.referenceId || rental.id || 'N/A',
          branch: getShortBranchLabel(rental.branch),
          timeLabel: formatOverviewScheduleTime(rental.pickupScheduleTime),
          sortValue: getOverviewTimeSortValue(rental.pickupScheduleTime),
        };
      }),
    ...adminAppointments
      .filter((appointment) => (
        appointment.status === 'scheduled'
        && String(appointment.date || '').trim() === overviewTodayKey
      ))
      .map((appointment) => ({
        id: `appointment-${appointment.id}`,
        source: 'Appointment' as const,
        title: appointment.type === 'consultation'
          ? 'Design Consultation'
          : appointment.type === 'measurement'
            ? 'Measurement Session'
            : appointment.type === 'fitting'
              ? 'Fitting Appointment'
              : 'Pickup / Return',
        customerName: appointment.customerName || 'Unknown customer',
        detail: appointment.referenceId || appointment.id || 'N/A',
        branch: getShortBranchLabel(appointment.branch),
        timeLabel: formatOverviewScheduleTime(appointment.time),
        sortValue: getOverviewTimeSortValue(appointment.time),
      })),
    ...adminCustomOrders
      .filter((order) => !order.isArchived)
      .flatMap((order) => {
        const entries: OverviewActivityRow[] = [];
        const orderId = String(order.id || order._id || order.referenceId || Math.random()).trim();
        const consultationDate = String(order.consultationDate || '').trim();
        const fittingDate = String(order.fittingDate || '').trim();

        if (consultationDate === overviewTodayKey) {
          entries.push({
            id: `custom-order-consultation-${orderId}`,
            source: 'Custom Order' as const,
            title: 'Design Consultation',
            customerName: order.customerName || 'Unknown customer',
            detail: order.referenceId || orderId || 'N/A',
            branch: getShortBranchLabel(order.branch),
            timeLabel: formatOverviewScheduleTime(order.consultationTime),
            sortValue: getOverviewTimeSortValue(order.consultationTime),
          });
        }

        if (fittingDate === overviewTodayKey) {
          entries.push({
            id: `custom-order-fitting-${orderId}`,
            source: 'Custom Order' as const,
            title: 'Fitting Appointment',
            customerName: order.customerName || 'Unknown customer',
            detail: order.referenceId || orderId || 'N/A',
            branch: getShortBranchLabel(order.branch),
            timeLabel: formatOverviewScheduleTime(order.fittingTime),
            sortValue: getOverviewTimeSortValue(order.fittingTime),
          });
        }

        return entries;
      }),
  ].sort((left, right) => {
    if (left.sortValue !== right.sortValue) {
      return left.sortValue - right.sortValue;
    }

    return left.title.localeCompare(right.title);
  });
  const todaysActivity = allTodaysActivity.filter((activity) => matchesSelectedBranch(activity.branch, selectedBranch));
  const todaysActivityTotalPages = Math.max(1, Math.ceil(todaysActivity.length / OVERVIEW_ACTIVITY_PAGE_SIZE));
  const safeOverviewActivityPage = Math.min(overviewActivityPage, todaysActivityTotalPages);
  const paginatedTodaysActivity = todaysActivity.slice(
    (safeOverviewActivityPage - 1) * OVERVIEW_ACTIVITY_PAGE_SIZE,
    safeOverviewActivityPage * OVERVIEW_ACTIVITY_PAGE_SIZE,
  );
  const overviewExportBranchOptions = Array.from(new Set(allTodaysActivity.map((activity) => activity.branch))).sort((left, right) => left.localeCompare(right));
  const getOverviewExportItems = (branchFilter: string, typeFilter: OverviewExportTypeFilter[]) => (
    allTodaysActivity.filter((activity) => {
      const matchesBranch = branchFilter === 'All Branches' || activity.branch === branchFilter;
      const matchesType = typeFilter.length === 0 || typeFilter.includes(activity.source);
      return matchesBranch && matchesType;
    })
  );
  const overviewExportItems = getOverviewExportItems(overviewExportBranchFilter, overviewExportTypeFilter);
  const overviewExportTypeOptions: Array<{ value: OverviewExportTypeFilter; label: string; count: number }> = [
    { value: 'Rental', label: 'Rentals', count: getOverviewExportItems(overviewExportBranchFilter, ['Rental']).length },
    { value: 'Appointment', label: 'Appointments', count: getOverviewExportItems(overviewExportBranchFilter, ['Appointment']).length },
    { value: 'Custom Order', label: 'Custom Orders', count: getOverviewExportItems(overviewExportBranchFilter, ['Custom Order']).length },
  ];
  const overviewExportTypeLabel = overviewExportTypeFilter.length === 0
    ? 'All Types'
    : overviewExportTypeFilter.length === overviewExportTypeOptions.length
      ? 'All Types'
      : overviewExportTypeFilter.join(', ');
  const openOverviewExportModal = () => {
    if (!canExportPdfs) return;

    setOverviewExportBranchFilter(selectedBranch === 'All Branches' ? 'All Branches' : getShortBranchLabel(selectedBranch));
    setOverviewExportTypeFilter([...OVERVIEW_EXPORT_TYPE_OPTIONS]);
    setOverviewExportFormat('pdf');
    setShowOverviewExportModal(true);
  };
  const openStoreOverviewExportModal = () => {
    if (!canExportPdfs) return;

    setSelectedStoreOverviewExportBranches(
      selectedBranch === 'All Branches'
        ? ['All Branches']
        : [selectedBranch]
    );
    setStoreOverviewExportFormat('pdf');
    setShowStoreOverviewExportModal(true);
  };
  const toggleStoreOverviewExportBranch = (branchOption: string) => {
    setSelectedStoreOverviewExportBranches((current) => {
      if (branchOption === 'All Branches') {
        return ['All Branches'];
      }

      const withoutAll = current.filter((branch) => branch !== 'All Branches');
      if (withoutAll.includes(branchOption)) {
        const nextBranches = withoutAll.filter((branch) => branch !== branchOption);
        return nextBranches.length > 0 ? nextBranches : ['All Branches'];
      }

      return [...withoutAll, branchOption];
    });
  };
  const matchesStoreOverviewExportBranch = (branch: string | null | undefined) => (
    selectedStoreOverviewExportBranches.includes('All Branches')
      || selectedStoreOverviewExportBranches.some((selectedExportBranch) => (
        normalizeBranchName(selectedExportBranch) === normalizeBranchName(branch)
      ))
  );
  const storeOverviewBranchFilterLabel = selectedStoreOverviewExportBranches.includes('All Branches')
    ? 'All Branches'
    : selectedStoreOverviewExportBranches.join(', ');
  const inventoryExportBranchOptions = Array.from(new Set(
    [...inventory, ...archivedItems]
      .map((item) => normalizeBranchName(item.branch))
      .filter(Boolean)
  )).sort((left, right) => left.localeCompare(right));
  const toggleInventoryExportBranch = (branchOption: string) => {
    setSelectedInventoryExportBranches((current) => {
      if (branchOption === 'All Branches') {
        return ['All Branches'];
      }

      const withoutAll = current.filter((branch) => branch !== 'All Branches');
      if (withoutAll.includes(branchOption)) {
        const nextBranches = withoutAll.filter((branch) => branch !== branchOption);
        return nextBranches.length > 0 ? nextBranches : ['All Branches'];
      }

      return [...withoutAll, branchOption];
    });
  };
  const matchesInventoryExportBranch = (branch: string | null | undefined) => (
    selectedInventoryExportBranches.includes('All Branches')
      || selectedInventoryExportBranches.some((selectedExportBranch) => (
        normalizeBranchName(selectedExportBranch) === normalizeBranchName(branch)
      ))
  );
  const inventoryExportBranchLabel = selectedInventoryExportBranches.includes('All Branches')
    ? 'All Branches'
    : selectedInventoryExportBranches.join(', ');
  const openInventoryExportModal = () => {
    if (!canExportPdfs) return;

    setSelectedInventoryExportBranches(
      selectedBranch === 'All Branches'
        ? ['All Branches']
        : [selectedBranch]
    );
    setInventoryExportFormat('pdf');
    setShowInventoryExportModal(true);
  };
  useEffect(() => {
    setOverviewActivityPage(1);
  }, [selectedBranch]);
  const totalSales = adminRentals
    .filter((rental) => completedRentalStatuses.includes(rental.status))
    .reduce((sum, rental) => sum + Number(rental.totalPrice || 0), 0);
  const inventoryItemsForLookup = [...inventory, ...archivedItems];
  const topSellingItemEntry = Object.values(
    adminRentals
      .filter((rental) => completedRentalStatuses.includes(rental.status))
      .reduce<Record<string, { sku: string; gownName: string; count: number }>>((counts, rental) => {
        const sku = String(rental.sku || '').trim();
        const gownName = String(rental.gownName || '').trim();
        const key = sku || gownName.toLowerCase();
        if (!key) {
          return counts;
        }

        const existing = counts[key];
        if (existing) {
          existing.count += 1;
          return counts;
        }

        counts[key] = {
          sku,
          gownName,
          count: 1,
        };
        return counts;
      }, {})
  ).sort((left, right) => right.count - left.count)[0] ?? null;
  const numberOfOrders = adminRentals.length + adminCustomOrders.filter((order) => !order.isArchived).length;
  const recentCustomerThreshold = new Date();
  recentCustomerThreshold.setDate(recentCustomerThreshold.getDate() - 30);
  const newCustomers = users.filter((user) => {
    if (user.role !== 'Customer' || !user.createdAt) {
      return false;
    }

    const createdAt = new Date(user.createdAt);
    return !Number.isNaN(createdAt.getTime()) && createdAt >= recentCustomerThreshold;
  }).length;
  const topSellingInventoryItem = topSellingItemEntry
    ? inventoryItemsForLookup.find((item) => {
        const sku = String(item.sku || '').trim();
        if (topSellingItemEntry.sku && sku) {
          return sku.toLowerCase() === topSellingItemEntry.sku.toLowerCase();
        }

        return String(item.name || '').trim().toLowerCase() === topSellingItemEntry.gownName.toLowerCase();
      }) ?? null
    : null;
  const topSellingItemName = topSellingInventoryItem?.name || topSellingItemEntry?.gownName || 'No sales yet';
  const topSellingItemCount = topSellingItemEntry?.count ?? 0;
  const rentedItemPalette = ['#D4AF37', '#B86A6A', '#6E8B78', '#7A8FB3', '#A27F5D'];
  const completedRentalItemCounts = Object.values(
    adminRentals
      .filter((rental) => completedRentalStatuses.includes(rental.status))
      .reduce<Record<string, { sku: string; gownName: string; count: number }>>((counts, rental) => {
        const sku = String(rental.sku || '').trim();
        const gownName = String(rental.gownName || '').trim();
        const key = sku || gownName.toLowerCase();
        if (!key) {
          return counts;
        }

        const existing = counts[key];
        if (existing) {
          existing.count += 1;
          return counts;
        }

        counts[key] = {
          sku,
          gownName,
          count: 1,
        };
        return counts;
      }, {})
  )
    .map((entry) => {
      const inventoryMatch = inventoryItemsForLookup.find((item) => {
        const itemSku = String(item.sku || '').trim().toLowerCase();
        const itemName = String(item.name || '').trim().toLowerCase();
        const targetSku = String(entry.sku || '').trim().toLowerCase();
        const targetName = String(entry.gownName || '').trim().toLowerCase();

        return targetSku
          ? itemSku === targetSku
          : itemName === targetName;
      });

      return {
        name: inventoryMatch?.name || entry.gownName,
        count: entry.count,
        inventoryItem: inventoryMatch ?? null,
      };
    });
  const mostRentedItems = completedRentalItemCounts
    .slice()
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 5)
    .map((item, index) => ({
      ...item,
      fill: rentedItemPalette[index % rentedItemPalette.length],
    }));
  const leastRentedItems = completedRentalItemCounts
    .slice()
    .sort((left, right) => left.count - right.count || left.name.localeCompare(right.name))
    .slice(0, 5)
    .map((item, index) => ({
      ...item,
      fill: rentedItemPalette[index % rentedItemPalette.length],
    }));
  const mostClickedItems = inventory
    .filter((item) => matchesSelectedBranch(item.branch, selectedBranch))
    .map((item) => ({
      name: item.name,
      count: item.clickCount || 0,
      inventoryItem: item,
    }))
    .slice()
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 5)
    .map((item, index) => ({
      ...item,
      fill: rentedItemPalette[index % rentedItemPalette.length],
    }));
  const itemsPerCategory = useMemo(() => (
    Object.entries(
      inventory.reduce<Record<string, number>>((counts, item) => {
        if (!matchesSelectedBranch(item.branch, selectedBranch)) {
          return counts;
        }

        const category = String(item.category || '').trim();
        if (!category) {
          return counts;
        }

        counts[category] = (counts[category] || 0) + 1;
        return counts;
      }, {})
    )
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category))
  ), [inventory, selectedBranch]);
  const mostRentedItemsChartData = useMemo(() => ({
    labels: mostRentedItems.map((item) => item.name),
    datasets: [
      {
        label: 'Rentals',
        data: mostRentedItems.map((item) => item.count),
        backgroundColor: mostRentedItems.map((item) => item.fill),
        borderRadius: 10,
        borderSkipped: false as const,
        maxBarThickness: 26,
      },
    ],
  }), [mostRentedItems]);
  const mostRentedItemsChartOptions = useMemo<ChartOptions<'bar'>>(() => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event, elements) => {
      const clickedIndex = elements[0]?.index;
      if (clickedIndex === undefined) return;

      const selectedItem = mostRentedItems[clickedIndex]?.inventoryItem;
      if (selectedItem) {
        setHoverPreviewItem(selectedItem);
      }
    },
    onHover: (event, elements) => {
      const target = event.native?.target;
      if (target instanceof HTMLCanvasElement) {
        target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      }
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        titleColor: '#1A1A1A',
        bodyColor: '#1A1A1A',
        borderColor: '#E8DCC8',
        borderWidth: 1,
        cornerRadius: 16,
        displayColors: false,
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) => `Item: ${items[0]?.label || ''}`,
          label: (context: TooltipItem<'bar'>) => `${Number(context.parsed.x ?? 0).toLocaleString()} rental${Number(context.parsed.x ?? 0) === 1 ? '' : 's'}`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          color: '#E8DCC8',
          borderDash: [4, 4],
        },
        border: {
          display: false,
        },
        ticks: {
          color: '#6B5D4F',
          precision: 0,
          font: {
            size: 12,
          },
        },
      },
      y: {
        grid: {
          display: false,
        },
        border: {
          color: '#E8DCC8',
        },
        ticks: {
          color: '#6B5D4F',
          font: {
            size: 12,
          },
        },
      },
    },
  }), [mostRentedItems]);
  const itemsPerCategoryChartData = useMemo(() => ({
    labels: itemsPerCategory.map((item) => item.category),
    datasets: [
      {
        label: 'Items',
        data: itemsPerCategory.map((item) => item.count),
        backgroundColor: itemsPerCategory.map((_, index) => rentedItemPalette[index % rentedItemPalette.length]),
        borderRadius: 10,
        borderSkipped: false as const,
        maxBarThickness: 56,
      },
    ],
  }), [itemsPerCategory, rentedItemPalette]);
  const itemsPerCategoryChartOptions = useMemo<ChartOptions<'bar'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        titleColor: '#1A1A1A',
        bodyColor: '#1A1A1A',
        borderColor: '#E8DCC8',
        borderWidth: 1,
        cornerRadius: 16,
        displayColors: false,
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) => `Category: ${items[0]?.label || ''}`,
          label: (context: TooltipItem<'bar'>) => `${Number(context.parsed.y ?? 0).toLocaleString()} item${Number(context.parsed.y ?? 0) === 1 ? '' : 's'}`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        border: {
          color: '#E8DCC8',
        },
        ticks: {
          color: '#6B5D4F',
          font: {
            size: 12,
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: '#E8DCC8',
          borderDash: [4, 4],
        },
        border: {
          display: false,
        },
        ticks: {
          color: '#6B5D4F',
          precision: 0,
          font: {
            size: 12,
          },
        },
      },
    },
  }), [itemsPerCategory, rentedItemPalette]);
  const leastRentedItemsChartData = useMemo(() => ({
    labels: leastRentedItems.map((item) => item.name),
    datasets: [
      {
        label: 'Rentals',
        data: leastRentedItems.map((item) => item.count),
        backgroundColor: leastRentedItems.map((item) => item.fill),
        borderRadius: 10,
        borderSkipped: false as const,
        maxBarThickness: 26,
      },
    ],
  }), [leastRentedItems]);
  const leastRentedItemsChartOptions = useMemo<ChartOptions<'bar'>>(() => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event, elements) => {
      const clickedIndex = elements[0]?.index;
      if (clickedIndex === undefined) return;

      const selectedItem = leastRentedItems[clickedIndex]?.inventoryItem;
      if (selectedItem) {
        setHoverPreviewItem(selectedItem);
      }
    },
    onHover: (event, elements) => {
      const target = event.native?.target;
      if (target instanceof HTMLCanvasElement) {
        target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      }
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        titleColor: '#1A1A1A',
        bodyColor: '#1A1A1A',
        borderColor: '#E8DCC8',
        borderWidth: 1,
        cornerRadius: 16,
        displayColors: false,
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) => `Item: ${items[0]?.label || ''}`,
          label: (context: TooltipItem<'bar'>) => `${Number(context.parsed.x ?? 0).toLocaleString()} rental${Number(context.parsed.x ?? 0) === 1 ? '' : 's'}`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 5,
        grid: {
          color: '#E8DCC8',
          borderDash: [4, 4],
        },
        border: {
          display: false,
        },
        ticks: {
          color: '#6B5D4F',
          precision: 0,
          font: {
            size: 12,
          },
        },
      },
      y: {
        grid: {
          display: false,
        },
        border: {
          color: '#E8DCC8',
        },
        ticks: {
          color: '#6B5D4F',
          font: {
            size: 12,
          },
        },
      },
    },
  }), [leastRentedItems]);
  const mostClickedItemsChartData = useMemo(() => ({
    labels: mostClickedItems.map((item) => item.name),
    datasets: [
      {
        label: 'Clicks',
        data: mostClickedItems.map((item) => item.count),
        backgroundColor: mostClickedItems.map((item) => item.fill),
        borderRadius: 10,
        borderSkipped: false as const,
        maxBarThickness: 26,
      },
    ],
  }), [mostClickedItems]);
  const mostClickedItemsChartOptions = useMemo<ChartOptions<'bar'>>(() => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event, elements) => {
      const clickedIndex = elements[0]?.index;
      if (clickedIndex === undefined) return;

      const selectedItem = mostClickedItems[clickedIndex]?.inventoryItem;
      if (selectedItem) {
        setHoverPreviewItem(selectedItem);
      }
    },
    onHover: (event, elements) => {
      const target = event.native?.target;
      if (target instanceof HTMLCanvasElement) {
        target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      }
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        titleColor: '#1A1A1A',
        bodyColor: '#1A1A1A',
        borderColor: '#E8DCC8',
        borderWidth: 1,
        cornerRadius: 16,
        displayColors: false,
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) => `Item: ${items[0]?.label || ''}`,
          label: (context: TooltipItem<'bar'>) => `${Number(context.parsed.x ?? 0).toLocaleString()} click${Number(context.parsed.x ?? 0) === 1 ? '' : 's'}`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          color: '#E8DCC8',
          borderDash: [4, 4],
        },
        border: {
          display: false,
        },
        ticks: {
          color: '#6B5D4F',
          precision: 0,
          font: {
            size: 12,
          },
        },
      },
      y: {
        grid: {
          display: false,
        },
        border: {
          color: '#E8DCC8',
        },
        ticks: {
          color: '#6B5D4F',
          font: {
            size: 12,
          },
        },
      },
    },
  }), [mostClickedItems]);
  const salesThisWeek = adminRentals
    .filter((rental) => completedRentalStatuses.includes(rental.status) && isWithinRange(rental.createdAt, currentWeekStart, now))
    .reduce((sum, rental) => sum + Number(rental.totalPrice || 0), 0);
  const salesLastWeek = adminRentals
    .filter((rental) => completedRentalStatuses.includes(rental.status) && isWithinRange(rental.createdAt, previousWeekStart, currentWeekStart))
    .reduce((sum, rental) => sum + Number(rental.totalPrice || 0), 0);
  const ordersThisWeek = adminRentals.filter((rental) => isWithinRange(rental.createdAt, currentWeekStart, now)).length
    + adminCustomOrders.filter((order) => !order.isArchived && isWithinRange(order.createdAt, currentWeekStart, now)).length;
  const ordersLastWeek = adminRentals.filter((rental) => isWithinRange(rental.createdAt, previousWeekStart, currentWeekStart)).length
    + adminCustomOrders.filter((order) => !order.isArchived && isWithinRange(order.createdAt, previousWeekStart, currentWeekStart)).length;
  const newCustomersThisWeek = users.filter((user) => user.role === 'Customer' && isWithinRange(user.createdAt, currentWeekStart, now)).length;
  const newCustomersLastWeek = users.filter((user) => user.role === 'Customer' && isWithinRange(user.createdAt, previousWeekStart, currentWeekStart)).length;
  const topSellingItemThisWeek = topSellingItemEntry
    ? adminRentals.filter((rental) => {
        const rentalSku = String(rental.sku || '').trim().toLowerCase();
        const rentalName = String(rental.gownName || '').trim().toLowerCase();
        const targetSku = String(topSellingItemEntry.sku || '').trim().toLowerCase();
        const targetName = String(topSellingItemEntry.gownName || '').trim().toLowerCase();
        const matchesItem = targetSku
          ? rentalSku === targetSku
          : rentalName === targetName;

        return completedRentalStatuses.includes(rental.status)
          && matchesItem
          && isWithinRange(rental.createdAt, currentWeekStart, now);
      }).length
    : 0;
  const topSellingItemLastWeek = topSellingItemEntry
    ? adminRentals.filter((rental) => {
        const rentalSku = String(rental.sku || '').trim().toLowerCase();
        const rentalName = String(rental.gownName || '').trim().toLowerCase();
        const targetSku = String(topSellingItemEntry.sku || '').trim().toLowerCase();
        const targetName = String(topSellingItemEntry.gownName || '').trim().toLowerCase();
        const matchesItem = targetSku
          ? rentalSku === targetSku
          : rentalName === targetName;

        return completedRentalStatuses.includes(rental.status)
          && matchesItem
          && isWithinRange(rental.createdAt, previousWeekStart, currentWeekStart);
      }).length
    : 0;
  const salesTrend = buildTrendSummary(salesThisWeek, salesLastWeek);
  const ordersTrend = buildTrendSummary(ordersThisWeek, ordersLastWeek);
  const customersTrend = buildTrendSummary(newCustomersThisWeek, newCustomersLastWeek);
  const topSellingTrend = buildTrendSummary(topSellingItemThisWeek, topSellingItemLastWeek);
  const branchComparisonMetricOptions: Array<{ value: BranchComparisonMetric; label: string }> = [
    { value: 'revenue', label: 'Revenue' },
    { value: 'rents', label: 'Rents' },
    { value: 'appointments', label: 'Appointments' },
    { value: 'bespoke', label: 'Bespoke' },
  ];
  const getBranchComparisonMetricLabel = (metric: BranchComparisonMetric) => (
    branchComparisonMetricOptions.find((option) => option.value === metric)?.label || 'Revenue'
  );
  const getBranchComparisonMetricValue = (
    entry: { revenue: number; rents: number; appointments: number; bespoke: number },
    metric: BranchComparisonMetric,
  ) => {
    if (metric === 'revenue') return entry.revenue;
    if (metric === 'rents') return entry.rents;
    if (metric === 'appointments') return entry.appointments;
    return entry.bespoke;
  };
  const formatBranchComparisonMetricValue = (metric: BranchComparisonMetric, value: number) => (
    metric === 'revenue'
      ? `₱${value.toLocaleString()}`
      : value.toLocaleString()
  );
  const branchComparisonMetricLabel = getBranchComparisonMetricLabel(branchComparisonMetric);
  const branchComparisonDescription = branchComparisonMetric === 'revenue'
    ? 'Completed rental revenue by branch'
    : branchComparisonMetric === 'rents'
      ? 'Rental records by branch'
      : branchComparisonMetric === 'appointments'
        ? 'Appointments by branch'
        : 'Bespoke orders by branch';
  const branchComparisonSummaryLabel = branchComparisonMetric === 'revenue'
    ? 'Compared Revenue'
    : `Compared ${branchComparisonMetricLabel}`;
  const formatBranchComparisonValue = (value: number) => (
    formatBranchComparisonMetricValue(branchComparisonMetric, value)
  );
  const branchComparisonEmptyLabel = branchComparisonMetric === 'revenue'
    ? 'No completed rental revenue is available for comparison yet.'
    : `No ${branchComparisonMetricLabel.toLowerCase()} data is available for comparison yet.`;
  const branchComparisonBranches = (branchStats.length > 0
    ? branchStats.map((branchStat) => branchStat.branch)
    : Array.from(new Set([
        ...adminRentals.map((rental) => rental.branch),
        ...adminAppointments.map((appointment) => appointment.branch),
        ...adminCustomOrders.map((order) => order.branch),
      ].filter((branch): branch is string => Boolean(branch))))
  );
  const branchComparisonData = branchComparisonBranches
    .map((branchName, index) => {
      const normalizedBranch = normalizeBranchName(branchName);
      const revenue = adminRentals
        .filter((rental) => (
          completedRentalStatuses.includes(rental.status)
          && normalizeBranchName(rental.branch) === normalizedBranch
        ))
        .reduce((sum, rental) => sum + Number(rental.totalPrice || 0), 0);
      const rents = adminRentals.filter((rental) => normalizeBranchName(rental.branch) === normalizedBranch).length;
      const appointments = adminAppointments.filter((appointment) => normalizeBranchName(appointment.branch) === normalizedBranch).length;
      const bespoke = adminCustomOrders.filter((order) => normalizeBranchName(order.branch) === normalizedBranch).length;

      return {
        branch: getShortBranchLabel(branchName),
        fullBranch: normalizedBranch || branchName,
        revenue,
        rents,
        appointments,
        bespoke,
        value: getBranchComparisonMetricValue({ revenue, rents, appointments, bespoke }, branchComparisonMetric),
        fill: ['#D4AF37', '#B86A6A', '#6E8B78', '#7A8FB3', '#A27F5D'][index % 5],
      };
    })
    .sort((left, right) => right.value - left.value);
  const storeOverviewExportBranchOptions = branchComparisonData.map((entry) => entry.fullBranch);
  const storeOverviewComparisonData = branchComparisonData.filter((entry) => matchesStoreOverviewExportBranch(entry.fullBranch));
  const totalComparedMetric = branchComparisonData.reduce((sum, branch) => sum + branch.value, 0);
  const buildStoreOverviewComparisonMetricData = (metric: BranchComparisonMetric) => (
    branchComparisonData
      .filter((entry) => matchesStoreOverviewExportBranch(entry.fullBranch))
      .map((entry) => ({
        ...entry,
        value: getBranchComparisonMetricValue(entry, metric),
      }))
      .sort((left, right) => right.value - left.value)
  );
  const revenueComparisonChartData = useMemo(() => ({
    labels: branchComparisonData.map((entry) => entry.branch),
    datasets: [
      {
        label: branchComparisonMetricLabel,
        data: branchComparisonData.map((entry) => entry.value),
        backgroundColor: branchComparisonData.map((entry) => entry.fill),
        borderRadius: 12,
        borderSkipped: false as const,
        maxBarThickness: 56,
      },
    ],
  }), [branchComparisonData, branchComparisonMetricLabel]);
  const revenueComparisonChartOptions = useMemo<ChartOptions<'bar'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        titleColor: '#1A1A1A',
        bodyColor: '#1A1A1A',
        borderColor: '#E8DCC8',
        borderWidth: 1,
        cornerRadius: 16,
        displayColors: false,
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) => `Branch: ${items[0]?.label || ''}`,
          label: (context: TooltipItem<'bar'>) => `${branchComparisonMetricLabel}: ${formatBranchComparisonValue(Number(context.parsed.y ?? 0))}`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        border: {
          color: '#E8DCC8',
        },
        ticks: {
          color: '#6B5D4F',
          font: {
            size: 12,
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: '#E8DCC8',
          borderDash: [4, 4],
        },
        border: {
          display: false,
        },
        ticks: {
          color: '#6B5D4F',
          font: {
            size: 12,
          },
          callback: (value: string | number) => formatBranchComparisonValue(Number(value)),
        },
      },
    },
  }), [branchComparisonMetricLabel, branchComparisonMetric]);

  const handleSaveOverviewKpisAsPdf = async () => {
    if (!canExportPdfs) return;

    const exportItems = getOverviewExportItems(overviewExportBranchFilter, overviewExportTypeFilter);
    const activityRows = exportItems.map((activity) => [
      activity.timeLabel,
      activity.source,
      activity.title,
      activity.customerName,
      activity.detail,
      activity.branch,
    ]);
    const filenameBase = `todays-activities-${new Date().toISOString().slice(0, 10)}`;

    if (overviewExportFormat === 'csv') {
      const csvContent = createCsvContent(
        ['Time', 'Type', 'Activity', 'Customer', 'Reference ID', 'Branch'],
        activityRows,
      );

      saveFile(csvContent, `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
      setShowOverviewExportModal(false);
      return;
    }

    if (overviewExportFormat === 'xls') {
      const xlsContent = createXlsContent(
        ['Time', 'Type', 'Activity', 'Customer', 'Reference ID', 'Branch'],
        activityRows,
      );

      saveFile(xlsContent, `${filenameBase}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
      setShowOverviewExportModal(false);
      return;
    }

    const generatedAt = new Date().toLocaleString();
    const document = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const narrative = await requestAnalyticsNarrative({
      reportType: 'todays-activities',
      reportTitle: "Today's Activity Report",
      generatedAt,
      filters: {
        branchFilter: overviewExportBranchFilter,
        typeFilter: overviewExportTypeLabel,
      },
      totals: {
        scheduledActivities: exportItems.length,
      },
      tables: [createNarrativeTable('Scheduled Activities', ['Time', 'Type', 'Activity', 'Customer', 'Reference ID', 'Branch'], activityRows)],
    });

    document.setFont('times', 'normal');
    document.setFontSize(22);
    document.text("Today's Activity Report", 40, 44);
    document.setFontSize(10);
    document.setTextColor(107, 93, 79);
    document.text(`Generated: ${generatedAt}`, 40, 64);
    document.text(`Branch Filter: ${overviewExportBranchFilter}`, 40, 80);
    document.text(`Type Filter: ${overviewExportTypeLabel}`, 40, 96);
    document.text(`Scheduled Activities: ${exportItems.length}`, 40, 112);

    autoTable(document, {
      startY: 128,
      head: [['Time', 'Type', 'Activity', 'Customer', 'Reference ID', 'Branch']],
      body: activityRows.length > 0
        ? activityRows
        : [['No activities scheduled for today.', '', '', '', '', '']],
      theme: 'grid',
      styles: {
        fontSize: 10,
        cellPadding: 8,
        textColor: [26, 26, 26],
        lineColor: [214, 198, 176],
        lineWidth: 0.45,
      },
      headStyles: {
        fillColor: [250, 247, 240],
        textColor: [107, 93, 79],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [252, 250, 245],
      },
      margin: { left: 40, right: 40, bottom: 40 },
    });

    appendPdfSectionNarrative(document, narrative, 'Scheduled Activities Summary', getLastAutoTableFinalY(document, 128) + 20);
    appendPdfFinalSummaryPage(document, narrative);

    setShowOverviewExportModal(false);
    document.save(`${filenameBase}.pdf`);
  };
  const handleSaveStoreOverviewAsPdf = async () => {
    if (!canExportPdfs || isGeneratingAnalyticsPdf) return;

    setIsGeneratingAnalyticsPdf(true);

    try {

    const renderStoreOverviewChartImage = (metric: BranchComparisonMetric) => {
      const metricData = buildStoreOverviewComparisonMetricData(metric);
      if (metricData.length === 0) {
        return null;
      }

      const metricLabel = getBranchComparisonMetricLabel(metric);
      const domDocument: Document = globalThis.document;
      const canvas = domDocument.createElement('canvas');
      canvas.width = 1400;
      canvas.height = 840;
      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }

      const chart = new ChartJS(context, {
        type: 'bar',
        data: {
          labels: metricData.map((entry) => entry.branch),
          datasets: [
            {
              label: metricLabel,
              data: metricData.map((entry) => entry.value),
              backgroundColor: metricData.map((entry) => entry.fill),
              borderRadius: 16,
              borderSkipped: false,
              maxBarThickness: 72,
            },
          ],
        },
        options: {
          responsive: false,
          animation: false,
          devicePixelRatio: 2,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              enabled: false,
            },
          },
          layout: {
            padding: {
              top: 18,
              right: 20,
              bottom: 8,
              left: 8,
            },
          },
          scales: {
            x: {
              grid: {
                display: false,
              },
              border: {
                color: '#D8C7AE',
              },
              ticks: {
                color: '#6B5D4F',
                font: {
                  size: 22,
                },
              },
            },
            y: {
              beginAtZero: true,
              grid: {
                color: '#D8C7AE',
                lineWidth: 1.5,
              },
              border: {
                display: false,
              },
              ticks: {
                color: '#6B5D4F',
                font: {
                  size: 20,
                },
                callback: (value) => formatBranchComparisonMetricValue(metric, Number(value)),
              },
            },
          },
        },
        plugins: [{
          id: `store-overview-chart-background-${metric}`,
          beforeDraw: (chartInstance) => {
            const { ctx, width, height } = chartInstance;
            ctx.save();
            ctx.fillStyle = '#FCFAF5';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
          },
        }],
      });

      const image = chart.toBase64Image();
      chart.destroy();

      return {
        metric,
        metricLabel,
        narrativeTitle: `${metricLabel} by Branch`,
        image,
      };
    };
    const renderMostRentedItemsChartImage = (
      items: Array<{ name: string; count: number; fill: string }>,
      options?: { metricLabel?: string; xAxisMax?: number }
    ) => {
      if (items.length === 0) {
        return null;
      }

      const domDocument: Document = globalThis.document;
      const canvas = domDocument.createElement('canvas');
      canvas.width = 1400;
      canvas.height = 840;
      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }

      const chart = new ChartJS(context, {
        type: 'bar',
        data: {
          labels: items.map((item) => item.name),
          datasets: [
            {
              label: 'Rentals',
              data: items.map((item) => item.count),
              backgroundColor: items.map((item) => item.fill),
              borderRadius: 12,
              borderSkipped: false,
              maxBarThickness: 44,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: false,
          animation: false,
          devicePixelRatio: 2,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              enabled: false,
            },
          },
          layout: {
            padding: {
              top: 18,
              right: 20,
              bottom: 8,
              left: 8,
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              max: options?.xAxisMax,
              grid: {
                color: '#D8C7AE',
                lineWidth: 1.5,
              },
              border: {
                display: false,
              },
              ticks: {
                color: '#6B5D4F',
                precision: 0,
                font: {
                  size: 20,
                },
              },
            },
            y: {
              grid: {
                display: false,
              },
              border: {
                color: '#D8C7AE',
              },
              ticks: {
                color: '#6B5D4F',
                font: {
                  size: 20,
                },
              },
            },
          },
        },
        plugins: [{
          id: 'store-overview-most-rented-chart-background',
          beforeDraw: (chartInstance) => {
            const { ctx, width, height } = chartInstance;
            ctx.save();
            ctx.fillStyle = '#FCFAF5';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
          },
        }],
      });

      const image = chart.toBase64Image();
      chart.destroy();

      return {
        metric: 'rents' as BranchComparisonMetric,
        metricLabel: options?.metricLabel || 'Most Rented Items',
        narrativeTitle: options?.metricLabel || 'Most Rented Items',
        image,
      };
    };
    const renderMostClickedItemsChartImage = (
      items: Array<{ name: string; count: number; fill: string }>
    ) => {
      if (items.length === 0) {
        return null;
      }

      const domDocument: Document = globalThis.document;
      const canvas = domDocument.createElement('canvas');
      canvas.width = 1400;
      canvas.height = 840;
      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }

      const chart = new ChartJS(context, {
        type: 'bar',
        data: {
          labels: items.map((item) => item.name),
          datasets: [
            {
              label: 'Clicks',
              data: items.map((item) => item.count),
              backgroundColor: items.map((item) => item.fill),
              borderRadius: 12,
              borderSkipped: false,
              maxBarThickness: 44,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: false,
          animation: false,
          devicePixelRatio: 2,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              enabled: false,
            },
          },
          layout: {
            padding: {
              top: 18,
              right: 20,
              bottom: 8,
              left: 8,
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: {
                color: '#D8C7AE',
                lineWidth: 1.5,
              },
              border: {
                display: false,
              },
              ticks: {
                color: '#6B5D4F',
                precision: 0,
                font: {
                  size: 20,
                },
              },
            },
            y: {
              grid: {
                display: false,
              },
              border: {
                color: '#D8C7AE',
              },
              ticks: {
                color: '#6B5D4F',
                font: {
                  size: 20,
                },
              },
            },
          },
        },
        plugins: [{
          id: 'store-overview-most-clicked-chart-background',
          beforeDraw: (chartInstance) => {
            const { ctx, width, height } = chartInstance;
            ctx.save();
            ctx.fillStyle = '#FCFAF5';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
          },
        }],
      });

      const image = chart.toBase64Image();
      chart.destroy();

      return {
        metric: 'rents' as BranchComparisonMetric,
        metricLabel: 'Most Clicked Items',
        narrativeTitle: 'Most Clicked Items',
        image,
      };
    };
    const renderItemsPerCategoryChartImage = (items: Array<{ category: string; count: number; fill: string }>) => {
      if (items.length === 0) {
        return null;
      }

      const domDocument: Document = globalThis.document;
      const canvas = domDocument.createElement('canvas');
      canvas.width = 1400;
      canvas.height = 840;
      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }

      const chart = new ChartJS(context, {
        type: 'bar',
        data: {
          labels: items.map((item) => item.category),
          datasets: [
            {
              label: 'Items',
              data: items.map((item) => item.count),
              backgroundColor: items.map((item) => item.fill),
              borderRadius: 12,
              borderSkipped: false,
              maxBarThickness: 70,
            },
          ],
        },
        options: {
          responsive: false,
          animation: false,
          devicePixelRatio: 2,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              enabled: false,
            },
          },
          layout: {
            padding: {
              top: 18,
              right: 20,
              bottom: 8,
              left: 8,
            },
          },
          scales: {
            x: {
              grid: {
                display: false,
              },
              border: {
                color: '#D8C7AE',
              },
              ticks: {
                color: '#6B5D4F',
                font: {
                  size: 20,
                },
              },
            },
            y: {
              beginAtZero: true,
              grid: {
                color: '#D8C7AE',
                lineWidth: 1.5,
              },
              border: {
                display: false,
              },
              ticks: {
                color: '#6B5D4F',
                precision: 0,
                font: {
                  size: 20,
                },
              },
            },
          },
        },
        plugins: [{
          id: 'store-overview-items-per-category-chart-background',
          beforeDraw: (chartInstance) => {
            const { ctx, width, height } = chartInstance;
            ctx.save();
            ctx.fillStyle = '#FCFAF5';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
          },
        }],
      });

      const image = chart.toBase64Image();
      chart.destroy();

      return {
        metric: 'rents' as BranchComparisonMetric,
        metricLabel: 'Items per Category',
        narrativeTitle: 'Items per Category',
        image,
      };
    };

    const generatedAt = new Date().toLocaleString();
    const pdfDocument = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const completedRentalsForExport = adminRentals.filter((rental) => (
      completedRentalStatuses.includes(rental.status)
      && matchesStoreOverviewExportBranch(rental.branch)
    ));
    const activeCustomOrdersForExport = adminCustomOrders.filter((order) => (
      !order.isArchived
      && matchesStoreOverviewExportBranch(order.branch)
    ));
    const newCustomersForExport = users.filter((user) => {
      if (user.role !== 'Customer' || !user.createdAt) {
        return false;
      }

      const createdAt = new Date(user.createdAt);
      if (Number.isNaN(createdAt.getTime()) || createdAt < recentCustomerThreshold) {
        return false;
      }

      return matchesStoreOverviewExportBranch(user.branch);
    }).length;
    const totalSalesForExport = completedRentalsForExport.reduce((sum, rental) => sum + Number(rental.totalPrice || 0), 0);
    const numberOfOrdersForExport = completedRentalsForExport.length + activeCustomOrdersForExport.length;
    const topSellingEntryForExport = Object.values(
      completedRentalsForExport.reduce<Record<string, { sku: string; gownName: string; count: number }>>((counts, rental) => {
        const sku = String(rental.sku || '').trim();
        const gownName = String(rental.gownName || '').trim();
        const key = sku || gownName.toLowerCase();
        if (!key) {
          return counts;
        }

        const existing = counts[key];
        if (existing) {
          existing.count += 1;
          return counts;
        }

        counts[key] = {
          sku,
          gownName,
          count: 1,
        };
        return counts;
      }, {})
    ).sort((left, right) => right.count - left.count)[0] ?? null;
    const topSellingNameForExport = topSellingEntryForExport?.gownName || 'No sales yet';
    const topSellingCountForExport = topSellingEntryForExport?.count ?? 0;
    const mostRentedItemsForExport = Object.values(
      completedRentalsForExport.reduce<Record<string, { sku: string; gownName: string; count: number }>>((counts, rental) => {
        const sku = String(rental.sku || '').trim();
        const gownName = String(rental.gownName || '').trim();
        const key = sku || gownName.toLowerCase();
        if (!key) {
          return counts;
        }

        const existing = counts[key];
        if (existing) {
          existing.count += 1;
          return counts;
        }

        counts[key] = {
          sku,
          gownName,
          count: 1,
        };
        return counts;
      }, {})
    )
      .map((entry, index) => {
        const inventoryMatch = inventoryItemsForLookup.find((item) => {
          const itemSku = String(item.sku || '').trim().toLowerCase();
          const itemName = String(item.name || '').trim().toLowerCase();
          const targetSku = String(entry.sku || '').trim().toLowerCase();
          const targetName = String(entry.gownName || '').trim().toLowerCase();

          return targetSku
            ? itemSku === targetSku
            : itemName === targetName;
        });

        return {
          name: inventoryMatch?.name || entry.gownName,
          count: entry.count,
          fill: ['#D4AF37', '#B86A6A', '#6E8B78', '#7A8FB3', '#A27F5D'][index % 5],
        };
      })
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);
    const leastRentedItemsForExport = Object.values(
      completedRentalsForExport.reduce<Record<string, { sku: string; gownName: string; count: number }>>((counts, rental) => {
        const sku = String(rental.sku || '').trim();
        const gownName = String(rental.gownName || '').trim();
        const key = sku || gownName.toLowerCase();
        if (!key) {
          return counts;
        }

        const existing = counts[key];
        if (existing) {
          existing.count += 1;
          return counts;
        }

        counts[key] = {
          sku,
          gownName,
          count: 1,
        };
        return counts;
      }, {})
    )
      .map((entry, index) => {
        const inventoryMatch = inventoryItemsForLookup.find((item) => {
          const itemSku = String(item.sku || '').trim().toLowerCase();
          const itemName = String(item.name || '').trim().toLowerCase();
          const targetSku = String(entry.sku || '').trim().toLowerCase();
          const targetName = String(entry.gownName || '').trim().toLowerCase();

          return targetSku
            ? itemSku === targetSku
            : itemName === targetName;
        });

        return {
          name: inventoryMatch?.name || entry.gownName,
          count: entry.count,
          fill: ['#D4AF37', '#B86A6A', '#6E8B78', '#7A8FB3', '#A27F5D'][index % 5],
        };
      })
      .sort((left, right) => left.count - right.count || left.name.localeCompare(right.name))
      .slice(0, 5);
    const mostClickedItemsForExport = inventory
      .filter((item) => matchesStoreOverviewExportBranch(item.branch))
      .map((item, index) => ({
        name: item.name,
        count: item.clickCount || 0,
        fill: ['#D4AF37', '#B86A6A', '#6E8B78', '#7A8FB3', '#A27F5D'][index % 5],
      }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
      .slice(0, 5);
    const itemsPerCategoryForExport = inventory
      .filter((item) => matchesStoreOverviewExportBranch(item.branch))
      .reduce<Record<string, number>>((counts, item) => {
        const category = String(item.category || '').trim();
        if (!category) {
          return counts;
        }

        counts[category] = (counts[category] || 0) + 1;
        return counts;
      }, {});
    const itemsPerCategoryChartItemsForExport = Object.entries(itemsPerCategoryForExport)
      .map(([category, count], index) => ({
        category,
        count,
        fill: ['#D4AF37', '#B86A6A', '#6E8B78', '#7A8FB3', '#A27F5D'][index % 5],
      }))
      .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
    const pesoCanvas = globalThis.document.createElement('canvas');
    pesoCanvas.width = 32;
    pesoCanvas.height = 32;
    const pesoContext = pesoCanvas.getContext('2d');
    if (pesoContext) {
      pesoContext.clearRect(0, 0, pesoCanvas.width, pesoCanvas.height);
      pesoContext.fillStyle = '#1A1A1A';
      pesoContext.font = '22px Arial';
      pesoContext.textAlign = 'center';
      pesoContext.textBaseline = 'middle';
      pesoContext.fillText('₱', 16, 17);
    }
    const pesoSymbolImage = pesoCanvas.toDataURL('image/png');
    const summaryRows = [
      ['Total Sales', `PHP ${totalSalesForExport.toLocaleString()}`],
      ['Number of Orders', numberOfOrdersForExport.toLocaleString()],
      ['New Customers', newCustomersForExport.toLocaleString()],
      ['Top Selling Item', `${topSellingNameForExport}${topSellingCountForExport > 0 ? ` (${topSellingCountForExport} rental${topSellingCountForExport === 1 ? '' : 's'})` : ''}`],
    ];
    const comparisonRows = storeOverviewComparisonData.map((entry) => [
      entry.fullBranch,
      `PHP ${entry.revenue.toLocaleString()}`,
      entry.rents.toLocaleString(),
      entry.appointments.toLocaleString(),
      entry.bespoke.toLocaleString(),
    ]);
    const tabularRows = [
      ...summaryRows.map(([label, value]) => ['Summary Metrics', label, value, '', '', '']),
      ...comparisonRows.map(([branch, revenue, rents, appointments, bespoke]) => ['Branch Comparison', branch, revenue, rents, appointments, bespoke]),
      ...itemsPerCategoryChartItemsForExport.map((entry) => ['Items per Category', entry.category, entry.count.toLocaleString(), '', '', '']),
      ...mostRentedItemsForExport.map((entry) => ['Most Rented Items', entry.name, entry.count.toLocaleString(), '', '', '']),
      ...leastRentedItemsForExport.map((entry) => ['Least Rented Items', entry.name, entry.count.toLocaleString(), '', '', '']),
      ...mostClickedItemsForExport.map((entry) => ['Most Clicked Items', entry.name, entry.count.toLocaleString(), '', '', '']),
    ];
    const filenameBase = `store-overview-${new Date().toISOString().slice(0, 10)}`;

    if (storeOverviewExportFormat === 'csv') {
      const csvContent = createCsvContent(
        ['Section', 'Label', 'Value', 'Value 2', 'Value 3', 'Value 4'],
        tabularRows,
      );

      saveFile(csvContent, `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
      setShowStoreOverviewExportModal(false);
      return;
    }

    if (storeOverviewExportFormat === 'xls') {
      const xlsContent = createXlsContent(
        ['Section', 'Label', 'Value', 'Value 2', 'Value 3', 'Value 4'],
        tabularRows,
      );

      saveFile(xlsContent, `${filenameBase}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
      setShowStoreOverviewExportModal(false);
      return;
    }
    const reportPayload: AnalyticsNarrativePayload = {
      reportType: 'store-overview',
      reportTitle: 'Store Overview Report',
      generatedAt,
      filters: {
        branchFilter: storeOverviewBranchFilterLabel,
        comparisonMetric: branchComparisonMetricLabel,
      },
      totals: {
        totalSales: totalSalesForExport,
        numberOfOrders: numberOfOrdersForExport,
        newCustomers: newCustomersForExport,
        topSellingItem: topSellingNameForExport,
        topSellingCount: topSellingCountForExport,
      },
      tables: [
        createNarrativeTable('Summary Metrics', ['Metric', 'Value'], summaryRows),
        createNarrativeTable('Branch Comparison', ['Branch', 'Revenue', 'Rents', 'Appointments', 'Bespoke'], comparisonRows),
      ],
      charts: [
        createNarrativeChart('Revenue by Branch', storeOverviewComparisonData.map((entry) => ({ label: entry.fullBranch, value: entry.revenue }))),
        createNarrativeChart('Rents by Branch', storeOverviewComparisonData.map((entry) => ({ label: entry.fullBranch, value: entry.rents }))),
        createNarrativeChart('Appointments by Branch', storeOverviewComparisonData.map((entry) => ({ label: entry.fullBranch, value: entry.appointments }))),
        createNarrativeChart('Bespoke by Branch', storeOverviewComparisonData.map((entry) => ({ label: entry.fullBranch, value: entry.bespoke }))),
        createNarrativeChart('Items per Category', itemsPerCategoryChartItemsForExport.map((entry) => ({ label: entry.category, value: entry.count }))),
        createNarrativeChart('Most Rented Items', mostRentedItemsForExport.map((entry) => ({ label: entry.name, value: entry.count }))),
        createNarrativeChart('Least Rented Items', leastRentedItemsForExport.map((entry) => ({ label: entry.name, value: entry.count }))),
        createNarrativeChart('Most Clicked Items', mostClickedItemsForExport.map((entry) => ({ label: entry.name, value: entry.count }))),
      ],
    };
    const narrative = await requestAnalyticsNarrative(reportPayload);
    const summaryMetricsNarrative = await requestSectionNarrative({
      ...reportPayload,
      charts: undefined,
      tables: reportPayload.tables?.[0] ? [reportPayload.tables[0]] : undefined,
    }, 'Summary Metrics', 'table');
    const branchComparisonNarrative = await requestSectionNarrative({
      ...reportPayload,
      charts: undefined,
      tables: reportPayload.tables?.[1] ? [reportPayload.tables[1]] : undefined,
    }, 'Branch Comparison', 'table');
    const chartNarratives: Array<AnalyticsNarrative | null> = [];
    for (const chart of reportPayload.charts ?? []) {
      const chartNarrative = await requestSectionNarrative({
        ...reportPayload,
        tables: undefined,
        charts: [chart],
      }, chart.title, 'chart');
      chartNarratives.push(chartNarrative);
    }
    const chartNarrativeMap = new Map((reportPayload.charts ?? []).map((chart, index) => [chart.title, chartNarratives[index] ?? null]));

    const chartImages = branchComparisonMetricOptions
      .map((option) => renderStoreOverviewChartImage(option.value))
      .filter((chart): chart is NonNullable<typeof chart> => Boolean(chart));
    const itemsPerCategoryChartImage = renderItemsPerCategoryChartImage(itemsPerCategoryChartItemsForExport);
    if (itemsPerCategoryChartImage) {
      chartImages.push(itemsPerCategoryChartImage);
    }
    const mostRentedChartImage = renderMostRentedItemsChartImage(mostRentedItemsForExport);
    if (mostRentedChartImage) {
      chartImages.push(mostRentedChartImage);
    }
    const leastRentedChartImage = renderMostRentedItemsChartImage(leastRentedItemsForExport, {
      metricLabel: 'Least Rented Items',
      xAxisMax: 5,
    });
    if (leastRentedChartImage) {
      chartImages.push(leastRentedChartImage);
    }
    const mostClickedChartImage = renderMostClickedItemsChartImage(mostClickedItemsForExport);
    if (mostClickedChartImage) {
      chartImages.push(mostClickedChartImage);
    }

    pdfDocument.setFont('times', 'normal');
    pdfDocument.setFontSize(22);
    pdfDocument.text('Store Overview Report', 40, 44);
    pdfDocument.setFontSize(10);
    pdfDocument.setTextColor(107, 93, 79);
    pdfDocument.text(`Generated: ${generatedAt}`, 40, 64);
    pdfDocument.text(`Branch Filter: ${storeOverviewBranchFilterLabel}`, 40, 80);
    pdfDocument.text(`Comparison Metric: ${branchComparisonMetricLabel}`, 40, 96);

    autoTable(pdfDocument, {
      startY: 120,
      head: [['Metric', 'Value']],
      body: summaryRows,
      theme: 'grid',
      styles: {
        fontSize: 10,
        cellPadding: 8,
        textColor: [26, 26, 26],
        lineColor: [214, 198, 176],
        lineWidth: 0.45,
      },
      headStyles: {
        fillColor: [250, 247, 240],
        textColor: [107, 93, 79],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [252, 250, 245],
      },
      margin: { left: 40, right: 40, bottom: 40 },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        if (data.column.index !== 1) return;
        const rowValues = Array.isArray(data.row.raw) ? data.row.raw : [];
        if (String(rowValues[0] || '') !== 'Total Sales') return;

        data.cell.styles.cellPadding = { top: 8, right: 8, bottom: 8, left: 22 };
      },
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        if (data.column.index !== 1) return;
        const rowValues = Array.isArray(data.row.raw) ? data.row.raw : [];
        if (String(rowValues[0] || '') !== 'Total Sales') return;

        pdfDocument.addImage(pesoSymbolImage, 'PNG', data.cell.x + 8, data.cell.y + 9, 8, 8);
      },
    });

    const summaryNarrativeEndY = appendPdfSectionNarrative(
      pdfDocument,
      summaryMetricsNarrative,
      'Summary Metrics Summary',
      getLastAutoTableFinalY(pdfDocument, 120) + 20,
    );
    autoTable(pdfDocument, {
      startY: summaryNarrativeEndY + 12,
      head: [['Branch', 'Revenue', 'Rents', 'Appointments', 'Bespoke']],
      body: comparisonRows.length > 0
        ? comparisonRows
        : [['No branch data available for the selected filter.', '', '', '', '']],
      theme: 'grid',
      styles: {
        fontSize: 10,
        cellPadding: 8,
        textColor: [26, 26, 26],
        lineColor: [214, 198, 176],
        lineWidth: 0.45,
      },
      headStyles: {
        fillColor: [250, 247, 240],
        textColor: [107, 93, 79],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [252, 250, 245],
      },
      margin: { left: 40, right: 40, bottom: 40 },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        if (data.column.index !== 1) return;
        if (comparisonRows.length === 0) return;

        data.cell.styles.cellPadding = { top: 8, right: 8, bottom: 8, left: 22 };
      },
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        if (data.column.index !== 1) return;
        if (comparisonRows.length === 0) return;

        pdfDocument.addImage(pesoSymbolImage, 'PNG', data.cell.x + 8, data.cell.y + 9, 8, 8);
      },
    });

    appendPdfSectionNarrative(
      pdfDocument,
      branchComparisonNarrative,
      'Branch Comparison Summary',
      getLastAutoTableFinalY(pdfDocument, summaryNarrativeEndY + 12) + 20,
    );

    const chartSectionTops = [40, 360];
    const chartImageWidth = 515;
    const chartImageHeight = 138;

    let lastChartNarrativeEndY: number | undefined;
    chartImages.forEach((chart, index) => {
      if (index % 2 === 0) {
        pdfDocument.addPage();
      }

      const sectionTop = chartSectionTops[index % 2];

      pdfDocument.setFont('times', 'normal');
      pdfDocument.setFontSize(16);
      pdfDocument.setTextColor(26, 26, 26);
      pdfDocument.text(`${chart.metricLabel} Comparison Chart`, 40, sectionTop);
      pdfDocument.setFontSize(10);
      pdfDocument.setTextColor(107, 93, 79);
      pdfDocument.text(`Branch Filter: ${storeOverviewBranchFilterLabel}`, 40, sectionTop + 18);
      pdfDocument.addImage(chart.image, 'PNG', 40, sectionTop + 26, chartImageWidth, chartImageHeight);
      lastChartNarrativeEndY = appendPdfSectionNarrative(
        pdfDocument,
        chartNarrativeMap.get(chart.narrativeTitle) ?? null,
        `${chart.metricLabel} Summary`,
        sectionTop + 182,
      );
    });

    appendPdfFinalSummaryPage(pdfDocument, narrative, lastChartNarrativeEndY ? lastChartNarrativeEndY + 24 : undefined);

    setShowStoreOverviewExportModal(false);
    pdfDocument.save(`${filenameBase}.pdf`);
    } finally {
      setIsGeneratingAnalyticsPdf(false);
    }
  };

  // Inventory CRUD Functions
  const handleAddItem = async () => {
    if (isCurrentUserStaff) {
      setInventoryError('Staff accounts cannot add gowns.');
      return;
    }

    if (!validateAddItem()) {
      setInventoryError('Please fill in all required fields');
      return;
    }
    setInventoryError(null);
    try {
      const existingItem = inventory.find((item) => (
        String(item.status || '').trim().toLowerCase() !== 'archived'
        && String(item.name || '').trim().toLowerCase() === String(newItem.name || '').trim().toLowerCase()
      ));

      const result = await inventoryAPI.createProduct(token, {
        name: newItem.name!,
        category: newItem.category!,
        color: newItem.color!,
        size: newItem.size || [],
        price: newItem.price!,
        branch: newItem.branch!,
        status: normalizeInventoryManagementStatus(newItem.status),
        lastRented: newItem.lastRented ?? null,
        description: newItem.description || '',
        image: getItemImageList(newItem)[0] || '',
        images: getItemImageList(newItem),
        model3dUrl: getModel3DUrl(newItem),
        stock: Math.min(MAX_INVENTORY_STOCK, Number(newItem.stock ?? 1))
      });
      setInventory(prev => prev.some((item) => item.id === result.item.id)
        ? prev.map((item) => item.id === result.item.id ? result.item : item)
        : [result.item, ...prev]);
      setShowAddItem(false);
      setAddItemErrors({});
      setIsCustomCategoryInputVisible(false);
      setCustomCategoryDraft('');
      setIsConfirmCustomCategoryOpen(false);
      setNewItem({ name: '', category: DEFAULT_INVENTORY_CATEGORY, color: '', size: [], price: 0, branch: 'Taguig Main', status: 'available', description: '', image: '', images: [], model3dUrl: '', stock: 1 });
      resetImageModal();
      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
      if (result.mergedExisting || existingItem) {
        showTempMessage(result.message || `Added ${newItem.stock ?? 1} to existing item stock.`);
      } else {
        showTempMessage('Gown added successfully!');
      }
    } catch (err) {
      setInventoryError(err instanceof Error ? err.message : 'Failed to add gown');
    }
  };

  const handleUpdateItem = async () => {
    if (isCurrentUserStaff) {
      setInventoryError('Staff accounts cannot edit gowns.');
      return;
    }

    if (!editingItem?.id) return;
    setInventoryError(null);
    if (Number(editingItem.stock ?? 1) > MAX_INVENTORY_STOCK) {
      setInventoryError(`Stock cannot exceed ${MAX_INVENTORY_STOCK}.`);
      return;
    }
    try {
      const updated = await inventoryAPI.updateProduct(token, editingItem.id, {
        name: editingItem.name,
        category: editingItem.category,
        color: editingItem.color,
        size: editingItem.size,
        price: editingItem.price,
        branch: editingItem.branch,
        status: normalizeInventoryManagementStatus(editingItem.status),
        lastRented: editingItem.lastRented ?? null,
        description: editingItem.description || '',
        image: getItemImageList(editingItem)[0] || '',
        images: getItemImageList(editingItem),
        model3dUrl: getModel3DUrl(editingItem),
        stock: Math.min(MAX_INVENTORY_STOCK, Number(editingItem.stock ?? 1))
      });
      setInventory(prev => prev.map(item => item.id === editingItem.id ? updated : item));
      setEditingItem(null);
      setIsCustomCategoryInputVisible(false);
      setCustomCategoryDraft('');
      setIsConfirmCustomCategoryOpen(false);
      resetImageModal();
      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
      showTempMessage('Gown updated successfully!');
    } catch (err) {
      setInventoryError(err instanceof Error ? err.message : 'Failed to update gown');
    }
  };

  const openAddStockModal = (item: InventoryItem) => {
    setInventoryError(null);
    setStockModalItem(item);
    setStockQuantityToAdd('1');
  };

  const closeAddStockModal = () => {
    if (incrementingItemId) {
      return;
    }

    setIsAddStockConfirmOpen(false);
    setStockModalItem(null);
    setStockQuantityToAdd('1');
  };

  const getAddStockModalValidationMessage = () => {
    if (!stockModalItem) {
      return '';
    }

    if (stockQuantityToAdd.trim() === '') {
      return 'Enter a quantity to add.';
    }

    const quantityToAdd = Number(stockQuantityToAdd);
    if (!Number.isInteger(quantityToAdd) || quantityToAdd < 1) {
      return 'Enter a valid stock quantity to add.';
    }

    const currentStock = Math.max(0, Number(stockModalItem.stock ?? 1));
    if (currentStock + quantityToAdd > MAX_INVENTORY_STOCK) {
      return `Total stock cannot exceed ${MAX_INVENTORY_STOCK}.`;
    }

    return '';
  };

  const handleRequestIncreaseItemStock = () => {
    if (isCurrentUserStaff) {
      setInventoryError('Staff accounts cannot update gown quantity.');
      return;
    }

    if (!stockModalItem) {
      return;
    }

    const modalValidationMessage = getAddStockModalValidationMessage();
    if (modalValidationMessage) {
      setInventoryError(modalValidationMessage);
      return;
    }

    setInventoryError(null);
    setIsAddStockConfirmOpen(true);
  };

  const handleIncreaseItemStock = async () => {
    if (!stockModalItem) {
      return;
    }

    const quantityToAdd = Number(stockQuantityToAdd);

    setIncrementingItemId(stockModalItem.id);
    setInventoryError(null);

    try {
      const updated = await inventoryAPI.updateProduct(token, stockModalItem.id, {
        stock: Math.max(1, Number(stockModalItem.stock ?? 1) + quantityToAdd),
      });

      setInventory((prev) => prev.map((entry) => (entry.id === stockModalItem.id ? updated : entry)));
      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
      showTempMessage(`Added ${quantityToAdd} stock to ${stockModalItem.name}.`);
      setIsAddStockConfirmOpen(false);
      setStockModalItem(null);
      setStockQuantityToAdd('1');
    } catch (err) {
      setIsAddStockConfirmOpen(false);
      setInventoryError(err instanceof Error ? err.message : 'Failed to update gown quantity');
    } finally {
      setIncrementingItemId(null);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (isCurrentUserStaff) {
      setInventoryError('Staff accounts cannot archive gowns.');
      return;
    }

    const target = inventory.find(item => item.id === id);
    if (!target) return;
    setConfirmAction({ type: 'delete', item: target });
  };

  const handleConfirmDelete = async (item: InventoryItem) => {
    if (isCurrentUserStaff) {
      setInventoryError('Staff accounts cannot archive gowns.');
      setConfirmAction(null);
      return;
    }

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
    const normalizedStatus = normalizeManagedUserStatus(user.status);
    const matchesArchiveView = showArchivedUsersOnly
      ? normalizedStatus === 'archived'
      : normalizedStatus !== 'archived';
    const matchesBranch = matchesSelectedBranch(user.preferredBranch || user.branch, selectedBranch);
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

  const getUserExportItems = (filter: UserExportFilter) => {
    const getExportMatches = (includeSearchQuery: boolean) => users.filter((user) => {
      const fullName = `${user.firstName} ${user.lastName}`.trim().toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !includeSearchQuery ||
        fullName.includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.phone.toLowerCase().includes(query);

      const matchesExportFilter =
        filter === 'all' ||
        (filter === 'admin' && user.role === 'Admin') ||
        (filter === 'staff' && user.role === 'Staff') ||
        (filter === 'customer' && user.role === 'Customer');
      const normalizedStatus = normalizeManagedUserStatus(user.status);
      const matchesArchiveView = showArchivedUsersOnly
        ? normalizedStatus === 'archived'
        : normalizedStatus !== 'archived';
      const matchesBranch = matchesSelectedBranch(user.branch, selectedBranch);

      return matchesSearch && matchesExportFilter && matchesArchiveView && matchesBranch;
    });

    const exportMatches = getExportMatches(true);

    if (showArchivedUsersOnly && exportMatches.length === 0) {
      return getExportMatches(false);
    }

    return exportMatches;
  };

  const getUserExportLabel = (filter: UserExportFilter) => {
    if (filter === 'all') return 'All Account Types';
    if (filter === 'admin') return 'Admin Accounts';
    if (filter === 'staff') return 'Staff Accounts';
    return 'Customer Accounts';
  };

  const userExportOptions: Array<{ value: UserExportFilter; label: string; count: number }> = [
    { value: 'all', label: 'All Account Types', count: getUserExportItems('all').length },
    { value: 'admin', label: 'Admin Accounts', count: getUserExportItems('admin').length },
    { value: 'staff', label: 'Staff Accounts', count: getUserExportItems('staff').length },
    { value: 'customer', label: 'Customer Accounts', count: getUserExportItems('customer').length },
  ];

  const canOpenUserExportModal = showArchivedUsersOnly
    ? users.some((user) => {
        const normalizedStatus = normalizeManagedUserStatus(user.status);
        return normalizedStatus === 'archived' && matchesSelectedBranch(user.branch, selectedBranch);
      })
    : userExportOptions.some((option) => option.count > 0);

  const openUserExportModal = () => {
    if (!canExportPdfs) return;

    setUserExportFilter(showArchivedUsersOnly ? 'all' : userFilter);
    setUserExportFormat('pdf');
    setShowUserExportModal(true);
  };

  const handleSaveUsersAsPdf = async (filter: UserExportFilter) => {
    if (!canExportPdfs) return;

    const exportItems = getUserExportItems(filter);
    const exportTitle = showArchivedUsersOnly ? 'Archived Users Report' : 'User Management Report';
    const filterLabel = getUserExportLabel(filter);
    const generatedAt = new Date().toLocaleString();
    const rows = exportItems.map((user) => [
      `${user.firstName} ${user.lastName}`.trim() || 'Unnamed User',
      user.email || 'No email',
      user.phone || 'No phone',
      user.branch || 'Not assigned',
      user.role,
      user.joinDate || 'Unknown',
      user.status === 'active' ? 'Active' : 'Archived',
    ]);
    const filenameBase = `${showArchivedUsersOnly ? 'archived-users' : `users-${filter}`}-report-${new Date().toISOString().slice(0, 10)}`;

    if (userExportFormat === 'csv') {
      const csvContent = createCsvContent(
        ['Name', 'Email', 'Phone', 'Branch', 'Role', 'Joined', 'Status'],
        rows,
      );

      saveFile(csvContent, `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
      setShowUserExportModal(false);
      return;
    }

    if (userExportFormat === 'xls') {
      const xlsContent = createXlsContent(
        ['Name', 'Email', 'Phone', 'Branch', 'Role', 'Joined', 'Status'],
        rows,
      );

      saveFile(xlsContent, `${filenameBase}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
      setShowUserExportModal(false);
      return;
    }

    const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const narrative = await requestAnalyticsNarrative({
      reportType: 'users',
      reportTitle: exportTitle,
      generatedAt,
      filters: {
        accountType: filterLabel,
      },
      totals: {
        totalUsers: exportItems.length,
      },
      tables: [createNarrativeTable('Users', ['Name', 'Email', 'Phone', 'Branch', 'Role', 'Joined', 'Status'], rows)],
    });

    document.setFont('times', 'normal');
    document.setFontSize(22);
    document.text(exportTitle, 40, 44);
    document.setFontSize(10);
    document.setTextColor(107, 93, 79);
    document.text(`Generated: ${generatedAt}`, 40, 64);
    document.text(`Account type: ${filterLabel}`, 40, 80);
    document.text(`Total users: ${exportItems.length}`, 40, 96);

    autoTable(document, {
      startY: 112,
      head: [['Name', 'Email', 'Phone', 'Branch', 'Role', 'Joined', 'Status']],
      body: rows.length > 0 ? rows : [['-', 'No users available for export.', '', '', '', '', '']],
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 8,
        textColor: [26, 26, 26],
        lineColor: [214, 198, 176],
        lineWidth: 0.45,
      },
      headStyles: {
        fillColor: [250, 247, 240],
        textColor: [107, 93, 79],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [252, 250, 245],
      },
      margin: { left: 40, right: 40, bottom: 40 },
    });

    appendPdfSectionNarrative(document, narrative, 'Users Summary', getLastAutoTableFinalY(document, 112) + 20);
    appendPdfFinalSummaryPage(document, narrative);

    document.save(`${filenameBase}.pdf`);
    setShowUserExportModal(false);
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
  const inventoryExportSourceItems = inventoryView === 'archive'
    ? (filteredArchivedItems.length > 0 ? filteredArchivedItems : archivedItems)
    : inventoryItemsForCurrentView;
  const inventoryExportItems = inventoryExportSourceItems.filter((item) => matchesInventoryExportBranch(item.branch));
  const inventoryTotalPages = Math.max(1, Math.ceil(inventoryItemsForCurrentView.length / INVENTORY_PAGE_SIZE));
  const safeInventoryPage = Math.min(inventoryPage, inventoryTotalPages);
  const paginatedInventoryItems = inventoryItemsForCurrentView.slice(
    (safeInventoryPage - 1) * INVENTORY_PAGE_SIZE,
    safeInventoryPage * INVENTORY_PAGE_SIZE,
  );
  const inventoryCurrentPageCount = paginatedInventoryItems.length;

  const handleSaveInventoryAsPdf = async () => {
    if (!canExportPdfs) return;

    const exportTitle = inventoryView === 'archive' ? 'Archived Inventory Report' : 'Inventory Report';
    const statusHeader = inventoryView === 'archive' ? 'Deleted' : 'Status';
    const generatedAt = new Date().toLocaleString();
    const filenameBase = `${inventoryView === 'archive' ? 'archived' : 'inventory'}-report-${new Date().toISOString().slice(0, 10)}`;
    const rows = inventoryExportItems.map((item) => {
      const statusValue = inventoryView === 'archive'
        ? (item.deletedAt ? new Date(item.deletedAt).toLocaleString() : 'Unknown')
        : item.status.charAt(0).toUpperCase() + item.status.slice(1);

      return [
        String(item.sku ?? item.id),
        item.name,
        item.category,
        item.color,
        `PHP ${Number(item.price || 0).toLocaleString()}`,
        item.branch,
        statusValue,
      ];
    });

    if (inventoryExportFormat === 'csv') {
      const csvContent = createCsvContent(
        ['ID', 'Name', 'Category', 'Color', 'Price', 'Branch', statusHeader],
        rows,
      );

      saveFile(csvContent, `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
      setShowInventoryExportModal(false);
      return;
    }

    if (inventoryExportFormat === 'xls') {
      const xlsContent = createXlsContent(
        ['ID', 'Name', 'Category', 'Color', 'Price', 'Branch', statusHeader],
        rows,
      );

      saveFile(xlsContent, `${filenameBase}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
      setShowInventoryExportModal(false);
      return;
    }

    const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const narrative = await requestAnalyticsNarrative({
      reportType: inventoryView === 'archive' ? 'inventory-archive' : 'inventory',
      reportTitle: exportTitle,
      generatedAt,
      filters: {
        branchFilter: inventoryExportBranchLabel,
      },
      totals: {
        totalGowns: inventoryExportItems.length,
      },
      tables: [createNarrativeTable('Inventory', ['ID', 'Name', 'Category', 'Color', 'Price', 'Branch', statusHeader], rows)],
    });

    document.setFont('times', 'normal');
    document.setFontSize(22);
    document.text(exportTitle, 40, 44);
    document.setFontSize(10);
    document.setTextColor(107, 93, 79);
    document.text(`Generated: ${generatedAt}`, 40, 64);
    document.text(`Branch Filter: ${inventoryExportBranchLabel}`, 40, 80);
    document.text(`Total gowns: ${inventoryExportItems.length}`, 40, 96);

    autoTable(document, {
      startY: 112,
      head: [['ID', 'Name', 'Category', 'Color', 'Price', 'Branch', statusHeader]],
      body: rows.length > 0 ? rows : [['-', 'No gowns available for export.', '', '', '', '', '']],
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 8,
        textColor: [26, 26, 26],
        lineColor: [214, 198, 176],
        lineWidth: 0.45,
      },
      headStyles: {
        fillColor: [250, 247, 240],
        textColor: [107, 93, 79],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [252, 250, 245],
      },
      margin: { left: 40, right: 40, bottom: 40 },
    });

    appendPdfSectionNarrative(document, narrative, 'Inventory Summary', getLastAutoTableFinalY(document, 112) + 20);
    appendPdfFinalSummaryPage(document, narrative);

    setShowInventoryExportModal(false);
    document.save(`${filenameBase}.pdf`);
  };

  const changeInventoryPage = (nextPage: number) => {
    setInventoryPage(nextPage);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allActiveStatusRentals = adminRentals.filter(
    (rental) =>
      rental.status === 'pending' ||
      rental.status === 'for_payment' ||
      rental.status === 'paid_for_confirmation' ||
      rental.status === 'for_pickup' ||
      rental.status === 'active'
  );

  const currentRentalCards: AdminRentalCard[] = adminRentals
    .filter((rental) => rental.status === 'active' || rental.status === 'pending')
    .map((rental) => ({
      id: rental.id,
      referenceId: rental.referenceId,
      gownName: rental.gownName,
      sku: rental.sku,
      customerName: rental.customerName,
      startDate: rental.startDate,
      endDate: rental.endDate,
      status: rental.status,
      totalPrice: rental.totalPrice,
      branch: rental.branch,
      pickupScheduleDate: rental.pickupScheduleDate,
      pickupScheduleTime: rental.pickupScheduleTime,
    }));

  const pendingRentalCards = currentRentalCards.filter((rental) => rental.status === 'pending');
  const activeRentalCards = currentRentalCards.filter((rental) => rental.status === 'active');
  const displayedActiveRentalCards = activeRentalCards.filter((rental) => {
    const due = new Date(rental.endDate);
    due.setHours(0, 0, 0, 0);
    if (Number.isNaN(due.getTime())) {
      return true;
    }

    return today <= due;
  });
  const archivedRentalCards: AdminRentalCard[] = adminRentals
    .filter((rental) => rental.status === 'completed' || rental.status === 'cancelled' || rental.status === 'item_lost')
    .sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    })
    .map((rental) => ({
      id: rental.id,
      referenceId: rental.referenceId,
      gownName: rental.gownName,
      sku: rental.sku,
      customerName: rental.customerName,
      startDate: rental.startDate,
      endDate: rental.endDate,
      status: rental.status,
      totalPrice: rental.totalPrice,
      branch: rental.branch,
      rejectionReason: rental.rejectionReason,
      pickupScheduleDate: rental.pickupScheduleDate,
      pickupScheduleTime: rental.pickupScheduleTime,
    }));
  const forPaymentRentals = adminRentals.filter(
    (rental) => rental.status === 'for_payment' || rental.status === 'paid_for_confirmation'
  );
  const forPickupRentals = adminRentals.filter((rental) => rental.status === 'for_pickup');

  const isPickupScheduled = (rental: Pick<AdminRentalDetail, 'pickupScheduleDate' | 'pickupScheduleTime'>) =>
    Boolean(rental.pickupScheduleDate && rental.pickupScheduleTime);

  const getRentalStatusLabel = (rental: Pick<AdminRentalDetail, 'status' | 'pickupScheduleDate' | 'pickupScheduleTime'>) => {
    if (rental.status === 'paid_for_confirmation') return 'Paid - For Confirmation';
    if (rental.status === 'for_pickup') {
      return isPickupScheduled(rental) ? 'Pickup is Scheduled' : 'Schedule Pickup';
    }

    if (rental.status === 'item_lost') {
      return 'Item Lost';
    }

    const status = rental.status;
    return status
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const getAdminRentalStatusBadgeStyle = (status?: string | null) => {
    switch (String(status || '').trim().toLowerCase()) {
      case 'active':
        return { backgroundColor: '#DCFCE7', color: '#166534' };
      case 'pending':
        return { backgroundColor: '#FEF3C7', color: '#92400E' };
      case 'for_payment':
        return { backgroundColor: '#FFE4E6', color: '#9F1239' };
      case 'paid_for_confirmation':
        return { backgroundColor: '#EDE9FE', color: '#6D28D9' };
      case 'for_pickup':
        return { backgroundColor: '#CFFAFE', color: '#155E75' };
      case 'cancelled':
        return { backgroundColor: '#FEE2E2', color: '#991B1B' };
      case 'item_lost':
        return { backgroundColor: '#FEE2E2', color: '#B91C1C' };
      case 'completed':
        return { backgroundColor: '#D1FAE5', color: '#065F46' };
      default:
        return { backgroundColor: '#F5EFE6', color: '#6B5D4F' };
    }
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
  const filteredActiveRentalCards = displayedActiveRentalCards.filter((rental) => matchesSelectedBranch(rental.branch, selectedBranch) && matchesRentalSearch(rental));
  const filteredForPaymentRentals = forPaymentRentals.filter((rental) => matchesSelectedBranch(rental.branch, selectedBranch) && matchesRentalSearch(rental));
  const filteredForPickupRentals = forPickupRentals.filter((rental) => matchesSelectedBranch(rental.branch, selectedBranch) && matchesRentalSearch(rental));
  const filteredAllActiveStatusRentals = allActiveStatusRentals.filter((rental) => matchesSelectedBranch(rental.branch, selectedBranch) && matchesRentalSearch(rental));
  const filteredArchivedRentalCards = archivedRentalCards.filter((rental) => matchesSelectedBranch(rental.branch, selectedBranch) && matchesRentalSearch(rental));

  const pendingReturns: PendingReturn[] = activeRentalCards
    .filter((rental) => {
      const due = new Date(rental.endDate);
      due.setHours(0, 0, 0, 0);
      if (Number.isNaN(due.getTime())) return false;

      const threeDaysBeforeDue = new Date(due);
      threeDaysBeforeDue.setDate(threeDaysBeforeDue.getDate() - 3);

      return today >= threeDaysBeforeDue;
    })
    .map((rental) => {
      const due = new Date(rental.endDate);
      due.setHours(0, 0, 0, 0);
      const daysLate = Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        id: rental.id,
        gownName: rental.gownName,
        sku: rental.sku,
        customer: rental.customerName,
        dueDate: rental.endDate,
        daysLate,
      };
    });

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
    : rentalViewFilter === 'all'
      ? filteredAllActiveStatusRentals
      : rentalViewFilter === 'pending'
      ? filteredPendingRentalCards
      : rentalViewFilter === 'active'
        ? filteredActiveRentalCards
        : rentalViewFilter === 'for-payment'
          ? filteredForPaymentRentals
          : rentalViewFilter === 'for-pickup'
            ? filteredForPickupRentals
            : filteredPendingReturns;

  const getRentalExportItems = (filters: RentalExportSelectableFilter[], branchFilter: string) => {
    const hasFilter = (filter: RentalExportSelectableFilter) => filters.includes(filter);
    const branchMatches = (branch: string | null | undefined) => matchesSelectedBranch(branch, branchFilter);

    const items: Array<AdminRentalCard | PendingReturn> = [];

    if (hasFilter('archive')) {
      items.push(...archivedRentalCards.filter((rental) => branchMatches(rental.branch) && matchesRentalSearch(rental)));
    }

    if (hasFilter('pending')) {
      items.push(...pendingRentalCards.filter((rental) => branchMatches(rental.branch) && matchesRentalSearch(rental)));
    }

    if (hasFilter('active')) {
      items.push(...displayedActiveRentalCards.filter((rental) => branchMatches(rental.branch) && matchesRentalSearch(rental)));
    }

    if (hasFilter('for-payment')) {
      items.push(...forPaymentRentals.filter((rental) => branchMatches(rental.branch) && matchesRentalSearch(rental)));
    }

    if (hasFilter('for-pickup')) {
      items.push(...forPickupRentals.filter((rental) => branchMatches(rental.branch) && matchesRentalSearch(rental)));
    }

    if (hasFilter('returns')) {
      items.push(...pendingReturns.filter((rental) => {
        const rentalBranch = activeRentalCards.find((activeRental) => activeRental.id === rental.id)?.branch;
        if (!branchMatches(rentalBranch)) return false;
        if (!rentalQuery) return true;
        return [rental.id, rental.gownName, rental.customer, rental.dueDate]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(rentalQuery));
      }));
    }

    const deduped = new Map<string, AdminRentalCard | PendingReturn>();
    items.forEach((item) => {
      const key = `customerName` in item ? `rental-${item.id}` : `return-${item.id}`;
      deduped.set(key, item);
    });

    return Array.from(deduped.values());
  };

  const getRentalExportLabel = (filters: RentalExportSelectableFilter[]) => {
    if (filters.length === 0 || filters.length === RENTAL_EXPORT_FILTER_OPTIONS.length) {
      return 'All Rental Statuses';
    }

    return filters
      .map((filter) => {
        if (filter === 'archive') return 'Archived Rentals';
        if (filter === 'pending') return 'Pending Rentals';
        if (filter === 'active') return 'Active Rentals';
        if (filter === 'for-payment') return 'For Payment';
        if (filter === 'for-pickup') return 'For Pickup';
        return 'Pending Returns';
      })
      .join(', ');
  };

  const rentalExportBranchOptions = ['All Branches', 'Taguig Main', 'BGC Branch', 'Makati Branch', 'Quezon City'];
  const rentalExportOptions: Array<{ value: RentalExportSelectableFilter; label: string; count: number }> = [
    { value: 'archive', label: 'Archived Rentals', count: getRentalExportItems(['archive'], selectedRentalExportBranch).length },
    { value: 'pending', label: 'Pending Rentals', count: getRentalExportItems(['pending'], selectedRentalExportBranch).length },
    { value: 'active', label: 'Active Rentals', count: getRentalExportItems(['active'], selectedRentalExportBranch).length },
    { value: 'for-payment', label: 'For Payment', count: getRentalExportItems(['for-payment'], selectedRentalExportBranch).length },
    { value: 'for-pickup', label: 'For Pickup', count: getRentalExportItems(['for-pickup'], selectedRentalExportBranch).length },
    { value: 'returns', label: 'Pending Returns', count: getRentalExportItems(['returns'], selectedRentalExportBranch).length },
  ];

  const canOpenRentalExportModal = rentalExportOptions.some((option) => option.count > 0);

  const openRentalExportModal = () => {
    if (!canExportPdfs) return;

    setSelectedRentalExportBranch(selectedBranch);
    setSelectedRentalExportFilters(
      rentalManagementView === 'archive'
        ? ['archive']
        : rentalViewFilter === 'all'
          ? ['pending', 'active', 'for-payment', 'for-pickup', 'returns']
          : [rentalViewFilter]
    );
    setRentalExportFormat('pdf');
    setShowRentalExportModal(true);
  };

  const rentalTotalPages = Math.max(1, Math.ceil(rentalItemsForCurrentView.length / RENTAL_PAGE_SIZE));
  const safeRentalPage = Math.min(rentalPage, rentalTotalPages);
  const handleSaveRentalsAsPdf = async (filters: RentalExportSelectableFilter[], branchFilter: string) => {
    if (!canExportPdfs) return;

    const exportItems = getRentalExportItems(filters, branchFilter);
    const exportTitle = filters.length === 1 && filters[0] === 'archive' ? 'Archived Rental Report' : 'Rental Management Report';
    const filterLabel = getRentalExportLabel(filters);
    const generatedAt = new Date().toLocaleString();
    const rows = exportItems.map((rental) => {
      const isPendingReturn = 'customer' in rental && !('customerName' in rental);
      if (isPendingReturn) {
        const branch = activeRentalCards.find((activeRental) => activeRental.id === rental.id)?.branch ?? 'Not specified';

        return [
          rental.id,
          rental.gownName,
          rental.customer,
          branch,
          rental.dueDate || 'Not scheduled',
          rental.dueDate || 'Not scheduled',
          rental.daysLate > 0 ? `${rental.daysLate} day${rental.daysLate === 1 ? '' : 's'} late` : 'Pending Return',
          `PHP ${Number(rental.daysLate * RENTAL_LATE_FEE_PER_DAY || 0).toLocaleString()}`,
        ];
      }

      const statusValue = filters.length === 1 && filters[0] === 'archive'
        ? (rental.status === 'paid_for_confirmation'
            ? 'Paid - For Confirmation'
            : rental.status
                .split('_')
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' '))
        : getRentalStatusLabel(rental)

      return [
        rental.referenceId || rental.id,
        rental.gownName,
        rental.customerName,
        rental.branch,
        rental.startDate || rental.endDate || 'Not scheduled',
        rental.endDate || 'Not scheduled',
        statusValue,
        `PHP ${Number(rental.totalPrice || 0).toLocaleString()}`,
      ];
    });
    const filenameBase = `${filters.length === 1 && filters[0] === 'archive' ? 'archived-rentals' : 'rentals-export'}-${new Date().toISOString().slice(0, 10)}`;

    if (rentalExportFormat === 'csv') {
      const csvContent = createCsvContent(
        ['Reference', 'Gown', 'Customer', 'Branch', 'Start / Due', 'End Date', 'Status', 'Amount'],
        rows,
      );

      saveFile(csvContent, `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
      setShowRentalExportModal(false);
      return;
    }

    if (rentalExportFormat === 'xls') {
      const xlsContent = createXlsContent(
        ['Reference', 'Gown', 'Customer', 'Branch', 'Start / Due', 'End Date', 'Status', 'Amount'],
        rows,
      );

      saveFile(xlsContent, `${filenameBase}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
      setShowRentalExportModal(false);
      return;
    }

    const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const narrative = await requestAnalyticsNarrative({
      reportType: filters.length === 1 && filters[0] === 'archive' ? 'rentals-archive' : 'rentals',
      reportTitle: exportTitle,
      generatedAt,
      filters: {
        view: filterLabel,
        branch: branchFilter,
      },
      totals: {
        totalRecords: exportItems.length,
      },
      tables: [createNarrativeTable('Rentals', ['Reference', 'Gown', 'Customer', 'Branch', 'Start / Due', 'End Date', 'Status', 'Amount'], rows)],
    });

    document.setFont('times', 'normal');
    document.setFontSize(22);
    document.text(exportTitle, 40, 44);
    document.setFontSize(10);
    document.setTextColor(107, 93, 79);
    document.text(`Generated: ${generatedAt}`, 40, 64);
    document.text(`View: ${filterLabel}`, 40, 80);
    document.text(`Branch: ${branchFilter}`, 40, 96);
    document.text(`Total records: ${exportItems.length}`, 40, 112);

    autoTable(document, {
      startY: 128,
      head: [['Reference', 'Gown', 'Customer', 'Branch', 'Start / Due', 'End Date', 'Status', 'Amount']],
      body: rows.length > 0 ? rows : [['-', 'No rental records available for export.', '', '', '', '', '', '']],
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 8,
        textColor: [26, 26, 26],
        lineColor: [214, 198, 176],
        lineWidth: 0.45,
      },
      headStyles: {
        fillColor: [250, 247, 240],
        textColor: [107, 93, 79],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [252, 250, 245],
      },
      margin: { left: 40, right: 40, bottom: 40 },
    });

    appendPdfSectionNarrative(document, narrative, 'Rentals Summary', getLastAutoTableFinalY(document, 128) + 20);
    appendPdfFinalSummaryPage(document, narrative);

    document.save(`${filenameBase}.pdf`);
    setShowRentalExportModal(false);
  };
  const paginatedPendingRentalCards = filteredPendingRentalCards.slice(
    (safeRentalPage - 1) * RENTAL_PAGE_SIZE,
    safeRentalPage * RENTAL_PAGE_SIZE,
  );
  const paginatedAllActiveStatusRentals = filteredAllActiveStatusRentals.slice(
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
      status: rental.status === 'active' 
        ? 'active' 
        : rental.status === 'pending' 
          ? 'pending' 
          : rental.status === 'item_lost'
            ? 'item_lost'
            : rental.status === 'for_pickup' || rental.status === 'paid_for_confirmation'
              ? 'for-pickup'
              : 'for-payment',
    };
  };

  const openRentalFollowUp = (target: RentalFollowUpTarget) => {
    setSelectedRental(target);
    setShowNotificationModal(true);
  };

  const appointmentQuery = appointmentSearchQuery.trim().toLowerCase();
  const matchesAppointmentSearchTerm = (appointment: AdminAppointmentDetail) => {
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
  const matchesAppointmentSearch = (appointment: AdminAppointmentDetail) => {
    if (!matchesSelectedBranch(appointment.branch, selectedBranch)) return false;
    return matchesAppointmentSearchTerm(appointment);
  };

  const pendingAppointments = adminAppointments.filter((appointment) => appointment.status === 'pending');
  const scheduledAppointments = adminAppointments.filter((appointment) => appointment.status === 'scheduled');
  const allActiveAppointments = adminAppointments.filter(
    (appointment) => appointment.status === 'pending' || appointment.status === 'scheduled'
  );
  const archivedAppointments = adminAppointments.filter(
    (appointment) => appointment.status === 'completed' || appointment.status === 'cancelled'
  );
  const filteredAllAppointments = allActiveAppointments.filter(matchesAppointmentSearch);
  const filteredPendingAppointments = pendingAppointments.filter(matchesAppointmentSearch);
  const filteredScheduledAppointments = scheduledAppointments.filter(matchesAppointmentSearch);
  const filteredArchivedAppointments = archivedAppointments.filter(matchesAppointmentSearch);
  const appointmentItemsForCurrentView = appointmentManagementView === 'archive'
    ? filteredArchivedAppointments
    : appointmentStatusFilter === 'all'
      ? filteredAllAppointments
      : appointmentStatusFilter === 'pending'
      ? filteredPendingAppointments
      : filteredScheduledAppointments;

  const appointmentExportBranchOptions = [
    'All Branches',
    ...Array.from(
      new Set(
        adminAppointments
          .map((appointment) => appointment.branch)
          .filter((branch): branch is string => Boolean(branch))
      )
    ).sort((left, right) => left.localeCompare(right)),
  ];

  const getAppointmentExportItems = (filters: AppointmentExportSelectableFilter[], branchFilter: string) => {
    const branchMatches = (branch: string | null | undefined) => matchesSelectedBranch(branch, branchFilter);
    const items: AdminAppointmentDetail[] = [];

    if (filters.includes('archive')) {
      items.push(...archivedAppointments.filter((appointment) => branchMatches(appointment.branch) && matchesAppointmentSearchTerm(appointment)));
    }

    if (filters.includes('pending')) {
      items.push(...pendingAppointments.filter((appointment) => branchMatches(appointment.branch) && matchesAppointmentSearchTerm(appointment)));
    }

    if (filters.includes('scheduled')) {
      items.push(...scheduledAppointments.filter((appointment) => branchMatches(appointment.branch) && matchesAppointmentSearchTerm(appointment)));
    }

    const deduped = new Map<string, AdminAppointmentDetail>();
    items.forEach((appointment) => {
      deduped.set(String(appointment.id), appointment);
    });

    return Array.from(deduped.values());
  };

  const getAppointmentExportLabel = (filters: AppointmentExportSelectableFilter[]) => {
    if (filters.length === 0 || filters.length === APPOINTMENT_EXPORT_FILTER_OPTIONS.length) {
      return 'All Appointment Statuses';
    }

    return filters.map((filter) => {
      if (filter === 'archive') return 'Archived Appointments';
      if (filter === 'pending') return 'Pending Appointments';
      return 'Scheduled Appointments';
    }).join(', ');
  };

  const appointmentExportOptions: Array<{ value: AppointmentExportSelectableFilter; label: string; count: number }> = [
    { value: 'archive', label: 'Archived Appointments', count: getAppointmentExportItems(['archive'], selectedAppointmentExportBranch).length },
    { value: 'pending', label: 'Pending Appointments', count: getAppointmentExportItems(['pending'], selectedAppointmentExportBranch).length },
    { value: 'scheduled', label: 'Scheduled Appointments', count: getAppointmentExportItems(['scheduled'], selectedAppointmentExportBranch).length },
  ];

  const canOpenAppointmentExportModal = appointmentExportOptions.some((option) => option.count > 0);

  const openAppointmentExportModal = () => {
    if (!canExportPdfs) return;

    setSelectedAppointmentExportBranch(selectedBranch);
    setSelectedAppointmentExportFilters(
      appointmentManagementView === 'archive'
        ? ['archive']
        : appointmentStatusFilter === 'all'
          ? ['pending', 'scheduled']
          : [appointmentStatusFilter]
    );
    setAppointmentExportFormat('pdf');
    setShowAppointmentExportModal(true);
  };

  const handleSaveAppointmentsAsPdf = async (filters: AppointmentExportSelectableFilter[], branchFilter: string) => {
    if (!canExportPdfs) return;

    const exportItems = getAppointmentExportItems(filters, branchFilter);
    const exportTitle = filters.length === 1 && filters[0] === 'archive' ? 'Archived Appointment Report' : 'Appointment Management Report';
    const filterLabel = getAppointmentExportLabel(filters);
    const generatedAt = new Date().toLocaleString();
    const rows = exportItems.map((appointment) => [
      appointment.referenceId || appointment.id,
      appointment.customerName,
      appointment.customerEmail,
      appointment.contactNumber,
      getAppointmentTypeLabel(appointment.type),
      appointment.branch,
      appointment.date,
      appointment.time,
      appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1),
      appointment.selectedGownName || 'Not specified',
    ]);
    const filenameBase = `${filters.length === 1 && filters[0] === 'archive' ? 'archived-appointments' : 'appointments-export'}-${new Date().toISOString().slice(0, 10)}`;

    if (appointmentExportFormat === 'csv') {
      const csvContent = createCsvContent(
        ['ID', 'Customer', 'Email', 'Contact', 'Type', 'Branch', 'Date', 'Time', 'Status', 'Selected Gown'],
        rows,
      );

      saveFile(csvContent, `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
      setShowAppointmentExportModal(false);
      return;
    }

    if (appointmentExportFormat === 'xls') {
      const xlsContent = createXlsContent(
        ['ID', 'Customer', 'Email', 'Contact', 'Type', 'Branch', 'Date', 'Time', 'Status', 'Selected Gown'],
        rows,
      );

      saveFile(xlsContent, `${filenameBase}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
      setShowAppointmentExportModal(false);
      return;
    }

    const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const narrative = await requestAnalyticsNarrative({
      reportType: filters.length === 1 && filters[0] === 'archive' ? 'appointments-archive' : 'appointments',
      reportTitle: exportTitle,
      generatedAt,
      filters: {
        view: filterLabel,
        branch: branchFilter,
      },
      totals: {
        totalRecords: exportItems.length,
      },
      tables: [createNarrativeTable('Appointments', ['ID', 'Customer', 'Email', 'Contact', 'Type', 'Branch', 'Date', 'Time', 'Status', 'Selected Gown'], rows)],
    });

    document.setFont('times', 'normal');
    document.setFontSize(22);
    document.text(exportTitle, 40, 44);
    document.setFontSize(10);
    document.setTextColor(107, 93, 79);
    document.text(`Generated: ${generatedAt}`, 40, 64);
    document.text(`View: ${filterLabel}`, 40, 80);
    document.text(`Branch: ${branchFilter}`, 40, 96);
    document.text(`Total records: ${exportItems.length}`, 40, 112);

    autoTable(document, {
      startY: 128,
      head: [['ID', 'Customer', 'Email', 'Contact', 'Type', 'Branch', 'Date', 'Time', 'Status', 'Selected Gown']],
      body: rows.length > 0 ? rows : [['-', 'No appointment records available for export.', '', '', '', '', '', '', '', '']],
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 7,
        textColor: [26, 26, 26],
        lineColor: [214, 198, 176],
        lineWidth: 0.45,
      },
      headStyles: {
        fillColor: [250, 247, 240],
        textColor: [107, 93, 79],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [252, 250, 245],
      },
      margin: { left: 40, right: 40, bottom: 40 },
    });

    appendPdfSectionNarrative(document, narrative, 'Appointments Summary', getLastAutoTableFinalY(document, 128) + 20);
    appendPdfFinalSummaryPage(document, narrative);

    document.save(`${filenameBase}.pdf`);
    setShowAppointmentExportModal(false);
  };

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
      : !isArchivedOrder && order.status !== 'rejected' && (
        customOrderStatusFilter === 'all' || order.status === customOrderStatusFilter
      );
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

  const getRentalStatusBadgeClass = (status: AdminRentalDetail['status']) => {
    if (status === 'pending') return 'bg-amber-100 text-amber-800';
    if (status === 'for_payment') return 'bg-rose-100 text-rose-800';
    if (status === 'paid_for_confirmation') return 'bg-violet-100 text-violet-800';
    if (status === 'for_pickup') return 'bg-cyan-100 text-cyan-800';
    if (status === 'active') return 'bg-amber-100 text-amber-800';
    if (status === 'completed') return 'bg-green-100 text-green-800';
    if (status === 'cancelled' || status === 'item_lost') return 'bg-red-100 text-red-800';
    return 'bg-[#EDE1CE] text-[#5B4A36]';
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

  const customOrderMatchesSearchTerm = (order: AdminCustomOrderRecord) => {
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
  };

  const customOrderExportBranchOptions = [
    'All Branches',
    ...Array.from(
      new Set(
        adminCustomOrders
          .map((order) => order.branch)
          .filter((branch): branch is string => Boolean(branch))
      )
    ).sort((left, right) => left.localeCompare(right)),
  ];

  const getCustomOrderExportItems = (filters: CustomOrderExportSelectableFilter[], branchFilter: string) => {
    const branchMatches = (branch: string | null | undefined) => matchesSelectedBranch(branch, branchFilter);
    const items: AdminCustomOrderRecord[] = [];

    if (filters.includes('archive')) {
      items.push(...adminCustomOrders.filter((order) => {
        const isArchivedOrder = Boolean(order.isArchived);
        return branchMatches(order.branch)
          && (isArchivedOrder || order.status === 'rejected')
          && customOrderMatchesSearchTerm(order);
      }));
    }

    CUSTOM_ORDER_FILTER_TABS.forEach((status) => {
      if (!filters.includes(status)) return;

      items.push(...adminCustomOrders.filter((order) => {
        const isArchivedOrder = Boolean(order.isArchived);
        return branchMatches(order.branch)
          && !isArchivedOrder
          && order.status !== 'rejected'
          && order.status === status
          && customOrderMatchesSearchTerm(order);
      }));
    });

    const deduped = new Map<string, AdminCustomOrderRecord>();
    items.forEach((order) => {
      deduped.set(String(order.id || order._id || order.referenceId), order);
    });

    return Array.from(deduped.values());
  };

  const getCustomOrderExportLabel = (filters: CustomOrderExportSelectableFilter[]) => {
    if (filters.length === 0 || filters.length === CUSTOM_ORDER_EXPORT_FILTER_OPTIONS.length) {
      return 'All Bespoke Statuses';
    }

    return filters.map((filter) => {
      if (filter === 'archive') return 'Archived Custom Orders';
      return filter === 'fitting' ? 'Fitting Appointment' : getCustomOrderStatusLabel(filter);
    }).join(', ');
  };

  const customOrderExportOptions: Array<{ value: CustomOrderExportSelectableFilter; label: string; count: number }> = [
    { value: 'archive', label: 'Archived Custom Orders', count: getCustomOrderExportItems(['archive'], selectedCustomOrderExportBranch).length },
    ...CUSTOM_ORDER_FILTER_TABS.map((status) => ({
      value: status as CustomOrderExportSelectableFilter,
      label: status === 'fitting' ? 'Fitting Appointment' : getCustomOrderStatusLabel(status),
      count: getCustomOrderExportItems([status], selectedCustomOrderExportBranch).length,
    })),
  ];

  const canOpenCustomOrderExportModal = customOrderExportOptions.some((option) => option.count > 0);

  const openCustomOrderExportModal = () => {
    if (!canExportPdfs) return;

    setSelectedCustomOrderExportBranch(selectedBranch);
    setSelectedCustomOrderExportFilters(
      customOrderManagementView === 'archive'
        ? ['archive']
        : customOrderStatusFilter === 'all'
          ? [...CUSTOM_ORDER_FILTER_TABS]
          : [customOrderStatusFilter]
    );
    setCustomOrderExportFormat('pdf');
    setShowCustomOrderExportModal(true);
  };

  const handleSaveCustomOrdersAsPdf = async (filters: CustomOrderExportSelectableFilter[], branchFilter: string) => {
    if (!canExportPdfs) return;

    const exportItems = getCustomOrderExportItems(filters, branchFilter);
    const exportTitle = filters.length === 1 && filters[0] === 'archive' ? 'Archived Custom Order Report' : 'Bespoke Management Report';
    const filterLabel = getCustomOrderExportLabel(filters);
    const generatedAt = new Date().toLocaleString();
    const rows = exportItems.map((order) => [
      order.referenceId || order.id || order._id || 'N/A',
      order.customerName || 'Unknown Customer',
      order.email || 'No email',
      order.contactNumber || 'No phone',
      order.orderType || 'Custom Order',
      getCustomOrderStatusLabel(order.status),
      order.branch || 'No branch',
      order.eventDate || 'Not set',
      formatCustomOrderBudget(order.budget),
    ]);
    const filenameBase = `${filters.length === 1 && filters[0] === 'archive' ? 'archived-custom-orders' : 'custom-orders-export'}-${new Date().toISOString().slice(0, 10)}`;

    if (customOrderExportFormat === 'csv') {
      const csvContent = createCsvContent(
        ['Reference ID', 'Customer', 'Email', 'Contact', 'Order Type', 'Status', 'Branch', 'Event Date', 'Budget'],
        rows,
      );

      saveFile(csvContent, `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
      setShowCustomOrderExportModal(false);
      return;
    }

    if (customOrderExportFormat === 'xls') {
      const xlsContent = createXlsContent(
        ['Reference ID', 'Customer', 'Email', 'Contact', 'Order Type', 'Status', 'Branch', 'Event Date', 'Budget'],
        rows,
      );

      saveFile(xlsContent, `${filenameBase}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
      setShowCustomOrderExportModal(false);
      return;
    }

    const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const narrative = await requestAnalyticsNarrative({
      reportType: filters.length === 1 && filters[0] === 'archive' ? 'custom-orders-archive' : 'custom-orders',
      reportTitle: exportTitle,
      generatedAt,
      filters: {
        view: filterLabel,
        branch: branchFilter,
      },
      totals: {
        totalRecords: exportItems.length,
      },
      tables: [createNarrativeTable('Custom Orders', ['Reference ID', 'Customer', 'Email', 'Contact', 'Order Type', 'Status', 'Branch', 'Event Date', 'Budget'], rows)],
    });

    document.setFont('times', 'normal');
    document.setFontSize(22);
    document.text(exportTitle, 40, 44);
    document.setFontSize(10);
    document.setTextColor(107, 93, 79);
    document.text(`Generated: ${generatedAt}`, 40, 64);
    document.text(`View: ${filterLabel}`, 40, 80);
    document.text(`Branch: ${branchFilter}`, 40, 96);
    document.text(`Total records: ${exportItems.length}`, 40, 112);

    autoTable(document, {
      startY: 128,
      head: [['Reference ID', 'Customer', 'Email', 'Contact', 'Order Type', 'Status', 'Branch', 'Event Date', 'Budget']],
      body: rows.length > 0 ? rows : [['-', 'No custom order records available for export.', '', '', '', '', '', '', '']],
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 7,
        textColor: [26, 26, 26],
        lineColor: [214, 198, 176],
        lineWidth: 0.45,
      },
      headStyles: {
        fillColor: [250, 247, 240],
        textColor: [107, 93, 79],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [252, 250, 245],
      },
      margin: { left: 40, right: 40, bottom: 40 },
    });

    appendPdfSectionNarrative(document, narrative, 'Custom Orders Summary', getLastAutoTableFinalY(document, 128) + 20);
    appendPdfFinalSummaryPage(document, narrative);

    document.save(`${filenameBase}.pdf`);
    setShowCustomOrderExportModal(false);
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

  const canAdjustCustomOrder = (order: AdminCustomOrderRecord | null) => {
    if (!order || order.status !== 'fitting') {
      return false;
    }

    const fittingDate = String(order.fittingDate || '').trim();
    if (!fittingDate) {
      return false;
    }

    const today = new Date().toISOString().slice(0, 10);
    return fittingDate === today;
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
        : selectedRental.status === 'item_lost'
          ? `Dear ${selectedRental.customer}, we are contacting you regarding the rental of '${selectedRental.gownName}' which has been marked as lost/unreturned. Please contact Hannah Vanessa Boutique immediately to settle the replacement fees. Thank you.`
      : `Dear ${selectedRental.customer}, this is a friendly reminder that your rented gown '${selectedRental.gownName}' is due for return on ${selectedRental.dueDate}. ${selectedRental.daysLate > 0 ? `You currently have a late fee of ₱${(selectedRental.daysLate * RENTAL_LATE_FEE_PER_DAY).toLocaleString()}. ` : ''}Please return it to Hannah Vanessa Boutique at your earliest convenience. Thank you!`
    : '';

  // Notification Handler
  const handleSendNotification = () => {
    if (!selectedRental) return;

    setNotificationError(null);
    setShowNotificationModal(false);
    setIsSendReminderConfirmOpen(true);
  };

  const handleConfirmSendNotification = async () => {
    if (!selectedRental) return;

    setNotificationSending(true);
    setNotificationError(null);

    try {
      await notificationAPI.sendNotification(token, {
        type: 'rental',
        recordId: selectedRental.id,
        messageBody: reminderMessage,
        deliveryMethod: notificationMethod,
      });

      setIsSendReminderConfirmOpen(false);
      setShowNotificationModal(false);
      setIsReminderSentSuccessOpen(true);
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Failed to send notification.');
      setIsSendReminderConfirmOpen(false);
      setShowNotificationModal(true);
    } finally {
      setNotificationSending(false);
    }
  };

  const handleDismissReminderSentSuccess = () => {
    setIsReminderSentSuccessOpen(false);
    setSelectedRental(null);
    setNotificationMethod('both');
    setNotificationError(null);
  };

  return (
    <div className="min-h-screen py-8 px-4 bg-[#FAF7F0]">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-light mb-2">{dashboardTitle}</h1>
            <p className="text-[#6B5D4F]">
              {assignedStaffBranch
                ? `Manage your boutique operations for ${assignedStaffBranch}`
                : 'Manage your boutique operations across all branches'}
            </p>
          </div>
          {onRequestLogout && (
            <button
              type="button"
              onClick={onRequestLogout}
              className="shrink-0 px-6 py-3 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors"
            >
              Logout
            </button>
          )}
        </div>

        {/* Branch Selector */}
        <div className="mb-6">
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            disabled={Boolean(assignedStaffBranch)}
            className="px-6 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors bg-white disabled:bg-[#F4EEE4] disabled:text-[#6B5D4F] disabled:cursor-not-allowed"
          >
            {!assignedStaffBranch && <option value="All Branches">All Branches</option>}
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
          {canViewUsers && (
            <button
              onClick={() => setActiveTabWithHash('users')}
              className={`px-6 py-3 border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-[#D4AF37] font-medium'
                  : 'border-transparent text-[#6B5D4F] hover:text-black'
              }`}
            >
              Users
            </button>
          )}
          {canViewAdminHistory && (
            <button
              onClick={() => setActiveTabWithHash('history')}
              className={`px-6 py-3 border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-[#D4AF37] font-medium'
                  : 'border-transparent text-[#6B5D4F] hover:text-black'
              }`}
            >
              Activity Logs
            </button>
          )}
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-light">Scheduled Activities</h2>
              {!isCurrentUserStaff && (
                <div className="flex items-center gap-3">
                  {canExportPdfs && (
                    <button
                      type="button"
                      onClick={openOverviewExportModal}
                      className="p-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center justify-center"
                      aria-label="Download overview KPIs as PDF"
                      title="Download overview KPIs as PDF"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRefreshOverview}
                    disabled={dashboardRefreshScope === 'overview'}
                    className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className={`w-5 h-5 ${dashboardRefreshScope === 'overview' ? 'animate-spin' : ''}`} />
                    {dashboardRefreshScope === 'overview' ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:w-full">
                <div className="sm:flex-1 sm:pr-6">
                  <h3 className="text-2xl font-light text-[#1A1A1A]">Today's Activity</h3>
                  <p className="text-sm text-[#6B5D4F] mt-1">
                    Scheduled rentals, appointments, and custom order sessions for {selectedBranch}.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#FAF7F0] px-4 py-2 text-sm text-[#6B5D4F] border border-[#E8DCC8] sm:ml-auto sm:self-start">
                  <Calendar className="w-4 h-4 text-[#D4AF37]" />
                  {todaysActivity.length} scheduled
                </div>
              </div>

              <div className="mt-6">
                {todaysActivity.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#E8DCC8] bg-[#FCFAF5] px-6 py-10 text-center">
                    <p className="text-base text-[#3D2B1F]">No scheduled activity for today.</p>
                    <p className="mt-2 text-sm text-[#8A7763]">New rentals, appointments, and bespoke sessions will appear here in time order.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-[#E8DCC8] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px]">
                        <thead className="bg-[#FAF7F0]">
                          <tr>
                            <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Time</th>
                            <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Type</th>
                            <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Activity</th>
                            <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Customer</th>
                            <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Reference ID</th>
                            <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Branch</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8DCC8] bg-white">
                        {paginatedTodaysActivity.map((activity) => {
                          return (
                            <tr key={activity.id} className="hover:bg-[#FAF7F0] transition-colors align-top">
                              <td className="px-6 py-4 text-sm text-[#3D2B1F] whitespace-nowrap">
                                {activity.timeLabel}
                              </td>
                              <td className="px-6 py-4 text-sm whitespace-nowrap">
                                {activity.source}
                              </td>
                              <td className="px-6 py-4 text-sm font-medium text-[#1A1A1A] leading-6">{activity.title}</td>
                              <td className="px-6 py-4 text-sm text-[#3D2B1F] leading-6">{activity.customerName}</td>
                              <td className="px-6 py-4 text-sm text-[#6B5D4F] leading-6">{activity.detail}</td>
                              <td className="px-6 py-4 text-sm text-[#6B5D4F] whitespace-nowrap">{activity.branch}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-[#E8DCC8] px-6 py-4">
                      <p className="text-sm text-[#6B5D4F]">
                        Page {safeOverviewActivityPage} of {todaysActivityTotalPages}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setOverviewActivityPage(Math.max(1, safeOverviewActivityPage - 1))}
                          disabled={safeOverviewActivityPage === 1}
                          className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() => setOverviewActivityPage(Math.min(todaysActivityTotalPages, safeOverviewActivityPage + 1))}
                          disabled={safeOverviewActivityPage === todaysActivityTotalPages}
                          className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isCurrentUserStaff && (
              <>
                <div className="border-t border-[#E8DCC8]" aria-hidden="true" />

                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-light text-[#1A1A1A]">Store Overview</h2>
                  <div className="flex items-center gap-3">
                    {canExportPdfs && (
                      <button
                        type="button"
                        onClick={openStoreOverviewExportModal}
                        className="p-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center justify-center"
                        aria-label="Download overview KPIs as PDF"
                        title="Download overview KPIs as PDF"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleRefreshOverview}
                      disabled={dashboardRefreshScope === 'overview'}
                      className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className={`w-5 h-5 ${dashboardRefreshScope === 'overview' ? 'animate-spin' : ''}`} />
                      {dashboardRefreshScope === 'overview' ? 'Refreshing...' : 'Refresh'}
                    </button>
                  </div>
                </div>

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
                      {salesTrend.direction === 'down' ? (
                        <TrendingDown className={`w-5 h-5 ${salesTrend.iconClassName}`} />
                      ) : salesTrend.direction === 'flat' ? (
                        <Minus className={`w-5 h-5 ${salesTrend.iconClassName}`} />
                      ) : (
                        <TrendingUp className={`w-5 h-5 ${salesTrend.iconClassName}`} />
                      )}
                    </div>
                    <p className="text-sm text-[#6B5D4F] mb-1">Total Sales</p>
                    <p className="text-2xl font-light">₱{totalSales.toLocaleString()}</p>
                    <p className={`mt-2 text-sm ${salesTrend.textClassName}`}>{salesTrend.label}</p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-[#E8DCC8]">
                    <div className="flex items-center justify-between mb-4">
                      <Package className="w-8 h-8 text-[#D4AF37]" />
                      {ordersTrend.direction === 'down' ? (
                        <TrendingDown className={`w-5 h-5 ${ordersTrend.iconClassName}`} />
                      ) : ordersTrend.direction === 'flat' ? (
                        <Minus className={`w-5 h-5 ${ordersTrend.iconClassName}`} />
                      ) : (
                        <TrendingUp className={`w-5 h-5 ${ordersTrend.iconClassName}`} />
                      )}
                    </div>
                    <p className="text-sm text-[#6B5D4F] mb-1">Number of Orders</p>
                    <p className="text-2xl font-light">{numberOfOrders}</p>
                    <p className={`mt-2 text-sm ${ordersTrend.textClassName}`}>{ordersTrend.label}</p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-[#E8DCC8]">
                    <div className="flex items-center justify-between mb-4">
                      <Users className="w-8 h-8 text-[#D4AF37]" />
                      {customersTrend.direction === 'down' ? (
                        <TrendingDown className={`w-5 h-5 ${customersTrend.iconClassName}`} />
                      ) : customersTrend.direction === 'flat' ? (
                        <Minus className={`w-5 h-5 ${customersTrend.iconClassName}`} />
                      ) : (
                        <TrendingUp className={`w-5 h-5 ${customersTrend.iconClassName}`} />
                      )}
                    </div>
                    <p className="text-sm text-[#6B5D4F] mb-1">New Customers</p>
                    <p className="text-2xl font-light">{newCustomers}</p>
                    <p className={`mt-2 text-sm ${customersTrend.textClassName}`}>{customersTrend.label}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (topSellingInventoryItem) {
                        setHoverPreviewItem(topSellingInventoryItem);
                      }
                    }}
                    disabled={!topSellingInventoryItem}
                    className="bg-white p-6 rounded-2xl border border-[#E8DCC8] text-left transition-colors hover:border-[#D4AF37] disabled:hover:border-[#E8DCC8] disabled:cursor-default"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <Package className="w-8 h-8 text-[#D4AF37]" />
                      {topSellingTrend.direction === 'down' ? (
                        <TrendingDown className={`w-5 h-5 ${topSellingTrend.iconClassName}`} />
                      ) : topSellingTrend.direction === 'flat' ? (
                        <Minus className={`w-5 h-5 ${topSellingTrend.iconClassName}`} />
                      ) : (
                        <TrendingUp className={`w-5 h-5 ${topSellingTrend.iconClassName}`} />
                      )}
                    </div>
                    <p className="text-sm text-[#6B5D4F] mb-1">Top Selling Item</p>
                    <p className="text-lg font-light leading-tight text-[#1a1a1a]">{topSellingItemName}</p>
                    <p className="mt-2 text-sm text-[#6B5D4F]">{topSellingItemCount} rental{topSellingItemCount === 1 ? '' : 's'}</p>
                    <p className={`mt-1 text-sm ${topSellingTrend.textClassName}`}>{topSellingTrend.label}</p>
                    <p className="mt-1 text-xs text-[#9E8E80]">{topSellingInventoryItem ? 'Click to view item details' : 'Details unavailable for this item'}</p>
                  </button>
                </div>

                {/* Revenue Comparison */}
                <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
                  <div className="mb-6 flex items-start justify-between gap-6">
                    <div className="flex min-w-0 flex-1 items-start gap-8">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-2xl font-light">{branchComparisonMetricLabel} Comparison</h2>
                        <p className="mt-1 text-sm text-[#6B5D4F]">
                          {branchComparisonDescription}{selectedBranch === 'All Branches' ? '' : ` for ${selectedBranch}` }.
                        </p>
                      </div>
                      <div className="w-[220px] shrink-0 text-left">
                        <p className="text-xs uppercase tracking-[0.18em] text-[#9E8E80]">{branchComparisonSummaryLabel}</p>
                        <p className="mt-1 text-2xl font-light text-[#1A1A1A]">{formatBranchComparisonValue(totalComparedMetric)}</p>
                      </div>
                    </div>
                    <div className="flex w-[220px] shrink-0 justify-end">
                      <select
                        aria-label="Select branch comparison metric"
                        value={branchComparisonMetric}
                        onChange={(event) => setBranchComparisonMetric(event.target.value as BranchComparisonMetric)}
                        className="min-w-[180px] rounded-lg border border-[#E8DCC8] bg-white px-4 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#D4AF37]"
                      >
                        {branchComparisonMetricOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {branchPerformanceError && (
                    <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                      {branchPerformanceError}
                    </div>
                  )}
                  {branchPerformanceLoading && (
                    <div className="mb-4 text-sm text-[#6B5D4F]">Loading {branchComparisonMetricLabel.toLowerCase()} comparison...</div>
                  )}
                  <div className="mb-[20px] rounded-2xl border border-[#EDE1CE] bg-[#FCFAF5] p-4 sm:p-6">
                    {!branchPerformanceLoading && branchComparisonData.length > 0 && (
                      <>
                        <div className="h-[320px] w-full">
                          <Bar data={revenueComparisonChartData} options={revenueComparisonChartOptions} />
                        </div>
                        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {branchComparisonData.map((entry) => (
                            <div key={entry.fullBranch} className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-4">
                              <p className="text-sm text-[#6B5D4F]">{entry.fullBranch}</p>
                              <p className="mt-1 text-lg font-light text-[#1A1A1A]">{formatBranchComparisonValue(entry.value)}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {!branchPerformanceLoading && branchComparisonData.length === 0 && (
                      <p className="text-sm text-[#6B5D4F]">{branchComparisonEmptyLabel}</p>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
                  <div className="mb-6 flex items-start justify-between gap-6">
                    <div>
                      <h2 className="text-2xl font-light text-[#1A1A1A]">Items per Category</h2>
                      <p className="mt-1 text-sm text-[#6B5D4F]">
                        Total active inventory items in each category.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#EDE1CE] bg-[#FCFAF5] p-4 sm:p-6">
                    {itemsPerCategory.length > 0 ? (
                      <div className="h-[320px] w-full">
                        <Bar data={itemsPerCategoryChartData} options={itemsPerCategoryChartOptions} />
                      </div>
                    ) : (
                      <p className="text-sm text-[#6B5D4F]">No inventory category data is available for the selected branch yet.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
                  <div className="mb-6 flex items-start justify-between gap-6">
                    <div>
                      <h2 className="text-2xl font-light text-[#1A1A1A]">Most Rented Items</h2>
                      <p className="mt-1 text-sm text-[#6B5D4F]">
                        Top five rented items based on completed rentals.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#EDE1CE] bg-[#FCFAF5] p-4 sm:p-6">
                    {mostRentedItems.length > 0 ? (
                      <div className="h-[320px] w-full">
                        <Bar data={mostRentedItemsChartData} options={mostRentedItemsChartOptions} />
                      </div>
                    ) : (
                      <p className="text-sm text-[#6B5D4F]">No completed rental data is available for the most rented items chart yet.</p>
                    )}
                  </div>
                  {mostRentedItems.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-3" style={{ marginTop: '20px' }}>
                      <p className="text-sm font-medium text-[#6B5D4F]">View Items:</p>
                      <div className="flex flex-wrap gap-3" style={{ marginLeft: '12px' }}>
                        {mostRentedItems.map((item) => (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => {
                              if (item.inventoryItem) {
                                setHoverPreviewItem(item.inventoryItem);
                              }
                            }}
                            disabled={!item.inventoryItem}
                            className="rounded-full border border-[#E8DCC8] bg-white px-4 py-2 text-sm text-[#3D2B1F] transition-colors hover:border-[#D4AF37] hover:bg-[#FAF7F0] disabled:cursor-default disabled:opacity-60"
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
                  <div className="mb-6 flex items-start justify-between gap-6">
                    <div>
                      <h2 className="text-2xl font-light text-[#1A1A1A]">Least Rented Items</h2>
                      <p className="mt-1 text-sm text-[#6B5D4F]">
                        Bottom five rented items based on completed rentals.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#EDE1CE] bg-[#FCFAF5] p-4 sm:p-6">
                    {leastRentedItems.length > 0 ? (
                      <div className="h-[320px] w-full">
                        <Bar data={leastRentedItemsChartData} options={leastRentedItemsChartOptions} />
                      </div>
                    ) : (
                      <p className="text-sm text-[#6B5D4F]">No completed rental data is available for the least rented items chart yet.</p>
                    )}
                  </div>
                  {leastRentedItems.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-3" style={{ marginTop: '20px' }}>
                      <p className="text-sm font-medium text-[#6B5D4F]">View Items:</p>
                      <div className="flex flex-wrap gap-3" style={{ marginLeft: '12px' }}>
                        {leastRentedItems.map((item) => (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => {
                              if (item.inventoryItem) {
                                setHoverPreviewItem(item.inventoryItem);
                              }
                            }}
                            disabled={!item.inventoryItem}
                            className="rounded-full border border-[#E8DCC8] bg-white px-4 py-2 text-sm text-[#3D2B1F] transition-colors hover:border-[#D4AF37] hover:bg-[#FAF7F0] disabled:cursor-default disabled:opacity-60"
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 bg-white rounded-2xl border border-[#E8DCC8] p-8">
                  <div className="mb-6 flex items-start justify-between gap-6">
                    <div>
                      <h2 className="text-2xl font-light text-[#1A1A1A]">Most Clicked Items</h2>
                      <p className="mt-1 text-sm text-[#6B5D4F]">
                        Top five clicked items in the catalog.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#EDE1CE] bg-[#FCFAF5] p-4 sm:p-6">
                    {mostClickedItems.length > 0 ? (
                      <div className="h-[320px] w-full">
                        <Bar data={mostClickedItemsChartData} options={mostClickedItemsChartOptions} />
                      </div>
                    ) : (
                      <p className="text-sm text-[#6B5D4F]">No click data is available for the most clicked items chart yet.</p>
                    )}
                  </div>
                  {mostClickedItems.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-3" style={{ marginTop: '20px' }}>
                      <p className="text-sm font-medium text-[#6B5D4F]">View Items:</p>
                      <div className="flex flex-wrap gap-3" style={{ marginLeft: '12px' }}>
                        {mostClickedItems.map((item) => (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => {
                              if (item.inventoryItem) {
                                setHoverPreviewItem(item.inventoryItem);
                              }
                            }}
                            disabled={!item.inventoryItem}
                            className="rounded-full border border-[#E8DCC8] bg-white px-4 py-2 text-sm text-[#3D2B1F] transition-colors hover:border-[#D4AF37] hover:bg-[#FAF7F0] disabled:cursor-default disabled:opacity-60"
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 bg-white rounded-2xl border border-[#E8DCC8] p-8">
                  <div className="mb-6 flex items-start justify-between gap-6">
                    <div>
                      <h2 className="text-2xl font-light text-[#1A1A1A]">Branch Click Analysis</h2>
                      <p className="mt-1 text-sm text-[#6B5D4F]">
                        See which gowns get clicks from customers of other branches (possible relocation suggestions).
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#EDE1CE] bg-[#FCFAF5] p-4 sm:p-6">
                    {branchClickAnalysisLoading ? (
                      <p className="text-sm text-[#6B5D4F]">Loading branch click analysis...</p>
                    ) : branchClickAnalysis.length > 0 ? (
                      <div className="space-y-4">
                        {branchClickAnalysis.map((item, index) => (
                          <div key={item.gownName} className="bg-white rounded-xl border border-[#E8DCC8] p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-medium text-[#1A1A1A]">{item.gownName}</p>
                                <p className="text-sm text-[#6B5D4F]">
                                  Currently at: <span className="font-medium">{item.gownBranch}</span>
                                </p>
                                <p className="text-sm text-[#6B5D4F]">
                                  <span className="text-[#D4AF37] font-medium">{item.mismatchedClicks}</span> clicks from other branches
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-[#6B5D4F] mb-2">Customer Branch Clicks:</p>
                                <div className="flex flex-wrap gap-2 justify-end">
                                  {Object.entries(item.customerBranchClicks).map(([branch, count]) => (
                                    <span
                                      key={branch}
                                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                                        branch === item.gownBranch
                                          ? 'bg-[#E8DCC8] text-[#1A1A1A]'
                                          : 'bg-[#D4AF37] text-white'
                                      }`}
                                    >
                                      {branch}: {count}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[#6B5D4F]">No branch click analysis data available yet (needs customer clicks with preferred branch).</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="space-y-6">
            {/* Header with Add Button */}
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-light">Inventory Management</h2>
              <div className="flex items-center gap-3">
                {canExportPdfs && (
                  <button
                    type="button"
                    onClick={openInventoryExportModal}
                    disabled={inventoryLoading || archiveLoading || inventoryExportSourceItems.length === 0}
                    className="p-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Download inventory as PDF"
                    title="Download inventory as PDF"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                )}
                {(isArchiveView || !isCurrentUserStaff) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isArchiveView) {
                        void loadArchivedInventory();
                        return;
                      }

                      setShowAddItem(true);
                    }}
                    disabled={isArchiveView ? archiveLoading : false}
                      title={isArchiveView ? 'Refresh archived inventory' : 'Create item'}
                      aria-label={isArchiveView ? 'Refresh archived inventory' : 'Create item'}
                    className={`px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${
                      isArchiveView
                        ? 'border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed'
                        : 'bg-[#1a1a1a] text-white hover:bg-[#D4AF37]'
                    }`}
                  >
                    {isArchiveView ? <RotateCcw className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                      {isArchiveView ? 'Refresh' : 'Create item'}
                  </button>
                )}
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

            <div className="text-sm text-[#6B5D4F]">
              Showing {inventoryCurrentPageCount} of {inventoryItemsForCurrentView.length} {inventoryItemsForCurrentView.length === 1 ? 'item' : 'items'}
            </div>

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
            {(inventoryLoading || (inventoryView === 'archive' && archiveLoading)) && (
              <div className="py-12 text-center text-[#6B5D4F]">
                {inventoryView === 'archive' ? 'Loading archived inventory...' : 'Loading inventory...'}
              </div>
            )}

            {!inventoryLoading && !(inventoryView === 'archive' && archiveLoading) && (
              <div className="bg-white rounded-2xl border border-[#E8DCC8] overflow-hidden md:mx-[-50px] md:w-[calc(100%+100px)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px]">
                    <thead className="bg-[#FAF7F0]">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">ID</th>
                        <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Name</th>
                        <th className="w-[84px] px-0 py-4 text-center text-sm text-[#6B5D4F]">Qty</th>
                        <th className="px-6 py-4 text-center text-sm text-[#6B5D4F]">Category</th>
                        <th className="px-6 py-4 text-center text-sm text-[#6B5D4F]">Color</th>
                        <th className="px-6 py-4 text-center text-sm text-[#6B5D4F]">Price</th>
                        <th className="px-6 py-4 text-center text-sm text-[#6B5D4F]">Branch</th>
                        <th className="px-6 py-4 text-center text-sm text-[#6B5D4F]">Status</th>
                        <th className="px-6 py-4 text-center text-sm text-[#6B5D4F]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DCC8] bg-white">
                      {paginatedInventoryItems.map((item) => {
                        const inventoryStatus = normalizeInventoryManagementStatus(item.status);

                        return (
                        <tr key={item.id} className="hover:bg-[#FAF7F0] transition-colors">
                          <td className="px-6 py-4 text-sm">{item.sku ?? item.id}</td>
                          <td className="px-6 py-4 text-sm font-medium">{item.name}</td>
                          <td className="w-[84px] px-0 py-4 text-center text-sm text-[#6B5D4F]">{item.stock ?? 1}</td>
                          <td className="px-6 py-4 text-center text-sm text-[#6B5D4F]">{item.category}</td>
                          <td className="px-6 py-4 text-center text-sm text-[#6B5D4F]">{item.color}</td>
                          <td className="px-6 py-4 text-center text-sm">₱{item.price.toLocaleString()}</td>
                          <td className="px-6 py-4 text-center text-sm text-[#6B5D4F]">{item.branch}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              inventoryStatus === 'available'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {inventoryStatus.charAt(0).toUpperCase() + inventoryStatus.slice(1)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => setHoverPreviewItem(item)}
                                className="p-2 hover:bg-[#FAF7F0] rounded-full transition-colors"
                                title="View details"
                                aria-label={`View details for ${item.name}`}
                              >
                                <Eye className="w-4 h-4 text-[#6B5D4F]" />
                              </button>
                              {!isArchiveView && !isCurrentUserStaff && (
                                <button
                                  onClick={() => openAddStockModal(item)}
                                  className="p-2 hover:bg-[#FAF7F0] rounded-full transition-colors"
                                  title="Increase quantity"
                                  aria-label={`Increase quantity for ${item.name}`}
                                >
                                  <Plus className="w-4 h-4 text-[#6B5D4F]" />
                                </button>
                              )}
                              {!isArchiveView && !isCurrentUserStaff && (
                                <button
                                  onClick={() => {
                                    setEditingItem(item);
                                  }}
                                  className="p-2 hover:bg-[#FAF7F0] rounded-full transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4 text-[#6B5D4F]" />
                                </button>
                              )}
                              {isArchiveView ? (
                                <button
                                  onClick={() => handleRestoreItem(item.id)}
                                  disabled={restoringItemId === item.id}
                                  className="p-2 hover:bg-[#FAF7F0] rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Restore"
                                >
                                  <RotateCcw className="w-4 h-4 text-[#6B5D4F]" />
                                </button>
                              ) : (
                                !isCurrentUserStaff && (
                                  <button
                                    onClick={() => {
                                      handleDeleteItem(item.id);
                                    }}
                                    className="p-2 hover:bg-red-50 rounded-full transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
                  {canExportPdfs && (
                    <button
                      type="button"
                      onClick={openRentalExportModal}
                      disabled={adminRentalsLoading || !canOpenRentalExportModal}
                      className="p-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Download rentals as PDF"
                      title="Download rentals as PDF"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  )}
                <button
                  type="button"
                  onClick={handleRefreshAdminRentals}
                  disabled={dashboardRefreshScope === 'rentals'}
                  className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {dashboardRefreshScope === 'rentals' ? 'Refreshing...' : 'Refresh'}
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
                  onClick={() => setRentalViewFilter('all')}
                  className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                    rentalViewFilter === 'all'
                      ? 'bg-amber-50 border-amber-200 text-amber-800 font-medium'
                      : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37]'
                  }`}
                >
                  All
                </button>
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
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{rental.gownName}</h4>
                            <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs rounded-full font-medium">
                              Pending
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-[#6B5D4F]">
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
                        <div className="flex flex-wrap items-center gap-3 md:justify-end">
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

              {!adminRentalsLoading && rentalManagementView === 'active' && rentalViewFilter === 'all' && (
                <div className="space-y-3">
                  {paginatedAllActiveStatusRentals.map((rental) => {
                    const canFollowUpForActive = rental.status === 'active' && isWithinReturnFollowUpWindow(rental.endDate);
                    const canFollowUpForPayment = rental.status === 'for_payment';
                    const canFollowUpForPickup = rental.status === 'for_pickup' || rental.status === 'paid_for_confirmation';

                    return (
                      <div
                        key={rental.id}
                        className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <h4 className="font-medium">{rental.gownName}</h4>
                              <span
                                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                                style={getAdminRentalStatusBadgeStyle(rental.status)}
                              >
                                {getRentalStatusLabel(rental)}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-[#6B5D4F]">
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
                                <span>{rental.status === 'for_pickup' ? `Start: ${rental.startDate}` : `Ends: ${rental.endDate}`}</span>
                              </div>
                              {rental.status === 'for_pickup' && isPickupScheduled(rental) && (
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4" />
                                  <span>Pickup: {rental.pickupScheduleDate} {rental.pickupScheduleTime}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 md:justify-end">
                            <div className="text-right">
                              <p className="text-sm text-[#6B5D4F] mb-1">
                                {rental.status === 'for_payment' ? 'Balance Due' : rental.status === 'for_pickup' ? 'Paid' : 'Total Rental'}
                              </p>
                              <p
                                className={`text-lg font-light ${
                                  rental.status === 'for_payment'
                                    ? 'text-rose-700'
                                    : rental.status === 'for_pickup'
                                    ? 'text-cyan-700'
                                    : ''
                                }`}
                              >
                                ₱{(
                                  rental.status === 'for_payment'
                                    ? Math.max(0, rental.totalPrice - rental.downpayment)
                                    : rental.totalPrice
                                ).toLocaleString()}
                              </p>
                            </div>
                            {(canFollowUpForActive || canFollowUpForPayment || canFollowUpForPickup) && (
                              <button
                                onClick={() => {
                                  if (rental.status === 'active') {
                                    openRentalFollowUp(createRentalFollowUpTarget(rental));
                                    return;
                                  }

                                  openRentalFollowUp({
                                    id: rental.id,
                                    gownName: rental.gownName,
                                    customer: rental.customerName,
                                    dueDate: rental.endDate,
                                    daysLate: 0,
                                    status: rental.status === 'for_payment' ? 'for-payment' : 'for-pickup',
                                  });
                                }}
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
                    );
                  })}
                  {filteredAllActiveStatusRentals.length === 0 && (
                    <p className="text-center py-8 text-[#6B5D4F]">{rentalQuery ? 'No rentals match your search' : 'No rentals found'}</p>
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
                              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                              style={getAdminRentalStatusBadgeStyle(rental.status)}
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
                            <span
                              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                              style={getAdminRentalStatusBadgeStyle(rental.status)}
                            >
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
                            className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] whitespace-nowrap"
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
                            className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap bg-white border border-[#6B5D4F] text-[#3D2B1F] hover:bg-[#FAF7F0]"
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
                              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                              style={getAdminRentalStatusBadgeStyle(rental.status)}
                            >
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

        {showOverviewExportModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Choose scheduled activity filters for PDF export"
            onClick={() => setShowOverviewExportModal(false)}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Export Today's Activities</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Choose which branch, activity type, and file format to include in the export.
              </p>

              <div className="space-y-6 mb-6">
                <div>
                  <label htmlFor="overview-export-branch-filter" className="block text-sm font-medium text-[#1A1A1A] mb-3">
                    Branch
                  </label>
                  <select
                    id="overview-export-branch-filter"
                    value={overviewExportBranchFilter}
                    onChange={(event) => setOverviewExportBranchFilter(event.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] bg-white text-[#1A1A1A]"
                  >
                    {['All Branches', ...overviewExportBranchOptions].map((branchOption) => {
                      const count = getOverviewExportItems(branchOption, overviewExportTypeFilter).length;

                      return (
                        <option key={branchOption} value={branchOption}>
                          {`${branchOption} (${count})`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <p className="text-sm font-medium text-[#1A1A1A] mb-3">Type</p>
                  <p className="text-xs text-[#6B5D4F] mb-3">Select one or more activity types.</p>
                  <div className="space-y-3">
                    {overviewExportTypeOptions.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${
                          overviewExportTypeFilter.includes(option.value)
                            ? 'border-[#1a1a1a] bg-[#FAF7F0]'
                            : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            name={`overview-export-type-filter-${option.value}`}
                            value={option.value}
                            checked={overviewExportTypeFilter.includes(option.value)}
                            onChange={() => setOverviewExportTypeFilter((current) => (
                              current.includes(option.value)
                                ? current.filter((value) => value !== option.value)
                                : [...current, option.value]
                            ))}
                            className="h-4 w-4 border-[#CBBBA5] text-[#1a1a1a] focus:ring-[#D4AF37]"
                          />
                          <span className="text-sm font-medium text-[#1a1a1a]">{option.label}</span>
                        </div>
                        <span className="text-sm text-[#6B5D4F]">{option.count}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                    Export Format
                  </label>
                  <div className="flex items-stretch gap-3">
                    {(['pdf', 'csv', 'xls'] as ExportFormat[]).map((formatOption) => {
                      const isSelected = overviewExportFormat === formatOption;
                      const label = formatOption.toUpperCase();

                      return (
                        <label
                          key={formatOption}
                          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                            isSelected
                              ? 'border-[#1a1a1a] bg-[#FAF7F0] text-[#1A1A1A]'
                              : 'border-[#E8DCC8] bg-white text-[#6B5D4F] hover:border-[#D4AF37] hover:text-[#1A1A1A]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="overview-export-format"
                            value={formatOption}
                            checked={isSelected}
                            onChange={() => setOverviewExportFormat(formatOption)}
                            className="h-4 w-4 border-[#CBBBA5] text-[#1a1a1a] focus:ring-[#D4AF37]"
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowOverviewExportModal(false)}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveOverviewKpisAsPdf}
                  disabled={!canExportPdfs || overviewExportItems.length === 0}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  aria-label={`Download overview ${overviewExportFormat.toUpperCase()}`}
                  title={`Download overview ${overviewExportFormat.toUpperCase()}`}
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {showStoreOverviewExportModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Choose store overview export options"
            onClick={() => setShowStoreOverviewExportModal(false)}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Save Store Overview</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Choose one or more branches and the file format for this export.
              </p>

              <div className="space-y-4 mb-6">
                <div className="space-y-3">
                  {['All Branches', ...storeOverviewExportBranchOptions].map((branchOption) => (
                    <label
                      key={branchOption}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                        selectedStoreOverviewExportBranches.includes(branchOption)
                          ? 'border-[#1a1a1a] bg-[#FAF7F0]'
                          : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        name={`store-overview-export-branch-${branchOption}`}
                        value={branchOption}
                        checked={selectedStoreOverviewExportBranches.includes(branchOption)}
                        onChange={() => toggleStoreOverviewExportBranch(branchOption)}
                        className="h-4 w-4 border-[#CBBBA5] text-[#1a1a1a] focus:ring-[#D4AF37]"
                      />
                      <span className="text-sm font-medium text-[#1a1a1a]">{branchOption}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                    Export Format
                  </label>
                  {renderExportFormatOptions(
                    storeOverviewExportFormat,
                    setStoreOverviewExportFormat,
                    'store-overview-export-format',
                  )}
                </div>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowStoreOverviewExportModal(false)}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveStoreOverviewAsPdf}
                  disabled={!canExportPdfs || storeOverviewComparisonData.length === 0 || isGeneratingAnalyticsPdf}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  aria-label={isGeneratingAnalyticsPdf ? 'Generating PDF export' : `Download store overview ${storeOverviewExportFormat.toUpperCase()}`}
                  title={isGeneratingAnalyticsPdf ? 'Generating PDF export' : `Download store overview ${storeOverviewExportFormat.toUpperCase()}`}
                >
                  {isGeneratingAnalyticsPdf ? 'Generating...' : <Download className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {showInventoryExportModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Choose inventory export options"
            onClick={() => setShowInventoryExportModal(false)}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Save Inventory</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Choose one or more branches and the file format for this export.
              </p>

              <div className="space-y-4 mb-6">
                <div className="space-y-3">
                  {['All Branches', ...inventoryExportBranchOptions].map((branchOption) => (
                    <label
                      key={branchOption}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                        selectedInventoryExportBranches.includes(branchOption)
                          ? 'border-[#1a1a1a] bg-[#FAF7F0]'
                          : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        name={`inventory-export-branch-${branchOption}`}
                        value={branchOption}
                        checked={selectedInventoryExportBranches.includes(branchOption)}
                        onChange={() => toggleInventoryExportBranch(branchOption)}
                        className="h-4 w-4 border-[#CBBBA5] text-[#1a1a1a] focus:ring-[#D4AF37]"
                      />
                      <span className="text-sm font-medium text-[#1a1a1a]">{branchOption}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                    Export Format
                  </label>
                  {renderExportFormatOptions(
                    inventoryExportFormat,
                    setInventoryExportFormat,
                    'inventory-export-format',
                  )}
                </div>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowInventoryExportModal(false)}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveInventoryAsPdf}
                  disabled={!canExportPdfs || inventoryExportItems.length === 0}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  aria-label={`Download inventory ${inventoryExportFormat.toUpperCase()}`}
                  title={`Download inventory ${inventoryExportFormat.toUpperCase()}`}
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {showRentalExportModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Choose rental export options"
            onClick={() => setShowRentalExportModal(false)}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Save Rentals</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Choose which branch, rental statuses, and file format to include in the export.
              </p>

              <div className="space-y-6 mb-6">
                <div>
                  <label htmlFor="rental-export-branch-filter" className="block text-sm font-medium text-[#1A1A1A] mb-3">
                    Branch
                  </label>
                  <select
                    id="rental-export-branch-filter"
                    value={selectedRentalExportBranch}
                    onChange={(event) => setSelectedRentalExportBranch(event.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] bg-white text-[#1A1A1A]"
                  >
                    {rentalExportBranchOptions.map((branchOption) => (
                      <option key={branchOption} value={branchOption}>
                        {branchOption}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="text-sm font-medium text-[#1A1A1A] mb-3">Status</p>
                  <p className="text-xs text-[#6B5D4F] mb-3">Select one or more rental statuses.</p>
                  <div className="space-y-3">
                    {rentalExportOptions.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${
                          selectedRentalExportFilters.includes(option.value)
                            ? 'border-[#1a1a1a] bg-[#FAF7F0]'
                            : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            name={`rental-export-filter-${option.value}`}
                            value={option.value}
                            checked={selectedRentalExportFilters.includes(option.value)}
                            onChange={() => setSelectedRentalExportFilters((current) => (
                              current.includes(option.value)
                                ? current.filter((value) => value !== option.value)
                                : [...current, option.value]
                            ))}
                            className="h-4 w-4 border-[#CBBBA5] text-[#1a1a1a] focus:ring-[#D4AF37]"
                          />
                          <span className="text-sm font-medium text-[#1a1a1a]">{option.label}</span>
                        </div>
                        <span className="text-sm text-[#6B5D4F]">{option.count}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                    Export Format
                  </label>
                  {renderExportFormatOptions(
                    rentalExportFormat,
                    setRentalExportFormat,
                    'rental-export-format',
                  )}
                </div>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowRentalExportModal(false)}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveRentalsAsPdf(selectedRentalExportFilters, selectedRentalExportBranch)}
                  disabled={!canExportPdfs || getRentalExportItems(selectedRentalExportFilters, selectedRentalExportBranch).length === 0}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  aria-label={`Download rentals ${rentalExportFormat.toUpperCase()}`}
                  title={`Download rentals ${rentalExportFormat.toUpperCase()}`}
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'appointments' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-light">Appointment Management</h2>
              <div className="flex items-center gap-3">
                {canExportPdfs && (
                  <button
                    type="button"
                    onClick={openAppointmentExportModal}
                    disabled={adminAppointmentsLoading || !canOpenAppointmentExportModal}
                    className="p-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Download appointments as PDF"
                    title="Download appointments as PDF"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRefreshAdminAppointments}
                  disabled={dashboardRefreshScope === 'appointments'}
                  className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {dashboardRefreshScope === 'appointments' ? 'Refreshing...' : 'Refresh'}
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
                    onClick={() => setAppointmentStatusFilter('all')}
                    className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                      appointmentStatusFilter === 'all'
                        ? 'bg-[#FAF3E0] border-[#D4AF37] text-[#7A5C00] font-medium'
                        : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37]'
                    }`}
                  >
                    All Appointments
                  </button>
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

              {!adminAppointmentsLoading && appointmentManagementView === 'active' && (
                <div className="space-y-3">
                  {paginatedAppointments.map((appointment) => (
                    <div key={appointment.id} className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{getAppointmentTypeLabel(appointment.type)}</h4>
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                                appointment.rescheduleReason
                                  ? ''
                                  : appointment.status === 'scheduled'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                              style={appointment.rescheduleReason
                                ? {
                                    backgroundColor: '#FDE7C7',
                                    color: '#B45309'
                                  }
                                : undefined}
                            >
                              {appointment.rescheduleReason
                                ? 'Rescheduled'
                                : appointment.status === 'scheduled'
                                  ? 'Scheduled'
                                  : 'Pending'}
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
                          {appointment.status === 'pending' ? (
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
                          ) : (
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
                          )}
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
                      {appointmentStatusFilter === 'all'
                        ? (appointmentQuery ? 'No appointments match your search' : 'No appointments')
                        : appointmentStatusFilter === 'pending'
                        ? (appointmentQuery ? 'No pending appointments match your search' : 'No pending appointments')
                        : (appointmentQuery ? 'No scheduled appointments match your search' : 'No scheduled appointments')}
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

        {showAppointmentExportModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Choose appointment export options"
            onClick={() => setShowAppointmentExportModal(false)}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Save Appointments</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Choose which branch, appointment statuses, and file format to include in the export.
              </p>

              <div className="space-y-6 mb-6">
                <div>
                  <label htmlFor="appointment-export-branch-filter" className="block text-sm font-medium text-[#1A1A1A] mb-3">
                    Branch
                  </label>
                  <select
                    id="appointment-export-branch-filter"
                    value={selectedAppointmentExportBranch}
                    onChange={(event) => setSelectedAppointmentExportBranch(event.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] bg-white text-[#1A1A1A]"
                  >
                    {appointmentExportBranchOptions.map((branchOption) => (
                      <option key={branchOption} value={branchOption}>
                        {branchOption}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="text-sm font-medium text-[#1A1A1A] mb-3">Status</p>
                  <p className="text-xs text-[#6B5D4F] mb-3">Select one or more appointment statuses.</p>
                  <div className="space-y-3">
                    {appointmentExportOptions.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${
                          selectedAppointmentExportFilters.includes(option.value)
                            ? 'border-[#1a1a1a] bg-[#FAF7F0]'
                            : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            name={`appointment-export-filter-${option.value}`}
                            value={option.value}
                            checked={selectedAppointmentExportFilters.includes(option.value)}
                            onChange={() => setSelectedAppointmentExportFilters((current) => (
                              current.includes(option.value)
                                ? current.filter((value) => value !== option.value)
                                : [...current, option.value]
                            ))}
                            className="h-4 w-4 border-[#CBBBA5] text-[#1a1a1a] focus:ring-[#D4AF37]"
                          />
                          <span className="text-sm font-medium text-[#1a1a1a]">{option.label}</span>
                        </div>
                        <span className="text-sm text-[#6B5D4F]">{option.count}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                    Export Format
                  </label>
                  {renderExportFormatOptions(
                    appointmentExportFormat,
                    setAppointmentExportFormat,
                    'appointment-export-format',
                  )}
                </div>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAppointmentExportModal(false)}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveAppointmentsAsPdf(selectedAppointmentExportFilters, selectedAppointmentExportBranch)}
                  disabled={!canExportPdfs || getAppointmentExportItems(selectedAppointmentExportFilters, selectedAppointmentExportBranch).length === 0}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  aria-label={`Download appointments ${appointmentExportFormat.toUpperCase()}`}
                  title={`Download appointments ${appointmentExportFormat.toUpperCase()}`}
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'bespoke' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center gap-4">
              <h2 className="text-2xl font-light">Bespoke Management</h2>
              <div className="flex items-center gap-3">
                {canExportPdfs && (
                  <button
                    type="button"
                    onClick={openCustomOrderExportModal}
                    disabled={adminCustomOrdersLoading || !canOpenCustomOrderExportModal}
                    className="p-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Download custom orders as PDF"
                    title="Download custom orders as PDF"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRefreshAdminCustomOrders}
                  disabled={dashboardRefreshScope === 'bespoke'}
                  className="px-6 py-3 border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {dashboardRefreshScope === 'bespoke' ? 'Refreshing...' : 'Refresh'}
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
                <button
                  type="button"
                  onClick={() => setCustomOrderStatusFilter('all')}
                  className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                    customOrderStatusFilter === 'all'
                      ? 'bg-[#FAF3E0] border-[#D4AF37] text-[#7A5C00] font-medium'
                      : 'border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37]'
                  }`}
                >
                  All Orders
                </button>
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

            {showCustomOrderExportModal && (
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                role="dialog"
                aria-modal="true"
                aria-label="Choose bespoke export options"
                onClick={() => setShowCustomOrderExportModal(false)}
              >
                <div
                  className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
                  onClick={(event) => event.stopPropagation()}
                >
                  <h3 className="text-xl sm:text-2xl font-light mb-2">Save Custom Orders</h3>
                  <p className="text-sm text-[#6B5D4F] mb-6">
                    Choose which branch, bespoke statuses, and file format to include in the export.
                  </p>

                  <div className="space-y-6 mb-6">
                    <div>
                      <label htmlFor="custom-order-export-branch-filter" className="block text-sm font-medium text-[#1A1A1A] mb-3">
                        Branch
                      </label>
                      <select
                        id="custom-order-export-branch-filter"
                        value={selectedCustomOrderExportBranch}
                        onChange={(event) => setSelectedCustomOrderExportBranch(event.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] bg-white text-[#1A1A1A]"
                      >
                        {customOrderExportBranchOptions.map((branchOption) => (
                          <option key={branchOption} value={branchOption}>
                            {branchOption}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-[#1A1A1A] mb-3">Status</p>
                      <p className="text-xs text-[#6B5D4F] mb-3">Select one or more bespoke statuses.</p>
                      <div className="space-y-3">
                        {customOrderExportOptions.map((option) => (
                          <label
                            key={option.value}
                            className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${
                              selectedCustomOrderExportFilters.includes(option.value)
                                ? 'border-[#1a1a1a] bg-[#FAF7F0]'
                                : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                name={`custom-order-export-filter-${option.value}`}
                                value={option.value}
                                checked={selectedCustomOrderExportFilters.includes(option.value)}
                                onChange={() => setSelectedCustomOrderExportFilters((current) => (
                                  current.includes(option.value)
                                    ? current.filter((value) => value !== option.value)
                                    : [...current, option.value]
                                ))}
                                className="h-4 w-4 border-[#CBBBA5] text-[#1a1a1a] focus:ring-[#D4AF37]"
                              />
                              <span className="text-sm font-medium text-[#1a1a1a]">{option.label}</span>
                            </div>
                            <span className="text-sm text-[#6B5D4F]">{option.count}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                        Export Format
                      </label>
                      {renderExportFormatOptions(
                        customOrderExportFormat,
                        setCustomOrderExportFormat,
                        'custom-order-export-format',
                      )}
                    </div>
                  </div>

                  <div className="flex flex-row items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCustomOrderExportModal(false)}
                      className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveCustomOrdersAsPdf(selectedCustomOrderExportFilters, selectedCustomOrderExportBranch)}
                      disabled={!canExportPdfs || getCustomOrderExportItems(selectedCustomOrderExportFilters, selectedCustomOrderExportBranch).length === 0}
                      className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      aria-label={`Download custom orders ${customOrderExportFormat.toUpperCase()}`}
                      title={`Download custom orders ${customOrderExportFormat.toUpperCase()}`}
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                </div>
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

        {canViewUsers && activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-light">User Management</h2>
              <div className="flex gap-2 shrink-0">
                {canExportPdfs && (
                  <button
                    onClick={openUserExportModal}
                    disabled={usersLoading || !canOpenUserExportModal}
                    className="p-3 rounded-lg flex items-center justify-center transition-colors border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Download users as PDF"
                    title="Download users as PDF"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                )}
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
                  type="button"
                  onClick={handleRefreshUsers}
                  disabled={dashboardRefreshScope === 'users'}
                  className="px-6 py-3 rounded-lg border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {dashboardRefreshScope === 'users' ? 'Refreshing...' : 'Refresh'}
                </button>
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
                          if (isStaffRestricted) {
                            return null;
                          }

                          return (
                            <button
                              onClick={() => handleArchiveUser(user)}
                              disabled={user.status === 'archived' || archivingUserId === user.id || isSelfAdmin}
                              className="px-4 py-2 text-sm bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title={archiveTitle}
                            >
                              {user.status === 'archived'
                                ? 'Archived'
                                : isSelfAdmin
                                  ? 'Logged In'
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

              {showUserExportModal && (
                <div
                  className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Choose user export options"
                  onClick={() => setShowUserExportModal(false)}
                >
                  <div
                    className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <h3 className="text-xl sm:text-2xl font-light mb-2">Save Users</h3>
                    <p className="text-sm text-[#6B5D4F] mb-6">
                      Choose which account type and file format to include in the export.
                    </p>

                    <div className="space-y-4 mb-6">
                      <div className="space-y-3">
                        {userExportOptions.map((option) => (
                          <label
                            key={option.value}
                            className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${
                              userExportFilter === option.value
                                ? 'border-[#1a1a1a] bg-[#FAF7F0]'
                                : 'border-[#E8DCC8] hover:border-[#D4AF37]'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio"
                                name="user-export-filter"
                                value={option.value}
                                checked={userExportFilter === option.value}
                                onChange={() => setUserExportFilter(option.value)}
                                className="h-4 w-4 border-[#CBBBA5] text-[#1a1a1a] focus:ring-[#D4AF37]"
                              />
                              <span className="text-sm font-medium text-[#1a1a1a]">{option.label}</span>
                            </div>
                            <span className="text-sm text-[#6B5D4F]">{option.count}</span>
                          </label>
                        ))}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                          Export Format
                        </label>
                        {renderExportFormatOptions(
                          userExportFormat,
                          setUserExportFormat,
                          'user-export-format',
                        )}
                      </div>
                    </div>

                    <div className="flex flex-row items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowUserExportModal(false)}
                        className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveUsersAsPdf(userExportFilter)}
                        disabled={!canExportPdfs || getUserExportItems(userExportFilter).length === 0}
                        className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        aria-label={`Download users ${userExportFormat.toUpperCase()}`}
                        title={`Download users ${userExportFormat.toUpperCase()}`}
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {canViewAdminHistory && activeTab === 'history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-light">Activity Logs</h2>
              <div className="flex items-center gap-2">
                {canExportPdfs && (
                  <button
                    onClick={openAdminHistoryExportModal}
                    disabled={adminHistoryLoading || filteredAdminHistory.length === 0}
                    className={`${adminHistoryActionButtonClass} p-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                    aria-label="Download activity logs"
                    title="Download activity logs"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRefreshAdminHistory}
                  disabled={dashboardRefreshScope === 'history'}
                  className={`${adminHistoryActionButtonClass} py-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {dashboardRefreshScope === 'history' ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
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
                placeholder="Search Activity Logs"
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
              <p className="text-center py-8 text-[#6B5D4F]">Loading activity logs...</p>
            )}

            {!adminHistoryLoading && !adminHistoryError && filteredAdminHistory.length === 0 && (
              <p className="text-center py-8 text-[#6B5D4F]">
                {adminHistory.length === 0 ? 'No activity logs recorded yet.' : 'No activity logs match the selected filters.'}
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

            {showAdminHistoryExportModal && (
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                role="dialog"
                aria-modal="true"
                aria-label="Choose activity logs export options"
                onClick={() => setShowAdminHistoryExportModal(false)}
              >
                <div
                  className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
                  onClick={(event) => event.stopPropagation()}
                >
                  <h3 className="text-xl sm:text-2xl font-light mb-2">Save Activity Logs</h3>
                  <p className="text-sm text-[#6B5D4F] mb-6">
                    Choose the file format for the filtered activity logs export.
                  </p>

                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                        Export Format
                      </label>
                      {renderExportFormatOptions(
                        adminHistoryExportFormat,
                        setAdminHistoryExportFormat,
                        'admin-history-export-format',
                      )}
                    </div>
                  </div>

                  <div className="flex flex-row items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAdminHistoryExportModal(false)}
                      className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAdminHistoryAsPdf}
                      disabled={!canExportPdfs || filteredAdminHistory.length === 0}
                      className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      aria-label={`Download activity logs ${adminHistoryExportFormat.toUpperCase()}`}
                      title={`Download activity logs ${adminHistoryExportFormat.toUpperCase()}`}
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add/Edit Item Modal */}
        {!isCurrentUserStaff && (showAddItem || editingItem) && !isConfirmCustomCategoryOpen && !pendingCategoryDeletion && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-2xl font-light mb-6">
                {editingItem ? 'Edit Item' : 'Create New Item'}
              </h3>

              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Item Name *</label>
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
                    {isCustomCategoryInputVisible ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            required={!editingItem}
                            value={customCategoryDraft}
                            onChange={(e) => handleCustomCategoryInputChange(e.target.value)}
                            className={`w-full max-w-[240px] px-4 py-3 rounded-lg border bg-white focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.category ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                            placeholder="New Category"
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomCategory}
                            className="shrink-0 min-w-[88px] px-4 py-3 rounded-lg bg-[#1a1a1a] text-white font-medium hover:bg-[#D4AF37] hover:text-black transition-colors"
                          >
                            Add
                          </button>
                        </div>
                        <div className="mt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={cancelCustomCategorySelection}
                            className="cursor-pointer text-xs italic text-[#8D7B68] transition-colors hover:text-[#D4AF37]"
                          >
                            Cancel Add Category
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative" ref={categoryDropdownRef}>
                        <button
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={isCategoryDropdownOpen}
                          aria-invalid={!editingItem && Boolean(addItemErrors.category)}
                          aria-describedby={!editingItem && addItemErrors.category ? 'add-item-category-error' : undefined}
                          onClick={() => setIsCategoryDropdownOpen((prev) => !prev)}
                          className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.category ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                        >
                          <span>{editingItem?.category || newItem.category || DEFAULT_INVENTORY_CATEGORY}</span>
                          <ChevronDown className={`h-4 w-4 text-[#8D7B68] transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isCategoryDropdownOpen && (
                          <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-[#E8DCC8] bg-white shadow-lg">
                            <div className="max-h-60 overflow-y-auto p-2" role="listbox" aria-label="Category options">
                              {inventoryCategoryOptions.map((category) => {
                                const isSelectedCategory = (editingItem?.category || newItem.category) === category;

                                return (
                                  <div key={category} className="flex items-center gap-2 py-1">
                                    <button
                                      type="button"
                                      onClick={() => handleCategorySelectionChange(category)}
                                      className={`flex-1 rounded-lg px-3 py-2 text-left text-sm transition-colors ${isSelectedCategory ? 'bg-[#FAF7F0] text-[#1a1a1a]' : 'text-[#3D2B1F] hover:bg-[#FAF7F0]'}`}
                                    >
                                      {category}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => requestCategoryDeletion(category)}
                                      className="rounded-lg p-2 text-[#8D7B68] transition-colors hover:bg-[#F8E6E1] hover:text-[#B42318]"
                                      aria-label={`Delete ${category} category`}
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="border-t border-[#F1E7D8] p-2">
                              <button
                                type="button"
                                onClick={() => handleCategorySelectionChange(NEW_CATEGORY_OPTION)}
                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#3D2B1F] transition-colors hover:bg-[#FAF7F0]"
                              >
                                New Category
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
                      value={normalizeInventoryManagementStatus(editingItem?.status || newItem.status)}
                      onChange={(e) => editingItem
                        ? setEditingItem({ ...editingItem, status: e.target.value as any })
                        : (setNewItem({ ...newItem, status: e.target.value as any }), setAddItemErrors(prev => ({ ...prev, status: '' })))
                      }
                      className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.status ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                    >
                      <option value="available">Available</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                    {!editingItem && addItemErrors.status && <p id="add-item-status-error" className="text-sm text-red-600 mt-1">{addItemErrors.status}</p>}
                  </div>
                </div>

                {!editingItem && (
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Stock Quantity</label>
                    <input
                      type="number"
                      required={!editingItem}
                      min={1}
                      max={MAX_INVENTORY_STOCK}
                      aria-invalid={!editingItem && Boolean(addItemErrors.stock)}
                      aria-describedby={!editingItem && addItemErrors.stock ? 'add-item-stock-error' : undefined}
                      value={(newItem as Partial<InventoryItem>).stock ?? 1}
                      onChange={(e) => {
                        const nextStock = Number(e.target.value);
                        if (editingItem) {
                          setEditingItem((prev) => prev ? { ...prev, stock: nextStock } : prev);
                        } else {
                          setNewItem((prev) => ({ ...(prev ?? {}), stock: nextStock }));
                          setAddItemErrors((prev) => ({ ...prev, stock: '' }));
                        }
                      }}
                      className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] ${!editingItem && addItemErrors.stock ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                      placeholder="1"
                    />
                    <p className="text-xs text-[#9E8E80] mt-1">Maximum stock is {MAX_INVENTORY_STOCK}.</p>
                    {!editingItem && addItemErrors.stock && <p id="add-item-stock-error" className="text-sm text-red-600 mt-1">{addItemErrors.stock}</p>}
                  </div>
                )}

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Product Images</label>

                  {/* Preview */}
                  {getItemImageList(editingItem ?? newItem).length > 0 && (
                    <div className="mb-3 flex gap-3 overflow-x-auto pb-1">
                      {getItemImageList(editingItem ?? newItem).map((imageUrl, index) => (
                        <div key={`${imageUrl}-${index}`} className="group relative h-24 w-24 shrink-0">
                          <div className="h-full w-full overflow-hidden rounded-lg border border-[#E8DCC8] bg-[#FAF7F0]">
                            <img
                              src={imageUrl}
                              alt={`Preview ${index + 1}`}
                              className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                          <div className="pointer-events-none absolute inset-0 z-10 rounded-lg bg-black/20 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100" />
                          <div className="pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                            <button
                              type="button"
                              onClick={() => removeItemImageAtIndex(index)}
                              className="pointer-events-auto absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-[#b42318] text-white shadow-md transition-transform hover:scale-105 hover:bg-[#8f1d14] focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#b42318] focus:ring-offset-2"
                              aria-label={`Remove image ${index + 1}`}
                              title="Remove image"
                            >
                              <X aria-hidden="true" className="relative -left-[5px] h-7 w-7 stroke-[3]" />
                            </button>
                          </div>
                        </div>
                      ))}
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
                      value={getItemImageList(editingItem ?? newItem)[0] || ''}
                      onChange={(e) => editingItem
                        ? setEditingItem((prev) => prev ? updatePrimaryImage(prev, e.target.value) : prev)
                        : (setNewItem(updatePrimaryImage(newItem, e.target.value)), setAddItemErrors(prev => ({ ...prev, image: '' })))
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
                          <span className="text-sm text-[#6B5D4F]">Click to upload or drag &amp; drop up to 6 images</span>
                          <span className="text-xs text-[#9E8E80] mt-1">JPG or PNG — max 5 MB each</span>
                        </>
                      )}
                      <input
                        id="image-upload"
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png"
                        multiple
                        className="hidden"
                        onChange={handleImageFileChange}
                        disabled={isUploadingImage || getItemImageList(editingItem ?? newItem).length >= MAX_ITEM_IMAGES}
                      />
                    </label>
                  )}

                  {imageUploadError && (
                    <p className="mt-2 text-sm text-red-600">{imageUploadError}</p>
                  )}
                  {!editingItem && addItemErrors.image && !imageUploadError && (
                    <p id="add-item-image-error" className="mt-2 text-sm text-red-600">{addItemErrors.image}</p>
                  )}

                  <div className="mt-4 rounded-xl border border-[#E8DCC8] bg-[#FCFAF6] p-4">
                    <div className="mb-3">
                      <label className="block text-sm text-[#6B5D4F] mb-1">3D Visual</label>
                      <p className="text-xs text-[#9E8E80]">Optional. Upload a GLB, GLTF, USDZ, or ZIP model package so this item can later support a 3D view.</p>
                    </div>

                    {getModel3DUrl(editingItem ?? newItem) && (
                      <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[#E8DCC8] bg-white px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.12em] text-[#9E8E80]">Uploaded Model</p>
                          <a
                            href={getModel3DUrl(editingItem ?? newItem)}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-sm text-[#3D2B1F] underline underline-offset-2"
                          >
                            {getDisplayFileName(getModel3DUrl(editingItem ?? newItem))}
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => editingItem
                            ? setEditingItem((prev) => prev ? { ...prev, model3dUrl: '' } : prev)
                            : setNewItem((prev) => ({ ...prev, model3dUrl: '' }))}
                          className="shrink-0 rounded-lg border border-[#E8DCC8] px-3 py-2 text-sm text-[#6B5D4F] transition-colors hover:border-[#b42318] hover:text-[#b42318]"
                        >
                          Remove
                        </button>
                      </div>
                    )}

                    <label
                      htmlFor="model-upload"
                      className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg transition-colors ${
                        isUploading3DModel
                          ? 'border-[#E8DCC8] bg-[#FAF7F0] cursor-not-allowed'
                          : 'border-[#E8DCC8] cursor-pointer hover:border-[#D4AF37] hover:bg-[#FAF7F0]'
                      }`}
                    >
                      {isUploading3DModel ? (
                        <span className="text-sm text-[#6B5D4F]">Uploading 3D model...</span>
                      ) : (
                        <>
                          <Upload className="w-7 h-7 text-[#6B5D4F] mb-2" />
                          <span className="text-sm text-[#6B5D4F]">Click to upload a 3D model</span>
                          <span className="text-xs text-[#9E8E80] mt-1">GLB, GLTF, USDZ, or ZIP — max 75 MB</span>
                        </>
                      )}
                      <input
                        id="model-upload"
                        ref={modelFileInputRef}
                        type="file"
                        accept=".glb,.gltf,.usdz,.zip"
                        className="hidden"
                        onChange={handle3DModelFileChange}
                        disabled={isUploading3DModel}
                      />
                    </label>

                    {modelUploadError && (
                      <p className="mt-2 text-sm text-red-600">{modelUploadError}</p>
                    )}
                  </div>
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
                      setIsCustomCategoryInputVisible(false);
                      setCustomCategoryDraft('');
                      setIsConfirmCustomCategoryOpen(false);
                      setIsCategoryDropdownOpen(false);
                      setPendingCategoryDeletion(null);
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
                    {editingItem ? 'Update' : 'Add'} Item
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isCurrentUserStaff && stockModalItem && !isAddStockConfirmOpen && (
          (() => {
            const addStockModalError = getAddStockModalValidationMessage();
            const isAddStockDisabled = Boolean(addStockModalError) || incrementingItemId === stockModalItem.id;

            return (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Add stock quantity"
            onClick={closeAddStockModal}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-light mb-2">Add Stock Quantity</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Enter how many units to add for <span className="font-medium text-[#1a1a1a]">{stockModalItem.name}</span>.
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6">
                <p className="text-xs uppercase tracking-[0.12em] text-[#9E8E80] mb-1">Current Stock</p>
                <p className="text-lg text-[#1a1a1a]">{stockModalItem.stock ?? 1}</p>
              </div>

              <div>
                <label className="block text-sm text-[#6B5D4F] mb-2">Quantity to Add</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_INVENTORY_STOCK}
                  step={1}
                  value={stockQuantityToAdd}
                  onChange={(e) => setStockQuantityToAdd(e.target.value)}
                  aria-invalid={Boolean(addStockModalError)}
                  aria-describedby={addStockModalError ? 'add-stock-quantity-error' : undefined}
                  className={`w-full px-4 py-3 rounded-lg border focus:outline-none focus:border-[#D4AF37] ${addStockModalError ? 'border-red-400' : 'border-[#E8DCC8]'}`}
                  placeholder="1"
                />
                <p className="text-xs text-[#9E8E80] mt-1">Total stock cannot go above {MAX_INVENTORY_STOCK}.</p>
                {addStockModalError && (
                  <p id="add-stock-quantity-error" className="text-sm text-red-600 mt-2">
                    {addStockModalError}
                  </p>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeAddStockModal}
                  disabled={incrementingItemId === stockModalItem.id}
                  className="flex-1 px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRequestIncreaseItemStock}
                  disabled={isAddStockDisabled}
                  className="flex-1 px-6 py-3 bg-[#1a1a1a] text-white rounded-lg hover:bg-[#D4AF37] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {incrementingItemId === stockModalItem.id ? 'Adding...' : 'Add Stock'}
                </button>
              </div>
            </div>
          </div>
            );
          })()
        )}

        {!isCurrentUserStaff && isAddStockConfirmOpen && stockModalItem && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm add stock"
            onClick={() => {
              if (!incrementingItemId) {
                setIsAddStockConfirmOpen(false);
              }
            }}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-2xl font-light text-[#1A1A1A] mb-2">Confirm Add Stock</h3>
              <p className="text-sm text-[#6B5D4F] leading-relaxed mb-6">
                Are you sure you want to add{' '}
                <span className="font-medium text-[#1A1A1A]">{Number(stockQuantityToAdd)}</span>{' '}
                stock to{' '}
                <span className="font-medium text-[#1A1A1A]">{stockModalItem.name}</span>?
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] px-4 py-3 mb-6">
                <p className="text-xs uppercase tracking-[0.12em] text-[#9E8E80] mb-1">Updated Total</p>
                <p className="text-lg text-[#1A1A1A]">
                  {Math.max(0, Number(stockModalItem.stock ?? 1)) + Number(stockQuantityToAdd)}
                </p>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddStockConfirmOpen(false)}
                  disabled={Boolean(incrementingItemId)}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleIncreaseItemStock()}
                  disabled={Boolean(incrementingItemId)}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {incrementingItemId === stockModalItem.id ? 'Adding...' : 'Yes, Add'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isConfirmCustomCategoryOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm custom category"
            onClick={cancelCustomCategorySelection}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Confirm Category</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Add this category to the dropdown list?
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6">
                <p className="font-medium text-[#3D2B1F]">{customCategoryDraft.trim() || 'New Category'}</p>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={cancelCustomCategorySelection}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmAddCustomCategory}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors"
                >
                  Yes, Add
                </button>
              </div>
            </div>
          </div>
        )}

        {pendingCategoryDeletion && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm category deletion"
            onClick={closeCategoryDeletionModal}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-light mb-6">Delete Category</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                {pendingCategoryDeletionUsageCount > 0
                  ? `This category cannot be deleted because ${pendingCategoryDeletionUsageCount} gown${pendingCategoryDeletionUsageCount === 1 ? ' is' : 's are'} still using it.`
                  : 'Are you sure you want to remove this category from the dropdown?'}
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-4">
                <p className="font-medium text-[#3D2B1F]">{pendingCategoryDeletion}</p>
              </div>

              {pendingCategoryDeletionUsageCount > 0 && (
                <p className="text-sm text-[#B42318] mb-6">
                  Reassign or remove this category from all gowns first.
                </p>
              )}

              <div className="flex flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={closeCategoryDeletionModal}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmCategoryDeletion}
                  disabled={pendingCategoryDeletionUsageCount > 0}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#B42318] bg-[#B42318] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
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
              if (!isConfirmingUserArchive) {
                setConfirmUserArchive(null);
                setUserArchiveReason('');
                setUserArchiveReasonError(null);
              }
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

              <div className="mb-6">
                <label htmlFor="user-archive-reason" className="block text-sm font-medium text-[#3D2B1F] mb-2">
                  Reason for archiving
                </label>
                <textarea
                  id="user-archive-reason"
                  value={userArchiveReason}
                  onChange={(e) => {
                    setUserArchiveReason(e.target.value);
                    if (userArchiveReasonError) {
                      setUserArchiveReasonError(null);
                    }
                  }}
                  rows={4}
                  disabled={isConfirmingUserArchive}
                  className="w-full px-4 py-3 border border-[#E8DCC8] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:border-[#D4AF37] disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Enter the reason for archiving this account"
                />
                {userArchiveReasonError && (
                  <p className="mt-2 text-sm text-red-600">{userArchiveReasonError}</p>
                )}
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  onClick={() => {
                    setConfirmUserArchive(null);
                    setUserArchiveReason('');
                    setUserArchiveReasonError(null);
                  }}
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
                      onChange={(e) =>
                        setNewUserForm((prev) => ({
                          ...prev,
                          role: e.target.value as ManagedUserRole,
                          preferredBranch: prev.preferredBranch || 'Taguig Main',
                        }))
                      }
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
                      <div className="flex w-full rounded-lg border border-[#E8DCC8] bg-white transition-colors focus-within:border-[#D4AF37]">
                        <span className="flex items-center px-4 py-3 text-sm text-[#6B5D4F] border-r border-[#E8DCC8] bg-[#F5F0E6] rounded-l-lg">
                          +63
                        </span>
                        <input
                          type="tel"
                          value={newUserForm.phoneNumber}
                          onChange={(e) => setNewUserForm((prev) => ({ ...prev, phoneNumber: normalizePhoneDigits(e.target.value) }))}
                          maxLength={10}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="flex-1 px-4 py-3 bg-transparent focus:outline-none rounded-r-lg"
                          placeholder="9123456789"
                        />
                      </div>
                    </div>
                  )}

                  {newUserForm.role === 'Staff' && (
                    <>
                      <div>
                        <label className="block text-sm text-[#6B5D4F] mb-2">Phone Number</label>
                        <div className="flex w-full rounded-lg border border-[#E8DCC8] bg-white transition-colors focus-within:border-[#D4AF37]">
                          <span className="flex items-center px-4 py-3 text-sm text-[#6B5D4F] border-r border-[#E8DCC8] bg-[#F5F0E6] rounded-l-lg">
                            +63
                          </span>
                          <input
                            type="tel"
                            value={newUserForm.phoneNumber}
                            onChange={(e) => setNewUserForm((prev) => ({ ...prev, phoneNumber: normalizePhoneDigits(e.target.value) }))}
                            maxLength={10}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="flex-1 px-4 py-3 bg-transparent focus:outline-none rounded-r-lg"
                            placeholder="9123456789"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm text-[#6B5D4F] mb-2">Assigned Branch</label>
                        <select
                          value={newUserForm.preferredBranch}
                          onChange={(e) => setNewUserForm((prev) => ({ ...prev, preferredBranch: e.target.value }))}
                          className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors bg-white"
                        >
                          {STAFF_BRANCH_OPTIONS.map((branchOption) => (
                            <option key={branchOption} value={branchOption}>
                              {branchOption}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div className="md:col-span-2 rounded-lg border border-[#E8DCC8] bg-[#FAF7F0] px-4 py-3 text-sm text-[#6B5D4F]">
                    A temporary password will be generated automatically for this user.
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div
              className="bg-white rounded-3xl w-full max-w-4xl flex flex-col overflow-hidden shadow-2xl"
              style={{ height: '78vh' }}
            >
              {/* Fixed Header */}
              <div 
                style={{
                  padding: '24px 40px',
                  borderBottom: '1px solid #E8DCC8',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: 'white',
                  zIndex: 10,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ position: 'relative' }}>
                    <h3 
                      style={{ 
                        fontSize: '24px', 
                        fontWeight: '700', 
                        color: '#1a1a1a',
                        letterSpacing: '-0.02em',
                        fontFamily: 'serif'
                      }}
                    >
                      Rental Details
                    </h3>
                    <div 
                      style={{ 
                        position: 'absolute', 
                        bottom: '-8px', 
                        left: '0', 
                        width: '40px', 
                        height: '3px', 
                        backgroundColor: '#D4AF37',
                        borderRadius: '2px'
                      }}
                    />
                  </div>
                    <span 
                      style={{ 
                        padding: '6px 16px', 
                        fontSize: '11px', 
                        fontWeight: '800', 
                        borderRadius: '100px', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.1em',
                        border: '1px solid currentColor',
                        backgroundColor: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      className={getRentalStatusBadgeClass(selectedPendingRental.status)}
                    >
                      {getRentalStatusLabel(selectedPendingRental)}
                    </span>
                </div>
                <button
                  onClick={() => {
                    setShowPendingRentalModal(false);
                    setSelectedPendingRental(null);
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#6B5D4F',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#FAF7F0';
                    e.currentTarget.style.color = '#1a1a1a';
                    e.currentTarget.style.transform = 'rotate(90deg)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#6B5D4F';
                    e.currentTarget.style.transform = 'rotate(0deg)';
                  }}
                  aria-label="Close modal"
                >
                  <X style={{ width: '22px', height: '22px' }} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto bg-white">
                {/* Tab Navigation */}
                <div 
                  style={{ 
                    display: 'flex', 
                    gap: '40px', 
                    padding: '0 40px', 
                    borderBottom: '1px solid #F2EADF',
                    backgroundColor: '#FAF7F0/30'
                  }}
                >
                  {[
                    { id: 'order', label: 'Order', icon: Package },
                    { id: 'payment', label: 'Payment', icon: TrendingUp },
                    { id: 'customer', label: 'Customer', icon: Users }
                  ].map((tab) => {
                    const isActive = rentalModalTab === tab.id;
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setRentalModalTab(tab.id as any)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '16px 0',
                          fontSize: '14px',
                          fontWeight: isActive ? '700' : '500',
                          color: isActive ? '#1a1a1a' : '#9C8B7A',
                          borderBottom: `2px solid ${isActive ? '#D4AF37' : 'transparent'}`,
                          cursor: 'pointer',
                          transition: 'all 0.3s',
                          backgroundColor: 'transparent',
                          borderTop: 'none',
                          borderLeft: 'none',
                          borderRight: 'none',
                          outline: 'none'
                        }}
                      >
                        <Icon style={{ width: '18px', height: '18px', opacity: isActive ? 1 : 0.6 }} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 240px',
                    gap: '32px',
                    alignItems: 'start',
                  }}
                  className="p-8"
                >
                  {/* Left Column: Details (Tabbed) */}
                  <div className="space-y-8">
                    {rentalModalTab === 'order' && (
                      /* Order Section */
                      <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center gap-2 mb-4">
                          <Package className="w-5 h-5 text-[#D4AF37]" />
                          <h4 className="text-xs font-bold text-[#7F6D5C] uppercase tracking-wider">Rental Information</h4>
                        </div>
                        <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#E8DCC8]/50 shadow-sm">
                          <div className="mb-6">
                            <p className="text-2xl font-semibold text-[#3D2B1F]">{selectedPendingRental.gownName}</p>
                            <div className="h-1 w-12 bg-[#D4AF37] mt-2 rounded-full"></div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-y-6 gap-x-10">
                            <div>
                              <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Start Date</p>
                              <p className="font-semibold text-[#3D2B1F] text-base">{selectedPendingRental.startDate}</p>
                            </div>
                            <div>
                              <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">End Date</p>
                              <p className="font-semibold text-[#3D2B1F] text-base">{selectedPendingRental.endDate}</p>
                            </div>
                            <div>
                              <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Branch</p>
                              <p className="font-semibold text-[#3D2B1F] text-base">{selectedPendingRental.branch}</p>
                            </div>
                            <div>
                              <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Event Type</p>
                              <p className="font-semibold text-[#3D2B1F] text-base">{selectedPendingRental.eventType}</p>
                            </div>
                            <div>
                              <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">SKU</p>
                              <p className="font-medium text-[#3D2B1F] font-mono text-base">{selectedPendingRental.sku}</p>
                            </div>
                            <div>
                              <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Reference ID</p>
                              <p className="font-medium text-[#3D2B1F] font-mono text-base">{selectedPendingRental.referenceId || selectedPendingRental.id}</p>
                            </div>
                          </div>

                          {isPickupScheduled(selectedPendingRental) && (
                            <div className="mt-8 space-y-3 pt-6 border-t border-[#E8DCC8]/30">
                              <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl border border-[#E8DCC8]/30">
                                <span className="text-[#6B5D4F] text-sm font-medium">Pickup Schedule</span>
                                <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">
                                  {selectedPendingRental.pickupScheduleDate} at {selectedPendingRental.pickupScheduleTime}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    {rentalModalTab === 'payment' && (
                      /* Payment Section */
                      <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center gap-2 mb-4">
                          <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
                          <h4 className="text-sm font-bold text-[#7F6D5C] uppercase tracking-wider">Payment Details</h4>
                        </div>
                        <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#E8DCC8]/50 shadow-sm space-y-6">
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <p className="text-xs font-bold text-[#9C8B7A] uppercase tracking-wider mb-2">Downpayment</p>
                              <div className="bg-white p-3 rounded-xl border border-[#E8DCC8]/30 text-lg text-[#3D2B1F] font-bold min-h-[40px] flex items-center">
                                ₱{selectedPendingRental.downpayment.toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#9C8B7A] uppercase tracking-wider mb-2">Total Price</p>
                              <div className="bg-white p-3 rounded-xl border border-[#E8DCC8]/30 text-lg text-[#D4AF37] font-bold min-h-[40px] flex items-center">
                                ₱{selectedPendingRental.totalPrice.toLocaleString()}
                              </div>
                            </div>
                          </div>
                          {selectedPendingRental.paymentSubmittedAt && (
                            <div className="space-y-4 pt-4 border-t border-[#E8DCC8]/30">
                              <div className="grid grid-cols-2 gap-6">
                                <div>
                                  <p className="text-xs font-bold text-[#9C8B7A] uppercase tracking-wider mb-2">Paid At</p>
                                  <p className="text-sm text-[#3D2B1F] font-medium">
                                    {new Date(selectedPendingRental.paymentSubmittedAt).toLocaleString()}
                                  </p>
                                </div>
                                {selectedPendingRental.paymentReferenceNumber && (
                                  <div>
                                    <p className="text-xs font-bold text-[#9C8B7A] uppercase tracking-wider mb-2">Reference Number</p>
                                    <p className="text-sm text-[#3D2B1F] font-mono font-medium">
                                      {selectedPendingRental.paymentReferenceNumber}
                                    </p>
                                  </div>
                                )}
                              </div>
                              {selectedPendingRental.paymentReceiptUrl && (
                                <div>
                                  <p className="text-xs font-bold text-[#9C8B7A] uppercase tracking-wider mb-2">Payment Receipt</p>
                                  <a
                                    href={selectedPendingRental.paymentReceiptUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block"
                                  >
                                    <div className="rounded-xl border border-[#E8DCC8]/30 overflow-hidden bg-white aspect-video flex items-center justify-center">
                                      <ImageWithFallback
                                        src={selectedPendingRental.paymentReceiptUrl}
                                        alt="Payment receipt"
                                        className="w-full h-full object-contain"
                                      />
                                    </div>
                                  </a>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    {rentalModalTab === 'customer' && (
                      /* Customer Section */
                      <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center gap-2 mb-4">
                          <Users className="w-5 h-5 text-[#D4AF37]" />
                          <h4 className="text-xs font-bold text-[#7F6D5C] uppercase tracking-wider">Customer Details</h4>
                        </div>
                        <div 
                          style={{ 
                            backgroundColor: '#FAF7F0',
                            padding: '32px',
                            borderRadius: '24px',
                            border: '1px solid rgba(232, 220, 200, 0.5)',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.02)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <div 
                              style={{ 
                                width: '64px', 
                                height: '64px', 
                                borderRadius: '50%', 
                                backgroundColor: '#E8DCC8', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                color: '#7F6D5C', 
                                fontSize: '24px', 
                                fontWeight: '700', 
                                border: '3px solid white', 
                                boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
                                flexShrink: 0
                              }}
                            >
                              {selectedPendingRental.customerName.charAt(0)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '20px', fontWeight: '700', color: '#3D2B1F', marginBottom: '8px' }}>
                                {selectedPendingRental.customerName}
                              </p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6B5D4F' }}>
                                  <Mail style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                                  <span style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {selectedPendingRental.customerEmail || 'No email provided'}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6B5D4F' }}>
                                  <Phone style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                                  <span style={{ fontSize: '14px' }}>
                                    {selectedPendingRental.contactNumber || 'No phone provided'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    )}

                    {rentalStatusError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <p className="text-sm text-red-700">{rentalStatusError}</p>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Gown Image */}
                  <div className="sticky top-0">
                    <div className="flex items-center justify-between gap-2 mb-6">
                      <div className="flex items-center gap-2">
                        <Eye className="w-5 h-5 text-[#D4AF37]" />
                        <h4 className="text-xs font-bold text-[#7F6D5C] uppercase tracking-wider">Gown Preview</h4>
                      </div>
                    </div>

                    {selectedPendingRental.gownImage ? (
                      <div className="w-full">
                        <div className="w-full rounded-2xl border-2 border-[#FAF7F0] shadow-lg overflow-hidden bg-white aspect-[3/4]">
                          <ImageWithFallback
                            src={selectedPendingRental.gownImage}
                            alt={selectedPendingRental.gownName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full aspect-[3/4] rounded-2xl border-2 border-dashed border-[#D8C8B2] bg-[#FAF7F0] flex flex-col items-center justify-center text-center p-6">
                        <Package className="w-8 h-8 text-[#D8C8B2] mb-3" />
                        <p className="text-xs text-[#8A7A69] font-medium px-2">
                          No gown image available.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Fixed Footer: Actions */}
              <div 
                style={{ 
                  padding: '24px 40px',
                  borderTop: '1px solid #E8DCC8',
                  backgroundColor: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '40px',
                  zIndex: 30,
                  boxShadow: '0 -15px 40px rgba(0,0,0,0.03)'
                }}
              >
                <button
                  onClick={() => {
                    setShowPendingRentalModal(false);
                    setSelectedPendingRental(null);
                  }}
                  style={{
                    padding: '14px 36px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#7F6D5C',
                    backgroundColor: '#FAF7F0',
                    borderRadius: '18px',
                    border: '1px solid #E8DCC8',
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#F2EADF';
                    e.currentTarget.style.borderColor = '#D8C8B2';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#FAF7F0';
                    e.currentTarget.style.borderColor = '#E8DCC8';
                  }}
                >
                  Close Details
                </button>

                {(selectedPendingRental.status === 'cancelled' || selectedPendingRental.status === 'item_lost') && selectedPendingRental.rejectionReason && (
                  <div 
                    style={{ 
                      flex: 1, 
                      backgroundColor: '#fef2f2', 
                      borderRadius: '16px', 
                      padding: '12px 24px', 
                      border: '1px solid #fee2e2',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <span style={{ fontSize: '10px', fontWeight: '800', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {selectedPendingRental.status === 'item_lost' ? 'Reason for Item Lost' : 'Reason for Cancellation'}
                    </span>
                    <p style={{ fontSize: '13px', color: '#7f1d1d', fontWeight: '500', margin: 0 }}>
                      {selectedPendingRental.rejectionReason}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {(selectedPendingRental.status === 'pending' || selectedPendingRental.status === 'for_payment' || selectedPendingRental.status === 'paid_for_confirmation') && (
                    <>
                      <button
                        disabled={rentalStatusUpdating}
                        onClick={() => {
                          setRejectRentalReason('');
                          setRejectRentalError(null);
                          setIsRejectRentalConfirmOpen(true);
                        }}
                        style={{
                          padding: '14px 32px',
                          backgroundColor: '#fef2f2',
                          color: '#b91c1c',
                          border: '1px solid #fee2e2',
                          borderRadius: '18px',
                          fontWeight: 'bold',
                          fontSize: '14px',
                          cursor: 'pointer',
                          transition: 'all 0.3s'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#fee2e2';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#fef2f2';
                        }}
                      >
                        Reject Rental
                      </button>
                      {(selectedPendingRental.status === 'pending' || selectedPendingRental.status === 'paid_for_confirmation') && (
                        <button
                          disabled={rentalStatusUpdating}
                          onClick={() => {
                            setRentalStatusError(null);
                            setIsApproveRentalConfirmOpen(true);
                          }}
                          style={{
                            padding: '14px 48px',
                            borderRadius: '18px',
                            fontWeight: 'bold',
                            fontSize: '14px',
                            transition: 'all 0.3s',
                            backgroundColor: '#D4AF37',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(212, 175, 55, 0.3)'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = '#B48F27';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 20px rgba(212, 175, 55, 0.4)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = '#D4AF37';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 15px rgba(212, 175, 55, 0.3)';
                          }}
                        >
                          {rentalActionInProgress === 'approve'
                            ? 'Processing...'
                            : (selectedPendingRental.status === 'paid_for_confirmation' ? 'Schedule Pickup' : 'Approve Rental')}
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
                      style={{
                        padding: '14px 48px',
                        borderRadius: '18px',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        transition: 'all 0.3s',
                        backgroundColor: '#0891b2',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 4px 15px rgba(8, 145, 178, 0.3)'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#0e7490';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#0891b2';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      Confirm Picked Up
                    </button>
                  )}
                  {selectedPendingRental.status === 'active' && (
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <button
                        disabled={rentalStatusUpdating}
                        onClick={() => {
                          const due = new Date(selectedPendingRental.endDate);
                          due.setHours(0, 0, 0, 0);
                          const daysLate = Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

                          setRentalStatusError(null);
                          setSelectedReturnRental({
                            id: selectedPendingRental.id,
                            gownName: selectedPendingRental.gownName,
                            customer: selectedPendingRental.customerName,
                            dueDate: selectedPendingRental.endDate,
                            daysLate,
                            sku: selectedPendingRental.sku,
                          });
                          setRejectRentalReason('');
                          setIsItemLostConfirmOpen(true);
                        }}
                        style={{
                          padding: '14px 48px',
                          borderRadius: '18px',
                          fontWeight: 'bold',
                          fontSize: '14px',
                          transition: 'all 0.3s',
                          backgroundColor: '#fef2f2',
                          color: '#b91c1c',
                          border: '1px solid #fee2e2',
                          cursor: 'pointer'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#fee2e2';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#fef2f2';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        Item Lost
                      </button>
                      <button
                        disabled={rentalStatusUpdating}
                        onClick={() => {
                          const due = new Date(selectedPendingRental.endDate);
                          due.setHours(0, 0, 0, 0);
                          const daysLate = Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

                          setRentalStatusError(null);
                          setSelectedReturnRental({
                            id: selectedPendingRental.id,
                            gownName: selectedPendingRental.gownName,
                            customer: selectedPendingRental.customerName,
                            dueDate: selectedPendingRental.endDate,
                            daysLate,
                            sku: selectedPendingRental.sku,
                          });
                          setIsItemReturnedConfirmOpen(true);
                        }}
                        style={{
                          padding: '14px 48px',
                          borderRadius: '18px',
                          fontWeight: 'bold',
                          fontSize: '14px',
                          transition: 'all 0.3s',
                          backgroundColor: '#16a34a',
                          color: 'white',
                          border: 'none',
                          cursor: 'pointer',
                          boxShadow: '0 4px 15px rgba(22, 163, 74, 0.3)'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#15803d';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#16a34a';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        Confirm Item Returned
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Custom Order Details Modal */}
        {selectedCustomOrder && (() => {
          const rejectionReason = getCustomOrderRejectionReason(selectedCustomOrder);

          return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div
                className="bg-white rounded-3xl w-full max-w-4xl flex flex-col overflow-hidden shadow-2xl"
                style={{ height: '78vh' }}
              >
                {/* Fixed Header */}
                <div 
                  style={{
                    padding: '24px 40px',
                    borderBottom: '1px solid #E8DCC8',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'white',
                    zIndex: 10,
                    boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ position: 'relative' }}>
                      <h3 
                        style={{ 
                          fontSize: '24px', 
                          fontWeight: '700', 
                          color: '#1a1a1a',
                          letterSpacing: '-0.02em',
                          fontFamily: 'serif'
                        }}
                      >
                        Custom Order Details
                      </h3>
                      <div 
                        style={{ 
                          position: 'absolute', 
                          bottom: '-8px', 
                          left: '0', 
                          width: '40px', 
                          height: '3px', 
                          backgroundColor: '#D4AF37',
                          borderRadius: '2px'
                        }}
                      />
                    </div>
                    <span 
                      style={{ 
                        padding: '6px 16px', 
                        fontSize: '11px', 
                        fontWeight: '800', 
                        borderRadius: '100px', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.1em',
                        border: '1px solid currentColor',
                        backgroundColor: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      className={getCustomOrderStatusBadgeClass(selectedCustomOrder.status)}
                    >
                      {getCustomOrderStatusLabel(selectedCustomOrder.status)}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedCustomOrder(null)}
                    style={{
                      padding: '10px',
                      borderRadius: '50%',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: '#6B5D4F',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#FAF7F0';
                      e.currentTarget.style.color = '#1a1a1a';
                      e.currentTarget.style.transform = 'rotate(90deg)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#6B5D4F';
                      e.currentTarget.style.transform = 'rotate(0deg)';
                    }}
                    aria-label="Close modal"
                  >
                    <X style={{ width: '22px', height: '22px' }} />
                  </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto bg-white">
                  {/* Tab Navigation */}
                  <div 
                    style={{ 
                      display: 'flex', 
                      gap: '40px', 
                      padding: '0 40px', 
                      borderBottom: '1px solid #F2EADF',
                      backgroundColor: '#FAF7F0/30'
                    }}
                  >
                    {[
                      { id: 'order', label: 'Order', icon: Package },
                      { id: 'notes', label: 'Notes', icon: Edit },
                      { id: 'customer', label: 'Customer', icon: Users }
                    ].map((tab) => {
                      const isActive = customOrderModalTab === tab.id;
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setCustomOrderModalTab(tab.id as any)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '16px 0',
                            fontSize: '14px',
                            fontWeight: isActive ? '700' : '500',
                            color: isActive ? '#1a1a1a' : '#9C8B7A',
                            borderBottom: `2px solid ${isActive ? '#D4AF37' : 'transparent'}`,
                            cursor: 'pointer',
                            transition: 'all 0.3s',
                            backgroundColor: 'transparent',
                            borderTop: 'none',
                            borderLeft: 'none',
                            borderRight: 'none',
                            outline: 'none'
                          }}
                        >
                          <Icon style={{ width: '18px', height: '18px', opacity: isActive ? 1 : 0.6 }} />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 240px',
                      gap: '32px',
                      alignItems: 'start',
                    }}
                    className="p-8"
                  >
                    {/* Left Column: Details (Tabbed) */}
                    <div className="space-y-8">
                      {customOrderModalTab === 'order' && (
                        /* Order Section */
                        <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <div className="flex items-center gap-2 mb-4">
                            <Package className="w-5 h-5 text-[#D4AF37]" />
                            <h4 className="text-xs font-bold text-[#7F6D5C] uppercase tracking-wider">Order Information</h4>
                          </div>
                          <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#E8DCC8]/50 shadow-sm">
                            <div className="mb-6">
                              <p className="text-2xl font-semibold text-[#3D2B1F]">{selectedCustomOrder.orderType || 'Custom Order'}</p>
                              <div className="h-1 w-12 bg-[#D4AF37] mt-2 rounded-full"></div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-y-6 gap-x-10">
                              <div>
                                <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Event Date</p>
                                <p className="font-semibold text-[#3D2B1F] text-base">{selectedCustomOrder.eventDate || 'Not set'}</p>
                              </div>
                              <div>
                                <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Branch</p>
                                <p className="font-semibold text-[#3D2B1F] text-base">{selectedCustomOrder.branch || 'No branch selected'}</p>
                              </div>
                              <div>
                                <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Budget</p>
                                <p className="font-semibold text-[#3D2B1F] text-base">{formatCustomOrderBudget(selectedCustomOrder.budget)}</p>
                              </div>
                              <div>
                                <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Reference ID</p>
                                <p className="font-medium text-[#3D2B1F] font-mono text-base">{selectedCustomOrder.referenceId || selectedCustomOrder.id || selectedCustomOrder._id || 'N/A'}</p>
                              </div>
                            </div>

                            <div className="mt-8 space-y-3 pt-6 border-t border-[#E8DCC8]/30">
                              <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl border border-[#E8DCC8]/30">
                                <span className="text-[#6B5D4F] text-sm font-medium">Design Consultation</span>
                                <span className={`text-xs font-bold px-3 py-1 rounded-full ${selectedCustomOrder.consultationDate ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-[#FAF7F0] text-[#9C8B7A] border border-[#E8DCC8]/50'}`}>
                                  {selectedCustomOrder.consultationDate
                                    ? `${selectedCustomOrder.consultationDate}${selectedCustomOrder.consultationTime ? ` at ${formatConsultationTimeLabel(selectedCustomOrder.consultationTime)}` : ''}`
                                    : 'Not scheduled yet'}
                                </span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl border border-[#E8DCC8]/30">
                                <span className="text-[#6B5D4F] text-sm font-medium">Fitting Appointment</span>
                                <span className={`text-xs font-bold px-3 py-1 rounded-full ${selectedCustomOrder.fittingDate ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-[#FAF7F0] text-[#9C8B7A] border border-[#E8DCC8]/50'}`}>
                                  {selectedCustomOrder.fittingDate
                                    ? `${selectedCustomOrder.fittingDate}${selectedCustomOrder.fittingTime ? ` at ${formatConsultationTimeLabel(selectedCustomOrder.fittingTime)}` : ''}`
                                    : 'Not scheduled yet'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </section>
                      )}

                      {customOrderModalTab === 'notes' && (
                        /* Design Notes Section */
                        <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <div className="flex items-center gap-2 mb-4">
                            <Edit className="w-5 h-5 text-[#D4AF37]" />
                            <h4 className="text-sm font-bold text-[#7F6D5C] uppercase tracking-wider">Design Notes</h4>
                          </div>
                          <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#E8DCC8]/50 shadow-sm space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <p className="text-xs font-bold text-[#9C8B7A] uppercase tracking-wider mb-2">Preferred Colors</p>
                                <div className="bg-white p-3 rounded-xl border border-[#E8DCC8]/30 text-sm text-[#3D2B1F] font-medium min-h-[40px] flex items-center">
                                  {selectedCustomOrder.preferredColors || 'None provided'}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-bold text-[#9C8B7A] uppercase tracking-wider mb-2">Fabric Preference</p>
                                <div className="bg-white p-3 rounded-xl border border-[#E8DCC8]/30 text-sm text-[#3D2B1F] font-medium min-h-[40px] flex items-center">
                                  {selectedCustomOrder.fabricPreference || 'None provided'}
                                </div>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#9C8B7A] uppercase tracking-wider mb-2">Special Requests</p>
                              <div className="bg-white p-4 rounded-xl border border-[#E8DCC8]/30 text-sm text-[#3D2B1F] font-medium min-h-[80px] leading-relaxed">
                                {selectedCustomOrder.specialRequests || 'No special requests provided'}
                              </div>
                            </div>
                          </div>
                        </section>
                      )}

                      {customOrderModalTab === 'customer' && (
                        /* Customer Section */
                        <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <div className="flex items-center gap-2 mb-4">
                            <Users className="w-5 h-5 text-[#D4AF37]" />
                            <h4 className="text-xs font-bold text-[#7F6D5C] uppercase tracking-wider">Customer Details</h4>
                          </div>
                          <div 
                            style={{ 
                              backgroundColor: '#FAF7F0',
                              padding: '32px',
                              borderRadius: '24px',
                              border: '1px solid rgba(232, 220, 200, 0.5)',
                              boxShadow: '0 4px 15px rgba(0,0,0,0.02)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                              <div 
                                style={{ 
                                  width: '64px', 
                                  height: '64px', 
                                  borderRadius: '50%', 
                                  backgroundColor: '#E8DCC8', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  color: '#7F6D5C', 
                                  fontSize: '24px', 
                                  fontWeight: '700', 
                                  border: '3px solid white', 
                                  boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
                                  flexShrink: 0
                                }}
                              >
                                {selectedCustomOrder.customerName.charAt(0)}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '20px', fontWeight: '700', color: '#3D2B1F', marginBottom: '8px' }}>
                                  {selectedCustomOrder.customerName}
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6B5D4F' }}>
                                    <Mail style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                                    <span style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {selectedCustomOrder.email || 'No email provided'}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6B5D4F' }}>
                                    <Phone style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                                    <span style={{ fontSize: '14px' }}>
                                      {selectedCustomOrder.contactNumber || 'No phone provided'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </section>
                      )}

                      {/* Status Specific Messages (Show regardless of tab if applicable) */}
                      {(rejectionReason || getCustomOrderConsultationScheduleMessage(selectedCustomOrder) || getCustomOrderFittingScheduleMessage(selectedCustomOrder)) && (
                        <div className="space-y-3 pt-2">
                          {selectedCustomOrder.status === 'rejected' && rejectionReason && (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                              <p className="text-[10px] font-bold uppercase text-red-600 mb-1">Reason for Rejection</p>
                              <p className="text-sm text-red-700 whitespace-pre-wrap">{rejectionReason}</p>
                            </div>
                          )}
                          {(getCustomOrderConsultationScheduleMessage(selectedCustomOrder) || getCustomOrderFittingScheduleMessage(selectedCustomOrder)) && (
                            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 flex gap-3">
                              <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                              <p className="text-xs text-blue-700 leading-normal">
                                {getCustomOrderConsultationScheduleMessage(selectedCustomOrder) || getCustomOrderFittingScheduleMessage(selectedCustomOrder)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right Column: Image Inspiration */}
                    <div className="sticky top-0">
                      <div className="flex items-center justify-between gap-2 mb-6">
                        <div className="flex items-center gap-2">
                          <Eye className="w-5 h-5 text-[#D4AF37]" />
                          <h4 className="text-xs font-bold text-[#7F6D5C] uppercase tracking-wider">Inspiration</h4>
                        </div>
                      </div>

                      {selectedCustomOrder.designImageUrl ? (
                        <div className="w-full">
                          <div className="w-full rounded-2xl border-2 border-[#FAF7F0] shadow-lg overflow-hidden bg-white aspect-[3/4]">
                            <ImageWithFallback
                              src={selectedCustomOrder.designImageUrl}
                              alt="Inspiration"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full aspect-[3/4] rounded-2xl border-2 border-dashed border-[#D8C8B2] bg-[#FAF7F0] flex flex-col items-center justify-center text-center p-6">
                          <Package className="w-8 h-8 text-[#D8C8B2] mb-3" />
                          <p className="text-xs text-[#8A7A69] font-medium px-2">
                            No design inspiration provided.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fixed Footer: Actions */}
                {(customOrderManagementView !== 'archive' || selectedCustomOrder.status === 'completed') && (
                  <div 
                    style={{ 
                      padding: '24px 40px',
                      borderTop: '1px solid #E8DCC8',
                      backgroundColor: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '40px',
                      zIndex: 30,
                      boxShadow: '0 -15px 40px rgba(0,0,0,0.03)'
                    }}
                  >
                    <button
                      onClick={() => setSelectedCustomOrder(null)}
                      style={{
                        padding: '14px 36px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: '#7F6D5C',
                        backgroundColor: '#FAF7F0',
                        borderRadius: '18px',
                        border: '1px solid #E8DCC8',
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#F2EADF';
                        e.currentTarget.style.borderColor = '#D8C8B2';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#FAF7F0';
                        e.currentTarget.style.borderColor = '#E8DCC8';
                      }}
                    >
                      Close Details
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {(() => {
                        const orderId = String(selectedCustomOrder.id || selectedCustomOrder._id || '');
                        const isUpdating = customOrderStatusUpdatingId === orderId;
                        const nextStatus = getNextCustomOrderStatus(selectedCustomOrder.status);
                        const canAdvance = canAdvanceCustomOrderStatus(selectedCustomOrder);
                        const approveDisabledReason = getCustomOrderApproveDisabledReason(selectedCustomOrder);
                        const isFittingStage = selectedCustomOrder.status === 'fitting';
                        const canAdjust = canAdjustCustomOrder(selectedCustomOrder);
                        const canReject = selectedCustomOrder.status !== 'rejected' && selectedCustomOrder.status !== 'completed' && !isFittingStage;
                        const isInquiryStage = selectedCustomOrder.status === 'inquiry';
                        const isCompletedOrder = selectedCustomOrder.status === 'completed';
                        const isArchivedCompletedOrder = isCompletedOrder && Boolean(selectedCustomOrder.isArchived);
                        const isDoneDisabled = isArchivedCompletedOrder ? false : isCompletedOrder ? isUpdating : isUpdating || !nextStatus || !canAdvance;

                        return (
                          <>
                            {isFittingStage ? (
                              <button
                                onClick={() => {
                                  if (!orderId || !canAdjust) return;
                                  setAdminCustomOrdersError(null);
                                  setAdjustCustomOrderReason('');
                                  setAdjustCustomOrderError(null);
                                  setIsAdjustCustomOrderConfirmOpen(true);
                                }}
                                disabled={isUpdating || !canAdjust}
                                style={{
                                  padding: '14px 32px',
                                  backgroundColor: '#fff7ed',
                                  color: '#c2410c',
                                  border: '1px solid #ffedd5',
                                  borderRadius: '18px',
                                  fontWeight: 'bold',
                                  fontSize: '14px',
                                  cursor: canAdjust ? 'pointer' : 'not-allowed',
                                  transition: 'all 0.3s',
                                  opacity: canAdjust ? 1 : 0.5,
                                  boxShadow: '0 2px 4px rgba(194, 65, 12, 0.05)'
                                }}
                                onMouseOver={(e) => {
                                  if (canAdjust) e.currentTarget.style.backgroundColor = '#ffedd5';
                                }}
                                onMouseOut={(e) => {
                                  if (canAdjust) e.currentTarget.style.backgroundColor = '#fff7ed';
                                }}
                              >
                                {isUpdating ? 'Updating...' : 'Request Adjustment'}
                              </button>
                            ) : canReject && (
                              <button
                                onClick={() => {
                                  if (!orderId || !canReject) return;
                                  setAdminCustomOrdersError(null);
                                  setRejectCustomOrderReason('');
                                  setRejectCustomOrderError(null);
                                  setIsRejectCustomOrderConfirmOpen(true);
                                }}
                                disabled={isUpdating || !canReject}
                                style={{
                                  padding: '14px 32px',
                                  backgroundColor: '#fef2f2',
                                  color: '#b91c1c',
                                  border: '1px solid #fee2e2',
                                  borderRadius: '18px',
                                  fontWeight: 'bold',
                                  fontSize: '14px',
                                  cursor: canReject ? 'pointer' : 'not-allowed',
                                  transition: 'all 0.3s',
                                  opacity: canReject ? 1 : 0.5
                                }}
                                onMouseOver={(e) => {
                                  if (canReject) e.currentTarget.style.backgroundColor = '#fee2e2';
                                }}
                                onMouseOut={(e) => {
                                  if (canReject) e.currentTarget.style.backgroundColor = '#fef2f2';
                                }}
                              >
                                {isUpdating ? '...' : (isInquiryStage ? 'Reject Order' : 'Cancel Order')}
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
                              disabled={isDoneDisabled}
                              style={{
                                padding: '14px 48px',
                                borderRadius: '18px',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                transition: 'all 0.3s',
                                cursor: isDoneDisabled ? 'not-allowed' : 'pointer',
                                backgroundColor: isDoneDisabled ? '#E8DCC8' : '#1a1a1a',
                                color: isDoneDisabled ? '#9C8B7A' : 'white',
                                border: 'none',
                                boxShadow: isDoneDisabled ? 'none' : '0 10px 25px rgba(0,0,0,0.15)',
                                minWidth: '200px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                whiteSpace: 'nowrap'
                              }}
                              onMouseOver={(e) => {
                                if (!isDoneDisabled) {
                                  e.currentTarget.style.backgroundColor = '#D4AF37';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                  e.currentTarget.style.boxShadow = '0 12px 30px rgba(212, 175, 55, 0.3)';
                                }
                              }}
                              onMouseOut={(e) => {
                                if (!isDoneDisabled) {
                                  e.currentTarget.style.backgroundColor = '#1a1a1a';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
                                }
                              }}
                              title={isCompletedOrder ? undefined : approveDisabledReason || undefined}
                            >
                              {isArchivedCompletedOrder
                                ? 'Done'
                                : isCompletedOrder
                                ? 'Archive Order'
                                : isUpdating
                                  ? 'Processing...'
                                  : (selectedCustomOrder?.status === 'inquiry' ? 'Approve Order' : 'Mark as Done')}
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Sub-modals */}
                {isDoneCustomOrderConfirmOpen && selectedCustomOrder && (() => {
                  const nextStatus = getNextCustomOrderStatus(selectedCustomOrder.status);
                  if (!nextStatus || !canAdvanceCustomOrderStatus(selectedCustomOrder)) return null;

                  const orderId = String(selectedCustomOrder.id || selectedCustomOrder._id || '');
                  const isUpdating = customOrderStatusUpdatingId === orderId;

                  return (
                    <div 
                      style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px'
                      }}
                    >
                      <div 
                        style={{
                          backgroundColor: 'white',
                          borderRadius: '32px',
                          maxWidth: '440px',
                          width: '100%',
                          padding: '40px',
                          boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                          border: '1px solid rgba(232, 220, 200, 0.3)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                          <div style={{ position: 'relative' }}>
                            <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>Confirm Approval</h3>
                            <div style={{ height: '6px', width: '48px', backgroundColor: '#D4AF37', borderRadius: '100px' }}></div>
                          </div>
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => setIsDoneCustomOrderConfirmOpen(false)}
                            style={{
                              padding: '10px',
                              borderRadius: '50%',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#6B5D4F',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <X style={{ width: '24px', height: '24px' }} />
                          </button>
                        </div>

                        <p className="text-[#6B5D4F] mb-8 leading-relaxed text-base">
                          Are you sure you want to advance this order to <span className="font-bold text-[#D4AF37]">{getCustomOrderStatusLabel(nextStatus)}</span>?
                        </p>

                        <div 
                          style={{ 
                            borderRadius: '24px', 
                            border: '1px solid #E8DCC8', 
                            backgroundColor: '#FAF7F0/50', 
                            padding: '24px', 
                            marginBottom: '40px',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                          }}
                        >
                          <p style={{ fontSize: '10px', color: '#9C8B7A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Order Reference</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{selectedCustomOrder.orderType || 'Custom Order'}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6B5D4F' }}>
                              <Users style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                              <span style={{ fontSize: '14px', fontWeight: '500' }}>{selectedCustomOrder.customerName}</span>
                            </div>
                          </div>
                        </div>

                        {adminCustomOrdersError && (
                          <p className="mb-6 text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{adminCustomOrdersError}</p>
                        )}

                        <div className="flex gap-4">
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => setIsDoneCustomOrderConfirmOpen(false)}
                            style={{
                              flex: 1,
                              padding: '16px',
                              backgroundColor: '#FAF7F0',
                              color: '#6B5D4F',
                              borderRadius: '100px',
                              border: '1px solid #E8DCC8',
                              fontWeight: 'bold',
                              fontSize: '14px',
                              cursor: 'pointer',
                              transition: 'all 0.3s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#F2EADF';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = '#FAF7F0';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
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
                            style={{
                              flex: 1,
                              padding: '16px',
                              backgroundColor: '#1a1a1a',
                              color: 'white',
                              borderRadius: '100px',
                              border: 'none',
                              fontWeight: 'bold',
                              fontSize: '14px',
                              cursor: 'pointer',
                              transition: 'all 0.3s',
                              boxShadow: '0 8px 20px rgba(0,0,0,0.1)'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#D4AF37';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 12px 30px rgba(212, 175, 55, 0.3)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = '#1a1a1a';
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.1)';
                            }}
                          >
                            {isUpdating ? 'Processing...' : 'Yes, Approve'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {isRejectCustomOrderConfirmOpen && selectedCustomOrder && (
                  <div 
                    style={{
                      position: 'fixed',
                      inset: 0,
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      backdropFilter: 'blur(8px)',
                      zIndex: 100,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '16px'
                    }}
                  >
                    <div 
                      style={{
                        backgroundColor: 'white',
                        borderRadius: '32px',
                        maxWidth: '440px',
                        width: '100%',
                        padding: '40px',
                        boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                        border: '1px solid rgba(232, 220, 200, 0.3)',
                        overflow: 'hidden'
                      }}
                    >
                      {(() => {
                        const isInquiryStage = selectedCustomOrder.status === 'inquiry';
                        const isUpdating = customOrderStatusUpdatingId === String(selectedCustomOrder.id || selectedCustomOrder._id || '');

                        return (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                              <div style={{ position: 'relative' }}>
                                <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>
                                  {isInquiryStage ? 'Confirm Rejection' : 'Confirm Cancellation'}
                                </h3>
                                <div style={{ height: '6px', width: '48px', backgroundColor: '#b91c1c', borderRadius: '100px' }}></div>
                              </div>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => {
                                  setIsRejectCustomOrderConfirmOpen(false);
                                  setRejectCustomOrderReason('');
                                  setRejectCustomOrderError(null);
                                }}
                                style={{
                                  padding: '10px',
                                  borderRadius: '50%',
                                  backgroundColor: 'transparent',
                                  border: 'none',
                                  color: '#b91c1c',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <X style={{ width: '24px', height: '24px' }} />
                              </button>
                            </div>

                            <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                              {isInquiryStage
                                ? 'Please provide a reason before rejecting this custom order. This action cannot be undone.'
                                : 'Please provide a reason before cancelling this custom order. This action cannot be undone.'}
                            </p>

                            <div 
                              style={{ 
                                borderRadius: '24px', 
                                border: '1px solid #fee2e2', 
                                backgroundColor: '#fef2f2/50', 
                                padding: '24px', 
                                marginBottom: '32px',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                              }}
                            >
                              <p style={{ fontSize: '10px', color: '#b91c1c', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Order Impacted</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{selectedCustomOrder.orderType || 'Custom Order'}</p>
                                <p style={{ fontSize: '14px', fontWeight: '500', color: '#6B5D4F' }}>Customer: {selectedCustomOrder.customerName}</p>
                              </div>
                            </div>

                            <div style={{ marginBottom: '32px' }}>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#9C8B7A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                                {isInquiryStage ? 'Reason for Rejection *' : 'Reason for Cancellation *'}
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
                                style={{
                                  width: '100%',
                                  padding: '16px 20px',
                                  borderRadius: '20px',
                                  border: '1px solid #E8DCC8',
                                  outline: 'none',
                                  transition: 'all 0.3s',
                                  resize: 'none',
                                  backgroundColor: 'white',
                                  color: '#3D2B1F',
                                  fontSize: '14px',
                                  lineHeight: '1.6'
                                }}
                                disabled={isUpdating}
                                onFocus={(e) => {
                                  e.currentTarget.style.borderColor = '#b91c1c';
                                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(185, 28, 28, 0.05)';
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.borderColor = '#E8DCC8';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              />
                            </div>

                            {rejectCustomOrderError && (
                              <p style={{ marginBottom: '24px', fontSize: '13px', color: '#b91c1c', backgroundColor: '#fef2f2', padding: '12px 16px', borderRadius: '16px', border: '1px solid #fee2e2' }}>
                                {rejectCustomOrderError}
                              </p>
                            )}

                            <div style={{ display: 'flex', gap: '16px' }}>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => {
                                  setIsRejectCustomOrderConfirmOpen(false);
                                  setRejectCustomOrderReason('');
                                  setRejectCustomOrderError(null);
                                }}
                                style={{
                                  flex: 1,
                                  padding: '16px',
                                  backgroundColor: '#FAF7F0',
                                  color: '#6B5D4F',
                                  borderRadius: '100px',
                                  border: '1px solid #E8DCC8',
                                  fontWeight: 'bold',
                                  fontSize: '14px',
                                  cursor: 'pointer',
                                  transition: 'all 0.3s'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.backgroundColor = '#F2EADF';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.backgroundColor = '#FAF7F0';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                }}
                              >
                                Go Back
                              </button>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={handleConfirmRejectCustomOrder}
                                style={{
                                  flex: 1,
                                  padding: '16px',
                                  backgroundColor: '#b91c1c',
                                  color: 'white',
                                  borderRadius: '100px',
                                  border: 'none',
                                  fontWeight: 'bold',
                                  fontSize: '14px',
                                  cursor: 'pointer',
                                  transition: 'all 0.3s',
                                  boxShadow: '0 8px 20px rgba(185, 28, 28, 0.2)'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.backgroundColor = '#991b1b';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                  e.currentTarget.style.boxShadow = '0 12px 25px rgba(185, 28, 28, 0.3)';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.backgroundColor = '#b91c1c';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(185, 28, 28, 0.2)';
                                }}
                              >
                                {isUpdating
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
              </div>
            </div>
          );
        })()}

        {isAdjustCustomOrderConfirmOpen && selectedCustomOrder && selectedCustomOrder.status === 'fitting' && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '440px',
                width: '100%',
                padding: '40px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)',
                overflow: 'hidden'
              }}
            >
              {(() => {
                const isUpdating = customOrderStatusUpdatingId === String(selectedCustomOrder.id || selectedCustomOrder._id || '');

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                      <div style={{ position: 'relative' }}>
                        <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>Request Adjustment</h3>
                        <div style={{ height: '6px', width: '48px', backgroundColor: '#f97316', borderRadius: '100px' }}></div>
                      </div>
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => {
                          setIsAdjustCustomOrderConfirmOpen(false);
                          setAdjustCustomOrderReason('');
                          setAdjustCustomOrderError(null);
                        }}
                        style={{
                          padding: '10px',
                          borderRadius: '50%',
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: '#f97316',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fff7ed'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <X style={{ width: '24px', height: '24px' }} />
                      </button>
                    </div>

                    <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                      Please provide a detailed reason for the adjustment. This will move the custom order back to <span style={{ fontWeight: 'bold', color: '#1a1a1a' }}>In Progress</span>.
                    </p>

                    <div 
                      style={{ 
                        borderRadius: '24px', 
                        border: '1px solid #ffedd5', 
                        backgroundColor: '#fff7ed/50', 
                        padding: '24px', 
                        marginBottom: '32px',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                      }}
                    >
                      <p style={{ fontSize: '10px', color: '#f97316', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Order Reference</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{selectedCustomOrder.orderType || 'Custom Order'}</p>
                        <p style={{ fontSize: '14px', fontWeight: '500', color: '#6B5D4F' }}>Customer: {selectedCustomOrder.customerName}</p>
                      </div>
                    </div>

                    <div style={{ marginBottom: '32px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#9C8B7A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                        Reason for Adjustment *
                      </label>
                      <textarea
                        value={adjustCustomOrderReason}
                        onChange={(e) => {
                          setAdjustCustomOrderReason(e.target.value);
                          if (adjustCustomOrderError) setAdjustCustomOrderError(null);
                        }}
                        rows={4}
                        placeholder="State why this custom order needs adjustment"
                        style={{
                          width: '100%',
                          padding: '16px 20px',
                          borderRadius: '20px',
                          border: '1px solid #E8DCC8',
                          outline: 'none',
                          transition: 'all 0.3s',
                          resize: 'none',
                          backgroundColor: 'white',
                          color: '#3D2B1F',
                          fontSize: '14px',
                          lineHeight: '1.6'
                        }}
                        disabled={isUpdating}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#f97316';
                          e.currentTarget.style.boxShadow = '0 0 0 4px rgba(249, 115, 22, 0.05)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#E8DCC8';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      />
                    </div>

                    {adjustCustomOrderError && (
                      <p style={{ marginBottom: '24px', fontSize: '13px', color: '#c2410c', backgroundColor: '#fff7ed', padding: '12px 16px', borderRadius: '16px', border: '1px solid #ffedd5' }}>
                        {adjustCustomOrderError}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '16px' }}>
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => {
                          setIsAdjustCustomOrderConfirmOpen(false);
                          setAdjustCustomOrderReason('');
                          setAdjustCustomOrderError(null);
                        }}
                        style={{
                          flex: 1,
                          padding: '16px',
                          backgroundColor: '#FAF7F0',
                          color: '#6B5D4F',
                          borderRadius: '100px',
                          border: '1px solid #E8DCC8',
                          fontWeight: 'bold',
                          fontSize: '14px',
                          cursor: 'pointer',
                          transition: 'all 0.3s'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#F2EADF';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#FAF7F0';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        Go Back
                      </button>
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={handleConfirmAdjustCustomOrder}
                        style={{
                          flex: 1,
                          padding: '16px',
                          backgroundColor: '#c2410c',
                          color: 'white',
                          borderRadius: '100px',
                          border: 'none',
                          fontWeight: 'bold',
                          fontSize: '14px',
                          cursor: 'pointer',
                          transition: 'all 0.3s',
                          boxShadow: '0 8px 20px rgba(194, 65, 12, 0.2)'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#9a3412';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 12px 25px rgba(194, 65, 12, 0.3)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#c2410c';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 8px 20px rgba(194, 65, 12, 0.2)';
                        }}
                      >
                        {isUpdating ? 'Updating...' : 'Confirm'}
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
            <div 
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px'
              }}
            >
              <div 
                style={{
                  backgroundColor: 'white',
                  borderRadius: '32px',
                  maxWidth: '440px',
                  width: '100%',
                  padding: '40px',
                  boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                  border: '1px solid rgba(232, 220, 200, 0.3)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                  <div style={{ position: 'relative' }}>
                    <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>Confirm Approval</h3>
                    <div style={{ height: '6px', width: '48px', backgroundColor: '#D4AF37', borderRadius: '100px' }}></div>
                  </div>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => setIsApproveCustomOrderConfirmOpen(false)}
                    style={{
                      padding: '10px',
                      borderRadius: '50%',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#6B5D4F',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <X style={{ width: '24px', height: '24px' }} />
                  </button>
                </div>

                <p className="text-[#6B5D4F] mb-8 leading-relaxed text-base">
                  Are you sure you want to advance this order to <span style={{ color: '#D4AF37', fontWeight: 'bold' }}>{getCustomOrderStatusLabel(nextStatus)}</span>?
                </p>

                <div 
                  style={{ 
                    borderRadius: '24px', 
                    border: '1px solid #E8DCC8', 
                    backgroundColor: 'rgba(250, 247, 240, 0.5)', 
                    padding: '24px', 
                    marginBottom: '40px',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                  }}
                >
                  <p style={{ fontSize: '10px', color: '#9C8B7A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Order Reference</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{selectedCustomOrder.orderType || 'Custom Order'}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6B5D4F' }}>
                      <Users style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                      <span style={{ fontSize: '14px', fontWeight: '500' }}>{selectedCustomOrder.customerName}</span>
                    </div>
                  </div>
                </div>

                {adminCustomOrdersError && (
                  <p className="mb-6 text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{adminCustomOrdersError}</p>
                )}

                <div className="flex gap-4">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => setIsApproveCustomOrderConfirmOpen(false)}
                    style={{
                      flex: 1,
                      padding: '16px',
                      backgroundColor: '#FAF7F0',
                      color: '#6B5D4F',
                      borderRadius: '100px',
                      border: '1px solid #E8DCC8',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.3s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#F2EADF';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#FAF7F0';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={handleConfirmApproveCustomOrder}
                    style={{
                      flex: 1,
                      padding: '16px',
                      backgroundColor: '#1a1a1a',
                      color: 'white',
                      borderRadius: '100px',
                      border: 'none',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.1)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#000';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.15)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#1a1a1a';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.1)';
                    }}
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
            <div 
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px'
              }}
            >
              <div 
                style={{
                  backgroundColor: 'white',
                  borderRadius: '32px',
                  maxWidth: '440px',
                  width: '100%',
                  padding: '40px',
                  boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                  border: '1px solid rgba(232, 220, 200, 0.3)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                  <div style={{ position: 'relative' }}>
                    <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>Archive Order</h3>
                    <div style={{ height: '6px', width: '48px', backgroundColor: '#D4AF37', borderRadius: '100px' }}></div>
                  </div>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => setIsArchiveCompletedCustomOrderConfirmOpen(false)}
                    style={{
                      padding: '10px',
                      borderRadius: '50%',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#6B5D4F',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <X style={{ width: '24px', height: '24px' }} />
                  </button>
                </div>

                <p className="text-[#6B5D4F] mb-8 leading-relaxed text-base">
                  Is this order complete? If confirmed, it will be moved to the <span className="font-bold text-[#1a1a1a]">Bespoke Management Archive</span>.
                </p>

                <div 
                  style={{ 
                    borderRadius: '24px', 
                    border: '1px solid #E8DCC8', 
                    backgroundColor: '#FAF7F0/50', 
                    padding: '24px', 
                    marginBottom: '40px',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                  }}
                >
                  <p style={{ fontSize: '10px', color: '#9C8B7A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Order Details</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{selectedCustomOrder.orderType || 'Custom Order'}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6B5D4F' }}>
                      <Users style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                      <span style={{ fontSize: '14px', fontWeight: '500' }}>{selectedCustomOrder.customerName}</span>
                    </div>
                    <div style={{ paddingTop: '4px' }}>
                      <p style={{ fontSize: '9px', color: '#9C8B7A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Reference ID</p>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: '#3D2B1F', fontFamily: 'monospace' }}>{selectedCustomOrder.referenceId || selectedCustomOrder.id || selectedCustomOrder._id || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {adminCustomOrdersError && (
                  <p className="mb-6 text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{adminCustomOrdersError}</p>
                )}

                <div className="flex gap-4">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => setIsArchiveCompletedCustomOrderConfirmOpen(false)}
                    style={{
                      flex: 1,
                      padding: '16px',
                      backgroundColor: '#FAF7F0',
                      color: '#6B5D4F',
                      borderRadius: '100px',
                      border: '1px solid #E8DCC8',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.3s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#F2EADF';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#FAF7F0';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={handleConfirmArchiveCompletedCustomOrder}
                    style={{
                      flex: 1,
                      padding: '16px',
                      backgroundColor: '#1a1a1a',
                      color: 'white',
                      borderRadius: '100px',
                      border: 'none',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.1)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#D4AF37';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 12px 30px rgba(212, 175, 55, 0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#1a1a1a';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.1)';
                    }}
                  >
                    {isUpdating ? 'Archiving...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {isItemLostConfirmOpen && selectedReturnRental && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '440px',
                width: '100%',
                padding: '40px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)',
                overflow: 'hidden'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div style={{ position: 'relative' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>
                    Confirm Item Lost
                  </h3>
                  <div style={{ height: '6px', width: '48px', backgroundColor: '#b91c1c', borderRadius: '100px' }}></div>
                </div>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => {
                    setIsItemLostConfirmOpen(false);
                    setRejectRentalReason('');
                    setRejectRentalError(null);
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#b91c1c',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X style={{ width: '24px', height: '24px' }} />
                </button>
              </div>

              <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                Please provide a detailed reason before marking this item as <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>Lost</span>. This will move the rental to the archive.
              </p>

              <div 
                style={{ 
                  borderRadius: '24px', 
                  border: '1px solid #fee2e2', 
                  backgroundColor: 'rgba(254, 242, 242, 0.5)', 
                  padding: '24px', 
                  marginBottom: '32px',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                <p style={{ fontSize: '10px', color: '#b91c1c', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Item Impacted</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{selectedReturnRental.gownName}</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#6B5D4F' }}>Customer: {selectedReturnRental.customer}</p>
                </div>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#9C8B7A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                  Reason for Marking as Lost *
                </label>
                <textarea
                  value={rejectRentalReason}
                  onChange={(e) => {
                    setRejectRentalReason(e.target.value);
                    if (rejectRentalError) setRejectRentalError(null);
                  }}
                  rows={4}
                  placeholder="State why this item is being marked as lost (e.g. damaged beyond repair, lost by customer)"
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: '20px',
                    border: '1px solid #E8DCC8',
                    outline: 'none',
                    fontSize: '14px',
                    color: '#3D2B1F',
                    backgroundColor: '#fff',
                    transition: 'all 0.2s',
                    resize: 'none'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#D4AF37';
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(212, 175, 55, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E8DCC8';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  disabled={rentalStatusUpdating}
                />
              </div>

              {rejectRentalError && (
                <p style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '24px', padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                  {rejectRentalError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => {
                    setIsItemLostConfirmOpen(false);
                    setRejectRentalReason('');
                    setRejectRentalError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '16px',
                    backgroundColor: '#FAF7F0',
                    color: '#6B5D4F',
                    borderRadius: '100px',
                    border: '1px solid #E8DCC8',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F2EADF'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                >
                  Go Back
                </button>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={async () => {
                    if (!selectedReturnRental) return;

                    const trimmedReason = rejectRentalReason.trim();
                    if (!trimmedReason) {
                      setRejectRentalError('Reason is required.');
                      return;
                    }

                    setRentalStatusUpdating(true);
                    setRentalActionInProgress('reject');
                    setRentalStatusError(null);
                    setRejectRentalError(null);

                    try {
                      const updated = await rentalAPI.rentalAPI.updateRentalStatus(
                        token,
                        selectedReturnRental.id,
                        'item_lost',
                        trimmedReason
                      );

                      // Deduct inventory by 1 if SKU is available
                      const rentalSku = String(selectedReturnRental.sku || '').trim();
                      if (rentalSku) {
                        setInventory((prev) =>
                          prev.map((item) =>
                            String(item.sku || '').trim().toLowerCase() === rentalSku.toLowerCase()
                              ? { ...item, stock: Math.max(0, (item.stock ?? 1) - 1) }
                              : item
                          )
                        );
                      }

                      setAdminRentals((prev) => prev.map((r) => r.id === selectedReturnRental.id ? updated : r));
                      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
                      setIsItemLostConfirmOpen(false);
                      setRejectRentalReason('');
                      setShowPendingRentalModal(false);
                      setSelectedPendingRental(null);
                      setSelectedReturnRental(null);
                    } catch (err) {
                      const message = err instanceof Error ? err.message : 'Failed to mark item as lost.';
                      setRejectRentalError(message);
                      setRentalStatusError(message);
                    } finally {
                      setRentalStatusUpdating(false);
                      setRentalActionInProgress(null);
                    }
                  }}
                  style={{
                    flex: 1.2,
                    padding: '16px',
                    backgroundColor: '#b91c1c',
                    color: 'white',
                    borderRadius: '100px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(185, 28, 28, 0.2)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#991b1b';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#b91c1c';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {rentalActionInProgress === 'reject' ? 'Processing...' : 'Confirm Lost'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isItemReturnedConfirmOpen && selectedReturnRental && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '440px',
                width: '100%',
                padding: '40px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div style={{ position: 'relative' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>
                    Confirm Return
                  </h3>
                  <div style={{ height: '6px', width: '48px', backgroundColor: '#D4AF37', borderRadius: '100px' }}></div>
                </div>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => {
                    setIsItemReturnedConfirmOpen(false);
                    setSelectedReturnRental(null);
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#6B5D4F',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X style={{ width: '24px', height: '24px' }} />
                </button>
              </div>

              <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                Are you sure you want to confirm that this gown has been <span style={{ color: '#D4AF37', fontWeight: 'bold' }}>Returned</span> by the customer?
              </p>

              <div 
                style={{ 
                  borderRadius: '24px', 
                  border: '1px solid #E8DCC8', 
                  backgroundColor: 'rgba(250, 247, 240, 0.5)', 
                  padding: '24px', 
                  marginBottom: '32px',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                <p style={{ fontSize: '10px', color: '#9C8B7A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Order Reference</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{selectedReturnRental.gownName}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6B5D4F' }}>
                    <Users style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>{selectedReturnRental.customer}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6B5D4F' }}>
                    <Calendar style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>Due: {selectedReturnRental.dueDate}</span>
                  </div>
                </div>
              </div>

              {rentalStatusError && rentalActionInProgress === 'returned' && (
                <p style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '24px', padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                  {rentalStatusError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => {
                    setIsItemReturnedConfirmOpen(false);
                    setSelectedReturnRental(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '16px',
                    backgroundColor: '#FAF7F0',
                    color: '#6B5D4F',
                    borderRadius: '100px',
                    border: '1px solid #E8DCC8',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F2EADF'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
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
                      const updated = await rentalAPI.rentalAPI.updateRentalStatus(token, selectedReturnRental.id, 'completed');
                      setAdminRentals((prev) =>
                        prev.map((r) =>
                          r.id === selectedReturnRental.id ? updated : r
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
                  style={{
                    flex: 1.2,
                    padding: '16px',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    borderRadius: '100px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#000';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#1a1a1a';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {rentalActionInProgress === 'returned' ? 'Processing...' : 'Yes, Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isPickedUpConfirmOpen && selectedPendingRental && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '440px',
                width: '100%',
                padding: '40px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div style={{ position: 'relative' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>
                    Confirm Picked Up
                  </h3>
                  <div style={{ height: '6px', width: '48px', backgroundColor: '#D4AF37', borderRadius: '100px' }}></div>
                </div>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => setIsPickedUpConfirmOpen(false)}
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#6B5D4F',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X style={{ width: '24px', height: '24px' }} />
                </button>
              </div>

              <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                Are you sure you want to confirm that this gown has been <span style={{ color: '#D4AF37', fontWeight: 'bold' }}>Picked Up</span> by the customer?
              </p>

              <div 
                style={{ 
                  borderRadius: '24px', 
                  border: '1px solid #E8DCC8', 
                  backgroundColor: 'rgba(250, 247, 240, 0.5)', 
                  padding: '24px', 
                  marginBottom: '40px',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                <p style={{ fontSize: '10px', color: '#9C8B7A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Order Reference</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{selectedPendingRental.gownName}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6B5D4F' }}>
                    <Users style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>{selectedPendingRental.customerName}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => setIsPickedUpConfirmOpen(false)}
                  style={{
                    flex: 1,
                    padding: '16px',
                    backgroundColor: '#FAF7F0',
                    color: '#6B5D4F',
                    borderRadius: '100px',
                    border: '1px solid #E8DCC8',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F2EADF'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
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
                      const updated = await rentalAPI.rentalAPI.updateRentalStatus(token, selectedPendingRental.id, 'active');
                      setAdminRentals((prev) =>
                        prev.map((r) =>
                          r.id === selectedPendingRental.id ? updated : r
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
                  style={{
                    flex: 1.2,
                    padding: '16px',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    borderRadius: '100px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#000';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#1a1a1a';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {rentalActionInProgress === 'picked-up' ? 'Processing...' : 'Yes, Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isRejectRentalConfirmOpen && selectedPendingRental && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '440px',
                width: '100%',
                padding: '40px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)',
                overflow: 'hidden'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div style={{ position: 'relative' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>
                    Confirm Rejection
                  </h3>
                  <div style={{ height: '6px', width: '48px', backgroundColor: '#b91c1c', borderRadius: '100px' }}></div>
                </div>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => {
                    setIsRejectRentalConfirmOpen(false);
                    setRejectRentalReason('');
                    setRejectRentalError(null);
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#b91c1c',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X style={{ width: '24px', height: '24px' }} />
                </button>
              </div>

              <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                Please provide a reason before rejecting this rental request. This action cannot be undone.
              </p>

              <div 
                style={{ 
                  borderRadius: '24px', 
                  border: '1px solid #fee2e2', 
                  backgroundColor: 'rgba(254, 242, 242, 0.5)', 
                  padding: '24px', 
                  marginBottom: '32px',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                <p style={{ fontSize: '10px', color: '#b91c1c', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Order Impacted</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{selectedPendingRental.gownName}</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#6B5D4F' }}>Customer: {selectedPendingRental.customerName}</p>
                </div>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#9C8B7A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                  Reason for Rejection *
                </label>
                <textarea
                  value={rejectRentalReason}
                  onChange={(e) => {
                    setRejectRentalReason(e.target.value);
                    if (rejectRentalError) setRejectRentalError(null);
                  }}
                  rows={4}
                  placeholder="State why this rental request is being rejected"
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: '20px',
                    border: '1px solid #E8DCC8',
                    outline: 'none',
                    fontSize: '14px',
                    color: '#3D2B1F',
                    backgroundColor: '#fff',
                    transition: 'all 0.2s',
                    resize: 'none'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#D4AF37';
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(212, 175, 55, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E8DCC8';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  disabled={rentalStatusUpdating}
                />
              </div>

              {rejectRentalError && (
                <p style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '24px', padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                  {rejectRentalError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => {
                    setIsRejectRentalConfirmOpen(false);
                    setRejectRentalReason('');
                    setRejectRentalError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '16px',
                    backgroundColor: '#FAF7F0',
                    color: '#6B5D4F',
                    borderRadius: '100px',
                    border: '1px solid #E8DCC8',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F2EADF'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                >
                  Go Back
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
                      const updated = await rentalAPI.rentalAPI.updateRentalStatus(
                        token,
                        selectedPendingRental.id,
                        'cancelled',
                        trimmedReason
                      );
                      setAdminRentals((prev) =>
                        prev.map((r) =>
                          r.id === selectedPendingRental.id ? updated : r
                        )
                      );
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
                  style={{
                    flex: 1.2,
                    padding: '16px',
                    backgroundColor: '#b91c1c',
                    color: 'white',
                    borderRadius: '100px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(185, 28, 28, 0.2)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#991b1b';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#b91c1c';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {rentalActionInProgress === 'reject' ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isApproveRentalConfirmOpen && selectedPendingRental && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '440px',
                width: '100%',
                padding: '40px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div style={{ position: 'relative' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>
                    Confirm Approval
                  </h3>
                  <div style={{ height: '6px', width: '48px', backgroundColor: '#D4AF37', borderRadius: '100px' }}></div>
                </div>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => setIsApproveRentalConfirmOpen(false)}
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#6B5D4F',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X style={{ width: '24px', height: '24px' }} />
                </button>
              </div>

              <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                Are you sure you want to advance this order to <span style={{ color: '#D4AF37', fontWeight: 'bold' }}>
                  {selectedPendingRental.status === 'paid_for_confirmation' ? 'For Pickup' : 'For Payment'}
                </span>?
              </p>

              <div 
                style={{ 
                  borderRadius: '24px', 
                  border: '1px solid #E8DCC8', 
                  backgroundColor: 'rgba(250, 247, 240, 0.5)', 
                  padding: '24px', 
                  marginBottom: '40px',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                <p style={{ fontSize: '10px', color: '#9C8B7A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Order Reference</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{selectedPendingRental.gownName}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6B5D4F' }}>
                    <Users style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>{selectedPendingRental.customerName}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={() => setIsApproveRentalConfirmOpen(false)}
                  style={{
                    flex: 1,
                    padding: '16px',
                    backgroundColor: '#FAF7F0',
                    color: '#6B5D4F',
                    borderRadius: '100px',
                    border: '1px solid #E8DCC8',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F2EADF'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rentalStatusUpdating}
                  onClick={handleConfirmApproveRental}
                  style={{
                    flex: 1.2,
                    padding: '16px',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    borderRadius: '100px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#000';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#1a1a1a';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {rentalActionInProgress === 'approve'
                    ? 'Processing...'
                    : (selectedPendingRental.status === 'paid_for_confirmation' ? 'Yes, Confirm' : 'Yes, Approve')}
                </button>
              </div>
            </div>
          </div>
        )}

        {isApproveAppointmentConfirmOpen && selectedPendingAppointment && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '440px',
                width: '100%',
                padding: '40px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div style={{ position: 'relative' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>
                    Confirm Approval
                  </h3>
                  <div style={{ height: '6px', width: '48px', backgroundColor: '#D4AF37', borderRadius: '100px' }}></div>
                </div>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedPendingAppointment.id}
                  onClick={() => {
                    setIsApproveAppointmentConfirmOpen(false);
                    setSelectedPendingAppointment(null);
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#6B5D4F',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X style={{ width: '24px', height: '24px' }} />
                </button>
              </div>

              <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                Are you sure you want to approve this appointment and move it to <span style={{ color: '#D4AF37', fontWeight: 'bold' }}>Scheduled</span>?
              </p>

              <div 
                style={{ 
                  borderRadius: '24px', 
                  border: '1px solid #E8DCC8', 
                  backgroundColor: 'rgba(250, 247, 240, 0.5)', 
                  padding: '24px', 
                  marginBottom: '32px',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                <p style={{ fontSize: '10px', color: '#9C8B7A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Appointment Details</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{getAppointmentTypeLabel(selectedPendingAppointment.type)}</p>
                    <p style={{ fontSize: '14px', fontWeight: '500', color: '#6B5D4F' }}>Customer: {selectedPendingAppointment.customerName}</p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', paddingTop: '4px', borderTop: '1px solid #E8DCC8/30' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6B5D4F' }}>
                      <Calendar style={{ width: '14px', height: '14px', opacity: 0.6 }} />
                      <span style={{ fontSize: '13px' }}>{selectedPendingAppointment.date}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6B5D4F' }}>
                      <Clock style={{ width: '14px', height: '14px', opacity: 0.6 }} />
                      <span style={{ fontSize: '13px' }}>{selectedPendingAppointment.time}</span>
                    </div>
                  </div>
                </div>
              </div>

              {adminAppointmentsError && appointmentStatusUpdatingId === selectedPendingAppointment.id && (
                <p style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '24px', padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                  {adminAppointmentsError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedPendingAppointment.id}
                  onClick={() => {
                    setIsApproveAppointmentConfirmOpen(false);
                    setSelectedPendingAppointment(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '16px',
                    backgroundColor: '#FAF7F0',
                    color: '#6B5D4F',
                    borderRadius: '100px',
                    border: '1px solid #E8DCC8',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F2EADF'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedPendingAppointment.id}
                  onClick={handleConfirmApproveAppointment}
                  style={{
                    flex: 1.2,
                    padding: '16px',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    borderRadius: '100px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#000';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#1a1a1a';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {appointmentStatusUpdatingId === selectedPendingAppointment.id ? 'Approving...' : 'Yes, Approve'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isCompleteAppointmentConfirmOpen && selectedScheduledAppointment && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '440px',
                width: '100%',
                padding: '40px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div style={{ position: 'relative' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>
                    Confirm Completion
                  </h3>
                  <div style={{ height: '6px', width: '48px', backgroundColor: '#D4AF37', borderRadius: '100px' }}></div>
                </div>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedScheduledAppointment.id}
                  onClick={() => {
                    setIsCompleteAppointmentConfirmOpen(false);
                    setSelectedScheduledAppointment(null);
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#6B5D4F',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X style={{ width: '24px', height: '24px' }} />
                </button>
              </div>

              <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                Are you sure you want to mark this appointment as <span style={{ color: '#D4AF37', fontWeight: 'bold' }}>Completed</span>?
              </p>

              <div 
                style={{ 
                  borderRadius: '24px', 
                  border: '1px solid #E8DCC8', 
                  backgroundColor: 'rgba(250, 247, 240, 0.5)', 
                  padding: '24px', 
                  marginBottom: '32px',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                <p style={{ fontSize: '10px', color: '#9C8B7A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Appointment Details</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{getAppointmentTypeLabel(selectedScheduledAppointment.type)}</p>
                    <p style={{ fontSize: '14px', fontWeight: '500', color: '#6B5D4F' }}>Customer: {selectedScheduledAppointment.customerName}</p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', paddingTop: '4px', borderTop: '1px solid #E8DCC8/30' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6B5D4F' }}>
                      <Calendar style={{ width: '14px', height: '14px', opacity: 0.6 }} />
                      <span style={{ fontSize: '13px' }}>{selectedScheduledAppointment.date}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6B5D4F' }}>
                      <Clock style={{ width: '14px', height: '14px', opacity: 0.6 }} />
                      <span style={{ fontSize: '13px' }}>{selectedScheduledAppointment.time}</span>
                    </div>
                  </div>
                </div>
              </div>

              {adminAppointmentsError && appointmentStatusUpdatingId === selectedScheduledAppointment.id && (
                <p style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '24px', padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                  {adminAppointmentsError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedScheduledAppointment.id}
                  onClick={() => {
                    setIsCompleteAppointmentConfirmOpen(false);
                    setSelectedScheduledAppointment(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '16px',
                    backgroundColor: '#FAF7F0',
                    color: '#6B5D4F',
                    borderRadius: '100px',
                    border: '1px solid #E8DCC8',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F2EADF'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedScheduledAppointment.id}
                  onClick={handleConfirmCompleteAppointment}
                  style={{
                    flex: 1.2,
                    padding: '16px',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    borderRadius: '100px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#000';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#1a1a1a';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {appointmentStatusUpdatingId === selectedScheduledAppointment.id ? 'Completing...' : 'Yes, Complete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isCancelAppointmentConfirmOpen && selectedCancelAppointment && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '440px',
                width: '100%',
                padding: '40px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)',
                overflow: 'hidden'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div style={{ position: 'relative' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>
                    Confirm Cancellation
                  </h3>
                  <div style={{ height: '6px', width: '48px', backgroundColor: '#b91c1c', borderRadius: '100px' }}></div>
                </div>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedCancelAppointment.id}
                  onClick={() => {
                    setIsCancelAppointmentConfirmOpen(false);
                    setSelectedCancelAppointment(null);
                    setAppointmentCancelReason('');
                    setAppointmentCancelError(null);
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#b91c1c',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X style={{ width: '24px', height: '24px' }} />
                </button>
              </div>

              <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                Please provide a reason before cancelling this appointment. This action cannot be undone.
              </p>

              <div 
                style={{ 
                  borderRadius: '24px', 
                  border: '1px solid #fee2e2', 
                  backgroundColor: 'rgba(254, 242, 242, 0.5)', 
                  padding: '24px', 
                  marginBottom: '32px',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                <p style={{ fontSize: '10px', color: '#b91c1c', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Appointment Impacted</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontWeight: '700', fontSize: '18px', color: '#3D2B1F' }}>{getAppointmentTypeLabel(selectedCancelAppointment.type)}</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#6B5D4F' }}>Customer: {selectedCancelAppointment.customerName}</p>
                </div>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#9C8B7A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                  Reason for Cancellation *
                </label>
                <textarea
                  value={appointmentCancelReason}
                  onChange={(e) => {
                    setAppointmentCancelReason(e.target.value);
                    if (appointmentCancelError) setAppointmentCancelError(null);
                  }}
                  rows={4}
                  placeholder="State why this appointment is being cancelled"
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: '20px',
                    border: '1px solid #E8DCC8',
                    outline: 'none',
                    fontSize: '14px',
                    color: '#3D2B1F',
                    backgroundColor: '#fff',
                    transition: 'all 0.2s',
                    resize: 'none'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#D4AF37';
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(212, 175, 55, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E8DCC8';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  disabled={appointmentStatusUpdatingId === selectedCancelAppointment.id}
                />
              </div>

              {appointmentCancelError && (
                <p style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '24px', padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                  {appointmentCancelError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedCancelAppointment.id}
                  onClick={() => {
                    setIsCancelAppointmentConfirmOpen(false);
                    setSelectedCancelAppointment(null);
                    setAppointmentCancelReason('');
                    setAppointmentCancelError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '16px',
                    backgroundColor: '#FAF7F0',
                    color: '#6B5D4F',
                    borderRadius: '100px',
                    border: '1px solid #E8DCC8',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F2EADF'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                >
                  Go Back
                </button>
                <button
                  type="button"
                  disabled={appointmentStatusUpdatingId === selectedCancelAppointment.id}
                  onClick={handleConfirmCancelAppointment}
                  style={{
                    flex: 1.2,
                    padding: '16px',
                    backgroundColor: '#b91c1c',
                    color: 'white',
                    borderRadius: '100px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(185, 28, 28, 0.2)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#991b1b';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#b91c1c';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {appointmentStatusUpdatingId === selectedCancelAppointment.id ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rental Follow Up Modal */}
        {showNotificationModal && selectedRental && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '460px',
                width: '100%',
                padding: '40px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <h3 style={{ fontSize: '28px', fontWeight: '400', color: '#1a1a1a', fontFamily: 'serif' }}>
                  Send Follow Up
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsSendReminderConfirmOpen(false);
                    setIsReminderSentSuccessOpen(false);
                    setShowNotificationModal(false);
                    setSelectedRental(null);
                    setNotificationMethod('both');
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#6B5D4F',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X style={{ width: '24px', height: '24px' }} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                {notificationError && (
                  <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2', color: '#b91c1c', fontSize: '13px' }}>
                    {notificationError}
                  </div>
                )}

                {/* Rental Info Card */}
                <div 
                  style={{ 
                    backgroundColor: '#FAF7F0', 
                    borderRadius: '20px', 
                    padding: '24px',
                    border: '1px solid #E8DCC8'
                  }}
                >
                  <h4 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a', marginBottom: '8px' }}>
                    {selectedRental.gownName}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#6B5D4F', fontSize: '14px' }}>
                    <p>Customer: {selectedRental.customer}</p>
                    <p>
                      {selectedRental.status === 'pending' 
                        ? 'Status: Pending Rental Request' 
                        : `Due Date: ${selectedRental.dueDate}`}
                    </p>
                    {selectedRental.status === 'active' && selectedRental.daysLate > 0 && (
                      <p style={{ color: '#b91c1c', fontWeight: '600', marginTop: '4px' }}>
                        {selectedRental.daysLate} {selectedRental.daysLate === 1 ? 'day' : 'days'} late • ₱{(selectedRental.daysLate * RENTAL_LATE_FEE_PER_DAY).toLocaleString()} late fee
                      </p>
                    )}
                  </div>
                </div>

                {/* Notification Method Selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '15px', color: '#6B5D4F', marginBottom: '8px', fontWeight: '500' }}>
                    Select Notification Method
                  </label>
                  <p style={{ fontSize: '13px', color: '#9C8B7A', marginBottom: '20px' }}>
                    Choose whether to send the follow up by SMS, email, or both.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[
                      { id: 'sms', label: 'SMS Only', desc: 'Send via text message', icon: MessageSquare },
                      { id: 'email', label: 'Email Only', desc: 'Send via email', icon: Mail },
                      { id: 'both', label: 'SMS & Email', desc: 'Send via both channels', icon: Send }
                    ].map((method) => {
                      const Icon = method.icon;
                      const isSelected = notificationMethod === method.id;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setNotificationMethod(method.id as any)}
                          style={{
                            width: '100%',
                            padding: '16px 20px',
                            borderRadius: '16px',
                            border: `2px solid ${isSelected ? '#D4AF37' : '#E8DCC8'}`,
                            backgroundColor: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: isSelected ? '0 4px 12px rgba(212, 175, 55, 0.1)' : 'none'
                          }}
                          onMouseOver={(e) => {
                            if (!isSelected) e.currentTarget.style.borderColor = '#D4AF37';
                          }}
                          onMouseOut={(e) => {
                            if (!isSelected) e.currentTarget.style.borderColor = '#E8DCC8';
                          }}
                        >
                          <div style={{ 
                            padding: '10px', 
                            borderRadius: '12px', 
                            backgroundColor: isSelected ? 'rgba(212, 175, 55, 0.1)' : '#FAF7F0',
                            color: '#D4AF37'
                          }}>
                            <Icon style={{ width: '20px', height: '20px' }} />
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <p style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a1a' }}>{method.label}</p>
                            <p style={{ fontSize: '12px', color: '#6B5D4F' }}>{method.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', gap: '16px', paddingTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSendReminderConfirmOpen(false);
                      setIsReminderSentSuccessOpen(false);
                      setShowNotificationModal(false);
                      setSelectedRental(null);
                      setNotificationMethod('both');
                      setNotificationError(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '16px',
                      backgroundColor: 'white',
                      color: '#6B5D4F',
                      borderRadius: '16px',
                      border: '1px solid #E8DCC8',
                      fontWeight: '700',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#FAF7F0';
                      e.currentTarget.style.borderColor = '#1a1a1a';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                      e.currentTarget.style.borderColor = '#E8DCC8';
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSendNotification}
                    disabled={notificationSending}
                    style={{
                      flex: 1.2,
                      padding: '16px',
                      backgroundColor: '#1a1a1a',
                      color: 'white',
                      borderRadius: '16px',
                      border: 'none',
                      fontWeight: '700',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.1)',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#000';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#1a1a1a';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <Send style={{ width: '18px', height: '18px' }} />
                    {notificationSending ? 'Sending...' : 'Send Follow Up'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isSendReminderConfirmOpen && selectedRental && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '440px',
                width: '100%',
                padding: '40px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div style={{ position: 'relative' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px' }}>
                    Confirm Send
                  </h3>
                  <div style={{ height: '6px', width: '48px', backgroundColor: '#D4AF37', borderRadius: '100px' }}></div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsSendReminderConfirmOpen(false);
                    setShowNotificationModal(true);
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#6B5D4F',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X style={{ width: '24px', height: '24px' }} />
                </button>
              </div>

              <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                A follow-up message will be sent to <span style={{ color: '#D4AF37', fontWeight: 'bold' }}>{selectedRental.customer}</span> via {notificationMethodText}.
              </p>

              {notificationError && (
                <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2', color: '#b91c1c', fontSize: '13px', marginBottom: '24px' }}>
                  {notificationError}
                </div>
              )}

              <div 
                style={{ 
                  borderRadius: '24px', 
                  border: '1px solid #E8DCC8', 
                  backgroundColor: 'rgba(250, 247, 240, 0.5)', 
                  padding: '24px', 
                  marginBottom: '32px',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                <p style={{ fontSize: '10px', color: '#9C8B7A', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Message Preview</p>
                <p style={{ fontSize: '14px', color: '#3D2B1F', lineHeight: '1.6', fontStyle: 'italic' }}>
                  "{reminderMessage}"
                </p>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsSendReminderConfirmOpen(false);
                    setShowNotificationModal(true);
                  }}
                  style={{
                    flex: 1,
                    padding: '16px',
                    backgroundColor: '#FAF7F0',
                    color: '#6B5D4F',
                    borderRadius: '100px',
                    border: '1px solid #E8DCC8',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F2EADF'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FAF7F0'}
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSendNotification}
                  disabled={notificationSending}
                  style={{
                    flex: 1.2,
                    padding: '16px',
                    backgroundColor: '#1a1a1a',
                    color: 'white',
                    borderRadius: '100px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#000';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#1a1a1a';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {notificationSending ? 'Sending...' : 'Confirm & Send'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isReminderSentSuccessOpen && selectedRental && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                maxWidth: '400px',
                width: '100%',
                padding: '40px',
                textAlign: 'center',
                boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
                border: '1px solid rgba(232, 220, 200, 0.3)'
              }}
            >
              <div style={{ 
                width: '64px', 
                height: '64px', 
                backgroundColor: '#f0fdf4', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                margin: '0 auto 24px',
                color: '#16a34a'
              }}>
                <Send style={{ width: '32px', height: '32px' }} />
              </div>
              
              <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a1a', marginBottom: '12px' }}>
                Follow Up Sent
              </h3>
              
              <p style={{ color: '#6B5D4F', marginBottom: '32px', lineHeight: '1.6', fontSize: '15px' }}>
                Follow up has been sent to <span style={{ fontWeight: 'bold', color: '#1a1a1a' }}>{selectedRental.customer}</span> via {notificationMethodText}.
              </p>

              <button
                type="button"
                onClick={handleDismissReminderSentSuccess}
                style={{
                  width: '100%',
                  padding: '16px',
                  backgroundColor: '#1a1a1a',
                  color: 'white',
                  borderRadius: '100px',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#000';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#1a1a1a';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
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
