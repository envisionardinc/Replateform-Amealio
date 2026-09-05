# 93 — amealio Frontend Design System Reconciliation

**Status:** CONTRACT + first consumer visual foundation  
**Date:** 2026-09-05  
**Brand:** amealio (always lowercase)  
**Rule:** [00-BEHAVIORAL-RECONCILIATION-RULE.md](./00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Depends on:** [09-design-system-inventory.md](./09-design-system-inventory.md), [92](./domains/92-USER-APP-HOME-PAGE-V2-TARGET-BEHAVIOR-CONTRACT.md)

This is a **visual** reconciliation. Legacy CSS is evidence, not a dump to copy. The first consumer functional slice (`apps/web`) stays; this document is the token and primitive contract that slice must use.

---

## 0. Method

1. **L1** — Recovered tokens and patterns from `amealio_web_app` (`V2MainColors.js`, `AmealioColors.js`, `fonts.scss` / `fontFaces.css`, `global.scss`, `tailwind.config.js`, `manifest.json`, `V2Button`, `V2RestaurantCard`, `BottomNavigationBar`), plus merchant `AmealioColours.js` (`#40299B`). Homepage V2 RAG server is not in this workspace.
2. **L2** — Consumer dining UX: mobile-first, food imagery, 44px targets, skeletons, sticky checkout, bottom nav, filter chips, accessible contrast.
3. **L3** — Matrix. Auto-resolved where amealio identity + usability agree.
4. **L4** — Canonical tokens below. Implemented as CSS variables in `apps/web` (no `packages/ui` yet — FUTURE per docs 06 / 23 / 92).

---

## 1. L1 — Legacy visual reality

### 1.1 Three color systems (already inventoried in doc 09)

| Source                                   | Primary                                 | Where used                                          |
| ---------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| Consumer V2 `AmealioColors` / `V2Colors` | navy `#001D51`, blue `#0B82E6`          | PWA `theme_color`, profile, V2 cards, gradient CTAs |
| Legacy food SCSS / Tailwind              | coral `#fc5a47`, `primaryRed` `#EE3A23` | older ordering / bottom-nav selected                |
| Merchant `AmealioColours.js`             | purple `#40299B`                        | admin/merchant only                                 |

Verified consumer surfaces (manifest, V2 tokens, profile, brand SVGs) converge on **navy + blue**. Coral is an older food-rail leftover. Purple is not the consumer brand.

### 1.2 Typography

- **LEGACY REALITY — Mulish.** The shipped consumer family is Mulish (`fonts.scss` `$fontFamily: Mulish`; `fontFaces.css`). That is forensic fact, not the target.
- Inter (400–500) and Poppins (400–600) already exist as secondary faces in legacy `fontFaces.css`.
- **TARGET — Inter.** The amealio product/design-system family is Inter. Mulish is not a target token and is not an active `apps/web` dependency.
- Type scale is an explosion of utility classes (`f8`…`f36` × 400/500/600/700/800) with a 768px shrink. That is **not** a hierarchy.

### 1.3 Components (verified)

| Pattern         | Legacy                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary button  | V2: 12px radius, 56px height, `linear-gradient(90deg, #0B82E6 → #001D51)` (V2Button file also has a reversed 001D51→0B82E6; token files use blue→navy) |
| Page            | `#F4F5FA`                                                                                                                                              |
| Card            | white, ~12px radius, `0 3px 6px #00000029` / `0 1px 2px rgba(15,23,42,0.05)`                                                                           |
| Restaurant card | image 95×95, 12px radius, 0.5px `#b5b3b359` border                                                                                                     |
| Menu card       | 5px radius (older)                                                                                                                                     |
| Bottom nav      | fixed white bar; V2 active `#0B82E6`; legacy food active `#fc5a47`                                                                                     |
| Search          | white field, `#D1D1D1` / `#8A94A6` border, grey search icon                                                                                            |
| Error           | `#DF031F` / `#B42318` on `#FFF4F4`                                                                                                                     |
| Wordmark        | `AmealioTextLogoColor.svg` + `Amealio_White_Logo.svg`; word **amealio** lowercase; mark is a gradient “A”                                              |

No single shared package. No `packages/ui` in the TurboRepo today.

---

## 2. L2 — Industry (evidence, not branding)

| Practice                         | Use for amealio                                  |
| -------------------------------- | ------------------------------------------------ |
| Mobile-first ordering            | Default layout; desktop is a centered column     |
| Imagery on restaurant/item cards | Placeholder when catalog has no public image API |
| 44×44 touch targets              | Buttons, tab bar, qty steppers                   |
| Skeletons                        | Prefer over a lone spinner                       |
| Sticky checkout CTA              | Cart/checkout primary action stays reachable     |
| Bottom nav for 3–5 destinations  | Home / Cart / Orders on this slice               |
| Filter chips                     | Home 1 Category rail (doc 94)                    |
| Status timeline                  | FUTURE (poll + GET today)                        |
| Contrast ≥ 4.5:1 for text        | Do not use `#8AC926` as text                     |

Do not copy competitor orange/red brand systems.

---

## 3. L3 — Visual gap matrix

| COMPONENT        | LEGACY AMEALIO              | INDUSTRY                        | GAP                               | TARGET                                      | DECISION                                                 |
| ---------------- | --------------------------- | ------------------------------- | --------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| Brand name       | amealio lowercase           | unique lockup                   | none                              | **amealio** lowercase only                  | **PRESERVE**                                             |
| Consumer primary | V2 navy `#001D51`           | —                               | coral + green scaffold compete    | Navy is consumer primary                    | **PRESERVE**                                             |
| Consumer accent  | `#0B82E6`                   | —                               | legacy coral still in food CSS    | Blue accent + blue→navy CTA                 | **PRESERVE**                                             |
| Scaffold green   | invented in first slice     | —                               | not amealio                       | Remove                                      | **CORRECT**                                              |
| Merchant purple  | `#40299B`                   | —                               | different product                 | Merchant later; not consumer                | **FUTURE**                                               |
| Coral `#fc5a47`  | old food CSS                | food apps often use warm accent | conflicts with V2                 | Do not use as primary                       | **CORRECT**                                              |
| Font             | Mulish (+ Inter/Poppins)    | one family                      | legacy Mulish ≠ target Inter      | **Inter**; 5-step scale                     | **CORRECT / IMPROVE**                                    |
| Buttons          | gradient 56px / mixed       | 44px min, one CTA language      | inconsistent                      | Gradient primary, outline secondary         | **IMPROVE**                                              |
| Cards            | 12px + light shadow         | image + meta                    | no image API                      | 12px card + letter placeholder              | **IMPROVE**                                              |
| Nav              | header + 5-tab bar          | 3–5 tabs                        | Experience/Bytes have no Nest API | Top wordmark + 3-tab bar (Home/Cart/Orders) | **IMPROVE**                                              |
| Search           | required geo in legacy food | city/q fallback                 | already in 92                     | Keep city + name fields                     | **PRESERVE**                                             |
| Loading          | CSS spinner                 | skeletons                       | mixed                             | Skeleton + status text                      | **IMPROVE**                                              |
| Empty/error      | inconsistent copy           | retry + plain language          | mixed                             | Banner tokens                               | **IMPROVE**                                              |
| Success green    | `#8AC926`                   | AA contrast                     | fails as text                     | `#1B7A3A` text; lime decorative only        | **CORRECT**                                              |
| Imagery          | photos in V2 cards          | required                        | no public image field             | Placeholder; real media FUTURE              | **FUTURE**                                               |
| Chips / filters  | V2 chips                    | category rails                  | Category HTTP in doc 94           | Chip primitive + Home 1 rail                | **IMPROVE**                                              |
| Modals / drawers | ReusableDrawer              | sheets                          | not needed this slice             | Tokens only                                 | **FUTURE**                                               |
| Toasts           | notistack                   | transient confirm               | not needed                        | Token reserved                              | **FUTURE**                                               |
| Logo mark        | SVG lockup                  | —                               | large asset                       | Wordmark text this slice                    | **OWNER DECISION** if full SVG lockup is required in-app |
| `packages/ui`    | designed, not built         | shared kit                      | none yet                          | Stay in `apps/web` until Next.js decision   | **FUTURE**                                               |

---

## 4. Auto-resolved

| Topic                   | Resolution                                        | Why                                                                |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Consumer identity       | Navy + blue, not coral, purple, or scaffold green | V2 tokens + PWA + profile                                          |
| Styling approach        | CSS variables in `apps/web`                       | No `packages/ui`; do not introduce Next/Tailwind just for this     |
| Type                    | Inter + compact scale                             | Established target family; Mulish is legacy-only                   |
| CTA                     | Blue→navy horizontal gradient                     | `AmealioColors.gradients.brandHorizontal` + `V2ButtonColors.solid` |
| Bottom nav destinations | Home, Cart, Orders                                | Only routes this slice owns                                        |

---

## 5. L4 — Canonical tokens

Implemented as `--ame-*` CSS variables. Screens must not invent hex values.

### 5.1 Color

| Token                 | Value                                              | Role                                      |
| --------------------- | -------------------------------------------------- | ----------------------------------------- |
| `--ame-navy`          | `#001D51`                                          | Primary ink, header                       |
| `--ame-navy-deep`     | `#001640`                                          | Header hover / pressed navy               |
| `--ame-blue`          | `#0B82E6`                                          | Accent, links, tab active                 |
| `--ame-blue-deep`     | `#096DB8`                                          | Accent hover                              |
| `--ame-page`          | `#F4F5FA`                                          | Page background                           |
| `--ame-card`          | `#FFFFFF`                                          | Surfaces                                  |
| `--ame-text`          | `#001D51`                                          | Body / heading                            |
| `--ame-text-body`     | `#3D3D3D`                                          | Secondary body (`greyText`)               |
| `--ame-muted`         | `#5E6675`                                          | Meta                                      |
| `--ame-placeholder`   | `#8B95A4`                                          | Placeholder                               |
| `--ame-border`        | `#E3E8F0`                                          | Card / field border                       |
| `--ame-border-strong` | `#8A94A6`                                          | Default input border                      |
| `--ame-disabled`      | `#D1D1D1`                                          | Disabled fill                             |
| `--ame-error`         | `#DF031F`                                          | Error                                     |
| `--ame-error-bg`      | `#FFF4F4`                                          | Error surface                             |
| `--ame-warning`       | `#BF6515`                                          | Warning text (contrast-safe vs `#FF7700`) |
| `--ame-warning-bg`    | `#FFF4D6`                                          | Warning surface                           |
| `--ame-success`       | `#1B7A3A`                                          | Success text                              |
| `--ame-success-bg`    | `#E8F6EC`                                          | Success surface                           |
| `--ame-info-bg`       | `#D9ECFF`                                          | Info / pastel blue                        |
| `--ame-overlay`       | `rgba(15, 23, 42, 0.58)`                           | Drawer backdrop                           |
| `--ame-cta`           | `linear-gradient(90deg, #0B82E6 0%, #001D51 100%)` | Primary button                            |

### 5.2 Typography

Family: **Inter**, fallback `ui-sans-serif, system-ui, sans-serif`.

`--ame-font` is the only family token. Body, headings, buttons, fields, cards, navigation, and status UI consume it. Mulish is not a target token.

| Token         | Size / weight |
| ------------- | ------------- |
| `--ame-fs-xs` | 12px / 500    |
| `--ame-fs-sm` | 14px / 400    |
| `--ame-fs-md` | 16px / 400    |
| `--ame-fs-lg` | 20px / 700    |
| `--ame-fs-xl` | 24px / 800    |
| `--ame-lh`    | 1.45          |

### 5.3 Spacing / radius / shadow / breakpoints

| Token                           | Value                                  |
| ------------------------------- | -------------------------------------- |
| `--ame-space-1`…`--ame-space-8` | 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 px |
| `--ame-radius-sm`               | 8px                                    |
| `--ame-radius-md`               | 12px                                   |
| `--ame-radius-pill`             | 999px                                  |
| `--ame-shadow-card`             | `0 1px 2px rgba(15, 23, 42, 0.05)`     |
| `--ame-shadow-nav`              | `0 -8px 28px rgba(15, 23, 42, 0.12)`   |
| `--ame-touch`                   | 44px                                   |
| `--ame-bp-md`                   | 768px                                  |
| `--ame-bp-lg`                   | 1024px                                 |
| `--ame-sheet`                   | 840px max content width                |

### 5.4 Components (this slice)

| Primitive              | Variants                                                  |
| ---------------------- | --------------------------------------------------------- |
| Button                 | `primary` (gradient), `secondary` (outline blue), `ghost` |
| Field                  | label + input/select                                      |
| Card                   | default, media (letter placeholder)                       |
| Badge                  | neutral, info, warning, danger, success                   |
| Chip                   | selected / unselected / unavailable (doc 94)              |
| Banner                 | error, empty, warning, info                               |
| Skeleton               | line / card                                               |
| Header                 | navy, wordmark                                            |
| Tab bar                | Home / Cart / Orders                                      |
| Modal / drawer / toast | tokens only                                               |

---

## 6. Implementation location

`apps/web/src/design-system/` + `apps/web/src/styles.css`.

`packages/ui` / Next.js remains **FUTURE**. Do not duplicate tokens in screens.

Mulish remaining in this repo after the Inter correction:

| Reference                                                                | Classification                   | Why it stays                                        |
| ------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------- |
| This document §1.2, L3 legacy column, §4, §6                             | 2. legacy forensic documentation | Records shipped consumer reality and the correction |
| `apps/web/src/design-system/tokens.test.ts` negative `Mulish` assertions | 2. forensic / validation         | Proves the runtime stylesheet does not load Mulish  |
| `apps/web` runtime CSS, tokens, HTML, package.json                       | 1. target runtime dependency     | **Removed** — none remain                           |

No `apps/web` runtime file may import, token, or load Mulish.

---

## 7. Owner decisions

1. **Full SVG lockup in-app vs wordmark** — wordmark this slice (asset is huge; identity is the word).
2. **One brand across consumer + merchant** — consumer navy/blue now; merchant purple later or converge (do not guess).
3. **Promote `packages/ui` now vs with Next.js** — stay in `apps/web` until that architecture lands.

---

## 8. Out of scope

Guest cart, geo, tax, offers, OTP, Home Page V2 default, new APIs, broad User App migration.
