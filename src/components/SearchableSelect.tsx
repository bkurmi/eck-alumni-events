import React, { useState, useRef, useEffect, useMemo } from 'react';

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
    <div className={`searchable-select-wrap ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={id} className="filter-label">
          {label}
        </label>
      )}

      {/* Select Box Trigger */}
      <button
        id={id}
        type="button"
        className={`searchable-select-trigger ${isOpen ? 'open' : ''} ${isSelectedActive ? 'has-value' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="trigger-text" title={displayLabel}>
          {displayLabel || placeholder}
        </span>

        <div className="trigger-icons">
          {isSelectedActive && (
            <span
              role="button"
              tabIndex={0}
              className="trigger-clear-btn"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleClear(e as any);
                }
              }}
              title="Reset to All"
              aria-label="Clear filter"
            >
              ✕
            </span>
          )}
          <span className="trigger-arrow">{isOpen ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="searchable-select-menu" role="listbox">
          {/* Search Input Box */}
          <div className="searchable-menu-search">
            <span className="menu-search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              className="searchable-menu-input"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {searchQuery && (
              <button
                type="button"
                className="menu-search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear text"
              >
                ✕
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="searchable-menu-options-list">
            {/* "All" Option */}
            {!searchQuery.trim() && (
              <button
                type="button"
                className={`searchable-option-item ${value === 'ALL' || !value ? 'active' : ''}`}
                onClick={() => handleSelect('ALL')}
                role="option"
                aria-selected={value === 'ALL' || !value}
              >
                <span className="option-label">{allOptionLabel}</span>
                {(value === 'ALL' || !value) && <span className="option-check">✓</span>}
              </button>
            )}

            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`searchable-option-item ${isSelected ? 'active' : ''}`}
                    onClick={() => handleSelect(opt.value)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span className="option-label">{opt.label}</span>
                    {isSelected && <span className="option-check">✓</span>}
                  </button>
                );
              })
            ) : (
              <div className="searchable-empty-options">
                <span>No options matching "<strong>{searchQuery}</strong>"</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

