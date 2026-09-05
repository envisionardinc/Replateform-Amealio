# 111 — Stage H: Personalization Forensic Reconciliation

**Status:** FORENSIC ONLY — L1–L4 contract. **No implementation.**  
**Date:** 2026-09-05  
**Accepted HEAD at start:** `51e8897acaa229f93d952e0221575b5e9ea4dbcb`  
**Governing rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Commerce forensics:** [103](./103-CORE-COMMERCE-MENU-PRODUCT-PRICING-MERCHANDISING-FORENSIC-RECONCILIATION.md)  
**Stage G (do not modify):** [110](./110-STAGE-G-UPSELL-CROSSSELL.md)  
**Related live contracts (do not change):** [92](./92-USER-APP-HOME-PAGE-V2-TARGET-BEHAVIOR-CONTRACT.md) · [94](./94-HOME-1-TAXONOMY-TARGET-BEHAVIOR-CONTRACT.md) · [96](./96-CONSUMER-PROFILE-DIETARY-PREFERENCES-TARGET-BEHAVIOR-CONTRACT.md) · [97](./97-CONSUMER-FAVORITES-SAVED-TARGET-BEHAVIOR-CONTRACT.md) · [90](./90-CONSUMER-ORDERING-PAYMENT-TARGET-BEHAVIOR-CONTRACT.md)  
**Machine-readable matrix:** [111-STAGE-H-GAP-MATRIX.json](./111-STAGE-H-GAP-MATRIX.json)

This document establishes the canonical amealio Personalization L1–L4 contract and the smallest justified implementation slice.

**Hard stop:** do not create schema, migrations, personalization APIs, ranking code, AI/RAG/embeddings, or consumer-behavior changes in this task. Do not modify Stage G. Do not proceed to Stage I.

---

## Vocabulary (do not collapse)

| Term | Meaning | Owner stage |
|---|---|---|
| **Merchandising** | Merchant intent → authored relationship → complementary offer | **Stage G** (`MerchandisingRelation{CROSS_SELL}` → consumer `pairsWellWith` / “Pairs well with”) |
| **Personalization** | Customer + context + signals → candidate generation / ranking → personalized discovery | **Stage H** |
| **Discovery** | Taxonomy, editorial, popularity, city/`q`/category chips | Home / taxonomy (docs 92, 94). Not a rec engine |
| **Promotion** | Commercial incentive evaluation | **Stage E** |
| **Pricing** | Authoritative money calculation | **Stage D** |
| **Availability / orderability** | Authoritative sellability | **Stage C** |
| **Content** | Bytes, experiences, events, recipes | Separate products. Not Stage H |
| **Search** | Name/city/`q` filter | Discovery query. Not personalized ranking |

No subsystem may silently replace another. Code named “recommendation” is not automatically personalized.

---

## Evidence sources

| Repo | Workspace path | Role | Stage H evidence |
|---|---|---|---|
| Amealio-VendorDashboard | `/agent/repos/amealio-vendordashboard` | Legacy Feathers API | **Primary engine:** `user-personalisation-menu.class.ts`. Tag merchandising: `recommended-items.class.ts`. Favorites: `favourites.class.ts`. Moods: `user-mood.class.ts`. Taste sliders: `user-category.class.ts` `personalization` query |
| amealio_web_app | `/agent/repos/amealio_web_app` | Legacy consumer | Menu `justForYou.jsx` + `PersonaliseMenu.js`. Home 1 moods/cravings/last-ordered. Home V2 `homepage2ChatApi.js`. Favorites page dietary filters. Last ordered accordion |
| AmealioDashboardMVP- | `/agent/repos/amealiodashboardmvp-` | Merchant + Super Admin | Menu/item tags, health tags, allergy authoring, POS suggestions. **No customer-preference ranking UI** |
| amealio-nestjs-backend | `/agent/repos/amealio-nestjs-backend` | Nest location/auth | **None** — no personalization / recommendation / ranking matches |
| amealio-self-delivery-app | `/agent/repos/amealio-self-delivery-app` | Kitchen/delivery | **None** |
| Amealio-VendorApp | — | Merchant mobile | **Not in this workspace** |
| Amealio-Homepage-V2-RAG-Server | — | External recs | **Not in this workspace.** Client contract only |
| replateform-amealio | `/agent/repos/replateform-amealio` | Canonical product | Profile (96), favorites (97), orders (90), discovery port (92/94), Stage G (110). **No personalization ranking** |

**Limitation:** RAG internals (embeddings, vector store, LLM prompts, retrieval, ranking) cannot be inspected. Prior inventory already recorded the same gap (docs 02, 08, 92, `REPOSITORY_LANDSCAPE.md`, OD-8).

---

## 1. L1 — Legacy Reality

### 1.1 What is actually personalized in production

**One restaurant-scoped engine:** `GET /user/personalisation-menu?vendor_id=&profile_id?`

