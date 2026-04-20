import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Clock, MapPin, User, Mail, Phone, ChevronRight } from 'lucide-react';
import { getPublicInventory } from '../services/inventoryAPI';
import type { InventoryItem } from '../services/inventoryAPI';
import { appointmentAPI } from '../services/appointmentAPI';
import type { AppointmentDetail as Appointment } from '../services/appointmentAPI';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';

interface AppointmentsProps {
  token: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
    phoneVerified?: boolean;
  };
  selectedGownId?: string | null;
}

export function Appointments({ user, token, selectedGownId }: AppointmentsProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const hasPhoneNumber = (value: string) => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10;
  };

  const [activeTab, setActiveTab] = useState<'new' | 'existing' | 'history'>('new');
  const [availableGowns, setAvailableGowns] = useState<InventoryItem[]>([]);
  const [gownsLoading, setGownsLoading] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const defaultCustomerName = useMemo(
    () => `${user.firstName} ${user.lastName}`.trim(),
    [user.firstName, user.lastName]
  );
  
  // Load available gowns on component mount
  useEffect(() => {
    const loadGowns = async () => {
      setGownsLoading(true);
      try {
        const items = await getPublicInventory();
        const availableItems = items.filter(item => item.status === 'available');
        setAvailableGowns(availableItems);
      } catch (err) {
        console.error('Failed to load gowns:', err);
      } finally {
        setGownsLoading(false);
      }
    };
    loadGowns();
  }, []);

  const minAppointmentDate = useMemo(() => {
    const now = new Date();
    const daysToAdd = now.getHours() >= 17 ? 2 : 1;
    const date = new Date();
    date.setDate(date.getDate() + daysToAdd);
    return date.toLocaleDateString('en-CA');
  }, []);
  const [formData, setFormData] = useState({
    customerName: defaultCustomerName,
    contactNumber: user.phoneNumber || '',
    email: user.email || '',
    appointmentType: '',
    date: '',
    time: '',
    branch: '',
    selectedGown: '',
    notes: ''
  });
  const [appointmentTypeError, setAppointmentTypeError] = useState('');
  const [branchError, setBranchError] = useState('');
  const [gownError, setGownError] = useState('');
  const [isMissingPhoneModalOpen, setIsMissingPhoneModalOpen] = useState(false);
  const [selectedRescheduleAppointment, setSelectedRescheduleAppointment] = useState<Appointment | null>(null);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [bookedTimeSlots, setBookedTimeSlots] = useState<string[]>([]);
  const [rescheduleBookedTimeSlots, setRescheduleBookedTimeSlots] = useState<string[]>([]);
  const [rescheduleForm, setRescheduleForm] = useState({
    date: '',
    time: '',
    branch: '',
    reason: '',
  });
  const isAnyAppointmentModalOpen = isMissingPhoneModalOpen || isRescheduleModalOpen;

  useModalInteractionLock(isAnyAppointmentModalOpen, modalRef);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      customerName: defaultCustomerName,
      contactNumber: user.phoneNumber || '',
      email: user.email || '',
    }));
  }, [defaultCustomerName, user.email, user.phoneNumber]);

  useEffect(() => {
    let isMounted = true;

    const loadAppointments = async () => {
      setAppointmentsLoading(true);
      setAppointmentsError('');

      try {
        const items = await appointmentAPI.getMyAppointments(token);
        if (!isMounted) return;
        setAppointments(items);
      } catch (error) {
        if (!isMounted) return;
        setAppointmentsError(error instanceof Error ? error.message : 'Failed to load appointments.');
      } finally {
        if (isMounted) {
          setAppointmentsLoading(false);
        }
      }
    };

    void loadAppointments();

    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!formData.date || !formData.branch) {
      setBookedTimeSlots([]);
      return;
    }

    let isMounted = true;

    const loadBookedSlots = async () => {
      try {
        const slots = await appointmentAPI.getBookedSlots(token, {
          date: formData.date,
          branch: formData.branch,
        });

        if (!isMounted) return;
        setBookedTimeSlots(slots);
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load booked appointment slots:', error);
        setBookedTimeSlots([]);
      }
    };

    void loadBookedSlots();

    return () => {
      isMounted = false;
    };
  }, [formData.branch, formData.date, token]);

  useEffect(() => {
    if (formData.time && bookedTimeSlots.includes(formData.time)) {
      setFormData((prev) => ({ ...prev, time: '' }));
    }
  }, [bookedTimeSlots, formData.time]);

  useEffect(() => {
    if (!isRescheduleModalOpen || !selectedRescheduleAppointment || !rescheduleForm.date || !rescheduleForm.branch) {
      setRescheduleBookedTimeSlots([]);
      return;
    }

    let isMounted = true;

    const loadRescheduleBookedSlots = async () => {
      try {
        const slots = await appointmentAPI.getBookedSlots(token, {
          date: rescheduleForm.date,
          branch: rescheduleForm.branch,
          excludeId: selectedRescheduleAppointment.id,
        });

        if (!isMounted) return;
        setRescheduleBookedTimeSlots(slots);
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load booked slots for reschedule:', error);
        setRescheduleBookedTimeSlots([]);
      }
    };

    void loadRescheduleBookedSlots();

    return () => {
      isMounted = false;
    };
  }, [isRescheduleModalOpen, rescheduleForm.branch, rescheduleForm.date, selectedRescheduleAppointment, token]);

  useEffect(() => {
    if (rescheduleForm.time && rescheduleBookedTimeSlots.includes(rescheduleForm.time)) {
      setRescheduleForm((prev) => ({ ...prev, time: '' }));
    }
  }, [rescheduleBookedTimeSlots, rescheduleForm.time]);

  // Prefill gown when selectedGownId is provided
  useEffect(() => {
    if (selectedGownId && formData) {
      setFormData(prev => ({
        ...prev,
        selectedGown: selectedGownId,
        appointmentType: 'fitting'
      }));
    }
  }, [selectedGownId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    
    // Validation
    if (!formData.customerName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    if (!hasPhoneNumber(formData.contactNumber)) {
      setIsMissingPhoneModalOpen(true);
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
      setAppointmentTypeError('Please select an appointment type');
      return;
    }

    setAppointmentTypeError('');
    
    // Check for gown selection if appointment type is fitting
    if (formData.appointmentType === 'fitting') {
      if (!formData.selectedGown) {
        setGownError('Please select a gown to try on');
        return;
      }
      setGownError('');
    }
    
    if (!formData.date) {
      alert('Please select a date');
      return;
    }
    
    // Check if date is in the future
    const selectedDate = new Date(formData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate <= today) {
      alert('Please select a date after today');
      return;
    }
    
    if (!formData.time) {
      alert('Please select a time slot');
      return;
    }

    if (!formData.branch) {
      setBranchError('Please select a branch');
      return;
    }

    setBranchError('');
    
    void handleCreateAppointment();
  };

  const handleCreateAppointment = async () => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const created = await appointmentAPI.createAppointment(token, {
        appointmentType: formData.appointmentType as 'fitting' | 'consultation' | 'measurement' | 'pickup',
        date: formData.date,
        time: formData.time,
        branch: formData.branch,
        selectedGown: formData.appointmentType === 'fitting' ? formData.selectedGown : undefined,
        notes: formData.notes,
      });

      setAppointments((prev) => [created, ...prev]);
      setFormData({
        customerName: defaultCustomerName,
        contactNumber: user.phoneNumber || '',
        email: user.email || '',
        appointmentType: '',
        date: '',
        time: '',
        branch: '',
        selectedGown: '',
        notes: ''
      });
      setAppointmentTypeError('');
      setBranchError('');
      setGownError('');
      setActiveTab('existing');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to book appointment.');
    } finally {
      setIsSubmitting(false);
    }
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

  const currentAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'pending' || appointment.status === 'scheduled'),
    [appointments]
  );

  const appointmentHistory = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'completed' || appointment.status === 'cancelled'),
    [appointments]
  );

  const openRescheduleModal = (appointment: Appointment) => {
    setSelectedRescheduleAppointment(appointment);
    setRescheduleForm({
      date: appointment.date,
      time: appointment.time,
      branch: appointment.branch,
      reason: '',
    });
    setRescheduleError('');
    setIsRescheduleModalOpen(true);
  };

  const closeRescheduleModal = () => {
    if (isRescheduling) return;
    setIsRescheduleModalOpen(false);
    setSelectedRescheduleAppointment(null);
    setRescheduleError('');
  };

  const handleConfirmReschedule = async () => {
    if (!selectedRescheduleAppointment) return;

    if (!rescheduleForm.date || !rescheduleForm.time || !rescheduleForm.branch || !rescheduleForm.reason.trim()) {
      setRescheduleError('Date, time, branch, and reason are required.');
      return;
    }

    const selectedDate = new Date(rescheduleForm.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate <= today) {
      setRescheduleError('Please select a date after today.');
      return;
    }

    if (
      rescheduleForm.date === selectedRescheduleAppointment.date &&
      rescheduleForm.time === selectedRescheduleAppointment.time
    ) {
      setRescheduleError('Please choose a different date or time for rescheduling.');
      return;
    }

    setIsRescheduling(true);
    setRescheduleError('');

    try {
      const updated = await appointmentAPI.rescheduleAppointment(token, selectedRescheduleAppointment.id, rescheduleForm);
      setAppointments((prev) => prev.map((appointment) => (appointment.id === updated.id ? updated : appointment)));
      closeRescheduleModal();
    } catch (error) {
      setRescheduleError(error instanceof Error ? error.message : 'Failed to reschedule appointment.');
    } finally {
      setIsRescheduling(false);
    }
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
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-[#D4AF37] font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Appointment History
          </button>
        </div>

        {/* New Appointment Form */}
        {activeTab === 'new' && (
          <div className="space-y-6">
            {/* Appointment Type Selection */}
            <div>
              <div className="grid md:grid-cols-2 gap-4">
                {appointmentTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => {
                      setFormData({ 
                        ...formData, 
                        appointmentType: type.value,
                        selectedGown: type.value === 'fitting' ? formData.selectedGown : ''
                      });
                      setAppointmentTypeError('');
                      setGownError('');
                    }}
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
              {appointmentTypeError && (
                <p className="text-red-600 text-sm mt-2">{appointmentTypeError}</p>
              )}
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

                  <div className="md:col-span-2">
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
                </div>

                {/* Date & Time Selection */}
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Date *</label>
                    <input
                      type="date"
                      required
                      min={minAppointmentDate}
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
                      disabled={!formData.date || !formData.branch}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    >
                      <option value="">{!formData.date || !formData.branch ? 'Select date and branch first' : 'Select time'}</option>
                      {timeSlots.map((time) => (
                        <option key={time} value={time} disabled={bookedTimeSlots.includes(time)}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Branch *</label>
                    <select
                      value={formData.branch}
                      onChange={(e) => {
                        setFormData({ ...formData, branch: e.target.value });
                        setBranchError('');
                      }}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    >
                      <option value="">Select a branch</option>
                      <option value="Taguig Main">Taguig Main - Cadena de Amor</option>
                      <option value="BGC Branch">BGC Branch</option>
                      <option value="Makati Branch">Makati Branch</option>
                      <option value="Quezon City">Quezon City</option>
                    </select>
                    {branchError && (
                      <p className="text-red-600 text-sm mt-2">{branchError}</p>
                    )}
                  </div>
                </div>

                {/* Gown Selection (for fitting appointments) */}
                {formData.appointmentType === 'fitting' && (
                  <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Select Gown to Try On *</label>
                    <select
                      value={formData.selectedGown}
                      onChange={(e) => {
                        setFormData({ ...formData, selectedGown: e.target.value });
                        setGownError('');
                      }}
                      disabled={gownsLoading}
                      className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors disabled:bg-[#F7F1E8] disabled:cursor-not-allowed"
                    >
                      <option value="">{gownsLoading ? 'Loading gowns...' : 'Select a gown'}</option>
                      {availableGowns.map((gown) => (
                        <option key={gown.id} value={gown.id}>
                          {gown.name} - {gown.color} (₱{gown.price})
                        </option>
                      ))}
                    </select>
                    {gownError && (
                      <p className="text-red-600 text-sm mt-2">{gownError}</p>
                    )}
                    {availableGowns.length === 0 && !gownsLoading && (
                      <p className="text-[#6B5D4F] text-sm mt-2">No gowns available for fitting at the moment.</p>
                    )}
                  </div>
                )}

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
                  disabled={isSubmitting}
                  className="w-full py-4 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : 'Confirm Appointment'}
                  <ChevronRight className="w-5 h-5" />
                </button>

                {submitError && (
                  <p className="text-sm text-red-600">{submitError}</p>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Existing Appointments */}
        {activeTab === 'existing' && (
          <div className="space-y-4">
            {appointmentsError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {appointmentsError}
              </div>
            )}

            {appointmentsLoading && (
              <div className="rounded-2xl border border-[#E8DCC8] bg-white px-6 py-8 text-sm text-[#6B5D4F]">
                Loading appointments...
              </div>
            )}

            {currentAppointments.map((appointment) => (
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
                        appointment.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : appointment.status === 'scheduled'
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

                    {appointment.type === 'fitting' && appointment.selectedGown && (
                      <div className="text-sm mb-3 text-[#6B5D4F]">
                        <span className="font-medium">👗 Gown: </span>
                        <span>{appointment.selectedGownName || availableGowns.find(g => g.id === appointment.selectedGown)?.name || 'Selected gown'}</span>
                      </div>
                    )}

                    {appointment.notes && (
                      <p className="text-sm text-[#6B5D4F] italic">{appointment.notes}</p>
                    )}
                  </div>

                  {appointment.status === 'scheduled' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openRescheduleModal(appointment)}
                        className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors text-sm"
                      >
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

            {!appointmentsLoading && currentAppointments.length === 0 && (
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

        {activeTab === 'history' && (
          <div className="space-y-4">
            {appointmentsError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {appointmentsError}
              </div>
            )}

            {appointmentsLoading && (
              <div className="rounded-2xl border border-[#E8DCC8] bg-white px-6 py-8 text-sm text-[#6B5D4F]">
                Loading your appointment history...
              </div>
            )}

            {!appointmentsLoading && appointmentHistory.map((appointment) => (
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
                        appointment.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
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

                    {appointment.type === 'fitting' && appointment.selectedGown && (
                      <div className="text-sm mb-3 text-[#6B5D4F]">
                        <span className="font-medium">👗 Gown: </span>
                        <span>{appointment.selectedGownName || availableGowns.find(g => g.id === appointment.selectedGown)?.name || 'Selected gown'}</span>
                      </div>
                    )}

                    {appointment.notes && (
                      <p className="text-sm text-[#6B5D4F] italic">{appointment.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {!appointmentsLoading && appointmentHistory.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-[#E8DCC8]">
                <Calendar className="w-12 h-12 text-[#E8DCC8] mx-auto mb-4" />
                <h3 className="text-xl mb-2">No appointment history yet</h3>
                <p className="text-[#6B5D4F] mb-6">Completed and cancelled appointments will appear here.</p>
              </div>
            )}
          </div>
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

        {isRescheduleModalOpen && selectedRescheduleAppointment && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Reschedule appointment"
            onClick={closeRescheduleModal}
          >
            <div
              ref={modalRef}
              tabIndex={-1}
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-light mb-2">Reschedule Appointment</h3>
                  <p className="text-sm text-[#6B5D4F]">
                    Update the schedule for your {getAppointmentTypeLabel(selectedRescheduleAppointment.type).toLowerCase()}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeRescheduleModal}
                  disabled={isRescheduling}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors disabled:opacity-50"
                  aria-label="Close reschedule modal"
                >
                  <span className="text-xl leading-none text-[#6B5D4F]">×</span>
                </button>
              </div>

              <div className="space-y-5">
                <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 text-sm text-[#6B5D4F]">
                  <p className="font-medium text-[#3D2B1F] mb-1">Current schedule</p>
                  <p>{selectedRescheduleAppointment.date} at {selectedRescheduleAppointment.time}</p>
                  <p>{selectedRescheduleAppointment.branch}</p>
                </div>

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">New Date *</label>
                  <input
                    type="date"
                    min={minAppointmentDate}
                    value={rescheduleForm.date}
                    onChange={(e) => setRescheduleForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    disabled={isRescheduling}
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">New Time *</label>
                  <select
                    value={rescheduleForm.time}
                    onChange={(e) => setRescheduleForm((prev) => ({ ...prev, time: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    disabled={isRescheduling || !rescheduleForm.date || !rescheduleForm.branch}
                  >
                    <option value="">{!rescheduleForm.date || !rescheduleForm.branch ? 'Select date and branch first' : 'Select time'}</option>
                    {timeSlots.map((time) => (
                      <option key={time} value={time} disabled={rescheduleBookedTimeSlots.includes(time)}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">New Branch *</label>
                  <select
                    value={rescheduleForm.branch}
                    onChange={(e) => setRescheduleForm((prev) => ({ ...prev, branch: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    disabled={isRescheduling}
                  >
                    <option value="">Select a branch</option>
                    <option value="Taguig Main">Taguig Main - Cadena de Amor</option>
                    <option value="BGC Branch">BGC Branch</option>
                    <option value="Makati Branch">Makati Branch</option>
                    <option value="Quezon City">Quezon City</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Reason for Rescheduling *</label>
                  <textarea
                    value={rescheduleForm.reason}
                    onChange={(e) => setRescheduleForm((prev) => ({ ...prev, reason: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors min-h-[110px] resize-none"
                    placeholder="Tell us why you need to reschedule this appointment"
                    disabled={isRescheduling}
                  />
                </div>

                {rescheduleError && (
                  <p className="text-sm text-red-600">{rescheduleError}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeRescheduleModal}
                    disabled={isRescheduling}
                    className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReschedule}
                    disabled={isRescheduling}
                    className="flex-1 py-3 bg-[#1a1a1a] text-white rounded-xl hover:bg-[#D4AF37] transition-colors font-medium disabled:opacity-50"
                  >
                    {isRescheduling ? 'Saving...' : 'Save Changes'}
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