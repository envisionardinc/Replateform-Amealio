# 98 — Consumer Saved Addresses Target Behavior Contract

**Status:** CONTRACT + implementation  
**Date:** 2026-09-05  
**Brand:** amealio  
**Rule:** [../00-BEHAVIORAL-RECONCILIATION-RULE.md](../00-BEHAVIORAL-RECONCILIATION-RULE.md)  
**Depends on:** [93](../93-AMEALIO-FRONTEND-DESIGN-SYSTEM-RECONCILIATION.md), [96](./96-CONSUMER-PROFILE-DIETARY-PREFERENCES-TARGET-BEHAVIOR-CONTRACT.md)

Favorites / Saved is closed ([97](./97-CONSUMER-FAVORITES-SAVED-TARGET-BEHAVIOR-CONTRACT.md)). Do not reopen it.

This document answers whether **saved-address management** can exist as an independent consumer CRUD surface on the existing Prisma `Address` model, without coupling it to checkout, geo, or maps.

**Decision: IMPLEMENT NOW** — standalone address book only. No schema change. No maps. No geocoder.

**Checkout integration is OUT OF SCOPE for this slice.**

---

## 0. Method

1. **L1** — Traced `amealio_web_app` `/Profile/saved-addresses`, `/address` (`Mapsetup.js`), checkout `DeliveryAddressModal` / `AddressForm.jsx`, cart `address_id`, navbar `userLocation`. Traced Feathers/Mongo `amealio-vendordashboard` `/address` (`src/services/addess/address.class.ts`, `src/models/address.model.ts`). Traced target `Address`, `Order.deliveryAddressId`, checkout/cart DTOs, consumer JWT `/me/*`.
2. **L2** — Saved-address book is own-resource CRUD; default is a book marker, not a checkout contract; coordinates are optional metadata; maps are a later delivery concern.
3. **L3/L4** — Matrix + smallest coherent slice. Auto-resolved: reuse `Address`; JWT `sub` owns every row; omit `lat`/`lon` from HTTP this slice.

**Hard rules:** No Home V2, RAG, moods, cravings, curations, guest cart, OTP, tax, geo, maps, geocoding, location permissions, checkout, `deliveryAddressId` writes, Order/Payment/Delivery changes, wallet, loyalty, referrals, reservations, experiences, celebrations, Favorites changes.

Three legacy features must stay three features:

| Lane | What it is | This slice |
| ---- | ---------- | ---------- |
| **A. Saved-address management** | Authenticated CRUD of the user's address book | **IN** |
| **B. Checkout address selection** | Cart `address_id` → order `deliveryAddress` | **OUT** |
| **C. Browse / delivery geolocation** | `localStorage.userLocation`, maps, lastLocation GeoJSON | **OUT** |

They must not be treated as one product.

---

## 1. L1 — Legacy reality

### 1.1 A. Saved-address management (real CRUD)

**UI that actually persists**

- Profile book: `/Profile/saved-addresses` (`SavedAddresses.js`) — list, add, edit, delete.
- Shared form: `AddressForm.jsx` (also opened from checkout modal). Same POST/PATCH `/address`.
- Route `/address` (`Mapsetup.js`) is a **broken stub**. Save has no handler. Do not treat it as the product.

**API (Feathers/Mongo in `amealio-vendordashboard`, not Nest)**

| Method | Path | Persistence |
| ------ | ---- | ----------- |
| `GET` | `/address` | JWT required. Returns `{ addressLocations: [] }` from `User.addressLocations` populate. Does **not** enrich a default flag on each row. |
| `POST` | `/address` | JWT required. Creates an Address document, then `$push`es its id onto `User.addressLocations`. Consumer path uses JWT `sub` + `isUser: true`. Merchant path may send `user_id`. |
| `PATCH` | `/address/:id` | JWT required to authenticate. Updates **any** Address `_id`. **Does not check that the id is in the caller's `addressLocations`.** IDOR. |
| `DELETE` | `/address/:id` | JWT required. `$pull`s the id from the caller's `addressLocations`. If it was `User.defaultAddress`, that field is set to `null`. **The Address Mongo document is not deleted.** |

The Address document has **no `user_id` field**. Ownership is a User-side array, not a foreign key on the address.

**Fields that persist** (Mongoose schema): `name`, `type`, `address1`, `address2`, `area`, `locality`, `city`, `state`, `active`, `default`, `location.{latitude,longitude}` (strings), `pincode` (Number), `place_id`, `landmark`, `locationPhotos`, `additionalInstructions`, `isTemp`, timestamps.

