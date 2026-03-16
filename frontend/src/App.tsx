import { useState, useEffect } from 'react';
import { Home } from './components/Home';
import { Catalog } from './components/Catalog';
import { Rentals } from './components/Rentals';
import { CustomOrders } from './components/CustomOrders';
import { Appointments } from './components/Appointments';
import { CustomerProfile } from './components/CustomerProfile';
import { AdminDashboard } from './components/AdminDashboard';
import { Navigation } from './components/Navigation';
import { Footer } from './components/Footer';
import { LandingPage } from './components/LandingPage';
import { AuthModal } from './components/AuthModal';
import { ForgotPasswordModal } from './components/ForgotPasswordModal';
import { authAPI } from './services/authAPI';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';

export type View = 'home' | 'catalog' | 'rentals' | 'custom-orders' | 'appointments' | 'profile' | 'admin';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    phoneNumber?: string;
  } | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [pendingView, setPendingView] = useState<View | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const clearAuthState = () => {
    setIsLoggedIn(false);
    setAuthToken(null);
    setCurrentUser(null);
    setIsAdmin(false);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');

    // Defensive cleanup in case auth cookies were configured by the backend.
    document.cookie = 'authToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  };

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const userJson = localStorage.getItem('authUser');
    if (token && userJson) {
      try {
        const savedUser = JSON.parse(userJson);
        setAuthToken(token);
        setCurrentUser(savedUser);
        setIsLoggedIn(true);
        setIsAdmin(savedUser.role === 'admin');

        // Validate token in background and refresh stored user data.
        authAPI
          .getMe(token)
          .then((result) => {
            setCurrentUser(result.user);
            setIsAdmin(result.user.role === 'admin');
            localStorage.setItem('authUser', JSON.stringify(result.user));
          })
          .catch(() => {
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
            setAuthToken(null);
            setCurrentUser(null);
            setIsLoggedIn(false);
            setIsAdmin(false);
          });
      } catch {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
      }
    }

    if (sessionStorage.getItem('hasSeenLanding')) setShowLanding(false);
  }, []);

  const handleLandingComplete = () => {
    setShowLanding(false);
    sessionStorage.setItem('hasSeenLanding', 'true');
  };

  const navigateProtected = (view: View) => {
    if (view === 'admin' && !isAdmin) {
      toast.error('Admin access required.');
      return;
    }

    if (!isLoggedIn) {
      setPendingView(view);
      setShowAuth(true);
      return;
    }

    setCurrentView(view);
  };

  const handleSignIn = async (email: string, password: string) => {
    const auth = await authAPI.login({ email, password });
    setAuthToken(auth.token);
    setCurrentUser(auth.user);
    setIsLoggedIn(true);
    setIsAdmin(auth.user.role === 'admin');

    localStorage.setItem('authToken', auth.token);
    localStorage.setItem('authUser', JSON.stringify(auth.user));

    setShowAuth(false);
    if (pendingView) {
      if (pendingView === 'admin' && auth.user.role !== 'admin') {
        toast.error('Admin access required.');
      } else {
        setCurrentView(pendingView);
      }
      setPendingView(null);
    }

    toast.success(`Welcome back, ${auth.user.firstName}!`);
  };

  const handleSignUp = async (
    firstName: string,
    lastName: string,
    email: string,
    password: string,
    confirmPassword: string,
    phoneNumber: string
  ) => {
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const auth = await authAPI.signUp({ firstName, lastName, email, password, phoneNumber });
    setAuthToken(auth.token);
    setCurrentUser(auth.user);
    setIsLoggedIn(true);
    setIsAdmin(auth.user.role === 'admin');

    localStorage.setItem('authToken', auth.token);
    localStorage.setItem('authUser', JSON.stringify(auth.user));

    setShowAuth(false);
    if (pendingView) {
      if (pendingView === 'admin' && auth.user.role !== 'admin') {
        toast.error('Admin access required.');
      } else {
        setCurrentView(pendingView);
      }
      setPendingView(null);
    }

    toast.success(`Welcome to FabriQ, ${auth.user.firstName}! Your account has been created.`);
  };

  const handleLogout = () => {
    clearAuthState();
    setCurrentView('home');
  };

  const handleForceReauth = (message?: string) => {
    clearAuthState();
    setCurrentView('home');
    setPendingView('profile');
    setShowAuth(true);

    if (message) {
      toast.success(message);
    }
  };

  if (showLanding) return <LandingPage onComplete={handleLandingComplete} />;

  return (
    <div className="min-h-screen bg-[#FAF7F0]">
      <Navigation
        currentView={currentView}
        setCurrentView={setCurrentView}
        isAdmin={isAdmin}
        setIsAdmin={setIsAdmin}
        isLoggedIn={isLoggedIn}
        setIsLoggedIn={setIsLoggedIn}
        navigateProtected={navigateProtected}
      />
      <main className="pt-20">
        {currentView === 'home' && (
          <Home
            setCurrentView={setCurrentView}
            isLoggedIn={isLoggedIn}
            onOpenAuthModal={() => setShowAuth(true)} 
          />
        )}
        {currentView === 'catalog' && <Catalog setCurrentView={setCurrentView} isLoggedIn={isLoggedIn} navigateProtected={navigateProtected} />}
        {currentView === 'rentals' && <Rentals />}
        {currentView === 'custom-orders' && <CustomOrders />}
        {currentView === 'appointments' && <Appointments />}
        {currentView === 'profile' && currentUser && authToken && (
          <CustomerProfile
            onLogout={handleLogout}
            onForceReauth={handleForceReauth}
            user={currentUser}
            token={authToken}
          />
        )}
        {currentView === 'admin' && isAdmin && authToken && <AdminDashboard token={authToken} />}
      </main>
      <Footer />

      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onForgotPassword={() => {
          setShowAuth(false);
          setShowForgotPassword(true);
        }}
      />

      <ForgotPasswordModal
        isOpen={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        onSuccess={() => {
          setShowForgotPassword(false);
          alert('Password reset successful!');
        }}
      />

      <Toaster />
    </div>
  );
}