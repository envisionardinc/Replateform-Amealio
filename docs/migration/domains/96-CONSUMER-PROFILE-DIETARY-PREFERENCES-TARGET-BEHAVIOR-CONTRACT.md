# 96 — Consumer Profile + Dietary Preferences Target Behavior Contract

**Status:** CONTRACT + implementation  
**Date:** 2026-09-05  
**Brand:** amealio  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Depends on:** [37](./37-ONBOARDING-USER-PROFILE-FOUNDATION.md), [93](../93-AMEALIO-FRONTEND-DESIGN-SYSTEM-RECONCILIATION.md)

Order tracking is closed. This slice is the next existing consumer surface that already has a target model.

---

## 0. Method

1. **L1** — Traced `amealio_web_app` `/profile/new`, `HealthPreferenceFlow`, `UserPreferenceFlow`, `PATCH user-service/:id` (`dietary_preference`, `do_you_have_allergies`, `allergies_flag`). Traced target `User`, `UserProfile`, `UserProfileService` (no HTTP), consumer JWT `/auth/consumer/me`.
2. **L2** — Profile is own-resource only; explicit PATCH fields; omitted = unchanged; unknown keys rejected; dietary labels are preferences, not medical claims.
3. **L3/L4** — Matrix + contract. Auto-resolved: reuse `UserProfile.preferences` Json; no new table.

**Hard rules:** No Home V2, moods, cravings, guest cart, OTP, tax, geo, addresses, wallet, checkout/payment, order/delivery machines.

---

## 1. L1 — Legacy reality

| Topic | Legacy |
| ----- | ------ |
| Profile hub | `/profile/new` — menu of links; many rows `route: null` |
| Identity | Phone + optional email on `users` / `user-service` |
| Dietary | Health flow picks subcategory IDs → `dietary_preference` (array) |
| Allergies | Separate step → `do_you_have_allergies` (IDs) + `allergies_flag` |
| Persistence | `PATCH user-service/:userId` with client-supplied user id |
| Completion | Frontend writes `profile_percentage` / `have_submited_details_profile` |
| Downstream | Cart/checkout *may* copy allergies into the order notes; favorites filter by dietary; **no Nest discovery filter** |
| Phone change | OTP / WhatsApp |

Target already has: `User` (phone, email, isVerified), `UserProfile` 1:1 (`detailsSubmitted`, `completionPercentage`, `preferences Json`). Service `getProfile` / `updateState` / `mergePreferences` is userId-keyed and integration-tested. **No consumer HTTP.**

The Json bag does **not** distinguish medical restriction vs taste vs allergy. Legacy also mixed those into loosely named arrays.

---

## 2. L2 — Industry (not branding)

- `GET/PATCH /me/profile` — subject is the access token, never a body `userId`
- Partial PATCH; unknown properties 400
- Phone change is a verified credential flow (OTP) — not a free text field
- Dietary chips are preferences; allergy copy must not claim clinical safety
- Loading / empty / error / persist-after-reload

---

## 3. L3 — Gap

| Behavior | LEGACY | INDUSTRY | TARGET | CLASS |
| -------- | ------ | -------- | ------ | ----- |
| Ownership | Client sends `userId` | Token subject | JWT `sub` only | **CORRECT** |
| Identity edit | Name/photo/DOB/location | Verified fields | Email optional; phone read-only (OTP FUTURE) | **PRESERVE** phone / **IMPROVE** email |
| Dietary | Subcategory IDs | Labels or catalog | `preferences.dietary_preferences` string[] (existing key) | **PRESERVE** representation |
| Allergies | ID array + flag | Separate, no safety claim | `preferences.allergies` string[] in same Json | **IMPROVE** (labels, not invented medical model) |
| Schema split restriction vs allergy vs taste | Mixed | Often split | **Not distinguished in Prisma** — document, do not redesign | **FUTURE** / **OWNER DECISION** |
| Completion % | Client-written | Server-derived or omitted | Read-only; not PATCH-able | **CORRECT** |
| Cuisine / celebration / mood | Same user-service | Personalization | Not on this HTTP | **FUTURE** |
| Discovery use | Partial filters | Common | Not wired | **FUTURE** |
| Font | Mulish | One family | Inter | **CORRECT** |

---

## 4. Auto-resolved

| Topic | Resolution | Why |
| ----- | ---------- | --- |
| New table? | **No** | `UserProfile.preferences` already holds these arrays (doc 37) |
| Canonical dietary key | `dietary_preferences` | Used by target foundation tests; singular `dietary_preference` is legacy alias only |
| Completion / submitted | Read-only | Doc 37: computation is an owner/workflow decision; do not copy FE writes |
| Cuisine / celebration keys | Unchanged on disk; not in PATCH allowlist | STOP list + no personalization engine |

---

## 5. L4 — Target contract

### 5.1 `GET /api/v1/me/profile`

`JwtConsumerGuard`. Subject = `principal.userId`.

```json
{
  "userId": "uuid",
  "phoneCountryCode": "+91",
  "phone": "9xxxxxxxxx",
  "email": "dev.user@example.test",
  "isVerified": false,
  "detailsSubmitted": false,
  "completionPercentage": 0,
  "preferences": {
    "dietary_preferences": ["Vegetarian"],
    "allergies": ["Nuts"]
  }
}
```

- Missing profile row → defaults (`detailsSubmitted=false`, `completionPercentage=0`, empty preference arrays). No invented user.
- Unauthenticated → 401.
- Response preference object contains **only** allowlisted keys. Other Json keys remain stored and are preserved on merge.

### 5.2 `PATCH /api/v1/me/profile`

Same guard. **No `userId` / `id` field.** Unknown properties → 400 (`forbidNonWhitelisted`).

| Field | Omitted | Value | `null` |
| ----- | ------- | ----- | ------ |
| `email` | unchanged | set (unique) | clear |
| `preferences.dietary_preferences` | unchanged | replace string[] (max 10, trimmed) | clear key |
| `preferences.allergies` | unchanged | replace string[] (max 10, trimmed) | clear key |

Rejected (400): `userId`, `detailsSubmitted`, `completionPercentage`, `phone`, `preferences.selected_cuisine`, `preferences.celebration_subcategory`, any other key.

Empty body `{}` is a no-op 200.

Dietary/allergy strings are **labels**, not catalog FKs and not a safety guarantee.

### 5.3 UI (`apps/web` `/profile`)

View phone (read-only), edit email, toggle dietary chips, edit allergy labels, save, loading/success/error, reload proves persistence. Link from existing header/tabbar. Inter + `--ame-*`.

### 5.4 Out of scope

Addresses, wallet, OTP phone change, name/photo/DOB, moods/cravings/curations, cuisine engine, discovery filtering, checkout copy of allergies, celebrations.

---

## 6. Owner decisions (do not guess)

1. When (if) to normalize dietary/allergy into typed columns or medical vs taste.
2. Server rule for `completionPercentage`.
3. Whether discovery/menu should ever filter on these labels.
