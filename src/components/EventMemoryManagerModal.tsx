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
      // 1. Try restoring from draft if user was editing before switching tabs/windows
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

      // 2. If no draft, load from saved event.memory_media
      if (!restoredFromDraft) {
        const media = event.memory_media;
        setPhotos(media?.photos || []);
        setYoutubeUrl(media?.youtube_url || '');
        setInstagramUrl(media?.instagram_url || '');
      }
      setErrorMsg(null);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, draftKey]);

  // Auto-save unsaved working draft so switching tabs or windows NEVER loses data
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
      // Reset input value so same files can be re-selected if needed
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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          backgroundColor: '#0f172a',
          borderRadius: '18px',
          border: '1.5px solid rgba(245, 158, 11, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#1e293b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>📸</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                Event Media &amp; Memories
              </h2>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                Curate up to {MAX_MEMORY_PHOTOS} photos and social video highlights for {event.event_name}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: '999px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.2rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {errorMsg && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#f87171',
                fontSize: '0.84rem',
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          {/* 1. Photos Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>
                Event Photos ({photos.length} / {MAX_MEMORY_PHOTOS})
              </label>

              {photos.length < MAX_MEMORY_PHOTOS && (
                <label
                  htmlFor="memory-photo-upload-input"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    minHeight: '40px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#fbbf24',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                  }}
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
              style={{ display: 'none' }}
            />

            {isUploading && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#93c5fd',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>⏳</span>
                <span>{uploadProgressText}</span>
              </div>
            )}

            {/* Photos Thumbnail Grid */}
            {photos.length === 0 ? (
              <div
                style={{
                  padding: '30px 16px',
                  textAlign: 'center',
                  backgroundColor: '#0c1322',
                  borderRadius: '12px',
                  border: '1px dashed rgba(255, 255, 255, 0.15)',
                  color: '#94a3b8',
                  fontSize: '0.85rem',
                }}
              >
                No photos uploaded yet. Click <strong>+ Add Photos</strong> to select up to {MAX_MEMORY_PHOTOS} memorable reunion pictures.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))',
                  gap: '10px',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  padding: '4px',
                  backgroundColor: '#0c1322',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                {photos.map((url, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'relative',
                      aspectRatio: '1/1',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      backgroundColor: '#1e293b',
                    }}
                  >
                    <img
                      src={url}
                      alt={`Upload ${idx + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(idx)}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '999px',
                        backgroundColor: 'rgba(239, 68, 68, 0.85)',
                        border: 'none',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
              🎬 YouTube Highlights Video URL
            </label>
            <input
              type="url"
              placeholder="e.g. https://www.youtube.com/watch?v=... or https://youtu.be/..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: '#1e293b',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#f8fafc',
                fontSize: '0.88rem',
              }}
            />
            {embedPreviewUrl && (
              <span style={{ fontSize: '0.74rem', color: '#34d399' }}>
                ✓ Valid YouTube video link recognized
              </span>
            )}
          </div>

          {/* 3. Instagram Link */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
              📷 Instagram Album / Reels URL
            </label>
            <input
              type="url"
              placeholder="e.g. https://www.instagram.com/p/... or alumni page link"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: '#1e293b',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#f8fafc',
                fontSize: '0.88rem',
              }}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: '#1e293b',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isUploading}
            style={{
              padding: '10px 16px',
              minHeight: '44px',
              borderRadius: '8px',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#cbd5e1',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isUploading}
            style={{
              padding: '10px 24px',
              minHeight: '44px',
              borderRadius: '8px',
              backgroundColor: '#f59e0b',
              border: 'none',
              color: '#000',
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: isSaving || isUploading ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 10px rgba(245, 158, 11, 0.3)',
            }}
          >
            {isSaving ? 'Saving...' : 'Save Media & Memories'}
          </button>
        </div>
      </div>
    </div>
  );
};

