import { useEffect, useMemo, useState } from 'react';
import { Search, Heart, Calendar, MapPin, Star } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { getPublicInventory, INVENTORY_UPDATED_EVENT } from '../services/inventoryAPI';
import type { InventoryItem } from '../services/inventoryAPI';

type View = 'home' | 'catalog' | 'rentals' | 'custom-orders' | 'appointments' | 'profile' | 'admin';

interface CatalogProps {
  setCurrentView: (view: View) => void;
  isLoggedIn: boolean;
  navigateProtected: (view: View) => void;
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
}

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
    rating: typeof item.rating === 'number' ? item.rating : 0
  };
}

export function Catalog({ setCurrentView, isLoggedIn, navigateProtected }: CatalogProps) {
  const [gowns, setGowns] = useState<GownItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedGown, setSelectedGown] = useState<GownItem | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  const categories = ['All', 'Evening Gown', 'Wedding Dress', 'Ball Gown', 'Cocktail Dress'];

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

  const filteredGowns = useMemo(() => gowns.filter(gown => {
    const matchesSearch = gown.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         gown.color.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || gown.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }), [gowns, searchQuery, selectedCategory]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(fav => fav !== id) : [...prev, id]
    );
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
          {filteredGowns.length} {filteredGowns.length === 1 ? 'gown' : 'gowns'} found
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
          {filteredGowns.map((gown) => (
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
                    Rented
                  </div>
                )}
                {gown.status === 'reserved' && (
                  <div className="absolute top-4 left-4 px-3 py-1 bg-[#D4AF37] text-white text-xs uppercase tracking-wider">
                    Reserved
                  </div>
                )}

                {/* Favorite Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(gown.id);
                  }}
                  className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white transition-colors"
                >
                  <Heart
                    className={`w-5 h-5 ${
                      favorites.includes(gown.id)
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
                        navigateProtected('rentals');
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

      {/* Detail Modal */}
      {selectedGown && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedGown(null)}
        >
          <div
            className="bg-white max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid md:grid-cols-2">
              {/* Image */}
              <div className="aspect-[3/4] bg-[#F5F1E8]">
                <ImageWithFallback
                  src={selectedGown.image}
                  alt={selectedGown.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Details */}
              <div className="p-8 md:p-12">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center">
                    <Star className="w-4 h-4 fill-[#D4AF37] text-[#D4AF37]" />
                    <span className="text-sm text-[#6B5D4F] ml-1">{selectedGown.rating}</span>
                  </div>
                  <span className="text-xs text-[#6B5D4F]">•</span>
                  <span className="text-xs text-[#6B5D4F] uppercase tracking-wider">
                    {selectedGown.category}
                  </span>
                </div>

                <h2 className="font-serif text-4xl mb-4">{selectedGown.name}</h2>

                <div className="mb-6">
                  <div className="text-xs text-[#6B5D4F] uppercase tracking-wider mb-2">
                    Rental Price
                  </div>
                  <div className="font-serif text-4xl mb-1">
                    ₱{selectedGown.price.toLocaleString()}
                  </div>
                  <div className="text-sm text-[#6B5D4F]">per day</div>
                </div>

                <div className="space-y-4 mb-8 pb-8 border-b border-[#E8DCC8]">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-[#6B5D4F]">Color:</span>
                    <span className="ml-2 text-[#1a1a1a]">{selectedGown.color}</span>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-[#6B5D4F]">Sizes Available:</span>
                    <div className="flex gap-2 mt-2">
                      {selectedGown.size.map(size => (
                        <span
                          key={size}
                          className="px-3 py-1 bg-[#F5F1E8] text-[#1a1a1a] text-sm"
                        >
                          {size}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-[#6B5D4F]">Location:</span>
                    <div className="flex items-center gap-2 mt-1">
                      <MapPin className="w-4 h-4 text-[#6B5D4F]" />
                      <span className="text-[#1a1a1a]">{selectedGown.branch}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-[#6B5D4F]">Status:</span>
                    <span className={`ml-2 px-3 py-1 text-xs uppercase tracking-wider ${
                      selectedGown.status === 'available'
                        ? 'bg-green-100 text-green-800'
                        : selectedGown.status === 'rented'
                        ? 'bg-[#6B5D4F] text-white'
                        : 'bg-[#D4AF37] text-white'
                    }`}>
                      {selectedGown.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedGown.status === 'available' && (
                    <>
                      <button
                        onClick={() => {
                          navigateProtected('rentals');
                          setSelectedGown(null);
                        }}
                        className="w-full py-4 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-colors flex items-center justify-center gap-2"
                      >
                        <Calendar className="w-5 h-5" />
                        <span>Book This Gown</span>
                      </button>
                      <button
                        onClick={() => {
                          setCurrentView('appointments');
                          setSelectedGown(null);
                        }}
                        className="w-full py-4 border border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all"
                      >
                        Schedule Fitting
                      </button>
                    </>
                  )}
                  {selectedGown.status !== 'available' && (
                    <button
                      onClick={() => {
                        setCurrentView('appointments');
                        setSelectedGown(null);
                      }}
                      className="w-full py-4 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-colors"
                    >
                      Get Notified When Available
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setSelectedGown(null)}
                  className="w-full mt-4 py-3 text-sm text-[#6B5D4F] hover:text-[#1a1a1a] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}