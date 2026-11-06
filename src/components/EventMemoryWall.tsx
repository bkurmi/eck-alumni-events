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
      <section id="event-memories" className="my-8 px-3.5 sm:px-6 py-6 sm:py-8 rounded-2xl border border-amber-500/30 bg-slate-950/80 shadow-2xl relative overflow-hidden">
        {/* Top Header & Minimalist Controls */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              <span className="bg-gradient-to-r from-amber-300 via-amber-500 to-orange-500 bg-clip-text text-transparent">Photo Wall</span> • {event.event_name}
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {photos.length > 0 && (
              <>
                {!showFullGrid && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsPlaying((p) => !p)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap bg-white/10 hover:bg-amber-500/20 text-slate-100 hover:text-white border border-white/15 hover:border-amber-500/50 active:scale-95"
                      title={isPlaying ? 'Pause photo motion' : 'Resume photo motion'}
                    >
                      <span>{isPlaying ? '⏸️' : '▶️'}</span>
                      <span>{isPlaying ? 'Pause' : 'Play'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={triggerAllFlash}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap bg-white/10 hover:bg-amber-500/20 text-slate-100 hover:text-white border border-white/15 hover:border-amber-500/50 active:scale-95"
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
                  className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                    showFullGrid
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold border border-amber-400 shadow-md shadow-amber-500/30'
                      : 'bg-white/10 hover:bg-amber-500/20 text-slate-100 hover:text-white border border-white/15 hover:border-amber-500/50'
                  }`}
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
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-bold text-white transition-all cursor-pointer whitespace-nowrap bg-gradient-to-r from-red-500 via-red-600 to-red-700 shadow-md shadow-red-600/30 hover:brightness-110 active:scale-95"
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
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-bold text-white transition-all cursor-pointer whitespace-nowrap bg-gradient-to-tr from-amber-500 via-rose-600 to-purple-600 shadow-md shadow-rose-600/30 hover:brightness-110 active:scale-95"
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
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr_1fr] gap-3.5 mb-6">
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
                    className={`relative rounded-2xl overflow-hidden cursor-pointer bg-slate-950 border border-white/10 shadow-xl min-h-[220px] transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:border-amber-400 hover:shadow-lg hover:shadow-amber-500/20 ${
                      isCenterHero
                        ? 'h-[260px] sm:h-[310px] sm:border-amber-500/50 sm:shadow-amber-500/20'
                        : 'h-[220px] sm:h-[240px]'
                    }`}
                  >
                    {/* Camera Shutter Flash Burst Overlay */}
                    <div
                      className={`absolute inset-0 pointer-events-none bg-[radial-gradient(circle,_rgba(255,255,255,0.95)_0%,_rgba(245,158,11,0.6)_60%,_transparent_100%)] opacity-0 z-10 transition-opacity duration-200 ${
                        tile.isFlashing ? 'opacity-90 animate-[shutterPulse_0.35s_ease-out]' : ''
                      }`}
                    />

                    {/* Image with continuous Ken Burns motion */}
                    <div className="w-full h-full relative overflow-hidden">
                      <img
                        src={tile.photoUrl}
                        alt={`Moment ${tile.id + 1}`}
                        className={`w-full h-full object-cover block origin-center transition-opacity duration-350 ${isPlaying ? motionClass : ''}`}
                        loading="lazy"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Continuous Infinite Moving Photo Ribbon (Single Stream) */}
            {marqueeRow.length > 0 && (
              <div className="flex flex-col gap-3 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] py-1">
                <div
                  className="flex gap-3 w-max will-change-transform animate-[marqueeLeft_42s_linear_infinite] hover:[animation-play-state:paused] active:[animation-play-state:paused]"
                  style={{
                    animationPlayState: isPlaying ? 'running' : 'paused',
                  }}
                >
                  {marqueeRow.map((photoUrl, idx) => (
                    <div
                      key={`marquee-${idx}`}
                      onClick={() => openLightboxByUrl(photoUrl)}
                      className="relative shrink-0 w-[clamp(160px,30vw,235px)] h-[clamp(115px,22vw,165px)] rounded-xl overflow-hidden cursor-pointer bg-slate-900 border border-white/15 shadow-md transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:border-amber-500 hover:shadow-lg hover:shadow-amber-500/25"
                    >
                      <img src={photoUrl} alt="Moment" loading="lazy" className="w-full h-full object-cover block transition-transform duration-300 hover:scale-105" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: Full Browseable Static Grid (When toggled) */}
        {photos.length > 0 && showFullGrid && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-3">
            {photos.map((photoUrl, idx) => (
              <div
                key={idx}
                onClick={() => setLightboxIndex(idx)}
                className={`relative rounded-xl overflow-hidden cursor-pointer border border-white/10 bg-slate-800 transition-all duration-200 hover:scale-[1.02] hover:border-amber-500 hover:shadow-lg hover:shadow-amber-500/20 group ${
                  idx % 7 === 0 ? 'aspect-[4/3]' : 'aspect-square'
                }`}
              >
                <img
                  src={photoUrl}
                  alt={`Photo ${idx + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover block transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
              </div>
            ))}
          </div>
        )}

        {/* Fullscreen Interactive Lightbox */}
        {lightboxIndex !== null && photos[lightboxIndex] && (
          <div
            onClick={() => setLightboxIndex(null)}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-[94vw] max-h-[92vh] flex flex-col items-center"
            >
              {/* Top Bar with Counter and Close */}
              <div className="w-full flex items-center justify-between mb-2 text-slate-300 text-xs sm:text-sm font-semibold">
                <span>
                  📸 {lightboxIndex + 1} / {photos.length}
                </span>
                <button
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  className="min-h-[44px] min-w-[44px] rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center text-lg transition-colors cursor-pointer border-0"
                  aria-label="Close photo preview"
                >
                  ✕
                </button>
              </div>

              {/* Active Image */}
              <div className="relative flex items-center justify-center">
                <img
                  src={photos[lightboxIndex]}
                  alt={`Photo ${lightboxIndex + 1}`}
                  className="max-w-[90vw] max-h-[78vh] object-contain rounded-xl shadow-2xl shadow-black"
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
                    className="absolute left-2 min-w-[44px] min-h-[44px] rounded-full bg-black/70 hover:bg-black/90 border border-white/20 text-white text-xl flex items-center justify-center transition-all cursor-pointer"
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
                    className="absolute right-2 min-w-[44px] min-h-[44px] rounded-full bg-black/70 hover:bg-black/90 border border-white/20 text-white text-xl flex items-center justify-center transition-all cursor-pointer"
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
