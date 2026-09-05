# 97 — Consumer Favorites / Saved Target Behavior Contract

**Status:** CONTRACT + implementation  
**Date:** 2026-09-05  
**Brand:** amealio  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Depends on:** [93](../93-AMEALIO-FRONTEND-DESIGN-SYSTEM-RECONCILIATION.md), [94](./94-HOME-1-TAXONOMY-TARGET-BEHAVIOR-CONTRACT.md), [96](./96-CONSUMER-PROFILE-DIETARY-PREFERENCES-TARGET-BEHAVIOR-CONTRACT.md)

Profile + dietary preferences is closed. This document selects the next existing consumer surface that already has a target model.

**Decision: IMPLEMENT NOW** — restaurant + menu-item bookmarks only, on existing `Favourite`. No geo. No discovery rewrite. No ordering change.

---

## 0. Method

1. **L1** — Traced `amealio_web_app` `/favourites`, `/Profile/favoritesPage`, home `FavouritesSection`, menu `FavouritesAccordion`, restaurant/item hearts, experience/event/recipe tabs, Circle “Saved”, Saved Addresses.
2. **L2** — Saved list is own-resource; restaurant vs item are distinct; add/remove are idempotent; login required; empty/error states; no recommendation engine.
3. **L3/L4** — Matrix + smallest coherent slice. Auto-resolved: reuse `Favourite`; do not copy client `userId` or GET lat/long.

**Hard rules:** No Home V2, RAG, moods, cravings, curations, geo, addresses, checkout, payment, order/delivery machines, wallet, loyalty, referrals, reservations, experiences, celebrations.

---

## 1. L1 — Legacy reality

Favorites is **one** backend, `/favourites`, storing ID arrays on the user record (`favourites`, `itemFav`, `experienceFav`, `eventFav`, recipe aliases). There is **no separate wishlist/bookmark product**. “wishlist” is an aria-label. Circle → “Saved” is `route: null` (social placeholder). “Saved Addresses” is `/address`, unrelated. “Favorite Cuisines” is onboarding preference, unrelated.

| Entity      | POST body                  | GET `val`              | UI                                                        |
| ----------- | -------------------------- | ---------------------- | --------------------------------------------------------- |
| Restaurant  | `{ restaurant_id }`        | `1`                    | Hearts + profile Restaurant tab + Home 1 carousel         |
| Menu item   | `{ itemId }`               | `4`                    | Menu/cart hearts + profile Food Item tab + menu accordion |
| Celebration | `{ expId }`                | `6`                    | Experiences (STOP) + dual `likedExperiences` PATCH        |
| Event       | `{ eventId }`              | `7`                    | Events (STOP)                                             |
| Recipe      | `{ recipeId }` remove only | none                   | Tab exists; **no add, no list load**                      |
| Offer       | backend-named `offerFav`   | unused in this web app | none                                                      |

**Mutate:** `POST /favourites?add=true|remove=true` with JWT. **No lat/long.** **No client userId in body.**

**List:** `GET /favourites/:userId?val=&user=true&lat=&long=` — **client-supplied userId**. Lat/long always appended; Home sends **empty strings** when location is unknown. Client does not block list or mutate without geo.

**Login:** guests cannot toggle (registration modal) or open the profile hub (“Please login to view your favorites”). No guest/offline queue.

**Removal:** toggle from local ID list. Some legacy cart/menu paths invert add/remove after optimistic update (bug). Newer menu code uses pre-update state.

**Downstream:** Home 1 restaurant carousel (display only). Menu/cart accordion intersects `itemFav` with the **current restaurant menu**. Profile hub has client-side dietary filters on already-fetched favorite **records**, not Nest discovery. **Does not** change discovery ranking, cart contents, checkout, payment, or order placement.

---

## 2. L2 — Industry (not branding)

- Heart/save on restaurant and, separately, on items
- Authenticated own-resource only
- Idempotent add and remove (PUT/POST + DELETE, not query-flag toggle)
- Dedicated saved list + empty state
- Loading / error + retry; no silent local-only source of truth
- List does **not** require the user’s current map pin
- Saved does not reorder the public catalog unless a later personalization product says so

Not in scope: recommendation tables, “for you” ranking, mood/craving rails.

---

## 3. L3 — Gap

