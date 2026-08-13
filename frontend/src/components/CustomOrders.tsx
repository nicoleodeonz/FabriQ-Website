import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Ruler, ChevronRight, CheckCircle2, Calendar, X, Package, Edit, Users, Eye, Mail, Phone } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { customerAPI } from '../services/customerAPI';
import { buildApiUrl } from '../services/apiConfig';
import { createCustomerActivityEventSource } from '../services/adminRealtime';
import { toast } from 'sonner';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';
import type { CustomerNotificationEntry } from '../services/notificationAPI';

interface CustomOrdersProps {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
    phoneVerified?: boolean;
  };
  token: string;
  selectedOrderId?: string | null;
  selectedOrderNotification?: CustomerNotificationEntry | null;
  selectedOrderTab?: 'existing' | 'history' | null;
  onSelectedOrderHandled?: () => void;
  onSelectedOrderNotificationHandled?: () => void;
  onSelectedOrderTabHandled?: () => void;
}

interface CustomOrder {
  _id?: string;
  id?: string;
  referenceId?: string;
  customerName: string;
  contactNumber?: string;
  email?: string;
  orderType: string;
  status: 'inquiry' | 'design-approval' | 'in-progress' | 'fitting' | 'completed' | 'rejected';
  eventDate?: string;
  preferredColors?: string;
  fabricPreference?: string;
  specialRequests?: string;
  budget?: string;
  branch?: string;
  designImageUrl?: string;
  consultationDate?: string | null;
  consultationTime?: string | null;
  consultationRescheduleReason?: string | null;
  fittingDate?: string | null;
  fittingTime?: string | null;
  fittingRescheduleReason?: string | null;
  rejectionReason?: string | null;
}

