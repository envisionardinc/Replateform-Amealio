# 94 — Home 1 Taxonomy Target Behavior Contract

**Status:** CONTRACT + implementation (Category rail only)  
**Date:** 2026-09-05  
**Brand:** amealio  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Depends on:** [92](./92-USER-APP-HOME-PAGE-V2-TARGET-BEHAVIOR-CONTRACT.md), [93](../93-AMEALIO-FRONTEND-DESIGN-SYSTEM-RECONCILIATION.md)

Legacy and industry are **evidence**. Do not invent mood / craving / curation semantics.

---

## 0. Method

1. **L1** — Traced `amealio_web_app` `MainHomeScreen`, mood/craving/curation strips and detail pages, Feathers `user-moods` / `user/cravings` / `user-curation`, and target Prisma (`Category`, `Cuisine`, `MenuSection.categoryId`, `Restaurant` with **no** mood/cuisine FKs).
2. **L2** — Dining apps: horizontal filter chips, 44px targets, selected/unselected, empty rail, disabled empty categories, keyboard, skeletons.
3. **L3/L4** — Matrix + contract. Auto-resolved: expose **existing** `Category` rows as Home 1 chips; filter restaurants through **existing** `MenuSection.categoryId`.

**Hard rules:** Home 1 stays the default home. Home Page V2 is not imported. Mulish is not a target font. Inter + `--ame-*` only.

---

## 1. L1 — Legacy Home 1 reality

| Rail                | Legacy source                                               | How restaurants are selected         |
| ------------------- | ----------------------------------------------------------- | ------------------------------------ |
| Moods               | `GET user-moods` → MoodManagement + Sub Category            | `primary_mood` / `selected_mood`     |
| Cravings            | `GET user/cravings`                                         | `primary_cusine` / `selected_cusine` |
| Curations           | `GET user-curation`                                         | `merchant-permotion` restaurant tags |
| Categories          | Food page `GET subcategory` filters — **not** a Home 1 rail | Food listing filters                 |
| Experiences / bytes | Separate home strips                                        | Separate Feathers APIs               |

Selection on home **navigates** to a listing page. Saved prefs live on `user-service` (`selectedMoods` / `selectedCravings` / `selectedCuration`). Geo `$geoNear` is required on those listing APIs.

### Target data that already exists

| Model                     | Home 1 use                                                      |
| ------------------------- | --------------------------------------------------------------- |
| `Category`                | Hierarchical platform taxonomy (legacy Category + Sub Category) |
| `MenuSection.categoryId`  | Real restaurant ↔ category link via menu                        |
| `Cuisine`                 | Lookup only — **no** restaurant FK                              |
| `Experience`              | Staff/experience domain — no consumer home API                  |
| `UserProfile.preferences` | Generic JSON — **not** mood arrays                              |

### Missing (do not invent)

Mood / Craving / Curation tables, restaurant mood/cuisine/tag fields, bytes/reels, geo, dietary prefs HTTP, Home V2 RAG.

---

## 2. L2 — Industry (not branding)

Horizontal chip rail; min 44×44; `aria-pressed`; empty rail does not block the restaurant list; unavailable chip is visible but not selectable; long labels truncate; loading skeletons; retry on error; keyboard-focusable chips; desktop wraps, mobile scrolls.

---

## 3. L3 — Gap matrix

| Behavior                  | LEGACY                               | INDUSTRY               | TARGET                                        | CLASS                                          |
| ------------------------- | ------------------------------------ | ---------------------- | --------------------------------------------- | ---------------------------------------------- |
| Default home              | Moods/cravings/curations + food list | Editorial rails + list | Canonical restaurant list + **Category** rail | **PRESERVE** Home 1 / **IMPROVE** rail         |
| Mood / craving / curation | Mongo catalogs + restaurant fields   | Tagged rails           | **FUTURE** until relations exist              | **FUTURE**                                     |
| Category                  | Food-page filters                    | Chip filter            | Public chips from `Category` + `MenuSection`  | **PRESERVE** data / **IMPROVE** Home 1 surface |
| Cuisine filter            | Restaurant cuisine fields            | Common                 | Lookup only — no FK                           | **FUTURE**                                     |
| Experiences / bytes       | Home strips                          | Content rails          | No consumer HTTP                              | **FUTURE**                                     |
| User saved rails          | `user-service` arrays                | Personalized home      | Not on Nest                                   | **FUTURE**                                     |
| Geo                       | Required lat/long                    | Common                 | Optional city/q only                          | **PRESERVE** (doc 92)                          |
| Home V2                   | Separate route                       | Recs layer             | Not default; not imported                     | **PRESERVE**                                   |
| Empty taxonomy            | Blank row                            | Explicit empty         | Banner; list still loads                      | **IMPROVE**                                    |
| Unavailable category      | Hidden/empty list                    | Disabled chip          | Chip disabled when 0 discoverable restaurants | **IMPROVE**                                    |
| Font                      | Mulish                               | One family             | Inter                                         | **CORRECT** (doc 93)                           |

---

## 4. Auto-resolved

| Topic            | Resolution                                      | Why                                                  |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------- |
| What ships now   | `Category` chips, not fake moods                | Inventing Mood/Craving tables would invent semantics |
| Filter mechanism | `MenuSection.categoryId` (+ descendants)        | Only existing restaurant relation                    |
| Home payload     | Extra `taxonomy` on `GET /api/v1/discover/home` | Keep `sections[0].restaurants` stable                |
| V2               | Forbidden on this slice                         | Doc 92                                               |

---

## 5. Target contract

### 5.1 `GET /api/v1/discover/home`

Query: `city`, `q`, `categoryId` (optional UUID).

```json
{
  "source": "CANONICAL",
  "taxonomy": {
    "kind": "CATEGORY",
    "chips": [
      {
        "id": "uuid",
        "label": "Mains",
        "type": "FOOD",
        "available": true,
        "restaurantCount": 1
      }
    ]
  },
  "sections": [{ "id": "restaurants", "title": "Restaurants near you", "restaurants": [] }]
}
```

- `taxonomy.chips` = non-deleted `Category` rows that have a `code` and `type = FOOD` (platform food catalog). Seating-area and other `Category.type` values are not Home 1 chips. Filter still uses `MenuSection.categoryId`.
- `available` is true iff at least one ACTIVE, not-deleted restaurant has a menu section in that category (or a child) with a published item.
- `categoryId` filters `sections[0].restaurants` only. Unknown/unavailable id → empty restaurant list, chips unchanged.
- Empty `chips` → UI empty banner; restaurant list still returns.

`GET /api/v1/discover/restaurants` accepts the same `categoryId`.

Staff catalog write APIs are unchanged.

### 5.2 UI (`apps/web` Home)

Chip rail above the restaurant list. Select toggles one category (deselect = all). Disabled chips are not selectable. Inter + `--ame-*`. No Mulish. No V2 import.

### 5.3 Out of scope

Guest cart, geo, OTP, tax, V2 RAG, offers, moods/cravings/curations tables, bytes, experience booking, dietary prefs.

---

## 6. Owner decisions (do not guess)

1. When (if) to migrate Mood / Craving / Curation as first-class entities.
2. Whether Cuisine should gain a restaurant FK.
3. OD-8 RecommendationProvider (still FUTURE).
