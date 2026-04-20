import { Calendar, MapPin, Star } from 'lucide-react';
import { useRef } from 'react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useModalInteractionLock } from '../hooks/useModalInteractionLock';

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
  const statusLabel = gown.status === 'rented'
    ? 'Unavailable'
    : gown.status.charAt(0).toUpperCase() + gown.status.slice(1);

  useModalInteractionLock(true, modalRef);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-white max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid md:grid-cols-2">
          <div className="aspect-[3/4] bg-[#F5F1E8]">
            <ImageWithFallback
              src={gown.image}
              alt={gown.name}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="p-8 md:p-12">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center">
                <Star className="w-4 h-4 fill-[#D4AF37] text-[#D4AF37]" />
                <span className="text-sm text-[#6B5D4F] ml-1">{gown.rating}</span>
              </div>
              <span className="text-xs text-[#6B5D4F]">•</span>
              <span className="text-xs text-[#6B5D4F] uppercase tracking-wider">{gown.category}</span>
            </div>

            <h2 className="font-serif text-4xl mb-4">{gown.name}</h2>

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
              className="w-full mt-4 py-3 text-sm text-[#6B5D4F] hover:text-[#1a1a1a] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}