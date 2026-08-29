import { Instagram, Facebook, Mail, ArrowRight } from 'lucide-react';
import { useState } from 'react';

type FooterServiceTarget = 'rentals' | 'custom-orders' | 'appointments' | 'measurements';

interface FooterProps {
  isAdmin: boolean;
  onSelectCatalogCategory: (category: string) => void;
  onSelectService: (service: FooterServiceTarget) => void;
  onOpenContactModal: () => void;
  onOpenTcpModal: () => void;
}

const SHOP_CATEGORIES = [
  { label: 'Wedding Gowns', category: 'Wedding Dress' },
  { label: 'Evening Dresses', category: 'Evening Gown' },
  { label: 'Ball Gowns', category: 'Ball Gown' },
  { label: 'Cocktail Dresses', category: 'Cocktail Dress' },
];

const SERVICE_LINKS: Array<{ label: string; target: FooterServiceTarget }> = [
  { label: 'Gown Rental', target: 'rentals' },
  { label: 'Custom Orders', target: 'custom-orders' },
  { label: 'Appointments', target: 'appointments' },
  { label: 'Measurements', target: 'measurements' },
];

export function Footer({ isAdmin, onSelectCatalogCategory, onSelectService, onOpenContactModal, onOpenTcpModal }: FooterProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLiveViewModal, setShowLiveViewModal] = useState(false);
  const [blockedActionLabel, setBlockedActionLabel] = useState('this footer action');

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdmin) return;

    if (!email || !email.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      alert('Thank you for subscribing to our newsletter!');
      setEmail('');
      setIsSubmitting(false);
    }, 1000);
  };

  const openAdminFooterPreview = (actionLabel: string) => {
    setBlockedActionLabel(actionLabel);
    setShowLiveViewModal(true);
  };

  const getDisabledLinkProps = isAdmin
    ? {
        onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
          openAdminFooterPreview('this footer action');
        },
      }
    : {};

  const handleShopCategoryClick = (event: React.MouseEvent<HTMLAnchorElement>, category: string) => {
    event.preventDefault();
    if (isAdmin) {
      openAdminFooterPreview(`${category} browsing`);
      return;
    }
    onSelectCatalogCategory(category);
  };

  const handleServiceClick = (event: React.MouseEvent<HTMLAnchorElement>, service: FooterServiceTarget) => {
    event.preventDefault();
    if (isAdmin) {
      const serviceLabels: Record<FooterServiceTarget, string> = {
        rentals: 'gown rental',
        'custom-orders': 'custom orders',
        appointments: 'appointments',
        measurements: 'measurements',
      };
      openAdminFooterPreview(serviceLabels[service]);
      return;
    }
    onSelectService(service);
  };

  const handleContactClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (isAdmin) {
      openAdminFooterPreview('contact viewing');
      return;
    }
    onOpenContactModal();
  };

  return (
    <footer className="bg-[#6B5D4F] text-white">
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Newsletter Section */}
        <div className="mb-16 max-w-2xl">
          <h3 className="font-serif text-2xl md:text-3xl mb-3">Join the List</h3>
          <p className="text-sm text-white/80 mb-6">
            Sign up to be the first to know about new gown collections, exclusive offers, and more!
          </p>
          <form onSubmit={handleNewsletterSubmit} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your Email"
              disabled={isAdmin}
              className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-none focus:outline-none focus:border-[#D4AF37] transition-colors text-white placeholder:text-white/50"
              required
            />
            <button
              type="submit"
              disabled={isSubmitting || isAdmin}
              className="px-6 py-3 bg-white text-[#6B5D4F] hover:bg-[#D4AF37] hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Footer Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <h4 className="text-xs uppercase tracking-widest mb-4 font-medium">Shop</h4>
            <ul className="space-y-3 text-sm">
              {SHOP_CATEGORIES.map((item) => (
                <li key={item.category}>
                  <a
                    href="#/catalog"
                    {...getDisabledLinkProps}
                    onClick={(event) => handleShopCategoryClick(event, item.category)}
                    className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'opacity-60' : ''}`}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest mb-4 font-medium">Services</h4>
            <ul className="space-y-3 text-sm">
              {SERVICE_LINKS.map((item) => (
                <li key={`${item.label}-${item.target}`}>
                  <a
                    href={`#/${item.target}`}
                    {...getDisabledLinkProps}
                    onClick={(event) => handleServiceClick(event, item.target)}
                    className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'opacity-60' : ''}`}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest mb-4 font-medium text-[#6B5D4F]">Company</h4>
            <div className="h-32" aria-hidden="true" />
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest mb-4 font-medium">Connect</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="#contact-platforms"
                  onClick={(event) => {
                    event.preventDefault();
                    if (isAdmin) {
                      openAdminFooterPreview('contact viewing');
                      return;
                    }
                    onOpenContactModal();
                  }}
                  className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'opacity-60' : ''}`}
                >
                  Contact
                </a>
              </li>
              <li className="text-white/80">Cadena de Amor, Taguig City</li>
              <li className="text-white/80">Philippines</li>
              <li className="flex gap-4 mt-4">
                <a
                  href="https://www.instagram.com/officialhvd/"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#D4AF37] transition-colors"
                >
                  <Instagram className="w-5 h-5" />
                </a>
                <a
                  href="https://www.facebook.com/HannahVanessaExclusive/"
                  target="_blank"
                  rel="noreferrer"
                  {...getDisabledLinkProps}
                  className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'opacity-60' : ''}`}
                >
                  <Facebook className="w-5 h-5" />
                </a>
                <a
                  href="mailto:hannahvanessaexclusive@gmail.com"
                  className="hover:text-[#D4AF37] transition-colors"
                >
                  <Mail className="w-5 h-5" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {showLiveViewModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowLiveViewModal(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Live view"
          >
            <div
              className="modal-gradient-surface w-full max-w-md rounded-2xl p-8"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="mb-3 text-2xl font-light text-[#1a1a1a]">Live View</h3>
              <p className="mb-6 text-sm leading-relaxed text-[#6B5D4F]">
                You are viewing the storefront as an admin. {blockedActionLabel.charAt(0).toUpperCase() + blockedActionLabel.slice(1)} is disabled in this view.
              </p>
              <button
                type="button"
                onClick={() => setShowLiveViewModal(false)}
                className="w-full bg-[#1a1a1a] py-3 text-white transition-colors hover:bg-[#D4AF37]"
              >
                Okay
              </button>
            </div>
          </div>
        )}

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/20 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-white/60">
          <p>© 2026 Hannah Vanessa Boutique. All rights reserved.</p>
          <div className="flex gap-6">
            <a
              href="#tcp-view"
              onClick={(event) => {
                event.preventDefault();
                if (isAdmin) {
                  openAdminFooterPreview('terms viewing');
                  return;
                }
                onOpenTcpModal();
              }}
              className={`hover:text-white transition-colors ${isAdmin ? 'opacity-60' : ''}`}
            >
              Privacy Policy
            </a>
            <a
              href="#tcp-view"
              onClick={(event) => {
                event.preventDefault();
                if (isAdmin) {
                  openAdminFooterPreview('terms viewing');
                  return;
                }
                onOpenTcpModal();
              }}
              className={`hover:text-white transition-colors ${isAdmin ? 'opacity-60' : ''}`}
            >
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
