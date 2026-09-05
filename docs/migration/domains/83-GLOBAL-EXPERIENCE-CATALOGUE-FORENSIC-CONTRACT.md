# 83 — Global Experience Catalogue Forensic Contract

**Status:** FORENSIC / RECONCILIATION ONLY — NOT IMPLEMENTATION PERMISSION  
**Date:** 2026-09-04  
**Target branch:** `replatform/backend-consolidation`  
**Prior context:** docs 48, 49, 75; Global Item Catalogue slice (`b67f945`)

## Purpose

Establish what the legacy **platform Global Experience Catalogue** actually is, how merchants reuse it, and the minimum target contract required to preserve verified capability — without inventing sync, lineage, or propagation behavior.

No production code, schema, or API is changed by this document.

---

## 1. Status

| Dimension | Verdict |
|---|---|
| Forensic reconstruction | COMPLETE for verified UI + `/experience-media` + merchant clone paths |
| Target platform Experience Catalogue module | ABSENT |
| Merchant Experience module | PRESENT (`apps/api/src/modules/experience/`) — restaurant-scoped only |
| Permission to implement platform Experience Catalogue | **BLOCKED** until this contract is reviewed |

---

## 2. Executive conclusion

The Super Admin UI area labeled **Experience Catalogue** (`ExperienceCatalog/`) is **not** a catalogue of complete merchant Experiences.

It is primarily a **platform-owned Experience Media Folder catalogue**:

- Mongo collection/model name: `experience_catalog`
- Feathers service path: `/experience-media`
- Each record is a **folder** of reusable metadata + photo/video URLs (S3 links), keyed by category/subcategory
- Merchants discover folders during experience creation and **client-side copy** selected fields into a new merchant `Experience` form
- Persistence of the merchant result is ordinary `POST /experience` / `PATCH /experience/:id` — **no server-side materialize endpoint** and **no proven source lineage** on the merchant Experience

Separately, merchants can also **clone an existing merchant Experience** (same vendor) via `ClonePopup` → `GET /experience/:id` → form repopulation. That path is **merchant-to-merchant copy**, not platform catalogue reuse.

A **secondary** legacy system (`/media-catalogue`, `/merchant/media-catalogue`, `/admin/media-usage`) exists with a similar media-folder shape and usage tracking (`isUsed` / `usedBy`). The Super Admin Experience Catalogue screens traced here call **`/experience-media` only**, not `/media-catalogue`. Do not collapse the two systems without further product review.

```text
PLATFORM GLOBAL EXPERIENCE CONTENT
  = experience_catalog /experience-media folders
  + photos[] / videos[] URL bags
  + folder metadata (name, description, tags, T&Cs, benefits)
                |
                | client-side URL + metadata copy (no binary copy; no lineage field)
                v
MERCHANT / RESTAURANT EXPERIENCE
  = Experience (vendorId + restaurantId)
  + operational config (tickets, seating, timings, packages, …)
```

---

## 3. Legacy UI evidence

### 3.1 Super Admin — Experience Catalogue surface

Repo: `amealiodashboardmvp-`  
Path: `client/src/components/superAdminComponents/superAdminAllComponent/SuperAdminExperience/ExperienceCatalog/`

| Component | Role |
|---|---|
| `MediaManagement.js` | Lists folders via `GET /experience-media?page&limit&search`; tabs Media / In Use / Archived / AI Generated |
| `AddExperienceFolder.js` | Create `POST /experience-media`; edit `PATCH /experience-media/:id`; load `GET /experience-media/:id` |
| `MediaCatalogue.js` | Folder detail labeled “{name} Experience Catalogue”; lists non-archived photos/videos; soft-archives via `DELETE /experience-media/:id/media` |
| `AddPhotos.js` | Uploads S3 URLs then `PUT /experience-media` with `{ _id, photos: string[] }` |
| `AddVideos.js` | Same for videos: `PUT /experience-media` with `{ _id, videos: string[] }` |
| `AiGenrationPopup.js` | Calls external amealio generators, then `PUT /experience-media` to append generated URL |

