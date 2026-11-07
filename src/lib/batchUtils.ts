/**
 * ECK / RTU Kota Batch & Passing Year Mapping Utilities
 *
 * Rules:
 * - Batches start from top: Batch A, Batch B, ..., Batch Z, Batch 2011, Batch 2012, etc.
 * - Single continuous list without any optgroup separations.
 * - Labels everywhere must show pure Batch names: "Batch A", "Batch B", ..., "Batch Z", "Batch 2011".
 * - Pass Out Year dropdown options must be pure years without any "Pass out" prefix (e.g. "1992", "2008").
 * - Pass Out Year is pre-loaded automatically when a Batch is chosen, and can be changed.
 */

export interface BatchOption {
  value: string;
  label: string;
  defaultPassingYear: number;
  category: 'alphabetical' | 'year';
}

/**
 * Returns the canonical Batch name corresponding to a nominal passing year.
 * Used for pre-filling and database migration fallback.
 */
export function getBatchFromPassingYear(year: number | string | null | undefined): string {
  const numYear = Number(year);
  if (!numYear || isNaN(numYear) || numYear < 1950) {
    return '2024';
  }
  if (numYear >= 1985 && numYear <= 2010) {
    return String.fromCharCode(65 + (numYear - 1985)); // 1985 -> 'A', 2010 -> 'Z'
  }
  return String(numYear);
}

/**
 * Returns the default expected passing year for a given Batch.
 * e.g., 'A' -> 1985, 'B' -> 1986, ..., 'Z' -> 2010, '2015' -> 2015.
 */
export function getDefaultPassingYearForBatch(batch: string | null | undefined): number {
  if (!batch) return new Date().getFullYear();
  const trimmed = batch.trim().replace(/^batch\s+/i, '').toUpperCase();

  // Single letter A-Z
  if (trimmed.length === 1 && trimmed >= 'A' && trimmed <= 'Z') {
    return 1985 + (trimmed.charCodeAt(0) - 65);
  }

  // Numbered batch (e.g. "2011", "2018")
  const numeric = parseInt(trimmed, 10);
  if (!isNaN(numeric) && numeric >= 1950 && numeric <= 2050) {
    return numeric;
  }

  return new Date().getFullYear();
}

/**
 * Generates options for Batch selection dropdowns.
 * Starts from top: Batch A, Batch B, ..., Batch Z, Batch 2011, Batch 2012, ...
 * Pure continuous list without optgroups.
 */
export function getAllBatchOptions(): {
  alphabeticalBatches: BatchOption[];
  yearBatches: BatchOption[];
  allBatches: BatchOption[];
} {
  const alphabeticalBatches: BatchOption[] = [];
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    const yr = 1985 + i;
    alphabeticalBatches.push({
      value: letter,
      label: `Batch ${letter}`,
      defaultPassingYear: yr,
      category: 'alphabetical',
    });
  }

  const currentYear = new Date().getFullYear();
  const maxYear = currentYear;
  const yearBatches: BatchOption[] = [];
  // Ascending order: 2011, 2012, 2013, ... up to current year
  for (let yr = 2011; yr <= maxYear; yr++) {
    yearBatches.push({
      value: String(yr),
      label: `Batch ${yr}`,
      defaultPassingYear: yr,
      category: 'year',
    });
  }

  // Starts from top: Batch A, Batch B, ..., Batch Z, then Batch 2011, Batch 2012, ...
  const allBatches = [...alphabeticalBatches, ...yearBatches];

  return { alphabeticalBatches, yearBatches, allBatches };
}

/**
 * Generates array of passing years for the "Pass Out Year" selector.
 * Range: from currentYear down to 1980.
 */
export function getPassingYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear;
  const minYear = 1980;
  const years: number[] = [];
  for (let yr = maxYear; yr >= minYear; yr--) {
    years.push(yr);
  }
  return years;
}

/**
 * Formats a clean Batch display name: "Batch A", "Batch X", "Batch 2024".
 */
export function formatBatchName(
  batch?: string | null,
  year?: number | string | null
): string {
  const numYear = Number(year) || 0;
  let resolvedBatch = (batch && batch.trim() !== '') ? batch.trim() : (numYear ? getBatchFromPassingYear(numYear) : '');
  if (!resolvedBatch) return '—';
  if (/^batch\s+/i.test(resolvedBatch)) {
    return resolvedBatch;
  }
  return `Batch ${resolvedBatch}`;
}

/**
 * Resolves the canonical batch label with "Batch" prefix, e.g. "Batch A", "Batch 2018".
 * Returns empty string if unknown.
 */
export function resolveBatchName(
  batch?: string | null,
  year?: number | string | null
): string {
  const numYear = Number(year) || 0;
  const rawBatch = (batch && batch.trim() !== '')
    ? batch.trim()
    : (numYear ? getBatchFromPassingYear(numYear) : '');
  if (!rawBatch) return '';
  return /^batch\s+/i.test(rawBatch) ? rawBatch : `Batch ${rawBatch}`;
}

/**
 * Returns a sort order for grouping batches chronologically:
 * Batch A (1985), Batch B (1986)... Batch Z (2010), Batch 2011 (2011)...
 * Distinguished/Faculty -> 99999.
 */
export function getBatchSortKey(batchNameOrKey: string): number {
  if (!batchNameOrKey || batchNameOrKey.toLowerCase().includes('distinguished')) {
    return 99999;
  }
  return getDefaultPassingYearForBatch(batchNameOrKey);
}
