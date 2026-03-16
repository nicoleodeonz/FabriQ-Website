import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  BarangayOption,
  CityMunicipalityOption,
  RegionOption,
  phAddressAPI,
} from '../services/phAddressAPI';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerData: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    address: string;
    preferredBranch: string;
  };
  onSave: (data: any) => Promise<void>;
  isLoading?: boolean;
}

const ADDRESS_DELIMITER = ',';

const parseAddress = (address: string) => {
  const parts = (address || '')
    .split(ADDRESS_DELIMITER)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 4) {
    return {
      street: parts.slice(0, parts.length - 3).join(', '),
      barangay: parts[parts.length - 3],
      city: parts[parts.length - 2],
      region: parts[parts.length - 1],
    };
  }

  return {
    street: address || '',
    barangay: '',
    city: '',
    region: '',
  };
};

const composeAddress = (street: string, barangay: string, city: string, region: string) => {
  return [street.trim(), barangay.trim(), city.trim(), region.trim()]
    .filter(Boolean)
    .join(', ');
};

const findByName = <T extends { name: string }>(list: T[], name: string) => {
  return list.find((item) => item.name.toLowerCase() === name.toLowerCase());
};

type AddressValidationState = {
  regionCode?: string;
  cityCode?: string;
  barangayCode?: string;
  street?: string;
};