Routes (`Routes.js`):

- `/superadmin/experience/media/management`
- `/superadmin/experience/media/addfolder`
- `/superadmin/experience/media/editfolder/:id`
- `/superadmin/experience/media/catalogue/:id`
- `/superadmin/experience/media/addphotos/:id`
- `/superadmin/experience/media/addvideos/:id`

**AddExperienceFolder create constraints (UI):** category filter prefers title `"Occassion"` from `GET /category?code=FIXED`; subcategory from `GET /subcategory?category_id=…&status=APPROVED`; keywords/tags required (≥1).

**MediaManagement tab semantics (client-side):** intended buckets use `restaurants[]`, `is_ai_generated`, and archived media flags. However `find()` returns **minimal projection** (`_id`, `exp_folder_name`, `category.title`, `no_of_items`) — so list-page tab filtering by photos/restaurants/AI is **structurally unreliable** against the current list API. Treat tab behavior as UI intent; detail comes from `GET /experience-media/:id`.

### 3.2 Merchant — Create Experience clone surfaces

Repo: `amealiodashboardmvp-`  
Path: `client/src/components/vendorDashboardComponents/Experiences/CreateExperiences/`

| Component | Role |
|---|---|
| `CreateExpericence.js` | Hosts clone handlers; creates/updates merchant Experience via `/experience` |
| `ClonePopup.js` | Search/select **merchant Experiences** (`recentList` / search) |
| `CloneFolderPopup.js` | Search/select **platform experience-media folders** |

UI copy: “Search or Select Folder to Copy” / “Search or Select Experience to Copy”.

---

## 4. Legacy backend evidence

Repo: `amealio-vendordashboard`

### 4.1 Primary system — Experience Media (`experience_catalog`)

| Artifact | Path |
|---|---|
| Model | `src/models/experience_media.model.ts` — `mongoose.model("experience_catalog", …)` |
| Service class | `src/services/experience-media/experience_media.class.ts` |
| Registration | `src/services/experience-media/experience_media.service.ts` → `app.use("/experience-media", …)` + custom `DELETE /experience-media/:id/media` |
| Hooks | `experience_media.hooks.ts` — create requires `exp_folder_name`, `category`, `subcategory`; **no auth hooks** (auth in class methods) |

### 4.2 Secondary system — Media Catalogue (distinct)

| Artifact | Path |
|---|---|
| Model | `src/models/media-catalogues.model.ts` — `media-catalogue` |
| Admin service | `/media-catalogue` |
| Merchant discovery | `/merchant/media-catalogue` (requires vendor role + category/subCategory query) |
| Admin usage | `/admin/media-usage` |

Fields include `isUsed` / `usedBy` on media entries — stronger usage tracking than `experience_catalog.restaurants[]`. **Not wired into the ExperienceCatalog Super Admin UI traced above.**

### 4.3 Merchant Experience (operational)

| Artifact | Path |
|---|---|
| Model | `src/models/experience.model.ts` |
| Service | `src/services/experience/experience.class.ts` |
| Path | `/experience` |

Scoped by `vendorId` / `restaurantId`. Media fields are plain URL string arrays (`photos`, `videos`, `promotional_videos`). No `sourceFolderId` / `clonedFrom` field found on the Experience model.

---

## 5. Data model evidence

### 5.1 `experience_catalog` (platform folder)

| Field | Type / notes |
|---|---|
| `_id` | ObjectId |
| `exp_folder_name` | string, required, unique with category+subcategory |
| `category` | ObjectId → Category, required, immutable after create |
| `subcategory` | ObjectId → SubCategory, required, immutable after create |
| `tags` | string[] |
| `what_users_get` | string |
| `description` | string, required |
| `terms_and_conditions` | string, required |
| `status` | `active` \| `inactive` |
| `photos[]` | `{ _id, url, is_archived }` |
| `videos[]` | `{ _id, url, is_archived }` |
| `metrics.photo_count` / `metrics.video_count` | derived non-archived counts |
| `is_deleted` | boolean (folder soft-delete flag; patchable) |
| `restaurants[]` | ObjectId[] → Restaurant (usage marker; **write path on merchant clone UNKNOWN**) |
| `is_ai_generated` | boolean |
| `created_by` / `modified_by` | string |
| `created_at` / `updated_at` | timestamps |

