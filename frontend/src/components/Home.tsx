import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Calendar, ChevronLeft, ChevronRight, Heart, Ruler, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { GownDetailsModal, type GownDetails } from './GownDetailsModal';
import { getInventory, getPublicInventory, INVENTORY_UPDATED_EVENT, updateProduct, type InventoryItem } from '../services/inventoryAPI';

type View = 'home' | 'catalog' | 'rentals' | 'custom-orders' | 'appointments' | 'profile' | 'admin';

interface HomeProps {
  setCurrentView: (view: View, options?: { catalogCategory?: string | null; selectedGownId?: string | null }) => void;
  authToken?: string | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  onOpenAuthModal: () => void;
}

type FeaturedGownCard = GownDetails & {
  priceLabel: string;
  imageScale: number;
  imagePosition: string;
};

const heroCollections = [
  {
    id: 1,
    title: 'Bridal',
    category: 'Wedding Dress',
    subtitle: 'Eternal Elegance',
    image: 'https://images.unsplash.com/photo-1767050400384-3e2c733e5dba?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    description: 'Timeless wedding gowns for your special day',
  },
  {
    id: 2,
    title: 'Evening',
    category: 'Evening Gown',
    subtitle: 'Sophisticated Grace',
    image: 'https://images.unsplash.com/photo-1764998112680-2f617dc9be40?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    description: 'Elegant evening wear for formal occasions',
  },
  {
    id: 3,
    title: 'Ball Gown',
    category: 'Ball Gown',
    subtitle: 'Royal Grandeur',
    image: 'https://images.unsplash.com/photo-1647791770645-509119fe2b8a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    description: 'Dramatic silhouettes for grand celebrations',
  },
  {
    id: 4,
    title: 'Cocktail',
    category: 'Cocktail Dress',
    subtitle: 'Modern Charm',
    image: 'https://images.unsplash.com/photo-1735712954543-67a25a6998c8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    description: 'Chic designs for cocktail parties',
  },
  {
    id: 5,
    title: 'Debut',
    category: 'Ball Gown',
    subtitle: 'Coming of Age',
    image: 'https://images.unsplash.com/photo-1761164920960-2d776a18998c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    description: 'Perfect gowns for your 18th birthday',
  },
  {
    id: 6,
    title: 'Couture',
    category: 'Evening Gown',
    subtitle: 'Haute Luxury',
    image: 'https://images.unsplash.com/photo-1765229280659-d35a2467b976?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    description: 'Exclusive designer pieces',
  },
];

const defaultTopGowns: FeaturedGownCard[] = [
  {
    id: '1',
    name: 'Celestial Dream',
    category: 'Bridal Collection',
    color: 'Ivory',
    size: ['S', 'M', 'L'],
    price: 8000,
    status: 'available',
    branch: 'Makati Branch',
    image: 'https://images.unsplash.com/photo-1767050400384-3e2c733e5dba?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    rating: 4.8,
    ratings: [],
    priceLabel: 'P8,000',
    imageScale: 1.08,
    imagePosition: 'center center',
  },
  {
    id: '2',
    name: 'Midnight Noir',
    category: 'Evening Gown',
    color: 'Black',
    size: ['S', 'M', 'L'],
    price: 5500,
    status: 'available',
    branch: 'BGC Branch',
    image: 'https://images.unsplash.com/photo-1764998112680-2f617dc9be40?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    rating: 4.7,
    ratings: [],
    priceLabel: 'P5,500',
    imageScale: 1.08,
    imagePosition: 'center center',
  },
  {
    id: '3',
    name: 'Rose Couture',
    category: 'Ball Gown',
    color: 'Rose',
    size: ['S', 'M', 'L'],
    price: 6200,
    status: 'available',
    branch: 'Quezon City',
    image: 'https://images.unsplash.com/photo-1647791770645-509119fe2b8a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    rating: 4.9,
    ratings: [],
    priceLabel: 'P6,200',
    imageScale: 1.08,
    imagePosition: 'center center',
  },
  {
    id: '4',
    name: 'Golden Hour',
    category: 'Cocktail Dress',
    color: 'Gold',
    size: ['S', 'M', 'L'],
    price: 3800,
    status: 'available',
    branch: 'Makati Branch',
    image: 'https://images.unsplash.com/photo-1735712954543-67a25a6998c8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    rating: 4.6,
    ratings: [],
    priceLabel: 'P3,800',
    imageScale: 1.08,
    imagePosition: 'center center',
  },
  {
    id: '5',
    name: 'Ivory Perfection',
    category: 'Wedding Dress',
    color: 'Ivory',
    size: ['S', 'M', 'L'],
    price: 7500,
    status: 'available',
    branch: 'BGC Branch',
    image: 'https://images.unsplash.com/photo-1761164920960-2d776a18998c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    rating: 4.8,
    ratings: [],
    priceLabel: 'P7,500',
    imageScale: 1.08,
    imagePosition: 'center center',
  },
  {
    id: '6',
    name: 'Silk Symphony',
    category: 'Evening Gown',
    color: 'Champagne',
    size: ['S', 'M', 'L'],
    price: 4800,
    status: 'available',
    branch: 'Quezon City',
    image: 'https://images.unsplash.com/photo-1765229280659-d35a2467b976?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    rating: 4.7,
    ratings: [],
    priceLabel: 'P4,800',
    imageScale: 1.08,
    imagePosition: 'center center',
  },
];