**Fields the UI collects that Mongoose drops:** `mobile`, `contactName` (and `isUser` is a create flag, not stored). They are not in the schema. Display of `addr.mobile` on some screens is leftover client shape, not persistence.

**Labels / types:** UI chips HOME / OFFICE / OTHER. `type` is `HOME` / `OFFICES` / `OTHERS`. `name` is the display label (`Home`, `Office`, or free text for Other).

**Validation**

- Server: auth header on create/list; no required lat/lng; no required city/pin; `normalizeAddressPayload` only aliases landmark / photos / instructions.
- Client add/edit (`AddressForm.validateForm`): building/flat required; area **or** locality required; Other requires a name. Coordinates are **not** required by this validator. Empty-string lat/lng are sent when the map step has no pin.

**Add UX is map-first** (`SavedAddresses.handleAddAddress` → step `'map'`). That is product UX, not an API rule. Edit skips the map and opens details. The API accepts an address with blank coordinates.

**Login:** CRUD requires a token. Guest add opens registration (`useRequireAuth`).

**Delete UX:** action-sheet “Delete address” fires DELETE immediately. **No confirmation dialog.**

**Default from this screen:** consumer web does **not** send `default: true` on create. `AddressForm` copies `initialAddress.default` (usually false/undefined). GET `/address` does not return `User.defaultAddress`. The profile book does not expose “set as default.”

### 1.2 B. Checkout address selection (separate)

- Cart `PUT` accepts `{ address_id }` and **does** check membership in `userInfo.addressLocations` (`cart.class.ts`). Foreign ids are rejected there.
- Checkout copies cart `address_id` onto the order as `deliveryAddress` — a **live ObjectId**, not a snapshot. Editing a saved address later changes what historical orders display when populated.
- This is not the navbar location picker.

Target checkout/cart DTOs have **no** address fields. `Order.deliveryAddressId` exists on Prisma and is unused by Nest ordering code. Wiring B would change ordering. That is a later slice.

### 1.3 C. Browse / delivery geolocation (separate)

- Navbar / `MapLocationDrawer` writes `localStorage.userLocation` and Redux location.
- Selecting a saved address on the profile book (`handleSelectAddress`) updates **browse location** and navigates `/home`. It does **not** write cart `address_id`.
- `User.lastLocation` GeoJSON is a different field from the address book.
- Delivery/maps/geocoding live here. STOP for this slice.

### 1.4 Legacy ownership / security (evidence)

| Case | Legacy |
| ---- | ------ |
| No token | 401 on GET/POST; PATCH/DELETE verify JWT and fail without it |
| Own list | GET uses JWT `sub` — **not** `/address/:userId` |
| Create as consumer | Owner = JWT `sub` when `isUser` |
| Create as merchant helper | May attach via body `user_id` (staff path; do not copy to consumer) |
| PATCH foreign id | **Succeeds** if the document exists (IDOR) |
| DELETE foreign id | Unlinks from caller only; if the id was never linked, pull is a no-op; document remains |
| Default write | Backend can set `User.defaultAddress` + flip `default` on siblings **if** `default: true` is sent. Consumer profile book does not send it. |

---

## 2. L2 — Industry benchmark (address book only)

Not maps. Not checkout. Benchmark is the **saved-address book**.

Modern consumer address books (food delivery and commerce account pages) share:

- Authenticated **CRUD** on `/me/addresses` (or equivalent). Token subject owns the rows. Never `/addresses/:userId` as the ownership mechanism.
- **Labels** (Home / Work / Other, or free text).
- Optional **one default** per user, maintained in the book (setting default clears the previous). Using that default at checkout is a **separate** checkout concern.
- Structured fields: line1 (required), optional line2, city, state, postal code. Country often implicit for a single-market app.
- **Validation** of required text fields. Coordinates, place ids, and photos are optional metadata — not a save prerequisite.
- **Ownership isolation:** unauthenticated → 401; another user's id → 404 (do not leak existence); unknown keys rejected.
- **Delete confirmation** on mobile/account UIs.
- Soft-delete or hide, so historical order references do not break if checkout later snapshots or points at an id.
- Recipient / phone / delivery instructions are common **when checkout needs them**. They are not required to have an address book.

Industry treats “save an address” and “deliver to this address” as two steps. Do not invent a geocoder to complete a book.

---

## 3. L2 — Target reality

### 3.1 Prisma `Address` (already migrated)

