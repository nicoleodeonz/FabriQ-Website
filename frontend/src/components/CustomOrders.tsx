import { useState } from 'react';
import { Palette, Upload, Ruler, ChevronRight, CheckCircle2 } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface CustomOrder {
  id: string;
  customerName: string;
  orderType: string;
  status: 'inquiry' | 'design-approval' | 'in-progress' | 'fitting' | 'completed';
  startDate: string;
  estimatedCompletion: string;
  totalPrice: number;
  downpayment: number;
}

const mockOrders: CustomOrder[] = [
  {
    id: 'CO001',
    customerName: 'Sarah Johnson',
    orderType: 'Wedding Gown',
    status: 'in-progress',
    startDate: '2026-01-15',
    estimatedCompletion: '2026-03-20',
    totalPrice: 65000,
    downpayment: 32500
  },
  {
    id: 'CO002',
    customerName: 'Emma Davis',
    orderType: 'Evening Dress',
    status: 'design-approval',
    startDate: '2026-01-20',
    estimatedCompletion: '2026-02-28',
    totalPrice: 45000,
    downpayment: 22500
  }
];

export function CustomOrders() {
  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('new');
  const [formData, setFormData] = useState({
    customerName: '',
    contactNumber: '',
    email: '',
    orderType: '',
    eventDate: '',
    preferredColors: '',
    fabricPreference: '',
    specialRequests: '',
    budget: '',
    branch: 'Taguig Main'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.customerName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    if (!formData.contactNumber.trim()) {
      alert('Please enter your contact number');
      return;
    }
    
    // Philippine phone number validation (basic)
    const phoneRegex = /^(\+63|0)?9\d{9}$/;
    if (!phoneRegex.test(formData.contactNumber.replace(/\s|-/g, ''))) {
      alert('Please enter a valid Philippine mobile number (e.g., 09XX XXX XXXX or +639XX XXX XXXX)');
      return;
    }
    
    if (!formData.email.trim()) {
      alert('Please enter your email address');
      return;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      alert('Please enter a valid email address');
      return;
    }
    
    if (!formData.orderType) {
      alert('Please select an order type');
      return;
    }
    
    alert('Custom order inquiry submitted successfully! Our team will contact you within 24-48 hours.');
    // Reset form
    setFormData({
      customerName: '',
      contactNumber: '',
      email: '',
      orderType: '',
      eventDate: '',
      preferredColors: '',
      fabricPreference: '',
      specialRequests: '',
      budget: '',
      branch: 'Taguig Main'
    });
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
                      onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                      placeholder="Enter your name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Contact Number *</label>
                    <input
                      type="tel"
                      required
                      value={formData.contactNumber}
                      onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                      placeholder="+63 912 345 6789"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                      placeholder="your@email.com"
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
                <div className="border-2 border-dashed border-[#E8DCC8] rounded-lg p-8 text-center hover:border-[#D4AF37] transition-colors cursor-pointer">
                  <Upload className="w-12 h-12 text-[#6B5D4F] mx-auto mb-4" />
                  <p className="text-[#6B5D4F] mb-2">Upload inspiration images</p>
                  <p className="text-sm text-[#6B5D4F]">PNG, JPG up to 10MB</p>
                </div>
              </div>

              {/* AI Color Recommendation */}
              <div className="bg-gradient-to-br from-[#FAF7F0] to-white rounded-lg p-6 border border-[#D4AF37]">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white rounded-lg border border-[#E8DCC8]">
                    <Palette className="w-6 h-6 text-[#D4AF37]" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium mb-2">AI Color Recommendation</h3>
                    <p className="text-sm text-[#6B5D4F] mb-4">
                      Get personalized color suggestions based on your skin undertone using our smart camera feature
                    </p>
                    <button
                      type="button"
                      className="px-4 py-2 bg-black text-white text-sm rounded-full hover:bg-[#D4AF37] transition-colors"
                    >
                      Try AI Recommendation
                    </button>
                  </div>
                </div>
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

        {/* Existing Orders */}
        {activeTab === 'existing' && (
          <div className="space-y-6">
            {mockOrders.map((order) => {
              const currentStatusIndex = getStatusIndex(order.status);
              
              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border border-[#E8DCC8] p-6"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-medium">{order.orderType}</h3>
                        <span className="text-sm text-[#6B5D4F]">#{order.id}</span>
                      </div>
                      <p className="text-[#6B5D4F] mb-1">{order.customerName}</p>
                      <p className="text-sm text-[#6B5D4F]">
                        Started: {order.startDate} • Est. Completion: {order.estimatedCompletion}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-[#6B5D4F]">Total Price</div>
                      <div className="text-2xl font-medium">₱{order.totalPrice.toLocaleString()}</div>
                      <div className="text-sm text-[#6B5D4F]">Paid: ₱{order.downpayment.toLocaleString()}</div>
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

            {mockOrders.length === 0 && (
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
      </div>
    </div>
  );
}