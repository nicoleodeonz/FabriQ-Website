import { useState } from 'react';
import { ArrowRight, Sparkles, Heart, Calendar, Ruler } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

type View = 'home' | 'catalog' | 'rentals' | 'custom-orders' | 'appointments' | 'profile' | 'admin';

interface HomeProps {
  setCurrentView: (view: View) => void;
  isLoggedIn: boolean;
  isAdmin: boolean;
  onOpenAuthModal: () => void; 
}

function HeroSection({ setCurrentView, navigateProtected }: { setCurrentView: (view: View) => void; navigateProtected: (view: View) => void }) {
  return (
    <section className="relative min-h-[90vh] flex items-center">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-20 w-full">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="max-w-lg">
            <p className="text-xs tracking-[0.3em] uppercase text-[#6B5D4F] mb-4">
              Elegant • Bespoke • Timeless
            </p>
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-light leading-[1.1] mb-6">
              Where Craftsmanship Meets Dreams
            </h1>
            <p className="text-base md:text-lg text-[#6B5D4F] mb-8 leading-relaxed">
              Experience the art of bespoke tailoring at Hannah Vanessa Boutique. From exquisite gown rentals to custom creations, we bring your vision to life.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => setCurrentView('catalog')}
                className="px-8 py-4 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-all flex items-center justify-center gap-2 group"
              >
                <span>Explore Collection</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => navigateProtected('custom-orders')}
                className="px-8 py-4 border border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all"
              >
                Start Custom Order
              </button>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[3/4] overflow-hidden">
              <ImageWithFallback
                src="https://images.unsplash.com/photo-1759893362613-8bb8bb057af1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
                alt="Elegant wedding gown"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-8 -left-8 bg-white p-6 shadow-xl max-w-xs">
              <p className="text-sm text-[#6B5D4F] mb-2">Trusted by brides since 1993</p>
              <p className="font-serif text-2xl">500+ Happy Clients</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedCollection({ setCurrentView }: { setCurrentView: (view: View) => void }) {
  return (
    <section className="py-24 bg-[#6B5D4F]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1">
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1698582468284-fd9161f4176b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
              alt="Boutique interior"
              className="w-full aspect-[4/3] object-cover"
            />
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-xs tracking-[0.3em] uppercase text-[#E8DCC8] mb-4">The Collection</p>
            <h2 className="font-serif text-4xl md:text-5xl font-light mb-6 text-white">Curated Excellence</h2>
            <p className="text-lg text-[#E8DCC8] mb-6 leading-relaxed">
              Our collection features handpicked gowns from renowned designers, each piece selected for its exceptional craftsmanship and timeless elegance.
            </p>
            <p className="text-base text-[#E8DCC8] mb-8 leading-relaxed">
              From classic ballgowns to modern silhouettes, every dress in our boutique tells a story waiting to become yours.
            </p>
            <button
              onClick={() => setCurrentView('catalog')}
              className="group inline-flex items-center gap-2 text-white hover:text-[#D4AF37] transition-colors"
            >
              <span className="text-xs uppercase tracking-[0.15em] border-b border-current">View All Gowns</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServicesGrid({ services, setCurrentView, navigateProtected }: { services: any[]; setCurrentView: (view: View) => void; navigateProtected: (view: View) => void }) {
  return (
    <section className="py-24 bg-[#FAF7F0]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="font-serif text-4xl md:text-5xl font-light mb-4">Our Services</h2>
          <p className="text-lg text-[#6B5D4F] max-w-2xl mx-auto">
            From ready-to-wear collections to fully customized pieces, we provide a seamless experience for all your formal wear needs.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {services.map((service, index) => {
            const Icon = service.icon;
            const isProtected = ['rentals', 'custom-orders', 'appointments'].includes(service.view);
            return (
              <div key={index} className="bg-white p-8 group hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-[#FAF7F0] rounded-full flex items-center justify-center mb-6 group-hover:bg-[#D4AF37] transition-colors">
                  <Icon className="w-6 h-6 text-[#6B5D4F] group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-serif text-2xl mb-3">{service.title}</h3>
                <p className="text-[#6B5D4F] mb-6 text-sm leading-relaxed">{service.description}</p>
                <button
                  onClick={() => isProtected ? navigateProtected(service.view) : setCurrentView(service.view)}
                  className="text-xs uppercase tracking-[0.15em] text-[#1a1a1a] hover:text-[#D4AF37] transition-colors inline-flex items-center gap-2 group"
                >
                  Learn more
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatsSection({ stats }: { stats: any[] }) {
  return (
    <section className="py-20 bg-[#1a1a1a] text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="font-serif text-5xl md:text-6xl font-light mb-2">{stat.value}</div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/60">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection({ setCurrentView, navigateProtected }: { setCurrentView: (view: View) => void; navigateProtected: (view: View) => void }) {
  return (
    <section className="py-24 bg-[#F5F1E8]">
      <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
        <h2 className="font-serif text-4xl md:text-5xl font-light mb-6">Begin Your Journey With Us</h2>
        <p className="text-lg text-[#6B5D4F] mb-10 max-w-2xl mx-auto">
          Whether you're looking for the perfect rental or a custom creation, our team is here to make your vision a reality.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigateProtected('appointments')}
            className="px-8 py-4 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-all"
          >
            Schedule Consultation
          </button>
          <button
            onClick={() => setCurrentView('catalog')}
            className="px-8 py-4 border border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all"
          >
            View Collections
          </button>
        </div>
      </div>
    </section>
  );
}

export function Home({ setCurrentView, isLoggedIn, isAdmin, onOpenAuthModal }: HomeProps) {
  const [showLiveViewModal, setShowLiveViewModal] = useState(false);
  const [blockedActionLabel, setBlockedActionLabel] = useState('this action');

  const getActionLabel = (view: View) => {
    if (view === 'rentals') return 'renting gowns';
    if (view === 'custom-orders') return 'creating custom orders';
    if (view === 'appointments') return 'booking appointments';
    return 'this action';
  };

  const services = [
    {
      icon: Sparkles,
      title: 'Browse Catalog',
      description: 'Explore our curated collection of elegant gowns and suits for every occasion.',
      view: 'catalog' as View,
    },
    {
      icon: Heart,
      title: 'Rent a Gown',
      description: 'Book your perfect dress for any special occasion with flexible rental periods.',
      view: 'rentals' as View,
    },
    {
      icon: Ruler,
      title: 'Custom Orders',
      description: 'Create a bespoke piece tailored just for you, from design to final fitting.',
      view: 'custom-orders' as View,
    },
    {
      icon: Calendar,
      title: 'Book Appointment',
      description: 'Schedule fittings and consultations with our expert team at your convenience.',
      view: 'appointments' as View,
    },
  ];

  const stats = [
    { value: '500+', label: 'Gowns Available' },
    { value: '1,200+', label: 'Happy Clients' },
    { value: '5+', label: 'Branches' },
    { value: '15+', label: 'Years Experience' },
  ];

  const navigateProtected = (view: View) => {
    if (!isLoggedIn) {
      onOpenAuthModal(); 
      return;
    }

    if (isAdmin && view !== 'catalog') {
      setBlockedActionLabel(getActionLabel(view));
      setShowLiveViewModal(true);
      return;
    }

    setCurrentView(view);
  };

  return (
    <div className="min-h-screen bg-[#FAF7F0]">
      <HeroSection setCurrentView={setCurrentView} navigateProtected={navigateProtected} />
      <FeaturedCollection setCurrentView={setCurrentView} />
      <ServicesGrid services={services} setCurrentView={setCurrentView} navigateProtected={navigateProtected} />
      <StatsSection stats={stats} />
      <CTASection setCurrentView={setCurrentView} navigateProtected={navigateProtected} />

      {showLiveViewModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowLiveViewModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Live view"
        >
          <div
            className="bg-white max-w-md w-full rounded-2xl p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-3xl mb-3">Live View</h3>
            <p className="text-sm text-[#6B5D4F] mb-6 leading-relaxed">
              You are viewing the storefront as an admin. {blockedActionLabel.charAt(0).toUpperCase() + blockedActionLabel.slice(1)} is disabled in this view.
            </p>
            <button
              type="button"
              onClick={() => setShowLiveViewModal(false)}
              className="w-full py-3 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-colors"
            >
              Okay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}