```
Address
  id            Uuid PK
  legacyId      String? @unique
  userId        Uuid → User CASCADE
  label         String?
  line1         String          // required
  line2         String?
  city          String?
  state         String?
  pinCode       String?
  lat           Float?
  lon           Float?
  isDefault     Boolean @default(false)
  createdAt     DateTime
  updatedAt     DateTime
  deletedAt     DateTime?
  orders        Order[]
  @@index([userId])
```

| Question | Answer |
| -------- | ------ |
| User ownership? | **Yes** — `userId` FK, indexed, cascade delete with user |
| Address fields? | **Yes** — line1 required; line2/city/state/pinCode optional |
| Default marker? | **Yes** — `isDefault`. **No** unique-per-user DB constraint |
| Coordinates? | **Optional** `lat`/`lon`. Seed omits them |
| Soft delete? | Column exists (`deletedAt`). Unused by app code |
| Timestamps? | `createdAt` / `updatedAt` |
| Recipient / contact / instructions / country / photos? | **No** |
| Merchant coupling? | **No** |
| Order coupling? | Optional unused `Order.deliveryAddressId` → `Address`. Schema-only |

Seed creates one default address for the synthetic consumer (`line1`, `city`, `pinCode`, `isDefault: true`) with **no** coordinates.

### 3.2 HTTP / services

- **No** Nest Address module. **No** consumer Address controller. **No** Address DTO.
- Consumer JWT pattern already exists: `GET/PATCH /api/v1/me/profile`, `GET/PUT/DELETE /api/v1/me/favorites` (`JwtConsumerGuard`, `CurrentUser`, reject client `userId`).
- Global `ValidationPipe({ forbidNonWhitelisted: true })`.

### 3.3 Checkout / cart / delivery

- `CheckoutDto` / cart DTOs: no `addressId`, no `deliveryAddressId`, no line fields.
- `apps/api/src/modules/ordering` does not read or write `deliveryAddressId`.
- Cart has no address column.
- Delivery module is rider/session, not consumer address book.

### 3.4 Web

- No `/addresses` route. Profile links to Favorites only (`ProfileScreen`).
- Design system + Inter already in use.

**Can the existing Address model support standalone consumer address CRUD?** **Yes.** Ownership, lines, optional default, optional coordinates, soft-delete column, and timestamps are already there. Nothing in the model requires checkout or geo to persist a row.

---

## 4. Geo question

| Claim | Evidence |
| ----- | -------- |
| Required to save (API)? | **No.** Legacy Mongoose does not require `location`. Empty strings are stored. Target `lat`/`lon` are optional. Seed writes addresses without them. |
| Required by add UI? | Legacy add is **map-first**. That is UX, not persistence. Edit does not require a new pin. Client validator does not require coords. |
| Generated later? | Legacy may fill them when the user picks a map point. Nothing geocodes on the server from text. |
| Required only for delivery / browse? | **Yes.** Cart/delivery and navbar location use coords when present. Those are lanes B and C. |
| Used by target persistence today? | Columns exist. App HTTP does not write them. |

**Conclusion:** Address CRUD can function without geo, maps, geocoding, or location permissions. Do not introduce a map or geocoder because legacy documents sometimes contain coordinates.

This slice: **omit `lat` / `lon` from HTTP.** Do not accept them, do not generate them, do not display a map. Columns stay unused until a later geo-aware slice (STOP).

---

## 5. Default address

| Layer | Finding |
| ----- | ------- |
| Legacy backend | Can store `User.defaultAddress` and flip sibling `default` flags when `default: true` is sent. |
| Legacy consumer book | Does **not** send `default: true`. GET `/address` does not expose the user default. Profile book has no “default” control. |
| Legacy checkout | Uses explicitly selected `address_id`, not “the default.” |
| Target model | `isDefault` exists. Multiple rows can be true unless the app clears siblings. No DB unique. |

**Meaningful default?** Backend capability exists; consumer book barely uses it. Industry still expects one optional default in the book.

**Safe on the book without checkout?** **Yes.** Application rule: when a write sets `isDefault: true`, clear `isDefault` on the user's other non-deleted addresses in the same transaction. First address may default to `true` if the user has none.

**Using the default at checkout** is a **FUTURE** dependency of lane B. Not this slice.

---

## 6. Critical decoupling test

Can these exist without changing checkout, Order writes, Payment, Delivery, geo, or maps?

```
GET    /api/v1/me/addresses
POST   /api/v1/me/addresses
PATCH  /api/v1/me/addresses/:id
DELETE /api/v1/me/addresses/:id
```

**YES.**

`Address.userId` is enough. `Order.deliveryAddressId` stays unused. Checkout DTOs stay unchanged. No geocoder. Doc 95 already flagged “wiring checkout would change ordering; map/geo is STOP.” This contract keeps that split.

