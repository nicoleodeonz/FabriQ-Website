import { Calendar, ChevronLeft, ChevronRight, MapPin, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import '@google/model-viewer';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';
import { getPublicInventory } from '../services/inventoryAPI';

export interface GownRating {
  reviewerName: string;
  score: number;
  comment?: string;
  createdAt?: string;
}

export interface GownDetails {
  id: string;
  name: string;
  category: string;
  color: string;
  size: string[];
  price: number;
  status: 'available' | 'rented' | 'reserved' | 'maintenance';
  branch: string;
  image: string;
  images?: string[];
  model3dUrl?: string;
  rating: number;
  ratings?: GownRating[];
}

interface GownDetailsModalProps {
  gown: GownDetails;
  isAdmin: boolean;
  onClose: () => void;
  onBookRental: (gownId: string) => void;
  onScheduleFitting: (gownId: string) => void;
  onAdminPreview?: () => void;
}

export function GownDetailsModal({
  gown,
  isAdmin,
  onClose,
  onBookRental,
  onScheduleFitting,
  onAdminPreview,
}: GownDetailsModalProps) {
  useEffect(() => {
    const ModelViewer = customElements.get('model-viewer') as
      | { minimumRenderScale?: number; powerPreference?: 'high-performance' | 'low-power' | 'default' }
      | undefined;

    if (ModelViewer) {
      ModelViewer.minimumRenderScale = 1;
      ModelViewer.powerPreference = 'high-performance';
    }
  }, []);

  const modalRef = useRef<HTMLDivElement>(null);
  const [isRatingsPanelOpen, setIsRatingsPanelOpen] = useState(false);
  const galleryImages = useMemo(() => {
    const normalized = [
      String(gown.image || '').trim(),
      ...(Array.isArray(gown.images) ? gown.images : []).map((entry) => String(entry || '').trim()),
    ].filter(Boolean);

    return normalized.filter((entry, index) => normalized.indexOf(entry) === index);
  }, [gown.image, gown.images]);
  const [selectedImage, setSelectedImage] = useState(() => String(gown.image || '').trim());
  const [isShowing3D, setIsShowing3D] = useState(false);
  const statusLabel = gown.status === 'rented'
    ? 'Unavailable'
    : gown.status.charAt(0).toUpperCase() + gown.status.slice(1);
  const selectedImageIndex = useMemo(() => {
    const currentIndex = galleryImages.findIndex((entry) => entry === (selectedImage || gown.image));
    return currentIndex >= 0 ? currentIndex : 0;
  }, [galleryImages, gown.image, selectedImage]);
  const [resolvedModel3dUrl, setResolvedModel3dUrl] = useState(() => String(gown.model3dUrl || '').trim());
  const [isResolvingModel3dUrl, setIsResolvingModel3dUrl] = useState(false);
  const model3dUrl = String(resolvedModel3dUrl || gown.model3dUrl || '').trim();

  const displayRatings = useMemo(() => {
    return Array.isArray(gown.ratings)
      ? gown.ratings
          .map((entry) => ({
            reviewerName: String(entry?.reviewerName || '').trim() || 'Anonymous Customer',
            score: Number(entry?.score || 0),
            comment: String(entry?.comment || '').trim(),
            createdAt: entry?.createdAt,
          }))
          .filter((entry) => Number.isFinite(entry.score) && entry.score > 0)
      : [];
  }, [gown.ratings]);

  const averageRating = useMemo(() => {
    if (displayRatings.length === 0) {
      return 0;
    }

    const total = displayRatings.reduce((sum, entry) => sum + entry.score, 0);
    return Number((total / displayRatings.length).toFixed(1));
  }, [displayRatings]);

  useEffect(() => {
    setIsRatingsPanelOpen(false);
  }, [gown.id]);

  useEffect(() => {
    setSelectedImage(galleryImages[0] || String(gown.image || '').trim());
    setIsShowing3D(false);
  }, [galleryImages, gown.id, gown.image]);

  useEffect(() => {
    setResolvedModel3dUrl(String(gown.model3dUrl || '').trim());
  }, [gown.id, gown.model3dUrl]);

  const findMatchingModel3dUrl = (items: Array<{ id: string; name?: string; image?: string; images?: string[]; model3dUrl?: string }>) => {
    const currentGallerySet = new Set(galleryImages.map((entry) => entry.trim()).filter(Boolean));
    const matchedItem = items.find((item) => {
      const itemModelUrl = String(item.model3dUrl || '').trim();
      if (!itemModelUrl) {
        return false;
      }

      if (item.id === gown.id) {
        return true;
      }

      const itemImages = [
        String(item.image || '').trim(),
        ...(Array.isArray(item.images) ? item.images : []).map((entry) => String(entry || '').trim()),
      ].filter(Boolean);

      if (itemImages.some((entry) => currentGallerySet.has(entry))) {
        return true;
      }

      return String(item.name || '').trim().toLowerCase() === String(gown.name || '').trim().toLowerCase()
        && itemImages.length > 0
        && galleryImages.length > 0;
    });

    return String(matchedItem?.model3dUrl || '').trim();
  };

  useEffect(() => {
    if (String(gown.model3dUrl || '').trim()) {
      return;
    }

    let isActive = true;
    setIsResolvingModel3dUrl(true);

    void (async () => {
      try {
        const items = await getPublicInventory();
        const nextModelUrl = findMatchingModel3dUrl(items);

        if (isActive && nextModelUrl) {
          setResolvedModel3dUrl(nextModelUrl);
        }
      } catch {
        // Leave the 3D button hidden if the live lookup fails.
      } finally {
        if (isActive) {
          setIsResolvingModel3dUrl(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [galleryImages, gown.id, gown.model3dUrl, gown.name]);

  const showPreviousImage = () => {
    if (galleryImages.length <= 1) {
      return;
    }

    setIsShowing3D(false);
    const nextIndex = (selectedImageIndex - 1 + galleryImages.length) % galleryImages.length;
    setSelectedImage(galleryImages[nextIndex]);
  };

  const showNextImage = () => {
    if (galleryImages.length <= 1) {
      return;
    }

    setIsShowing3D(false);
    const nextIndex = (selectedImageIndex + 1) % galleryImages.length;
    setSelectedImage(galleryImages[nextIndex]);
  };

  const handleViewIn3D = async () => {
    if (model3dUrl) {
      setIsShowing3D((current) => !current);
      return;
    }

    setIsResolvingModel3dUrl(true);
    try {
      const items = await getPublicInventory();
      const nextModelUrl = findMatchingModel3dUrl(items);
      if (nextModelUrl) {
        setResolvedModel3dUrl(nextModelUrl);
        setIsShowing3D(true);
        return;
      }

      window.alert('3D view is not available for this gown yet.');
    } finally {
      setIsResolvingModel3dUrl(false);
    }
  };

  useModalInteractionLock(true, modalRef);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`flex w-full justify-center ${isRatingsPanelOpen ? 'max-w-[84rem] flex-col gap-4 md:flex-row md:items-stretch md:gap-6' : 'max-w-4xl items-center'}`}
        onClick={(event) => event.stopPropagation()}
      >
        {isRatingsPanelOpen && (
          <div
            className="h-[90vh] shrink-0 overflow-hidden bg-white shadow-2xl"
            style={{
              flex: '0 0 750px',
              width: '750px',
              minWidth: '750px',
              maxWidth: '750px',
            }}
          >
            <aside className="flex h-full w-full flex-col overflow-hidden bg-[#FCFAF5]">
                <div className="flex items-start justify-between border-b border-[#E8DCC8] px-8 py-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[#8A7A68]">Customer Ratings</p>
                    <h3 className="mt-3 font-serif text-3xl text-[#1a1a1a]">{gown.name}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRatingsPanelOpen(false)}
                    className="rounded-full border border-[#E8DCC8] p-2 text-[#6B5D4F] transition-colors hover:border-[#1a1a1a] hover:text-[#1a1a1a]"
                    aria-label="Close ratings"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="border-b border-[#E8DCC8] px-8 py-6">
                  <div className="flex items-center gap-4">
                    <span className="font-serif text-5xl text-[#1a1a1a]">{averageRating.toFixed(1)}</span>
                    <div className="flex items-center gap-2 text-[#D4AF37]">
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star
                          key={index}
                          className={`h-6 w-6 ${index < Math.round(averageRating) ? 'fill-current' : ''}`}
                        />
                      ))}
                    </div>
                    <div className="pb-1 text-sm text-[#6B5D4F]">
                      {displayRatings.length} {displayRatings.length === 1 ? 'rating' : 'ratings'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 overflow-y-auto px-8 pb-7 pt-10">
                  {displayRatings.length > 0 ? (
                    <div className="w-full">
                      {displayRatings.map((entry, index) => {
                        const ratingDate = entry.createdAt
                          ? new Date(entry.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Recent feedback';

                        return (
                          <article
                            key={`${entry.reviewerName}-${entry.score}-${entry.createdAt || index}`}
                            className="rounded-[1.6rem] border border-[#E8DCC8] bg-white px-6 py-5 shadow-sm"
                            style={{ marginTop: index === 0 ? 16 : 10 }}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 pt-2">
                                <h4 className="text-lg font-medium leading-none text-[#1a1a1a]">{entry.reviewerName}</h4>
                                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#8A7A68]">{ratingDate}</p>
                              </div>
                              <div className="mt-2 shrink-0 rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2">
                                <div className="flex items-center gap-1 text-[#D4AF37]">
                                  {Array.from({ length: 5 }, (_, starIndex) => (
                                    <Star
                                      key={starIndex}
                                      className={`h-4 w-4 ${starIndex < Math.round(entry.score) ? 'fill-current' : ''}`}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="mt-4 rounded-2xl bg-[#FCFAF5] px-5 py-4">
                              <p className="text-[15px] leading-7 text-[#6B5D4F]">
                                {entry.comment || 'Customer left a star rating for this gown.'}
                              </p>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 flex min-h-[8.5rem] w-full flex-1 items-center justify-center rounded-2xl bg-white px-8 py-8 text-center text-sm leading-7 text-[#6B5D4F]">
                      No individual customer ratings have been saved for this gown yet.
                    </div>
                  )}
                </div>
              </aside>
          </div>
        )}

        <div
          ref={modalRef}
          tabIndex={-1}
          className="bg-white h-[90vh] w-full max-w-4xl overflow-hidden"
        >
        <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="grid md:grid-cols-2">
              <div className={`bg-[#F5F1E8] ${isShowing3D ? 'p-4 md:p-5' : 'p-4 md:p-0'} ${isShowing3D ? 'flex min-h-full flex-col' : ''}`}>
                <div className={`relative overflow-hidden bg-[#F5F1E8] ${isShowing3D ? 'h-full min-h-[32rem] rounded-[28px]' : 'aspect-[3/4]'}`}>
                  {isShowing3D && model3dUrl ? (
                    <model-viewer
                      src={model3dUrl}
                      alt={`${gown.name} 3D view`}
                      loading="eager"
                      camera-controls
                      camera-orbit="180deg 90deg auto"
                      disable-pan
                      min-camera-orbit="auto 90deg auto"
                      max-camera-orbit="auto 90deg auto"
                      interaction-prompt="none"
                      touch-action="pan-y"
                      interpolation-decay="25"
                      environment-image="neutral"
                      tone-mapping="neutral"
                      shadow-intensity="1"
                      exposure="1"
                      disable-zoom
                      style={{
                        width: '100%',
                        height: '100%',
                        background: 'radial-gradient(circle at center, #7a7a7a 0%, #575757 38%, #343434 68%, #1f1f1f 100%)',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <ImageWithFallback
                      src={selectedImage || gown.image}
                      alt={gown.name}
                      className="h-full w-full object-cover"
                    />
                  )}

                  {!isShowing3D && galleryImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={showPreviousImage}
                        className="absolute left-4 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1a1a1a] shadow-sm transition-colors hover:bg-white"
                        aria-label={`Show previous image for ${gown.name}`}
                      >
                        <ChevronLeft className="h-7 w-7" />
                      </button>
                      <button
                        type="button"
                        onClick={showNextImage}
                        className="absolute right-4 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1a1a1a] shadow-sm transition-colors hover:bg-white"
                        aria-label={`Show next image for ${gown.name}`}
                      >
                        <ChevronRight className="h-7 w-7" />
                      </button>
                    </>
                  )}

                  {model3dUrl && (
                    <button
                      type="button"
                      onClick={() => void handleViewIn3D()}
                      aria-label="View this gown in 3D"
                      title={isShowing3D ? 'Back to images' : 'View in 3D'}
                      style={{
                        position: 'absolute',
                        right: 16,
                        bottom: 16,
                        zIndex: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 48,
                        padding: '0 18px',
                        borderRadius: 9999,
                        border: 'none',
                        background: 'rgba(255, 255, 255, 0.96)',
                        color: '#1a1a1a',
                        fontSize: 14,
                        fontWeight: 600,
                        lineHeight: 1,
                        boxShadow: '0 10px 24px rgba(26, 26, 26, 0.16)',
                        cursor: 'pointer',
                      }}
                    >
                      {isShowing3D ? 'Back to images' : 'View in 3D'}
                    </button>
                  )}
                </div>

                {!isShowing3D && galleryImages.length > 1 && (
                  <div className="mt-4 flex flex-nowrap gap-3 overflow-x-auto pb-1 md:px-4 md:pb-4">
                    {galleryImages.map((imageUrl, index) => {
                      const isActive = imageUrl === (selectedImage || gown.image);

                      return (
                        <button
                          key={`${imageUrl}-${index}`}
                          type="button"
                          onClick={() => {
                            setIsShowing3D(false);
                            setSelectedImage(imageUrl);
                          }}
                          className={`h-20 w-16 shrink-0 overflow-hidden border transition-colors ${isActive ? 'border-[#1a1a1a]' : 'border-[#E8DCC8] hover:border-[#8A7A68]'}`}
                          aria-label={`Show image ${index + 1} for ${gown.name}`}
                        >
                          <ImageWithFallback
                            src={imageUrl}
                            alt={`${gown.name} view ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-8 md:p-12">
                <div className="mb-4 flex w-full items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsRatingsPanelOpen((current) => !current)}
                className="flex items-center rounded-full border border-transparent px-2 py-1 transition-colors hover:border-[#E8DCC8] hover:bg-[#FAF7F0]"
                aria-label={`Show ratings for ${gown.name}`}
              >
                <Star className="w-4 h-4 fill-[#D4AF37] text-[#D4AF37]" />
                <span className="text-sm text-[#6B5D4F] ml-1">{averageRating.toFixed(1)}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsRatingsPanelOpen(true)}
                className="rounded-full border border-[#E8DCC8] px-4 py-2 text-sm text-[#6B5D4F] transition-colors hover:border-[#1a1a1a] hover:text-[#1a1a1a]"
              >
                View Reviews
              </button>
                </div>

                <h2 className="font-serif text-4xl mb-2">{gown.name}</h2>
                <p className="mb-4 text-xs uppercase tracking-wider text-[#6B5D4F]">{gown.category}</p>

                <div className="mb-6">
                  <div className="text-xs text-[#6B5D4F] uppercase tracking-wider mb-2">Rental Price</div>
                  <div className="font-serif text-4xl mb-1">₱{gown.price.toLocaleString()}</div>
                  <div className="text-sm text-[#6B5D4F]">per day</div>
                </div>

                <div className="space-y-4 mb-8 pb-8 border-b border-[#E8DCC8]">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-[#6B5D4F]">Color:</span>
                    <span className="ml-2 text-[#1a1a1a]">{gown.color}</span>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-[#6B5D4F]">Location:</span>
                    <div className="flex items-center gap-2 mt-1">
                      <MapPin className="w-4 h-4 text-[#6B5D4F]" />
                      <span className="text-[#1a1a1a]">{gown.branch}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-[#6B5D4F]">Status:</span>
                    <span
                      className={`ml-2 px-3 py-1 text-xs uppercase tracking-wider ${
                        gown.status === 'available'
                          ? 'bg-green-100 text-green-800'
                          : gown.status === 'rented'
                            ? 'bg-[#6B5D4F] text-white'
                            : gown.status === 'maintenance'
                              ? 'bg-amber-100 text-amber-800'
                            : 'bg-[#D4AF37] text-white'
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                </div>

                {isAdmin ? (
                  <div className="rounded-2xl border border-[#E8DCC8] bg-[#FAF7F0] px-4 py-4 text-sm text-[#6B5D4F]">
                    Inventory preview only. Customer booking and fitting actions are disabled in admin view.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {gown.status === 'available' && (
                      <>
                        <button
                          onClick={() => {
                            if (isAdmin) {
                              onAdminPreview?.();
                            } else {
                              onBookRental(gown.id);
                            }
                          }}
                          className="w-full py-4 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-colors flex items-center justify-center gap-2"
                        >
                          <Calendar className="w-5 h-5" />
                          <span>Book This Gown</span>
                        </button>
                        <button
                          onClick={() => {
                            if (isAdmin) {
                              onAdminPreview?.();
                            } else {
                              onScheduleFitting(gown.id);
                            }
                          }}
                          className="w-full py-4 border border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all"
                        >
                          Schedule Fitting
                        </button>
                      </>
                    )}

                    {gown.status !== 'available' && (
                      <button
                        onClick={() => onScheduleFitting(gown.id)}
                        className="w-full py-4 bg-[#1a1a1a] text-white hover:bg-[#D4AF37] transition-colors"
                      >
                        Get Notified When Available
                      </button>
                    )}
                  </div>
                )}

                <button
                  onClick={onClose}
                  className="w-full mt-4 py-3 border border-[#1a1a1a] text-sm text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all"
                >
                  Close
                </button>
                </div>
            </div>
        </div>
      </div>
      </div>
    </div>
  );
}