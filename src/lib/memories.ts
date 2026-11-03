import { supabase } from './supabase';
import type { EventMemoryMedia } from '../types';

export const MAX_MEMORY_PHOTOS = 30;

/**
 * Compresses an event photo in-browser to max 1600px dimension and ~300KB JPEG quality.
 */
export async function compressMemoryPhoto(file: File, maxDimension = 1600, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas 2D context not available'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas blob generation failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a compressed event photo to Supabase storage bucket 'payment-screenshots'
 * under folder `memories/{eventSlug}/`.
 */
export async function uploadMemoryPhoto(
  file: File,
  eventSlug: string = 'deepaura-2k26',
  index: number = 0
): Promise<string> {
  const compressedBlob = await compressMemoryPhoto(file);
  const cleanBase = file.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
  const fileName = `memories/${eventSlug}/mem_${Date.now()}_${index}_${cleanBase}.jpg`;

  const { data, error } = await supabase.storage
    .from('payment-screenshots')
    .upload(fileName, compressedBlob, {
      contentType: 'image/jpeg',
      cacheControl: '31536000', // cache for 1 year
      upsert: true,
    });

  if (error) {
    console.error('[Memory Upload Error]:', error);
    throw error;
  }

  // Generate public URL
  const { data: publicData } = supabase.storage
    .from('payment-screenshots')
    .getPublicUrl(data?.path || fileName);

  return publicData?.publicUrl || fileName;
}

/**
 * Converts various YouTube URL formats to an embeddable URL.
 */
export function getEmbedYouTubeUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const clean = url.trim();

  // Pattern 1: youtu.be/VIDEO_ID
  const shortMatch = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch && shortMatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${shortMatch[1]}`;
  }

  // Pattern 2: youtube.com/watch?v=VIDEO_ID
  const watchMatch = clean.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch && watchMatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${watchMatch[1]}`;
  }

  // Pattern 3: youtube.com/embed/VIDEO_ID
  const embedMatch = clean.match(/youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch && embedMatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${embedMatch[1]}`;
  }

  // Pattern 4: youtube.com/shorts/VIDEO_ID
  const shortsMatch = clean.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch && shortsMatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${shortsMatch[1]}`;
  }

  return null;
}

/**
 * Returns a randomized copy of an array (Fisher-Yates shuffle).
 */
export function shufflePhotos<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Persists memory media data to the Supabase events table.
 */
export async function saveEventMemoryMedia(
  eventId: string,
  memoryMedia: EventMemoryMedia
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('events')
      .update({
        memory_media: memoryMedia,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (error) {
      console.error('[Save Memory Media Error]:', error);
      throw error;
    }
    return true;
  } catch (err) {
    console.error('Failed to save event memory media:', err);
    throw err;
  }
}