Do not invent checkout selection, `deliveryAddressId` writes, or browse-location sync to make the book look complete.

---

## 7. L3 — Gap analysis

| Behavior | LEGACY | INDUSTRY | TARGET (this slice) | CLASS |
| -------- | ------ | -------- | ------------------- | ----- |
| Surface | Profile book + checkout modal share `/address` | Account address book **separate** from checkout attach | Book only; checkout untouched | **PRESERVE** book / **FUTURE** checkout |
| Ownership | JWT list/create; PATCH IDOR; no `user_id` on doc | Token subject; `/me/addresses` | JWT `sub` → `Address.userId`; reject body/path `userId` | **CORRECT** |
| URL shape | `/address`, `/address/:id` | `/me/addresses` | `/api/v1/me/addresses` | **IMPROVE** |
| List | Populate `addressLocations` | Own rows, hide deleted | `userId` + `deletedAt: null` | **IMPROVE** |
| Create | Map-first UI; API accepts blank coords | Text CRUD; coords optional | Text form; `line1` required; no map; no lat/lon on HTTP | **PRESERVE** persist-without-geo / **IMPROVE** drop map-first |
| Edit | PATCH any id | Own id only | PATCH own non-deleted id; foreign → 404 | **CORRECT** |
| Delete | Unlink only; no confirm | Confirm; hide or soft-delete | Soft-delete `deletedAt`; idempotent; UI confirm | **IMPROVE** |
| Default | Backend yes; book UI unused | One default in book | `isDefault` with sibling-clear; not used at checkout | **PRESERVE** capability / **FUTURE** checkout use |
| Labels | `type` + `name` | Label chips | `label` string only (chips write the string) | **PRESERVE** intent / **IMPROVE** single field |
| Lines | address1/2, area, locality, city, state, pin | line1/2, city, state, postal | `line1` + optional `line2`, `city`, `state`, `pinCode` | **PRESERVE** |
| Country | Absent | Often implicit | Absent — do not add | **PRESERVE** |
| Recipient / phone | UI collects; **schema drops** | Common at checkout | Not on model — do not invent | **FUTURE** / **OWNER DECISION** |
| Instructions / landmark / photos | Persist on Mongo | Optional | Not on model — do not invent | **FUTURE** / **OWNER DECISION** |
| Coordinates | Optional strings; map UX | Optional metadata | Columns exist; **omit from HTTP** | **PRESERVE** optional / **FUTURE** geo |
| `place_id` | Stored | Map vendor lock-in | Not on model | **FUTURE** |
| Order live-ref | Edit saved address mutates historical populate | Snapshot at order | Unused FK; do not wire | **CORRECT** later (snapshot) / **FUTURE** |
| Font | Mulish | One family | Inter | **CORRECT** |
| Guest | Login to mutate | Login | 401 + `next=/addresses` | **PRESERVE** |

---

## 8. Auto-resolved

| Topic | Resolution | Why |
| ----- | ---------- | --- |
| New table / migration? | **No** | `Address` already has ownership, lines, default, soft-delete, timestamps |
| Checkout / `deliveryAddressId` | **Out** | Would change ordering; unused today |
| Geo / maps / geocoder | **Out** | API never required coords; target columns optional and unused |
| HTTP lat/lon | **Omit this slice** | Accepting them is still storage, but omission keeps STOP hard |
| Recipient / phone / instructions | **Out** | Not on Prisma; legacy phone/name did not persist |
| Country | **Out** | Neither model has it |
| Default in the book | **In** | Column exists; app must clear siblings; checkout use is later |
| Soft delete | **In** | Column exists; safer than legacy unlink-only |
| `/addresses/:userId` | **Forbidden** | JWT owns the resource |
| Favorites / Home / Profile identity | **Unchanged** | Closed or STOP |

---

## 9. L4 — Target contract (smallest slice)

### 9.1 Data

Existing `Address` only. No Prisma migration. No new columns for phone, recipient, instructions, country, photos, or place id.

Writes set `userId` from the JWT only.

### 9.2 HTTP — JWT subject owns every row

`JwtConsumerGuard`. Mirror `ConsumerProfileModule` / `ConsumerFavoritesModule`. Reject client `userId` / `legacyId` / `lat` / `lon` / `id` ownership fields (`forbidNonWhitelisted`).

