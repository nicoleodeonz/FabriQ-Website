import { X, Eye, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';

type AuthErrors = {
  firstName: string[];
  lastName: string[];
  phoneNumber: string[];
  email: string[];
  password: string[];
  confirmPassword: string[];
};

type AuthField = keyof AuthErrors;

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
  const [isSignUp, setIsSignUp] = useState(false);
  const [isVerifyingSignUp, setIsVerifyingSignUp] = useState(false);
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

  useEffect(() => {
    if (resendSecondsLeft <= 0) return;

    const timer = window.setTimeout(() => {
      setResendSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendSecondsLeft]);

  const normalizePhoneDigits = (value: string) => {
    let digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length > 0 && !digits.startsWith('9')) {
      digits = `9${digits.slice(1)}`;
    }
    return digits;
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
      if (!digits) return [];
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
        if (!/[@$!%*?&]/.test(value)) passwordErrors.push('At least one special character (@$!%*?&).');
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
    setPhone(digits);
    validateField('phoneNumber', digits);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setIsSubmitting(true);
    try {
      if (isSignUp) {
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
      } else {
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

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
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
  };

  const handleClose = () => {
    resetAllState();
    onClose();
  };

  useModalInteractionLock(isOpen, modalRef);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div ref={modalRef} tabIndex={-1} className="relative z-10 bg-[#FAF7F0] w-full max-w-[680px] max-h-[calc(100vh-2rem)] flex flex-col shadow-2xl rounded-lg overflow-hidden md:p-10 p-5">
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
                            className="flex-1 px-4 py-3 bg-transparent focus:outline-none rounded-r-md"
                          />
                        </div>
                        {errors.phoneNumber.map((error, index) => (
                          <p key={index} className="text-red-500 text-xs mt-1">{error}</p>
                        ))}
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
                    disabled={isSubmitting}
                    className={`w-full py-3 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-all rounded-md font-medium ${
                      isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isSubmitting ? 'Processing…' : isSignUp ? 'Send Verification Code' : 'Sign in'}
                  </button>
                </>
              )}
            </form>
            {!isVerifyingSignUp && (
              <p className="text-sm text-[#6B5D4F] mt-6">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button onClick={toggleMode} className="underline hover:text-black font-medium">
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
