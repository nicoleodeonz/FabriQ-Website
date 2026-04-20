import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Ruler, ChevronRight, CheckCircle2, Calendar, X } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { customerAPI } from '../services/customerAPI';
import { toast } from 'sonner';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';

interface CustomOrdersProps {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
    phoneVerified?: boolean;
  };
  token: string;
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
}

export function CustomOrders({ user, token }: CustomOrdersProps) {
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
  const isAnyCustomOrderModalOpen = isMissingPhoneModalOpen || isOrderDetailsOpen;

  useModalInteractionLock(isAnyCustomOrderModalOpen, modalRef);

  // Fetch orders when the component mounts or when switching to 'existing' tab
  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const data = await customerAPI.getMyCustomOrders(token);
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      customerName: prev.customerName || defaultCustomerName,
      contactNumber: prev.contactNumber || user.phoneNumber || '',
      email: prev.email || user.email || '',
    }));
  }, [defaultCustomerName, user.email, user.phoneNumber]);

  useEffect(() => {
    if (activeTab === 'existing' || activeTab === 'history') {
      fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const hasPhoneNumber = (value: string) => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10;
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setFormData((prev) => ({ ...prev, designImage: file, designImageUrl: URL.createObjectURL(file) }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validation
    if (!formData.customerName.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (!hasPhoneNumber(formData.contactNumber)) {
      setIsMissingPhoneModalOpen(true);
      return;
    }
    if (!formData.email.trim()) {
      toast.error('Please enter your email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (!formData.orderType) {
      toast.error('Please select an order type');
      return;
    }

    let designImageUrl = '';
    if (formData.designImage) {
      setUploadingImage(true);
      const imageData = new FormData();
      imageData.append('image', formData.designImage);
      try {
        const res = await fetch('/api/custom-orders/upload-image', {
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

  const openOrderDetails = (order: CustomOrder) => {
    setSelectedOrderDetails(order);
    setIsOrderDetailsOpen(true);
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
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
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
                    <label className="block text-sm text-[#6B5D4F] mb-2">Preferred Branch</label>
                    <select
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
                    <label className="block text-sm text-[#6B5D4F] mb-2">Event Date</label>
                    <input
                      type="date"
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
                    <label className="block text-sm text-[#6B5D4F] mb-2">Preferred Colors</label>
                    <input
                      type="text"
                      value={formData.preferredColors}
                      onChange={(e) => setFormData({ ...formData, preferredColors: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                      placeholder="e.g., Ivory, Gold accents"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Budget Range</label>
                    <select
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
                  <label className="block text-sm text-[#6B5D4F] mb-2">Fabric Preference</label>
                  <input
                    type="text"
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

              <button
                type="submit"
                className="w-full py-4 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors flex items-center justify-center gap-2"
              >
                Submit Custom Order Inquiry
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
                        </div>
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
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Custom order details"
            onClick={() => setIsOrderDetailsOpen(false)}
          >
            <div
              ref={modalRef}
              tabIndex={-1}
              className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-6 gap-4">
                <div>
                  <h3 className="text-2xl font-light text-black">Custom Order Details</h3>
                  <p className="text-sm text-[#6B5D4F] mt-1">Review your bespoke order information and current progress.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOrderDetailsOpen(false)}
                  className="p-2 rounded-lg hover:bg-[#FAF7F0] transition-colors"
                  aria-label="Close custom order details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 space-y-3 text-sm mb-6">
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Order Type</span>
                  <span className="text-right font-medium text-black">{selectedOrderDetails.orderType}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Status</span>
                  <span className="text-right font-medium text-black">{getStatusLabel(selectedOrderDetails.status)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Reference ID</span>
                  <span className="text-right font-medium text-black">{selectedOrderDetails.referenceId || selectedOrderDetails._id || selectedOrderDetails.id}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Customer</span>
                  <span className="text-right font-medium text-black">{selectedOrderDetails.customerName}</span>
                </div>
                {selectedOrderDetails.contactNumber && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Contact Number</span>
                    <span className="text-right font-medium text-black">{selectedOrderDetails.contactNumber}</span>
                  </div>
                )}
                {selectedOrderDetails.email && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Email</span>
                    <span className="text-right font-medium text-black">{selectedOrderDetails.email}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Branch</span>
                  <span className="text-right font-medium text-black">{selectedOrderDetails.branch || 'Taguig Main'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Event Date</span>
                  <span className="text-right font-medium text-black">{selectedOrderDetails.eventDate || 'Not set'}</span>
                </div>
                {selectedOrderDetails.budget && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Budget Range</span>
                    <span className="text-right font-medium text-black">{selectedOrderDetails.budget}</span>
                  </div>
                )}
                {selectedOrderDetails.preferredColors && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Preferred Colors</span>
                    <span className="text-right font-medium text-black">{selectedOrderDetails.preferredColors}</span>
                  </div>
                )}
                {selectedOrderDetails.fabricPreference && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Fabric Preference</span>
                    <span className="text-right font-medium text-black">{selectedOrderDetails.fabricPreference}</span>
                  </div>
                )}
                {selectedOrderDetails.specialRequests && (
                  <div className="flex justify-between gap-4 pt-2 border-t border-[#E8DCC8]">
                    <span className="text-[#6B5D4F]">Special Requests</span>
                    <span className="text-right font-medium text-black max-w-[60%]">{selectedOrderDetails.specialRequests}</span>
                  </div>
                )}
              </div>

              {selectedOrderDetails.designImageUrl && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-black mb-3">Design Inspiration</h4>
                  <div className="rounded-xl overflow-hidden border border-[#E8DCC8] bg-[#FAF7F0]">
                    <ImageWithFallback
                      src={selectedOrderDetails.designImageUrl}
                      alt={`${selectedOrderDetails.orderType} design inspiration`}
                      className="w-full h-64 object-cover"
                    />
                  </div>
                </div>
              )}

              <div className="relative mb-6">
                <div className="flex justify-between mb-2">
                  {statusSteps.map((step, index) => {
                    const currentStatusIndex = getStatusIndex(selectedOrderDetails.status);
                    return (
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
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOrderDetailsOpen(false)}
                className="w-full py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}