function normalizeNotificationText(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function getComparableCustomOrderStatus(status?: string | null) {
  const normalizedStatus = normalizeNotificationText(status);
  return normalizedStatus === 'fitting-scheduled' ? 'fitting' : normalizedStatus;
}

function normalizeCustomOrderNotificationLabel(value?: string | null) {
  return normalizeNotificationText(value).replace(/^bespoke\s+/, '').trim();
}

function labelsMatch(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeCustomOrderNotificationLabel(left);
  const normalizedRight = normalizeCustomOrderNotificationLabel(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft);
}

export function CustomOrders({ user, token, selectedOrderId, selectedOrderNotification, selectedOrderTab, onSelectedOrderHandled, onSelectedOrderNotificationHandled, onSelectedOrderTabHandled }: CustomOrdersProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const defaultCustomerName = useMemo(
    () => `${user.firstName} ${user.lastName}`.trim(),
    [user.firstName, user.lastName]
  );
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'existing' | 'history'>('new');
  const [formData, setFormData] = useState({
    customerName: defaultCustomerName,
    contactNumber: user.phoneNumber || '',
    email: user.email || '',
    orderType: '',
    eventDate: '',
    preferredColors: '',
    fabricPreference: '',
    specialRequests: '',
    budget: '',
    branch: 'Taguig Main',
    designImage: null as File | null,
    designImageUrl: '',
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isMissingPhoneModalOpen, setIsMissingPhoneModalOpen] = useState(false);
  const [isOrderDetailsOpen, setIsOrderDetailsOpen] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<CustomOrder | null>(null);
  const [customOrderModalTab, setCustomOrderModalTab] = useState<'order' | 'notes' | 'customer'>('order');
  const [isScheduleConsultationModalOpen, setIsScheduleConsultationModalOpen] = useState(false);
  const [isConfirmScheduleConsultationOpen, setIsConfirmScheduleConsultationOpen] = useState(false);
  const [selectedScheduleOrder, setSelectedScheduleOrder] = useState<CustomOrder | null>(null);
  const [hadExistingConsultationSchedule, setHadExistingConsultationSchedule] = useState(false);
  const [initialConsultationDate, setInitialConsultationDate] = useState('');
  const [initialConsultationTime, setInitialConsultationTime] = useState('');
  const [consultationDate, setConsultationDate] = useState('');
  const [consultationTime, setConsultationTime] = useState('08:00');
  const [consultationRescheduleReason, setConsultationRescheduleReason] = useState('');
  const [consultationScheduleError, setConsultationScheduleError] = useState<string | null>(null);
  const [isSavingConsultationSchedule, setIsSavingConsultationSchedule] = useState(false);
  const [isScheduleFittingModalOpen, setIsScheduleFittingModalOpen] = useState(false);
  const [isConfirmScheduleFittingOpen, setIsConfirmScheduleFittingOpen] = useState(false);
  const [selectedFittingOrder, setSelectedFittingOrder] = useState<CustomOrder | null>(null);
  const [hadExistingFittingSchedule, setHadExistingFittingSchedule] = useState(false);
  const [initialFittingDate, setInitialFittingDate] = useState('');
  const [initialFittingTime, setInitialFittingTime] = useState('');
  const [fittingDate, setFittingDate] = useState('');
  const [fittingTime, setFittingTime] = useState('08:00');
  const [fittingRescheduleReason, setFittingRescheduleReason] = useState('');
  const [fittingScheduleError, setFittingScheduleError] = useState<string | null>(null);
  const [isSavingFittingSchedule, setIsSavingFittingSchedule] = useState(false);
  const isAnyCustomOrderModalOpen =
    isMissingPhoneModalOpen ||
    isOrderDetailsOpen ||
    isScheduleConsultationModalOpen ||
    isConfirmScheduleConsultationOpen ||
    isScheduleFittingModalOpen ||
    isConfirmScheduleFittingOpen;

  useModalInteractionLock(isAnyCustomOrderModalOpen, modalRef);

  // Fetch orders when the component mounts or when switching to 'existing' tab
  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const data = await customerAPI.getMyCustomOrders(token);
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [token]);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      customerName: prev.customerName || defaultCustomerName,
      contactNumber: prev.contactNumber || user.phoneNumber || '',
      email: prev.email || user.email || '',
    }));
  }, [defaultCustomerName, user.email, user.phoneNumber]);

  useEffect(() => {
    if (!selectedOrderTab) {
      return;
    }

    setActiveTab(selectedOrderTab);
    onSelectedOrderTabHandled?.();
  }, [onSelectedOrderTabHandled, selectedOrderTab]);

  useEffect(() => {
    if (selectedOrderId && activeTab === 'new') {
      setActiveTab('existing');
    }
  }, [activeTab, selectedOrderId]);

  useEffect(() => {
    if (activeTab === 'existing' || activeTab === 'history') {
      void fetchOrders();
    }
  }, [activeTab, fetchOrders]);

  useEffect(() => {
    const eventSource = createCustomerActivityEventSource(token);

    const handleCustomerActivityUpdate = () => {
      void fetchOrders();
    };

    eventSource.addEventListener('customer-activity-update', handleCustomerActivityUpdate);

    return () => {
      eventSource.removeEventListener('customer-activity-update', handleCustomerActivityUpdate);
      eventSource.close();
    };
  }, [fetchOrders, token]);

  useEffect(() => {
    if (!selectedOrderId || orders.length === 0) {
      return;
    }

    const matchedOrder = orders.find((order) => String(order.id || order._id || '') === selectedOrderId);
    if (!matchedOrder) {
      return;
    }

    const isHistorical = matchedOrder.status === 'completed' || matchedOrder.status === 'rejected';
    setActiveTab(isHistorical ? 'history' : 'existing');
    setSelectedOrderDetails(matchedOrder);
    setIsOrderDetailsOpen(true);
    onSelectedOrderHandled?.();
  }, [onSelectedOrderHandled, orders, selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderNotification || selectedOrderId || orders.length === 0) {
      return;
    }

    const notificationLabel = normalizeCustomOrderNotificationLabel(selectedOrderNotification.itemLabel);
    const notificationStatus = getComparableCustomOrderStatus(selectedOrderNotification.status);
    const notificationDate = String(selectedOrderNotification.date || '').trim();
    const shouldMatchNotificationDate = normalizeNotificationText(selectedOrderNotification.dateType) === 'scheduled date';
    const notificationLocation = normalizeNotificationText(selectedOrderNotification.location);

    const matchedOrder = orders.find((order) => {
      const orderDates = [order.eventDate, order.consultationDate, order.fittingDate].filter(Boolean);

      return labelsMatch(order.orderType, notificationLabel)
        && getComparableCustomOrderStatus(order.status) === notificationStatus
        && (!shouldMatchNotificationDate || !notificationDate || orderDates.includes(notificationDate))
        && (!notificationLocation || normalizeNotificationText(order.branch) === notificationLocation);
    });

    if (!matchedOrder) {
      return;
    }

    const isHistorical = matchedOrder.status === 'completed' || matchedOrder.status === 'rejected';
    setActiveTab(isHistorical ? 'history' : 'existing');
    setSelectedOrderDetails(matchedOrder);
    setIsOrderDetailsOpen(true);
    onSelectedOrderNotificationHandled?.();
  }, [onSelectedOrderNotificationHandled, orders, selectedOrderId, selectedOrderNotification]);

  const hasPhoneNumber = (value: string) => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10;
  };

  const missingCustomOrderFields = useMemo(() => {
    const missing: string[] = [];

    if (!formData.orderType) missing.push('order type');
    if (!String(formData.branch || '').trim()) missing.push('branch');
    if (!hasPhoneNumber(formData.contactNumber)) missing.push('verified phone number');
    if (!formData.eventDate) missing.push('event date');
    if (!String(formData.preferredColors || '').trim()) missing.push('preferred colors');
    if (!formData.budget) missing.push('budget range');
    if (!String(formData.fabricPreference || '').trim()) missing.push('fabric preference');

    return missing;
  }, [formData.branch, formData.contactNumber, formData.orderType, formData.eventDate, formData.preferredColors, formData.budget, formData.fabricPreference]);

  const isCustomOrderFormComplete = missingCustomOrderFields.length === 0;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setFormData((prev) => ({ ...prev, designImage: file, designImageUrl: URL.createObjectURL(file) }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.customerName.trim()) {
      return;
    }
    if (!hasPhoneNumber(formData.contactNumber)) {
      setIsMissingPhoneModalOpen(true);
      return;
    }
    if (!formData.email.trim()) {
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return;
    }
    if (!isCustomOrderFormComplete) {
      return;
    }

    let designImageUrl = '';
    if (formData.designImage) {
      setUploadingImage(true);
      const imageData = new FormData();
      imageData.append('image', formData.designImage);
      try {
        const res = await fetch(buildApiUrl('/custom-orders/upload-image'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: imageData,
        });
        if (!res.ok) throw new Error('Image upload failed');
        const data = await res.json();
        designImageUrl = data.url;
      } catch (err) {
        toast.error('Failed to upload design inspiration image.');
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }

    try {
      await customerAPI.createCustomOrder(token, {
        orderType: formData.orderType,
        eventDate: formData.eventDate,
        preferredColors: formData.preferredColors,
        fabricPreference: formData.fabricPreference,
        specialRequests: formData.specialRequests,
        budget: formData.budget,
        branch: formData.branch,
        designImageUrl,
      });
      toast.success('Custom order inquiry submitted successfully! Our team will contact you within 24-48 hours.');
      setFormData({
        customerName: defaultCustomerName,
        contactNumber: user.phoneNumber || '',
        email: user.email || '',
        orderType: '',
        eventDate: '',
        preferredColors: '',
        fabricPreference: '',
        specialRequests: '',
        budget: '',
        branch: 'Taguig Main',
        designImage: null,
        designImageUrl: '',
      });
      setActiveTab('existing');
      // Refresh orders after submitting
      fetchOrders();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit custom order.');
    }
  };

  const statusSteps = [
    { key: 'inquiry', label: 'Inquiry' },
    { key: 'design-approval', label: 'Design Approval' },
    { key: 'in-progress', label: 'In Progress' },
    { key: 'fitting', label: 'Fitting' },
    { key: 'completed', label: 'Completed' }
  ];

  const consultationTimeOptions = useMemo(() => ([
    { value: '08:00', label: '8:00 AM' },
    { value: '09:00', label: '9:00 AM' },
    { value: '10:00', label: '10:00 AM' },
    { value: '11:00', label: '11:00 AM' },
    { value: '12:00', label: '12:00 PM' },
    { value: '13:00', label: '1:00 PM' },
    { value: '14:00', label: '2:00 PM' },
    { value: '15:00', label: '3:00 PM' },
    { value: '16:00', label: '4:00 PM' },
    { value: '17:00', label: '5:00 PM' },
  ]), []);

  const getTomorrowDateValue = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  };

  const getStatusIndex = (status: string) => {
    return statusSteps.findIndex(step => step.key === status);
  };

  const currentOrders = useMemo(
    () => orders.filter((order) => order.status !== 'completed' && order.status !== 'rejected'),
    [orders]
  );

  const orderHistory = useMemo(
    () => orders.filter((order) => order.status === 'completed' || order.status === 'rejected'),
    [orders]
  );

  const getStatusLabel = (status: CustomOrder['status']) => {
    if (status === 'design-approval') return 'Design Approval';
    if (status === 'in-progress') return 'In Progress';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusBadgeClass = (status: CustomOrder['status']) => {
    if (status === 'inquiry') return 'bg-amber-100 text-amber-800';
    if (status === 'design-approval') return 'bg-violet-100 text-violet-800';
    if (status === 'in-progress') return 'bg-blue-100 text-blue-800';
    if (status === 'fitting') return 'bg-cyan-100 text-cyan-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-green-100 text-green-800';
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

  const getConsultationDisplay = (order: CustomOrder) => {
    if (!order.consultationDate) {
      return 'Not scheduled yet';
    }

    return `${order.consultationDate}${order.consultationTime ? ` at ${order.consultationTime}` : ''}`;
  };

  const getFittingDisplay = (order: CustomOrder) => {
    if (!order.fittingDate) {
      return 'Not scheduled yet';
    }

    return `${order.fittingDate}${order.fittingTime ? ` at ${order.fittingTime}` : ''}`;
  };

  const openOrderDetails = (order: CustomOrder) => {
    setSelectedOrderDetails(order);
    setIsOrderDetailsOpen(true);
  };

  const openScheduleConsultationModal = (order: CustomOrder) => {
    setSelectedScheduleOrder(order);
    setHadExistingConsultationSchedule(Boolean(order.consultationDate || order.consultationTime));
    setInitialConsultationDate(order.consultationDate || '');
    setInitialConsultationTime(order.consultationTime || '');
    setConsultationDate(order.consultationDate || '');
    setConsultationTime(order.consultationTime || '08:00');
    setConsultationRescheduleReason('');
    setConsultationScheduleError(null);
    setIsScheduleConsultationModalOpen(true);
  };

  const openScheduleFittingModal = (order: CustomOrder) => {
    setSelectedFittingOrder(order);
    setHadExistingFittingSchedule(Boolean(order.fittingDate || order.fittingTime));
    setInitialFittingDate(order.fittingDate || '');
    setInitialFittingTime(order.fittingTime || '');
    setFittingDate(order.fittingDate || '');
    setFittingTime(order.fittingTime || '08:00');
    setFittingRescheduleReason('');
    setFittingScheduleError(null);
    setIsScheduleFittingModalOpen(true);
  };

  const closeScheduleConsultationModal = () => {
    if (isSavingConsultationSchedule) return;
    setIsScheduleConsultationModalOpen(false);
    setIsConfirmScheduleConsultationOpen(false);
    setSelectedScheduleOrder(null);
    setHadExistingConsultationSchedule(false);
    setInitialConsultationDate('');
    setInitialConsultationTime('');
    setConsultationDate('');
    setConsultationTime('08:00');
    setConsultationRescheduleReason('');
    setConsultationScheduleError(null);
  };

  const closeScheduleFittingModal = () => {
    if (isSavingFittingSchedule) return;
    setIsScheduleFittingModalOpen(false);
    setIsConfirmScheduleFittingOpen(false);
    setSelectedFittingOrder(null);
    setHadExistingFittingSchedule(false);
    setInitialFittingDate('');
    setInitialFittingTime('');
    setFittingDate('');
    setFittingTime('08:00');
    setFittingRescheduleReason('');
    setFittingScheduleError(null);
  };

  const requestSaveConsultationSchedule = () => {
    const hasExistingSchedule = hadExistingConsultationSchedule;
    const isScheduleChanging =
      initialConsultationDate !== consultationDate ||
      initialConsultationTime !== consultationTime;

    if (!consultationDate) {
      setConsultationScheduleError('Please choose a consultation date.');
      return;
    }

    if (!consultationTime) {
      setConsultationScheduleError('Please choose a consultation time.');
      return;
    }

    if (hasExistingSchedule && !isScheduleChanging) {
      setConsultationScheduleError('Please choose a different date or time for rescheduling.');
      return;
    }

    if (hasExistingSchedule && isScheduleChanging && !consultationRescheduleReason.trim()) {
      setConsultationScheduleError('Please provide a reason for rescheduling.');
      return;
    }

    setConsultationScheduleError(null);
    setIsConfirmScheduleConsultationOpen(true);
  };

  const handleSaveConsultationSchedule = async () => {
    if (!selectedScheduleOrder) return;

    const orderId = selectedScheduleOrder.id || selectedScheduleOrder._id;
    if (!orderId) {
      setConsultationScheduleError('Unable to find this custom order.');
      return;
    }

    const isScheduleChanging =
      initialConsultationDate !== consultationDate ||
      initialConsultationTime !== consultationTime;

    if (hadExistingConsultationSchedule && !isScheduleChanging) {
      setIsConfirmScheduleConsultationOpen(false);
      setConsultationScheduleError('Please choose a different date or time for rescheduling.');
      return;
    }

    if (hadExistingConsultationSchedule && isScheduleChanging && !consultationRescheduleReason.trim()) {
      setIsConfirmScheduleConsultationOpen(false);
      setConsultationScheduleError('Please provide a reason for rescheduling.');
      return;
    }

    setIsSavingConsultationSchedule(true);
    setIsConfirmScheduleConsultationOpen(false);
    setConsultationScheduleError(null);
    try {
      const response = await customerAPI.updateCustomOrderConsultationSchedule(token, orderId, {
        consultationDate,
        consultationTime,
        consultationRescheduleReason: consultationRescheduleReason.trim() || undefined,
      });
      const updatedOrder = response?.order as CustomOrder | undefined;
      if (updatedOrder) {
        setOrders((prev) => prev.map((order) => {
          const currentId = order.id || order._id;
          return currentId === orderId ? updatedOrder : order;
        }));
        if (selectedOrderDetails && (selectedOrderDetails.id || selectedOrderDetails._id) === orderId) {
          setSelectedOrderDetails(updatedOrder);
        }
      } else {
        await fetchOrders();
      }
      toast.success('Design consultation schedule saved.');
      closeScheduleConsultationModal();
    } catch (error: any) {
      setConsultationScheduleError(error?.message || 'Failed to save consultation schedule.');
    } finally {
      setIsSavingConsultationSchedule(false);
    }
  };

  const requestSaveFittingSchedule = () => {
    const hasExistingSchedule = hadExistingFittingSchedule;
    const isScheduleChanging =
      initialFittingDate !== fittingDate ||
      initialFittingTime !== fittingTime;

    if (!fittingDate) {
      setFittingScheduleError('Please choose a fitting date.');
      return;
    }

    if (!fittingTime) {
      setFittingScheduleError('Please choose a fitting time.');
      return;
    }

    if (hasExistingSchedule && !isScheduleChanging) {
      setFittingScheduleError('Please choose a different date or time for rescheduling.');
      return;
    }

    if (hasExistingSchedule && isScheduleChanging && !fittingRescheduleReason.trim()) {
      setFittingScheduleError('Please provide a reason for rescheduling.');
      return;
    }

    setFittingScheduleError(null);
    setIsConfirmScheduleFittingOpen(true);
  };

  const handleSaveFittingSchedule = async () => {
    if (!selectedFittingOrder) return;

    const orderId = selectedFittingOrder.id || selectedFittingOrder._id;
    if (!orderId) {
      setFittingScheduleError('Unable to find this custom order.');
      return;
    }

    const isScheduleChanging =
      initialFittingDate !== fittingDate ||
      initialFittingTime !== fittingTime;

    if (hadExistingFittingSchedule && !isScheduleChanging) {
      setIsConfirmScheduleFittingOpen(false);
      setFittingScheduleError('Please choose a different date or time for rescheduling.');
      return;
    }

    if (hadExistingFittingSchedule && isScheduleChanging && !fittingRescheduleReason.trim()) {
      setIsConfirmScheduleFittingOpen(false);
      setFittingScheduleError('Please provide a reason for rescheduling.');
      return;
    }

    setIsSavingFittingSchedule(true);
    setIsConfirmScheduleFittingOpen(false);
    setFittingScheduleError(null);
    try {
      const response = await customerAPI.updateCustomOrderFittingSchedule(token, orderId, {
        fittingDate,
        fittingTime,
        fittingRescheduleReason: fittingRescheduleReason.trim() || undefined,
      });
      const updatedOrder = response?.order as CustomOrder | undefined;
      if (updatedOrder) {
        setOrders((prev) => prev.map((order) => {
          const currentId = order.id || order._id;
          return currentId === orderId ? updatedOrder : order;
        }));
        if (selectedOrderDetails && (selectedOrderDetails.id || selectedOrderDetails._id) === orderId) {
          setSelectedOrderDetails(updatedOrder);
        }
      } else {
        await fetchOrders();
      }
      toast.success('Fitting appointment schedule saved.');
      closeScheduleFittingModal();
    } catch (error: any) {
      setFittingScheduleError(error?.message || 'Failed to save fitting schedule.');
    } finally {
      setIsSavingFittingSchedule(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 bg-[#FAF7F0]">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-light mb-2">Custom Orders</h1>
          <p className="text-[#6B5D4F]">Create bespoke pieces tailored to your vision</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-[#E8DCC8]">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'new'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            New Order
          </button>
          <button
            onClick={() => setActiveTab('existing')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'existing'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            My Orders
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Order History
          </button>
        </div>

        {/* New Order Form */}
        {activeTab === 'new' && (
          <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
            <h2 className="text-2xl font-light mb-6">Start Your Custom Journey</h2>
            
            <div className="space-y-6">
              {/* Customer Information */}
              <div>
                <h3 className="text-lg font-medium mb-4">Contact Information</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.customerName}
                      readOnly
                      aria-readonly="true"
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] bg-[#F7F1E8] text-[#6B5D4F] cursor-not-allowed"
                      placeholder="Full name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Contact Number *</label>
                    <input
                      type="tel"
                      required
                      value={formData.contactNumber}
                      readOnly
                      aria-readonly="true"
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] bg-[#F7F1E8] text-[#6B5D4F] cursor-not-allowed"
                      placeholder="Please verify your contact number first"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      readOnly
                      aria-readonly="true"
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] bg-[#F7F1E8] text-[#6B5D4F] cursor-not-allowed"
                      placeholder="Email address"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Preferred Branch *</label>
                    <select
                      required
                      value={formData.branch}
                      onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    >
                      <option value="Taguig Main">Taguig Main - Cadena de Amor</option>
                      <option value="BGC Branch">BGC Branch</option>
                      <option value="Makati Branch">Makati Branch</option>
                      <option value="Quezon City">Quezon City</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Order Details */}
              <div>
                <h3 className="text-lg font-medium mb-4">Order Details</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Order Type *</label>
                    <select
                      required
                      value={formData.orderType}
                      onChange={(e) => setFormData({ ...formData, orderType: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    >
                      <option value="">Select type</option>
                      <option value="Wedding Gown">Wedding Gown</option>
                      <option value="Evening Dress">Evening Dress</option>
                      <option value="Cocktail Dress">Cocktail Dress</option>
                      <option value="Ball Gown">Ball Gown</option>
                      <option value="Formal Suit">Formal Suit</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Event Date *</label>
                    <input
                      type="date"
                      required
                      value={formData.eventDate}
                      min={(() => {
                        const today = new Date();
                        today.setDate(today.getDate() + 28);
                        return today.toISOString().split('T')[0];
                      })()}
                      onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Preferred Colors *</label>
                    <input
                      type="text"
                      required
                      value={formData.preferredColors}
                      onChange={(e) => setFormData({ ...formData, preferredColors: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                      placeholder="e.g., Ivory, Gold accents"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Budget Range *</label>
                    <select
                      required
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    >
                      <option value="">Select range</option>
                      <option value="25000-35000">₱25,000 - ₱35,000</option>
                      <option value="35000-55000">₱35,000 - ₱55,000</option>
                      <option value="55000-80000">₱55,000 - ₱80,000</option>
                      <option value="80000+">₱80,000+</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6">
                  <label className="block text-sm text-[#6B5D4F] mb-2">Fabric Preference *</label>
                  <input
                    type="text"
                    required
                    value={formData.fabricPreference}
                    onChange={(e) => setFormData({ ...formData, fabricPreference: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    placeholder="e.g., Silk, Lace, Satin"
                  />
                </div>

                <div className="mt-6">
                  <label className="block text-sm text-[#6B5D4F] mb-2">Special Requests & Design Ideas</label>
                  <textarea
                    value={formData.specialRequests}
                    onChange={(e) => setFormData({ ...formData, specialRequests: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors min-h-[120px]"
                    placeholder="Describe your vision, inspirations, or specific design elements you'd like..."
                  />
                </div>
              </div>

              {/* Design Inspiration Upload */}
              <div>
                <h3 className="text-lg font-medium mb-4">Design Inspiration</h3>
                <label className="block border-2 border-dashed border-[#E8DCC8] rounded-lg p-8 text-center hover:border-[#D4AF37] transition-colors cursor-pointer">
                  <Upload className="w-12 h-12 text-[#6B5D4F] mx-auto mb-4" />
                  <p className="text-[#6B5D4F] mb-2">Upload inspiration images</p>
                  <p className="text-sm text-[#6B5D4F]">PNG, JPG up to 10MB</p>
                  <input
                    type="file"
                    accept="image/png, image/jpeg"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                  {formData.designImageUrl && (
                    <img
                      src={formData.designImageUrl}
                      alt="Design inspiration preview"
                      className="mx-auto mt-4 max-h-40 rounded-lg border"
                    />
                  )}
                  {uploadingImage && <p className="text-xs text-[#D4AF37] mt-2">Uploading image...</p>}
                </label>
              </div>

              {!isCustomOrderFormComplete && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status" aria-live="polite">
                  Complete the required fields before submitting: {missingCustomOrderFields.join(', ')}.
                </div>
              )}

              <button
                type="submit"
                disabled={!isCustomOrderFormComplete || uploadingImage}
                className="w-full py-4 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:bg-[#B8AEA2] disabled:text-[#F7F1E7]"
              >
                {uploadingImage ? 'Uploading...' : 'Submit Custom Order Inquiry'}
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        )}

        {isMissingPhoneModalOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Phone number required"
            onClick={() => setIsMissingPhoneModalOpen(false)}
          >
            <div
              ref={modalRef}
              tabIndex={-1}
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Phone Number Required</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Please add your phone number first in your profile settings.
              </p>

              <button
                type="button"
                onClick={() => setIsMissingPhoneModalOpen(false)}
                className="w-full py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {/* Existing Orders */}
        {activeTab === 'existing' && (
          <div className="space-y-6">
                {loadingOrders && (
                  <div className="text-center py-10 bg-white rounded-2xl border border-[#E8DCC8] text-[#6B5D4F]" role="status" aria-live="polite">
                    Loading your custom orders...
                  </div>
                )}
                {!loadingOrders && currentOrders.map((order) => {
                  const currentStatusIndex = getStatusIndex(order.status);
                  const canScheduleConsultation = order.status === 'design-approval';
                  const canScheduleFitting = order.status === 'fitting';
                  const consultationSummary = order.consultationDate && order.consultationTime
                    ? `${order.consultationDate} at ${order.consultationTime}`
                    : null;
                  const fittingSummary = order.fittingDate && order.fittingTime
                    ? `${order.fittingDate} at ${order.fittingTime}`
                    : null;
                  return (
                    <div
                      key={order._id || order.id}
                      className="bg-white rounded-2xl border border-[#E8DCC8] p-6 hover:border-[#D4AF37] transition-colors cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => openOrderDetails(order)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openOrderDetails(order);
                        }
                      }}
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-medium">{order.orderType}</h3>
                            <span className="text-sm text-[#6B5D4F]">#{order.referenceId || order._id || order.id}</span>
                          </div>
                          <p className="text-[#6B5D4F] mb-1">{order.customerName}</p>
                          <p className="text-sm text-[#6B5D4F]">
                            {order.eventDate ? `Event: ${order.eventDate}` : ''}
                          </p>
                          {consultationSummary && order.status !== 'fitting' && (
                            <p
                              className="text-sm mt-1 px-3 py-1 rounded-full font-semibold inline-block shadow-sm border border-[#D4AF37] bg-[#FFFBEA] text-[#B89C2C] animate-pulse"
                              style={{ boxShadow: '0 0 0 2px #D4AF3733' }}
                              title="Your design consultation is scheduled!"
                            >
                              <span className="mr-1">Design Consultation:</span>
                              <span className="font-bold">{consultationSummary}</span>
                            </p>
                          )}
                          {fittingSummary && (
                            <p
                              className="text-sm mt-1 px-3 py-1 rounded-full font-semibold inline-block shadow-sm border border-[#67C6D8] bg-[#ECFBFF] text-[#0E7490] animate-pulse"
                              style={{ boxShadow: '0 0 0 2px #67C6D833' }}
                              title="Your fitting appointment is scheduled!"
                            >
                              <span className="mr-1">Fitting Appointment:</span>
                              <span className="font-bold">{fittingSummary}</span>
                            </p>
                          )}
                        </div>
                        {canScheduleConsultation && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openScheduleConsultationModal(order);
                            }}
                            className={
                              `self-start shrink-0 rounded-full px-4 py-2 text-sm font-bold border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:ring-offset-2 ` +
                              (consultationSummary
                                ? 'bg-[#FFFBEA] border-[#D4AF37] text-[#B89C2C] shadow-[0_0_0_3px_#D4AF3740,0_2px_8px_#D4AF3720] animate-pulse'
                                : 'bg-[#D4AF37] border-[#D4AF37] text-white shadow-[0_0_0_3px_#D4AF3740,0_2px_8px_#D4AF3720] animate-pulse')
                            }
                            style={{ boxShadow: '0 0 0 3px #D4AF3740, 0 2px 8px #D4AF3720' }}
                          >
                            {consultationSummary ? 'Reschedule Consultation' : 'Set Consultation'}
                          </button>
                        )}
                        {canScheduleFitting && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openScheduleFittingModal(order);
                            }}
                            className={
                              `self-start shrink-0 rounded-full px-4 py-2 text-sm font-bold border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:ring-offset-2 ` +
                              (fittingSummary
                                ? 'bg-[#FFFBEA] border-[#D4AF37] text-[#B89C2C] shadow-[0_0_0_3px_#D4AF3740,0_2px_8px_#D4AF3720] animate-pulse'
                                : 'bg-[#D4AF37] border-[#D4AF37] text-white shadow-[0_0_0_3px_#D4AF3740,0_2px_8px_#D4AF3720] animate-pulse')
                            }
                            style={{ boxShadow: '0 0 0 3px #D4AF3740, 0 2px 8px #D4AF3720' }}
                          >
                            {fittingSummary ? 'Reschedule Fitting Appointment' : 'Schedule Fitting Appointment'}
                          </button>
                        )}
                      </div>
                      {/* Progress Steps */}
                      <div className="relative">
                        <div className="flex justify-between mb-2">
                          {statusSteps.map((step, index) => (
                            <div key={step.key} className="flex-1 relative">
                              <div className="flex flex-col items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 transition-colors ${
                                  index <= currentStatusIndex
                                    ? 'bg-[#D4AF37] text-white'
                                    : 'bg-[#E8DCC8] text-[#6B5D4F]'
                                }`}>
                                  {index < currentStatusIndex ? (
                                    <CheckCircle2 className="w-5 h-5" />
                                  ) : (
                                    <span className="text-xs">{index + 1}</span>
                                  )}
                                </div>
                                <span className={`text-xs text-center ${
                                  index <= currentStatusIndex ? 'font-medium' : 'text-[#6B5D4F]'
                                }`}>
                                  {step.label}
                                </span>
                              </div>
                              {index < statusSteps.length - 1 && (
                                <div className={`absolute top-4 left-1/2 w-full h-0.5 -z-10 ${
                                  index < currentStatusIndex ? 'bg-[#D4AF37]' : 'bg-[#E8DCC8]'
                                }`} />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!loadingOrders && currentOrders.length === 0 && (
                  <div className="text-center py-16 bg-white rounded-2xl border border-[#E8DCC8]">
                    <Ruler className="w-12 h-12 text-[#E8DCC8] mx-auto mb-4" />
                    <h3 className="text-xl mb-2">No custom orders yet</h3>
                    <p className="text-[#6B5D4F] mb-6">Start your bespoke journey with us</p>
                    <button
                      onClick={() => setActiveTab('new')}
                      className="px-6 py-3 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors"
                    >
                      Create Custom Order
                    </button>
                  </div>
                )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4 overflow-hidden">
            {loadingOrders && (
              <div className="text-center py-10 bg-white rounded-2xl border border-[#E8DCC8] text-[#6B5D4F]" role="status" aria-live="polite">
                Loading your order history...
              </div>
            )}

            {!loadingOrders && orderHistory.map((order) => (
              <div
                key={order._id || order.id}
                className="bg-white rounded-2xl border border-[#E8DCC8] p-6 hover:border-[#D4AF37] transition-colors"
                role="button"
                tabIndex={0}
                onClick={() => openOrderDetails(order)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openOrderDetails(order);
                  }
                }}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-xl font-medium text-black">{order.orderType}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        order.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-[#6B5D4F]">
                        <Calendar className="w-4 h-4" />
                        <span>{order.eventDate ? `Event: ${order.eventDate}` : 'Event date not set'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#6B5D4F]">
                        <span className="font-medium">Branch:</span>
                        <span>{order.branch || 'Taguig Main'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#6B5D4F]">
                        <span className="font-medium">Reference ID:</span>
                        <span>{order.referenceId || order._id || order.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-[#6B5D4F]">Customer</div>
                    <div className="text-base font-medium text-black">{order.customerName}</div>
                  </div>
                </div>
              </div>
            ))}

            {!loadingOrders && orderHistory.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-[#E8DCC8]">
                <Calendar className="w-12 h-12 text-[#E8DCC8] mx-auto mb-4" />
                <h3 className="text-xl text-black mb-2">No order history yet</h3>
                <p className="text-[#6B5D4F] mb-6">Completed and rejected custom orders will appear here.</p>
              </div>
            )}
          </div>
        )}

        {isOrderDetailsOpen && selectedOrderDetails && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsOrderDetailsOpen(false)}>
            <div
              className="bg-white rounded-3xl w-full max-w-4xl flex flex-col overflow-hidden shadow-2xl"
              style={{ height: '78vh' }}
              onClick={(e) => e.stopPropagation()}
              ref={modalRef}
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
                    className={getStatusBadgeClass(selectedOrderDetails.status)}
                  >
                    {getStatusLabel(selectedOrderDetails.status)}
                  </span>
                </div>
                <button
                  onClick={() => setIsOrderDetailsOpen(false)}
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
                            <p className="text-2xl font-semibold text-[#3D2B1F]">{selectedOrderDetails.orderType || 'Custom Order'}</p>
                            <div className="h-1 w-12 bg-[#D4AF37] mt-2 rounded-full"></div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-y-6 gap-x-10">
                            <div>
                              <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Event Date</p>
                              <p className="font-semibold text-[#3D2B1F] text-base">{selectedOrderDetails.eventDate || 'Not set'}</p>
                            </div>
                            <div>
                              <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Branch</p>
                              <p className="font-semibold text-[#3D2B1F] text-base">{selectedOrderDetails.branch || 'No branch selected'}</p>
                            </div>
                            <div>
                              <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Budget</p>
                              <p className="font-semibold text-[#3D2B1F] text-base">{formatCustomOrderBudget(selectedOrderDetails.budget)}</p>
                            </div>
                            <div>
                              <p className="text-[#9C8B7A] text-xs font-bold uppercase tracking-wider mb-1.5">Reference ID</p>
                              <p className="font-medium text-[#3D2B1F] font-mono text-base">{selectedOrderDetails.referenceId || selectedOrderDetails.id || selectedOrderDetails._id || 'N/A'}</p>
                            </div>
                          </div>

                          <div className="mt-8 space-y-3 pt-6 border-t border-[#E8DCC8]/30">
                            <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl border border-[#E8DCC8]/30">
                              <span className="text-[#6B5D4F] text-sm font-medium">Design Consultation</span>
                              <span className={`text-xs font-bold px-3 py-1 rounded-full ${(selectedOrderDetails.consultationDate && selectedOrderDetails.consultationTime) ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-[#FAF7F0] text-[#9C8B7A] border border-[#E8DCC8]/50'}`}>
                                {selectedOrderDetails.consultationDate
                                  ? `${selectedOrderDetails.consultationDate}${selectedOrderDetails.consultationTime ? ` at ${(selectedOrderDetails as any).consultationTime || ''}` : ''}`
                                  : 'Not scheduled yet'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl border border-[#E8DCC8]/30">
                              <span className="text-[#6B5D4F] text-sm font-medium">Fitting Appointment</span>
                              <span className={`text-xs font-bold px-3 py-1 rounded-full ${(selectedOrderDetails.fittingDate && selectedOrderDetails.fittingTime) ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-[#FAF7F0] text-[#9C8B7A] border border-[#E8DCC8]/50'}`}>
                                {selectedOrderDetails.fittingDate
                                  ? `${selectedOrderDetails.fittingDate}${selectedOrderDetails.fittingTime ? ` at ${(selectedOrderDetails as any).fittingTime || ''}` : ''}`
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
                                {selectedOrderDetails.preferredColors || 'None provided'}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#9C8B7A] uppercase tracking-wider mb-2">Fabric Preference</p>
                              <div className="bg-white p-3 rounded-xl border border-[#E8DCC8]/30 text-sm text-[#3D2B1F] font-medium min-h-[40px] flex items-center">
                                {selectedOrderDetails.fabricPreference || 'None provided'}
                              </div>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#9C8B7A] uppercase tracking-wider mb-2">Special Requests</p>
                            <div className="bg-white p-4 rounded-xl border border-[#E8DCC8]/30 text-sm text-[#3D2B1F] font-medium min-h-[80px] leading-relaxed">
                              {selectedOrderDetails.specialRequests || 'No special requests provided'}
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
                              {selectedOrderDetails.customerName.charAt(0)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '20px', fontWeight: '700', color: '#3D2B1F', marginBottom: '8px' }}>
                                {selectedOrderDetails.customerName}
                              </p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6B5D4F' }}>
                                  <Mail style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                                  <span style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {selectedOrderDetails.email || 'No email provided'}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6B5D4F' }}>
                                  <Phone style={{ width: '16px', height: '16px', opacity: 0.6 }} />
                                  <span style={{ fontSize: '14px' }}>
                                    {selectedOrderDetails.contactNumber || 'No phone provided'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* Status Specific Messages (Show regardless of tab if applicable) */}
                    {selectedOrderDetails.status === 'rejected' && selectedOrderDetails.rejectionReason && (
                      <div className="space-y-3 pt-2">
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                          <p className="text-[10px] font-bold uppercase text-red-600 mb-1">Reason for Rejection</p>
                          <p className="text-sm text-red-700 whitespace-pre-wrap">{selectedOrderDetails.rejectionReason}</p>
                        </div>
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

                    {selectedOrderDetails.designImageUrl ? (
                      <div className="w-full">
                        <div className="w-full rounded-2xl border-2 border-[#FAF7F0] shadow-lg overflow-hidden bg-white aspect-[3/4]">
                          <ImageWithFallback
                            src={selectedOrderDetails.designImageUrl}
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
                  onClick={() => setIsOrderDetailsOpen(false)}
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
                  {selectedOrderDetails.status === 'design-approval' && (
                    <button
                      onClick={() => {
                        openScheduleConsultationModal(selectedOrderDetails);
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
                      Schedule Consultation
                    </button>
                  )}
                  {selectedOrderDetails.status === 'fitting' && (
                    <button
                      onClick={() => {
                        openScheduleFittingModal(selectedOrderDetails);
                      }}
                      style={{
                        padding: '14px 48px',
                        borderRadius: '18px',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        transition: 'all 0.3s',
                        backgroundColor: '#1a1a1a',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#D4AF37';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(212, 175, 55, 0.4)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#1a1a1a';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.15)';
                      }}
                    >
                      Schedule Fitting
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isScheduleConsultationModalOpen && selectedScheduleOrder && !isConfirmScheduleConsultationOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Schedule design consultation"
            onClick={closeScheduleConsultationModal}
          >
            <div
              ref={modalRef}
              tabIndex={-1}
              className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-2xl font-light text-black">Schedule Design Consultation</h3>
                  <p className="text-sm text-[#6B5D4F] mt-1">
                    Choose when you will visit {selectedScheduleOrder.branch || 'the store'} for your design consultation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeScheduleConsultationModal}
                  className="p-2 rounded-lg hover:bg-[#FAF7F0] transition-colors disabled:opacity-50"
                  disabled={isSavingConsultationSchedule}
                  aria-label="Close consultation schedule modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 space-y-2 text-sm mb-6">
                <p className="font-medium text-black">{selectedScheduleOrder.orderType}</p>
                <p className="text-[#6B5D4F]">Reference ID: {selectedScheduleOrder.referenceId || selectedScheduleOrder._id || selectedScheduleOrder.id}</p>
                <p className="text-[#6B5D4F]">Branch: {selectedScheduleOrder.branch || 'Taguig Main'}</p>
              </div>

              <div className="space-y-4">
                {hadExistingConsultationSchedule && (
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Reason for Rescheduling *</label>
                    <textarea
                      value={consultationRescheduleReason}
                      onChange={(e) => setConsultationRescheduleReason(e.target.value)}
                      rows={3}
                      placeholder="Tell us why you need to reschedule your consultation"
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors resize-none"
                      disabled={isSavingConsultationSchedule}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Consultation Date</label>
                  <input
                    type="date"
                    value={consultationDate}
                    min={getTomorrowDateValue()}
                    onChange={(e) => setConsultationDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    disabled={isSavingConsultationSchedule}
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Consultation Time</label>
                  <select
                    value={consultationTime}
                    onChange={(e) => setConsultationTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    disabled={isSavingConsultationSchedule}
                  >
                    {consultationTimeOptions.map((timeOption) => (
                      <option key={timeOption.value} value={timeOption.value}>
                        {timeOption.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {consultationScheduleError && (
                <p className="mt-4 text-sm text-red-600">{consultationScheduleError}</p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={closeScheduleConsultationModal}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                  disabled={isSavingConsultationSchedule}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={requestSaveConsultationSchedule}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#1a1a1a] text-white rounded-xl hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-colors font-semibold disabled:opacity-50"
                  disabled={isSavingConsultationSchedule}
                >
                  {isSavingConsultationSchedule ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isConfirmScheduleConsultationOpen && selectedScheduleOrder && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm save consultation schedule"
            onClick={() => {
              if (isSavingConsultationSchedule) return;
              setIsConfirmScheduleConsultationOpen(false);
            }}
          >
            <div
              ref={modalRef}
              tabIndex={-1}
              className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-2xl font-light text-black">Confirm Save Schedule</h3>
                  <p className="text-sm text-[#6B5D4F] mt-1">
                    Review the consultation details before saving this schedule.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfirmScheduleConsultationOpen(false)}
                  className="p-2 rounded-lg hover:bg-[#FAF7F0] transition-colors disabled:opacity-50"
                  disabled={isSavingConsultationSchedule}
                  aria-label="Close save schedule confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 space-y-3 text-sm mb-6">
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Order</span>
                  <span className="text-right font-medium text-black">{selectedScheduleOrder.orderType}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Branch</span>
                  <span className="text-right font-medium text-black">{selectedScheduleOrder.branch || 'Taguig Main'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Date</span>
                  <span className="text-right font-medium text-black">{consultationDate}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Time</span>
                  <span className="text-right font-medium text-black">
                    {consultationTimeOptions.find((option) => option.value === consultationTime)?.label || consultationTime}
                  </span>
                </div>
                {hadExistingConsultationSchedule && consultationRescheduleReason.trim() && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Reason</span>
                    <span className="text-right font-medium text-black max-w-[60%] whitespace-pre-wrap">{consultationRescheduleReason.trim()}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsConfirmScheduleConsultationOpen(false)}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                  disabled={isSavingConsultationSchedule}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveConsultationSchedule}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#1a1a1a] text-white rounded-xl hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-colors font-semibold disabled:opacity-50"
                  disabled={isSavingConsultationSchedule}
                >
                  {isSavingConsultationSchedule ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isScheduleFittingModalOpen && selectedFittingOrder && !isConfirmScheduleFittingOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Schedule fitting appointment"
            onClick={closeScheduleFittingModal}
          >
            <div
              ref={modalRef}
              tabIndex={-1}
              className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-2xl font-light text-black">Schedule Fitting Appointment</h3>
                  <p className="text-sm text-[#6B5D4F] mt-1">
                    Choose when you will visit {selectedFittingOrder.branch || 'the store'} for your fitting appointment.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeScheduleFittingModal}
                  className="p-2 rounded-lg hover:bg-[#FAF7F0] transition-colors disabled:opacity-50"
                  disabled={isSavingFittingSchedule}
                  aria-label="Close fitting schedule modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 space-y-2 text-sm mb-6">
                <p className="font-medium text-black">{selectedFittingOrder.orderType}</p>
                <p className="text-[#6B5D4F]">Reference ID: {selectedFittingOrder.referenceId || selectedFittingOrder._id || selectedFittingOrder.id}</p>
                <p className="text-[#6B5D4F]">Branch: {selectedFittingOrder.branch || 'Taguig Main'}</p>
              </div>

              <div className="space-y-4">
                {hadExistingFittingSchedule && (
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Reason for Rescheduling *</label>
                    <textarea
                      value={fittingRescheduleReason}
                      onChange={(e) => setFittingRescheduleReason(e.target.value)}
                      rows={3}
                      placeholder="Tell us why you need to reschedule your fitting"
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors resize-none"
                      disabled={isSavingFittingSchedule}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Fitting Date</label>
                  <input
                    type="date"
                    value={fittingDate}
                    min={getTomorrowDateValue()}
                    onChange={(e) => setFittingDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    disabled={isSavingFittingSchedule}
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Fitting Time</label>
                  <select
                    value={fittingTime}
                    onChange={(e) => setFittingTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    disabled={isSavingFittingSchedule}
                  >
                    {consultationTimeOptions.map((timeOption) => (
                      <option key={timeOption.value} value={timeOption.value}>
                        {timeOption.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {fittingScheduleError && (
                <p className="mt-4 text-sm text-red-600">{fittingScheduleError}</p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={closeScheduleFittingModal}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                  disabled={isSavingFittingSchedule}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={requestSaveFittingSchedule}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#1a1a1a] text-white rounded-xl hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-colors font-semibold disabled:opacity-50"
                  disabled={isSavingFittingSchedule}
                >
                  {isSavingFittingSchedule ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isConfirmScheduleFittingOpen && selectedFittingOrder && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm save fitting schedule"
            onClick={() => {
              if (isSavingFittingSchedule) return;
              setIsConfirmScheduleFittingOpen(false);
            }}
          >
            <div
              ref={modalRef}
              tabIndex={-1}
              className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-2xl font-light text-black">Confirm Save Schedule</h3>
                  <p className="text-sm text-[#6B5D4F] mt-1">
                    Review the fitting details before saving this schedule.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfirmScheduleFittingOpen(false)}
                  className="p-2 rounded-lg hover:bg-[#FAF7F0] transition-colors disabled:opacity-50"
                  disabled={isSavingFittingSchedule}
                  aria-label="Close save fitting schedule confirmation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 space-y-3 text-sm mb-6">
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Order</span>
                  <span className="text-right font-medium text-black">{selectedFittingOrder.orderType}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Branch</span>
                  <span className="text-right font-medium text-black">{selectedFittingOrder.branch || 'Taguig Main'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Date</span>
                  <span className="text-right font-medium text-black">{fittingDate}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Time</span>
                  <span className="text-right font-medium text-black">
                    {consultationTimeOptions.find((option) => option.value === fittingTime)?.label || fittingTime}
                  </span>
                </div>
                {hadExistingFittingSchedule && fittingRescheduleReason.trim() && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Reason</span>
                    <span className="text-right font-medium text-black max-w-[60%] whitespace-pre-wrap">{fittingRescheduleReason.trim()}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsConfirmScheduleFittingOpen(false)}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                  disabled={isSavingFittingSchedule}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveFittingSchedule}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#1a1a1a] text-white rounded-xl hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-colors font-semibold disabled:opacity-50"
                  disabled={isSavingFittingSchedule}
                >
                  {isSavingFittingSchedule ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}