| Behavior                       | LEGACY                              | INDUSTRY          | TARGET                       | CLASS                     |
| ------------------------------ | ----------------------------------- | ----------------- | ---------------------------- | ------------------------- |
| Ownership                      | GET path `:userId`                  | Token subject     | JWT `sub` only               | **CORRECT**               |
| Restaurant save                | `favourites[]`                      | Common            | `Favourite` `RESTAURANT`     | **PRESERVE**              |
| Item save                      | `itemFav[]`                         | Common            | `Favourite` `MENU_ITEM`      | **PRESERVE**              |
| Mutate geo                     | None                                | None              | None                         | **PRESERVE**              |
| List geo                       | Query always present; empty allowed | Not required      | **No lat/long**              | **CORRECT** (do not copy) |
| Add/remove                     | `?add`/`?remove` + inverted bugs    | Idempotent        | Explicit add + delete        | **IMPROVE**               |
| Offers                         | Schema-named, no consumer UI        | Optional          | Enum exists; **not on HTTP** | **FUTURE**                |
| Events / experiences / recipes | Partial / dual / dead               | Separate products | STOP list                    | **FUTURE**                |
| Home carousel                  | Food home `FavouritesSection`       | Sometimes         | Do not change Home 1 / V2    | **FUTURE**                |
| Menu/cart accordion            | Intersect with current menu         | Nice-to-have      | Not this slice               | **FUTURE**                |
| Discovery ranking              | None                                | Usually none      | None                         | **PRESERVE**              |
| Ordering                       | Hearts on checkout header only      | Independent       | No cart/checkout change      | **PRESERVE**              |
| Font                           | Mulish                              | One family        | Inter                        | **CORRECT**               |

Doc 95 marked favorites 🟡 as “New CRUD + legacy geo.” Forensic result: **geo is not required** to add, remove, or list. That is not a target dependency.

---

## 4. Auto-resolved

| Topic                       | Resolution                                                                                                                             | Why                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| New table?                  | **No**                                                                                                                                 | `Favourite(userId, targetType, targetId)` + unique already migrated |
| First types                 | `RESTAURANT` + `MENU_ITEM` only                                                                                                        | The two food surfaces that actually work; enum already has them     |
| `OFFER`                     | Stored enum unused on HTTP                                                                                                             | No consumer UI; do not invent                                       |
| Event / experience / recipe | Out                                                                                                                                    | STOP list + incomplete legacy                                       |
| Geo                         | Forbidden on this HTTP                                                                                                                 | Mutations never sent it; list already tolerates blanks              |
| Hydration                   | Server may join existing `Restaurant` / `MenuItem` public fields, or client uses `/discover/restaurants/:id` and `/discover/items/:id` | No new catalog                                                      |
| Home / cart                 | Unchanged                                                                                                                              | Avoid discovery + ordering                                          |

---

## 5. L4 — Target contract (smallest slice)

### 5.1 Data

Existing `Favourite` only. No schema change. `targetId` stays polymorphic UUID (`Restaurant.id` or `MenuItem.id`). Validate the target exists and is consumer-visible on write. Orphans from later unpublish: omit or mark unavailable on list; do not invent a new status machine.

### 5.2 HTTP — JWT subject owns every row

`JwtConsumerGuard`. Reject client `userId` / `id` ownership fields.

| Method   | Path                                         | Behavior                                                                                                                      |
| -------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/me/favorites`                       | Own bookmarks. Optional `?targetType=RESTAURANT\|MENU_ITEM`. Newest first.                                                    |
| `PUT`    | `/api/v1/me/favorites`                       | Body `{ targetType, targetId }`. Idempotent add. 200 if already present. Unknown type / bad UUID → 400. Missing target → 404. |
| `DELETE` | `/api/v1/me/favorites/:targetType/:targetId` | Idempotent remove. 200 if already absent.                                                                                     |

Unauthenticated → 401. Consumer A cannot read or write B.

List item shape (minimum):

```json
{
  "id": "uuid",
  "targetType": "RESTAURANT",
  "targetId": "uuid",
  "createdAt": "ISO-8601",
  "restaurant": { "id": "uuid", "name": "…", "city": null, "status": "ACTIVE" },
  "item": null
}
```

For `MENU_ITEM`, `item` uses the existing discover item fields (`id`, `name`, `restaurantId`, availability); `restaurant` may be null. Do not attach distance, rank, or recommendation scores.

### 5.3 UI (`apps/web`)

- Heart on existing restaurant and item screens (design-system `Button`/`Chip`; Inter + `--ame-*`)
- `/favorites` list: Restaurants / Items, empty / loading / error, persist after reload
- Entry from existing Profile navigation (do not add a Home rail; do not redesign nav)
- Guest tap → sign-in with `next=/favorites` or current restaurant/item
- Save/unsave visible success or error; list and heart stay consistent after reload

### 5.4 Out of scope

Geo/maps, Home V2 / Home 1 carousel, moods/cravings/curations, dietary-filtered discovery, cart accordion, checkout header heart, addresses, wallet, offers HTTP, events/experiences/recipes, guest favorites, recommendation engines.

---

## 6. Owner decisions (do not guess; not blockers for this slice)

1. Whether `OFFER` favorites ever become a consumer surface.
2. Whether event/experience/recipe favorites return after those products exist on Nest.
3. Whether Home later shows a saved rail (that is Home product, not this CRUD).
4. Whether a later slice intersects saved items with the open restaurant menu.

---

## 7. IMPLEMENT NOW — minimal change list

1. Nest module (mirror `ConsumerProfileModule`): repository on `prisma.favourite` + JWT controller.
2. Focused e2e: unauth 401, isolation, idempotent add/remove, unknown type 400, missing target 404, type filter, persistence.
3. Web: hearts on `RestaurantScreen` / `ItemScreen`, `/favorites` list, Profile link.
4. No Prisma migration. No discovery/order/payment edits.