| Question | Finding |
|---|---|
| Consumer UI | `justForYou.jsx` on `RestaurantMainMenu.jsx` (also celebrations/events). Label: Just for You |
| Auth | JWT `Authorization` required. No token → fetch skipped, empty rail |
| Scope | **That restaurant’s menu only** (`vendor_id`) |
| Profiles | Optional `profile_id` + `localStorage.selectedProfile`. Favorites stay on the User record, not the profile |
| Persistence of the score | None. Score is computed per request |
| ML / embeddings / order history | **Not used** |

This is explicit-preference filtering plus a two-term deterministic score. It is not collaborative filtering, not RAG, and not Stage G.

### 1.2 Signal inventory (legacy + target), A–R

For each mechanism: **A** collected signal · **B** stored · **C** created/updated · **D** owner · **E** explicit/inferred · **F** persistent/session · **G** customer-specific · **H** restaurant-specific · **I** item-specific · **J** category-specific · **K** behavioral · **L** contextual · **M** ranking · **N** filtering · **O** UI-only · **P** API-connected · **Q** production consumer · **R** dormant.

#### H-SIG-1 — Dietary preferences

| | Legacy | Target (do not change) |
|---|---|---|
| A | Health-flow subcategory IDs | String labels `dietary_preferences[]` (max 10) |
| B | `user-service.dietary_preference` and/or profile `preference` | `UserProfile.preferences` Json |
| C | Health / preference flows; `PATCH user-service/:id` | `PATCH /api/v1/me/profile` JWT subject |
| D | Consumer | Consumer |
| E | Explicit | Explicit |
| F | Persistent | Persistent |
| G | Yes (legacy also per-profile) | Yes (1:1 `UserProfile`) |
| H–J | No | No |
| K | No | No |
| L | No | No |
| M | **No** (not in `personalisationScore`) | **No** |
| N | **Yes** on personalisation-menu: keep items whose `healthTags` intersect user prefs **when prefs exist**. Favorites page also client-filters already-fetched rows | **No** — not wired to discovery, menu, or Stage G |
| O | Also chips on profile | Profile chips only |
| P | Yes | Yes |
| Q | Yes, on Just for You **when tags match** | Persistence only |
| R | No | Live CRUD; unused as a rec signal |

**Safety:** legacy personalisation-menu treats dietary prefs as a **hard keep-filter**, not a rank boost. Target doc 96: labels, **not a medical/safety guarantee**. Discovery use is already **FUTURE** there.

#### H-SIG-2 — Allergies

| | Legacy | Target (do not change) |
|---|---|---|
| A | Allergy subcategory IDs + `allergies_flag` | String labels `allergies[]` (max 10) |
| B | `do_you_have_allergies` / profile `allergy` | Same `UserProfile.preferences` Json |
| C | Allergy step in health flow | Same profile PATCH |
| D | Consumer | Consumer |
| E | Explicit | Explicit |
| F | Persistent | Persistent |
| G | Yes | Yes |
| H–L | No | No |
| M | **No** | **No** |
| N | **Yes** on personalisation-menu: drop items whose `allergy_information.allergy_tag` intersects user allergies | **No** |
| O | Cart/checkout **may copy** allergies into order notes | Profile only; checkout copy is out of scope (doc 96) |
| P | Yes | Yes |
| Q | Yes on Just for You when item tags exist | Persistence only |
| R | No | Live CRUD; unused as eligibility |

**Critical:** this is a **SAFETY / ELIGIBILITY** candidate, not a ranking feature. Do not implement allergy filtering in Stage H without an explicit contract and catalog tags that can actually match. Target `MenuItem` has **no** `healthTags` / `allergy_tag` fields.

#### H-SIG-3 — Favorites / saved

| | Legacy | Target (do not change) |
|---|---|---|
| A | Restaurant IDs (`favourites`), item IDs (`itemFav`), plus unused event/experience/recipe/offer arrays | `Favourite(userId, targetType, targetId)` `RESTAURANT` + `MENU_ITEM` |
| B | Arrays on the user document | `Favourite` table |
| C | `POST /favourites?add\|remove` | `PUT/DELETE /api/v1/me/favorites` |
| D | Consumer | Consumer |
| E | Explicit bookmark | Explicit bookmark |
| F | Persistent | Persistent |
| G | Yes | Yes |
| H | Restaurant saves are restaurant-specific | Same |
| I | Item saves are item-specific | Same |
| J | No | No |
| K | Weak (bookmark, not view/purchase) | Same |
| L | No | No |
| M | **Intended +100** on personalisation-menu | **No** |
| N | Menu FavouritesAccordion intersects `itemFav` with current menu | List/hearts only |
| O | Home 1 saved restaurant carousel | `/favorites` + hearts |
| P | Yes | Yes |
| Q | Yes as CRUD; ranking use is **defective** (see below) | CRUD only (doc 97: not used for discovery ranking) |
| R | No | Live; unused as ranking |