**What this is:** reusable platform **content folder** (metadata + media URLs), not a bookable Experience.

**What this is not:** complete Experience template with tickets/packages/seat config/venue/lead times.

### 5.2 Merchant Experience (subset relevant to clone)

Folder clone maps into:

| Folder field | Merchant Experience field |
|---|---|
| `exp_folder_name` | `name` |
| `description` | `description` |
| `what_users_get` | `userBenefits` |
| `terms_and_conditions` | `tc` |
| `tags` | `tags` |
| `category` / `subcategory` | `category` / `subCategory` |
| non-archived `photos[].url` | `photos[]` + `photoThumbnails[]` (same URLs) |
| non-archived `videos[].url` | `videos[]` |
| `promotional_videos` (if present on folder) | `promotional_videos[]` |

Operational fields (tickets, seats, lead times, venue, packages, etc.) are **left empty / defaulted** on folder clone — merchant completes them in later tabs.

Experience-to-experience clone copies a much wider operational surface from `GET /experience/:id` into the same form (timings, prices, packages, accessibility flags, etc.).

---

## 6. API contract

Evidence-backed endpoints only.

### 6.1 Platform Experience Media (`/experience-media`)

| METHOD | PATH | ACTOR | REQUEST | RESPONSE | SCOPE | SIDE EFFECTS |
|---|---|---|---|---|---|---|
| POST | `/experience-media` | Super Admin (`SuperAdminMiddleware`) | `exp_folder_name`, `category`, `subcategory`, optional tags/description/benefits/T&Cs/photos/videos/restaurants/is_ai_generated/created_by | created folder doc | platform | Creates `experience_catalog`; photos/videos coerced to `{url,is_archived:false}`; duplicate name under same cat/sub → 409 |
| PATCH | `/experience-media/:id` | Super Admin | allowed: `exp_folder_name`, `tags`, `what_users_get`, `description`, `terms_and_conditions`, `status`, `is_deleted`, `restaurants`, `is_ai_generated`, `modified_by` | updated doc | platform | Category/subcategory change rejected |
| PUT | `/experience-media` | Super Admin | `{ _id, photos?: string[], videos?: string[] }` | updated doc | platform | **Appends** URL media items; updates metrics |
| GET | `/experience-media` | **No SuperAdmin check in `find()`** | query: `page`, `limit`, `search`, optional `category`, `subcategory`, `sort` (`a-z`\|`z-a`\|`latest`\|`oldest`) | `{ page, limit, totalCount, totalPages, data:[{_id, exp_folder_name, category.title, no_of_items}] }` | platform list | Read-only; does **not** filter `is_deleted` in match |
| GET | `/experience-media/:id` | **Comment/code: “no auth”** | id | full folder + `category_name` / `subcategory_name` + normalized photos/videos | platform detail | Read-only |
| DELETE | `/experience-media/:id/media` | Super Admin | body `{ mediaId, type: 'photo'\|'video' }` | updated folder | platform | Soft-archives one media item (`is_archived=true`); updates metrics |
| REMOVE (Feathers) | `/experience-media/:id` | — | — | 405 | — | **Not implemented** |

### 6.2 Merchant Experience reuse endpoints

| METHOD | PATH | ACTOR | REQUEST | RESPONSE | SCOPE | SIDE EFFECTS |
|---|---|---|---|---|---|---|
| GET | `/experience?expType=&type=recentList` | Vendor session (experience service auth) | expType | recent experiences for **same vendor** | merchant | Read |
| GET | `/experience?search=&type={expType}` | Vendor | search + expType | matching vendor experiences | merchant | Read |
| GET | `/experience/:id` | Vendor | id | full experience aggregate | merchant | Read |
| POST | `/experience` | Vendor | create payload from form (includes copied URLs/metadata) | new Experience `_id` | merchant restaurant | **Creates independent merchant Experience**; no folder linkage observed |
| PATCH | `/experience/:id` | Vendor | subsequent tab payloads | updated Experience | merchant | Updates same new record |

