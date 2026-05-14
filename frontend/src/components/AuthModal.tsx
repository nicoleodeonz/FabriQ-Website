import { X, Eye, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';
import { authAPI } from '../services/authAPI';

type AuthErrors = {
  firstName: string[];
  lastName: string[];
  phoneNumber: string[];
  email: string[];
  password: string[];
  confirmPassword: string[];
};

type AuthField = keyof AuthErrors;

const accountTermsSections = [
  {
    title: '1. Eligibility',
    body: [
      'By registering for an account, you confirm that:',
      'You are at least 18 years old.',
      'You are legally capable of entering into a binding agreement under Philippine law.',
      'All information you provide is accurate, complete, and up to date.',
    ],
  },
  {
    title: '2. Account Registration',
    body: [
      'Users must provide valid and truthful information, including a working email address.',
      'You are responsible for maintaining the confidentiality of your account credentials.',
      'You agree to notify us immediately of any unauthorized use of your account.',
    ],
  },
  {
    title: '3. User Responsibilities',
    body: [
      'By using this website, you agree:',
      'Not to engage in fraudulent, illegal, or harmful activities.',
      'Not to upload or transmit viruses, malicious code, or spam.',
      'To use the website only for lawful purposes related to browsing and purchasing products.',
      'To respect other users and avoid abusive or inappropriate behavior.',
    ],
  },
  {
    title: '4. Orders and Payments',
    body: [
      'All orders are subject to availability and confirmation.',
      'Prices and product descriptions may change without prior notice.',
      'You agree to provide accurate payment and billing information.',
      'Hannah Vanessa Boutique reserves the right to cancel or refuse any order if fraud or unauthorized activity is suspected.',
    ],
  },
  {
    title: '5. Privacy and Data Protection',
    body: [
      'Your personal data will be handled in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173).',
      'By creating an account, you consent to the collection, use, and storage of your personal information for order processing and service improvement.',
      'We implement reasonable security measures to protect your data, but absolute security cannot be guaranteed.',
    ],
  },
  {
    title: '6. Account Suspension or Termination',
    body: [
      'We reserve the right to:',
      'Suspend or terminate accounts that violate these Terms and Conditions.',
      'Remove or restrict access to content that is unlawful or harmful.',
      'Deny service at our discretion, with or without prior notice.',
    ],
  },
  {
    title: '7. Intellectual Property',
    body: [
      'All content on this website, including logos, images, text, and designs, are the property of Hannah Vanessa Boutique.',
      'You may not reproduce, distribute, or exploit any content without prior written permission.',
    ],
  },
  {
    title: '8. Limitation of Liability',
    body: [
      'Hannah Vanessa Boutique shall not be liable for any direct, indirect, or incidental damages arising from the use of the website.',
      'All services are provided on an "as is" and "as available" basis.',
    ],
  },
  {
    title: '9. Changes to Terms',
    body: [
      'We reserve the right to update or modify these Terms at any time.',
      'Continued use of the website after changes constitutes your acceptance of the updated Terms.',
    ],
  },
  {
    title: '10. Governing Law',
    body: [
      'These Terms and Conditions shall be governed by and interpreted in accordance with the laws of the Republic of the Philippines.',
    ],
  },
  {
    title: '11. Contact Information',
    body: [
      'For questions or concerns regarding these Terms, you may contact us at:',
      'Email: hannahvanessaexclusive@gmail.com',
      'Phone: 0917 593 1093',
      'Address: Blk 185 Lot 09 Cadena de Amor St, corner Kampupot, Taguig, 1218',
    ],
  },
];

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (
    firstName: string,
    lastName: string,
    email: string,
    password: string,
    confirmPassword: string,
    phoneNumber?: string
  ) => Promise<{ email: string; message: string }>;
  onVerifySignUp: (email: string, code: string) => Promise<void>;
  onForgotPassword: () => void;
}

const emptyErrors = (): AuthErrors => ({
  firstName: [],
  lastName: [],
  phoneNumber: [],
  email: [],
  password: [],
  confirmPassword: [],
});