**Forensic defect:** `user-personalisation-menu.class.ts` scores `userDetails.favourites` (restaurant IDs) against vendor **item** `_id`. Item hearts write `itemFav`. Comparing restaurant IDs to item IDs **does not match**. The +100 boost is therefore largely inert unless an ID collision happens. Classify **CORRECT** for any future rank: use `Favourite` `MENU_ITEM`, never restaurant IDs, against menu items.

Favorites are **not** Stage G cross-sell. Doc 97 / 110 already forbid that reinterpretation.

#### H-SIG-4 — Cuisine affinity (explicit)

| | Legacy | Target |
|---|---|---|
| A | Favorite cuisine subcategory IDs | `selected_cuisine` may exist in Json from onboarding; **not** on consumer PATCH allowlist (doc 96) |
| B | profile `favorite_cuisine` or user `cuisine` | Unchanged on disk if present; not HTTP |
| C | Onboarding / preference flows | Not writable on `/me/profile` |
| E | Explicit | Dormant |
| M | **+10** when item `cuisin_type` matches | **No** |
| N | **Yes** — when cuisine prefs exist, personalisation-menu **keeps only** matching cuisine | **No** |
| Q | Yes on Just for You | **No** |

Cuisine is an explicit preference in legacy Just for You, and a **hard filter** when set — not only a rank term. Target cannot reproduce it without a consumer cuisine API and item cuisine tags.

#### H-SIG-5 — Order history / previous purchases

| | Legacy | Target |
|---|---|---|
| A | Placed orders + line items | `Order` / `OrderItem`; `ConsumerOrderService.listMine` |
| B | Order collections | Prisma `Order` (`CANCELLED` distinguishable). `PaymentStatus` includes `REFUNDED` / `PARTIALLY_REFUNDED` / `FAILED` |
| C | Checkout | Existing ordering machine |
| D | Consumer (merchant sees the order, not a preference profile) | Same |
| E | Inferred if used as a signal; today used as **retrieval** | Same |
| F | Persistent | Persistent |
| G–I | Yes | Yes |
| K | Yes (purchase) | Yes |
| M | **No** — not in `personalisationScore` | **No** |
| N | **No** | **No** |
| O | Home `LastOrderedSection`; menu `LastOrderedAccordion` (client intersects orders with restaurant, newest 10). **Does not exclude cancelled/refunded/failed** | Order list / tracking only |
| P | Yes | Yes |
| Q | Yes as “last ordered” UI | History list; not a rec signal |
| R | No | Live; unused for ranking |

Do not infer taste from cancelled, failed, or refunded orders. Legacy last-ordered does not apply that rule; the target must not copy that omission if history later becomes a signal.

#### H-SIG-6 — Restaurant / item / category affinity (inferred)

**Not collected as first-class affinity tables.** No RFM store, no “frequently ordered” aggregate, no category-affinity document. Any future affinity would be derived from favorites + completed orders. **Not used for ranking today.**

#### H-SIG-7 — Tags / bestseller / rating / “Recommended”

| | Finding |
|---|---|
| A | Merchant item tags titled “Recommended”, “Best Seller”, “Chef's Special”; numeric ratings |
| B | Item tag refs / rating fields on vendor items |
| C | Merchant catalog |
| D | **Merchant** |
| E | Explicit merchandising / editorial, not customer inference |
| M | Consumer cart “Recommended for You” prefers these tags, else rating ≥ 4, else first N — **not personalized** |
| Q | Yes on consumer cart / seating / experience recommended strips |
| Stage | **Merchandising / popularity / discovery.** Documented in 110 as **not** cross-sell and **not** Stage H |

#### H-SIG-8 — Discovery taxonomy (moods / cravings / curations / Category chips)

| | Legacy Home 1 | Target |
|---|---|---|
| A | Platform mood/craving/curation rows; logged-in `selectedMoods[]` | Platform `Category` chips (doc 94) |
| B | `mood` model + user selected IDs | `Category` |
| D | Platform (+ optional user mood IDs) | Platform |
| E | Editorial taxonomy; selected moods are explicit |
| M | Restaurant list is `$geoNear` + taxonomy — **not RAG, not personalisation-menu** | `CanonicalRestaurantFeedProvider` `source: 'CANONICAL'`. Query: city / `q` / `categoryId`. **No user identity** |
| Q | Yes on `/home` | Yes on Nest home |
| Stage | **Discovery / editorial.** Moods/cravings/curations remain **FUTURE** on Nest (doc 92) |

#### H-SIG-9 — Home Page V2 / RAG client