### 6.3 Secondary Media Catalogue (out of ExperienceCatalog UI path)

| METHOD | PATH | ACTOR | NOTES |
|---|---|---|---|
| * | `/media-catalogue` | Super Admin (`validateSuperAdmin`) | Separate catalogue CRUD |
| FIND | `/merchant/media-catalogue` | Vendor role | Requires category + subCategory; non-archived only |
| * | `/admin/media-usage` | Admin | Usage reporting |

### 6.4 AI generation (append path only)

External generators (not vendordashboard):

- `https://textimagegenerator.amealio.com/generate`
- `https://textvideogenerator.amealio.com/generate`
- `https://imagevideogenerator.amealio.com/generate`

Resulting URL is persisted only by `PUT /experience-media`. Platform AI generation beyond “append URL + optional `is_ai_generated` flag” is **out of scope** for this contract.

---

## 7. Merchant reuse / clone flow

### Path A — Platform folder → new merchant Experience

```text
Merchant opens CreateExpericence (SPECIAL/CURATED)
  → CloneFolderPopup
  → GET /experience-media?page&limit&search
  → select folder id
  → GET /experience-media/:id
  → onCloneFromFolder:
       map folder metadata + non-archived photo/video URLs into formik
       default timings to “today”
       leave tickets/venue/packages empty
  → merchant completes form
  → POST /experience (then PATCH tabs)
  → new merchant Experience owned by vendor/restaurant
```

**Persistence path:** client form → `/experience` only. No call that patches `experience_catalog.restaurants[]` was found in CreateExpericence / CloneFolderPopup.

### Path B — Existing merchant Experience → new merchant Experience

```text
ClonePopup
  → GET /experience?expType&type=recentList  (or search)
  → GET /experience/:id
  → onClone: repopulate broad operational form fields
  → POST /experience as a NEW record (source id not sent as lineage)
```

Source remains untouched. Expired date windows are reset to “today” defaults in the client.

### Not a Global Item–style materialize

Unlike platform-catalog item materialize (`POST …/materialize`), experience folder reuse is **100% client-side form seeding**. There is no dedicated backend “clone experience-media into experience” endpoint in the traced code.

---

## 8. Media / folder semantics

| Question | Verdict | Evidence |
|---|---|---|
| Are folders separate from Experience records? | **YES** | Distinct model `experience_catalog` vs `Experience` |
| Is media binary-copied on clone? | **NO** — URL reference copied into form / Experience string arrays | `onCloneFromFolder` maps `.url` |
| Are media items soft-archived? | **YES** | `is_archived` + `DELETE …/media` |
| Is folder hard-deleted? | **NO** (remove throws 405); soft via `is_deleted` patch | class `remove` / patch allow-list |
| Do source updates propagate to merchant copies? | **UNKNOWN / no evidence of propagation** | Independent Experience docs; shared URL strings only |
| Does deleting/archiving source media affect merchant Experiences that already stored the URL? | **UNKNOWN** at application level; URL strings remain on Experience unless merchant edits | No referential FK |
| Is lineage stored? | **NO evidence** | No source folder id on Experience model / create payload |
| Are copies independent after create? | **YES for metadata/config** | Separate Experience document; subsequent PATCH only touches merchant record |
| AI content | Generated URL appended to folder; flag `is_ai_generated` on folder; merchant may later receive those URLs via clone | AiGenrationPopup + model |
| `restaurants[]` meaning | Intended “in use” marker in MediaManagement UI | Field exists; **who writes it after merchant use = UNKNOWN** |

---

## 9. Authorization

### Platform Experience Media

