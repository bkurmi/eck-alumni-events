# Project Instructions & Guidelines

## Pure Tailwind CSS & Modern Styling Standards

### 1. 100% Tailwind CSS for All UI Development
- **Strict Tailwind Policy**: All frontend and UI development—new pages, components, modals, dialogs, form elements, drawer menus, and bug fixes—MUST be implemented exclusively using pure Tailwind CSS utility classes.
- **Zero Component-Level CSS Files**: Never create component-specific stylesheets (e.g. `ComponentName.css`, `module.css`) or import standalone `.css` files into components.
- **Zero Monolithic CSS Dumping**: Never add component-specific styles or ad-hoc class selectors into `src/index.css`.
- **Allowed Scope of `src/index.css`**: `src/index.css` is strictly reserved for:
  1. Tailwind directives: `@import "tailwindcss";`
  2. Tailwind `@utility` definitions (e.g. `@utility no-scrollbar`, `@utility tab-scrollbar`)
  3. Design system tokens inside `@theme` and shared `:root` CSS variables
  4. Global CSS keyframe animations (e.g. `kenBurns`, `shutterPulse`, `marqueeLeft`, `scanLaser`)
  5. Scoped physical ticket pass print/export rules required by `html-to-image` for pixel-perfect ID card PNG exports in `IdCardPass.tsx`
- **Responsive Prefixes over Custom Media Queries**: Always use Tailwind's built-in responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`) rather than writing manual `@media` queries in CSS.
- **No Inline Style Hacks**: Do not use ad-hoc inline `style={{ ... }}` objects for layout, colors, display, or spacing. Use Tailwind utility classes or arbitrary bracket values (e.g., `min-h-[44px]`, `w-[220px]`).

---

## Mobile-First & Responsive Design Standards

### 1. Mobile-First Philosophy & Architecture
- **Base CSS is 360px by Default**: All base CSS rules must be written for mobile viewports first (360px – 414px width) without media queries. Larger screen enhancements are ONLY permitted inside progressive `@media (min-width: 640px)` or `@media (min-width: 768px)` blocks.
- Never write desktop styles first and attempt to "fix" or shrink them with `max-width` media queries later.
- Modals, drawers, dropdowns, popups, and dialogs must fit cleanly on small screens (360px) without cut-offs, jagged line breaks, or overflow.