| | Finding |
|---|---|
| A | Chat `query`, `user_id`, `session_id`, `selected_date`, `current_area`, `current_city`, `country_code`, `timezone` |
| B | External service + local `sessionStorage` history cache. **Does not send dietary prefs, favorites, or order history** |
| C | `/homepage2` only. Default `/home` does **not** call it |
| D | External recommendations API |
| E | Query is explicit; ranking unknown (repo missing) |
| F | Session + optional user_id history |
| L | Geo / date / timezone are contextual |
| M / N | Off-box. Unknown |
| P | `POST /recommendations`, `GET /recommendations/history` via `REACT_APP_RECOMMENDATIONS_API_*` |
| Q | Separate surface, historically pointed at `*-recommendation-api.amealio.com` / `api-homepage-v2-prod.amealio.com` |
| R | Client is real; server repo unavailable. Target reserved `RecommendationProvider` port (OD-8); fallback = canonical feed |

#### H-SIG-10 — Search / cart / session / device / geo / daypart

| Signal | Collected? | Used to personalize? |
|---|---|---|
| Search `q` | Restaurant name/city filter | **No** ranking |
| Cart contents | Cart + Stage G `pairsWellWith` / legacy tag recs | Cart recs are **merchandising**, not H |
| Device | Not a first-class personalization signal | No |
| Session | Home V2 `session_id` only | Not on default home / Just for You |
| Geo | Legacy Home 1 `$geoNear`; Home V2 city/area | Discovery / V2 context, not `personalisationScore` |
| Daypart / `futureTime` | Personalisation-menu uses `futureTime` for **availability windows**; Home V2 sends `selected_date` | Availability / V2 context, not preference ranking |
| Taste sliders (spice/salt/…) | Menu `personalization` query / unpriced modifiers | **Configuration**, not ranking (103 G-MOD-5) |

#### H-SIG-11 — Stage G CROSS_SELL (lookalike, not a Stage H signal)

Merchant-authored item→item complementary relations. Consumer field `pairsWellWith`. **Not** customer-specific. **Do not reinterpret favorites as CROSS_SELL.** Not a personalization input unless a later owner decision mixes candidate sources (resolved below: **do not mix in the first H slice**).

### 1.3 Target signal readiness (verify, do not assume)

| Signal | Available | Persisted | Auth | Consumer-owned | Usable by rec logic later | Used for personalization now | Appropriate later |
|---|---|---|---|---|---|---|---|
| Dietary prefs | Yes | `UserProfile.preferences` | JWT | Yes | After catalog tag contract + OD-H-1 | **No** | Yes, but **eligibility vs rank is OD-H-1** |
| Allergies | Yes | Same Json | JWT | Yes | Only as **safety/eligibility**, never as a “boost” | **No** | Only with item allergy tags + owner contract |
| Favorites restaurants | Yes | `Favourite` `RESTAURANT` | JWT | Yes | Home saved rail / restaurant affinity | **No** | Discovery / later H |
| Favorites items | Yes | `Favourite` `MENU_ITEM` | JWT | Yes | Restaurant-scoped Just for You rank | **No** | **Yes** (legacy intent; fix the ID field) |
| Order history | Yes | `Order` / `OrderItem` | JWT | Yes | After status/payment filter | **No** | FUTURE affinity |
| Discovery taxonomy | Yes | `Category` | Public | Platform | Candidate source for discovery | Display/filter only | Discovery, not H-core |
| Stage G CROSS_SELL | Yes | `MerchandisingRelation` | Merchant | Merchant | Optional later **candidate**, not a signal | Merchandising only | Keep separate |
| Home V2 RAG | Client only | External | Mixed | External | Unknown | Not on Nest home | FUTURE / OD-H-8 |
| Moods/cravings | Legacy only | Mood + `selectedMoods` | Mixed | Partial | Editorial | Not on Nest | FUTURE discovery |
| Ratings / bestsellers | Legacy tags | Item tags | Merchant | Merchant | Popularity candidate | Not personalized | Discovery / merchandising |
| Cuisine prefs | Not on Nest HTTP | Json maybe | — | — | After API + item cuisine | **No** | FUTURE |
| Geo / time | Weak (address / V2) | Mixed | Mixed | Mixed | Contextual rank | Not on Nest home | FUTURE |
| Negative signals | **None** | — | — | — | — | — | FUTURE |
| Opt-out | **None** | — | — | — | — | — | OD-H-7 |

### 1.4 Lookalikes (do not call these personalization)

| Looks like | Actually is | Layer |
|---|---|---|
| “Pairs well with” | Merchant CROSS_SELL | Stage G |
| Cart “Recommended for You” | Tags / rating / first-N | Merchandising |
| Best Seller / Chef’s Special filters | Tag filters | Merchandising |
| Home Category chips | Taxonomy | Discovery |
| Moods / cravings / curations | Editorial + optional saved mood IDs | Discovery / FUTURE |
| Suggested Bytes / experience `recommended` | Content flags | Content |
| Taste sliders | Unpriced modifiers | Stage A |
| Home V2 chat cards | External recs / content mix | FUTURE port, not default home |
| Last ordered rail | History retrieval | Ordering UX, not ranking |
| Favorites list | Bookmark CRUD | Profile / saved |

### 1.5 Dietary treatment (legacy vs target)

