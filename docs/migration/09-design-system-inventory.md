# 09 — Design System & Shared Components Inventory

Current UI stacks, design tokens, and shared components across the three frontends. There is **no single shared design system today**; each app has its own stack with significant divergence.

## 1. Per-app UI stack

| App | Framework | UI libraries | Styling | State |
|-----|-----------|--------------|---------|-------|
| Consumer (`amealio_web_app`) | CRA / React 18 | MUI v5 (+ lab, icons, x-date-pickers), react-bootstrap/Bootstrap 5, Emotion, Framer Motion, Lucide, Swiper/react-slick, notistack | SCSS (global + route-split), Tailwind (partial), Emotion | Redux Toolkit + redux-persist |
| Admin/Merchant (`amealiodashboardmvp-`) | CRA / React 16 | Material-UI **v4** (+ lab, pickers), reactstrap/react-bootstrap/Bootstrap 4, styled-components, Lucide + Font Awesome, Framer Motion | 70+ per-feature SCSS files | Redux + thunk |
| Delivery (`amealio-self-delivery-app`) | Next.js 15 / React 19 | Tailwind CSS 4, Lucide, sonner, react-hook-form + zod | Tailwind + CSS variables | Zustand + TanStack Query |

## 2. Design tokens (divergent)

| App | Token source | Primary color(s) |
|-----|--------------|------------------|
| Consumer | `V2MainColors.js`, `AmealioColors.js` (V2), legacy `colorsV1`, Tailwind `primaryRed` | navy `#001D51`, blue `#0B82E6` |
| Admin/Merchant | `assets/ConstantsDesigns/AmealioColours.js` | purple `#40299B` + gradients |
| Delivery | CSS variables in `globals.css` | Tailwind-based brand vars |

There are **at least three color systems** in the consumer app alone (V2 colors, legacy colorsV1, Tailwind). No shared token package exists across apps.

## 3. Theming

- **Consumer:** minimal MUI theme (`common/utility/theme.js`); most styling via component-level tokens and route-scoped CSS bundles (`loadOrderingCss`, `loadSeatingCss`, …).
- **Admin/Merchant:** **no global MUI theme** — each screen calls `createTheme`/`MuiThemeProvider` locally (heavy duplication).
- **Delivery:** cohesive Tailwind config with CSS variables (the most modern, consistent approach).

## 4. Shared components (per app)

### Consumer `src/components`
- **V2 reusable set:** `V2NavBar`, `V2RestaurantCard`, `V2Button`, `V2BookingStepper`, `V2AddToCartSection`, `V2TrackerTimeline`, `V2ConfirmArrivalPopup`, `DiscoverSearchDock`, tracker suite.
- **Cross-cutting:** `payments/Razorpay/*`, `locations/mapsetup/*`, `singups/*` (Google/Facebook/Apple), `alerts/*` (NotificationContext, SafeSnackbarProvider), `inputFields/*`, `buttons/*`, `drawers/ReusableDrawer`, `ScreenTemplate`, `DocumentHead`, `BottomNavigationBar`, `MainsideBar`.

### Admin/Merchant `client/src/components/reusableComponents`
- ~172 files: inputs, buttons, tables (seating/pending/reservation), QR export, Twilio call wrapper, delivery-person modals, timers, filters, popups. Mix of `.js`/`.jsx`, class + function components.

### Delivery `components/`
- `components/ui/*` (button, card, skeleton), `components/layout/*` (dashboard shell, offline strip, online-status button), map loaders, incoming-assignment modal.

## 5. Cross-app consistency issues

- **No shared component or token library** — each app reimplements cards, buttons, inputs, modals.
- **Three different MUI/Bootstrap generations** (MUI v4 vs v5; Bootstrap 4 vs 5) plus Tailwind in two apps.
- **Consumer app runs dual UIs** (legacy + V2) for ordering, experiences, and auth simultaneously.
- **Admin/merchant portal** is the most dated (React 16, per-screen themes, ~4,900-line router).
- **Icon libraries mixed** (Lucide + Font Awesome + MUI icons).

## 6. Implications for the target design system

The provided target monorepo includes `packages/ui` and `packages/design-system` (see `docs/architecture/target-repository-structure.md`). The current state argues for:

- A **single token source** (colors, spacing, typography) shared across web/admin/merchant.
- A **shared component library** to replace the three divergent reusable sets.
- Standardizing on one styling approach (the delivery app's Tailwind-based, cohesive model is the closest existing reference).
- Retiring the legacy/V2 duplication in the consumer app.

**`UNKNOWN — REQUIRES REVIEW`:** which brand identity is canonical (consumer navy/blue vs admin purple), and whether any existing component set should be promoted as the seed for `packages/ui`.
