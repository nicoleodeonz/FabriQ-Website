import { useState, useEffect, useRef } from 'react';
import { Package, Users, TrendingUp, MapPin, AlertCircle, Edit, Trash2, Plus, X, Mail, Phone, Calendar, Clock, Send, MessageSquare, Upload, Link, Archive, RotateCcw } from 'lucide-react';
import * as inventoryAPI from '../services/inventoryAPI';
import { INVENTORY_UPDATED_EVENT } from '../services/inventoryAPI';
import type { InventoryItem, BranchPerformanceStats, BranchPerformanceSummary } from '../services/inventoryAPI';
import * as usersAPI from '../services/usersAPI';
import type { AdminActionEntry, CreateManagedUserPayload, ManagedUser } from '../services/usersAPI';

export type { InventoryItem };

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: 'Admin' | 'Customer';
  joinDate: string;
  status: 'active' | 'archived';
  lastActivity: string;
}

interface NewUserForm {
  role: 'Admin' | 'Customer';
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
const mockPendingReturns: PendingReturn[] = [
  { id: 'R001', gownName: 'Midnight Elegance', customer: 'Maria Santos', dueDate: '2026-02-05', daysLate: 4 },
  { id: 'R002', gownName: 'Pearl Romance', customer: 'Ana Reyes', dueDate: '2026-02-10', daysLate: 0 },
  { id: 'R003', gownName: 'Rose Garden', customer: 'Carmen Cruz', dueDate: '2026-02-15', daysLate: 0 },
];

interface AdminDashboardProps {
  token: string;
}

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

export function AdminDashboard({ token }: AdminDashboardProps) {
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

  const currentUserId = getCurrentUserId(token);

  type InventoryConfirmAction =
    | { type: 'delete'; item: InventoryItem }
    | { type: 'restore'; item: InventoryItem }
    | null;

  const [activeTab, setActiveTab] = useState<'overview' | 'inventory' | 'rentals' | 'users' | 'history'>('overview');
  const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
  
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
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryMessage, setInventoryMessage] = useState<string | null>(null);
  const [archivedItems, setArchivedItems] = useState<InventoryItem[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<InventoryConfirmAction>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const cancelConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const primaryConfirmButtonRef = useRef<HTMLButtonElement>(null);
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
  const [userFilter, setUserFilter] = useState<'all' | 'admin' | 'customer'>('all');
  const [showArchivedUsersOnly, setShowArchivedUsersOnly] = useState(false);
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
  const [newUserForm, setNewUserForm] = useState<NewUserForm>({
    role: 'Customer',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phoneNumber: ''
  });

  // Notification State
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [selectedRental, setSelectedRental] = useState<PendingReturn | null>(null);
  const [notificationMethod, setNotificationMethod] = useState<'sms' | 'email' | 'both'>('both');

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

  function mapManagedUserToDashboardUser(user: ManagedUser): User {
    return {
      id: user.id,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phone: user.phoneNumber || 'N/A',
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
    return normalized
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Action';
  }

  function formatHistoryDetails(entry: AdminActionEntry) {
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
      parts.push(`targetUserId: ${entry.targetUserId}`);
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

  async function handleArchiveUser(user: User) {
    if (user.status === 'archived') {
      return;
    }

    if (user.role === 'Admin' && user.id === currentUserId) {
      setUsersError('You cannot archive your own admin account.');
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
      ...(newUserForm.role === 'Customer'
        ? {
            firstName: newUserForm.firstName.trim(),
            lastName: newUserForm.lastName.trim(),
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
      (userFilter === 'customer' && user.role === 'Customer');
    const matchesArchiveView = showArchivedUsersOnly
      ? user.status === 'archived'
      : user.status !== 'archived';
    return matchesSearch && matchesRole && matchesArchiveView;
  });

  // Notification Handler
  const handleSendNotification = () => {
    if (!selectedRental) return;

    const methodText = notificationMethod === 'both' 
      ? 'SMS and Email' 
      : notificationMethod === 'sms' 
      ? 'SMS' 
      : 'Email';

    alert(`Return reminder sent to ${selectedRental.customer} via ${methodText}!\n\nMessage: "Dear ${selectedRental.customer}, this is a friendly reminder that your rented gown '${selectedRental.gownName}' is due for return on ${selectedRental.dueDate}. ${selectedRental.daysLate > 0 ? `You currently have a late fee of ₱${(selectedRental.daysLate * 500).toLocaleString()}. ` : ''}Please return it to Hannah Vanessa Boutique at your earliest convenience. Thank you!"`);
    
    setShowNotificationModal(false);
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
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'inventory'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Inventory
          </button>
          <button
            onClick={() => setActiveTab('rentals')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'rentals'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Rentals
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'users'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('history')}
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
              <div className="overflow-x-auto">
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
                    {inventoryView === 'active' && !inventoryLoading && inventory.length === 0 && (
                      <tr><td colSpan={8} className="px-6 py-8 text-center text-[#6B5D4F] text-sm">No items in inventory. Add a gown to get started.</td></tr>
                    )}
                    {inventoryView === 'archive' && !archiveLoading && archivedItems.length === 0 && (
                      <tr><td colSpan={9} className="px-6 py-8 text-center text-[#6B5D4F] text-sm">No archived gowns found.</td></tr>
                    )}
                    {inventoryView === 'active' && inventory.map((item) => (
                      <tr key={item.id} className="hover:bg-[#FAF7F0] transition-colors">
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
                              onClick={() => setEditingItem(item)}
                              className="p-2 hover:bg-[#FAF7F0] rounded-full transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4 text-[#6B5D4F]" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-2 hover:bg-red-50 rounded-full transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {inventoryView === 'archive' && archivedItems.map((item) => (
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
          </div>
        )}

        {activeTab === 'rentals' && (
          <div className="space-y-6">
            {/* Header with Add Button */}
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-light">Rental Management</h2>
            </div>

            {/* Current Rentals */}
            <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
              <h3 className="text-lg font-medium mb-4">Current Inventory Status</h3>
              <div className="space-y-3">
                {inventory.filter(item => item.status === 'rented').map((item) => (
                  <div key={item.id} className="p-4 rounded-lg border border-[#E8DCC8] hover:border-[#D4AF37] transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{item.name}</h4>
                        <p className="text-sm text-[#6B5D4F]">{item.category} • {item.color}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-[#6B5D4F] mb-1">Rental Fee</p>
                        <p className="text-lg font-light">₱{item.price.toLocaleString()}/day</p>
                      </div>
                    </div>
                  </div>
                ))}
                {inventory.filter(item => item.status === 'rented').length === 0 && (
                  <p className="text-center py-8 text-[#6B5D4F]">No current rentals</p>
                )}
              </div>
            </div>

            {/* Pending Returns Section */}
            <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
              <h3 className="text-lg font-medium mb-4">Pending Returns</h3>
              <div className="space-y-3">
                {mockPendingReturns.map((rental) => (
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
                              ₱{(rental.daysLate * 500).toLocaleString()}
                            </p>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            setSelectedRental(rental);
                            setShowNotificationModal(true);
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
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-light">User Management</h2>

              {/* User Management Toolbar */}
              <div className="flex flex-col md:flex-row gap-3 md:items-center">
                <input
                  type="text"
                  placeholder="Search User"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-4 py-2 border border-[#E8DCC8] rounded-lg focus:outline-none focus:border-[#D4AF37] w-full md:w-[380px] lg:w-[460px]"
                />

                <div className="flex gap-2 md:ml-auto shrink-0">
                  {!showArchivedUsersOnly && (
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
                </div>
              </div>

              {showArchivedUsersOnly && (
                <p className="text-sm text-[#6B5D4F]">Showing archived users only.</p>
              )}
            </div>

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
            <div className="grid md:grid-cols-3 gap-4">
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
              {filteredUsers.map((user) => (
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
                          const isSelfAdmin = user.role === 'Admin' && user.id === currentUserId;
                          return (
                        <button
                          onClick={() => handleArchiveUser(user)}
                          disabled={user.status === 'archived' || archivingUserId === user.id || isSelfAdmin}
                          className="px-4 py-2 text-sm bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={isSelfAdmin ? 'You cannot archive your own account' : undefined}
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
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-light">Admin History</h2>
              <button
                onClick={loadAdminHistory}
                className="px-4 py-2 rounded-lg border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors"
              >
                Refresh
              </button>
            </div>

            {adminHistoryError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {adminHistoryError}
              </div>
            )}

            {adminHistoryLoading && (
              <p className="text-center py-8 text-[#6B5D4F]">Loading admin history...</p>
            )}

            {!adminHistoryLoading && !adminHistoryError && adminHistory.length === 0 && (
              <p className="text-center py-8 text-[#6B5D4F]">No admin actions recorded yet.</p>
            )}

            {!adminHistoryLoading && adminHistory.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E8DCC8] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead className="bg-[#FAF7F0]">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Admin</th>
                        <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Action</th>
                        <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Date / Time</th>
                        <th className="px-6 py-4 text-left text-sm text-[#6B5D4F]">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DCC8]">
                      {adminHistory.map((entry) => (
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
                    <p className="text-sm text-[#6B5D4F] mb-2">{selectedUser.id}</p>
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
        {showAddUserModal && (
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
                      onChange={(e) => setNewUserForm((prev) => ({ ...prev, role: e.target.value as 'Admin' | 'Customer' }))}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    >
                      <option value="Customer">Customer</option>
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

                  {newUserForm.role === 'Customer' && (
                    <>
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
                    </>
                  )}

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

        {/* Return Notification Modal */}
        {showNotificationModal && selectedRental && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-2xl font-light">Send Return Reminder</h3>
                <button
                  onClick={() => {
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
                    <p>Due Date: {selectedRental.dueDate}</p>
                    {selectedRental.daysLate > 0 && (
                      <p className="text-red-600 font-medium">
                        {selectedRental.daysLate} {selectedRental.daysLate === 1 ? 'day' : 'days'} late • ₱{(selectedRental.daysLate * 500).toLocaleString()} late fee
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
                    Send Reminder
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}