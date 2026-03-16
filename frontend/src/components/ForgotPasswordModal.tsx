import { useState, useCallback, useMemo } from 'react';
import { X, ArrowRight, Mail, Lock, ShieldCheck, Eye, EyeOff } from 'lucide-react';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onBackToLogin?: () => void; // Optional callback to go back to AuthModal
}

type Step = 'code' | 'password';

const VALID_CODE = '000000';

const PASSWORD_RULES = {
  length: 8,
  lowercase: /[a-z]/,
  uppercase: /[A-Z]/,
  number: /\d/,
  special: /[!@#$!%*?&]/,
} as const;

export function ForgotPasswordModal({ isOpen, onClose, onSuccess, onBackToLogin }: ForgotPasswordModalProps) {
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Password validation
  const passwordValid = useMemo(() => ({
    length: password.length >= PASSWORD_RULES.length,
    uppercase: PASSWORD_RULES.uppercase.test(password),
    lowercase: PASSWORD_RULES.lowercase.test(password),
    number: PASSWORD_RULES.number.test(password),
    special: PASSWORD_RULES.special.test(password),
  }), [password]);

  const isPasswordValid = Object.values(passwordValid).every(Boolean);
  const passwordsMatch = password === confirmPassword && !!confirmPassword;

  const resetForm = useCallback(() => {
    setStep('code');
    setCode('');
    setPassword('');
    setConfirmPassword('');
    setCodeError('');
    setPasswordError('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateCode = () => {
    if (code === VALID_CODE) {
      setCodeError('');
      setStep('password');
    } else {
      setCodeError('Incorrect code. Please try again.');
    }
  };

  const updatePasswordError = (pwd: string, confirm = confirmPassword) => {
    if (pwd.length < PASSWORD_RULES.length)
        return setPasswordError('Password must be at least 8 characters');

    if (!PASSWORD_RULES.uppercase.test(pwd))
        return setPasswordError('Password must contain an uppercase letter');

    if (!PASSWORD_RULES.lowercase.test(pwd))
        return setPasswordError('Password must contain a lowercase letter');

    if (!PASSWORD_RULES.number.test(pwd))
        return setPasswordError('Password must contain a number');

    if (!PASSWORD_RULES.special.test(pwd))
        return setPasswordError('Password must contain a special character (!@#$%*?&)');

    if (confirm && pwd !== confirm)
        return setPasswordError('Passwords do not match');

    setPasswordError('');
    };

    const handlePasswordSubmit = () => {
        updatePasswordError(password, confirmPassword);

        if (!isPasswordValid || !passwordsMatch) return;

        onSuccess();
        resetForm();
    };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 bg-[#FAF7F0] w-full max-w-md rounded-2xl shadow-2xl">
        {/* Header */}
        <header className="p-6 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center">
              <ShieldCheck className="text-black" />
            </div>
            <div>
              <h2 className="font-serif text-xl">Reset Password</h2>
              <p className="text-xs text-gray-500">
                {step === 'code' ? 'Enter verification code' : 'Create a new password'}
              </p>
            </div>
          </div>
          <button onClick={handleClose}><X /></button>
        </header>

        {/* Body */}
        <div className="p-8 space-y-6">
          {step === 'code' ? (
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
              {codeError && <p className="text-xs text-red-500">{codeError}</p>}
              <button
                onClick={validateCode}
                disabled={code.length !== 6}
                className="w-full bg-black text-white py-3 rounded-xl"
              >
                Verify Code <ArrowRight className="inline ml-2" />
              </button>
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
                disabled={!isPasswordValid || !passwordsMatch}
                className="w-full bg-black text-white py-3 rounded-xl"
              >
                Set New Password
              </button>
            </div>
          )}

          {onBackToLogin && (
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

// Reusable password input with show/hide toggle
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