import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  allOptionLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  align?: 'left' | 'right';
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id,
  label,
  value,
  onChange,
  options,
  allOptionLabel = 'All',
  placeholder = 'Select option...',
  searchPlaceholder = 'Search options...',
  className = '',
  align = 'left',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Filter options based on typed text
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;

    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q)
    );
  }, [options, searchQuery]);

  // Determine display label for trigger button
  const displayLabel = useMemo(() => {
    if (value === 'ALL' || !value) {
      return allOptionLabel;
    }
    const match = options.find((opt) => opt.value === value);
    return match ? match.label : value;
  }, [value, options, allOptionLabel]);

  const isSelectedActive = value !== 'ALL' && value !== '';

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('ALL');
  };

  return (
    <div className={`relative flex flex-col gap-1.5 w-full ${isOpen ? 'z-30' : 'z-10'} ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </label>
      )}

      {/* Select Box Trigger */}
      <button
        id={id}
        type="button"
        className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition-all cursor-pointer ${
          isSelectedActive
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
            : 'border-slate-800 bg-slate-900/90 text-slate-200 hover:border-slate-700 hover:bg-slate-800/80'
        } ${isOpen ? 'ring-2 ring-amber-500/30 border-amber-500/60' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate" title={displayLabel}>
          {displayLabel || placeholder}
        </span>

        <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
          {isSelectedActive && (
            <span
              role="button"
              tabIndex={0}
              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-amber-500/20 hover:text-amber-300 text-slate-400 transition-colors"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleClear(e as any);
                }
              }}
              title="Reset to All"
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-400' : ''}`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute top-full z-50 mt-1.5 w-full min-w-full sm:min-w-[240px] sm:max-w-[360px] rounded-2xl border border-amber-500/30 bg-slate-900/98 p-2 shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-150 ${
            align === 'right' ? 'left-0 sm:left-auto sm:right-0' : 'left-0'
          }`}
          role="listbox"
        >
          {/* Search Input Box */}
          <div className="relative mb-2 flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-8 text-base text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-2.5 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-white"
                onClick={() => setSearchQuery('')}
                title="Clear text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {/* "All" Option */}
            {!searchQuery.trim() && (
              <button
                type="button"
                className={`flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors cursor-pointer ${
                  value === 'ALL' || !value
                    ? 'bg-amber-500/20 text-amber-300 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
                onClick={() => handleSelect('ALL')}
                role="option"
                aria-selected={value === 'ALL' || !value}
              >
                <span className="truncate">{allOptionLabel}</span>
                {(value === 'ALL' || !value) && <Check className="h-4 w-4 text-amber-400 shrink-0" />}
              </button>
            )}

            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-300 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                    onClick={() => handleSelect(opt.value)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="h-4 w-4 text-amber-400 shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className="py-4 text-center text-xs text-slate-400">
                <span>No options matching "<strong>{searchQuery}</strong>"</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