Legacy Just for You **filters** (eligibility), it does not score dietary match:

1. Allergies → exclude intersecting allergy tags.
2. Dietary prefs → **require** at least one intersecting `healthTags` (items with empty health tags drop out).
3. Cuisine prefs → **require** matching `cuisin_type`.

Other surfaces: favorites page client-filters; cart may copy allergy text into notes; **no restaurant-wide discovery filter** on Nest.

Target: persist labels only. **No** menu/discovery/Stage G use. **Do not treat dietary prefs as a mere ranking signal if they should be a hard safety constraint.** Allergies, if ever applied, belong in **SAFETY / ELIGIBILITY**, not “you may like.”

### 1.6 Favorites treatment

Used for: direct retrieval (lists, hearts, FavouritesAccordion), intended rank boost (broken field), **not** discovery reorder of the public catalog, **not** Stage G.

Correct future relationship:

```
Favourite MENU_ITEM  →  optional rank boost / restaurant-scoped “Just for you”
Favourite RESTAURANT →  saved list / optional later home rail (discovery product)
CROSS_SELL           →  merchant complementary (Stage G only)
```

### 1.7 Order-history treatment

Available at restaurant and item grain. Status and payment state **are** distinguishable on the target. Legacy last-ordered does **not** filter cancelled/refunded/failed. History is **not** in `personalisationScore`. Safe as a **future** affinity signal only after restricting to completed/delivered (or equivalent) paid orders. Do not build a behavioral model in the first slice.

### 1.8 RAG / AI findings

| Question | Answer |
|---|---|
| Does the repo exist here? | **No** (`Amealio-Homepage-V2-RAG-Server` unavailable) |
| Client? | Yes — `/homepage2` |
| Inputs | Query + identity/session + geo/date/tz. **Not** prefs/favorites/history |
| Outputs | Card sections: restaurants, items, experiences, bytes, events, recipes |
| Embeddings / vector / LLM | **Unknown** |
| Ranking / personalization signals | **Unknown** |
| Fallback | Local session cache; empty API must not wipe local (client). Target: canonical feed |
| Default home? | **No** |
| Production? | Historically wired as a **separate** surface, not the Nest home |

Do not implement any of it. Do not vendor a fake LLM.

---

## 2. L2 — Industry Benchmark

Question answered: **what is the smallest production-grade personalization architecture appropriate for amealio now?**  
Not: the most sophisticated engine that could be built.

### 2.1 Pattern evaluation

| Pattern | Industry role | Fit for amealio now |
|---|---|---|
| 1. Explicit preference personalization | Filter and/or soft rank from stated diet/cuisine | Legacy Just for You already does this — **but** Nest catalog cannot match labels to item tags |
| 2. Behavioral personalization | Views, purchases, skips | Order history exists; **no** event stream. Do not invent tracking |
| 3. Contextual ranking | Geo, daypart, device | Present on Home 1 / V2, not on Just for You score. FUTURE |
| 4–6. Item/category/restaurant affinity, recency/frequency | Derived from purchases + saves | No affinity store. FUTURE after status-safe history |
| 7. Negative signals | Hide / not interested / refunds | **Not collected.** Do not invent |
| 8. Dietary constraints | Hard eligibility for allergens; soft rank for taste | **Separate safety from rank.** Industry does not hide allergen exclusion inside a “for you” score |
| 9–11. Cold start / guest / auth | Popular + editorial for anonymous; prefs/saves for new auth; history later | Legacy guests get **no** Just for You. Preserve that |
| 12. Explainability | “Saved by you”, not fake 87% match | Legacy UI treats score aliases as match %. Real scores are 0/10/100/110. **CORRECT** |
| 13–14. Candidates then rank | Standard two-stage recs | Yes, conceptually |
| 15. Availability filtering | Recs must be sellable | Stage C is authoritative |
| 16–17. Price / promo | Quote and discount only on intent | Stage D / E. Do not create rec prices |
| 18. Feedback loops | Accept/ignore analytics | Not in L1. FUTURE |
| 19–20. Privacy / opt-out | Minimize; customer control | Prefs/favorites already customer-owned. No opt-out control in L1. OD-H-7 |
| 21–22. Model fallback / deterministic baseline | Rules before ML | **Required.** Legacy production engine is already rules |

Industry does **not** require CF, deep learning, embeddings, or RAG to ship a first personalization rail when explicit bookmarks already exist.

### 2.2 Smallest production-grade architecture

```
Existing consumer-owned signals
        ↓
Candidate sources (catalog of the open restaurant, later others)
        ↓
Stage C eligibility / orderability          ← never skip
        ↓
Deterministic personalized ranking          ← Stage H
        ↓
Presentation
        ↓
Stage D quote + Stage E promo only when the diner selects / quotes
```

Eligibility **before** rank is safer than rank-then-filter when the candidate set is one restaurant’s published menu: unsellable items never occupy slots. Forensic evidence (legacy filters allergies/diet/cuisine **before** score; Stage G already filters Stage C before `pairsWellWith`) supports:

