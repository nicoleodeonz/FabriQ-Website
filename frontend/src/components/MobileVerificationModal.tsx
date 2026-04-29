import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, MessageSquare, ShieldCheck, Smartphone, X } from 'lucide-react';
import { customerAPI, type CustomerProfileResponse } from '../services/customerAPI';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';

interface MobileVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  phoneNumber?: string;
  isVerified?: boolean;
  onVerified?: (customer: CustomerProfileResponse) => void;
}

type VerificationStep = 'intro' | 'code' | 'success';

function formatPhoneNumber(value?: string) {
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

export function MobileVerificationModal({
  isOpen,
  onClose,
  token,
  phoneNumber,
  isVerified = false,
  onVerified,
}: MobileVerificationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<VerificationStep>('intro');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const formattedPhoneNumber = useMemo(() => formatPhoneNumber(phoneNumber), [phoneNumber]);

  useEffect(() => {
    setStep(isVerified ? 'success' : 'intro');
    setCode('');
    setMessage(null);
    setIsSendingCode(false);
    setIsVerifyingCode(false);
  }, [isOpen, isVerified]);

  useModalInteractionLock(isOpen, modalRef);

  const handleSendCode = async () => {
    setIsSendingCode(true);
    setMessage(null);

    try {
      const result = await customerAPI.sendPhoneVerificationCode(token);
      setStep('code');
      setMessage({ type: 'success', text: result.message });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to send verification code.',
      });
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setMessage({ type: 'error', text: 'Enter the 6-digit verification code first.' });
      return;
    }

    setIsVerifyingCode(true);
    setMessage(null);

    try {
      const result = await customerAPI.verifyPhoneVerificationCode(token, code);
      onVerified?.(result.customer);
      setStep('success');
      setMessage({ type: 'success', text: result.message });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to verify phone number.',
      });
    } finally {
      setIsVerifyingCode(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div ref={modalRef} tabIndex={-1} className="relative z-10 w-full max-w-lg rounded-2xl bg-[#FAF7F0] shadow-2xl">
        <header className="flex items-center justify-between border-b p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl">
              <ShieldCheck className="text-black" />
            </div>
            <div>
              <h2 className="font-serif text-xl">Verify Mobile Number</h2>
              <p className="text-xs text-gray-500">
                {step === 'intro' ? 'Request a verification code' : 'Enter the code sent to your number'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close mobile verification modal">
            <X />
          </button>
        </header>

        <div className="space-y-6 p-8 sm:p-9">
          {step === 'intro' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6 sm:p-7">
                <div className="mb-2 flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FAF7F0] border border-[#E8DCC8]">
                    <Smartphone className="h-5 w-5 text-[#6B5D4F]" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[#6B5D4F]">
                      Mobile Number
                    </div>
                    <p className="mt-2 text-xl font-medium tracking-[0.02em] text-black sm:text-2xl">
                      {formattedPhoneNumber || 'No mobile number saved yet'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-1 py-1 text-sm leading-7 text-[#6B5D4F]">
                {isVerified
                  ? 'Your saved number is already verified and can be used for rentals, appointments, and other customer flows that require SMS-confirmed contact details.'
                  : 'We will send a 6-digit SMS code to your saved mobile number through Semaphore. Your number stays unverified until that code is confirmed successfully.'}
              </div>

              {message && (
                <div className={`rounded-xl px-4 py-3 text-sm ${message.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-green-200 bg-green-50 text-green-700'}`}>
                  {message.text}
                </div>
              )}

              <button
                type="button"
                onClick={isVerified ? onClose : handleSendCode}
                disabled={!formattedPhoneNumber || isSendingCode}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-4 text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>{isVerified ? 'Close' : isSendingCode ? 'Sending Code...' : 'Send Verification Code'}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>
            </div>
          ) : step === 'code' ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6 sm:p-7">
                <div className="mb-4 flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FAF7F0]">
                    <MessageSquare className="h-5 w-5 text-[#6B5D4F]" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[#6B5D4F]">
                      Verification Code
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#6B5D4F]">
                      Enter the 6-digit code that was sent to {formattedPhoneNumber || 'your saved number'}.
                    </p>
                  </div>
                </div>
                <input
                  value={code}
                  maxLength={6}
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                    if (message) setMessage(null);
                  }}
                  className="w-full rounded-xl border border-[#E8DCC8] px-5 py-4 text-center text-lg tracking-[0.35em] focus:outline-none focus:border-[#D4AF37]"
                  placeholder="000000"
                  inputMode="numeric"
                />
              </div>

              {message && (
                <div className={`rounded-xl px-4 py-3 text-sm ${message.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-green-200 bg-green-50 text-green-700'}`}>
                  {message.text}
                </div>
              )}

              <button
                type="button"
                onClick={handleVerifyCode}
                disabled={code.length !== 6 || isVerifyingCode}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-4 text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>{isVerifyingCode ? 'Verifying...' : 'Verify Number'}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>

              <div className="flex items-center justify-end gap-4 pt-1 text-sm">
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={isSendingCode}
                  className="py-2 text-right text-black underline"
                >
                  {isSendingCode ? 'Resending...' : 'Resend code'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-green-200 bg-green-50 p-6 sm:p-7">
                <div className="mb-4 flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white border border-green-200">
                    <ShieldCheck className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-green-700">
                      Verified Number
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#3D4A36]">
                      {formattedPhoneNumber || 'Your saved number'} is verified and ready to use.
                    </p>
                  </div>
                </div>
              </div>

              {message && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {message.text}
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-4 text-white"
              >
                <span>Close</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}