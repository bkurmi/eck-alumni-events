# Project Instructions & Guidelines

## Mobile-First & Responsive Design Standards

### 1. Mobile-First Philosophy
- **Design & build for mobile viewports first** (360px – 414px width), then progressively enhance for tablet (`md:` 768px) and desktop (`lg:` 1024px+).
- Never assume a desktop resolution or wide viewport.
- Modals, drawers, dropdowns, popups, and dialogs must fit cleanly on small screens without cut-offs or overflow.

### 2. Layout & Spacing Rules
- **No Hardcoded Widths**: Avoid fixed pixel widths (e.g. `width: 600px`, `w-[500px]`). Instead, use fluid widths with constraints: `w-full max-w-md`, percentages, `clamp()`, and `rem`.
- **Zero Body Horizontal Overflow**: Horizontal scrolling on the page body is strictly prohibited. Keep layouts cleanly bounded (`overflow-x-hidden` or container constraints).
- **Tables & Dense Data**: Never render wide static tables directly on mobile. Wrap tables in dedicated scrollable containers (`overflow-x-auto`) or transform tabular rows into vertical card layouts on small screens.
- **Flex & Grid Wrapping**: Always specify wrapping (`flex-wrap`) or responsive grid templates (e.g., `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) when arranging actions, forms, or navigation items.

### 3. Touch Targets & Form Inputs
- **Touch Target Size**: All buttons, icon buttons, tabs, links, and actionable items must have a minimum tap area of at least 44×44px (`min-h-[44px] min-w-[44px]`, with proper padding `p-2.5` to `p-3.5`).
- **Input Font Size**: Text inputs, selects, and textareas must have a font size of at least `16px` (`text-base` in Tailwind or `1rem`) to prevent automatic browser zoom on mobile devices (e.g., iOS Safari).
- **Responsive Padding**: Ensure mobile containers have sufficient horizontal padding (`px-3` to `px-4`) so text and cards do not collide with screen edges.
- **Safe Area Insets**: Account for bottom navigation bars, virtual keyboards, and notch/safe-areas where applicable (`pb-safe` or bottom spacing for fixed action bars).

### 4. Typography & Visual Hierarchy
- Use responsive font sizing (e.g., `text-xl sm:text-2xl md:text-3xl`).
- Maintain legible line-height and adequate contrast across both light and dark themes.
- Truncate or wrap long user names, email addresses, and badge text gracefully (`truncate`, `break-words`, `line-clamp-2`).

### 5. Verification & Testing
- When creating, editing, or validating UI components with browser or preview tools, always test and inspect at mobile screen dimensions (e.g. 375×667 or 390×844) before verifying desktop layouts.