```
Candidates → Eligibility (Stage C [+ optional safety]) → Rank → Present
```

Pricing and promotions stay off the ranking path.

---

## 3. L3 — Gap Analysis

| ID | Gap | Legacy | Target today | Class |
|---|---|---|---|---|
| H-LAYER-1 | Collapse merchandising / discovery / personalization | Mixed “Recommended” labels | Layers exist; G vs H vocabulary is documented | **PRESERVE** distinction |
| H-ENG-1 | Restaurant-scoped Just for You missing on Nest | `/user/personalisation-menu` | No ranking module | **PRESERVE** intent; implement only after GO |
| H-FAV-1 | Score uses restaurant `favourites` vs item `_id` | Defective +100 | `Favourite` `MENU_ITEM` exists | **CORRECT** |
| H-DIET-1 | Dietary prefs hard-filter Just for You | `healthTags` ∩ prefs | Labels only; no item health tags | **OWNER DECISION** (OD-H-1) + catalog **FUTURE** |
| H-ALLERGY-1 | Allergy exclude on Just for You | Tag intersection | Labels only; no item allergy tags; doc 96 forbids safety claim | **OWNER DECISION** (OD-H-1) — treat as **SAFETY**, not rank |
| H-CUISINE-1 | Cuisine filter + +10 score | Profile cuisine IDs + item `cuisin_type` | Not on profile HTTP; no item cuisine on consumer catalog | **FUTURE** |
| H-HIST-1 | Last-ordered retrieval, not rank | Client rails; no status filter | `listMine`; statuses exist | **IMPROVE** later; **FUTURE** for H rank |
| H-DISC-1 | Home is not personalized | Geo + taxonomy; V2 separate | `CANONICAL` feed | **PRESERVE** |
| H-RAG-1 | External V2 recs | Client + missing server | Port reserved, unused | **FUTURE** / **OD-H-8** |
| H-TAG-1 | “Recommended for You” looks personalized | Tags / rating | Do not relabel as H | **CORRECT** |
| H-G-1 | CROSS_SELL vs For You | Separate engines | `pairsWellWith` live | **PRESERVE** |
| H-C-1 | Personalized items must be orderable | `status`, `currentState: 9`, channel, timings | Stage C | **CORRECT** — wrap any future rail |
| H-D-1 | Recs must not price themselves | N/A | Stage D only | **PRESERVE** |
| H-E-1 | Recs must not discount themselves | N/A | Stage E only | **PRESERVE** |
| H-COLD-1 | Guests / empty prefs | Empty Just for You if logged out | Same expected | **PRESERVE** |
| H-PRIV-1 | Merchant visibility of diner prefs | No merchant rec-profile API found | Do not add | **CORRECT** |
| H-OPT-1 | Personalization opt-out | Not first-class | None | **OWNER DECISION** (OD-H-7) |
| H-NEG-1 | Hide / not interested / skip | Absent | Absent | **FUTURE** |
| H-MULTI-1 | Household profiles on Just for You | `profile_id` | 1:1 `UserProfile` | **FUTURE** |
| H-UX-1 | Fake match-percent from score aliases | `PersonaliseMenu.js` | Do not copy | **CORRECT** |
| H-PAGE-1 | Category page/limit **before** item score | Pipeline skip/limit on categories | If implemented: rank then cap | **IMPROVE** |
| H-EVENT-1 | No view/skip/dismiss events | Absent | Absent | **FUTURE** — do not invent tracking |

### 3.1 Signal layer

**Reliable now:** authenticated favorites (item + restaurant), profile dietary/allergy **labels**, order rows with status/payment, Stage C catalog, Stage G relations, Category taxonomy.

**Incomplete / unusable for faithful Just for You filters:** item health tags, item allergy tags, item cuisine, consumer-writable cuisine prefs, multi-profile, negative signals, behavioral events.

**Do not add event tracking** in the first H slice. amealio does not collect hide/skip/not-interested.

### 3.2 Candidate layer

| Source | Personalization candidate? | Notes |
|---|---|---|
| Open restaurant Stage C catalog | **Yes** — primary for Just for You | Matches L1 scope |
| Favourite MENU_ITEM ∩ that restaurant | **Yes** — rank / seed | Corrected field |
| Favourite RESTAURANT | Home/saved, not item rank | Discovery / later |
| Order history | FUTURE | Status-filter first |
| Discovery taxonomy | Discovery candidates, not H-core | Keep on home |
| Editorial moods/cravings | FUTURE discovery | Not H |
| Popular / bestseller tags | Popularity / merchandising | Not customer-specific |
| Stage G CROSS_SELL | Merchandising candidates | Do not mix into H rank in the first slice |
| RAG / Home V2 | Separate surface | FUTURE port |

### 3.3 Filter layer (non-negotiable)

Personalization **must not** override: restaurant availability, item publication, variant/modifier availability, channel, menu orderability, Stage C.

