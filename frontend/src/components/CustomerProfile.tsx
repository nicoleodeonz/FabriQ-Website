import React, { useState, useCallback, ChangeEvent, JSX, useEffect, useRef } from 'react';
import { User, Ruler, History, Heart, Eye, EyeOff, X } from 'lucide-react';
import type { FavoriteGown } from '../App';
import { customerAPI, type CustomerProfileResponse } from '../services/customerAPI';
import { rentalAPI, type RentalDetail } from '../services/rentalAPI';
import { appointmentAPI } from '../services/appointmentAPI';
import { authAPI } from '../services/authAPI';
import { EditProfileModal } from './EditProfileModal.tsx';
import { GownDetailsModal } from './GownDetailsModal';
import { MobileVerificationModal } from './MobileVerificationModal';

interface MeasurementValues {
  bust: string;
  waist: string;
  hips: string;
  height: string;
  shoulderWidth: string;
  sleeveLength: string;
}

const emptyMeasurements: MeasurementValues = {
  bust: '', waist: '', hips: '', height: '', shoulderWidth: '', sleeveLength: ''
};

const MEASUREMENT_LABELS = [
  { key: 'bust' as const, label: 'Bust', unit: 'in', min: 0.1, max: 99, placeholder: 'e.g. 34', maxLength: 2 },
  { key: 'waist' as const, label: 'Waist', unit: 'in', min: 0.1, max: 99, placeholder: 'e.g. 26', maxLength: 2 },
  { key: 'hips' as const, label: 'Hips', unit: 'in', min: 0.1, max: 99, placeholder: 'e.g. 36', maxLength: 2 },
  { key: 'height' as const, label: 'Height', unit: 'cm', min: 50, max: 250, placeholder: 'e.g. 165', maxLength: 3 },
  { key: 'shoulderWidth' as const, label: 'Shoulder Width', unit: 'in', min: 0.1, max: 99, placeholder: 'e.g. 15', maxLength: 2 },
  { key: 'sleeveLength' as const, label: 'Sleeve Length', unit: 'in', min: 0.1, max: 99, placeholder: 'e.g. 23', maxLength: 2 },
] as const;

interface OrderHistory {
  id: string;
  type: 'Rental' | 'Appointment';
  item: string;
  date: string;
  status: string;
  branch?: string;
  rentalDetails?: RentalDetail;
}

type HistoryTypeFilter = 'all' | OrderHistory['type'];
type HistoryStatusFilter = 'all' | 'Completed' | 'Cancelled' | 'Upcoming' | 'Pending';

const HISTORY_PAGE_SIZE = 4;
const HISTORY_TYPE_FILTER_OPTIONS: Exclude<HistoryTypeFilter, 'all'>[] = ['Rental', 'Appointment'];
const HISTORY_STATUS_FILTER_OPTIONS: Exclude<HistoryStatusFilter, 'all'>[] = ['Completed', 'Cancelled', 'Upcoming', 'Pending'];

interface CustomerProfileProps {
  onLogout: () => void;
  onForceReauth?: (message?: string) => void;
  onUserUpdated?: (profile: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    phoneVerified?: boolean;
    phoneVerifiedAt?: string | null;
  }) => void;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    phoneNumber?: string;
    phoneVerified?: boolean;
    phoneVerifiedAt?: string | null;
  };
  token: string;
  favoriteGowns: FavoriteGown[];
  onRemoveFavorite: (gownId: string) => void;
  navigateWithGown: (view: 'rentals' | 'appointments', gownId: string) => void;
  isAdmin: boolean;
}

function formatHistoryDate(value?: string) {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-CA');
}