| Operation | Enforcement |
|---|---|
| create / patch / update(PUT) / archiveMedia | `SuperAdminMiddleware` → JWT vendor auth secret + `VendorUser.role === "superadmin"` |
| find / get | **No SuperAdminMiddleware** in class; hooks empty — effectively open read at service layer |
| Fine-grained permission checkboxes | **Not used** (see doc 81) |

Frontend Super Admin routes are behind Super Admin UI navigation; that is **frontend visibility**, not a substitute for server auth on reads.

### Merchant clone / experience write

| Operation | Enforcement |
|---|---|
| `/experience` recentList / search / get / create / patch | Vendor authentication in experience service (merchant-owned records scoped by `vendorId`) |
| Folder list/detail used by merchants | Same unauthenticated-or-weak `find`/`get` on `/experience-media` as above |

### Target RBAC direction (when implementing)

Use existing staff RBAC foundation (`JwtStaffGuard`, `StaffAuthorizationGuard`, `@PlatformOnly`, `@RequireStaffRoles`, merchant scope from principal). **Do not invent fine-grained permission keys** from legacy checkbox catalogues.

Suggested alignment (proposal only):

- Platform folder CRUD/archive → `@PlatformOnly` / SUPER_ADMIN
- Platform folder discovery (list/detail) → SUPER_ADMIN + MERCHANT_OWNER + MERCHANT_STAFF (mirror Global Item catalogue discovery pattern)
- Merchant Experience create/update remains merchant-scoped module — **do not overload** with platform folder ownership

---

## 10. Field preservation map

Philosophy: same as `77-GLOBAL-ITEM-FIELD-PRESERVATION-MAP.md` — preserve meaning; do not blindly reproduce Mongo shape.

| LEGACY FIELD | SEMANTIC MEANING | TARGET DISPOSITION | EVIDENCE | OPEN QUESTION |
|---|---|---|---|---|
| `_id` | Platform folder identity | New platform entity `id` (+ optional `legacyId`) | model | Migration ID strategy |
| `exp_folder_name` | Folder / display name; seeds merchant `name` | Required string on platform folder | AddExperienceFolder; onCloneFromFolder | Naming: “folder” vs “catalogue entry” |
| `category` / `subcategory` | Taxonomy; immutable after create | FKs to platform Category (or equivalent); immutable on update | create/patch validation | Map Occasion FIXED category filter |
| `tags` | Keywords; seed merchant tags | string[] / tag relation | UI keywords | Search indexing |
| `description` | Folder description → merchant description | string | clone map | |
| `what_users_get` | Benefits text → `userBenefits` | string | clone map | Merchant Experience target may still defer this field (doc 49 deferred media/benefits) |
| `terms_and_conditions` | T&Cs → `tc` | string | clone map | Same deferral risk |
| `status` | active/inactive | enum/boolean | model | Whether inactive folders are hidden from merchant discovery (find does not filter status) |
| `photos[].url` | S3 URL | Store URL references on folder; copy URLs into merchant media when implemented | mediaItemSchema; clone | CDN migration / dedupe **deferred** |
| `photos[]._id` | Media item id for archive | Stable media item id | archiveMedia | |
| `photos[].is_archived` | Soft archive | boolean | archiveMedia | Hard delete policy UNKNOWN |
| `videos[]` | Same as photos | Same | model; AddVideos | |
| `metrics.*` | Derived counts | Computed or cached | pre-save | |
| `is_deleted` | Folder soft delete | `deletedAt` or boolean | patch allow-list | Whether find should exclude deleted (legacy find does not) |
| `restaurants[]` | Claimed restaurant usage set | **DEFER** until write path proven | model; MediaManagement UI | Who updates? sync? |
| `is_ai_generated` | Folder AI provenance flag | optional boolean | model; UI tab | Per-media AI flag UNKNOWN |
| `created_by` / `modified_by` | Audit strings | map to staff principal ids if available | model | Legacy stores free strings |
| `created_at` / `updated_at` | Timestamps | standard timestamps | model | |
| Experience `photos`/`videos` after clone | Merchant-owned URL arrays | Merchant Experience media (deferred in doc 49) | experience.model; POST /experience | Media on merchant Experience still deferred in target |
| Source folder id on Experience | Lineage | **DO NOT invent** unless product mandates | absent in model/payload | Product decision |
| Sync / propagation fields | N/A | **OUT OF SCOPE** | no evidence | |