### 2. Layout, Spacing & Container Rules
- **No Hardcoded Widths**: Avoid fixed pixel widths (e.g. `width: 600px`, `w-[500px]`). Instead, use fluid widths with constraints: `w-full max-w-md`, percentages, `clamp()`, and `rem`.
- **Zero Body Horizontal Overflow**: Horizontal scrolling on the page body is strictly prohibited. Keep layouts cleanly bounded (`overflow-x-hidden` or container constraints).
- **Mobile Container Padding**: On screens `<640px`, container horizontal padding must not exceed `0.75rem` (12px) to `1rem` (16px). High desktop paddings (`1.5rem–2rem`) steal crucial real estate and crush mobile cards.
- **Tables & Dense Data**: Never render wide static tables directly on mobile. Wrap tables in dedicated scrollable containers (`overflow-x-auto`) or transform tabular rows into vertical card layouts on small screens.
- **Flex & Grid Wrapping**: Always specify wrapping (`flex-wrap`) or responsive grid templates (e.g., `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) when arranging actions, forms, or navigation items.

### 3. No Dual-Label Compression on Mobile (<400px)
- **Forbidden Pattern**: Never pair a long flexible title/name with wide static badges side-by-side in a single row without responsive abbreviation or clean vertical stacking.
- **Responsive Abbreviation**: When badges sit in card headers, render compact variants on mobile (e.g. `'24` on mobile via `.batch-short`, and `Batch of 2024` on desktop via `.batch-full`) or stack them below the title to prevent truncating user names into unreadable ellipses.

### 4. Touch Targets & Form Inputs
- **Touch Target Size**: All buttons, icon buttons, tabs, links, combobox options, and actionable items must have a minimum tap area of at least 44×44px (`min-h-[44px] min-w-[44px]`, with proper padding `p-2.5` to `p-3.5`).
- **Input Font Size**: Text inputs, selects, and textareas must have a font size of at least `16px` (`text-base` in Tailwind or `1rem`) to prevent automatic browser zoom on mobile devices (e.g., iOS Safari).
- **Responsive Padding**: Ensure mobile containers have sufficient horizontal padding (`px-3` to `px-4`) so text and cards do not collide with screen edges.
- **Safe Area Insets**: Account for bottom navigation bars, virtual keyboards, and notch/safe-areas where applicable (`pb-safe` or bottom spacing for fixed action bars).

### 5. Typography & Visual Hierarchy
- Use responsive font sizing (e.g., `text-xl sm:text-2xl md:text-3xl`).
- Maintain legible line-height and adequate contrast across both light and dark themes.
- Truncate or wrap long user names, email addresses, and badge text gracefully (`truncate`, `break-words`, `line-clamp-2`).

### 6. Mandatory Mobile Pre-Completion Verification Checklist
- **Mandatory Reporting in Every UI Response**: Whenever modifying or adding any UI component, page, or CSS, the agent MUST explicitly include a **"Mobile Viewport (360px) Verification"** section in the response confirming:
  1. **360px Width Test**: Verified that cards, headers, and text fit on a 360px viewport without clipping or text collisions.
  2. **Touch Target Test**: Verified that all clickable elements have $\ge$44px height/width.
  3. **Input Font Size Test**: Verified inputs use $\ge$16px font to prevent mobile auto-zoom.
  4. **Progressive Enhancement**: Verified that desktop styles exist only inside `@media (min-width: ...)` blocks.
- **No UI task is complete without this verification.**


---

## Multi-Event Dynamic Architecture Standards

### 1. Zero Hardcoding of Event Identity & Pricing
- **No Hardcoded Slugs or Dates**: Never hardcode `'deepaura-2k26'`, `'2026-11-01'`, or fixed fee amounts in frontend components or SQL queries.
- **Dynamic Configuration**: Always read event properties dynamically from the active event record:
  - `event.event_slug`, `event.event_name`, `event.short_name`, `event.event_date`
  - `event.pricing_config` (single, couple, extra adult, child, spot rates)
  - `event.tagline`, `event.banner_image_url`, `event.theme_primary_color`, `event.theme_accent_color`
- **Short Name Usage**: Use `event.short_name || event.event_name` on ID card stubs, badges, seals, mobile buttons, and feedback headings for concise labeling.

### 2. Strict Event Scoping & Data Isolation
- **Strict Query Filtering**: All data operations—Gate verification, pass lookups, attendee statistics, directory tables, sponsorships, and expenses—MUST be strictly scoped to the active event (`.eq('event_id', activeEvent.id)` or `reg.event_id === activeEvent.id`).
- **Never Mix Registrations**: The Admin registrations directory and summary stat cards must reflect attendees only for the currently selected event edition.
- **Routing**: Each event is accessible via `/events/:slug`. The root path `/` auto-detects and loads the nearest upcoming open event, falling back to the latest edition recap.

### 3. Financial Decoupling & Central Treasury
- **No Hardcoded Coordinator Names or UPIs**: Never hardcode personal coordinator names (e.g., Mukesh, Hari Narayan, Lokesh, Mitesh, Rajeev, etc.), personal phone numbers, or private UPI handles in code.
- **Database-Driven UPI Inflows**: UPI receivers, rotation weights, and QR code image URLs must be loaded directly from `events.upi_rotation_configs` (JSONB) or `events.upi_id`.
- **Database-Driven Expense Accounts**: Expense accounts, bank details, and cash custodians must be retrieved from `events.expense_accounts_config` (JSONB) or recorded transaction splits.
- **Canonical Cash Account**: All physical cash collections and spot entries must map strictly to the canonical account name `'Cash in Hand'`. Genuine UPI transactions must never be categorized as cash.

### 4. Registration Numbering & Backward Compatibility
- **Event-Scoped Sequence**: Registration numbers are generated per event using atomic database counters:
  - DeepAura 2K26 retains prefix `'REG'` (`REG-00001` to `REG-00039` with 5-digit padding) for 100% backward compatibility.
  - Future events use custom prefixes (e.g., `NY27-0001`, `HM27-0001` with 4-digit padding).
- **Flexible Number Lookups**: Lookup inputs must support both bare digits (e.g., `39`) and prefixed numbers (e.g., `REG-00039`, `REG-39`), matching in-memory first for 0ms response.

### 5. Event Lifecycle & Pass Concluded Rules
- **Automatic Concluded Detection**: An event is considered concluded starting the day after the event date in IST (`isEventConcluded(event)`), or when `status === 'CLOSED'` / `'COMPLETED'`.
- **Hide Pass Downloads Post-Event**: The pass download highlight card on the homepage and pass buttons in modals must be completely hidden once an event concludes (matching the closed registration button behavior).
- **Concluded Notice on Direct URL**: Direct access to `/id-card` for a concluded event must display an informative concluded notice directing alumni to event recaps and memory walls.

### 6. Free Tier Safeguards & Zero Data Loss
- **No Destructive DB Changes**: Never drop, rename, or reset tables (`alumni`, `event_registrations`, `payment_verifications`, `expenses`, `sponsorships`). All schema migrations must be strictly additive (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`).
- **Free-Tier Compatibility**: Maintain 100% compatibility with Supabase and Cloudflare Pages free tiers (no paid add-ons, client-side photo compression, minimal bundle size).
- **Build Verification**: Always verify changes by running `npm run build` and checking for zero TypeScript and bundling errors before completing any task.