function formatAppointmentTypeLabel(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatHistoryStatus(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatCurrency(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Not available';
  return `PHP ${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ProfileInputProps {
  label: string;
  labelAdornment?: React.ReactNode;
  value: string | undefined;
  onChange?: (value: string) => void;
  type?: string;
  error?: string | string[] | { requirement: string; met: boolean }[];
  className?: string;
  showPasswordToggle?: boolean;
  isPasswordVisible?: boolean;
  togglePasswordVisibility?: () => void;
  disabled?: boolean;
  lettersOnly?: boolean;
  isPhone?: boolean;
  onBlur?: () => void;
  validateOnChange?: boolean;
}

const ProfileInput = React.memo(({
  label,
  labelAdornment,
  value,
  onChange,
  type = 'text',
  error,
  className = '',
  showPasswordToggle = false,
  isPasswordVisible = false,
  togglePasswordVisibility,
  disabled = false,
  lettersOnly = false,
  isPhone = false,
  validateOnChange = false,
  onBlur,
  ...props
}: ProfileInputProps & { onBlur?: () => void }) => {
  const isPassword = type === 'password';
  const normalizedValue = value ?? '';
  const formatPhone = (raw: string) => {
    if (raw.length === 0) return '';
    let formatted = '+63 ';
    if (raw.length >= 1) formatted += raw.slice(0, 3);
    if (raw.length >= 4) formatted += ' ' + raw.slice(3, 7);
    if (raw.length >= 8) formatted += ' ' + raw.slice(7, 10);
    return formatted.trim();
  };

  const [localValue, setLocalValue] = useState(
    isPhone
      ? normalizedValue.replace(/^\+63\s*/, '').replace(/\s/g, '').replace(/[^0-9]/g, '')
      : normalizedValue
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(
      isPhone
        ? normalizedValue.replace(/^\+63\s*/, '').replace(/\s/g, '').replace(/[^0-9]/g, '')
        : normalizedValue
    );
  }, [normalizedValue, isPhone]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (isPhone) {
      let digits = e.target.value.replace(/^\+63\s*/, '').replace(/\s/g, '').replace(/[^0-9]/g, '');
      if (digits.length > 0 && digits[0] !== '9') {
        digits = '9' + digits.slice(1);
      }
      digits = digits.slice(0, 10);
      setLocalValue(digits);
    } else {
      const nextValue = e.target.value;
      setLocalValue(nextValue);
      if (validateOnChange && onChange) {
        onChange(nextValue);
      }
    }
  };

  const handleBlur = () => {
    let processedValue = localValue;
    if (isPhone) {
      processedValue = formatPhone(localValue);
      setLocalValue(processedValue);
    } else if (lettersOnly) {
      processedValue = processedValue.replace(/[^a-zA-Z\s]/g, '');
    }
    if (!validateOnChange && onChange) onChange(processedValue);
    if (onBlur) onBlur();
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-sm text-[#6B5D4F]">{label}</label>
        {labelAdornment}
      </div>

      <div className="relative">
        <input
          ref={inputRef}
          type={isPassword && isPasswordVisible ? 'text' : type}
          value={isPhone ? formatPhone(localValue) : localValue}
          onChange={handleChange}
          onKeyPress={(e) => {
            if (lettersOnly && !/[a-zA-Z\s]/.test(e.key)) {
              e.preventDefault();
            }
            if (isPhone && !/[0-9]/.test(e.key)) {
              e.preventDefault();
            }
          }}
          onBlur={handleBlur}
          disabled={disabled}
          className={`w-full pr-12 pl-5 py-3 rounded-lg border transition-colors ${
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-200'
              : disabled
              ? 'border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed'
              : 'border-[#E8DCC8] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20'
          } ${className}`}
          {...props}
        />

        {showPasswordToggle && togglePasswordVisibility && (
          <button
            type="button"
            onClick={togglePasswordVisibility}
            className="absolute inset-y-0 right-0 pr-4 flex items-center"
          >
            {isPasswordVisible ? (
              <EyeOff className="w-5 h-5 text-[#6B5D4F]" />
            ) : (
              <Eye className="w-5 h-5 text-[#6B5D4F]" />
            )}
          </button>
        )}
      </div>

      {error && (
        Array.isArray(error) && error.length > 0 && typeof error[0] === 'object' ? (
          <ul className="text-sm mt-1">
            {(error as { requirement: string; met: boolean }[]).map((req, index) => (
              <li key={index} className={req.met ? 'text-green-600' : 'text-red-600'}>
                {req.met ? '✓' : '✗'} {req.requirement}
              </li>
            ))}
          </ul>
        ) : Array.isArray(error) && error.length > 0 ? (
          <ul className="text-red-500 text-sm mt-1 list-disc list-inside">
            {(error as string[]).map((err, index) => (
              <li key={index}>{err}</li>
            ))}
          </ul>
        ) : typeof error === 'string' && error ? (
          <p className="text-red-500 text-sm mt-1">{error}</p>
        ) : null
      )}
    </div>
  );
});

interface PasswordState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  errors: {
    currentPassword: string;
    newPassword: { requirement: string; met: boolean }[];
    confirmPassword: string;
  };
  showCurrentPassword: boolean;
  showNewPassword: boolean;
  showConfirmPassword: boolean;
}

interface ProfileState {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;
  address: string;
  preferredBranch: string;
}

export function CustomerProfile({ onLogout, onForceReauth, onUserUpdated, user, token, favoriteGowns, onRemoveFavorite, navigateWithGown, isAdmin }: CustomerProfileProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'measurements' | 'favorites' | 'history'>('profile');
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isPasswordConfirmOpen, setIsPasswordConfirmOpen] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordApiMessage, setPasswordApiMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isMobileVerificationModalOpen, setIsMobileVerificationModalOpen] = useState(false);
  const [selectedFavoriteGown, setSelectedFavoriteGown] = useState<FavoriteGown | null>(null);
  const [pendingFavoriteRemoval, setPendingFavoriteRemoval] = useState<FavoriteGown | null>(null);
  const [passwordState, setPasswordState] = useState<PasswordState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    errors: { currentPassword: '', newPassword: [], confirmPassword: '' },
    showCurrentPassword: false,
    showNewPassword: false,
    showConfirmPassword: false,
  });
  const mapProfileState = useCallback((customerData: Partial<CustomerProfileResponse>): ProfileState => ({
    firstName: customerData.firstName || '',
    lastName: customerData.lastName || '',
    email: customerData.email || '',
    phoneNumber: customerData.phoneNumber || '',
    phoneVerified: Boolean(customerData.phoneVerified),
    phoneVerifiedAt: customerData.phoneVerifiedAt || null,
    address: customerData.address || '',
    preferredBranch: customerData.preferredBranch || 'Taguig Main - Cadena de Amor',
  }), []);

  const [profileData, setProfileData] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber || '',
    phoneVerified: Boolean(user.phoneVerified),
    phoneVerifiedAt: user.phoneVerifiedAt || null,
    address: '',
    preferredBranch: 'Taguig Main - Cadena de Amor'
  });
  const [displayedProfile, setDisplayedProfile] = useState({ ...profileData });
  const [isEditing, setIsEditing] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [addressError, setAddressError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [measurements, setMeasurements] = useState<MeasurementValues>(emptyMeasurements);
  const [draftMeasurements, setDraftMeasurements] = useState<MeasurementValues>(emptyMeasurements);
  const [measurementErrors, setMeasurementErrors] = useState<Partial<Record<keyof MeasurementValues, string>>>({});
  const [isMeasurementsEditMode, setIsMeasurementsEditMode] = useState(false);
  const [isSavingMeasurements, setIsSavingMeasurements] = useState(false);
  const [measurementsLastUpdated, setMeasurementsLastUpdated] = useState('');
  const [isMeasurementsLoading, setIsMeasurementsLoading] = useState(false);
  const [measurementsMessage, setMeasurementsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [historyItems, setHistoryItems] = useState<OrderHistory[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<HistoryTypeFilter>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>('all');
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedHistoryRental, setSelectedHistoryRental] = useState<RentalDetail | null>(null);

  const applyProfileState = useCallback((customerData: Partial<CustomerProfileResponse>) => {
    const nextProfile = mapProfileState(customerData);
    setProfileData(nextProfile);
    setDisplayedProfile(nextProfile);
    onUserUpdated?.({
      firstName: nextProfile.firstName,
      lastName: nextProfile.lastName,
      email: nextProfile.email,
      phoneNumber: nextProfile.phoneNumber,
      phoneVerified: nextProfile.phoneVerified,
      phoneVerifiedAt: nextProfile.phoneVerifiedAt,
    });
  }, [mapProfileState, onUserUpdated]);

  useEffect(() => {
    const fetchCustomerData = async () => {
      try {
        const customerData = await customerAPI.getCustomer(token);
        applyProfileState(customerData);
      } catch (error) {
        console.error('Failed to fetch customer data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomerData();
  }, [applyProfileState, token]);

  useEffect(() => {
    if (selectedFavoriteGown && !favoriteGowns.some((item) => item.id === selectedFavoriteGown.id)) {
      setSelectedFavoriteGown(null);
    }

    if (pendingFavoriteRemoval && !favoriteGowns.some((item) => item.id === pendingFavoriteRemoval.id)) {
      setPendingFavoriteRemoval(null);
    }
  }, [favoriteGowns, pendingFavoriteRemoval, selectedFavoriteGown]);

  useEffect(() => {
    if (isAdmin) return;
    const fetchMeasurements = async () => {
      setIsMeasurementsLoading(true);
      try {
        const data = await customerAPI.getMeasurements(token);
        const m: MeasurementValues = {
          bust: data.bust != null ? String(data.bust) : '',
          waist: data.waist != null ? String(data.waist) : '',
          hips: data.hips != null ? String(data.hips) : '',
          height: data.height != null ? String(data.height) : '',
          shoulderWidth: data.shoulderWidth != null ? String(data.shoulderWidth) : '',
          sleeveLength: data.sleeveLength != null ? String(data.sleeveLength) : '',
        };
        setMeasurements(m);
        setDraftMeasurements(m);
        if (data.updatedAt) {
          setMeasurementsLastUpdated(new Date(data.updatedAt).toLocaleDateString('en-CA'));
        }
      } catch {
        // Leave blank on error
      } finally {
        setIsMeasurementsLoading(false);
      }
    };
    fetchMeasurements();
  }, [token, isAdmin]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch, historyTypeFilter, historyStatusFilter]);

  useEffect(() => {
    if (isAdmin) return;

    let isMounted = true;

    const loadHistory = async () => {
      setIsHistoryLoading(true);
      setHistoryError('');

      try {
        const [rentals, appointments] = await Promise.all([
          rentalAPI.getMyRentals(token),
          appointmentAPI.getMyAppointments(token),
        ]);

        if (!isMounted) return;

        const rentalHistory: OrderHistory[] = rentals.map((rental) => ({
          id: rental.referenceId || rental.id,
          type: 'Rental',
          item: rental.gownName,
          date: rental.startDate,
          status: formatHistoryStatus(rental.status),
          branch: rental.branch,
          rentalDetails: rental,
        }));

        const appointmentHistory: OrderHistory[] = appointments.map((appointment) => ({
          id: appointment.id,
          type: 'Appointment',
          item: appointment.selectedGownName
            ? `${formatAppointmentTypeLabel(appointment.type)} - ${appointment.selectedGownName}`
            : formatAppointmentTypeLabel(appointment.type),
          date: appointment.date,
          status: formatHistoryStatus(appointment.status),
          branch: appointment.branch,
        }));

        const nextHistory = [...rentalHistory, ...appointmentHistory].sort((left, right) => {
          const leftTime = new Date(left.date).getTime();
          const rightTime = new Date(right.date).getTime();

          if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
          if (Number.isNaN(leftTime)) return 1;
          if (Number.isNaN(rightTime)) return -1;

          return rightTime - leftTime;
        });

        setHistoryItems(nextHistory);
      } catch (error) {
        if (!isMounted) return;
        setHistoryError(error instanceof Error ? error.message : 'Failed to load history.');
        setHistoryItems([]);
      } finally {
        if (isMounted) {
          setIsHistoryLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      isMounted = false;
    };
  }, [token, isAdmin]);

  const handleFirstNameChange = useCallback((value: string) => {
    const formattedValue = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    setProfileData(prev => ({ ...prev, firstName: formattedValue }));
    if (!formattedValue.trim()) {
      setFirstNameError('Please input a valid first name');
    } else {
      setFirstNameError('');
    }
  }, []);

  const handleLastNameChange = useCallback((value: string) => {
    const formattedValue = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    setProfileData(prev => ({ ...prev, lastName: formattedValue }));
    if (!formattedValue.trim()) {
      setLastNameError('Please input a valid last name');
    } else {
      setLastNameError('');
    }
  }, []);

  const handleEmailChange = useCallback((value: string) => {
    setProfileData(prev => ({ ...prev, email: value }));
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      setEmailError('Please input a valid email address');
    } else {
      setEmailError('');
    }
  }, []);

  const handlePhoneChange = useCallback((value: string) => {
    setProfileData(prev => ({ ...prev, phoneNumber: value }));
    const digits = value.replace(/^\+63\s*/, '').replace(/\s/g, '').replace(/[^0-9]/g, '');
    if (digits.length !== 10 || !digits.startsWith('9')) {
      setPhoneError('Please input a valid phone number');
    } else {
      setPhoneError('');
    }
  }, []);

  const handleAddressChange = useCallback((value: string) => {
    setProfileData(prev => ({ ...prev, address: value }));
    if (!value.trim()) {
      setAddressError('Please input a valid address');
    } else {
      setAddressError('');
    }
  }, []);

  const handlePreferredBranchChange = useCallback((value: string) => {
    setProfileData(prev => ({ ...prev, preferredBranch: value }));
  }, []);

  const getPasswordRequirements = useCallback((password: string) => [
    { requirement: 'At least 8 characters long', met: password.length >= 8 },
    { requirement: 'At least one uppercase letter', met: /[A-Z]/.test(password) },
    { requirement: 'At least one lowercase letter', met: /[a-z]/.test(password) },
    { requirement: 'At least one number', met: /\d/.test(password) },
    { requirement: 'At least one special character', met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
  ], []);

  const validatePassword = useCallback((password: string): string[] => {
    const requirements = getPasswordRequirements(password);
    const unmet = requirements.filter(req => !req.met);
    return unmet.map(req => req.requirement);
  }, [getPasswordRequirements]);

  const updatePasswordState = useCallback((updates: Partial<PasswordState>) => {
    setPasswordState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleCurrentPasswordChange = useCallback((value: string) => {
    updatePasswordState({
      currentPassword: value,
      errors: {
        ...passwordState.errors,
        currentPassword: value.trim() ? '' : 'Current password is required.',
      },
    });
  }, [updatePasswordState, passwordState.errors]);

  const handleNewPasswordChange = useCallback((value: string) => {
    const requirements = getPasswordRequirements(value);
    const sameAsCurrent = value === passwordState.currentPassword;
    requirements.push({ requirement: 'New password cannot be the same as the old password.', met: !sameAsCurrent });

    updatePasswordState({
      newPassword: value,
      errors: { ...passwordState.errors, newPassword: requirements }
    });
  }, [getPasswordRequirements, passwordState.currentPassword, updatePasswordState, passwordState.errors]);

  const handleConfirmPasswordChange = useCallback((value: string) => {
    const error = passwordState.newPassword !== value ? 'Passwords do not match.' : '';
    updatePasswordState({ 
      confirmPassword: value, 
      errors: { ...passwordState.errors, confirmPassword: error } 
    });
  }, [passwordState.newPassword, updatePasswordState, passwordState.errors]);

  const resetPasswordState = useCallback(() => {
    updatePasswordState({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      errors: { currentPassword: '', newPassword: [], confirmPassword: '' },
      showCurrentPassword: false,
      showNewPassword: false,
      showConfirmPassword: false,
    });
  }, [updatePasswordState]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    const { currentPassword, newPassword, confirmPassword } = passwordState;
    let currentPasswordError = '';
    const confirmPasswordError = newPassword !== confirmPassword ? 'Passwords do not match.' : '';
    if (!currentPassword.trim()) {
      currentPasswordError = 'Current password is required.';
    }

    const unmet = passwordState.errors.newPassword.filter(req => !req.met);

    if (currentPasswordError || unmet.length > 0 || confirmPasswordError) {
      updatePasswordState({
        errors: {
          ...passwordState.errors,
          currentPassword: currentPasswordError,
          confirmPassword: confirmPasswordError,
        },
      });
      return;
    }

    setPasswordApiMessage(null);
    setIsPasswordConfirmOpen(true);
  }, [passwordState, updatePasswordState]);

  const handleConfirmPasswordSave = useCallback(async () => {
    try {
      setIsChangingPassword(true);
      setPasswordApiMessage(null);

      const result = await authAPI.changePassword(token, {
        currentPassword: passwordState.currentPassword,
        newPassword: passwordState.newPassword,
      });

      const successMessage = result.message || 'Password changed successfully. Please log in again.';
      setIsPasswordConfirmOpen(false);
      setIsChangePasswordModalOpen(false);
      resetPasswordState();
      setPasswordApiMessage(null);

      if (onForceReauth) {
        onForceReauth(successMessage);
      } else {
        onLogout();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update password.';
      const isCurrentPasswordError = /current password/i.test(message);
      updatePasswordState({
        errors: {
          ...passwordState.errors,
          currentPassword: isCurrentPasswordError
            ? 'Current password is incorrect.'
            : passwordState.errors.currentPassword,
        },
      });
      setPasswordApiMessage({ type: 'error', text: message });
      setIsPasswordConfirmOpen(false);
    } finally {
      setIsChangingPassword(false);
    }
  }, [onForceReauth, onLogout, passwordState.currentPassword, passwordState.newPassword, passwordState.errors, resetPasswordState, token, updatePasswordState]);

  const handleSaveMeasurements = useCallback(async () => {
    const errors: Partial<Record<keyof MeasurementValues, string>> = {};

    for (const { key, label, min, max, unit } of MEASUREMENT_LABELS) {
      const val = draftMeasurements[key];
      if (val !== '') {
        const num = Number(val);
        if (isNaN(num) || num < min) {
          errors[key] = `${label} must be a positive number greater than ${min} ${unit}.`;
        } else if (num > max) {
          errors[key] = `${label} value seems too large (max ${max} ${unit}).`;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setMeasurementErrors(errors);
      return;
    }

    setIsSavingMeasurements(true);
    setMeasurementsMessage(null);
    try {
      const payload = {
        bust: draftMeasurements.bust === '' ? null : Number(draftMeasurements.bust),
        waist: draftMeasurements.waist === '' ? null : Number(draftMeasurements.waist),
        hips: draftMeasurements.hips === '' ? null : Number(draftMeasurements.hips),
        height: draftMeasurements.height === '' ? null : Number(draftMeasurements.height),
        shoulderWidth: draftMeasurements.shoulderWidth === '' ? null : Number(draftMeasurements.shoulderWidth),
        sleeveLength: draftMeasurements.sleeveLength === '' ? null : Number(draftMeasurements.sleeveLength),
      };
      await customerAPI.updateMeasurements(token, payload);
      setMeasurements({ ...draftMeasurements });
      setMeasurementsLastUpdated(new Date().toLocaleDateString('en-CA'));
      setIsMeasurementsEditMode(false);
      setMeasurementErrors({});
      setMeasurementsMessage({ type: 'success', text: 'Measurements saved successfully.' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save measurements.';
      setMeasurementsMessage({ type: 'error', text: msg });
    } finally {
      setIsSavingMeasurements(false);
    }
  }, [draftMeasurements, token]);

  const tabs = isAdmin
    ? [{ key: 'profile' as const, label: 'Profile Info' }]
    : [
        { key: 'profile' as const, label: 'Profile Info' },
        { key: 'measurements' as const, label: 'Measurements' },
        { key: 'favorites' as const, label: 'Favorites' },
        { key: 'history' as const, label: 'History' }
      ] as const;

  const renderProfileTab = () => (
    <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-light">Personal Information</h2>
        <button
          onClick={() => setIsEditProfileModalOpen(true)}
          className="px-8 py-3 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors"
        >
          Edit Profile
        </button>
      </div>
      <div className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <ProfileInput key="firstName" label="First Name" value={displayedProfile.firstName} disabled={true} lettersOnly={true} />
          <ProfileInput key="lastName" label="Last Name" value={displayedProfile.lastName} disabled={true} lettersOnly={true} />
          <ProfileInput
            key="email"
            label="Email Address"
            value={displayedProfile.email}
            type="email"
            disabled={true}
          />
          <ProfileInput
            key="phone"
            label="Phone Number"
            labelAdornment={
              displayedProfile.phoneNumber ? (
                <button
                  type="button"
                  onClick={() => setIsMobileVerificationModalOpen(true)}
                  disabled={displayedProfile.phoneVerified}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    displayedProfile.phoneVerified
                      ? 'cursor-default border border-green-200 bg-green-50 text-green-700'
                      : 'border border-[#E8DCC8] bg-white text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black'
                  }`}
                >
                  {displayedProfile.phoneVerified ? 'Verified' : 'Verify Phone Number'}
                </button>
              ) : null
            }
            value={displayedProfile.phoneNumber}
            type="tel"
            disabled={true}
            isPhone={true}
          />
          <div>
            <label className="block text-sm text-[#6B5D4F] mb-2">Preferred Branch</label>
            <select
              key="preferredBranch"
              defaultValue={displayedProfile.preferredBranch}
              disabled={true}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed"
            >
              <option value="Taguig Main - Cadena de Amor">Taguig Main - Cadena de Amor</option>
              <option value="BGC Branch">BGC Branch</option>
              <option value="Makati Branch">Makati Branch</option>
              <option value="Quezon City">Quezon City</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm text-[#6B5D4F] mb-2">Address</label>
          <textarea
            key="address"
            defaultValue={displayedProfile.address}
            disabled={true}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed min-h-[100px]"
          />
        </div>
        <button
          onClick={() => setIsChangePasswordModalOpen(true)}
          className="px-8 py-3 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors"
        >
          Change Password
        </button>
      </div>
    </div>
  );

  const measurementsTabJSX = (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-light mb-1">Your Measurements</h2>
            {measurementsLastUpdated
              ? <p className="text-sm text-[#6B5D4F]">Last updated: {measurementsLastUpdated}</p>
              : <p className="text-sm text-[#6B5D4F]">Not yet recorded</p>
            }
          </div>
          {!isMeasurementsEditMode && (
            <button
              onClick={() => { setIsMeasurementsEditMode(true); setMeasurementsMessage(null); }}
              className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors text-sm"
            >
              Manual Entry
            </button>
          )}
        </div>

        {measurementsMessage && (
          <div
            className={`mb-4 p-3 rounded-lg border text-sm ${
              measurementsMessage.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
            role="status"
          >
            {measurementsMessage.text}
          </div>
        )}

        {isMeasurementsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4AF37]"></div>
          </div>
        ) : isMeasurementsEditMode ? (
          <>
            <p className="text-sm text-[#6B5D4F] mb-6">Enter measurements in inches, except Height which must be in centimeters (cm). Leave a field blank if unknown.</p>
            <div className="grid md:grid-cols-3 gap-6">
              {MEASUREMENT_LABELS.map(({ key, label, unit, min, max, placeholder, maxLength }) => (
                <div key={key}>
                  <label className="block text-sm text-[#6B5D4F] mb-2">
                    {label} <span className="text-xs">({unit})</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draftMeasurements[key]}
                    maxLength={maxLength}
                    onChange={e => {
                      const rawValue = e.target.value;
                      // Allow digits and at most one decimal point, capped to maxLength
                      const raw = rawValue.replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1').slice(0, maxLength);
                      setDraftMeasurements(prev => ({ ...prev, [key]: raw }));

                      // Height gets immediate validation feedback while typing.
                      if (key === 'height') {
                        const hasInvalidChars = /[^0-9.]/.test(rawValue);
                        if (hasInvalidChars) {
                          setMeasurementErrors(prev => ({ ...prev, [key]: 'Height must be numeric (cm).' }));
                          return;
                        }
                        if (raw === '') {
                          setMeasurementErrors(prev => ({ ...prev, [key]: '' }));
                          return;
                        }
                        const num = Number(raw);
                        if (Number.isNaN(num)) {
                          setMeasurementErrors(prev => ({ ...prev, [key]: 'Height must be numeric (cm).' }));
                          return;
                        }
                        if (num < min) {
                          setMeasurementErrors(prev => ({ ...prev, [key]: `Height must be at least ${min} cm.` }));
                          return;
                        }
                        if (num > max) {
                          setMeasurementErrors(prev => ({ ...prev, [key]: `Height must be at most ${max} cm.` }));
                          return;
                        }
                        setMeasurementErrors(prev => ({ ...prev, [key]: '' }));
                        return;
                      }

                      if (measurementErrors[key]) {
                        setMeasurementErrors(prev => ({ ...prev, [key]: '' }));
                      }
                    }}
                    className={`w-full px-4 py-3 rounded-lg border transition-colors ${
                      measurementErrors[key]
                        ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-200'
                        : 'border-[#E8DCC8] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20'
                    }`}
                    placeholder={placeholder}
                    aria-label={`${label} in ${unit}`}
                  />
                  {measurementErrors[key] && (
                    <p className="text-red-500 text-sm mt-1">{measurementErrors[key]}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-6">
              <button
                onClick={handleSaveMeasurements}
                disabled={isSavingMeasurements || Boolean(measurementErrors.height)}
                className="px-8 py-3 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSavingMeasurements ? 'Saving...' : 'Save Measurements'}
              </button>
              <button
                onClick={() => {
                  setDraftMeasurements({ ...measurements });
                  setMeasurementErrors({});
                  setMeasurementsMessage(null);
                  setIsMeasurementsEditMode(false);
                }}
                disabled={isSavingMeasurements}
                className="px-8 py-3 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {MEASUREMENT_LABELS.map(({ key, label, unit }) => (
              <div key={key} className="p-4 bg-[#FAF7F0] rounded-lg border border-[#E8DCC8]">
                <div className="text-sm text-[#6B5D4F] mb-1">{label}</div>
                <div className="text-2xl font-light">
                  {measurements[key]
                    ? <>{measurements[key]}<span className="text-base text-[#6B5D4F]">{unit === 'cm' ? ' cm' : '"'}</span></>
                    : <span className="text-gray-400 text-base">—</span>
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderFavoritesTab = () => (
    <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
      <h2 className="text-2xl font-light mb-6 flex items-center gap-2">
        <Heart className="w-6 h-6" />
        Favorite Gowns
      </h2>
      <div className="space-y-4">
        {favoriteGowns.length === 0 && (
          <div className="rounded-lg border border-dashed border-[#E8DCC8] bg-[#FCFAF5] px-6 py-12 text-center text-[#6B5D4F]">
            No favorite gowns yet.
          </div>
        )}
        {favoriteGowns.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-4 border border-[#E8DCC8] rounded-lg hover:border-[#D4AF37] transition-colors">
            <div>
              <h3 className="font-medium">{item.name}</h3>
              <p className="text-sm text-[#6B5D4F]">{item.category}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedFavoriteGown(item)}
                className="px-4 py-2 bg-black text-white text-sm rounded-full hover:bg-[#D4AF37] transition-colors"
              >
                View
              </button>
              <button
                type="button"
                aria-label={`Unfavorite ${item.name}`}
                title="Unfavorite gown"
                onClick={() => setPendingFavoriteRemoval(item)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
              >
                <Heart className="w-5 h-5 fill-current" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const normalizedHistorySearch = historySearch.trim().toLowerCase();
  const filteredHistoryItems = historyItems.filter((item) => {
    const matchesType = historyTypeFilter === 'all' || item.type === historyTypeFilter;
    const matchesStatus = historyStatusFilter === 'all' || item.status === historyStatusFilter;
    const matchesSearch = normalizedHistorySearch.length === 0
      || item.item.toLowerCase().includes(normalizedHistorySearch)
      || item.id.toLowerCase().includes(normalizedHistorySearch)
      || item.type.toLowerCase().includes(normalizedHistorySearch)
      || item.status.toLowerCase().includes(normalizedHistorySearch)
      || (item.branch ? item.branch.toLowerCase().includes(normalizedHistorySearch) : false);

    return matchesType && matchesStatus && matchesSearch;
  });

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistoryItems.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const paginatedHistoryItems = filteredHistoryItems.slice(
    (safeHistoryPage - 1) * HISTORY_PAGE_SIZE,
    safeHistoryPage * HISTORY_PAGE_SIZE,
  );
  const historyStart = filteredHistoryItems.length === 0 ? 0 : (safeHistoryPage - 1) * HISTORY_PAGE_SIZE + 1;
  const historyEnd = Math.min(safeHistoryPage * HISTORY_PAGE_SIZE, filteredHistoryItems.length);

  const renderHistoryTab = () => (
    <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8">
      <h2 className="text-2xl font-light mb-6 flex items-center gap-2">
        <History className="w-6 h-6" />
        History
      </h2>
      {!isHistoryLoading && !historyError && historyItems.length > 0 && (
        <div className="mb-6 space-y-4">
          <div>
            <div>
              <label className="block text-sm text-[#6B5D4F] mb-2">Search</label>
              <input
                type="text"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Search by item, reference, branch, or status"
                className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#6B5D4F] mb-2">Type</label>
              <div className="flex flex-wrap gap-2">
                {HISTORY_TYPE_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setHistoryTypeFilter((current) => current === option ? 'all' : option)}
                    className={`rounded-full px-3 py-2 text-sm transition-colors ${
                      historyTypeFilter === option
                        ? 'bg-black text-white'
                        : 'bg-white text-[#6B5D4F] border border-[#E8DCC8] hover:border-[#D4AF37]'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#6B5D4F] mb-2">Status</label>
              <div className="flex flex-wrap gap-2">
                {HISTORY_STATUS_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setHistoryStatusFilter((current) => current === option ? 'all' : option)}
                    className={`rounded-full px-3 py-2 text-sm transition-colors ${
                      historyStatusFilter === option
                        ? 'bg-black text-white'
                        : 'bg-white text-[#6B5D4F] border border-[#E8DCC8] hover:border-[#D4AF37]'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-sm text-[#6B5D4F] md:flex-row md:items-center md:justify-between">
            <p>
              Showing {historyStart}-{historyEnd} of {filteredHistoryItems.length} entries
            </p>
            <div className="flex flex-wrap items-center gap-3 md:justify-end">
              {(historySearch || historyTypeFilter !== 'all' || historyStatusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setHistorySearch('');
                    setHistoryTypeFilter('all');
                    setHistoryStatusFilter('all');
                  }}
                  className="text-left underline underline-offset-4 hover:text-black transition-colors md:text-right"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {isHistoryLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4AF37]"></div>
          </div>
        )}

        {!isHistoryLoading && historyError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {historyError}
          </div>
        )}

        {!isHistoryLoading && !historyError && historyItems.length === 0 && (
          <div className="rounded-lg border border-[#E8DCC8] bg-[#FAF7F0] px-6 py-10 text-center">
            <h3 className="text-lg font-medium mb-2">No rental or appointment history yet</h3>
            <p className="text-sm text-[#6B5D4F]">Your rentals and appointments will appear here once they are created.</p>
          </div>
        )}

        {!isHistoryLoading && !historyError && historyItems.length > 0 && filteredHistoryItems.length === 0 && (
          <div className="rounded-xl border border-[#E8DCC8] bg-[#FCFAF5] px-6 py-8 md:px-8 md:py-10">
            <div className="flex min-h-[180px] flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#E8DCC8] bg-white">
                <History className="h-6 w-6 text-[#6B5D4F]" />
              </div>
              <h3 className="text-xl font-medium text-black">No matching history entries</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#6B5D4F]">
                No rentals or appointments match the current search and filter combination. Try broadening the filters or clear them to see your full history.
              </p>
            </div>
          </div>
        )}

        {!isHistoryLoading && !historyError && paginatedHistoryItems.map((item) => {
          const isRentalItem = item.type === 'Rental' && Boolean(item.rentalDetails);

          return (
          <div
            key={`${item.type}-${item.id}`}
            className={`flex items-center justify-between p-4 border border-[#E8DCC8] rounded-lg transition-colors ${
              isRentalItem
                ? 'cursor-pointer hover:border-[#D4AF37] hover:bg-[#FCFAF5]'
                : 'hover:border-[#D4AF37]'
            }`}
            onClick={() => {
              if (isRentalItem) {
                setSelectedHistoryRental(item.rentalDetails ?? null);
              }
            }}
            onKeyDown={(event) => {
              if (!isRentalItem) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelectedHistoryRental(item.rentalDetails ?? null);
              }
            }}
            role={isRentalItem ? 'button' : undefined}
            tabIndex={isRentalItem ? 0 : undefined}
            aria-label={isRentalItem ? `View rental details for ${item.item}` : undefined}
          >
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs px-2 py-1 bg-[#FAF7F0] text-[#6B5D4F] border border-[#E8DCC8] rounded">
                  {item.type}
                </span>
                <span className="text-sm text-[#6B5D4F]">{item.id}</span>
              </div>
              {isRentalItem ? (
                <div>
                  <h3 className="font-medium text-black underline underline-offset-4">{item.item}</h3>
                  <p className="mt-2 text-xs text-[#6B5D4F]">Click to view rental details</p>
                </div>
              ) : (
                <h3 className="font-medium">{item.item}</h3>
              )}
              <p className="text-sm text-[#6B5D4F]">{formatHistoryDate(item.date)}</p>
              {item.branch && (
                <p className="text-xs text-[#8A7A67] mt-1">{item.branch}</p>
              )}
            </div>
            <div className="text-right">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                item.status === 'Completed'
                  ? 'bg-green-100 text-green-800'
                  : item.status === 'Cancelled'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-800'
              }`}>
                {item.status}
              </span>
            </div>
          </div>
        )})}

        {!isHistoryLoading && !historyError && filteredHistoryItems.length > HISTORY_PAGE_SIZE && (
          <div className="mt-3 flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-[#6B5D4F]">
              Page {safeHistoryPage} of {totalHistoryPages}
            </p>
            <div className="flex justify-end gap-3 md:ml-auto">
              <button
                type="button"
                onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                disabled={safeHistoryPage === 1}
                className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setHistoryPage((current) => Math.min(totalHistoryPages, current + 1))}
                disabled={safeHistoryPage === totalHistoryPages}
                className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderTabContent = () => {
    const tabMap: Record<string, JSX.Element> = {
      profile: renderProfileTab(),
      measurements: measurementsTabJSX,
      favorites: renderFavoritesTab(),
      history: renderHistoryTab(),
    };

    if (isAdmin) return renderProfileTab();
    return tabMap[activeTab] ?? renderProfileTab();
  };

  // If an admin is viewing the page, make sure we stay on the Profile tab.
  // This prevents any leftover customer tab state from remaining active.
  useEffect(() => {
    if (isAdmin && activeTab !== 'profile') {
      setActiveTab('profile');
    }
  }, [isAdmin, activeTab]);

  const confirmRemoveFavorite = () => {
    if (!pendingFavoriteRemoval) return;
    onRemoveFavorite(pendingFavoriteRemoval.id);
    setPendingFavoriteRemoval(null);
  };

  useEffect(() => {
    if (!isPasswordConfirmOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPasswordConfirmOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isPasswordConfirmOpen]);

  const togglePasswordVisibility = (field: 'current' | 'new' | 'confirm') => {
    setPasswordState(prev => ({
      ...prev,
      [`show${field.charAt(0).toUpperCase() + field.slice(1)}Password`]: !prev[`show${field.charAt(0).toUpperCase() + field.slice(1)}Password` as keyof PasswordState]
    }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen py-8 px-4 bg-[#FAF7F0] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37] mx-auto mb-4"></div>
          <p className="text-[#6B5D4F]">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 bg-[#FAF7F0]">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-light mb-2">My Profile</h1>
          <p className="text-[#6B5D4F]">Manage your account and preferences</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E8DCC8] p-8 mb-8">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="w-24 h-24 bg-[#FAF7F0] rounded-full flex items-center justify-center border border-[#E8DCC8]">
              <User className="w-12 h-12 text-[#6B5D4F]" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-light mb-1">{displayedProfile.firstName} {displayedProfile.lastName}</h2>
              <p className="text-[#6B5D4F] mb-4">{displayedProfile.email}</p>
              <div className="flex flex-wrap gap-4 text-sm text-[#6B5D4F]">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Member since:</span>
                  <span>January 2025</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Phone:</span>
                  <span>{displayedProfile.phoneNumber}</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setIsLogoutConfirmOpen(true)}
              className="px-6 py-3 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-8 border-b border-[#E8DCC8] overflow-x-auto">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-6 py-3 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === key
                  ? 'border-[#D4AF37] font-medium'
                  : 'border-transparent text-[#6B5D4F] hover:text-black'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {renderTabContent()}

        {isLogoutConfirmOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-8">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-2xl font-light">Confirm Logout</h3>
                  <p className="text-sm text-[#6B5D4F] mt-2">Are you sure you want to log out of your account?</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLogoutConfirmOpen(false)}
                  className="p-2 hover:bg-[#FAF7F0] rounded-lg transition-colors"
                  aria-label="Close logout confirmation"
                >
                  <span className="text-xl leading-none text-[#6B5D4F]">×</span>
                </button>
              </div>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 mb-6">
                <p className="font-medium text-[#3D2B1F]">{displayedProfile.firstName} {displayedProfile.lastName}</p>
                <p className="text-sm text-[#6B5D4F]">{displayedProfile.email}</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsLogoutConfirmOpen(false)}
                  className="flex-1 py-3 border-2 border-[#E8DCC8] bg-[#FAF7F0] text-[#6B5D4F] rounded-xl hover:bg-[#F2EADF] transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsLogoutConfirmOpen(false);
                    onLogout();
                  }}
                  className="flex-1 py-3 bg-[#1a1a1a] text-white rounded-xl hover:bg-[#D4AF37] transition-colors font-medium"
                >
                  Yes, Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {passwordApiMessage && (
          <div
            className={`mt-6 p-4 rounded-lg border text-sm ${
              passwordApiMessage.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
            role="status"
            aria-live="polite"
          >
            {passwordApiMessage.text}
          </div>
        )}

        {isChangePasswordModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
              <h3 className="text-2xl font-light mb-6">Change Password</h3>
              {passwordApiMessage?.type === 'error' && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {passwordApiMessage.text}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <ProfileInput
                  label="Current Password"
                  value={passwordState.currentPassword}
                  onChange={handleCurrentPasswordChange}
                  type="password"
                  error={passwordState.errors.currentPassword}
                  showPasswordToggle={true}
                  isPasswordVisible={passwordState.showCurrentPassword}
                  togglePasswordVisibility={() => togglePasswordVisibility('current')}
                  validateOnChange={true}
                />
                <ProfileInput
                  label="New Password"
                  value={passwordState.newPassword}
                  onChange={handleNewPasswordChange}
                  type="password"
                  error={passwordState.errors.newPassword}
                  showPasswordToggle={true}
                  isPasswordVisible={passwordState.showNewPassword}
                  togglePasswordVisibility={() => togglePasswordVisibility('new')}
                  validateOnChange={true}
                />
                <ProfileInput
                  label="Confirm Password"
                  value={passwordState.confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  type="password"
                  error={passwordState.errors.confirmPassword}
                  showPasswordToggle={true}
                  isPasswordVisible={passwordState.showConfirmPassword}
                  togglePasswordVisibility={() => togglePasswordVisibility('confirm')}
                  validateOnChange={true}
                />
                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    disabled={
                      isChangingPassword ||
                      !passwordState.currentPassword ||
                      !passwordState.newPassword ||
                      !passwordState.confirmPassword ||
                      !!passwordState.errors.currentPassword ||
                      passwordState.errors.newPassword.some(req => !req.met) ||
                      !!passwordState.errors.confirmPassword
                    }
                    className="px-6 py-3 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex-1"
                  >
                    {isChangingPassword ? 'Saving...' : 'Save New Password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangePasswordModalOpen(false);
                      setIsPasswordConfirmOpen(false);
                      resetPasswordState();
                    }}
                    className="px-6 py-3 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors"
                    disabled={isChangingPassword}
                  >
                    Cancel
                  </button>
                </div>
              </form>

              {isPasswordConfirmOpen && (
                <div
                  className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Confirm password change"
                >
                  <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
                    <h4 className="text-xl font-semibold mb-4">Save new password?</h4>
                    <p className="text-sm text-[#6B5D4F] mb-6">
                      Are you sure you want to save this new password?
                    </p>
                    <div className="flex gap-4 justify-end">
                      <button
                        type="button"
                        onClick={() => setIsPasswordConfirmOpen(false)}
                        className="px-6 py-3 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors"
                        disabled={isChangingPassword}
                      >
                        No
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmPasswordSave}
                        className="px-6 py-3 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors disabled:opacity-50"
                        disabled={isChangingPassword}
                      >
                        {isChangingPassword ? 'Saving...' : 'Yes'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <EditProfileModal
          isOpen={isEditProfileModalOpen}
          onClose={() => setIsEditProfileModalOpen(false)}
          customerData={{
            firstName: displayedProfile.firstName,
            lastName: displayedProfile.lastName,
            email: displayedProfile.email,
            phoneNumber: displayedProfile.phoneNumber,
            address: displayedProfile.address,
            preferredBranch: displayedProfile.preferredBranch
          }}
          onSave={async (data: {
            firstName: string;
            lastName: string;
            email: string;
            phoneNumber: string;
            address: string;
            preferredBranch: string;
          }) => {
            try {
              const updateData = {
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                phoneNumber: data.phoneNumber,
                address: data.address,
                preferredBranch: data.preferredBranch
              };

              await customerAPI.updateCustomer(token, updateData);

              // Re-fetch persisted profile to ensure merged backend data is reflected.
              const updatedCustomer = await customerAPI.getCustomer(token);

              applyProfileState(updatedCustomer);

              setIsEditProfileModalOpen(false);
            } catch (error) {
              console.error('Failed to update profile:', error);
              throw error;
            }
          }}
        />

        <MobileVerificationModal
          isOpen={isMobileVerificationModalOpen}
          onClose={() => setIsMobileVerificationModalOpen(false)}
          token={token}
          phoneNumber={displayedProfile.phoneNumber}
          isVerified={displayedProfile.phoneVerified}
          onVerified={(customer) => {
            applyProfileState(customer);
            setIsMobileVerificationModalOpen(false);
          }}
        />

        {selectedHistoryRental && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-label="Rental details"
            onClick={() => setSelectedHistoryRental(null)}
          >
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-6">
                <h3 className="text-2xl font-light text-black">Rental Details</h3>
                <button
                  type="button"
                  onClick={() => setSelectedHistoryRental(null)}
                  className="p-2 rounded-lg hover:bg-[#FAF7F0] transition-colors"
                  aria-label="Close rental details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F0] p-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Gown</span>
                  <span className="text-right font-medium text-black">{selectedHistoryRental.gownName}</span>
                </div>
                {selectedHistoryRental.sku && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">SKU</span>
                    <span className="text-right font-medium text-black">{selectedHistoryRental.sku}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Status</span>
                  <span className="text-right font-medium text-black">
                    {selectedHistoryRental.status === 'paid_for_confirmation'
                      ? 'Paid - For Confirmation'
                      : selectedHistoryRental.status === 'for_pickup'
                        ? 'Schedule Pickup'
                        : selectedHistoryRental.status
                          .split('_')
                          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                          .join(' ')}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Schedule</span>
                  <span className="text-right font-medium text-black">
                    {selectedHistoryRental.startDate} to {selectedHistoryRental.endDate}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Branch</span>
                  <span className="text-right font-medium text-black">{selectedHistoryRental.branch}</span>
                </div>
                {selectedHistoryRental.eventType && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Event Type</span>
                    <span className="text-right font-medium text-black">{selectedHistoryRental.eventType}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4 pt-2 border-t border-[#E8DCC8]">
                  <span className="text-[#6B5D4F]">Total Price</span>
                  <span className="text-right font-medium text-black">₱{selectedHistoryRental.totalPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Downpayment</span>
                  <span className="text-right font-medium text-black">₱{selectedHistoryRental.downpayment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5D4F]">Reference ID</span>
                  <span className="text-right font-medium text-black">{selectedHistoryRental.referenceId || selectedHistoryRental.id}</span>
                </div>
                {selectedHistoryRental.paymentSubmittedAt && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Paid At</span>
                    <span className="text-right font-medium text-black">{new Date(selectedHistoryRental.paymentSubmittedAt).toLocaleString()}</span>
                  </div>
                )}
                {typeof selectedHistoryRental.paymentAmountPaid === 'number' && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Amount Paid</span>
                    <span className="text-right font-medium text-black">₱{selectedHistoryRental.paymentAmountPaid.toLocaleString()}</span>
                  </div>
                )}
                {selectedHistoryRental.paymentReferenceNumber && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Payment Ref #</span>
                    <span className="text-right font-medium text-black">{selectedHistoryRental.paymentReferenceNumber}</span>
                  </div>
                )}
                {selectedHistoryRental.paymentReceiptFilename && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Receipt Image</span>
                    <span className="text-right font-medium text-black">{selectedHistoryRental.paymentReceiptFilename}</span>
                  </div>
                )}
                {selectedHistoryRental.pickupScheduleDate && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Pickup Schedule</span>
                    <span className="text-right font-medium text-black">
                      {selectedHistoryRental.pickupScheduleDate}
                      {selectedHistoryRental.pickupScheduleTime ? ` at ${selectedHistoryRental.pickupScheduleTime}` : ''}
                    </span>
                  </div>
                )}
                {selectedHistoryRental.status === 'cancelled' && selectedHistoryRental.rejectionReason && (
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6B5D4F]">Rejection Reason</span>
                    <span className="text-right font-medium text-black">{selectedHistoryRental.rejectionReason}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedHistoryRental(null)}
                className="mt-6 w-full py-3 border border-[#E8DCC8] rounded-lg hover:border-[#1a1a1a] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {pendingFavoriteRemoval && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-8 shadow-2xl">
              <h3 className="mb-3 text-2xl font-light text-black">Unfavorite this gown?</h3>
              <p className="mb-6 text-sm leading-6 text-[#6B5D4F]">
                {pendingFavoriteRemoval.name} is already in your favorites. Do you want to unfavorite it?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPendingFavoriteRemoval(null)}
                  className="flex-1 rounded-full border border-[#E8DCC8] px-5 py-3 transition-colors hover:border-[#1a1a1a]"
                >
                  Keep Favorite
                </button>
                <button
                  type="button"
                  onClick={confirmRemoveFavorite}
                  className="flex-1 rounded-full bg-black px-5 py-3 text-white transition-colors hover:bg-[#D4AF37] hover:text-black"
                >
                  Unfavorite
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedFavoriteGown && (
          <GownDetailsModal
            gown={selectedFavoriteGown}
            isAdmin={isAdmin}
            onClose={() => setSelectedFavoriteGown(null)}
            onBookRental={(gownId) => {
              navigateWithGown('rentals', gownId);
              setSelectedFavoriteGown(null);
            }}
            onScheduleFitting={(gownId) => {
              navigateWithGown('appointments', gownId);
              setSelectedFavoriteGown(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