Canonical sequence (supported by L1 filters-before-score and Stage G):

```
Candidate generation
    → Stage C eligibility / orderability
    → optional SAFETY eligibility (allergies) only after OD-H-1
    → personalized ranking
    → presentation
    → Stage D / Stage E only on quote or cart add
```

---

## 4. L4 — Target Contract

### 4.1 What Stage H is

Customer- and context-owned ranking (and, only when contracted, eligibility) over **already sellable** catalog.

Stage H does **not** author complementary products, invent prices, apply promotions, publish items, or replace Home taxonomy.

### 4.2 What Stage H is not

- Stage G merchandising
- Home V2 RAG
- Tag “Recommended / Best Seller”
- Taste-slider modifiers
- A medical allergen guarantee
- A behavioral ML platform

### 4.3 Conceptual architecture

```
Signals (consumer-owned, existing tables)
  → Candidate sources (first: this restaurant’s Stage C catalog)
  → Eligibility / orderability (Stage C; safety only if OD-H-1 says so)
  → Personalized ranking (deterministic rules)
  → Presentation (“Just for you”, never “Pairs well with”)
```

### 4.4 Ranking philosophy (when GO is given)

Prefer a **deterministic baseline**:

1. Favourite MENU_ITEM at this restaurant → highest
2. Stable catalog tie-break (`sortOrder`, then name, then id)
3. No invented scores, no fake percents
4. No order-history, cuisine, geo, RAG, or CROSS_SELL terms in the first slice
5. Dietary/allergy **not** applied until OD-H-1 **and** item tags exist

Do not create a machine-learning model. Forensic evidence shows production H is already rules.

### 4.5 Cold start (do not invent data)

| User | Behavior |
|---|---|
| Anonymous / guest | No personalized rail (legacy: no token → empty) |
| New authenticated, no favorites, no prefs | Hide the rail. Do not fabricate “for you” from bestsellers |
| Favorites only | Rank those orderable items first (first slice) |
| Preferences only | **Do nothing** until OD-H-1 + catalog tags. Empty rail is correct |
| Order history only | Show existing last-ordered **retrieval** if that UX is added later; **not** H rank in the first slice |
| History + favorites + prefs | First slice still uses favorites only |

### 4.6 Negative signals

Not justified for the first slice. No hide/dismiss/not-interested collection exists. Cancelled/refunded must **not** become negative taste without a later contract.

### 4.7 Privacy

- Personalization data is **customer-owned** and **tenant-scoped** only in the sense that catalog candidates are restaurant/merchant scoped.
- Merchants must **not** receive individual diner preference, allergy, favorite, or affinity payloads merely because those rows exist.
- Merchant-visible orders remain orders, not a preference API.
- Data minimization: reuse `Favourite`, `UserProfile`, `Order`. No new tracking warehouse.
- Sensitive prefs (allergies): treat as safety data if ever applied; do not use for marketing lookalikes.
- Opt-out: **OD-H-7**. Until decided, do not silently rank in ways the diner cannot see or disable.

### 4.8 Authorization

Any future H read: `JwtConsumerGuard`, subject = `principal.userId`. No client-supplied user id. Guests: 401 or omit the rail — do not session-invent a profile.

### 4.9 Observability (when implemented later)

Log candidate count, eligible count, ranked count, whether favorites existed, rail hidden-vs-shown. Do **not** log raw allergy strings in info logs.

---

## 5. Owner decisions

### 5.1 Resolved from evidence (not blockers)

| Candidate | Resolution | Why |
|---|---|---|
| OD-H-2 order history in first H rank | **No — FUTURE** | Not in `personalisationScore`. Last-ordered is retrieval. Status filter required before any affinity |
| OD-H-3 favorites influence ranking | **Yes, item favorites** | Production intent. Correct the field to `MENU_ITEM` |
| OD-H-4 Stage G in personalized rank | **No in first H slice** | Different owner (merchant vs customer). Keep `pairsWellWith` separate |
| OD-H-5 across vs within restaurant | **Within restaurant first** | L1 Just for You is vendor-scoped. Cross-venue is Home V2 / FUTURE |
| OD-H-6 guest session personalization | **No** | Legacy requires login; no guest signal store on Nest |
| OD-H-9 merchant sees diner signals | **No** | No L1 merchant preference API; privacy default |
| OD-H-10 geo/time in first H rank | **No — FUTURE** | Not in `personalisationScore`. Home/V2 contextual only |

### 5.2 Genuinely unresolved

#### OD-H-1 — Dietary / allergy: ranking vs eligibility?

Legacy personalisation-menu **hard-filters** both. Target profile **forbids a safety guarantee** and stores **labels**, not catalog FKs. Nest items have **no** matching tags.

Do **not** silently pick:

- copy legacy filters (unsafe / unmatched), or
- treat allergies as a soft “you may like” rank.

Until decided: **do not apply dietary or allergy constraints in any Stage H implementation.**