export function AuthModal({ isOpen, onClose, onSignIn, onSignUp, onVerifySignUp, onForgotPassword }: AuthModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const phoneVerificationModalRef = useRef<HTMLDivElement>(null);
  const phoneVerificationCodeInputRef = useRef<HTMLInputElement>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isVerifyingSignUp, setIsVerifyingSignUp] = useState(false);
  const [isPhoneVerificationModalOpen, setIsPhoneVerificationModalOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>(emptyErrors);
  const [serverError, setServerError] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [hasScrolledTermsToBottom, setHasScrolledTermsToBottom] = useState(false);
  const [phoneVerificationCode, setPhoneVerificationCode] = useState('');
  const [phoneVerificationMessage, setPhoneVerificationMessage] = useState<string | null>(null);
  const [phoneVerificationError, setPhoneVerificationError] = useState<string | null>(null);
  const [isSendingPhoneVerificationCode, setIsSendingPhoneVerificationCode] = useState(false);
  const [isVerifyingPhoneVerificationCode, setIsVerifyingPhoneVerificationCode] = useState(false);
  const [phoneVerificationResendSecondsLeft, setPhoneVerificationResendSecondsLeft] = useState(0);
  const [hasSentPhoneVerificationCode, setHasSentPhoneVerificationCode] = useState(false);
  const [verifiedPhoneDigits, setVerifiedPhoneDigits] = useState('');

  const isPhoneVerified = phone.length === 10 && verifiedPhoneDigits === phone;
  const isPhoneAlreadyRegisteredError = phoneVerificationError === 'This phone number is already registered.';

  useEffect(() => {
    if (resendSecondsLeft <= 0) return;

    const timer = window.setTimeout(() => {
      setResendSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendSecondsLeft]);

  useEffect(() => {
    if (phoneVerificationResendSecondsLeft <= 0) return;

    const timer = window.setTimeout(() => {
      setPhoneVerificationResendSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [phoneVerificationResendSecondsLeft]);

  useEffect(() => {
    if (!isPhoneVerificationModalOpen || isPhoneVerified) return;

    const frameId = window.requestAnimationFrame(() => {
      phoneVerificationCodeInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [hasSentPhoneVerificationCode, isPhoneVerificationModalOpen, isPhoneVerified]);

  const normalizePhoneDigits = (value: string) => {
    let digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length > 0 && !digits.startsWith('9')) {
      digits = `9${digits.slice(1)}`;
    }
    return digits;
  };

  const resetPhoneVerificationState = () => {
    setIsPhoneVerificationModalOpen(false);
    setPhoneVerificationCode('');
    setPhoneVerificationMessage(null);
    setPhoneVerificationError(null);
    setIsSendingPhoneVerificationCode(false);
    setIsVerifyingPhoneVerificationCode(false);
    setPhoneVerificationResendSecondsLeft(0);
    setHasSentPhoneVerificationCode(false);
    setVerifiedPhoneDigits('');
  };

  const resetAllState = () => {
    setIsSignUp(false);
    setIsVerifyingSignUp(false);
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setVerificationCode('');
    setErrors(emptyErrors());
    setServerError(null);
    setVerificationError(null);
    setVerificationMessage(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setResendSecondsLeft(0);
    setIsTermsOpen(false);
    setHasAcceptedTerms(false);
    setHasScrolledTermsToBottom(false);
    resetPhoneVerificationState();
  };

  const submitSignUpRequest = async () => {
    if (!isPhoneVerified) {
      setServerError('Verify your mobile number before continuing to email verification.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSignUp(
        firstName,
        lastName,
        email,
        password,
        confirmPassword,
        phone ? `+63${phone}` : undefined
      );

      setIsVerifyingSignUp(true);
      setVerificationMessage(result.message);
      setVerificationCode('');
      setResendSecondsLeft(60);
      setIsTermsOpen(false);
      setHasScrolledTermsToBottom(false);
    } catch (error: any) {
      setServerError(error?.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFieldErrors = (field: AuthField, value: string, passwordValue = password) => {
    if (field === 'firstName') {
      return !value.trim() ? ['First name is required.'] : [];
    }

    if (field === 'lastName') {
      return !value.trim() ? ['Last name is required.'] : [];
    }

    if (field === 'phoneNumber') {
      const digits = normalizePhoneDigits(value);
      if (!digits) return ['Phone number is required.'];
      if (!digits.startsWith('9')) return ['Phone number must start with 9.'];
      if (digits.length !== 10) return ['Enter 10 digits (e.g. 9123456789).'];
      return [];
    }

    if (field === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!value) return ['Email is required.'];
      if (!emailRegex.test(value)) return ['Please enter a valid email address.'];
      return [];
    }

    if (field === 'password') {
      if (!value) {
        return ['Password is required.'];
      }

      if (isSignUp) {
        const passwordErrors: string[] = [];
        if (value.length < 8) passwordErrors.push('At least 8 characters long.');
        if (!/[a-z]/.test(value)) passwordErrors.push('At least one lowercase letter.');
        if (!/[A-Z]/.test(value)) passwordErrors.push('At least one uppercase letter.');
        if (!/\d/.test(value)) passwordErrors.push('At least one number.');
        if (!/[^A-Za-z0-9]/.test(value)) passwordErrors.push('At least one special character.');
        return passwordErrors;
      }

      return [];
    }

    if (field === 'confirmPassword' && isSignUp) {
      if (!value) return ['Please confirm your password.'];
      if (value !== passwordValue) return ['Passwords do not match.'];
    }

    return [];
  };

  const validateField = (field: AuthField, value: string, passwordValue = password) => {
    const fieldErrors = getFieldErrors(field, value, passwordValue);
    setErrors((prev) => ({ ...prev, [field]: fieldErrors }));
    return fieldErrors;
  };

  const buildErrors = (passwordValue = password): AuthErrors => ({
    firstName: isSignUp ? getFieldErrors('firstName', firstName, passwordValue) : [],
    lastName: isSignUp ? getFieldErrors('lastName', lastName, passwordValue) : [],
    phoneNumber: isSignUp ? getFieldErrors('phoneNumber', phone, passwordValue) : [],
    email: getFieldErrors('email', email, passwordValue),
    password: getFieldErrors('password', passwordValue, passwordValue),
    confirmPassword: isSignUp ? getFieldErrors('confirmPassword', confirmPassword, passwordValue) : [],
  });

  const handleFirstNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFirstName(e.target.value);
    validateField('firstName', e.target.value);
  };

  const handleLastNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLastName(e.target.value);
    validateField('lastName', e.target.value);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = normalizePhoneDigits(e.target.value);
    if (digits !== verifiedPhoneDigits) {
      setVerifiedPhoneDigits('');
      setPhoneVerificationCode('');
      setPhoneVerificationMessage(null);
      setPhoneVerificationError(null);
      setPhoneVerificationResendSecondsLeft(0);
      setHasSentPhoneVerificationCode(false);
      setIsPhoneVerificationModalOpen(false);
    }
    setPhone(digits);
    validateField('phoneNumber', digits);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value.trim().toLowerCase() !== email.trim().toLowerCase()) {
      setVerifiedPhoneDigits('');
      setPhoneVerificationCode('');
      setPhoneVerificationMessage(null);
      setPhoneVerificationError(null);
      setPhoneVerificationResendSecondsLeft(0);
      setHasSentPhoneVerificationCode(false);
      setIsPhoneVerificationModalOpen(false);
    }
    setEmail(e.target.value);
    validateField('email', e.target.value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextPassword = e.target.value;
    setPassword(nextPassword);
    validateField('password', nextPassword, nextPassword);
    if (isSignUp && confirmPassword) validateField('confirmPassword', confirmPassword, nextPassword);
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    validateField('confirmPassword', e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setVerificationError(null);

    const nextErrors = buildErrors(password);
    setErrors(nextErrors);

    const hasErrors = Object.values(nextErrors).some((arr) => arr.length > 0);
    if (hasErrors) return;

    if (isSignUp) {
      if (phone && !isPhoneVerified) {
        setServerError('Verify your mobile number before continuing to email verification.');
        return;
      }
      setHasAcceptedTerms(false);
      setHasScrolledTermsToBottom(false);
      setIsTermsOpen(true);
      return;
    }

    setIsSubmitting(true);
    try {
      if (!isSignUp) {
        await onSignIn(email, password);
        resetAllState();
      }
    } catch (error: any) {
      setServerError(error?.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifySignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationError(null);

    if (verificationCode.trim().length !== 6) {
      setVerificationError('Enter the 6-digit verification code sent to your email.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onVerifySignUp(email, verificationCode.trim());
      resetAllState();
    } catch (error: any) {
      setVerificationError(error?.message || 'Failed to verify your email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerificationCode = async () => {
    if (resendSecondsLeft > 0) return;

    setVerificationError(null);
    setServerError(null);
    if (!isPhoneVerified) {
      setVerificationError('Verify your mobile number before requesting an email verification code.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSignUp(
        firstName,
        lastName,
        email,
        password,
        confirmPassword,
        phone ? `+63${phone}` : undefined
      );

      setVerificationMessage(result.message);
      setResendSecondsLeft(60);
    } catch (error: any) {
      setVerificationError(error?.message || 'Failed to resend the verification code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenPhoneVerification = () => {
    setServerError(null);
    setPhoneVerificationError(null);

    const nextErrors = buildErrors(password);
    setErrors(nextErrors);

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || !confirmPassword) {
      setServerError('Complete the signup details first before verifying your mobile number.');
      return;
    }

    if (Object.values(nextErrors).some((arr) => arr.length > 0)) {
      setServerError('Fix the signup errors first before verifying your mobile number.');
      return;
    }

    if (!phone || phone.length !== 10) {
      setPhoneVerificationError('Enter a valid 10-digit mobile number first.');
      return;
    }

    setIsPhoneVerificationModalOpen(true);
    setPhoneVerificationMessage(isPhoneVerified ? 'This mobile number is already verified.' : null);
  };

  const handleSendPhoneVerificationCode = async () => {
    setPhoneVerificationError(null);
    setPhoneVerificationMessage(null);

    if (!phone || phone.length !== 10) {
      setPhoneVerificationError('Enter a valid 10-digit mobile number first.');
      return;
    }

    setIsSendingPhoneVerificationCode(true);
    try {
      const result = await authAPI.sendSignUpPhoneVerificationCode({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        phoneNumber: `+63${phone}`,
      });
      setHasSentPhoneVerificationCode(true);
      setPhoneVerificationResendSecondsLeft(result.verified ? 0 : 60);
      if (result.verified) {
        setVerifiedPhoneDigits(phone);
      }
    } catch (error: any) {
      setPhoneVerificationError(error?.message || 'Failed to send the mobile verification code.');
    } finally {
      setIsSendingPhoneVerificationCode(false);
    }
  };

  const handleVerifyPhoneCode = async () => {
    setPhoneVerificationError(null);
    setPhoneVerificationMessage(null);

    if (phoneVerificationCode.trim().length !== 6) {
      setPhoneVerificationError('Enter the 6-digit code sent to your mobile number.');
      return;
    }

    setIsVerifyingPhoneVerificationCode(true);
    try {
      const result = await authAPI.verifySignUpPhoneVerificationCode({
        email: email.trim(),
        code: phoneVerificationCode.trim(),
      });
      setVerifiedPhoneDigits(phone);
      setPhoneVerificationMessage(result.message);
      setPhoneVerificationCode('');
      setIsPhoneVerificationModalOpen(false);
    } catch (error: any) {
      setPhoneVerificationError(error?.message || 'Failed to verify the mobile number.');
    } finally {
      setIsVerifyingPhoneVerificationCode(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setIsVerifyingSignUp(false);
    setIsTermsOpen(false);
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setVerificationCode('');
    setErrors(emptyErrors());
    setServerError(null);
    setVerificationError(null);
    setVerificationMessage(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setResendSecondsLeft(0);
    resetPhoneVerificationState();
    setHasAcceptedTerms(false);
    setHasScrolledTermsToBottom(false);
  };

  const handleTermsScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 8;
    if (isAtBottom) {
      setHasScrolledTermsToBottom(true);
    }
  };

  const handleClose = () => {
    resetAllState();
    onClose();
  };

  useModalInteractionLock(isOpen && !isPhoneVerificationModalOpen, modalRef);
  useModalInteractionLock(isPhoneVerificationModalOpen, phoneVerificationModalRef);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative z-10 bg-[#FAF7F0] w-full max-h-[calc(100vh-2rem)] flex flex-col shadow-2xl rounded-lg overflow-hidden md:p-10 p-5"
        style={{
          maxWidth: isSignUp || isVerifyingSignUp ? '592px' : '580px',
        }}
      >
        <div className="flex-1 flex flex-col overflow-auto">
          <button onClick={handleClose} className="absolute top-4 right-4 text-[#6B5D4F] hover:text-black z-10">
            <X className="w-5 h-5" />
          </button>
          <div
            className={`flex-1 flex flex-col items-center text-center pb-8 ${
              isSignUp || isVerifyingSignUp ? 'justify-start pt-[30px]' : 'justify-center'
            }`}
          >
            <div style={{ paddingTop: 30 }}>
              <h2 className="font-serif text-2xl sm:text-3xl font-light mb-3">
                {isVerifyingSignUp ? 'Verify Your Email' : isSignUp ? 'Create Account' : 'Welcome Back'}
              </h2>
              <p className="text-sm text-[#6B5D4F] mb-6 max-w-md leading-relaxed">
                {isVerifyingSignUp
                  ? 'Enter the 6-digit code we sent to complete your account setup'
                  : isSignUp
                  ? 'Join us to start your journey'
                  : 'Sign in to continue your journey with us'}
              </p>
            </div>
            <form onSubmit={isVerifyingSignUp ? handleVerifySignUp : handleSubmit} className="w-full max-w-lg space-y-4">
              {!isVerifyingSignUp && serverError && (
                <p className="text-red-500 text-sm text-center">{serverError}</p>
              )}

              {isVerifyingSignUp ? (
                <>
                  {verificationMessage && (
                    <p className="text-sm text-[#6B5D4F] text-center">{verificationMessage}</p>
                  )}
                  {verificationError && (
                    <p className="text-red-500 text-sm text-center">{verificationError}</p>
                  )}
                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-2">Verification Code</label>
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(event) => {
                        setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                        if (verificationError) setVerificationError(null);
                      }}
                      maxLength={6}
                      inputMode="numeric"
                      placeholder="Enter 6-digit code"
                      className="w-full px-4 py-3 border border-[#CFC6B8] bg-transparent focus:outline-none focus:border-black rounded-md text-center tracking-[0.35em]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting || verificationCode.length !== 6}
                    className={`w-full py-3 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-all rounded-md font-medium ${
                      isSubmitting || verificationCode.length !== 6 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isSubmitting ? 'Verifying…' : 'Verify and Create Account'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResendVerificationCode}
                    disabled={isSubmitting || resendSecondsLeft > 0}
                    className={`w-full py-3 border border-[#CFC6B8] rounded-md font-medium ${
                      isSubmitting || resendSecondsLeft > 0 ? 'opacity-50 cursor-not-allowed' : 'hover:border-black'
                    }`}
                  >
                    {resendSecondsLeft > 0 ? `Resend code in ${resendSecondsLeft}s` : 'Resend verification code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsVerifyingSignUp(false);
                      setVerificationCode('');
                      setVerificationError(null);
                    }}
                    className="w-full py-3 text-sm underline text-center text-black"
                  >
                    Back to sign up
                  </button>
                </>
              ) : (
                <>
                  {isSignUp && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs uppercase tracking-wider mb-2">First Name</label>
                          <input
                            type="text"
                            value={firstName}
                            onChange={handleFirstNameChange}
                            onBlur={() => validateField('firstName', firstName)}
                            required
                            className={`w-full px-4 py-3 border bg-transparent focus:outline-none focus:border-black rounded-md ${
                              errors.firstName.length > 0 ? 'border-red-500' : 'border-[#CFC6B8]'
                            }`}
                          />
                          {errors.firstName.map((error, index) => (
                            <p key={index} className="text-red-500 text-xs mt-1">{error}</p>
                          ))}
                        </div>
                        <div>
                          <label className="block text-xs uppercase tracking-wider mb-2">Last Name</label>
                          <input
                            type="text"
                            value={lastName}
                            onChange={handleLastNameChange}
                            onBlur={() => validateField('lastName', lastName)}
                            required
                            className={`w-full px-4 py-3 border bg-transparent focus:outline-none focus:border-black rounded-md ${
                              errors.lastName.length > 0 ? 'border-red-500' : 'border-[#CFC6B8]'
                            }`}
                          />
                          {errors.lastName.map((error, index) => (
                            <p key={index} className="text-red-500 text-xs mt-1">{error}</p>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs uppercase tracking-wider mb-2">Phone Number</label>
                        <div
                          className={`flex w-full rounded-md border bg-transparent transition-colors ${
                            errors.phoneNumber.length > 0 ? 'border-red-500' : 'border-[#CFC6B8] focus-within:border-black'
                          }`}
                        >
                          <span className="flex items-center px-4 py-3 text-sm text-[#6B5D4F] border-r border-[#CFC6B8] bg-[#F5F0E6] rounded-l-md">
                            +63
                          </span>
                          <input
                            type="tel"
                            value={phone}
                            onChange={handlePhoneChange}
                            onBlur={() => validateField('phoneNumber', phone)}
                            maxLength={10}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="9123456789"
                            className="flex-1 px-4 py-3 bg-transparent focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleOpenPhoneVerification}
                            disabled={isPhoneVerified || !phone || phone.length !== 10}
                            className={`px-4 py-3 border-l border-[#CFC6B8] rounded-r-md text-sm font-medium transition-colors ${
                              isPhoneVerified
                                ? 'bg-[#E8F3E3] text-[#2F5A2F]'
                                : 'bg-[#F5F0E6] text-[#1A1A1A] hover:bg-[#ECE2D2] disabled:cursor-not-allowed disabled:opacity-50'
                            }`}
                          >
                            {isPhoneVerified ? 'Verified' : 'Verify'}
                          </button>
                        </div>
                        {errors.phoneNumber.map((error, index) => (
                          <p key={index} className="text-red-500 text-xs mt-1">{error}</p>
                        ))}
                        {isPhoneVerified && errors.phoneNumber.length === 0 && (
                          <p className="text-[#2F5A2F] text-xs mt-1">Mobile number verified.</p>
                        )}
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-2">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={handleEmailChange}
                      onBlur={() => validateField('email', email)}
                      required
                      className={`w-full px-4 py-3 border bg-transparent focus:outline-none focus:border-black rounded-md ${
                        errors.email.length > 0 ? 'border-red-500' : 'border-[#CFC6B8]'
                      }`}
                    />
                    {errors.email.map((error, index) => (
                      <p key={index} className="text-red-500 text-xs mt-1">{error}</p>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider mb-2">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={handlePasswordChange}
                        onBlur={() => validateField('password', password)}
                        required
                        className={`w-full px-4 py-3 pr-12 border bg-transparent focus:outline-none focus:border-black rounded-md ${
                          errors.password.length > 0 ? 'border-red-500' : 'border-[#CFC6B8]'
                        }`}
                      />
                      <button
                        type="button"
                        onPointerDown={() => setShowPassword(true)}
                        onPointerUp={() => setShowPassword(false)}
                        onPointerLeave={() => setShowPassword(false)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B5D4F] hover:text-black"
                      >
                        {showPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                      </button>
                    </div>
                    {errors.password.map((error, index) => (
                      <p key={index} className="text-red-500 text-xs mt-1">{error}</p>
                    ))}
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={onForgotPassword}
                        className="mt-2 text-xs w-full text-right text-[#6B5D4F] underline hover:text-black"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  {isSignUp && (
                    <div>
                      <label className="block text-xs uppercase tracking-wider mb-2">Confirm Password</label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={handleConfirmPasswordChange}
                          onBlur={() => validateField('confirmPassword', confirmPassword)}
                          required
                          className={`w-full px-4 py-3 pr-12 border bg-transparent focus:outline-none focus:border-black rounded-md ${
                            errors.confirmPassword.length > 0 ? 'border-red-500' : 'border-[#CFC6B8]'
                          }`}
                        />
                        <button
                          type="button"
                          onPointerDown={() => setShowConfirmPassword(true)}
                          onPointerUp={() => setShowConfirmPassword(false)}
                          onPointerLeave={() => setShowConfirmPassword(false)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B5D4F] hover:text-black"
                        >
                          {showConfirmPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                        </button>
                      </div>
                      {errors.confirmPassword.map((error, index) => (
                        <p key={index} className="text-red-500 text-xs mt-1">{error}</p>
                      ))}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting || (isSignUp && !isPhoneVerified)}
                    className={`w-full py-3 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-all rounded-md font-medium ${
                      isSubmitting || (isSignUp && !isPhoneVerified) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isSubmitting
                      ? 'Processing…'
                      : isSignUp
                        ? isPhoneVerified
                          ? 'Send Verification Code'
                          : 'Verify Phone Number First'
                        : 'Sign in'}
                  </button>
                </>
              )}
            </form>
            {!isVerifyingSignUp && (
              <p className="text-sm text-[#6B5D4F] mt-6">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={toggleMode}
                  className="hover:text-black font-medium"
                >
                  <span
                    className="inline-block leading-none"
                    style={{ boxShadow: 'inset 0 -0.08em 0 -0.03em currentColor' }}
                  >
                    {isSignUp ? 'Sign In' : 'Sign Up'}
                  </span>
                </button>
              </p>
            )}
          </div>
        </div>
      </div>

      {isTermsOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#1A1A1A]/45 backdrop-blur-[2px]" onClick={() => !isSubmitting && setIsTermsOpen(false)} />
          <div
            className="relative z-10 w-full overflow-hidden border-2 border-[#3A342E] shadow-[8px_8px_0_rgba(58,52,46,0.35)]"
            style={{ maxWidth: '720px', height: '500px', backgroundColor: '#F7F3EC' }}
            role="dialog"
            aria-modal="true"
            aria-label="Terms, Conditions, and Policies"
          >
            <div
              className="h-full px-8 pb-6 pt-8 md:px-12 md:pb-8 md:pt-10"
              style={{
                display: 'grid',
                gridTemplateRows: 'auto 1fr auto auto',
                rowGap: '20px',
                backgroundColor: '#F7F3EC',
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="text-left">
                  <h3 className="font-serif text-[2rem] font-semibold leading-none text-[#1A1A1A]">Terms, Conditions, and Policies</h3>
                  <p className="mt-3 text-sm leading-6 text-[#6B5D4F]">Please read and accept these terms before continuing with account creation.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTermsOpen(false)}
                  disabled={isSubmitting}
                  className="text-[#6B5D4F] transition-colors hover:text-black disabled:opacity-50"
                  aria-label="Close terms and policies"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div
                className="border-2 border-[#3A342E] bg-white px-6 py-6 md:px-8 md:py-8"
                style={{
                  minHeight: 0,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    overflowY: 'auto',
                    paddingRight: '12px',
                    scrollbarWidth: 'thin',
                  }}
                  onScroll={handleTermsScroll}
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.04em] text-[#1A1A1A]">Terms and Conditions for Account Creation and Use</p>
                  <p className="mt-2 text-lg font-semibold text-[#1A1A1A]">Hannah Vanessa Dress Shop</p>
                  <p className="mt-1 text-sm text-[#6B5D4F]">Last Updated: May 4, 2026</p>
                  <p className="mt-6 text-sm leading-7 text-[#3D2B1F]">
                    Welcome to Hannah Vanessa Boutique. By creating an account and using our website, you agree to comply with and be bound by the following Terms and Conditions. Please read them carefully before registering.
                  </p>

                  <div className="mt-7 space-y-8 text-left">
                    {accountTermsSections.map((section) => (
                      <section key={section.title} className="pr-2">
                        <h4 className="text-base font-semibold uppercase tracking-[0.02em] text-[#1A1A1A]">{section.title}</h4>
                        <div className="mt-3 space-y-2 text-sm leading-7 text-[#3D2B1F]">
                          {section.body.map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-md border border-[#D8CCBA] bg-[#F2EBE0] px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={hasAcceptedTerms}
                  onChange={(event) => setHasAcceptedTerms(event.target.checked)}
                  disabled={isSubmitting || !hasScrolledTermsToBottom}
                  className="mt-1 h-4 w-4 accent-[#1A1A1A]"
                />
                <span className="text-sm italic leading-6 text-[#3D2B1F] underline underline-offset-2">
                  I agree to the terms, conditions, and policies stated above
                </span>
              </label>
              {!hasScrolledTermsToBottom && (
                <p className="-mt-2 text-xs text-[#6B5D4F]">
                  Scroll to the bottom of the terms and conditions before you can agree.
                </p>
              )}

              <div className="border-t border-[#D8CCBA] bg-[#F2EBE0] px-5 py-4 md:px-6">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsTermsOpen(false)}
                    disabled={isSubmitting}
                    className="w-full sm:w-[170px] rounded-md border border-[#C8BEAF] bg-white px-5 py-3 text-sm font-medium text-[#4B433A] transition-colors hover:border-[#6B5D4F] hover:text-black disabled:opacity-50"
                  >
                    Refuse
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitSignUpRequest()}
                    disabled={isSubmitting || !hasAcceptedTerms || !isPhoneVerified}
                    className={`w-full sm:w-[170px] rounded-md px-5 py-3 text-sm font-medium transition-colors ${
                      isSubmitting || !hasAcceptedTerms || !isPhoneVerified ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                    style={{ backgroundColor: '#1A1A1A', color: '#FFFFFF' }}
                  >
                    {isSubmitting ? 'Sending Verification Code…' : isPhoneVerified ? 'Continue' : 'Verify Phone First'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPhoneVerificationModalOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !isSendingPhoneVerificationCode && !isVerifyingPhoneVerificationCode && setIsPhoneVerificationModalOpen(false)} />
          <div ref={phoneVerificationModalRef} tabIndex={-1} className="relative z-10 w-full max-w-md rounded-lg bg-[#FAF7F0] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setIsPhoneVerificationModalOpen(false)}
              className="absolute right-4 top-4 text-[#6B5D4F] hover:text-black"
              aria-label="Close phone verification modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="pr-8">
              <h3 className="font-serif text-2xl font-light">Verify Mobile Number</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#6B5D4F]">
                Send a 6-digit SMS code to +63 {phone || '__________'} and confirm it before creating your account.
              </p>
            </div>

            {phoneVerificationError && !isPhoneAlreadyRegisteredError && (
              <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {phoneVerificationError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              {isPhoneAlreadyRegisteredError ? (
                <div className="w-full rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {phoneVerificationError}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSendPhoneVerificationCode}
                  disabled={isSendingPhoneVerificationCode || isPhoneVerified || phoneVerificationResendSecondsLeft > 0}
                  className={`w-full rounded-md border border-[#CFC6B8] px-4 py-3 text-sm font-medium transition-colors ${
                    isSendingPhoneVerificationCode || isPhoneVerified || phoneVerificationResendSecondsLeft > 0
                      ? 'cursor-not-allowed opacity-50'
                      : 'bg-white hover:border-black'
                  }`}
                >
                  {isPhoneVerified
                    ? 'Mobile Number Verified'
                    : isSendingPhoneVerificationCode
                      ? 'Sending Code…'
                      : phoneVerificationResendSecondsLeft > 0
                        ? `Resend Verification Code in ${phoneVerificationResendSecondsLeft}s`
                        : hasSentPhoneVerificationCode
                          ? 'Resend Verification Code'
                          : 'Send Verification Code'}
                </button>
              )}

              <div>
                <label className="block text-xs uppercase tracking-wider mb-2">Verification Code</label>
                <input
                  ref={phoneVerificationCodeInputRef}
                  type="text"
                  value={phoneVerificationCode}
                  onChange={(event) => {
                    setPhoneVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                    if (phoneVerificationError) setPhoneVerificationError(null);
                  }}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter 6-digit code"
                  className="w-full px-4 py-3 border border-[#CFC6B8] bg-transparent focus:outline-none focus:border-black rounded-md text-center tracking-[0.35em]"
                />
              </div>

              <button
                type="button"
                onClick={handleVerifyPhoneCode}
                disabled={isVerifyingPhoneVerificationCode || phoneVerificationCode.length !== 6 || isPhoneVerified}
                className={`w-full rounded-md bg-[#1a1a1a] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#D4AF37] ${
                  isVerifyingPhoneVerificationCode || phoneVerificationCode.length !== 6 || isPhoneVerified
                    ? 'cursor-not-allowed opacity-50'
                    : ''
                }`}
              >
                {isPhoneVerified
                  ? 'Verified'
                  : isVerifyingPhoneVerificationCode
                    ? 'Verifying…'
                    : 'Verify Number'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
