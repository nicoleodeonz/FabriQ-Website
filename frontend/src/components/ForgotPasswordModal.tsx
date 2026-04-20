import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { X, ArrowRight, Mail, Lock, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '../services/authAPI';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message?: string) => void;
  onBackToLogin?: () => void;
}

type Step = 'email' | 'code' | 'password';

const PASSWORD_RULES = {
  length: 8,
  lowercase: /[a-z]/,
  uppercase: /[A-Z]/,
  number: /\d/,
  special: /[!@#$!%*?&]/,
} as const;

const PASSWORD_REQUIREMENT_LABELS = {
  length: 'At least 8 characters',
  uppercase: 'At least one uppercase letter',
  lowercase: 'At least one lowercase letter',
  number: 'At least one number',
  special: 'At least one special character (!@#$%*?&)',
} as const;

export function ForgotPasswordModal({ isOpen, onClose, onSuccess, onBackToLogin }: ForgotPasswordModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);

  useEffect(() => {
    if (resendSecondsLeft <= 0) return;

    const timer = window.setTimeout(() => {
      setResendSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendSecondsLeft]);

  const passwordValid = useMemo(() => ({
    length: password.length >= PASSWORD_RULES.length,
    uppercase: PASSWORD_RULES.uppercase.test(password),
    lowercase: PASSWORD_RULES.lowercase.test(password),
    number: PASSWORD_RULES.number.test(password),
    special: PASSWORD_RULES.special.test(password),
  }), [password]);

  const passwordRequirements = useMemo(
    () => [
      { key: 'length', label: PASSWORD_REQUIREMENT_LABELS.length, met: passwordValid.length },
      { key: 'uppercase', label: PASSWORD_REQUIREMENT_LABELS.uppercase, met: passwordValid.uppercase },
      { key: 'lowercase', label: PASSWORD_REQUIREMENT_LABELS.lowercase, met: passwordValid.lowercase },
      { key: 'number', label: PASSWORD_REQUIREMENT_LABELS.number, met: passwordValid.number },
      { key: 'special', label: PASSWORD_REQUIREMENT_LABELS.special, met: passwordValid.special },
    ],
    [passwordValid]
  );

  const isPasswordValid = Object.values(passwordValid).every(Boolean);
  const passwordsMatch = password === confirmPassword && !!confirmPassword;

  const resetForm = useCallback(() => {
    setStep('email');
    setEmail('');
    setCode('');
    setPassword('');
    setConfirmPassword('');
    setEmailError('');
    setCodeError('');
    setPasswordError('');
    setMessage('');
    setIsSubmitting(false);
    setResendSecondsLeft(0);
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateEmailValue = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const updatePasswordError = (pwd: string, confirm = confirmPassword) => {
    if (confirm && pwd !== confirm) {
      return setPasswordError('Passwords do not match');
    }

    setPasswordError('');
  };

  const handleRequestResetCode = async () => {
    setEmailError('');
    setCodeError('');
    setPasswordError('');
    setMessage('');

    if (!validateEmailValue(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authAPI.requestPasswordReset({ email: email.trim() });
      setEmail(email.trim());
      setMessage(result.message);
      setStep('code');
      setResendSecondsLeft(60);
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'Failed to send the reset code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const validateCode = async () => {
    setCodeError('');
    setMessage('');

    if (code.length !== 6) {
      setCodeError('Enter the 6-digit reset code.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authAPI.verifyPasswordResetCode({ email: email.trim(), code });
      setMessage(result.message);
      setStep('password');
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : 'Incorrect code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordSubmit = async () => {
    updatePasswordError(password, confirmPassword);

    if (!isPasswordValid || !passwordsMatch) return;

    setIsSubmitting(true);
    try {
      const result = await authAPI.resetPassword({
        email: email.trim(),
        code,
        newPassword: password,
      });
      onSuccess(result.message);
      resetForm();
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to reset password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (resendSecondsLeft > 0 || !email.trim()) return;
    await handleRequestResetCode();
  };

  useModalInteractionLock(isOpen, modalRef);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />

      <div ref={modalRef} tabIndex={-1} className="relative z-10 bg-[#FAF7F0] w-full max-w-md rounded-2xl shadow-2xl">
        <header className="p-6 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center">
              <ShieldCheck className="text-black" />
            </div>
            <div>
              <h2 className="font-serif text-xl">Reset Password</h2>
              <p className="text-xs text-gray-500">
                {step === 'email'
                  ? 'Request a password reset code'
                  : step === 'code'
                  ? 'Enter verification code'
                  : 'Create a new password'}
              </p>
            </div>
          </div>
          <button onClick={handleClose}><X /></button>
        </header>

        <div className="p-8 space-y-6">
          {step === 'email' ? (
            <div className="space-y-4">
              <label className="text-xs uppercase flex items-center gap-2">
                <Mail className="w-4 h-4" /> Email Address
              </label>
              <input
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError('');
                }}
                className="w-full border px-4 py-3 rounded-xl"
                placeholder="you@example.com"
                type="email"
              />
              {emailError && <p className="text-xs text-red-500">{emailError}</p>}
              {message && <p className="text-xs text-gray-600">{message}</p>}
              <button
                onClick={handleRequestResetCode}
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 bg-black py-3 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{isSubmitting ? 'Sending…' : 'Send Reset Code'}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>
            </div>
          ) : step === 'code' ? (
            <div className="space-y-4">
              <label className="text-xs uppercase flex items-center gap-2">
                <Mail className="w-4 h-4" /> Verification Code
              </label>
              <input
                value={code}
                maxLength={6}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full border px-4 py-3 rounded-xl tracking-widest"
                placeholder="000000"
              />
              {message && <p className="text-xs text-gray-600">{message}</p>}
              {codeError && <p className="text-xs text-red-500">{codeError}</p>}
              <button
                onClick={validateCode}
                disabled={code.length !== 6 || isSubmitting}
                className="flex w-full items-center justify-center gap-2 bg-black py-3 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{isSubmitting ? 'Verifying…' : 'Verify Code'}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>
              <button
                onClick={handleResendCode}
                disabled={isSubmitting || resendSecondsLeft > 0}
                className="w-full border py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendSecondsLeft > 0 ? `Resend code in ${resendSecondsLeft}s` : 'Resend Code'}
              </button>
              <div className="flex items-center justify-between gap-4 pt-1 text-sm">
                <button
                  onClick={() => {
                    setStep('email');
                    setCode('');
                    setCodeError('');
                  }}
                  className="py-2 underline text-left text-black"
                >
                  Change email
                </button>
                {onBackToLogin && (
                  <button
                    onClick={() => { handleClose(); onBackToLogin(); }}
                    className="py-2 underline text-right text-black"
                  >
                    Back to Login
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="text-xs uppercase flex items-center gap-2">
                <Lock className="w-4 h-4" /> New Password
              </label>
              <PasswordInput
                value={password}
                show={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
                onChange={v => {
                  setPassword(v);
                  updatePasswordError(v);
                }}
              />

              {password.length > 0 && !isPasswordValid && (
                <ul className="space-y-2 rounded-xl border border-[#E8DCC8] bg-white px-4 py-3 text-sm">
                  {passwordRequirements.map((requirement) => (
                    <li
                      key={requirement.key}
                      className={requirement.met ? 'text-green-600' : 'text-red-600'}
                    >
                      {requirement.label}
                    </li>
                  ))}
                </ul>
              )}

              <PasswordInput
                value={confirmPassword}
                show={showConfirmPassword}
                onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
                onChange={v => {
                  setConfirmPassword(v);
                  updatePasswordError(password, v);
                }}
              />

              {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
              <button
                onClick={handlePasswordSubmit}
                disabled={!isPasswordValid || !passwordsMatch || isSubmitting}
                className="w-full bg-black text-white py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Saving…' : 'Set New Password'}
              </button>
            </div>
          )}

          {onBackToLogin && step !== 'code' && (
            <button
              onClick={() => { handleClose(); onBackToLogin(); }}
              className="w-full py-3 text-sm underline text-center text-black"
            >
              Back to Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PasswordInput({ value, show, onToggle, onChange }: { value: string; show: boolean; onToggle: () => void; onChange: (v: string) => void; }) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border px-4 py-3 rounded-xl pr-12"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-4 top-1/2 -translate-y-1/2"
      >
        {show ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}