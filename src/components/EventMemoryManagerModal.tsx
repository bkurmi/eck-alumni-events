import React, { useState, useEffect, useRef } from 'react';
import type { ECKEvent, EventMemoryMedia } from '../types';
import {
  MAX_MEMORY_PHOTOS,
  uploadMemoryPhoto,
  saveEventMemoryMedia,
  getEmbedYouTubeUrl,
} from '../lib/memories';

interface EventMemoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: ECKEvent;
  onSaveSuccess: (updatedMedia: EventMemoryMedia) => void;
}

export const EventMemoryManagerModal: React.FC<EventMemoryManagerModalProps> = ({
  isOpen,
  onClose,
  event,
  onSaveSuccess,
}) => {
  const [photos, setPhotos] = useState<string[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [instagramUrl, setInstagramUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const prevIsOpenRef = useRef(false);
  const draftKey = `eck_media_draft_${event.id}`;

  // Sync initial state ONLY when modal transitions from closed to open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      let restoredFromDraft = false;
      try {
        const savedDraft = sessionStorage.getItem(draftKey);
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (Array.isArray(parsed.photos) || parsed.youtubeUrl || parsed.instagramUrl) {
            setPhotos(parsed.photos || []);
            setYoutubeUrl(parsed.youtubeUrl || '');
            setInstagramUrl(parsed.instagramUrl || '');
            restoredFromDraft = true;
          }
        }
      } catch (_) { }

      if (!restoredFromDraft) {
        const media = event.memory_media;
        setPhotos(media?.photos || []);
        setYoutubeUrl(media?.youtube_url || '');
        setInstagramUrl(media?.instagram_url || '');
      }
      setErrorMsg(null);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, draftKey, event.memory_media]);

  // Auto-save unsaved working draft
  useEffect(() => {
    if (!isOpen) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          photos,
          youtubeUrl,
          instagramUrl,
        })
      );
    } catch (_) { }
  }, [photos, youtubeUrl, instagramUrl, isOpen, draftKey]);

  if (!isOpen) return null;

  // Handle multi-photo file selection & upload
  const handlePhotoFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setErrorMsg(null);

    const availableSlots = MAX_MEMORY_PHOTOS - photos.length;
    if (availableSlots <= 0) {
      setErrorMsg(`Maximum ${MAX_MEMORY_PHOTOS} photos limit reached. Delete some photos before adding new ones.`);
      return;
    }

    const filesToUpload = files.slice(0, availableSlots);
    if (files.length > availableSlots) {
      alert(`Only ${availableSlots} more photo(s) can be added to stay within the ${MAX_MEMORY_PHOTOS} limit.`);
    }

    setIsUploading(true);
    const uploadedUrls: string[] = [];

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        setUploadProgressText(`Compressing & uploading ${i + 1} of ${filesToUpload.length}...`);
        const url = await uploadMemoryPhoto(filesToUpload[i], event.event_slug || 'event', photos.length + i);
        uploadedUrls.push(url);
      }

      setPhotos((prev) => [...prev, ...uploadedUrls]);
    } catch (err: any) {
      console.error('Upload error:', err);
      setErrorMsg('Failed to upload some photos. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      e.target.value = '';
    }
  };

  const handleDeletePhoto = (indexToDelete: number) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== indexToDelete));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);

    const updatedMedia: EventMemoryMedia = {
      photos,
      youtube_url: youtubeUrl.trim() || null,
      instagram_url: instagramUrl.trim() || null,
    };

    try {
      await saveEventMemoryMedia(event.id, updatedMedia);
      try {
        sessionStorage.removeItem(draftKey);
      } catch (_) { }
      onSaveSuccess(updatedMedia);
      onClose();
    } catch (err: any) {
      console.error('Save memory media error:', err);
      setErrorMsg('Failed to save event media: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const embedPreviewUrl = getEmbedYouTubeUrl(youtubeUrl);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-amber-500/30 rounded-2xl flex flex-col shadow-2xl overflow-hidden text-slate-100"
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/80">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="text-2xl">📸</span>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Event Media &amp; Memories
              </h2>
              <p className="text-xs text-slate-400">
                Curate up to {MAX_MEMORY_PHOTOS} photos and social video highlights for {event.event_name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-100">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs sm:text-sm font-medium flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Photos Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-bold text-slate-200">
                Event Photos ({photos.length} / {MAX_MEMORY_PHOTOS})
              </label>

              {photos.length < MAX_MEMORY_PHOTOS && (
                <label
                  htmlFor="memory-photo-upload-input"
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-400 font-bold text-xs sm:text-sm transition-colors ${
                    isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-500/25 cursor-pointer'
                  }`}
                >
                  <span>📷</span>
                  <span>{isUploading ? 'Uploading...' : '+ Add Photos'}</span>
                </label>
              )}
            </div>

            <input
              id="memory-photo-upload-input"
              type="file"
              accept="image/*"
              multiple
              disabled={isUploading || photos.length >= MAX_MEMORY_PHOTOS}
              onChange={handlePhotoFilesSelected}
              className="hidden"
            />

            {isUploading && (
              <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs sm:text-sm flex items-center gap-2 animate-pulse">
                <span>⏳</span>
                <span>{uploadProgressText}</span>
              </div>
            )}

            {/* Photos Thumbnail Grid */}
            {photos.length === 0 ? (
              <div className="p-6 text-center bg-slate-950/60 rounded-xl border border-dashed border-slate-700 text-slate-400 text-xs sm:text-sm">
                No photos uploaded yet. Click <strong className="text-amber-400">+ Add Photos</strong> to select up to {MAX_MEMORY_PHOTOS} memorable reunion pictures.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-64 overflow-y-auto p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                {photos.map((url, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 bg-slate-800 group"
                  >
                    <img
                      src={url}
                      alt={`Upload ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(idx)}
                      className="absolute top-1 right-1 w-7 h-7 rounded-full bg-red-600/90 hover:bg-red-600 text-white font-black text-xs flex items-center justify-center cursor-pointer shadow-md transition-transform hover:scale-110"
                      title="Delete Photo"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. YouTube Video Link */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-bold text-slate-200" htmlFor="youtube-video-url">
              🎬 YouTube Highlights Video URL
            </label>
            <input
              id="youtube-video-url"
              type="url"
              placeholder="e.g. https://www.youtube.com/watch?v=... or https://youtu.be/..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-base text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
            />
            {embedPreviewUrl && (
              <span className="block text-xs text-emerald-400 font-medium">
                ✓ Valid YouTube video link recognized
              </span>
            )}
          </div>

          {/* 3. Instagram Link */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-bold text-slate-200" htmlFor="instagram-album-url">
              📷 Instagram Album / Reels URL
            </label>
            <input
              id="instagram-album-url"
              type="url"
              placeholder="e.g. https://www.instagram.com/p/... or alumni page link"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-base text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-800 bg-slate-800/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isUploading}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-700/60 text-slate-300 font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isUploading}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSaving ? 'Saving...' : 'Save Media & Memories'}
          </button>
        </div>
      </div>
    </div>
  );
};
