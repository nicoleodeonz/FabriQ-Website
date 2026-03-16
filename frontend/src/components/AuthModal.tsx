import { X, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

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
    phoneNumber: string
  ) => Promise<void>;
  onForgotPassword: () => void;
}

export function AuthModal({ isOpen, onClose, onSignIn, onSignUp, onForgotPassword }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{
    firstName: string[];
    lastName: string[];
    phoneNumber: string[];
    email: string[];
    password: string[];
    confirmPassword: string[];
  }>({
    firstName: [],
    lastName: [],
    phoneNumber: [],
    email: [],
    password: [],
    confirmPassword: []
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const validateField = (field: string, value: string) => {
    const newErrors = { ...errors };

    if (field === 'firstName') {
      if (!value.trim()) newErrors.firstName = ['First name is required.'];
      else newErrors.firstName = [];
    } else if (field === 'lastName') {
      if (!value.trim()) newErrors.lastName = ['Last name is required.'];
      else newErrors.lastName = [];
    } else if (field === 'phoneNumber') {
      const phoneRegex = /^\+63\d{10}$/;
      if (!value) newErrors.phoneNumber = ['Phone number is required.'];
      else if (!phoneRegex.test(value)) newErrors.phoneNumber = ['Phone must be in the format +63XXXXXXXXXX.'];
      else newErrors.phoneNumber = [];
    } else if (field === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!value) newErrors.email = ['Email is required.'];
      else if (!emailRegex.test(value)) newErrors.email = ['Please enter a valid email address.'];
      else newErrors.email = [];
    } else if (field === 'password') {
      // Only enforce strong password rules during sign up.
      // During login, only require a value to be present.
      if (!value) {
        newErrors.password = ['Password is required.'];
      } else if (isSignUp) {
        const passwordErrors: string[] = [];
        if (value.length < 8) passwordErrors.push('At least 8 characters long.');
        if (!/[a-z]/.test(value)) passwordErrors.push('At least one lowercase letter.');
        if (!/[A-Z]/.test(value)) passwordErrors.push('At least one uppercase letter.');
        if (!/\d/.test(value)) passwordErrors.push('At least one number.');
        if (!/[@$!%*?&]/.test(value)) passwordErrors.push('At least one special character (@$!%*?&).');
        newErrors.password = passwordErrors;
      } else {
        newErrors.password = [];
      }
    } else if (field === 'confirmPassword' && isSignUp) {
      if (!value) newErrors.confirmPassword = ['Please confirm your password.'];
      else if (value !== password) newErrors.confirmPassword = ['Passwords do not match.'];
      else newErrors.confirmPassword = [];
    }

    setErrors(newErrors);
  };

  const handleFirstNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFirstName(e.target.value);
    validateField('firstName', e.target.value);
  };

  const handleLastNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLastName(e.target.value);
    validateField('lastName', e.target.value);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value);
    validateField('phoneNumber', e.target.value);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    validateField('email', e.target.value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    validateField('password', e.target.value);
    if (isSignUp && confirmPassword) validateField('confirmPassword', confirmPassword);
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    validateField('confirmPassword', e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    // Validate fields
    validateField('email', email);
    validateField('password', password);

    if (isSignUp) {
      validateField('firstName', firstName);
      validateField('lastName', lastName);
      validateField('confirmPassword', confirmPassword);
      validateField('phoneNumber', phone);
    }

    const hasErrors = Object.values(errors).some((arr) => arr.length > 0);
    if (hasErrors) return;

    setIsSubmitting(true);
    try {
      if (isSignUp) {
        await onSignUp(firstName, lastName, email, password, confirmPassword, phone);
      } else {
        await onSignIn(email, password);
      }

      // Clear fields on success
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setErrors({
        firstName: [],
        lastName: [],
        phoneNumber: [],
        email: [],
        password: [],
        confirmPassword: []
      });
      setShowPassword(false);
      setShowConfirmPassword(false);
    } catch (error: any) {
      setServerError(error?.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setErrors({
      firstName: [],
      lastName: [],
      phoneNumber: [],
      email: [],
      password: [],
      confirmPassword: []
    });
    setServerError(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-[#FAF7F0] w-full max-w-[800px] max-h-[1000px] h-screen flex flex-col shadow-2xl rounded-lg overflow-hidden sm:h-auto sm:max-h-screen md:p-12 p-6">
        <div className="flex-1 flex flex-col overflow-auto">
          <button onClick={onClose} className="absolute top-4 right-4 text-[#6B5D4F] hover:text-black z-10">
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 flex flex-col justify-center items-center text-center pt-16 pb-12">
            <h2 className="font-serif text-2xl sm:text-3xl font-light mb-4">
              {isSignUp ? "Create Account" : "Welcome Back"}
            </h2>
            <p className="text-sm text-[#6B5D4F] mb-8 max-w-md leading-relaxed">
              {isSignUp ? "Join us to start your journey" : "Sign in to continue your journey with us"}
            </p>
            <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
              {serverError && (
                <p className="text-red-500 text-sm text-center">{serverError}</p>
              )}
              {isSignUp && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <input
                      type="text"
                      value={phone}
                      onChange={handlePhoneChange}
                      onBlur={() => validateField('phoneNumber', phone)}
                      required
                      placeholder="+63XXXXXXXXXX"
                      className={`w-full px-4 py-3 border bg-transparent focus:outline-none focus:border-black rounded-md ${
                        errors.phoneNumber.length > 0 ? 'border-red-500' : 'border-[#CFC6B8]'
                      }`}
                    />
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
                  onBlur={() => validateField("email", email)}
                  required
                  className={`w-full px-4 py-3 border bg-transparent focus:outline-none focus:border-black rounded-md ${
                    errors.email.length > 0 ? "border-red-500" : "border-[#CFC6B8]"
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
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={handlePasswordChange}
                    onBlur={() => validateField("password", password)}
                    required
                    className={`w-full px-4 py-3 pr-12 border bg-transparent focus:outline-none focus:border-black rounded-md ${
                      errors.password.length > 0 ? "border-red-500" : "border-[#CFC6B8]"
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
                {/* {!isSignUp && (
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="mt-2 text-xs w-full text-right text-[#6B5D4F] underline hover:text-black"
                  >
                    Forgot Password?
                  </button>
                )} */}
              </div>
              {isSignUp && (
                <div>
                  <label className="block text-xs uppercase tracking-wider mb-2">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={handleConfirmPasswordChange}
                      onBlur={() => validateField("confirmPassword", confirmPassword)}
                      required
                      className={`w-full px-4 py-3 pr-12 border bg-transparent focus:outline-none focus:border-black rounded-md ${
                        errors.confirmPassword.length > 0 ? "border-red-500" : "border-[#CFC6B8]"
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
                className={`w-full py-4 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-all rounded-md font-medium ${
                  isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isSubmitting ? 'Processing…' : isSignUp ? 'Sign Up' : 'Sign in'}
              </button>
            </form>
            <p className="text-sm text-[#6B5D4F] mt-8">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button onClick={toggleMode} className="underline hover:text-black font-medium">
                {isSignUp ? "Sign In" : "Sign Up"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