---

## 11. Target gap

### Present today

- `prisma` `Experience` + `ExperienceMenu` — **merchant/restaurant-scoped**
- `apps/api/src/modules/experience/` — merchant configuration API (`/experiences`), staff merchant roles only
- Doc 49 explicitly defers media
- Platform Global **Item** Catalogue module exists (`platform-catalog`) — **not** experience folders

### Absent today

- Platform Experience Media / Folder entity
- Platform Experience Catalogue API module
- Merchant discovery endpoints for experience folders
- Any materialize/clone-from-folder server API
- Lineage / restaurants usage tracking for experience folders
- Integration with deferred merchant Experience media fields

### Non-goals for first implementation (once approved)

- Do **not** repurpose `Experience` rows as platform catalogue entries
- Do **not** duplicate Global Item catalogue patterns blindly without folder/media semantics
- Do **not** implement `/media-catalogue` secondary system in the same slice unless explicitly scoped

---

## 12. Proposed MINIMUM target contract

**This section is a design proposal for review — not implementation permission.**

### 12.1 Platform entity (minimum)

`PlatformExperienceFolder` (name TBD) with:

- identity (`id`, optional `legacyId`)
- `name` ← `exp_folder_name`
- `categoryId`, `subCategoryId` (immutable after create)
- `description`, `userBenefits`, `termsAndConditions`
- `tags[]`
- `status` active/inactive
- `isAiGenerated` optional
- soft delete
- audit timestamps + creator staff id if available
- nested or child `PlatformExperienceMediaItem` { id, kind: PHOTO|VIDEO, url, isArchived, createdAt }

**Explicitly deferred columns:** `restaurants[]` usage set, AI generator payloads, CDN asset ownership, dedupe keys.

### 12.2 API surface (minimum)

Mirror verified legacy capabilities:

| Capability | Suggested target (illustrative) | Auth |
|---|---|---|
| Create folder | `POST /platform-experience-catalog/folders` | PlatformOnly |
| Patch folder metadata | `PATCH /platform-experience-catalog/folders/:id` | PlatformOnly |
| Append media URLs | `POST /platform-experience-catalog/folders/:id/media` | PlatformOnly |
| Soft-archive media | `DELETE /platform-experience-catalog/folders/:id/media/:mediaId` | PlatformOnly |
| List folders | `GET /platform-experience-catalog/folders` | SUPER_ADMIN + MERCHANT_* |
| Get folder detail | `GET /platform-experience-catalog/folders/:id` | SUPER_ADMIN + MERCHANT_* |

### 12.3 Merchant reuse (minimum)

**Phase 1 (parity with legacy):** discovery + detail only; client (or future BFF) copies fields into merchant Experience create input. No server materialize required for parity.

**Phase 2 (optional, needs product decision):** server-side `POST /experiences/from-platform-folder/:folderId` that creates a draft merchant Experience with mapped fields + media URLs — still **without** inventing lineage/sync unless decided.

### 12.4 Hard boundary

Merchant `Experience` module remains the operational record. Platform folder module remains platform content. No shared table ownership.

---

## 13. Explicitly unresolved business rules

Do **not** decide in implementation without owner review:

1. Global source synchronization after merchant reuse  
2. Global update propagation to prior merchant copies  
3. Deletion/archive propagation to merchant Experiences  
4. Source lineage persistence (`sourceFolderId`)  
5. Whether/when `restaurants[]` (or equivalent) is updated on reuse  
6. Chain / multi-location folder precedence  
7. Automatic merchant updates when platform folder changes  
8. Media binary deduplication / CDN migration strategy  
9. AI generation product behavior beyond verified URL append  
10. Relationship / merge with secondary `/media-catalogue` system  
11. Whether inactive / soft-deleted folders must be hidden from merchant discovery (legacy list does not filter)  
12. Whether merchant Experience media must land in the same slice as platform folders (doc 49 currently defers media)

