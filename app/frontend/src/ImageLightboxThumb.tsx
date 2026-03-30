import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  src: string;
  alt: string;
  /** Class on the visible thumbnail `<img>` (e.g. `job-thumb`, `admin-moderation-preview-img`). */
  thumbClassName: string;
  /** Extra classes on the wrapping `<button>` (e.g. `image-lightbox-thumb-btn--stack` for block layout). */
  thumbButtonClassName?: string;
  ariaLabelThumb?: string;
  dialogLabel?: string;
};

/**
 * Click thumbnail to open a full-viewport lightbox (Escape, backdrop, or × to close).
 */
export function ImageLightboxThumb({
  src,
  alt,
  thumbClassName,
  thumbButtonClassName = '',
  ariaLabelThumb = 'View full size image',
  dialogLabel = 'Full size image',
}: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxOpen]);

  const btnClass = ['image-lightbox-thumb-btn', thumbButtonClassName].filter(Boolean).join(' ');

  return (
    <>
      <button
        type="button"
        className={btnClass}
        onClick={() => setLightboxOpen(true)}
        aria-label={ariaLabelThumb}
      >
        <img src={src} alt={alt} className={thumbClassName} />
      </button>
      {lightboxOpen
        ? createPortal(
            <div
              className="image-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={dialogLabel}
              onClick={() => setLightboxOpen(false)}
            >
              <img
                src={src}
                alt={alt}
                className="image-lightbox-img"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                className="image-lightbox-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxOpen(false);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
