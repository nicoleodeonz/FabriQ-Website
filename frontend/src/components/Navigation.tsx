import { useState, type CSSProperties } from 'react';
import type { View } from '../App';
import { User, Settings } from 'lucide-react';

interface NavigationProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  isAdmin: boolean;
  setIsAdmin: (isAdmin: boolean) => void;
  isLoggedIn: boolean;
  setIsLoggedIn: (val: boolean) => void;
  navigateProtected: (view: View) => void;
}


export function Navigation({
  currentView,
  setCurrentView,
  isAdmin,
  setIsAdmin,
  isLoggedIn,
  navigateProtected
}: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { view: View; label: string; protected?: boolean }[] = isAdmin
    ? []
    : [
        { view: 'catalog', label: 'Collections' },
        { view: 'rentals', label: 'Rentals', protected: true },
        { view: 'custom-orders', label: 'Bespoke', protected: true },
        { view: 'appointments', label: 'Book', protected: true }
      ];

  const renderButton = (view: View, label: string, type?: 'profile' | 'admin', style?: CSSProperties) => {
    const isIconOnlyDesktop = type === 'profile' || type === 'admin';
    const Icon = type === 'profile' ? User : type === 'admin' ? Settings : undefined;

    return (
      <button
        key={view}
        onClick={() => {
          if (type === 'profile') navigateProtected('profile');
          else if (type === 'admin') {
            setCurrentView('admin');
          } else if (navItems.find(item => item.view === view)?.protected) {
            navigateProtected(view);
          } else {
            setCurrentView(view);
          }
          setMobileMenuOpen(false);
        }}
        className={`flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.15em] transition-colors ${
          currentView === view ? 'text-[#1a1a1a]' : 'text-[#6B5D4F] hover:text-[#1a1a1a]'
        } ${isIconOnlyDesktop ? 'justify-center w-10 h-10 rounded-full' : ''}`}
        style={style}
      >
        {Icon && <Icon className="w-5 h-5" />}
        {!isIconOnlyDesktop && label}
      </button>
    );
  };

  return (
    <nav className="fixed top-0 w-full bg-[#FAF7F0]/95 backdrop-blur-sm border-b border-[#E8DCC8] z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center h-20">
          {/* Left: Logo */}
          <div className="flex-1">
            <button
              onClick={() => setCurrentView('home')}
              className="font-serif text-3xl font-light tracking-tight text-[#1a1a1a] hover:text-[#D4AF37] transition-colors"
            >
              Hannah Vanessa
            </button>
          </div>

          {/* Center: Desktop Tabs */}
          <div className="hidden md:flex flex-1 items-center justify-center gap-4">
            {navItems.map((item) => renderButton(item.view, item.label))}
          </div>

          {/* Right: Desktop Actions */}
          <div className="hidden md:flex flex-1 items-center justify-end gap-2 pl-6 lg:pl-10 md:translate-x-2 lg:translate-x-3">
            {renderButton('profile', '', 'profile', { transform: 'translateX(320px)' })} {/* Profile icon only */}
            {isAdmin && renderButton('admin', '', 'admin')} {/* Admin gear icon only if admin */}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden ml-auto p-2 text-[#6B5D4F] hover:text-[#1a1a1a] transition-colors"
          >
            {mobileMenuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#FAF7F0] border-t border-[#E8DCC8] px-6 py-6 space-y-1">
          {navItems.map((item) => renderButton(item.view, item.label))}
          {renderButton('profile', 'Profile', 'profile')} {/* Icon + text */}
          {isAdmin && renderButton('admin', 'Admin', 'admin')}       {/* Icon + text if admin */}
        </div>
      )}
    </nav>
  );
}