const services = [
  { icon: Sparkles, title: 'Browse Catalog', desc: 'Curated collections for every occasion', view: 'catalog' as View },
  { icon: Heart, title: 'Rent a Gown', desc: 'Flexible periods, flawless fit', view: 'rentals' as View },
  { icon: Ruler, title: 'Custom Orders', desc: 'Bespoke pieces, uniquely yours', view: 'custom-orders' as View },
  { icon: Calendar, title: 'Book Appointment', desc: 'Expert consultations, personalized service', view: 'appointments' as View },
];

const stats = [
  { num: '500+', label: 'Gowns' },
  { num: '1,200+', label: 'Happy Clients' },
  { num: '5+', label: 'Branches' },
  { num: '30+', label: 'Years' },
];

const featuredGownsPerSlide = 3;
const FEATURED_SELECTOR_PAGE_SIZE = 8;
const MAX_FEATURED_GOWNS = 6;

function formatPriceLabel(price: number) {
  return `P${Math.round(price).toLocaleString('en-PH')}`;
}

function getFeaturedImagePresentation(item: Pick<InventoryItem, 'name' | 'sku'>) {
  if (item.sku === 'G009' || item.name === 'Yellow Shine') {
    return {
      imageScale: 1.28,
      imagePosition: 'center center',
    };
  }

  return {
    imageScale: 1.08,
    imagePosition: 'center center',
  };
}

function toFeaturedGownCard(item: InventoryItem): FeaturedGownCard {
  const { imageScale, imagePosition } = getFeaturedImagePresentation(item);

  return {
    id: item.id,
    name: item.name,
    category: item.category,
    color: item.color || 'Not specified',
    size: Array.isArray(item.size) ? item.size : [],
    price: Number(item.price || 0),
    status: item.status === 'available' || item.status === 'rented' || item.status === 'reserved' || item.status === 'maintenance'
      ? item.status
      : 'available',
    branch: item.branch || 'Not specified',
    image: item.image?.trim() || 'https://images.unsplash.com/photo-1763336016192-c7b62602e993?w=800',
    rating: typeof item.rating === 'number' ? item.rating : 0,
    ratings: Array.isArray(item.ratings) ? item.ratings : [],
    priceLabel: formatPriceLabel(Number(item.price || 0)),
    imageScale,
    imagePosition,
  };
}