#### OD-H-7 — Personalization controls / opt-out?

No first-class L1 control. Industry expects one once ranking exists. Decide before or with the first ranking ship: hide-rail setting, or “use my favorites / prefs” toggles.

#### OD-H-8 — Eventually use AI / RAG?

Server repo missing. Home V2 is a **separate** surface with a reserved port. Default home must remain canonical. Do not block Just for You on RAG. Do not implement RAG in Stage H.

---

## 6. Deferred (FUTURE)

- Allergy / dietary eligibility or rank (blocked on OD-H-1 + item tags)
- Cuisine prefs HTTP + item cuisine rank
- Order-history affinity / recency / frequency
- Cross-restaurant personalized home
- Moods / cravings / curations on Nest
- Home V2 `RecommendationProvider` adapter
- Embeddings, vector DB, LLM rank, CF, training pipelines
- Negative signals / dismiss / not interested
- Guest session personalization
- Multi-profile / household Just for You
- Merchant analytics of diner prefs
- Geo / daypart rank
- Feedback / accept-ignore platform
- Campaign, loyalty, notification, segmentation recs
- Celebration / experience / Global Catalog / chain inheritance recs
- Any Stage G change

---

## 7. Smallest justified Stage H slice

### Decision: **B. DEFER**

Do **not** implement Stage H in this task. Do **not** implement it merely to keep commerce stages moving.

### Why DEFER (exact)

1. **Process:** this prompt is forensic reconciliation. The next implementation prompt is created only after this contract is reviewed and accepted.
2. **OD-H-1 is a safety decision.** Shipping Just for You with legacy dietary/allergy hard-filters would invent a Nest catalog mapping that does not exist and would contradict doc 96. Shipping without them is a thinner product than L1 and must be an accepted delta, not a silent one.
3. **Faithful L1 cannot be reproduced yet.** Cuisine filter/+10 and dietary/allergy filters require item tags and consumer cuisine writes that the target does not have.
4. **The remaining thin slice is mostly favorites ∩ current restaurant menu** — already listed as FUTURE in doc 97. Calling that “Stage H complete” would overclaim a personalization engine.
5. **RAG cannot be inspected or justified** as default-path infrastructure.
6. **No production Nest consumer is currently blocked on money path.** Stages A–G are complete. Personalization is additive ranking, not an orderability hole.

### Proposed slice — for the next GO prompt only (do not build now)

If reviewers accept the delta “favorites-only, no dietary/cuisine filters”:

| Dimension | Spec |
|---|---|
| Surface | Restaurant menu “Just for you” rail. **Not** home. **Not** `pairsWellWith` |
| Candidates | That restaurant’s Stage C consumer-orderable `MENU_ITEM`s |
| Rank | Favourite MENU_ITEM first, then catalog `sortOrder` / name / id |
| Inputs | JWT + `Favourite` + existing consumer catalog read |
| Not used | Dietary, allergies, cuisine, orders, geo, RAG, CROSS_SELL, tags |
| Auth | Consumer JWT. Guests: no rail |
| Empty | Hide rail if zero favorite orderable items |
| Tests | Auth, isolation, Stage C drop, favorite-first order, no G field reuse, A–G non-regression |
| Observability | Hidden vs shown; counts; no allergy payloads |
| Fallback | Hide rail on error; never invent items; never fail the menu |

If reviewers instead want L1 dietary/allergy/cuisine parity: **still DEFER** until OD-H-1 and a catalog-tag contract exist.

---

## 8. Confirmation

- No Prisma schema or migration changes
- No controllers, services, or ranking code
- No consumer or merchant API behavior change
- No discovery / Stage G / profile / favorites / order changes
- Stage I not started

---

## 9. Evidence references

- `amealio-vendordashboard/src/services/vendor-items/user-personalisation-menu.class.ts` — filters + `personalisationScore` 100/10
- `amealio-vendordashboard/src/services/favourites/favourites.class.ts` — `favourites` vs `itemFav`
- `amealio-vendordashboard/src/services/vendor-items/recommended-items.class.ts` — tag buckets
- `amealio_web_app/src/screens/menu/components/justForYou.jsx`
- `amealio_web_app/src/screens/menu/components/PersonaliseMenu.js` — score aliases / match %
- `amealio_web_app/src/screens/menu/components/LastOrderedAccordion.jsx` + `utils/helperFunc.js`
- `amealio_web_app/src/screens/AmealioHome/Screens/HomePage2/homepage2ChatApi.js`
- Target: `apps/api/src/modules/user-profile/**`, `favorites/**`, `discovery/**`, `ordering/application/consumer-order.service.ts`
- Target: `apps/api/src/modules/discovery/domain/discovery-feed.ts` (`CANONICAL` \| `RECOMMENDATION`)
- Docs 92, 94, 96, 97, 103, 110; `docs/migration/target-architecture/11-OWNER-DECISIONS.md` OD-8