---

## 14. Acceptance criteria (for a future implementation slice)

A future implementation slice is acceptable only if it:

1. Introduces a **platform-owned** folder/media model distinct from merchant `Experience`
2. Preserves Super Admin create / patch metadata / append media / soft-archive media / list / detail
3. Allows merchant discovery of folders for create-experience reuse
4. Copies verified folder→Experience field mappings without inventing lineage/sync
5. Uses existing staff RBAC (`PlatformOnly` + merchant roles for discovery) — no checkbox permission keys
6. Leaves unresolved rules in §13 unimplemented or explicitly feature-flagged as UNKNOWN
7. Does not break or redefine merchant Experience APIs from doc 49
8. Ships tests covering platform CRUD + discovery auth boundaries
9. Updates this document’s Status only after code lands

---

## 15. Implementation gate

**STOP.**

Do not implement the target Global Experience Catalogue module until this forensic report has been reviewed and the minimum contract in §12 is accepted (with §13 items left unresolved or explicitly decided).

Related docs:

- `75-PLATFORM-CATALOG-REALITY-RECONCILIATION.md` — high-level distinction (superseded in depth by this doc for Experience Catalogue)
- `49-EXPERIENCE-CONFIGURATION-FOUNDATION.md` — merchant Experience only
- `81-LEGACY-RBAC-LINKAGE-ENFORCEMENT-FORENSIC-TRACE.md` — coarse role reality
- `77` / `78` / `82` — Global **Item** Catalogue (parallel pattern; different domain)

---

## Appendix A — Copy semantics matrix

| Object | Source id | Target id | Ownership retained on source? | Lineage stored? | Updates propagate? | Copies independent? | Delete source affects copies? | Media copy vs reference |
|---|---|---|---|---|---|---|---|---|
| Experience-media folder | folder `_id` | n/a (not duplicated) | YES (platform) | N/A | N/A | N/A | N/A | N/A |
| Folder → merchant Experience metadata | folder `_id` | new Experience `_id` | YES | **NO evidence** | **NO evidence** | YES | **UNKNOWN** (URLs may remain) | URL strings copied |
| Folder photo/video item | media `_id` + url | Experience string url (no media id) | YES on folder | NO | NO | YES (string) | UNKNOWN | **Reference by URL**, not binary copy |
| Merchant Experience → new Experience | source Experience `_id` | new Experience `_id` | YES | **NO evidence** | NO | YES | NO (separate docs) | URL arrays copied in form |

---

## Appendix B — Evidence file index

**Dashboard MVP**

- `…/ExperienceCatalog/MediaManagement.js`
- `…/ExperienceCatalog/AddExperienceFolder.js`
- `…/ExperienceCatalog/MediaCatalogue.js`
- `…/ExperienceCatalog/AddPhotos.js`
- `…/ExperienceCatalog/AddVideos.js`
- `…/ExperienceCatalog/AiGenrationPopup.js`
- `…/CreateExperiences/CreateExpericence.js`
- `…/CreateExperiences/ClonePopup.js`
- `…/CreateExperiences/CloneFolderPopup.js`
- `client/src/store/utils/Routes.js` (experience/media routes)

**Vendor dashboard backend**

- `src/models/experience_media.model.ts`
- `src/services/experience-media/experience_media.class.ts`
- `src/services/experience-media/experience_media.service.ts`
- `src/services/experience-media/experience_media.hooks.ts`
- `src/models/experience.model.ts`
- `src/services/experience/experience.class.ts` (`recentList` / search)
- `src/models/media-catalogues.model.ts` (+ media-catalogues services)
- `src/middleware/middlewares.ts` (`SuperAdminMiddleware`)

**Target**

- `prisma/schema.prisma` — `Experience`, `ExperienceMenu`
- `apps/api/src/modules/experience/`
- `apps/api/src/modules/platform-catalog/` (items only; no experience folders)
