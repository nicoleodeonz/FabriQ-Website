import { useState } from 'react';
import { Calendar, Clock, MapPin, ChevronRight, CheckCircle2 } from 'lucide-react';

interface Rental {
  id: string;
  gownName: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'pending';
  totalPrice: number;
  downpayment: number;
  branch: string;
}

const mockRentals: Rental[] = [
  {
    id: 'R001',
    gownName: 'Midnight Elegance',
    startDate: '2026-02-01',
    endDate: '2026-02-03',
    status: 'active',
    totalPrice: 10500,
    downpayment: 5250,
    branch: 'Taguig Main'
  },
  {
    id: 'R002',
    gownName: 'Pearl Romance',
    startDate: '2026-03-15',
    endDate: '2026-03-16',
    status: 'pending',
    totalPrice: 8000,
    downpayment: 4000,
    branch: 'BGC Branch'
  }
];

export function Rentals() {
  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('new');
  const [formData, setFormData] = useState({
    gownId: '',
    startDate: '',
    endDate: '',
    branch: 'Main Branch',
    customerName: '',
    contactNumber: '',
    eventType: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Rental booking submitted successfully!');
  };

  return (
    <div className="min-h-screen py-8 px-4 bg-[#FAF7F0]">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-light text-black mb-2">Rentals</h1>
          <p className="text-[#6B5D4F]">Manage your gown rentals and reservations</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-[#E8DCC8]">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'new'
                ? 'border-black text-black font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            New Rental
          </button>
          <button
            onClick={() => setActiveTab('existing')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'existing'
                ? 'border-black text-black font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            My Rentals
          </button>
        </div>

        {/* New Rental Form */}
        {activeTab === 'new' && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
            <h2 className="text-2xl font-light text-black mb-6">Book a Rental</h2>
            
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Customer Name *</label>
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
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-[#6B5D4F] mb-2">Gown Selection *</label>
                <select
                  required
                  value={formData.gownId}
                  onChange={(e) => setFormData({ ...formData, gownId: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                >
                  <option value="">Select a gown</option>
                  <option value="1">Midnight Elegance - ₱3,500/day</option>
                  <option value="2">Pearl Romance - ₱8,000/day</option>
                  <option value="4">Golden Hour - ₱4,200/day</option>
                  <option value="5">Crimson Dreams - ₱5,500/day</option>
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">End Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Branch Location *</label>
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
                
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Event Type</label>
                  <input
                    type="text"
                    value={formData.eventType}
                    onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    placeholder="e.g., Wedding, Gala, Prom"
                  />
                </div>
              </div>

              <div className="bg-[#F5EFE6] rounded-lg p-6">
                <h3 className="font-medium text-black mb-3">Rental Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#6B5D4F]">Rental Duration</span>
                    <span className="text-black">Calculate based on dates</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B5D4F]">Daily Rate</span>
                    <span className="text-black">Select gown first</span>
                  </div>
                  <div className="flex justify-between font-medium text-base pt-2 border-t border-[#E8DCC8]">
                    <span className="text-black">Downpayment (50%)</span>
                    <span className="text-black">₱0.00</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-black text-[#FAF7F0] rounded-full hover:bg-[#D4AF37] hover:text-black transition-colors flex items-center justify-center gap-2"
              >
                Submit Rental Request
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        )}

        {/* Existing Rentals */}
        {activeTab === 'existing' && (
          <div className="space-y-4">
            {mockRentals.map((rental) => (
              <div
                key={rental.id}
                className="bg-white rounded-2xl border border-[#E8DCC8] p-6 hover:border-[#D4AF37] transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-xl font-medium text-black">{rental.gownName}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        rental.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : rental.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-[#F5EFE6] text-[#6B5D4F]'
                      }`}>
                        {rental.status.charAt(0).toUpperCase() + rental.status.slice(1)}
                      </span>
                    </div>
                    
                    <div className="grid md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-[#6B5D4F]">
                        <Calendar className="w-4 h-4" />
                        <span>{rental.startDate} - {rental.endDate}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#6B5D4F]">
                        <MapPin className="w-4 h-4" />
                        <span>{rental.branch}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#6B5D4F]">
                        <span className="font-medium">ID:</span>
                        <span>{rental.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                      <div className="text-sm text-[#6B5D4F]">Total</div>
                      <div className="text-xl font-medium text-black">₱{rental.totalPrice.toLocaleString()}</div>
                    </div>
                    <div className="text-sm text-[#6B5D4F]">
                      Paid: ₱{rental.downpayment.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {mockRentals.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-[#E8DCC8]">
                <Calendar className="w-12 h-12 text-[#E8DCC8] mx-auto mb-4" />
                <h3 className="text-xl text-black mb-2">No rentals yet</h3>
                <p className="text-[#6B5D4F] mb-6">Start browsing our catalog to make your first rental</p>
                <button
                  onClick={() => setActiveTab('new')}
                  className="px-6 py-3 bg-black text-[#FAF7F0] rounded-full hover:bg-[#D4AF37] hover:text-black transition-colors"
                >
                  Create New Rental
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}