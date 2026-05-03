import type { FavoriteGown } from '../App';
import { useEffect, useMemo, useState } from 'react';
import { Search, Heart, Calendar, MapPin, Star } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { GownDetailsModal } from './GownDetailsModal';
import { getPublicInventory, INVENTORY_UPDATED_EVENT } from '../services/inventoryAPI';
import type { InventoryItem, InventoryRating } from '../services/inventoryAPI';

type View = 'home' | 'catalog' | 'rentals' | 'custom-orders' | 'appointments' | 'profile' | 'admin';

interface CatalogProps {
  setCurrentView: (view: View) => void;
  initialCategory?: string | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  navigateProtected: (view: View) => void;
  setSelectedGownId: (id: string | null) => void;
  navigateWithGown: (view: 'rentals' | 'appointments', gownId: string) => void;
  favoriteGowns: FavoriteGown[];
  onAddFavorite: (gown: FavoriteGown) => void;
  onRemoveFavorite: (gownId: string) => void;
}

interface GownItem {
  id: string;
  name: string;
  category: string;
  color: string;
  size: string[];
  price: number;
  status: 'available' | 'rented' | 'reserved';
  branch: string;
  image: string;
  rating: number;
  ratings?: InventoryRating[];
}

const CATALOG_PAGE_SIZE = 9;

function toCatalogGown(item: InventoryItem): GownItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    color: item.color,
    size: item.size,
    price: item.price,
    status: item.status === 'available' || item.status === 'rented' || item.status === 'reserved'
      ? item.status
      : 'reserved',
    branch: item.branch,
    image: item.image?.trim() || 'https://images.unsplash.com/photo-1763336016192-c7b62602e993?w=800',
    rating: typeof item.rating === 'number' ? item.rating : 0,
    ratings: Array.isArray(item.ratings) ? item.ratings : []
  };
}

const CATEGORY_LABEL_TO_VALUE: Record<string, string> = {
  'wedding gowns': 'Wedding Dress',
  'wedding dress': 'Wedding Dress',
  'evening dresses': 'Evening Gown',
  'evening gown': 'Evening Gown',
  'ball gowns': 'Ball Gown',
  'ball gown': 'Ball Gown',
  'cocktail dresses': 'Cocktail Dress',
  'cocktail dress': 'Cocktail Dress',
  bridal: 'Wedding Dress',
  evening: 'Evening Gown',
  cocktail: 'Cocktail Dress',
};

function normalizeCategorySelection(category?: string | null) {
  const normalized = String(category || '').trim();
  if (!normalized) {
    return 'All';
  }

  return CATEGORY_LABEL_TO_VALUE[normalized.toLowerCase()] || normalized;
}

