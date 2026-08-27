import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, Lock, X } from 'lucide-react';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';

interface ChangePasswordModalProps {
  isOpen: boolean;
  isForced?: boolean;
  userRole?: string;
  onClose: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
  onLogout?: () => void;
}

const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { key: 'uppercase', label: 'At least one uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { key: 'lowercase', label: 'At least one lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { key: 'number', label: 'At least one number', test: (value: string) => /\d/.test(value) },
  { key: 'special', label: 'At least one special character', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export function ChangePasswordModal({
  isOpen,
  isForced = false,
  userRole = 'customer',
  onClose,
  onSubmit,
  onLogout,
}: ChangePasswordModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useModalInteractionLock(isOpen, modalRef);

  useEffect(() => {
    if (!isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setServerError('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const passwordChecks = useMemo(
    () => PASSWORD_RULES.map((rule) => ({
      ...rule,
      met: rule.test(newPassword),
    })),
    [newPassword]
  );

  const isPasswordValid = passwordChecks.every((rule) => rule.met);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setServerError('');

    if (!currentPassword.trim()) {
      setServerError('Current password is required.');
      return;
    }

    if (!isPasswordValid) {
      setServerError('Please use a stronger password that meets all requirements.');
      return;
    }

    if (!passwordsMatch) {
      setServerError('New password and confirmation do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(currentPassword, newPassword);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Failed to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div ref={modalRef} className="modal-gradient-surface relative z-10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-black/5 flex items-center justify-center text-black">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-xl">Change Password</h2>
              <p className="text-sm text-[#6B5D4F] mt-1">
                {isForced
                  ? `${userRole === 'staff' ? 'Staff' : 'Customer'} accounts created by an admin must update their password before continuing.`
                  : 'Update your password to keep your account secure.'}
              </p>
            </div>
          </div>
          {!isForced && (
            <button onClick={onClose} className="text-gray-500 hover:text-black" aria-label="Close">
              <X />
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {serverError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="w-full px-4 py-3 pr-12 border bg-transparent focus:outline-none focus:border-black rounded-md"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B5D4F] hover:text-black"
                  aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                >
                  {showCurrentPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full px-4 py-3 pr-12 border bg-transparent focus:outline-none focus:border-black rounded-md"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B5D4F] hover:text-black"
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                >
                  {showNewPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full px-4 py-3 pr-12 border bg-transparent focus:outline-none focus:border-black rounded-md"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B5D4F] hover:text-black"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                </button>
              </div>
            </div>

            {newPassword.length > 0 && !isPasswordValid && (
              <ul className="space-y-2 rounded-xl border border-[#E8DCC8] bg-white px-4 py-3 text-sm">
                {passwordChecks.map((rule) => (
                  <li
                    key={rule.key}
                    className={rule.met ? 'text-green-600' : 'text-red-600'}
                  >
                    {rule.label}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-3 pt-4">
              <button
                type="submit"
                disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword || !isPasswordValid || !passwordsMatch}
                className="w-full rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#D4AF37] disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {isSubmitting ? 'Saving...' : 'Save New Password'}
              </button>

              <div className="flex gap-3">
                {!isForced && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-full border border-[#E8DCC8] px-6 py-3 text-sm text-[#6B5D4F] hover:border-black"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