export function Home({ setCurrentView, authToken, isLoggedIn, isAdmin, onOpenAuthModal }: HomeProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [heroSlide, setHeroSlide] = useState(0);
  const [showInitialBranding, setShowInitialBranding] = useState(true);
  const [showLiveViewModal, setShowLiveViewModal] = useState(false);
  const [blockedActionLabel, setBlockedActionLabel] = useState('this action');
  const [featuredGowns, setFeaturedGowns] = useState<FeaturedGownCard[]>(defaultTopGowns);
  const [showFeaturedSelector, setShowFeaturedSelector] = useState(false);
  const [selectorLoading, setSelectorLoading] = useState(false);
  const [selectorSaving, setSelectorSaving] = useState(false);
  const [selectorError, setSelectorError] = useState<string | null>(null);
  const [inventoryOptions, setInventoryOptions] = useState<InventoryItem[]>([]);
  const [selectedFeaturedIds, setSelectedFeaturedIds] = useState<string[]>([]);
  const [selectorPage, setSelectorPage] = useState(1);
  const [selectedFeaturedGown, setSelectedFeaturedGown] = useState<FeaturedGownCard | null>(null);
  const featuredRef = useRef<HTMLDivElement>(null);

  const getActionLabel = (view: View) => {
    if (view === 'rentals') return 'renting gowns';
    if (view === 'custom-orders') return 'creating custom orders';
    if (view === 'appointments') return 'booking appointments';
    if (view === 'profile') return 'opening profiles';
    return 'this action';
  };

  const handleProtectedNavigation = (view: View) => {
    if (!isLoggedIn && view !== 'catalog') {
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

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % Math.ceil(featuredGowns.length / featuredGownsPerSlide));
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + Math.ceil(featuredGowns.length / featuredGownsPerSlide)) % Math.ceil(featuredGowns.length / featuredGownsPerSlide));
  };

  const loadFeaturedGowns = async () => {
    try {
      const items = await getPublicInventory();
      const activeItems = items.filter((item) => item.status !== 'archived');
      const selectedItems = activeItems.filter((item) => item.featuredHome).slice(0, MAX_FEATURED_GOWNS);
      const fallbackItems = activeItems.slice(0, 6);
      const nextFeatured = (selectedItems.length > 0 ? selectedItems : fallbackItems).map(toFeaturedGownCard);
      setFeaturedGowns(nextFeatured.length > 0 ? nextFeatured : defaultTopGowns);
    } catch {
      setFeaturedGowns(defaultTopGowns);
    }
  };

  const loadInventoryOptions = async () => {
    if (!authToken) {
      setSelectorError('Sign in again to manage featured gowns.');
      return;
    }

    setSelectorLoading(true);
    setSelectorError(null);

    try {
      const items = await getInventory(authToken);
      const activeItems = items.filter((item) => item.status !== 'archived');
      setInventoryOptions(activeItems);
      setSelectedFeaturedIds(activeItems.filter((item) => item.featuredHome).slice(0, MAX_FEATURED_GOWNS).map((item) => item.id));
      setSelectorPage(1);
    } catch (error) {
      setSelectorError(error instanceof Error ? error.message : 'Failed to load gowns.');
    } finally {
      setSelectorLoading(false);
    }
  };

  const openFeaturedSelector = () => {
    setShowFeaturedSelector(true);
    void loadInventoryOptions();
  };

  const toggleFeaturedSelection = (gownId: string) => {
    setSelectorError(null);
    setSelectedFeaturedIds((currentIds) => {
      if (currentIds.includes(gownId)) {
        return currentIds.filter((id) => id !== gownId);
      }

      if (currentIds.length >= MAX_FEATURED_GOWNS) {
        setSelectorError(`You can select up to ${MAX_FEATURED_GOWNS} gowns only.`);
        return currentIds;
      }

      return [...currentIds, gownId];
    });
  };

  const saveFeaturedGowns = async () => {
    if (!authToken) {
      setSelectorError('Sign in again to manage featured gowns.');
      return;
    }

    const selectedSet = new Set(selectedFeaturedIds.slice(0, MAX_FEATURED_GOWNS));
    const changedItems = inventoryOptions.filter((item) => Boolean(item.featuredHome) !== selectedSet.has(item.id));

    if (changedItems.length === 0) {
      setShowFeaturedSelector(false);
      return;
    }

    setSelectorSaving(true);
    setSelectorError(null);

    try {
      await Promise.all(
        changedItems.map((item) => updateProduct(authToken, item.id, { featuredHome: selectedSet.has(item.id) }))
      );

      const nextInventory = inventoryOptions.map((item) => ({
        ...item,
        featuredHome: selectedSet.has(item.id),
      }));

      setInventoryOptions(nextInventory);
      setFeaturedGowns(
        nextInventory
          .filter((item) => item.featuredHome)
          .slice(0, MAX_FEATURED_GOWNS)
          .map(toFeaturedGownCard)
      );
      setShowFeaturedSelector(false);
      window.dispatchEvent(new Event(INVENTORY_UPDATED_EVENT));
      await loadFeaturedGowns();
    } catch (error) {
      setSelectorError(error instanceof Error ? error.message : 'Failed to save featured gowns.');
    } finally {
      setSelectorSaving(false);
    }
  };

  useEffect(() => {
    const hasSeenBranding = sessionStorage.getItem('hasSeenBranding');

    if (hasSeenBranding) {
      setShowInitialBranding(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowInitialBranding(false);
      sessionStorage.setItem('hasSeenBranding', 'true');
    }, 3500);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const heroInterval = window.setInterval(() => {
      setHeroSlide((prev) => (prev + 2) % heroCollections.length);
    }, 6000);

    return () => window.clearInterval(heroInterval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % Math.ceil(featuredGowns.length / featuredGownsPerSlide));
    }, 5000);

    return () => window.clearInterval(interval);
  }, [featuredGowns.length]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.scroll-animate').forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void loadFeaturedGowns();

    const onInventoryUpdated = () => {
      void loadFeaturedGowns();
    };

    window.addEventListener(INVENTORY_UPDATED_EVENT, onInventoryUpdated);
    return () => window.removeEventListener(INVENTORY_UPDATED_EVENT, onInventoryUpdated);
  }, []);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(featuredGowns.length / featuredGownsPerSlide));
    setCurrentSlide((current) => Math.min(current, pageCount - 1));
  }, [featuredGowns.length]);

  const currentPair = [
    heroCollections[heroSlide],
    heroCollections[(heroSlide + 1) % heroCollections.length],
  ];
  const featuredGownsPageCount = Math.max(1, Math.ceil(featuredGowns.length / featuredGownsPerSlide));
  const featuredSelectorPageCount = Math.max(1, Math.ceil(inventoryOptions.length / FEATURED_SELECTOR_PAGE_SIZE));
  const safeSelectorPage = Math.min(selectorPage, featuredSelectorPageCount);
  const paginatedInventoryOptions = inventoryOptions.slice(
    (safeSelectorPage - 1) * FEATURED_SELECTOR_PAGE_SIZE,
    safeSelectorPage * FEATURED_SELECTOR_PAGE_SIZE,
  );
  const currentFeaturedGowns = featuredGowns.slice(
    currentSlide * featuredGownsPerSlide,
    currentSlide * featuredGownsPerSlide + featuredGownsPerSlide
  );

  return (
    <div className="min-h-screen bg-[#FAF7F0]">
      <section className="relative flex flex-col md:flex-row">
        {showInitialBranding && (
          <div className="pointer-events-none absolute left-1/2 top-12 z-20 -translate-x-1/2 text-center md:top-16 lg:top-20">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              <h1 className="mb-1 font-serif text-4xl font-light tracking-tight text-white drop-shadow-2xl md:mb-2 md:text-6xl lg:text-7xl xl:text-8xl">
                Hannah Vanessa
              </h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/90 drop-shadow-lg md:text-xs md:tracking-[0.5em] lg:text-sm">
                Boutique
              </p>
            </motion.div>
          </div>
        )}

        {currentPair.map((collection, index) => (
          <div
            key={`${collection.id}-${index}`}
            className="group relative flex-1 cursor-pointer overflow-hidden min-h-[18rem] md:min-h-[42rem] lg:min-h-[50rem]"
            onClick={() => setCurrentView('catalog', { catalogCategory: collection.category })}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60">
              <ImageWithFallback
                src={collection.image}
                alt={collection.title}
                className="h-full w-full object-cover transition-all duration-1000 ease-out group-hover:scale-110"
              />
            </div>

            <div className="relative flex h-full items-end p-8 md:p-12 lg:p-16">
              <div>
                <motion.p
                  key={`subtitle-${collection.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mb-2 text-xs uppercase tracking-[0.3em] text-white/90"
                  style={{ textShadow: '0 0 10px rgba(255, 255, 255, 0.75), 0 0 18px rgba(255, 255, 255, 0.35)' }}
                >
                  {collection.subtitle}
                </motion.p>
                <motion.h2
                  key={`title-${collection.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mb-3 font-serif text-4xl font-light text-white md:mb-4 md:text-5xl lg:text-6xl xl:text-8xl"
                  style={{ textShadow: '0 0 12px rgba(255, 255, 255, 0.85), 0 0 24px rgba(255, 255, 255, 0.45)' }}
                >
                  {collection.title}
                </motion.h2>
                <motion.p
                  key={`desc-${collection.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mb-4 max-w-xs text-sm text-white/95 md:mb-6"
                  style={{ textShadow: '0 0 8px rgba(255, 255, 255, 0.75), 0 0 16px rgba(255, 255, 255, 0.35)' }}
                >
                  {collection.description}
                </motion.p>
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="group/btn inline-flex items-center gap-2 border-b-2 border-white pb-1 text-white transition-all hover:border-[#D4AF37] hover:text-[#D4AF37]"
                  style={{ textShadow: '0 0 8px rgba(255, 255, 255, 0.75), 0 0 16px rgba(255, 255, 255, 0.35)' }}
                >
                  <span className="text-sm uppercase tracking-wider">Explore</span>
                  <ArrowRight className="h-5 w-5 transition-transform group-hover/btn:translate-x-1" />
                </motion.button>
              </div>
            </div>

            {index === 0 && (
              <div className="absolute right-0 top-1/2 hidden h-64 w-px -translate-y-1/2 bg-white/30 md:block" />
            )}
          </div>
        ))}

        <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 gap-2 md:bottom-8">
          {[...Array(Math.ceil(heroCollections.length / 2))].map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Show featured pair ${index + 1}`}
              onClick={() => setHeroSlide(index * 2)}
              className={`transition-all ${
                Math.floor(heroSlide / 2) === index
                  ? 'h-1 w-8 bg-white'
                  : 'h-1 w-6 bg-white/40 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      </section>

      <section className="scroll-animate translate-y-10 bg-white py-12 opacity-0 transition-all duration-700 md:py-16 lg:py-24">
        <div className="relative mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="relative mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end lg:mb-12">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.3em] text-[#6B5D4F]">
                This Season's Best
              </p>
              <h2 className="font-serif text-3xl font-light md:text-4xl lg:text-5xl xl:text-6xl">
                Featured Gowns
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:ml-8 lg:ml-10">
              {isAdmin && (
                <button
                  type="button"
                  onClick={openFeaturedSelector}
                  className="px-4 py-2 text-xs uppercase tracking-[0.15em] border border-[#1a1a1a] text-[#1a1a1a] transition-colors hover:bg-[#1a1a1a] hover:text-white"
                >
                  Select Gowns
                </button>
              )}
            </div>
          </div>

          <div className="absolute top-0 hidden items-center gap-2 md:flex" style={{ right: '30px' }}>
            <button
              type="button"
              aria-label="Show previous featured gowns"
              onClick={prevSlide}
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#E8DCC8] transition-all hover:border-[#D4AF37] hover:bg-[#D4AF37] hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Show next featured gowns"
              onClick={nextSlide}
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#E8DCC8] transition-all hover:border-[#D4AF37] hover:bg-[#D4AF37] hover:text-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div ref={featuredRef} className="relative w-full overflow-hidden">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {currentFeaturedGowns.map((gown) => (
                <div
                  key={gown.id}
                  className="group cursor-pointer"
                  onClick={() => setSelectedFeaturedGown(gown)}
                >
                  <div className="relative mb-4 aspect-[3/4] overflow-hidden bg-[#F5F1E8]">
                    <ImageWithFallback
                      src={gown.image}
                      alt={gown.name}
                      className="absolute inset-0 block h-full w-full object-cover transition-transform duration-700"
                      style={{
                        objectPosition: gown.imagePosition,
                        transform: `scale(${gown.imageScale})`,
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />
                    <div className="absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                        <ArrowRight className="h-5 w-5 text-[#1a1a1a]" />
                      </div>
                    </div>
                  </div>
                  <p className="mb-2 text-xs uppercase tracking-wider text-[#6B5D4F]">
                    {gown.category}
                  </p>
                  <h3 className="mb-2 font-serif text-xl transition-colors group-hover:text-[#D4AF37] md:text-2xl">
                    {gown.name}
                  </h3>
                  <p className="text-sm text-[#6B5D4F]">{gown.priceLabel} / day</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex justify-center gap-2">
            {[...Array(featuredGownsPageCount)].map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Show featured gown slide ${index + 1}`}
                onClick={() => setCurrentSlide(index)}
                className={`transition-all ${
                  index === currentSlide
                    ? 'h-1 w-8 bg-[#D4AF37]'
                    : 'h-1 w-6 bg-[#E8DCC8] hover:bg-[#D4AF37]/50'
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="scroll-animate translate-y-10 bg-[#FAF7F0] py-12 opacity-0 transition-all duration-700 md:py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <p className="mb-4 text-xs uppercase tracking-[0.3em] text-[#6B5D4F]">
                Established 1993
              </p>
              <h2 className="mb-6 font-serif text-4xl font-light leading-tight md:text-5xl lg:text-6xl">
                Where Every
                <br />
                Stitch Tells
                <br />
                <span className="italic">a Story</span>
              </h2>
              <p className="mb-8 text-base leading-relaxed text-[#6B5D4F] md:text-lg">
                For over three decades, Hannah Vanessa Boutique has been the trusted name
                in elegant formal wear across the Philippines. From timeless bridal gowns
                to stunning evening wear, we curate each piece with exceptional care.
              </p>
              <button
                type="button"
                onClick={() => setCurrentView('catalog')}
                className="group inline-flex items-center gap-2 rounded-sm bg-[#1a1a1a] px-6 py-3 text-sm text-white transition-all hover:bg-[#D4AF37] md:gap-3 md:px-8 md:py-4 md:text-base"
              >
                <span className="text-sm uppercase tracking-wider">Discover More</span>
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <div className="grid w-full max-w-[16rem] justify-self-center grid-cols-2 gap-3 md:max-w-[18rem] md:gap-4 lg:col-span-7 lg:max-w-[20rem]">
              <div className="space-y-3 md:space-y-4">
                <div className="aspect-[3/4] overflow-hidden">
                  <ImageWithFallback
                    src="https://images.unsplash.com/photo-1698582468284-fd9161f4176b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
                    alt="Boutique"
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-110"
                  />
                </div>
                <div className="aspect-square overflow-hidden">
                  <ImageWithFallback
                    src="https://images.unsplash.com/photo-1647791770645-509119fe2b8a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
                    alt="Details"
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-110"
                  />
                </div>
              </div>
              <div className="space-y-3 pt-8 md:space-y-4 md:pt-12">
                <div className="aspect-square overflow-hidden">
                  <ImageWithFallback
                    src="https://images.unsplash.com/photo-1735712954543-67a25a6998c8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
                    alt="Interior"
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-110"
                  />
                </div>
                <div className="aspect-[3/4] overflow-hidden">
                  <ImageWithFallback
                    src="https://images.unsplash.com/photo-1761164920960-2d776a18998c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080"
                    alt="Model"
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-110"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="scroll-animate translate-y-10 bg-white py-12 opacity-0 transition-all duration-700 md:py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="mb-8 text-center md:mb-12 lg:mb-16">
            <h2 className="mb-4 font-serif text-3xl font-light md:text-4xl lg:text-5xl xl:text-6xl">
              Exceptional Services
            </h2>
            <p className="mx-auto max-w-2xl text-base text-[#6B5D4F] md:text-lg">
              Every detail thoughtfully crafted for your perfect experience
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
            {services.map((service, index) => {
              const Icon = service.icon;
              return (
                <div
                  key={index}
                  className="group relative cursor-pointer overflow-hidden bg-[#FAF7F0] p-6 transition-all duration-500 hover:bg-[#1a1a1a] md:p-8"
                  onClick={() => {
                    if (service.view === 'catalog') {
                      setCurrentView(service.view);
                      return;
                    }

                    handleProtectedNavigation(service.view);
                  }}
                >
                  <div className="absolute right-0 top-0 h-32 w-32 translate-x-16 -translate-y-16 rounded-full bg-[#D4AF37]/5 transition-transform duration-500 group-hover:scale-150" />
                  <Icon className="mb-4 h-10 w-10 text-[#D4AF37] transition-transform group-hover:scale-110 md:mb-6 md:h-12 md:w-12" />
                  <h3 className="mb-2 font-serif text-xl text-[#1a1a1a] transition-colors group-hover:text-white md:mb-3 md:text-2xl">
                    {service.title}
                  </h3>
                  <p className="mb-4 text-sm text-[#6B5D4F] transition-colors group-hover:text-white/80 md:mb-6">
                    {service.desc}
                  </p>
                  <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-[#1a1a1a] transition-colors group-hover:text-[#D4AF37]">
                    Learn More
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="scroll-animate translate-y-10 bg-[#1a1a1a] text-white opacity-0 transition-all duration-700 min-h-[9rem] md:min-h-[10.5rem] lg:min-h-[12rem]">
        <div className="mx-auto flex min-h-[inherit] max-w-7xl items-center px-4 md:px-6 lg:px-8">
          <div className="grid w-full grid-cols-2 gap-4 py-6 md:grid-cols-4 md:gap-6 md:py-8 lg:gap-8 lg:py-10">
            {stats.map((stat, index) => (
              <div key={index} className="flex flex-col items-center justify-center text-center">
                <div className="mb-2 font-serif text-4xl font-light md:text-5xl lg:text-6xl">{stat.num}</div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="scroll-animate translate-y-10 bg-gradient-to-b from-[#FAF7F0] to-white py-16 opacity-0 transition-all duration-700 md:py-24 lg:py-32">
        <div className="mx-auto max-w-4xl px-4 text-center md:px-6 lg:px-8">
          <h2 className="mb-6 font-serif text-4xl font-light leading-tight md:text-5xl lg:text-6xl xl:text-7xl">
            Ready to Find
            <br />
            <span className="italic">Your Perfect</span> Gown?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-base text-[#6B5D4F] md:mb-12 md:text-lg">
            Start your journey with us. Book a consultation or explore our collections today.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => handleProtectedNavigation('appointments')}
              className="rounded-sm bg-[#D4AF37] px-6 py-3 text-sm uppercase tracking-wider text-white shadow-lg transition-all hover:bg-[#1a1a1a] hover:shadow-xl md:px-8 md:py-4 lg:px-10 lg:py-5"
            >
              Book Consultation
            </button>
            <button
              type="button"
              onClick={() => setCurrentView('catalog')}
              className="rounded-sm border-2 border-[#1a1a1a] px-6 py-3 text-sm uppercase tracking-wider text-[#1a1a1a] transition-all hover:bg-[#1a1a1a] hover:text-white md:px-8 md:py-4 lg:px-10 lg:py-5"
            >
              View Collections
            </button>
          </div>
        </div>
      </section>

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
            <h3 className="mb-3 font-serif text-3xl">Live View</h3>
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

      {showFeaturedSelector && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !selectorSaving && setShowFeaturedSelector(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Select featured gowns"
        >
          <div
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden bg-white p-4 md:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="font-serif text-3xl font-light text-[#1a1a1a]">Select Gowns</h3>
                <p className="mt-2 text-sm text-[#6B5D4F]">Choose up to {MAX_FEATURED_GOWNS} gowns from the database to replace the current Featured Gowns section.</p>
              </div>
              <div className="text-sm text-[#6B5D4F]">{selectedFeaturedIds.length} / {MAX_FEATURED_GOWNS} selected</div>
            </div>

            {selectorError && (
              <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {selectorError}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto border border-[#E8DCC8]">
              {selectorLoading ? (
                <div className="px-4 py-6 text-sm text-[#6B5D4F]">Loading gowns...</div>
              ) : inventoryOptions.length === 0 ? (
                <div className="px-4 py-6 text-sm text-[#6B5D4F]">No gowns found.</div>
              ) : (
                <table className="w-full min-w-[720px]">
                  <thead className="bg-[#FAF7F0] sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm text-[#6B5D4F]">Select</th>
                      <th className="px-4 py-3 text-left text-sm text-[#6B5D4F]">ID</th>
                      <th className="px-4 py-3 text-left text-sm text-[#6B5D4F]">Name</th>
                      <th className="px-4 py-3 text-left text-sm text-[#6B5D4F]">Category</th>
                      <th className="px-4 py-3 text-left text-sm text-[#6B5D4F]">Price</th>
                      <th className="px-4 py-3 text-left text-sm text-[#6B5D4F]">Branch</th>
                      <th className="px-4 py-3 text-left text-sm text-[#6B5D4F]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8DCC8]">
                    {paginatedInventoryOptions.map((item) => {
                      const isSelected = selectedFeaturedIds.includes(item.id);

                      return (
                        <tr
                          key={item.id}
                          className="cursor-pointer transition-colors hover:bg-[#FAF7F0]"
                          onClick={() => toggleFeaturedSelection(item.id)}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleFeaturedSelection(item.id)}
                              onClick={(event) => event.stopPropagation()}
                              className="h-4 w-4 border-[#CBBBA5] text-[#1a1a1a] focus:ring-[#D4AF37]"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-[#6B5D4F]">{item.sku ?? item.id}</td>
                          <td className="px-4 py-3 text-sm font-medium text-[#1a1a1a]">{item.name}</td>
                          <td className="px-4 py-3 text-sm text-[#6B5D4F]">{item.category}</td>
                          <td className="px-4 py-3 text-sm text-[#1a1a1a]">{formatPriceLabel(Number(item.price || 0))}</td>
                          <td className="px-4 py-3 text-sm text-[#6B5D4F]">{item.branch}</td>
                          <td className="px-4 py-3 text-sm text-[#6B5D4F]">{item.status.charAt(0).toUpperCase() + item.status.slice(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {!selectorLoading && inventoryOptions.length > FEATURED_SELECTOR_PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-sm leading-none text-[#6B5D4F]">
                  Showing {(safeSelectorPage - 1) * FEATURED_SELECTOR_PAGE_SIZE + 1}-
                  {Math.min(safeSelectorPage * FEATURED_SELECTOR_PAGE_SIZE, inventoryOptions.length)} of {inventoryOptions.length}
                </div>
                <div className="ml-auto flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectorPage((page) => Math.max(1, page - 1))}
                    disabled={safeSelectorPage === 1}
                    className="px-4 py-2 border border-[#E8DCC8] rounded-full text-sm transition-colors hover:border-[#D4AF37] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <div className="text-sm text-[#6B5D4F]">Page {safeSelectorPage} of {featuredSelectorPageCount}</div>
                  <button
                    type="button"
                    onClick={() => setSelectorPage((page) => Math.min(featuredSelectorPageCount, page + 1))}
                    disabled={safeSelectorPage === featuredSelectorPageCount}
                    className="px-4 py-2 border border-[#E8DCC8] rounded-full text-sm transition-colors hover:border-[#D4AF37] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col justify-center gap-3 md:flex-row md:justify-center">
              <button
                type="button"
                onClick={() => setShowFeaturedSelector(false)}
                disabled={selectorSaving}
                className="px-6 py-3 rounded-lg border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#D4AF37] hover:text-black transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveFeaturedGowns()}
                disabled={selectorSaving || selectorLoading}
                className="px-6 py-3 rounded-lg border border-[#1a1a1a] bg-[#1a1a1a] text-white font-medium hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {selectorSaving ? 'Saving...' : 'Save Featured Gowns'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedFeaturedGown && (
        <GownDetailsModal
          gown={selectedFeaturedGown}
          isAdmin={isAdmin}
          onClose={() => setSelectedFeaturedGown(null)}
          onBookRental={(gownId) => {
            if (!isLoggedIn) {
              setSelectedFeaturedGown(null);
              onOpenAuthModal();
              return;
            }

            if (isAdmin) {
              setSelectedFeaturedGown(null);
              setBlockedActionLabel(getActionLabel('rentals'));
              setShowLiveViewModal(true);
              return;
            }

            setSelectedFeaturedGown(null);
            setCurrentView('rentals', { selectedGownId: gownId });
          }}
          onScheduleFitting={(gownId) => {
            if (!isLoggedIn) {
              setSelectedFeaturedGown(null);
              onOpenAuthModal();
              return;
            }

            if (isAdmin) {
              setSelectedFeaturedGown(null);
              setBlockedActionLabel(getActionLabel('appointments'));
              setShowLiveViewModal(true);
              return;
            }

            setSelectedFeaturedGown(null);
            setCurrentView('appointments', { selectedGownId: gownId });
          }}
          onAdminPreview={() => {
            setSelectedFeaturedGown(null);
            setShowLiveViewModal(true);
          }}
        />
      )}
    </div>
  );
}