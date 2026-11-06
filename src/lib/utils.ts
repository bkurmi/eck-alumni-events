import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize professional category string, replacing corrupt UTF-8 mojibake (â€¢)
 * or literal bullet (•) with a clean ASCII pipe (|).
 */
export function formatCategory(category?: string | null): string {
  if (!category) return '';
  return category
    .replace(/â€¢/g, ' | ')
    .replace(/\s*•\s*/g, ' | ')
    .replace(/\s*\|\s*/g, ' | ')
    .trim();
}

