import { Instagram, Facebook, Mail, ArrowRight } from 'lucide-react';
import { useState } from 'react';

interface FooterProps {
  isAdmin: boolean;
}

export function Footer({ isAdmin }: FooterProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const getDisabledLinkProps = isAdmin
    ? {
        onClick: (e: React.MouseEvent<HTMLAnchorElement>) => e.preventDefault(),
        tabIndex: -1,
        'aria-disabled': true,
      }
    : {};

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
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Wedding Gowns</a></li>
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Evening Dresses</a></li>
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Ball Gowns</a></li>
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Cocktail Dresses</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest mb-4 font-medium">Services</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Gown Rental</a></li>
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Custom Orders</a></li>
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Appointments</a></li>
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Measurements</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest mb-4 font-medium">Company</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>About Us</a></li>
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Our Story</a></li>
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Branches</a></li>
              <li><a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Contact</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest mb-4 font-medium">Connect</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="mailto:contact@hannahvanessa.com"
                  {...getDisabledLinkProps}
                  className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}
                >
                  contact@hannahvanessa.com
                </a>
              </li>
              <li className="text-white/80">Cadena de Amor, Taguig City</li>
              <li className="text-white/80">Philippines</li>
              <li className="flex gap-4 mt-4">
                <a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>
                  <Instagram className="w-5 h-5" />
                </a>
                <a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>
                  <Facebook className="w-5 h-5" />
                </a>
                <a href="#" {...getDisabledLinkProps} className={`hover:text-[#D4AF37] transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>
                  <Mail className="w-5 h-5" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/20 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-white/60">
          <p>© 2026 Hannah Vanessa Boutique. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" {...getDisabledLinkProps} className={`hover:text-white transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Privacy Policy</a>
            <a href="#" {...getDisabledLinkProps} className={`hover:text-white transition-colors ${isAdmin ? 'pointer-events-none opacity-60 cursor-not-allowed' : ''}`}>Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