export function Catalog({ setCurrentView, initialCategory, isLoggedIn, isAdmin, navigateProtected, setSelectedGownId, navigateWithGown, favoriteGowns, onAddFavorite, onRemoveFavorite }: CatalogProps) {
  const [gowns, setGowns] = useState<GownItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedGown, setSelectedGown] = useState<GownItem | null>(null);
  const [showLiveViewModal, setShowLiveViewModal] = useState(false);
  const [pendingFavorite, setPendingFavorite] = useState<GownItem | null>(null);
  const [pendingFavoriteRemoval, setPendingFavoriteRemoval] = useState<GownItem | null>(null);

  const favoriteIds = useMemo(() => favoriteGowns.map((item) => item.id), [favoriteGowns]);

  const categories = useMemo(
    () => ['All', ...new Set(gowns.map((gown) => gown.category).filter(Boolean))],
    [gowns]
  );

  const loadCatalog = async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const items = await getPublicInventory();
      const mapped = items
        .filter((item) => item.status !== 'archived')
        .map(toCatalogGown);
      setGowns(mapped);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Failed to load gowns');
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();

    const onInventoryUpdated = () => {
      loadCatalog();
    };

    window.addEventListener(INVENTORY_UPDATED_EVENT, onInventoryUpdated);
    return () => window.removeEventListener(INVENTORY_UPDATED_EVENT, onInventoryUpdated);
  }, []);

  useEffect(() => {
    if (selectedGown && !gowns.some((gown) => gown.id === selectedGown.id)) {
      setSelectedGown(null);
    }
  }, [gowns, selectedGown]);

  useEffect(() => {
    const nextCategory = normalizeCategorySelection(initialCategory);
    setSelectedCategory(nextCategory);
  }, [initialCategory]);

  const filteredGowns = useMemo(() => gowns.filter(gown => {
    const matchesSearch = gown.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         gown.color.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || gown.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }), [gowns, searchQuery, selectedCategory]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    if (!catalogLoading && selectedCategory !== 'All' && !categories.includes(selectedCategory)) {
      setSelectedCategory('All');
    }
  }, [catalogLoading, categories, selectedCategory]);

  const totalPages = Math.max(1, Math.ceil(filteredGowns.length / CATALOG_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedGowns = filteredGowns.slice(
    (safeCurrentPage - 1) * CATALOG_PAGE_SIZE,
    safeCurrentPage * CATALOG_PAGE_SIZE,
  );
  const resultStart = filteredGowns.length === 0 ? 0 : (safeCurrentPage - 1) * CATALOG_PAGE_SIZE + 1;
  const resultEnd = Math.min(safeCurrentPage * CATALOG_PAGE_SIZE, filteredGowns.length);

  const handleFavoriteClick = (gown: GownItem) => {
    if (!isLoggedIn || isAdmin) {
      navigateProtected('profile');
      return;
    }

    if (favoriteIds.includes(gown.id)) {
      setPendingFavoriteRemoval(gown);
      return;
    }

    setPendingFavorite(gown);
  };

  const confirmAddFavorite = () => {
    if (!pendingFavorite) return;
    onAddFavorite({
      id: pendingFavorite.id,
      name: pendingFavorite.name,
      category: pendingFavorite.category,
      color: pendingFavorite.color,
      size: pendingFavorite.size,
      price: pendingFavorite.price,
      status: pendingFavorite.status,
      branch: pendingFavorite.branch,
      image: pendingFavorite.image,
      rating: pendingFavorite.rating,
      ratings: pendingFavorite.ratings,
    });
    setPendingFavorite(null);
  };

  const confirmRemoveFavorite = () => {
    if (!pendingFavoriteRemoval) return;
    onRemoveFavorite(pendingFavoriteRemoval.id);
    setPendingFavoriteRemoval(null);
  };

  const handleBookNow = (gownId: string) => {
    if (isAdmin) {
      setShowLiveViewModal(true);
      return;
    }
    navigateWithGown('rentals', gownId);
  };

  const scrollPageToTop = () => {
    const scrollingElement = document.scrollingElement || document.documentElement || document.body;

    window.requestAnimationFrame(() => {
      scrollingElement.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const changePage = (nextPage: number, button?: HTMLButtonElement | null) => {
    button?.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setCurrentPage(nextPage);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollPageToTop();
      });
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF7F0] py-12">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-serif text-5xl md:text-6xl font-light mb-4">Shop All</h1>
          <p className="text-lg text-[#6B5D4F] max-w-2xl">
            Discover our curated collection of exquisite gowns for every occasion. 
            Each piece is carefully selected for its exceptional quality and timeless design.
          </p>
        </div>

        {/* Search and Filter */}
        <div className="mb-12 space-y-6">
          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B5D4F]" />
            <input
              type="text"
              placeholder="Search gowns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-[#E8DCC8] focus:outline-none focus:border-[#D4AF37] transition-colors"
            />
          </div>

          {/* Category Filters */}
          <div className="flex flex-wrap gap-3">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-6 py-2 text-xs uppercase tracking-[0.15em] transition-all ${
                  selectedCategory === category
                    ? 'bg-[#1a1a1a] text-white'
                    : 'bg-white border border-[#E8DCC8] text-[#6B5D4F] hover:border-[#1a1a1a]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-6 text-sm text-[#6B5D4F]">
          Showing {resultStart}-{resultEnd} of {filteredGowns.length} {filteredGowns.length === 1 ? 'gown' : 'gowns'}
        </div>

        {catalogError && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{catalogError}</span>
            <button
              onClick={loadCatalog}
              className="px-3 py-1 text-xs uppercase tracking-[0.12em] border border-red-300 hover:bg-red-100 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {catalogLoading && (
          <div className="mb-10 text-sm text-[#6B5D4F]">Loading gowns...</div>
        )}

        {/* Gown Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {paginatedGowns.map((gown) => (
            <div
              key={gown.id}
              className="group bg-white overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedGown(gown)}
            >
              {/* Image Container */}
              <div className="relative aspect-[3/4] overflow-hidden bg-[#F5F1E8]">
                <ImageWithFallback
                  src={gown.image}
                  alt={gown.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                
                {/* Status Badge */}
                {gown.status === 'rented' && (
                  <div className="absolute top-4 left-4 px-3 py-1 bg-[#6B5D4F] text-white text-xs uppercase tracking-wider">
                    Unavailable
                  </div>
                )}
                {gown.status === 'reserved' && (
                  <div className="absolute top-4 left-4 px-3 py-1 bg-[#D4AF37] text-white text-xs uppercase tracking-wider">
                    Reserved
                  </div>
                )}

                {/* Favorite Button */}
                <button
                  type="button"
                  aria-label={favoriteIds.includes(gown.id) ? `Unfavorite ${gown.name}` : `Add ${gown.name} to favorites`}
                  title={favoriteIds.includes(gown.id) ? 'Unfavorite gown' : 'Add to favorites'}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFavoriteClick(gown);
                  }}
                  className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white transition-colors"
                >
                  <Heart
                    className={`w-5 h-5 ${
                      favoriteIds.includes(gown.id)
                        ? 'fill-red-500 text-red-500'
                        : 'text-[#6B5D4F]'
                    }`}
                  />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center">
                    <Star className="w-4 h-4 fill-[#D4AF37] text-[#D4AF37]" />
                    <span className="text-sm text-[#6B5D4F] ml-1">{gown.rating}</span>
                  </div>
                  <span className="text-xs text-[#6B5D4F]">•</span>
                  <span className="text-xs text-[#6B5D4F] uppercase tracking-wider">
                    {gown.category}
                  </span>
                </div>
                
                <h3 className="font-serif text-2xl mb-2">{gown.name}</h3>
                
                <p className="text-sm text-[#6B5D4F] mb-3">{gown.color}</p>

                <div className="flex items-center gap-2 text-xs text-[#6B5D4F] mb-4">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{gown.branch}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-[#6B5D4F] uppercase tracking-wider mb-1">
                      Rental Price
                    </div>
                    <div className="font-serif text-2xl">₱{gown.price.toLocaleString()}</div>
                    <div className="text-xs text-[#6B5D4F]">per day</div>
                  </div>
                  
                  {gown.status === 'available' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBookNow(gown.id);
                      }}
                      className="px-4 py-2 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-colors text-xs uppercase tracking-wider"
                    >
                      Book Now
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredGowns.length > CATALOG_PAGE_SIZE && (
          <div className="mb-16 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-[#6B5D4F] leading-none">
              Page {safeCurrentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={(event) => changePage(Math.max(1, safeCurrentPage - 1), event.currentTarget)}
                disabled={safeCurrentPage === 1}
                className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={(event) => changePage(Math.min(totalPages, safeCurrentPage + 1), event.currentTarget)}
                disabled={safeCurrentPage === totalPages}
                className="px-4 py-2 border border-[#E8DCC8] rounded-full hover:border-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredGowns.length === 0 && (
          <div className="text-center py-16">
            <div className="font-serif text-3xl text-[#6B5D4F] mb-4">No gowns found</div>
            <p className="text-[#6B5D4F] mb-8">
              Try adjusting your search or filter criteria
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
              }}
              className="px-6 py-3 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-colors"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {selectedGown && (
        <GownDetailsModal
          gown={selectedGown}
          isAdmin={isAdmin}
          onClose={() => setSelectedGown(null)}
          onBookRental={(gownId) => {
            navigateWithGown('rentals', gownId);
            setSelectedGown(null);
          }}
          onScheduleFitting={(gownId) => {
            navigateWithGown('appointments', gownId);
            setSelectedGown(null);
          }}
          onAdminPreview={() => setShowLiveViewModal(true)}
        />
      )}

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
              You are viewing the storefront as an admin. Renting gowns and scheduling fittings are disabled in this view.
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

      {pendingFavorite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPendingFavorite(null)}
        >
          <div
            className="w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-8 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="mb-3 text-2xl font-light text-black">Add to favorites?</h3>
            <p className="mb-6 text-sm leading-6 text-[#6B5D4F]">
              Add {pendingFavorite.name} to your favorites list?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingFavorite(null)}
                className="flex-1 rounded-full border border-[#E8DCC8] px-5 py-3 transition-colors hover:border-[#1a1a1a]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAddFavorite}
                className="flex-1 rounded-full bg-black px-5 py-3 text-white transition-colors hover:bg-[#D4AF37] hover:text-black"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingFavoriteRemoval && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPendingFavoriteRemoval(null)}
        >
          <div
            className="w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-8 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="mb-3 text-2xl font-light text-black">Unfavorite this gown?</h3>
            <p className="mb-6 text-sm leading-6 text-[#6B5D4F]">
              {pendingFavoriteRemoval.name} is already in your favorites. Do you want to unfavorite it?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingFavoriteRemoval(null)}
                className="flex-1 rounded-full border border-[#E8DCC8] px-5 py-3 transition-colors hover:border-[#1a1a1a]"
              >
                Keep Favorite
              </button>
              <button
                type="button"
                onClick={confirmRemoveFavorite}
                className="flex-1 rounded-full bg-black px-5 py-3 text-white transition-colors hover:bg-[#D4AF37] hover:text-black"
              >
                Unfavorite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}