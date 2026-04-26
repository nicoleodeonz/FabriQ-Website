import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, MapPin, ChevronRight, X, Star } from 'lucide-react';
import { customerAPI } from '../services/customerAPI';
import { getPublicInventory, INVENTORY_UPDATED_EVENT } from '../services/inventoryAPI';
import type { InventoryItem } from '../services/inventoryAPI';
import { rentalAPI } from '../services/rentalAPI';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';
import { Calendar as DateCalendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface Rental {
  id: string;
  referenceId?: string;
  gownName: string;
  sku?: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'for_payment' | 'paid_for_confirmation' | 'for_pickup' | 'active' | 'completed' | 'cancelled';
  totalPrice: number;
  downpayment: number;
  branch: string;
  eventType?: string;
  paymentSubmittedAt?: string | null;
  paymentAmountPaid?: number | null;
  paymentReferenceNumber?: string | null;
  paymentReceiptUrl?: string | null;
  paymentReceiptFilename?: string | null;
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  pickupScheduleDate?: string | null;
  pickupScheduleTime?: string | null;
}

interface RentalsProps {
  token: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    phoneNumber?: string;
    phoneVerified?: boolean;
  };
  selectedGownId?: string | null;
}

interface RentalFormData {
  gownId: string;
  startDate: string;
  endDate: string;
  branch: string;
  customerName: string;
  contactNumber: string;
  email: string;
  eventType: string;
}

type RentalField = keyof RentalFormData;

interface RentalInventoryItem {
  id: string;
  name: string;
  price: number;
  branch: string;
  status: InventoryItem['status'];
  sku: string;
  category: string;
  color: string;
  image?: string;
  description?: string;
}

const RENTAL_COLLECTION_PAGE_SIZE = 9;
const RENTAL_HISTORY_PAGE_SIZE = 4;
const RENTAL_AVAILABILITY_LOOKAHEAD_DAYS = 365;

function normalizeBranch(branch?: string) {
  if (!branch) return 'Taguig Main';
  if (branch === 'Taguig Main - Cadena de Amor') return 'Taguig Main';
  return branch;
}