| Method | Path | Behavior |
| ------ | ---- | -------- |
| `GET` | `/api/v1/me/addresses` | Own rows where `deletedAt` is null. Default first, then newest. |
| `POST` | `/api/v1/me/addresses` | Body below. `line1` required (trimmed, non-empty). Creates row. If `isDefault === true` **or** this is the user's first live address, set `isDefault` true and clear siblings. |
| `PATCH` | `/api/v1/me/addresses/:id` | Partial. Own non-deleted row only. Foreign / deleted / unknown UUID → **404** (not 403). If `isDefault` becomes true, clear siblings in a transaction. |
| `DELETE` | `/api/v1/me/addresses/:id` | Soft-delete (`deletedAt = now()`). Idempotent: already deleted or never visible to this user → **200** with the same body as a successful delete (do not leak whether a foreign id existed). If the deleted row was default, leave others unset; do not auto-promote (legacy cleared default to null). |

Unauthenticated → **401**.

Invalid UUID param → **400**. Unknown body keys → **400**. Empty `line1` on POST (or PATCH that sets `line1` to blank) → **400**.

POST/PATCH allowlist:

```json
{
  "label": "Home",
  "line1": "DEV 1 Test Street",
  "line2": null,
  "city": "Bengaluru",
  "state": null,
  "pinCode": "560001",
  "isDefault": false
}
```

All keys except `line1` on POST are optional. `label` / `line2` / `city` / `state` / `pinCode` are nullable strings. Do not accept `userId`, `lat`, `lon`, `legacyId`, `deletedAt`.

List item shape:

```json
{
  "id": "uuid",
  "label": "Home",
  "line1": "DEV 1 Test Street",
  "line2": null,
  "city": "Bengaluru",
  "state": null,
  "pinCode": "560001",
  "isDefault": true,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

Do not return `lat`, `lon`, `legacyId`, `deletedAt`, or `userId`.

### 9.3 Security / ownership

| Case | Expected |
| ---- | -------- |
| No JWT | 401 |
| Another user's address id (GET list) | Omitted |
| Another user's address id (PATCH) | 404 |
| Another user's address id (DELETE) | 200 idempotent; no mutation of their row |
| Soft-deleted own id (PATCH) | 404 |
| Soft-deleted own id (DELETE) | 200 idempotent |
| Default manipulation | Only via `isDefault` on own rows; never a `userId` path |
| Invalid id | 400 if not a UUID; 404 if UUID not visible |

Consumer A cannot read or mutate B.

### 9.4 UI (`apps/web`)

- `/addresses` list + add/edit form. Entry from existing Profile navigation only.
- Design-system components; Inter + `--ame-*`. No Mulish.
- Guest → sign-in with `next=/addresses`.
- Empty / loading / error / persist-after-reload.
- Label chips write `label` (`Home` / `Work` / `Other` + optional free text for Other).
- Required: `line1`. Optional: line2, city, state, pin, label, default checkbox.
- **No map, no geolocation prompt, no place autocomplete.**
- Delete: confirmation, then DELETE.
- Do not write `localStorage.userLocation`. Do not change Home. Do not change checkout or cart.

### 9.5 Out of scope

Checkout address selection, `deliveryAddressId`, cart address, Order/Payment/Delivery, geo, maps, geocoding, location permissions, Home / Home V2, recommendations, Favorites, OTP, recipient/phone/instructions columns, country, photos, `place_id`, order address snapshot vs live-ref.

**Checkout integration is OUT OF SCOPE for this slice.**

---

## 10. Owner decisions (do not guess; not blockers)

1. Whether recipient name / phone / delivery instructions are added to `Address` later (legacy UI collected name/phone but did not persist them).
2. Whether the book default is later used as checkout preselect (lane B).
3. Whether orders should **snapshot** address text instead of live-ref (legacy live-ref is a checkout/history bug to correct later).
4. Whether a later geo slice stores `lat`/`lon` from an explicit user pin (still not a geocoder-by-default).

---

## 11. IMPLEMENT NOW — minimal change list

1. Nest module mirroring Favorites/Profile: repository on `prisma.address` + JWT controller for the four `/api/v1/me/addresses` operations.
2. Default-flag transaction (clear siblings). Soft delete. No migration.
3. Focused e2e: unauth 401, isolation (A cannot PATCH B), create without coords, reject `lat`/`lon`/`userId`, default sibling-clear, soft-delete hides from GET, idempotent DELETE, invalid UUID 400, persist-after-reload.
4. Web: `/addresses` from Profile; text CRUD; delete confirm; Inter. No map.
5. Do not edit Favorites, checkout, Order, Payment, Delivery, Home, or Prisma schema.

If this slice ships, remaining consumer work that still requires an owner decision includes wallet and **checkout ⊕ address** coupling. Do not start those from this contract.
