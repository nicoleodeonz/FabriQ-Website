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
import type { GownDetails } from './components/GownDetailsModal';
import { authAPI } from './services/authAPI';
import { customerAPI } from './services/customerAPI';
import { getPublicInventory } from './services/inventoryAPI';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';

export type View = 'home' | 'catalog' | 'rentals' | 'custom-orders' | 'appointments' | 'profile' | 'admin';

export type FavoriteGown = GownDetails;

type CurrentUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  phoneNumber?: string;
  phoneVerified?: boolean;
  phoneVerifiedAt?: string | null;
};

const hasAdminAccess = (role?: string | null) => role === 'admin' || role === 'staff';

const hydrateFavoriteGowns = (storedFavorites: Partial<FavoriteGown>[], inventoryItems: Array<{
  id: string;
  name: string;
  category: string;
  color: string;
  size: string[];
  price: number;
  branch: string;
  status: 'available' | 'rented' | 'reserved' | 'maintenance' | 'archived';
  image?: string;
  rating?: number;
}>): FavoriteGown[] => {
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));

  return (Array.isArray(storedFavorites) ? storedFavorites : [])
    .map((favorite) => {
      const inventoryItem = favorite?.id ? inventoryById.get(String(favorite.id)) : undefined;
      const status = inventoryItem?.status;

      return {
        id: String(inventoryItem?.id || favorite?.id || '').trim(),
        name: String(inventoryItem?.name || favorite?.name || '').trim(),
        category: String(inventoryItem?.category || favorite?.category || '').trim(),
        color: String(inventoryItem?.color || favorite?.color || '').trim(),
        size: Array.isArray(inventoryItem?.size)
          ? inventoryItem.size
          : Array.isArray(favorite?.size)
            ? favorite.size.map((size) => String(size || '').trim()).filter(Boolean)
            : [],
        price: Number(inventoryItem?.price ?? favorite?.price ?? 0),
        status: status === 'available' || status === 'rented' || status === 'reserved'
          ? status
          : (['available', 'rented', 'reserved'].includes(String(favorite?.status || '').toLowerCase())
              ? String(favorite?.status).toLowerCase()
              : 'available') as FavoriteGown['status'],
        branch: String(inventoryItem?.branch || favorite?.branch || '').trim(),
        image: String(inventoryItem?.image || favorite?.image || '').trim(),
        rating: Number(inventoryItem?.rating ?? favorite?.rating ?? 0),
      };
    })
    .filter((favorite) => favorite.id && favorite.name)
    .map((favorite) => ({
      ...favorite,
      price: Number.isFinite(favorite.price) ? favorite.price : 0,
      rating: Number.isFinite(favorite.rating) ? favorite.rating : 0,
    }));
};

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [selectedGownId, setSelectedGownId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [pendingView, setPendingView] = useState<View | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [favoriteGowns, setFavoriteGowns] = useState<FavoriteGown[]>([]);

  const clearStoredAuth = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');

    document.cookie = 'authToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  };

  const clearAuthState = () => {
    setIsLoggedIn(false);
    setAuthToken(null);
    setCurrentUser(null);
    setIsAdmin(false);
    setFavoriteGowns([]);
    clearStoredAuth();
  };

  useEffect(() => {
    clearStoredAuth();

    if (sessionStorage.getItem('hasSeenLanding')) setShowLanding(false);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [currentView]);

  const handleLandingComplete = () => {
    setShowLanding(false);
    sessionStorage.setItem('hasSeenLanding', 'true');
  };

  const navigateProtected = (view: View) => {
    if (view === 'admin' && !isAdmin) {
      toast.error('Admin or staff access required.');
      return;
    }

    if (!isLoggedIn) {
      setPendingView(view);
      setShowAuth(true);
      return;
    }

    setCurrentView(view);
  };

  const navigateProtectedFromHeader = (view: View) => {
    if (view === 'rentals' || view === 'appointments') {
      setSelectedGownId(null);
    }
    navigateProtected(view);
  };

  const navigateWithGown = (view: 'rentals' | 'appointments', gownId: string) => {
    setSelectedGownId(gownId);
    navigateProtected(view);
  };

  const handleAuthSuccess = (user: CurrentUser, token: string) => {
    setAuthToken(token);
    setCurrentUser(user);
    setIsLoggedIn(true);
    setIsAdmin(hasAdminAccess(user.role));
    setShowAuth(false);
    setPendingView(null);
    setSelectedGownId(null);
    setCurrentView('home');
  };

  const handleSignIn = async (email: string, password: string) => {
    const auth = await authAPI.login({ email, password });
    handleAuthSuccess(auth.user, auth.token);

    toast.success(`Welcome back, ${auth.user.firstName}!`);
  };

  const handleSignUp = async (
    firstName: string,
    lastName: string,
    email: string,
    password: string,
    confirmPassword: string,
    phoneNumber?: string
  ) => {
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const result = await authAPI.signUp({ firstName, lastName, email, password, phoneNumber });
    toast.success('Verification code sent. Check your email to finish creating your account.');
    return {
      email: result.email,
      message: result.message,
    };
  };

  const handleVerifySignUp = async (email: string, code: string) => {
    const auth = await authAPI.verifySignUp({ email, code });
    handleAuthSuccess(auth.user, auth.token);

    toast.success(`Welcome to FabriQ, ${auth.user.firstName}! Your account has been created.`);
  };

  const handleLogout = async () => {
    if (authToken) {
      try {
        await authAPI.logout(authToken);
      } catch (error) {
        console.error('Logout request failed:', error);
      }
    }

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

  useEffect(() => {
    if (!authToken || !currentUser) {
      setFavoriteGowns([]);
      return;
    }

    if (currentUser.role !== 'customer') {
      setFavoriteGowns([]);
      return;
    }

    let isCancelled = false;

    const loadCustomerState = async () => {
      try {
        const [customer, inventoryItems] = await Promise.all([
          customerAPI.getCustomer(authToken),
          getPublicInventory().catch(() => []),
        ]);
        if (isCancelled) return;

        setFavoriteGowns(hydrateFavoriteGowns(customer.favoriteGowns, inventoryItems));
        setCurrentUser((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            firstName: customer.firstName || prev.firstName,
            lastName: customer.lastName || prev.lastName,
            email: customer.email || prev.email,
            phoneNumber: customer.phoneNumber || prev.phoneNumber,
            phoneVerified: Boolean(customer.phoneVerified),
            phoneVerifiedAt: customer.phoneVerifiedAt || null,
          };
        });
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to load customer favorites:', error);
          setFavoriteGowns([]);
        }
      }
    };

    void loadCustomerState();

    return () => {
      isCancelled = true;
    };
  }, [authToken, currentUser?.id, currentUser?.role]);

  const persistFavoriteGowns = async (nextFavorites: FavoriteGown[], rollbackFavorites?: FavoriteGown[]) => {
    setFavoriteGowns(nextFavorites);

    if (!authToken || currentUser?.role !== 'customer') {
      return;
    }

    try {
      const result = await customerAPI.updateFavoriteGowns(authToken, nextFavorites);
      setFavoriteGowns(Array.isArray(result.favoriteGowns) ? result.favoriteGowns : nextFavorites);
    } catch (error) {
      if (rollbackFavorites) {
        setFavoriteGowns(rollbackFavorites);
      }
      toast.error(error instanceof Error ? error.message : 'Failed to save favorites.');
    }
  };

  const handleCurrentUserUpdate = (profile: Partial<CurrentUser>) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        ...profile,
      };
    });
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
        navigateProtected={navigateProtectedFromHeader}
      />
      <main className="pt-20">
        {currentView === 'home' && (
          <Home
            setCurrentView={setCurrentView}
            isLoggedIn={isLoggedIn}
            isAdmin={isAdmin}
            onOpenAuthModal={() => setShowAuth(true)} 
          />
        )}
        {currentView === 'catalog' && (
          <Catalog
            setCurrentView={setCurrentView}
            isLoggedIn={isLoggedIn}
            isAdmin={isAdmin}
            navigateProtected={navigateProtected}
            setSelectedGownId={setSelectedGownId}
            navigateWithGown={navigateWithGown}
            favoriteGowns={favoriteGowns}
            onAddFavorite={(gown) => {
              const nextFavorites = favoriteGowns.some((item) => item.id === gown.id)
                ? favoriteGowns
                : [...favoriteGowns, gown];
              void persistFavoriteGowns(nextFavorites, favoriteGowns);
            }}
            onRemoveFavorite={(gownId) => {
              const nextFavorites = favoriteGowns.filter((item) => item.id !== gownId);
              void persistFavoriteGowns(nextFavorites, favoriteGowns);
            }}
          />
        )}
        {currentView === 'rentals' && currentUser && authToken && (
          <Rentals user={currentUser} token={authToken} selectedGownId={selectedGownId} />
        )}
        {currentView === 'custom-orders' && currentUser && authToken && <CustomOrders user={currentUser} token={authToken} />}
        {currentView === 'appointments' && currentUser && authToken && <Appointments user={currentUser} token={authToken} selectedGownId={selectedGownId} />}
        {currentView === 'profile' && currentUser && authToken && (
          <CustomerProfile
            onLogout={handleLogout}
            onForceReauth={handleForceReauth}
            onUserUpdated={handleCurrentUserUpdate}
            user={currentUser}
            token={authToken}
            favoriteGowns={favoriteGowns}
            onRemoveFavorite={(gownId) => {
              const nextFavorites = favoriteGowns.filter((item) => item.id !== gownId);
              void persistFavoriteGowns(nextFavorites, favoriteGowns);
            }}
            navigateWithGown={navigateWithGown}
            isAdmin={isAdmin}
          />
        )}
        {currentView === 'admin' && isAdmin && authToken && currentUser && (
          <AdminDashboard token={authToken} currentUser={currentUser} />
        )}
      </main>
      {currentView !== 'admin' && <Footer isAdmin={isAdmin} />}

      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onVerifySignUp={handleVerifySignUp}
        onForgotPassword={() => {
          setShowAuth(false);
          setShowForgotPassword(true);
        }}
      />

      <ForgotPasswordModal
        isOpen={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        onSuccess={(message) => {
          setShowForgotPassword(false);
          toast.success(message || 'Password reset successful. You can sign in with your new password.');
          setShowAuth(true);
        }}
        onBackToLogin={() => {
          setShowForgotPassword(false);
          setShowAuth(true);
        }}
      />

      <Toaster />
    </div>
  );
}