export function EditProfileModal({
  isOpen,
  onClose,
  customerData,
  onSave,
  isLoading = false,
}: EditProfileModalProps) {
  const [formData, setFormData] = useState(customerData);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const [streetAddress, setStreetAddress] = useState('');
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [cities, setCities] = useState<CityMunicipalityOption[]>([]);
  const [barangays, setBarangays] = useState<BarangayOption[]>([]);

  const [selectedRegionCode, setSelectedRegionCode] = useState('');
  const [selectedCityCode, setSelectedCityCode] = useState('');
  const [selectedBarangayCode, setSelectedBarangayCode] = useState('');

  const [isLoadingRegions, setIsLoadingRegions] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [isLoadingBarangays, setIsLoadingBarangays] = useState(false);

  const selectedRegionName = useMemo(
    () => regions.find((region) => region.code === selectedRegionCode)?.name || '',
    [regions, selectedRegionCode]
  );

  const selectedCityName = useMemo(
    () => cities.find((city) => city.code === selectedCityCode)?.name || '',
    [cities, selectedCityCode]
  );

  const selectedBarangayName = useMemo(
    () => barangays.find((barangay) => barangay.code === selectedBarangayCode)?.name || '',
    [barangays, selectedBarangayCode]
  );

  useEffect(() => {
    if (!isOpen || !customerData) {
      return;
    }

    let isCancelled = false;

    const initializeAddressData = async () => {
      setError('');
      setFieldErrors({});

      const normalized = { ...customerData } as any;
      if (customerData.phoneNumber) {
        let digits = String(customerData.phoneNumber).replace(/\D/g, '');
        if (digits.startsWith('63')) digits = digits.slice(2);
        if (digits.startsWith('0')) digits = digits.slice(1);
        normalized.phoneNumber = digits.length === 10 ? digits : '';
      }

      setFormData(normalized);

      const parsedAddress = parseAddress(customerData.address || '');
      setStreetAddress(parsedAddress.street);
      setSelectedRegionCode('');
      setSelectedCityCode('');
      setSelectedBarangayCode('');
      setCities([]);
      setBarangays([]);

      setIsLoadingRegions(true);
      try {
        const regionData = await phAddressAPI.getRegions();
        if (isCancelled) return;

        setRegions(regionData);

        const matchedRegion = findByName(regionData, parsedAddress.region);
        if (!matchedRegion) return;

        setSelectedRegionCode(matchedRegion.code);

        setIsLoadingCities(true);
        const cityData = await phAddressAPI.getCitiesByRegion(matchedRegion.code);
        if (isCancelled) return;

        setCities(cityData);

        const matchedCity = findByName(cityData, parsedAddress.city);
        if (!matchedCity) return;

        setSelectedCityCode(matchedCity.code);

        setIsLoadingBarangays(true);
        const barangayData = await phAddressAPI.getBarangaysByCity(matchedCity.code);
        if (isCancelled) return;

        setBarangays(barangayData);

        const matchedBarangay = findByName(barangayData, parsedAddress.barangay);
        if (matchedBarangay) {
          setSelectedBarangayCode(matchedBarangay.code);
        }
      } catch {
        if (!isCancelled) {
          setError('Unable to load complete Philippine address list. Please try again.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingRegions(false);
          setIsLoadingCities(false);
          setIsLoadingBarangays(false);
        }
      }
    };

    void initializeAddressData();

    return () => {
      isCancelled = true;
    };
  }, [customerData, isOpen]);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      address: composeAddress(streetAddress, selectedBarangayName, selectedCityName, selectedRegionName),
    }));
  }, [selectedBarangayName, selectedCityName, selectedRegionName, streetAddress]);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneDigitsRegex = /^\d{10}$/;

  const hasCompleteAddressSelection = (overrides?: AddressValidationState) => {
    const regionCode = overrides?.regionCode ?? selectedRegionCode;
    const cityCode = overrides?.cityCode ?? selectedCityCode;
    const barangayCode = overrides?.barangayCode ?? selectedBarangayCode;

    return Boolean(regionCode && cityCode && barangayCode);
  };

  const hasStreetAddress = (overrides?: AddressValidationState) => {
    const street = overrides?.street ?? streetAddress;
    return Boolean(street && street.trim());
  };

  const validateField = (name: string, value: string, overrides?: AddressValidationState) => {
    let message = '';

    if (name === 'firstName' || name === 'lastName') {
      if (!value || value.trim().length < 2) message = 'Must be at least 2 characters';
    }

    if (name === 'email') {
      if (!value) message = 'Email is required';
      else if (!emailRegex.test(value)) message = 'Invalid email address';
    }

    if (name === 'phoneNumber') {
      const digits = value.replace(/\D/g, '');
      if (digits && !digits.startsWith('9')) {
        message = 'Phone number must start with 9';
      } else if (digits && !phoneDigitsRegex.test(digits)) {
        message = 'Enter 10 digits (e.g. 9123456789)';
      }
    }

    if (name === 'preferredBranch') {
      if (!value) message = 'Preferred branch is required';
    }

    if (name === 'address') {
      if (!hasStreetAddress(overrides)) {
        message = 'Street / House / Subdivision is required.';
      } else if (!hasCompleteAddressSelection(overrides)) {
        message = 'Region, City/Municipality, and Barangay are required';
      }
    }

    setFieldErrors((prev) => ({ ...prev, [name]: message }));
    return message === '';
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'phoneNumber') {
      let digits = value.replace(/\D/g, '').slice(0, 10);
      if (digits.length > 0 && !digits.startsWith('9')) {
        digits = `9${digits.slice(1)}`;
      }
      setFormData((prev) => ({ ...prev, phoneNumber: digits }));
      validateField('phoneNumber', digits);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    validateField(name, value);
  };

  const handleRegionChange = async (regionCode: string) => {
    setSelectedRegionCode(regionCode);
    setSelectedCityCode('');
    setSelectedBarangayCode('');
    setCities([]);
    setBarangays([]);
    validateField('address', streetAddress, { regionCode, cityCode: '', barangayCode: '', street: streetAddress });

    if (!regionCode) {
      return;
    }

    setIsLoadingCities(true);
    try {
      const cityData = await phAddressAPI.getCitiesByRegion(regionCode);
      setCities(cityData);
    } catch {
      setError('Unable to load cities/municipalities for the selected region.');
    } finally {
      setIsLoadingCities(false);
    }
  };

  const handleCityChange = async (cityCode: string) => {
    setSelectedCityCode(cityCode);
    setSelectedBarangayCode('');
    setBarangays([]);
    validateField('address', streetAddress, {
      regionCode: selectedRegionCode,
      cityCode,
      barangayCode: '',
      street: streetAddress,
    });

    if (!cityCode) {
      return;
    }

    setIsLoadingBarangays(true);
    try {
      const barangayData = await phAddressAPI.getBarangaysByCity(cityCode);
      setBarangays(barangayData);
    } catch {
      setError('Unable to load barangays for the selected city/municipality.');
    } finally {
      setIsLoadingBarangays(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validations = [
      validateField('firstName', formData.firstName),
      validateField('lastName', formData.lastName),
      validateField('email', formData.email),
      validateField('preferredBranch', formData.preferredBranch),
      validateField('address', formData.address || ''),
    ];

    if (validations.some((isValid) => isValid === false)) {
      setError('Please fix validation errors before saving.');
      return;
    }

    setIsConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    setError('');

    try {
      await onSave({ ...formData, phoneNumber: formData.phoneNumber });
      setIsConfirmOpen(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
      setIsConfirmOpen(false);
    }
  };

  const isFormValid = () => {
    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.preferredBranch ||
      !streetAddress.trim() ||
      !selectedRegionCode ||
      !selectedCityCode ||
      !selectedBarangayCode
    ) {
      return false;
    }

    return Object.values(fieldErrors).every((msg) => !msg);
  };

  useEffect(() => {
    validateField('address', streetAddress, {
      regionCode: selectedRegionCode,
      cityCode: selectedCityCode,
      barangayCode: selectedBarangayCode,
      street: streetAddress,
    });
  }, [selectedRegionCode, selectedCityCode, selectedBarangayCode, streetAddress]);

  useEffect(() => {
    if (!isConfirmOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsConfirmOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isConfirmOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-4 relative">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-light">Edit Profile</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#FAF7F0] rounded-lg transition-colors"
            aria-label="Close edit profile modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-[#6B5D4F] mb-2">First Name</label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                required
              />
              {fieldErrors.firstName && <div className="text-sm text-red-600 mt-1">{fieldErrors.firstName}</div>}
            </div>

            <div>
              <label className="block text-sm text-[#6B5D4F] mb-2">Last Name</label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                required
              />
              {fieldErrors.lastName && <div className="text-sm text-red-600 mt-1">{fieldErrors.lastName}</div>}
            </div>

            <div>
              <label className="block text-sm text-[#6B5D4F] mb-2">Email Address</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
                required
              />
              {fieldErrors.email && <div className="text-sm text-red-600 mt-1">{fieldErrors.email}</div>}
            </div>

            <div>
              <label className="block text-sm text-[#6B5D4F] mb-2">Phone Number</label>
              <div className="flex w-full rounded-lg border border-[#E8DCC8] focus-within:border-[#D4AF37] transition-colors">
                <span className="flex items-center px-4 py-3 bg-[#FAF7F0] text-sm border-r border-[#E8DCC8]">+63</span>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber || ''}
                  onChange={handleChange}
                  maxLength={10}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="flex-1 px-4 py-3 bg-transparent focus:outline-none"
                  placeholder="9123456789"
                />
              </div>
              {fieldErrors.phoneNumber && <div className="text-sm text-red-600 mt-1">{fieldErrors.phoneNumber}</div>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-[#6B5D4F] mb-2">Preferred Branch</label>
              <select
                name="preferredBranch"
                value={formData.preferredBranch}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
              >
                <option value="Taguig Main">Taguig Main - Cadena de Amor</option>
                <option value="BGC Branch">BGC Branch</option>
                <option value="Makati Branch">Makati Branch</option>
                <option value="Quezon City">Quezon City</option>
              </select>
              {fieldErrors.preferredBranch && (
                <div className="text-sm text-red-600 mt-1">{fieldErrors.preferredBranch}</div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="streetAddress" className="block text-sm text-[#6B5D4F] mb-2">
                Street / House / Subdivision <span className="text-red-500">*</span>
              </label>
              <input
                id="streetAddress"
                type="text"
                value={streetAddress}
                onChange={(e) => {
                  const nextStreet = e.target.value;
                  setStreetAddress(nextStreet);
                  validateField('address', nextStreet, {
                    regionCode: selectedRegionCode,
                    cityCode: selectedCityCode,
                    barangayCode: selectedBarangayCode,
                    street: nextStreet,
                  });
                }}
                className={`w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none ${
                  fieldErrors.address ? 'border-red-500 focus:border-red-500' : 'border-[#E8DCC8] focus:border-[#D4AF37]'
                }`}
                placeholder="e.g. 213 Apple Street, Sub Village"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="region" className="block text-sm text-[#6B5D4F] mb-2">
                  Region <span className="text-red-500">*</span>
                </label>
                <select
                  id="region"
                  value={selectedRegionCode}
                  onChange={(e) => {
                    void handleRegionChange(e.target.value);
                  }}
                  className={`w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none bg-white ${
                    fieldErrors.address ? 'border-red-500 focus:border-red-500' : 'border-[#E8DCC8] focus:border-[#D4AF37]'
                  }`}
                  aria-label="Select region"
                  required
                >
                  <option value="">{isLoadingRegions ? 'Loading regions...' : 'Select region'}</option>
                  {regions.map((region) => (
                    <option key={region.code} value={region.code}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="city" className="block text-sm text-[#6B5D4F] mb-2">
                  City / Municipality <span className="text-red-500">*</span>
                </label>
                <select
                  id="city"
                  value={selectedCityCode}
                  onChange={(e) => {
                    void handleCityChange(e.target.value);
                  }}
                  disabled={!selectedRegionCode || isLoadingCities}
                  className={`w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none bg-white disabled:bg-gray-100 ${
                    fieldErrors.address ? 'border-red-500 focus:border-red-500' : 'border-[#E8DCC8] focus:border-[#D4AF37]'
                  }`}
                  aria-label="Select city or municipality"
                  required
                >
                  <option value="">
                    {isLoadingCities ? 'Loading cities/municipalities...' : 'Select city/municipality'}
                  </option>
                  {cities.map((city) => (
                    <option key={city.code} value={city.code}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="barangay" className="block text-sm text-[#6B5D4F] mb-2">
                  Barangay <span className="text-red-500">*</span>
                </label>
                <select
                  id="barangay"
                  value={selectedBarangayCode}
                  onChange={(e) => {
                    const nextBarangayCode = e.target.value;
                    setSelectedBarangayCode(nextBarangayCode);
                    validateField('address', streetAddress, {
                      regionCode: selectedRegionCode,
                      cityCode: selectedCityCode,
                      barangayCode: nextBarangayCode,
                    });
                  }}
                  disabled={!selectedCityCode || isLoadingBarangays}
                  className={`w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none bg-white disabled:bg-gray-100 ${
                    fieldErrors.address ? 'border-red-500 focus:border-red-500' : 'border-[#E8DCC8] focus:border-[#D4AF37]'
                  }`}
                  aria-label="Select barangay"
                  required
                >
                  <option value="">{isLoadingBarangays ? 'Loading barangays...' : 'Select barangay'}</option>
                  {barangays.map((barangay) => (
                    <option key={barangay.code} value={barangay.code}>
                      {barangay.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#6B5D4F] mb-2">Address Preview</label>
              <input
                type="text"
                value={composeAddress(streetAddress, selectedBarangayName, selectedCityName, selectedRegionName)}
                readOnly
                className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-600"
                aria-label="Composed address preview"
              />
            </div>

            {fieldErrors.address && <p className="text-red-500 text-xs mt-1">{fieldErrors.address}</p>}
          </div>

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-8 py-3 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-8 py-3 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors disabled:opacity-50"
              disabled={isLoading || !isFormValid()}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

        {isConfirmOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm profile changes"
          >
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold mb-4">Confirm Changes</h3>
              <p className="text-sm text-[#6B5D4F] mb-6">Are you sure you want to save these changes?</p>
              <div className="flex gap-4 justify-end">
                <button
                  type="button"
                  onClick={() => setIsConfirmOpen(false)}
                  className="px-6 py-3 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  className="px-6 py-3 bg-black text-white rounded-full hover:bg-[#D4AF37] transition-colors"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
