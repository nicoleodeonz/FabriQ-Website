import { Calendar, MapPin, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';

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
  const modalRef = useRef<HTMLDivElement>(null);
  const [isRatingsPanelOpen, setIsRatingsPanelOpen] = useState(false);
  const statusLabel = gown.status === 'rented'
    ? 'Unavailable'
    : gown.status.charAt(0).toUpperCase() + gown.status.slice(1);

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
                    <div className="w-full space-y-5">
                      {displayRatings.map((entry, index) => {
                        const ratingDate = entry.createdAt
                          ? new Date(entry.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Recent feedback';

                        return (
                          <article
                            key={`${entry.reviewerName}-${entry.score}-${entry.createdAt || index}`}
                            className={`rounded-[1.6rem] border border-[#E8DCC8] bg-white px-6 py-5 shadow-sm ${index === 0 ? 'mt-4' : ''}`}
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
              <div className="aspect-[3/4] bg-[#F5F1E8]">
            <ImageWithFallback
              src={gown.image}
              alt={gown.name}
              className="w-full h-full object-cover"
            />
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