import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { ECKEvent } from '../types';
import { shufflePhotos } from '../lib/memories';

interface EventMemoryWallProps {
  event: ECKEvent;
}

interface FlashTile {
  id: number;
  photoUrl: string;
  isFlashing: boolean;
  motionType: 'zoom-in' | 'zoom-out' | 'pan';
}

export const EventMemoryWall: React.FC<EventMemoryWallProps> = ({ event }) => {
  const memoryMedia = event.memory_media;
  const rawPhotos = memoryMedia?.photos || [];
  const youtubeUrl = memoryMedia?.youtube_url;
  const instagramUrl = memoryMedia?.instagram_url;

  // Stable shuffled photo pool
  const rawPhotosKey = rawPhotos.join('|');
  const photos = useMemo(() => {
    return rawPhotos.length > 0 ? shufflePhotos(rawPhotos) : [];
  }, [rawPhotosKey]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showFullGrid, setShowFullGrid] = useState<boolean>(false);

  // 3-Photo Flash Stage State
  const [flashTiles, setFlashTiles] = useState<FlashTile[]>(() => {
    if (photos.length === 0) return [];
    return [
      { id: 0, photoUrl: photos[0], isFlashing: false, motionType: 'zoom-in' },
      { id: 1, photoUrl: photos[1 % photos.length], isFlashing: false, motionType: 'zoom-out' },
      { id: 2, photoUrl: photos[2 % photos.length], isFlashing: false, motionType: 'pan' },
    ];
  });

  const flashTilesRef = useRef<FlashTile[]>(flashTiles);
  flashTilesRef.current = flashTiles;

  // Pick a fresh random photo not currently in the flash tiles
  const getNextPhoto = useCallback((tileIndex: number): string => {
    if (photos.length === 0) return '';
    if (photos.length === 1) return photos[0];

    const currentVisible = new Set(flashTilesRef.current.map((t) => t.photoUrl));
    const currentForTile = flashTilesRef.current[tileIndex]?.photoUrl;

    const available = photos.filter((p) => p !== currentForTile && !currentVisible.has(p));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }

    const fallback = photos.filter((p) => p !== currentForTile);
    if (fallback.length > 0) {
      return fallback[Math.floor(Math.random() * fallback.length)];
    }

    return photos[Math.floor(Math.random() * photos.length)];
  }, [photos]);

  // Flash & swap an individual tile with camera shutter effect
  const flashTile = useCallback((tileIndex: number) => {
    if (photos.length <= 1) return;

    // Trigger flash burst
    setFlashTiles((prev) =>
      prev.map((t, i) => (i === tileIndex ? { ...t, isFlashing: true } : t))
    );

    // Mid-flash: swap photo
    setTimeout(() => {
      const nextPhoto = getNextPhoto(tileIndex);
      setFlashTiles((prev) =>
        prev.map((t, i) =>
          i === tileIndex
            ? {
              ...t,
              photoUrl: nextPhoto,
              isFlashing: false,
            }
            : t
        )
      );
    }, 200);
  }, [photos.length, getNextPhoto]);

  // Flash all tiles on demand
  const triggerAllFlash = useCallback(() => {
    if (photos.length <= 1) return;
    setFlashTiles((prev) => prev.map((t) => ({ ...t, isFlashing: true })));

    setTimeout(() => {
      const shuffled = shufflePhotos(photos);
      setFlashTiles((prev) =>
        prev.map((t, i) => ({
          ...t,
          photoUrl: shuffled[i % shuffled.length],
          isFlashing: false,
        }))
      );
    }, 220);
  }, [photos]);

  // Staggered flash interval for tiles
  useEffect(() => {
    if (!isPlaying || lightboxIndex !== null || showFullGrid || photos.length <= 1) {
      return;
    }

    const intervals = [3900, 4800, 4300];
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    flashTiles.forEach((_, idx) => {
      const initialDelay = 1200 + idx * 1400;
      const initialTimer = setTimeout(() => {
        flashTile(idx);
        const recurring = setInterval(() => {
          flashTile(idx);
        }, intervals[idx % intervals.length]);
        timers.push(recurring);
      }, initialDelay);
      timers.push(initialTimer);
    });

    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [isPlaying, lightboxIndex, showFullGrid, photos.length, flashTiles.length, flashTile]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null && prev < photos.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : photos.length - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, photos.length]);

  const openLightboxByUrl = (url: string) => {
    const idx = photos.indexOf(url);
    setLightboxIndex(idx !== -1 ? idx : 0);
  };

  // If no photos and no media links, keep section hidden
    if (photos.length === 0 && !youtubeUrl && !instagramUrl) {
      return null;
    }

    // Double/Triple photo list for seamless infinite loop marquee (1 continuous stream)
    const marqueeRow = photos.length > 0 ? [...photos, ...photos, ...photos] : [];

    return (
      <section id="event-memories" className="memory-flash-section">
        {/* Top Header & Minimalist Controls */}
        <div className="memory-flash-header">
          <div className="memory-flash-title-wrap">
            <h2 className="memory-flash-title">
              <span>Photo Wall</span> • {event.event_name}
            </h2>
          </div>

          <div className="memory-flash-actions">
            {photos.length > 0 && (
              <>
                {!showFullGrid && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsPlaying((p) => !p)}
                      className="memory-flash-btn"
                      title={isPlaying ? 'Pause photo motion' : 'Resume photo motion'}
                    >
                      <span>{isPlaying ? '⏸️' : '▶️'}</span>
                      <span>{isPlaying ? 'Pause' : 'Play'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={triggerAllFlash}
                      className="memory-flash-btn"
                      title="Trigger camera shutter flash on all photos"
                    >
                      <span>⚡</span>
                      <span>Flash</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setShowFullGrid((g) => !g)}
                  className={`memory-flash-btn ${showFullGrid ? 'active' : ''}`}
                  title="Toggle between moving stream and full gallery grid"
                >
                  <span>{showFullGrid ? '🌊 Live Stream' : `🖼️ All (${photos.length})`}</span>
                </button>
              </>
            )}

            {youtubeUrl && (
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="memory-flash-btn"
                style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                }}
                title="Watch video highlights on YouTube"
              >
                <span>▶️ YouTube ↗</span>
              </a>
            )}

            {instagramUrl && (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="memory-flash-btn"
                style={{
                  background: 'linear-gradient(45deg, #f09433 0%, #dc2743 50%, #bc1888 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                }}
                title="Open Instagram album"
              >
                <span>📷 Instagram ↗</span>
              </a>
            )}
          </div>
        </div>

        {/* VIEW 1: Flashy Moving Stream (Dynamic Center Stage + Sliding Ribbon) */}
        {photos.length > 0 && !showFullGrid && (
          <div>
            {/* Dynamic 3-Photo Flash Stage (Zoom-In, Zoom-Out, Camera Shutter Flash) */}
            <div className="memory-flash-stage">
              {flashTiles.map((tile, i) => {
                const isCenterHero = i === 1;
                const motionClass =
                  tile.motionType === 'zoom-in'
                    ? 'zoom-in-motion'
                    : tile.motionType === 'zoom-out'
                      ? 'zoom-out-motion'
                      : 'pan-motion';

                return (
                  <div
                    key={tile.id}
                    onClick={() => openLightboxByUrl(tile.photoUrl)}
                    className={`memory-flash-frame ${isCenterHero ? 'hero-frame' : ''}`}
                  >
                    {/* Camera Shutter Flash Burst Overlay */}
                    <div
                      className={`camera-shutter-flash ${tile.isFlashing ? 'flashing' : ''}`}
                    />

                    {/* Image with continuous Ken Burns motion */}
                    <div className="memory-flash-img-wrap">
                      <img
                        src={tile.photoUrl}
                        alt={`Moment ${tile.id + 1}`}
                        className={`memory-flash-img ${isPlaying ? motionClass : ''}`}
                        loading="lazy"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Continuous Infinite Moving Photo Ribbon (Single Stream) */}
            {marqueeRow.length > 0 && (
              <div className="memory-marquee-wrapper">
                <div
                  className="memory-marquee-track slide-left-track"
                  style={{
                    animationPlayState: isPlaying ? 'running' : 'paused',
                  }}
                >
                  {marqueeRow.map((photoUrl, idx) => (
                    <div
                      key={`marquee-${idx}`}
                      onClick={() => openLightboxByUrl(photoUrl)}
                      className="marquee-photo-card"
                    >
                      <img src={photoUrl} alt="Moment" loading="lazy" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: Full Browseable Static Grid (When toggled) */}
        {photos.length > 0 && showFullGrid && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '12px',
              marginTop: '10px',
            }}
          >
            {photos.map((photoUrl, idx) => (
              <div
                key={idx}
                onClick={() => setLightboxIndex(idx)}
                style={{
                  position: 'relative',
                  aspectRatio: idx % 7 === 0 ? '4/3' : '1/1',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: '#1e293b',
                  transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                }}
                className="memory-photo-item"
              >
                <img
                  src={photoUrl}
                  alt={`Photo ${idx + 1}`}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    transition: 'transform 0.25s ease',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 40%)',
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Fullscreen Interactive Lightbox */}
        {lightboxIndex !== null && photos[lightboxIndex] && (
          <div
            onClick={() => setLightboxIndex(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              backgroundColor: 'rgba(0, 0, 0, 0.94)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              backdropFilter: 'blur(10px)',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                maxWidth: '92vw',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {/* Top Bar with Counter and Close */}
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                  color: '#cbd5e1',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                <span>
                  📸 {lightboxIndex + 1} / {photos.length}
                </span>
                <button
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  style={{
                    minHeight: '44px',
                    minWidth: '44px',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '1.25rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label="Close photo preview"
                >
                  ✕
                </button>
              </div>

              {/* Active Image */}
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={photos[lightboxIndex]}
                  alt={`Photo ${lightboxIndex + 1}`}
                  style={{
                    maxWidth: '90vw',
                    maxHeight: '80vh',
                    objectFit: 'contain',
                    borderRadius: '12px',
                    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)',
                  }}
                />

                {/* Prev Button */}
                {photos.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) =>
                        prev !== null && prev > 0 ? prev - 1 : photos.length - 1
                      );
                    }}
                    style={{
                      position: 'absolute',
                      left: '10px',
                      minWidth: '44px',
                      minHeight: '44px',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      color: '#ffffff',
                      fontSize: '1.4rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-label="Previous photo"
                  >
                    ‹
                  </button>
                )}

                {/* Next Button */}
                {photos.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) =>
                        prev !== null && prev < photos.length - 1 ? prev + 1 : 0
                      );
                    }}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      minWidth: '44px',
                      minHeight: '44px',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      color: '#ffffff',
                      fontSize: '1.4rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-label="Next photo"
                  >
                    ›
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    );
  };
