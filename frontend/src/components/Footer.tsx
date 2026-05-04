import { Instagram, Facebook, Mail, Phone, MapPin, ArrowRight, X } from 'lucide-react';
import { useState } from 'react';

type FooterServiceTarget = 'rentals' | 'custom-orders' | 'appointments' | 'measurements';

interface FooterProps {
  isAdmin: boolean;
  onSelectCatalogCategory: (category: string) => void;
  onSelectService: (service: FooterServiceTarget) => void;
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

export function Footer({ isAdmin, onSelectCatalogCategory, onSelectService }: FooterProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
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
    setShowContactModal(true);
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
            <h4 className="text-xs uppercase tracking-widest mb-4 font-medium">Company</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'opacity-60' : ''}`}>About Us</a></li>
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'opacity-60' : ''}`}>Our Story</a></li>
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'opacity-60' : ''}`}>Branches</a></li>
              <li>
                <a
                  href="#contact-platforms"
                  onClick={handleContactClick}
                  className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'opacity-60' : ''}`}
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest mb-4 font-medium">Connect</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="mailto:hannahvanessaexclusive@gmail.com"
                  {...getDisabledLinkProps}
                  className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'opacity-60' : ''}`}
                >
                  hannahvanessaexclusive@gmail.com
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

        {showContactModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Contact platforms"
            onClick={() => setShowContactModal(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white p-8 text-[#3D2B1F] shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-serif text-2xl">Contact Us</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6B5D4F]">
                    Reach <span className="font-serif text-base text-[#3D2B1F]">Hannah Vanessa</span> through any of these platforms.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  aria-label="Close contact modal"
                  className="rounded-full border border-[#E8DCC8] p-2 text-[#6B5D4F] transition-colors hover:border-[#D4AF37] hover:text-[#1a1a1a]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <a
                  href="mailto:hannahvanessaexclusive@gmail.com"
                  className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] px-4 py-4 transition-colors hover:border-[#D4AF37] hover:bg-[#FAF7F0]"
                >
                  <Mail className="h-5 w-5 text-[#6B5D4F]" />
                  <span className="text-sm text-[#6B5D4F]">
                    <span className="font-medium text-[#3D2B1F]">Email:</span> hannahvanessaexclusive@gmail.com
                  </span>
                </a>

                <a
                  href="tel:09175931093"
                  className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] px-4 py-4 transition-colors hover:border-[#D4AF37] hover:bg-[#FAF7F0]"
                >
                  <Phone className="h-5 w-5 text-[#6B5D4F]" />
                  <span className="text-sm text-[#6B5D4F]">
                    <span className="font-medium text-[#3D2B1F]">Phone:</span> 0917 593 1093
                  </span>
                </a>

                <a
                  href="https://maps.app.goo.gl/G2H4ovryYRgzUyfQ7"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] px-4 py-4 transition-colors hover:border-[#D4AF37] hover:bg-[#FAF7F0]"
                >
                  <MapPin className="h-5 w-5 text-[#6B5D4F]" />
                  <span className="text-sm text-[#6B5D4F]">
                    <span className="font-medium text-[#3D2B1F]">Address:</span> Cadena de Amor, Taguig City, Philippines
                  </span>
                </a>

                <a
                  href="https://www.instagram.com/officialhvd/"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] px-4 py-4 transition-colors hover:border-[#D4AF37] hover:bg-[#FAF7F0]"
                >
                  <Instagram className="h-5 w-5 text-[#6B5D4F]" />
                  <span className="text-sm text-[#6B5D4F]">
                    <span className="font-medium text-[#3D2B1F]">Instagram:</span> @officialhvd
                  </span>
                </a>

                <a
                  href="https://www.facebook.com/HannahVanessaExclusive/"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-[#E8DCC8] px-4 py-4 transition-colors hover:border-[#D4AF37] hover:bg-[#FAF7F0]"
                >
                  <Facebook className="h-5 w-5 text-[#6B5D4F]" />
                  <span className="text-sm text-[#6B5D4F]">
                    <span className="font-medium text-[#3D2B1F]">Facebook:</span> Hannah Vanessa Exclusive
                  </span>
                </a>
              </div>
            </div>
          </div>
        )}

        {showLiveViewModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowLiveViewModal(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Live view"
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-8"
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
            <a href="#" {...getDisabledLinkProps} className={`hover:text-white transition-colors ${isAdmin ? 'opacity-60' : ''}`}>Privacy Policy</a>
            <a href="#" {...getDisabledLinkProps} className={`hover:text-white transition-colors ${isAdmin ? 'opacity-60' : ''}`}>Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
