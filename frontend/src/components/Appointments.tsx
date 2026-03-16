import { useState } from 'react';
import { Calendar, Clock, MapPin, User, Mail, Phone, ChevronRight } from 'lucide-react';

interface Appointment {
  id: string;
  type: 'fitting' | 'consultation' | 'measurement' | 'pickup';
  date: string;
  time: string;
  branch: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
}

const mockAppointments: Appointment[] = [
  {
    id: 'A001',
    type: 'fitting',
    date: '2026-02-05',
    time: '14:00',
    branch: 'Taguig Main',
    status: 'scheduled',
    notes: 'First fitting for custom wedding gown'
  },
  {
    id: 'A002',
    type: 'consultation',
    date: '2026-01-28',
    time: '10:30',
    branch: 'BGC Branch',
    status: 'completed'
  }
];

export function Appointments() {
  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('new');
  const [formData, setFormData] = useState({
    customerName: '',
    contactNumber: '',
    email: '',
    appointmentType: '',
    date: '',
    time: '',
    branch: 'Taguig Main',
    notes: ''
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
    
    // Philippine phone number validation
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
    
    if (!formData.appointmentType) {
      alert('Please select an appointment type');
      return;
    }
    
    if (!formData.date) {
      alert('Please select a date');
      return;
    }
    
    // Check if date is in the future
    const selectedDate = new Date(formData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      alert('Please select a future date');
      return;
    }
    
    if (!formData.time) {
      alert('Please select a time slot');
      return;
    }
    
    alert('Appointment scheduled successfully! You will receive a confirmation via SMS and email within the next hour.');
    // Reset form
    setFormData({
      customerName: '',
      contactNumber: '',
      email: '',
      appointmentType: '',
      date: '',
      time: '',
      branch: 'Taguig Main',
      notes: ''
    });
  };

  const appointmentTypes = [
    { value: 'consultation', label: 'Design Consultation', icon: '💭' },
    { value: 'measurement', label: 'Measurement Session', icon: '📏' },
    { value: 'fitting', label: 'Fitting Appointment', icon: '👗' },
    { value: 'pickup', label: 'Pickup/Return', icon: '📦' }
  ];

  const timeSlots = [
    '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
  ];

  const getAppointmentTypeLabel = (type: string) => {
    const found = appointmentTypes.find(at => at.value === type);
    return found ? found.label : type;
  };

  return (
    <div className="min-h-screen py-8 px-4 bg-[#FAF7F0]">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-light mb-2">Appointments</h1>
          <p className="text-[#6B5D4F]">Schedule fittings, consultations, and measurements</p>
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
            Book Appointment
          </button>
          <button
            onClick={() => setActiveTab('existing')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'existing'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            My Appointments
          </button>
        </div>

        {/* New Appointment Form */}
        {activeTab === 'new' && (
          <div className="space-y-6">
            {/* Appointment Type Selection */}
            <div className="grid md:grid-cols-2 gap-4">
              {appointmentTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, appointmentType: type.value })}
                  className={`p-6 rounded-2xl border-2 transition-all text-left ${
                    formData.appointmentType === type.value
                      ? 'border-[#D4AF37] bg-white'
                      : 'border-[#E8DCC8] hover:border-[#6B5D4F] bg-white'
                  }`}
                >
                  <div className="text-3xl mb-3">{type.icon}</div>
                  <h3 className="font-medium">{type.label}</h3>
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
              <h2 className="text-2xl font-light mb-6">Appointment Details</h2>
              
              <div className="space-y-6">
                {/* Customer Information */}
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

                  <div className="md:col-span-2">
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
                </div>

                {/* Date & Time Selection */}
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Date *</label>
                    <input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Time *</label>
                    <select
                      required
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    >
                      <option value="">Select time</option>
                      {timeSlots.map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Branch *</label>
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

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Additional Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors min-h-[100px]"
                    placeholder="Any specific requests or information we should know..."
                  />
                </div>

                {/* Reminder Notice */}
                <div className="bg-[#FAF7F0] rounded-lg p-4 border border-[#E8DCC8]">
                  <p className="text-sm text-[#6B5D4F]">
                    📱 You will receive appointment reminders via SMS and email 24 hours before your scheduled time.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors flex items-center justify-center gap-2"
                >
                  Confirm Appointment
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Existing Appointments */}
        {activeTab === 'existing' && (
          <div className="space-y-4">
            {mockAppointments.map((appointment) => (
              <div
                key={appointment.id}
                className="bg-white rounded-2xl border border-[#E8DCC8] p-6 hover:border-[#D4AF37] transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-xl font-medium">
                        {getAppointmentTypeLabel(appointment.type)}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        appointment.status === 'scheduled'
                          ? 'bg-blue-100 text-blue-800'
                          : appointment.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-[#E8DCC8] text-[#6B5D4F]'
                      }`}>
                        {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                      </span>
                    </div>
                    
                    <div className="grid md:grid-cols-3 gap-4 text-sm mb-3">
                      <div className="flex items-center gap-2 text-[#6B5D4F]">
                        <Calendar className="w-4 h-4" />
                        <span>{appointment.date}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#6B5D4F]">
                        <Clock className="w-4 h-4" />
                        <span>{appointment.time}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#6B5D4F]">
                        <MapPin className="w-4 h-4" />
                        <span>{appointment.branch}</span>
                      </div>
                    </div>

                    {appointment.notes && (
                      <p className="text-sm text-[#6B5D4F] italic">{appointment.notes}</p>
                    )}
                  </div>

                  {appointment.status === 'scheduled' && (
                    <div className="flex gap-2">
                      <button className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors text-sm">
                        Reschedule
                      </button>
                      <button className="px-4 py-2 border border-red-300 text-red-600 rounded-full hover:border-red-600 transition-colors text-sm">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {mockAppointments.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-[#E8DCC8]">
                <Calendar className="w-12 h-12 text-[#E8DCC8] mx-auto mb-4" />
                <h3 className="text-xl mb-2">No appointments scheduled</h3>
                <p className="text-[#6B5D4F] mb-6">Book your first appointment with us</p>
                <button
                  onClick={() => setActiveTab('new')}
                  className="px-6 py-3 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors"
                >
                  Book Appointment
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}