function formatPhilippinePhoneNumber(value?: string) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';

  let localDigits = digits;
  if (localDigits.startsWith('63')) {
    localDigits = localDigits.slice(2);
  } else if (localDigits.startsWith('0')) {
    localDigits = localDigits.slice(1);
  }

  localDigits = localDigits.slice(0, 10);

  let formatted = '+63';
  if (localDigits.length > 0) formatted += ` ${localDigits.slice(0, 3)}`;
  if (localDigits.length > 3) formatted += ` ${localDigits.slice(3, 6)}`;
  if (localDigits.length > 6) formatted += ` ${localDigits.slice(6, 10)}`;
  return formatted.trim();
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;

  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnly(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value?: string) {
  const parsed = parseDateOnly(value);
  if (!parsed) return 'Select date';

  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function addDaysToDateString(value: string, days: number) {
  const parsed = parseDateOnly(value);
  if (!parsed) return '';

  parsed.setDate(parsed.getDate() + days);
  return formatDateOnly(parsed);
}

export function Rentals({ user, token, selectedGownId }: RentalsProps) {
  const hasPhoneNumber = (value: string) => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10;
  };

  const [activeTab, setActiveTab] = useState<'new' | 'existing' | 'history'>('new');
  const defaultName = useMemo(() => `${user.firstName} ${user.lastName}`.trim(), [user.firstName, user.lastName]);
  const tomorrow = useMemo(() => {
    const now = new Date();
    const daysToAdd = now.getHours() >= 17 ? 2 : 1;
    const date = new Date();
    date.setDate(date.getDate() + daysToAdd);
    return formatDateOnly(date);
  }, []);
  const availabilityWindowEnd = useMemo(() => {
    const endDate = parseDateOnly(tomorrow) || new Date();
    endDate.setDate(endDate.getDate() + RENTAL_AVAILABILITY_LOOKAHEAD_DAYS);
    return formatDateOnly(endDate);
  }, [tomorrow]);
  const [formData, setFormData] = useState<RentalFormData>({
    gownId: '',
    startDate: '',
    endDate: '',
    branch: 'Taguig Main',
    customerName: defaultName,
    contactNumber: user.phoneNumber || '',
    email: user.email || '',
    eventType: '',
  });
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [rentalsLoading, setRentalsLoading] = useState(true);
  const [rentalsError, setRentalsError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [touchedFields, setTouchedFields] = useState<Partial<Record<RentalField, boolean>>>({});
  const [isPrefillLoading, setIsPrefillLoading] = useState(true);
  const [prefillError, setPrefillError] = useState('');
  const [inventoryItems, setInventoryItems] = useState<RentalInventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState('');
  const [unavailableRentalDates, setUnavailableRentalDates] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [isStartDatePopoverOpen, setIsStartDatePopoverOpen] = useState(false);
  const [isEndDatePopoverOpen, setIsEndDatePopoverOpen] = useState(false);
  const [shouldAutoOpenEndDate, setShouldAutoOpenEndDate] = useState(false);
  const [selectedCollectionCategory, setSelectedCollectionCategory] = useState('All');
  const [collectionPage, setCollectionPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [isBookingFormOpen, setIsBookingFormOpen] = useState(Boolean(selectedGownId));
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [isMissingPhoneModalOpen, setIsMissingPhoneModalOpen] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isSubmitSuccessOpen, setIsSubmitSuccessOpen] = useState(false);
  const [latestSubmittedRental, setLatestSubmittedRental] = useState<Rental | null>(null);
  const [isRentalDetailsOpen, setIsRentalDetailsOpen] = useState(false);
  const [selectedRentalDetails, setSelectedRentalDetails] = useState<Rental | null>(null);
  const [selectedPaymentRental, setSelectedPaymentRental] = useState<Rental | null>(null);
  const [isPayNowConfirmOpen, setIsPayNowConfirmOpen] = useState(false);
  const [isPaymentInstructionsModalOpen, setIsPaymentInstructionsModalOpen] = useState(false);
  const [isSubmitPaymentConfirmOpen, setIsSubmitPaymentConfirmOpen] = useState(false);
  const [paymentReferenceId, setPaymentReferenceId] = useState('');
  const [paymentReceiptFile, setPaymentReceiptFile] = useState<File | null>(null);
  const [paymentSubmitError, setPaymentSubmitError] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isSchedulePickupModalOpen, setIsSchedulePickupModalOpen] = useState(false);
  const [isSchedulePickupConfirmOpen, setIsSchedulePickupConfirmOpen] = useState(false);
  const [selectedSchedulePickupRental, setSelectedSchedulePickupRental] = useState<Rental | null>(null);
  const [pickupScheduleTime, setPickupScheduleTime] = useState('08:00');
  const [pickupScheduleError, setPickupScheduleError] = useState('');
  const [isSubmittingPickupSchedule, setIsSubmittingPickupSchedule] = useState(false);
  const isAnyRentalModalOpen =
    isSubmitConfirmOpen ||
    isMissingPhoneModalOpen ||
    isSubmitSuccessOpen ||
    isRentalDetailsOpen ||
    isPayNowConfirmOpen ||
    isPaymentInstructionsModalOpen ||
    isSubmitPaymentConfirmOpen ||
    isSchedulePickupModalOpen ||
    isSchedulePickupConfirmOpen;
  const touchedFieldsRef = useRef<Partial<Record<RentalField, boolean>>>({});
  const cancelSubmitButtonRef = useRef<HTMLButtonElement>(null);
  const confirmSubmitButtonRef = useRef<HTMLButtonElement>(null);
  const successSubmitButtonRef = useRef<HTMLButtonElement>(null);

  useModalInteractionLock(isAnyRentalModalOpen);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      customerName: prev.customerName || defaultName,
      contactNumber: prev.contactNumber || user.phoneNumber || '',
      email: prev.email || user.email || '',
    }));
  }, [defaultName, user.email, user.phoneNumber]);

  useEffect(() => {
    let isMounted = true;

    const applyPrefill = async () => {
      setIsPrefillLoading(true);
      setPrefillError('');

      try {
        const customerData = await customerAPI.getCustomer(token);
        if (!isMounted) return;

        const preferredName = `${customerData.firstName || user.firstName} ${customerData.lastName || user.lastName}`.trim();
        const preferredBranch = normalizeBranch(customerData.preferredBranch);

        setFormData((prev) => ({
          ...prev,
          customerName: touchedFieldsRef.current.customerName ? prev.customerName : preferredName,
          contactNumber: touchedFieldsRef.current.contactNumber ? prev.contactNumber : (customerData.phoneNumber || user.phoneNumber || ''),
          email: touchedFieldsRef.current.email ? prev.email : (customerData.email || user.email || ''),
          branch: touchedFieldsRef.current.branch ? prev.branch : normalizeBranch(preferredBranch),
        }));
      } catch (error) {
        if (!isMounted) return;
        setPrefillError(error instanceof Error ? error.message : 'Failed to load account details.');
      } finally {
        if (isMounted) {
          setIsPrefillLoading(false);
        }
      }
    };

    void applyPrefill();

    return () => {
      isMounted = false;
    };
  }, [token, user.email, user.firstName, user.lastName, user.phoneNumber]);

  useEffect(() => {
    let isMounted = true;

    const loadMyRentals = async () => {
      setRentalsLoading(true);
      setRentalsError('');

      try {
        const myRentals = await rentalAPI.getMyRentals(token);
        if (!isMounted) return;

        setRentals(
          myRentals.map((rental) => ({
            id: rental.id,
            referenceId: rental.referenceId ?? rental.id,
            gownName: rental.gownName,
            sku: rental.sku,
            startDate: rental.startDate,
            endDate: rental.endDate,
            status: rental.status,
            totalPrice: rental.totalPrice,
            downpayment: rental.downpayment,
            branch: rental.branch,
            eventType: rental.eventType,
            paymentSubmittedAt: rental.paymentSubmittedAt,
            paymentAmountPaid: rental.paymentAmountPaid,
            paymentReferenceNumber: rental.paymentReferenceNumber,
            paymentReceiptUrl: rental.paymentReceiptUrl,
            paymentReceiptFilename: rental.paymentReceiptFilename,
            rejectionReason: rental.rejectionReason,
            rejectedAt: rental.rejectedAt,
            pickupScheduleDate: rental.pickupScheduleDate,
            pickupScheduleTime: rental.pickupScheduleTime,
          }))
        );
      } catch (error) {
        if (!isMounted) return;
        setRentalsError(error instanceof Error ? error.message : 'Failed to load your rentals.');
      } finally {
        if (isMounted) {
          setRentalsLoading(false);
        }
      }
    };

    void loadMyRentals();

    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    let isMounted = true;

    const loadInventory = async () => {
      setInventoryLoading(true);
      setInventoryError('');

      try {
        const items = await getPublicInventory();
        if (!isMounted) return;

        const rentableItems = items
          .filter((item) => item.status !== 'archived' && item.status !== 'maintenance')
          .map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            branch: item.branch,
            status: item.status,
            sku: item.sku,
            category: item.category,
            color: item.color,
            image: item.image,
            description: item.description,
          }));

        setInventoryItems(rentableItems);
      } catch (error) {
        if (!isMounted) return;
        setInventoryError(error instanceof Error ? error.message : 'Failed to load available gowns.');
      } finally {
        if (isMounted) {
          setInventoryLoading(false);
        }
      }
    };

    void loadInventory();

    const handleInventoryUpdated = () => {
      void loadInventory();
    };

    window.addEventListener(INVENTORY_UPDATED_EVENT, handleInventoryUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener(INVENTORY_UPDATED_EVENT, handleInventoryUpdated);
    };
  }, []);

  useEffect(() => {
    if (!formData.gownId) {
      setUnavailableRentalDates([]);
      setAvailabilityError('');
      return;
    }

    let isMounted = true;

    const loadAvailability = async () => {
      setAvailabilityLoading(true);
      setAvailabilityError('');

      try {
        const availability = await rentalAPI.getAvailability(token, {
          gownId: formData.gownId,
          startDate: tomorrow,
          endDate: availabilityWindowEnd,
        });

        if (!isMounted) return;
        setUnavailableRentalDates(availability.unavailableDates);
      } catch (error) {
        if (!isMounted) return;
        setUnavailableRentalDates([]);
        setAvailabilityError(error instanceof Error ? error.message : 'Failed to load gown availability.');
      } finally {
        if (isMounted) {
          setAvailabilityLoading(false);
        }
      }
    };

    void loadAvailability();

    return () => {
      isMounted = false;
    };
  }, [availabilityWindowEnd, formData.gownId, token, tomorrow]);

  // Prefill gown when selectedGownId is provided
  useEffect(() => {
    if (selectedGownId) {
      openBookingForm(selectedGownId);
    }
  }, [selectedGownId]);

  const updateField = (field: RentalField, value: string) => {
    touchedFieldsRef.current = { ...touchedFieldsRef.current, [field]: true };
    setTouchedFields((prev) => ({ ...prev, [field]: true }));
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const openBookingForm = (gownId: string) => {
    setActiveTab('new');
    updateField('gownId', gownId);
    setSubmitError('');
    setIsBookingFormOpen(true);
  };

  const returnToCollection = () => {
    setSubmitError('');
    setIsBookingFormOpen(false);
  };

  const handleStartDateChange = (value: string) => {
    const minimumEndDate = value ? addDaysToDateString(value, 1) : '';

    setFormData((prev) => ({
      ...prev,
      startDate: value,
      endDate: prev.endDate && prev.endDate < minimumEndDate ? '' : prev.endDate,
    }));

    setIsStartDatePopoverOpen(false);
    setShouldAutoOpenEndDate(Boolean(value));
  };

  useEffect(() => {
    if (!shouldAutoOpenEndDate) return;
    if (!formData.gownId || !formData.startDate || availabilityLoading) return;

    const openTimer = window.setTimeout(() => {
      setIsEndDatePopoverOpen(true);
      setShouldAutoOpenEndDate(false);
    }, 0);

    return () => {
      window.clearTimeout(openTimer);
    };
  }, [availabilityLoading, formData.gownId, formData.startDate, shouldAutoOpenEndDate]);

  const handleEndDatePopoverOpenChange = (open: boolean) => {
    if (!formData.startDate || !formData.gownId || availabilityLoading) {
      setIsEndDatePopoverOpen(false);
      return;
    }

    setIsEndDatePopoverOpen(open);
  };

  const minimumEndDate = useMemo(() => {
    if (!formData.startDate) return tomorrow;
    return addDaysToDateString(formData.startDate, 1) || tomorrow;
  }, [formData.startDate, tomorrow]);

  const unavailableDateSet = useMemo(() => new Set(unavailableRentalDates), [unavailableRentalDates]);
  const firstUnavailableEndDate = useMemo(() => {
    if (!formData.startDate) return null;

    return unavailableRentalDates.find((value) => value >= minimumEndDate) || null;
  }, [formData.startDate, minimumEndDate, unavailableRentalDates]);

  const isStartDateDisabled = (date: Date) => {
    const normalized = formatDateOnly(date);
    return normalized < tomorrow || unavailableDateSet.has(normalized);
  };

  const isEndDateDisabled = (date: Date) => {
    const normalized = formatDateOnly(date);
    if (normalized < minimumEndDate) return true;
    if (unavailableDateSet.has(normalized)) return true;
    if (firstUnavailableEndDate && normalized >= firstUnavailableEndDate) return true;
    return false;
  };

  const selectedGown = useMemo(
    () => inventoryItems.find((item) => item.id === formData.gownId) ?? null,
    [formData.gownId, inventoryItems]
  );

  const collectionCategories = useMemo(
    () => ['All', ...new Set(inventoryItems.map((item) => item.category).filter(Boolean))],
    [inventoryItems]
  );

  const visibleCollectionItems = useMemo(() => {
    if (selectedCollectionCategory === 'All') return inventoryItems;
    return inventoryItems.filter((item) => item.category === selectedCollectionCategory);
  }, [inventoryItems, selectedCollectionCategory]);

  useEffect(() => {
    setCollectionPage(1);
  }, [selectedCollectionCategory]);

  const totalCollectionPages = Math.max(1, Math.ceil(visibleCollectionItems.length / RENTAL_COLLECTION_PAGE_SIZE));
  const safeCollectionPage = Math.min(collectionPage, totalCollectionPages);
  const paginatedCollectionItems = visibleCollectionItems.slice(
    (safeCollectionPage - 1) * RENTAL_COLLECTION_PAGE_SIZE,
    safeCollectionPage * RENTAL_COLLECTION_PAGE_SIZE,
  );
  const collectionStart = visibleCollectionItems.length === 0 ? 0 : (safeCollectionPage - 1) * RENTAL_COLLECTION_PAGE_SIZE + 1;
  const collectionEnd = Math.min(safeCollectionPage * RENTAL_COLLECTION_PAGE_SIZE, visibleCollectionItems.length);

  const rentalDurationDays = useMemo(() => {
    if (!formData.startDate || !formData.endDate) return null;

    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return null;
    }

    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    return Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;
  }, [formData.endDate, formData.startDate]);

  const rentalTotal = selectedGown && rentalDurationDays ? selectedGown.price * rentalDurationDays : 0;
  const rentalDownpayment = rentalTotal / 2;
  const currentRentals = useMemo(
    () => rentals.filter((rental) => rental.status !== 'completed' && rental.status !== 'cancelled'),
    [rentals]
  );
  const rentalHistory = useMemo(
    () => rentals.filter((rental) => rental.status === 'completed' || rental.status === 'cancelled'),
    [rentals]
  );
  const totalHistoryPages = Math.max(1, Math.ceil(rentalHistory.length / RENTAL_HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const paginatedRentalHistory = rentalHistory.slice(
    (safeHistoryPage - 1) * RENTAL_HISTORY_PAGE_SIZE,
    safeHistoryPage * RENTAL_HISTORY_PAGE_SIZE,
  );

  useEffect(() => {
    setHistoryPage(1);
  }, [activeTab, rentalHistory.length]);

  useEffect(() => {
    setFormData((prev) => {
      if (!prev.startDate && !prev.endDate) {
        return prev;
      }

      const nextState = { ...prev };
      let hasChanges = false;

      if (prev.startDate && (prev.startDate < tomorrow || unavailableDateSet.has(prev.startDate))) {
        nextState.startDate = '';
        nextState.endDate = '';
        hasChanges = true;
      }

      if (nextState.endDate) {
        const startValue = nextState.startDate;
        const nextMinimumEndDate = startValue
          ? addDaysToDateString(startValue, 1)
          : tomorrow;

        const nextFirstUnavailableEndDate = startValue
          ? unavailableRentalDates.find((value) => value >= nextMinimumEndDate) || null
          : null;

        if (
          nextState.endDate < nextMinimumEndDate ||
          unavailableDateSet.has(nextState.endDate) ||
          (nextFirstUnavailableEndDate && nextState.endDate >= nextFirstUnavailableEndDate)
        ) {
          nextState.endDate = '';
          hasChanges = true;
        }
      }

      return hasChanges ? nextState : prev;
    });
  }, [tomorrow, unavailableDateSet, unavailableRentalDates]);

  useEffect(() => {
    if (!selectedGown) return;
    setFormData((prev) => {
      const nextBranch = normalizeBranch(selectedGown.branch);
      if (prev.branch === nextBranch) return prev;
      return { ...prev, branch: nextBranch };
    });
  }, [selectedGown]);

  useEffect(() => {
    if (!isSubmitConfirmOpen) return;

    cancelSubmitButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmittingRequest) {
        setIsSubmitConfirmOpen(false);
        return;
      }

      if (event.key === 'Tab') {
        const cancelElement = cancelSubmitButtonRef.current;
        const confirmElement = confirmSubmitButtonRef.current;
        if (!cancelElement || !confirmElement) return;

        const activeElement = document.activeElement;
        if (event.shiftKey && activeElement === cancelElement) {
          event.preventDefault();
          confirmElement.focus();
        } else if (!event.shiftKey && activeElement === confirmElement) {
          event.preventDefault();
          cancelElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSubmitConfirmOpen, isSubmittingRequest]);

  useEffect(() => {
    if (!isSubmitSuccessOpen) return;
    successSubmitButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSubmitSuccessOpen(false);
        setActiveTab('existing');
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSubmitSuccessOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!hasPhoneNumber(formData.contactNumber)) {
      setIsMissingPhoneModalOpen(true);
      return;
    }

    setIsSubmitConfirmOpen(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmittingRequest(true);
    setSubmitError('');

    try {
      const created = await rentalAPI.createRental(token, {
        gownId: formData.gownId,
        startDate: formData.startDate,
        endDate: formData.endDate,
        branch: formData.branch,
        eventType: formData.eventType,
      });

      const submittedRental: Rental = {
        id: created.id,
        referenceId: created.referenceId ?? created.id,
        gownName: created.gownName,
        sku: created.sku,
        startDate: created.startDate,
        endDate: created.endDate,
        status: created.status,
        totalPrice: created.totalPrice,
        downpayment: created.downpayment,
        branch: created.branch,
        eventType: created.eventType,
      };

      setRentals((prev) => [submittedRental, ...prev]);
      setLatestSubmittedRental(submittedRental);
      setIsSubmitConfirmOpen(false);
      setIsSubmitSuccessOpen(true);
      setIsBookingFormOpen(false);
      setFormData({
        gownId: '',
        startDate: '',
        endDate: '',
        branch: 'Taguig Main',
        customerName: defaultName,
        contactNumber: user.phoneNumber || '',
        email: user.email || '',
        eventType: '',
      });
      touchedFieldsRef.current = {};
      setTouchedFields({});
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit rental request.');
      setIsSubmitConfirmOpen(false);
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleSuccessAcknowledge = () => {
    setIsSubmitSuccessOpen(false);
    setActiveTab('existing');
  };

  const scrollPageToTop = () => {
    const scrollingElement = document.scrollingElement || document.documentElement || document.body;

    window.requestAnimationFrame(() => {
      scrollingElement.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const changeCollectionPage = (nextPage: number, button?: HTMLButtonElement | null) => {
    button?.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setCollectionPage(nextPage);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollPageToTop();
      });
    });
  };

  const pickupTimeOptions = useMemo(() => ([
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
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3 border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-black text-black font-medium'
                : 'border-transparent text-[#6B5D4F] hover:text-black'
            }`}
          >
            Rental History
          </button>
        </div>

        {/* New Rental Form */}
        {activeTab === 'new' && (
          !isBookingFormOpen ? (
            <section className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
              <div className="mb-10">
                <div>
                  <h2 className="font-serif text-4xl font-light text-black mb-4">Choose From Our Collection</h2>
                  <p className="text-lg text-[#6B5D4F] max-w-2xl">
                    Browse available gowns first, then continue to the booking form with your selected piece already filled in.
                  </p>
                </div>
              </div>

              <div className="mb-10 space-y-6">
                <div className="flex flex-wrap gap-2">
                  {collectionCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedCollectionCategory(category)}
                      className={`px-6 py-2 text-xs uppercase tracking-[0.15em] transition-all ${
                        selectedCollectionCategory === category
                          ? 'bg-[#1a1a1a] text-white'
                          : 'bg-white border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#1a1a1a]'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                {!inventoryLoading && !inventoryError && (
                  <div className="text-sm text-[#6B5D4F]">
                    Showing {collectionStart}-{collectionEnd} of {visibleCollectionItems.length} {visibleCollectionItems.length === 1 ? 'gown' : 'gowns'}
                  </div>
                )}
              </div>

              {inventoryError && (
                <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status" aria-live="polite">
                  {inventoryError}
                </div>
              )}

              {inventoryLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="overflow-hidden bg-white animate-pulse">
                      <div className="relative aspect-[3/4] bg-[#F5F1E8]" />
                      <div className="p-6 space-y-3">
                        <div className="h-4 w-1/3 bg-[#F5EFE6] rounded" />
                        <div className="h-8 w-2/3 bg-[#F5EFE6] rounded" />
                        <div className="h-4 w-1/4 bg-[#F5EFE6] rounded" />
                        <div className="h-4 w-1/2 bg-[#F5EFE6] rounded" />
                        <div className="flex items-end justify-between pt-2">
                          <div className="space-y-2 w-1/3">
                            <div className="h-3 bg-[#F5EFE6] rounded" />
                            <div className="h-8 bg-[#F5EFE6] rounded" />
                          </div>
                          <div className="h-9 w-24 bg-[#F5EFE6] rounded" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : visibleCollectionItems.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {paginatedCollectionItems.map((item) => {
                    const isSelected = formData.gownId === item.id;

                    return (
                      <article
                        key={item.id}
                        className={`group bg-white overflow-hidden transition-shadow cursor-pointer ${
                          isSelected
                            ? 'shadow-lg ring-1 ring-[#1a1a1a]'
                            : 'hover:shadow-lg'
                        }`}
                        onClick={() => openBookingForm(item.id)}
                      >
                        <div className="relative aspect-[3/4] overflow-hidden bg-[#F5F1E8]">
                          {item.image ? (
                            <ImageWithFallback
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-[#8D7B68] text-sm tracking-[0.2em] uppercase">
                              FabriQ Collection
                            </div>
                          )}

                        </div>
                        <div className="p-6">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex items-center">
                              <Star className="w-4 h-4 fill-[#D4AF37] text-[#D4AF37]" />
                              <span className="text-sm text-[#6B5D4F] ml-1">4.8</span>
                            </div>
                            <span className="text-xs text-[#6B5D4F]">•</span>
                            <span className="text-xs text-[#6B5D4F] uppercase tracking-wider">
                              {item.category || 'Gown'}
                            </span>
                          </div>

                          <h3 className="font-serif text-2xl mb-2">{item.name}</h3>

                          <p className="text-sm text-[#6B5D4F] mb-3">{item.color}</p>

                          <div className="flex items-center gap-2 text-xs text-[#6B5D4F] mb-4">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{normalizeBranch(item.branch)}</span>
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-xs text-[#6B5D4F] uppercase tracking-wider mb-1">
                              Rental Price
                              </div>
                              <div className="font-serif text-2xl">₱{item.price.toLocaleString()}</div>
                              <div className="text-xs text-[#6B5D4F]">per day</div>
                            </div>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openBookingForm(item.id);
                              }}
                              className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
                                isSelected
                                  ? 'bg-[#6B5D4F] text-white'
                                  : 'bg-[#1a1a1a] text-white hover:bg-[#D4AF37]'
                              }`}
                            >
                              {isSelected ? 'Selected' : 'Book Now'}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#E8DCC8] bg-[#FCFAF5] px-6 py-12 text-center text-[#6B5D4F]">
                  No available gowns found for this collection yet.
                </div>
              )}

              {visibleCollectionItems.length > RENTAL_COLLECTION_PAGE_SIZE && !inventoryLoading && !inventoryError && (
                <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
                  <p className="text-sm text-[#6B5D4F] leading-none">
                    Page {safeCollectionPage} of {totalCollectionPages}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(event) => changeCollectionPage(Math.max(1, safeCollectionPage - 1), event.currentTarget)}
                      disabled={safeCollectionPage === 1}
                      className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={(event) => changeCollectionPage(Math.min(totalCollectionPages, safeCollectionPage + 1), event.currentTarget)}
                      disabled={safeCollectionPage === totalCollectionPages}
                      className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {!inventoryLoading && !inventoryError && visibleCollectionItems.length > 0 && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={scrollPageToTop}
                    className="px-6 py-3 border border-[#E8DCC8] rounded-full text-sm text-[#6B5D4F] hover:border-[#1a1a1a] hover:text-black transition-colors"
                  >
                    Back to Top
                  </button>
                </div>
              )}
            </section>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#E8DCC8] p-8" aria-busy={isPrefillLoading}>
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 pr-4">
                  <h2 className="text-2xl font-light text-black">Book a Rental</h2>
                  <p className="text-sm text-[#6B5D4F] mt-1">
                    {selectedGown ? `Booking ${selectedGown.name}` : 'Complete the rental details for your selected gown.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={returnToCollection}
                  className="shrink-0 self-start px-4 py-2 text-xs uppercase tracking-[0.15em] border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#1a1a1a] hover:text-black transition-colors"
                >
                  Back to Collections
                </button>
              </div>
              {isPrefillLoading && (
                <p className="sr-only" aria-live="polite">
                  Loading your account details into the rental form.
                </p>
              )}
              {prefillError && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status" aria-live="polite">
                  {prefillError}
                </div>
              )}
              {submitError && (
                <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status" aria-live="polite">
                  {submitError}
                </div>
              )}

              <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.customerName}
                    readOnly
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] bg-[#F7F1E7] text-[#6B5D4F] focus:outline-none transition-colors"
                    placeholder="Enter your name"
                    autoComplete="name"
                    aria-label="Customer name"
                    aria-readonly="true"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Contact Number *</label>
                  <input
                    type="tel"
                    required
                    value={formatPhilippinePhoneNumber(formData.contactNumber)}
                    readOnly
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] bg-[#F7F1E7] text-[#6B5D4F] focus:outline-none transition-colors"
                    placeholder={formData.contactNumber ? '+63 912 345 6789' : 'Please verify your contact number first'}
                    autoComplete="tel"
                    inputMode="tel"
                    aria-label="Contact number"
                    aria-readonly="true"
                    pattern="^[+]?[-() 0-9]{7,}$"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-[#6B5D4F] mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  readOnly
                  className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] bg-[#F7F1E7] text-[#6B5D4F] focus:outline-none transition-colors"
                  placeholder="Enter your email"
                  autoComplete="email"
                  aria-label="Email address"
                  aria-readonly="true"
                />
              </div>

              <div>
                <label className="block text-sm text-[#6B5D4F] mb-2">Gown Selection *</label>
                <select
                  required
                  value={formData.gownId}
                  onChange={(e) => {
                    updateField('gownId', e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      startDate: '',
                      endDate: '',
                    }));
                  }}
                  className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                  aria-label="Gown selection"
                  disabled={inventoryLoading}
                >
                  <option value="">
                    {inventoryLoading ? 'Loading available gowns...' : 'Select a gown'}
                  </option>
                  {inventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.sku}) - ₱{item.price.toLocaleString()}/day
                    </option>
                  ))}
                </select>
                {!inventoryLoading && !inventoryError && inventoryItems.length === 0 && (
                  <p className="mt-2 text-sm text-[#6B5D4F]" role="status" aria-live="polite">
                    No rentable gowns are currently listed in inventory management.
                  </p>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Start Date *</label>
                  <Popover open={isStartDatePopoverOpen} onOpenChange={setIsStartDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] text-left focus:outline-none focus:border-[#D4AF37] transition-colors disabled:cursor-not-allowed disabled:bg-[#F7F1E7] disabled:text-[#9C8B7A]"
                        disabled={!formData.gownId || availabilityLoading}
                      >
                        <span className={formData.startDate ? 'text-black' : 'text-[#8D7B68]'}>
                          {availabilityLoading ? 'Loading availability...' : formatDateLabel(formData.startDate)}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto border border-[#E8DCC8] bg-white p-0 opacity-100 shadow-xl" align="start">
                      <DateCalendar
                        className="rounded-md bg-white"
                        mode="single"
                        selected={parseDateOnly(formData.startDate) || undefined}
                        onSelect={(date: Date | undefined) => {
                          if (!date) return;
                          handleStartDateChange(formatDateOnly(date));
                        }}
                        disabled={isStartDateDisabled}
                        defaultMonth={parseDateOnly(formData.startDate) || parseDateOnly(tomorrow) || undefined}
                      />
                    </PopoverContent>
                  </Popover>
                  <input type="hidden" name="startDate" value={formData.startDate} required />
                </div>
                
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">End Date *</label>
                  <Popover open={isEndDatePopoverOpen} onOpenChange={handleEndDatePopoverOpenChange}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] text-left focus:outline-none focus:border-[#D4AF37] transition-colors disabled:cursor-not-allowed disabled:bg-[#F7F1E7] disabled:text-[#9C8B7A]"
                        disabled={!formData.gownId || !formData.startDate || availabilityLoading}
                      >
                        <span className={formData.endDate ? 'text-black' : 'text-[#8D7B68]'}>
                          {availabilityLoading ? 'Loading availability...' : formatDateLabel(formData.endDate)}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto border border-[#E8DCC8] bg-white p-0 opacity-100 shadow-xl" align="start">
                      <DateCalendar
                        className="rounded-md bg-white"
                        mode="single"
                        selected={parseDateOnly(formData.endDate) || undefined}
                        onSelect={(date: Date | undefined) => {
                          if (!date) return;
                          setFormData((prev) => ({ ...prev, endDate: formatDateOnly(date) }));
                          setIsEndDatePopoverOpen(false);
                        }}
                        disabled={isEndDateDisabled}
                        defaultMonth={parseDateOnly(formData.endDate) || parseDateOnly(minimumEndDate) || undefined}
                      />
                    </PopoverContent>
                  </Popover>
                  <input type="hidden" name="endDate" value={formData.endDate} required />
                </div>
              </div>

              {availabilityError && (
                <div className="rounded-lg border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-sm text-[#6B5D4F]">
                  <p>{availabilityError}</p>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Branch Location *</label>
                  <input
                    type="text"
                    value={formData.branch}
                    readOnly
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] bg-[#F7F1E7] text-[#6B5D4F] focus:outline-none transition-colors disabled:cursor-not-allowed"
                    aria-label="Branch location"
                    aria-readonly="true"
                  />
                </div>
                
                <div>
                    <label className="block text-sm text-[#6B5D4F] mb-2">Event Type *</label>
                  <input
                    type="text"
                      required
                    value={formData.eventType}
                    onChange={(e) => updateField('eventType', e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    placeholder="e.g., Wedding, Gala, Prom"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="bg-[#F5EFE6] rounded-lg p-6">
                <h3 className="font-medium text-black mb-3">Rental Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#6B5D4F]">Rental Duration</span>
                    <span className="text-black">
                      {rentalDurationDays ? `${rentalDurationDays} day${rentalDurationDays > 1 ? 's' : ''}` : 'Calculate based on dates'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B5D4F]">Daily Rate</span>
                    <span className="text-black">
                      {selectedGown ? `₱${selectedGown.price.toLocaleString()}/day` : 'Select gown first'}
                    </span>
                  </div>
                  <div className="flex justify-between font-medium text-base pt-2 border-t border-[#E8DCC8]">
                    <span className="text-black">Downpayment (50%)</span>
                    <span className="text-black">₱{rentalDownpayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
          )
        )}

        {/* Existing Rentals */}
        {activeTab === 'existing' && (
          <div className="space-y-4 overflow-hidden">
            {rentalsError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status" aria-live="polite">
                {rentalsError}
              </div>
            )}

            {rentalsLoading && (
              <div className="text-center py-10 bg-white rounded-2xl border border-[#E8DCC8] text-[#6B5D4F]" role="status" aria-live="polite">
                Loading your rentals...
              </div>
            )}

            {!rentalsLoading && currentRentals.map((rental) => (
              <div
                key={rental.id}
                className="bg-white rounded-2xl border border-[#E8DCC8] p-6 hover:border-[#D4AF37] transition-colors cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedRentalDetails(rental);
                  setIsRentalDetailsOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedRentalDetails(rental);
                    setIsRentalDetailsOpen(true);
                  }
                }}
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
                          : rental.status === 'for_payment'
                          ? 'bg-rose-100 text-rose-800'
                          : rental.status === 'paid_for_confirmation'
                          ? 'bg-violet-100 text-violet-800'
                          : rental.status === 'for_pickup'
                          ? 'bg-cyan-100 text-cyan-800'
                          : rental.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-[#F5EFE6] text-[#6B5D4F]'
                      }`}>
                        {rental.status === 'paid_for_confirmation'
                          ? 'Paid - For Confirmation'
                          : rental.status === 'for_pickup'
                            ? 'Schedule Pickup'
                          : rental.status
                            .split('_')
                            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                            .join(' ')}
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
                        <div className="flex flex-col items-start gap-1">
                          {rental.status === 'for_pickup' && (
                            <button
                              type="button"
                              disabled={Boolean(rental.pickupScheduleDate && rental.pickupScheduleTime)}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setPickupScheduleError('');
                                setSelectedSchedulePickupRental(rental);
                                setPickupScheduleTime(rental.pickupScheduleTime || '08:00');
                                setIsSchedulePickupModalOpen(true);
                              }}
                              className="px-3 py-1 rounded-md border border-[#D4AF37] bg-[#FAF7F0] text-xs font-medium text-[#6B5D4F] hover:bg-[#F1E7D8] transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#FAF7F0]"
                            >
                              {rental.pickupScheduleDate && rental.pickupScheduleTime ? 'Pickup Scheduled' : 'Schedule Pickup'}
                            </button>
                          )}
                          {rental.status === 'for_pickup' && rental.pickupScheduleDate && (
                            <span className="text-xs text-[#6B5D4F]">Date: {rental.pickupScheduleDate}</span>
                          )}
                          {rental.status === 'for_pickup' && rental.pickupScheduleTime && (
                            <span className="text-xs text-[#6B5D4F]">Time: {pickupTimeOptions.find((option) => option.value === rental.pickupScheduleTime)?.label || rental.pickupScheduleTime}</span>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Reference ID:</span>
                            <span>{rental.referenceId || rental.id}</span>
                          </div>
                        </div>
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

            {!rentalsLoading && currentRentals.length === 0 && (
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

        {activeTab === 'history' && (
          <div className="space-y-4 overflow-hidden">
            {rentalsError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status" aria-live="polite">
                {rentalsError}
              </div>
            )}

            {rentalsLoading && (
              <div className="text-center py-10 bg-white rounded-2xl border border-[#E8DCC8] text-[#6B5D4F]" role="status" aria-live="polite">
                Loading your rental history...
              </div>
            )}

            {!rentalsLoading && paginatedRentalHistory.map((rental) => (
              <div
                key={rental.id}
                className="bg-white rounded-2xl border border-[#E8DCC8] p-6 hover:border-[#D4AF37] transition-colors cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedRentalDetails(rental);
                  setIsRentalDetailsOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedRentalDetails(rental);
                    setIsRentalDetailsOpen(true);
                  }
                }}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-xl font-medium text-black">{rental.gownName}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        rental.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {rental.status
                          .split('_')
                          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                          .join(' ')}
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
                        <span className="font-medium">Reference ID:</span>
                        <span>{rental.referenceId || rental.id}</span>
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

            {!rentalsLoading && rentalHistory.length > RENTAL_HISTORY_PAGE_SIZE && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E8DCC8] bg-white px-6 py-4">
                <p className="text-sm text-[#6B5D4F] leading-none">
                  Page {safeHistoryPage} of {totalHistoryPages}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setHistoryPage(Math.max(1, safeHistoryPage - 1))}
                    disabled={safeHistoryPage === 1}
                    className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryPage(Math.min(totalHistoryPages, safeHistoryPage + 1))}
                    disabled={safeHistoryPage === totalHistoryPages}
                    className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {!rentalsLoading && rentalHistory.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-[#E8DCC8]">
                <Calendar className="w-12 h-12 text-[#E8DCC8] mx-auto mb-4" />
                <h3 className="text-xl text-black mb-2">No rental history yet</h3>
                <p className="text-[#6B5D4F] mb-6">Completed and cancelled rentals will appear here.</p>
              </div>
            )}
          </div>
        )}

        {isSchedulePickupModalOpen && selectedSchedulePickupRental && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-label="Schedule pickup"
            onClick={() => {
              if (!isSubmittingPickupSchedule) setIsSchedulePickupModalOpen(false);
            }}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-6">
                <h3 className="text-2xl font-light text-black">Schedule Pickup</h3>
                <button
                  type="button"
                  disabled={isSubmittingPickupSchedule}
                  onClick={() => setIsSchedulePickupModalOpen(false)}
                  className="p-2 rounded-lg hover:bg-[#FAF7F0] transition-colors disabled:opacity-50"
                  aria-label="Close schedule pickup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-[#6B5D4F] mb-4">
                Pickup date is fixed to the rental start date. Choose your preferred pickup time for {selectedSchedulePickupRental.gownName}.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Pickup Date (Start Date)</label>
                  <input
                    type="date"
                    value={selectedSchedulePickupRental.startDate}
                    readOnly
                    disabled
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] bg-[#F7F1E7] text-[#6B5D4F] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#6B5D4F] mb-2">Pickup Time *</label>
                  <select
                    value={pickupScheduleTime}
                    onChange={(e) => setPickupScheduleTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                  >
                    {pickupTimeOptions.map((timeOption) => (
                      <option key={timeOption.value} value={timeOption.value}>
                        {timeOption.label}
                      </option>
                    ))}
                  </select>
                </div>

                {pickupScheduleError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status" aria-live="polite">
                    {pickupScheduleError}
                  </div>
                )}

                <button
                  type="button"
                  disabled={isSubmittingPickupSchedule}
                  onClick={() => {
                    setPickupScheduleError('');
                    if (!selectedSchedulePickupRental) return;
                    setIsSchedulePickupConfirmOpen(true);
                  }}
                  className="w-full py-3 bg-black text-[#FAF7F0] rounded-lg hover:bg-[#D4AF37] hover:text-black transition-colors disabled:opacity-50"
                >
                  {isSubmittingPickupSchedule ? 'Saving...' : 'Save Pickup Schedule'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isSchedulePickupConfirmOpen && selectedSchedulePickupRental && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
            style={{ zIndex: 60 }}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm pickup schedule"
            onClick={() => {
              if (!isSubmittingPickupSchedule) setIsSchedulePickupConfirmOpen(false);
            }}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-light text-black mb-2">Confirm Pickup Schedule</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Are you sure you want to schedule pickup for this date and time?
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Gown</span>
                  <span className="text-right font-medium text-black">{selectedSchedulePickupRental.gownName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Pickup Date</span>
                  <span className="text-right font-medium text-black">{selectedSchedulePickupRental.startDate}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Pickup Time</span>
                  <span className="text-right font-medium text-black">{pickupTimeOptions.find((option) => option.value === pickupScheduleTime)?.label || pickupScheduleTime}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={isSubmittingPickupSchedule}
                  onClick={() => setIsSchedulePickupConfirmOpen(false)}
                  className="flex-1 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingPickupSchedule}
                  onClick={async () => {
                    setPickupScheduleError('');
                    if (!selectedSchedulePickupRental) return;

                    setIsSubmittingPickupSchedule(true);
                    try {
                      const updated = await rentalAPI.schedulePickup(token, selectedSchedulePickupRental.id, {
                        pickupDate: selectedSchedulePickupRental.startDate,
                        pickupTime: pickupScheduleTime,
                      });

                      setRentals((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
                      setSelectedRentalDetails((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
                      setIsSchedulePickupConfirmOpen(false);
                      setIsSchedulePickupModalOpen(false);
                    } catch (error) {
                      setPickupScheduleError(error instanceof Error ? error.message : 'Failed to schedule pickup.');
                      setIsSchedulePickupConfirmOpen(false);
                    } finally {
                      setIsSubmittingPickupSchedule(false);
                    }
                  }}
                  className="flex-1 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingPickupSchedule ? 'Saving...' : 'Yes, Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isRentalDetailsOpen && selectedRentalDetails && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-label="Rental details"
            onClick={() => setIsRentalDetailsOpen(false)}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-6">
                <h3 className="text-2xl font-light text-black">Rental Details</h3>
                <button
                  type="button"
                  onClick={() => setIsRentalDetailsOpen(false)}
                  className="p-2 rounded-lg hover:bg-[#FAF7F0] transition-colors"
                  aria-label="Close rental details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Gown</span>
                  <span className="text-right font-medium text-black">{selectedRentalDetails.gownName}</span>
                </div>
                {selectedRentalDetails.sku && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">SKU</span>
                    <span className="text-right font-medium text-black">{selectedRentalDetails.sku}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Status</span>
                  <span className="text-right font-medium text-black">
                    {selectedRentalDetails.status === 'paid_for_confirmation'
                      ? 'Paid - For Confirmation'
                      : selectedRentalDetails.status === 'for_pickup'
                        ? 'Schedule Pickup'
                      : selectedRentalDetails.status
                        .split('_')
                        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                        .join(' ')}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Schedule</span>
                  <span className="text-right font-medium text-black">
                    {selectedRentalDetails.startDate} to {selectedRentalDetails.endDate}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Branch</span>
                  <span className="text-right font-medium text-black">{selectedRentalDetails.branch}</span>
                </div>
                {selectedRentalDetails.eventType && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Event Type</span>
                    <span className="text-right font-medium text-black">{selectedRentalDetails.eventType}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4 pt-2 border-t border-[#E8DCC8]">
                  <span className="text-[#6B5D4F]">Total Price</span>
                  <span className="text-right font-medium text-black">₱{selectedRentalDetails.totalPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Downpayment</span>
                  <span className="text-right font-medium text-black">₱{selectedRentalDetails.downpayment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Reference ID</span>
                  <span className="text-right font-medium text-black">{selectedRentalDetails.referenceId || selectedRentalDetails.id}</span>
                </div>
                {selectedRentalDetails.paymentSubmittedAt && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Paid At</span>
                    <span className="text-right font-medium text-black">{new Date(selectedRentalDetails.paymentSubmittedAt).toLocaleString()}</span>
                  </div>
                )}
                {typeof selectedRentalDetails.paymentAmountPaid === 'number' && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Amount Paid</span>
                    <span className="text-right font-medium text-black">₱{selectedRentalDetails.paymentAmountPaid.toLocaleString()}</span>
                  </div>
                )}
                {selectedRentalDetails.paymentReferenceNumber && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Payment Ref #</span>
                    <span className="text-right font-medium text-black">{selectedRentalDetails.paymentReferenceNumber}</span>
                  </div>
                )}
                {selectedRentalDetails.paymentReceiptFilename && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Receipt Image</span>
                    <span className="text-right font-medium text-black">{selectedRentalDetails.paymentReceiptFilename}</span>
                  </div>
                )}
                {selectedRentalDetails.status === 'cancelled' && selectedRentalDetails.rejectionReason && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Rejection Reason</span>
                    <span className="text-right font-medium text-black">{selectedRentalDetails.rejectionReason}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (selectedRentalDetails.status === 'for_payment') {
                    setSelectedPaymentRental(selectedRentalDetails);
                    setIsRentalDetailsOpen(false);
                    setIsPayNowConfirmOpen(true);
                    return;
                  }
                  setIsRentalDetailsOpen(false);
                }}
                className="mt-6 w-full py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
              >
                {selectedRentalDetails.status === 'for_payment' ? 'Pay now' : 'Close'}
              </button>
            </div>
          </div>
        )}

        {isPayNowConfirmOpen && selectedPaymentRental && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm payment action"
            onClick={() => setIsPayNowConfirmOpen(false)}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Confirm Payment</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Are you sure you want to proceed to payment instructions for this rental?
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Gown</span>
                  <span className="text-right font-medium text-black">{selectedPaymentRental.gownName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Balance Due</span>
                  <span className="text-right font-medium text-black">
                    ₱{Math.max(0, selectedPaymentRental.totalPrice - selectedPaymentRental.downpayment).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPayNowConfirmOpen(false)}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPayNowConfirmOpen(false);
                    setIsPaymentInstructionsModalOpen(true);
                  }}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors"
                >
                  Yes, Proceed
                </button>
              </div>
            </div>
          </div>
        )}

        {isPaymentInstructionsModalOpen && selectedPaymentRental && (
                      <div
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        role="dialog"
                        aria-label="Payment Instructions"
                        onClick={() => setIsPaymentInstructionsModalOpen(false)}
                      >
                        <div
                          className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <h3 className="text-2xl font-light text-black">Payment Instructions</h3>
                            <button
                              type="button"
                              onClick={() => setIsPaymentInstructionsModalOpen(false)}
                              className="p-2 rounded-lg hover:bg-[#FAF7F0] transition-colors"
                              aria-label="Close payment instructions"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          <div className="mb-6 space-y-2 text-sm">
                            <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4">
                              <div className="mb-2 font-medium text-black">Pay to any of the following:</div>
                              <div className="mb-1"><span className="font-semibold">Gcash:</span> 09123123123</div>
                              <div className="mb-1"><span className="font-semibold">BDO Account:</span> 1234 5678 9123 1234</div>
                              <div className="mb-1"><span className="font-semibold">BPI Account:</span> 1234 1234 1234 1234</div>
                            </div>
                          </div>

                          <form className="space-y-4" onSubmit={async (e) => {
                            e.preventDefault();
                            setPaymentSubmitError('');

                            const normalizedReferenceId = paymentReferenceId.trim().toUpperCase();
                            if (!/^[A-Z0-9]+$/.test(normalizedReferenceId)) {
                              setPaymentSubmitError('Reference ID must contain only letters and numbers.');
                              return;
                            }

                            setPaymentReferenceId(normalizedReferenceId);
                            setIsSubmitPaymentConfirmOpen(true);
                          }}>
                            <div>
                              <label className="block text-sm text-[#6B5D4F] mb-2">Reference ID *</label>
                              <input
                                type="text"
                                required
                                value={paymentReferenceId}
                                onChange={e => setPaymentReferenceId(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                                className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                                pattern="[A-Za-z0-9]+"
                                placeholder="Enter reference number from your payment"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-[#6B5D4F] mb-2">Upload Payment Receipt *</label>
                              <input
                                type="file"
                                accept="image/*"
                                required
                                onChange={e => {
                                  if (e.target.files && e.target.files[0]) {
                                    setPaymentReceiptFile(e.target.files[0]);
                                  } else {
                                    setPaymentReceiptFile(null);
                                  }
                                }}
                                className="w-full px-4 py-2 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors bg-white file:mr-4 file:rounded-md file:border-0 file:bg-[#F4E7D6] file:px-4 file:py-2 file:text-[#5C4936] file:transition-colors hover:file:bg-[#EEDCC8]"
                              />
                              {paymentReceiptFile && (
                                <div className="mt-2 text-xs text-[#6B5D4F]">Selected: {paymentReceiptFile.name}</div>
                              )}
                            </div>
                            {paymentSubmitError && (
                              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status" aria-live="polite">
                                {paymentSubmitError}
                              </div>
                            )}
                            <button
                              type="submit"
                              disabled={isSubmittingPayment}
                              className="w-full py-3 bg-black text-[#FAF7F0] rounded-lg hover:bg-[#D4AF37] hover:text-black transition-colors disabled:opacity-50"
                            >
                              {isSubmittingPayment ? 'Submitting...' : 'Submit Payment'}
                            </button>
                          </form>
                        </div>
                      </div>
                    )}

        {isSubmitPaymentConfirmOpen && selectedPaymentRental && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm payment submission"
            onClick={() => {
              if (!isSubmittingPayment) setIsSubmitPaymentConfirmOpen(false);
            }}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Confirm Submit Payment</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Are you sure you want to submit this payment proof?
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Reference ID</span>
                  <span className="text-right font-medium text-black">{paymentReferenceId}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Receipt</span>
                  <span className="text-right font-medium text-black">{paymentReceiptFile ? paymentReceiptFile.name : 'No file selected'}</span>
                </div>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsSubmitPaymentConfirmOpen(false)}
                  disabled={isSubmittingPayment}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setPaymentSubmitError('');
                    setIsSubmittingPayment(true);
                    try {
                      if (!selectedPaymentRental || !paymentReceiptFile) {
                        throw new Error('Please provide payment reference and receipt image.');
                      }

                      const updated = await rentalAPI.submitRentalPayment(token, selectedPaymentRental.id, {
                        referenceId: paymentReferenceId,
                        receiptFile: paymentReceiptFile,
                      });

                      setRentals((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
                      setSelectedRentalDetails((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));

                      setIsSubmittingPayment(false);
                      setIsSubmitPaymentConfirmOpen(false);
                      setIsPaymentInstructionsModalOpen(false);
                      setPaymentReferenceId('');
                      setPaymentReceiptFile(null);
                    } catch (error) {
                      setPaymentSubmitError(error instanceof Error ? error.message : 'Failed to submit payment.');
                      setIsSubmitPaymentConfirmOpen(false);
                      setIsSubmittingPayment(false);
                    }
                  }}
                  disabled={isSubmittingPayment}
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingPayment ? 'Submitting...' : 'Yes, Submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isSubmitConfirmOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-label="Confirm rental request"
            onClick={() => {
              if (!isSubmittingRequest) setIsSubmitConfirmOpen(false);
            }}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl sm:text-2xl font-light mb-2">Confirm Rental Request</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Are you sure you want to submit this rental request?
              </p>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Customer</span>
                  <span className="text-right font-medium text-black">{formData.customerName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Gown</span>
                  <span className="text-right font-medium text-black">{selectedGown ? `${selectedGown.name} (${selectedGown.sku})` : 'Not selected'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Schedule</span>
                  <span className="text-right font-medium text-black">
                    {formData.startDate && formData.endDate ? `${formData.startDate} to ${formData.endDate}` : 'Not selected'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Downpayment</span>
                  <span className="text-right font-medium text-black">
                    ₱{rentalDownpayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex flex-row items-center gap-3">
                <button
                  ref={cancelSubmitButtonRef}
                  type="button"
                  onClick={() => setIsSubmitConfirmOpen(false)}
                  disabled={isSubmittingRequest}
                  autoFocus
                  aria-label="Cancel rental request submission"
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  ref={confirmSubmitButtonRef}
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={isSubmittingRequest}
                  aria-label="Confirm rental request submission"
                  className="flex-1 min-w-0 px-4 sm:px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingRequest ? 'Submitting...' : 'Yes, Submit'}
                </button>
              </div>
            </div>
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
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh]"
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

        {isSubmitSuccessOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Rental request submitted"
          >
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 max-h-[90vh]">
              <h3 className="text-xl sm:text-2xl font-light mb-2">Request Submitted</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">
                Rental request submitted successfully. Our team will review your booking details shortly.
              </p>

              {latestSubmittedRental && (
                <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Rental ID</span>
                    <span className="text-right font-medium text-black">{latestSubmittedRental.id}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Gown</span>
                    <span className="text-right font-medium text-black">{latestSubmittedRental.gownName}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Status</span>
                    <span className="text-right font-medium text-amber-800">Pending</span>
                  </div>
                </div>
              )}

              <button
                ref={successSubmitButtonRef}
                type="button"
                onClick={handleSuccessAcknowledge}
                className="w-full px-6 py-3 text-white font-medium rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40"
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