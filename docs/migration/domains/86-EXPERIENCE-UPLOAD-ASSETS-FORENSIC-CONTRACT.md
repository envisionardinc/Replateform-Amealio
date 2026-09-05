# 86 — Experience Upload-Assets Forensic Contract

**Status:** FORENSIC ONLY (no implementation in this slice)  
**Date:** 2026-09-04  
**Brand:** amealio  
**Canonical Nest branch:** `replatform/backend-consolidation`  
**Legacy UI:** `AmealioDashboardMVP-`  
**Legacy API:** `Amealio-VendorDashboard` (Feathers + Express)

---

## 0. Canonical branch check (MVP `32098568c`)

| Question | Finding |
| -------- | ------- |
| What is `32098568c`? | Commit on **`amealiodashboardmvp-` / `main`** — flag-gated Merchant Experience Nest UI bridge |
| Files in `32098568c` | `nestExperienceClient.js`, `CloneFolderPopup.js`, `CreateExpericence.js`, `EditExpericence.js`, `useExperienceFormSubmission.js`, `Keys.js`, `authAction.js` |
| Present on Nest `replatform/backend-consolidation`? | **No — different repository.** Nest consolidation correctly holds API/e2e/docs (`0b24662`, docs 85), not CRA UI files |
| Unrelated changes in `32098568c`? | **No** — Experience cutover only; upload-assets intentionally left legacy |
| Transfer into Nest consolidation? | **Not applicable** for UI sources. Nest APIs already support the vertical. Do **not** modify MVP `main` in this slice. Any future MVP branch discipline is a separate controlled action |

---

## 1. Legacy upload architecture (summary)

Experience media binaries never live in Mongo/Prisma. The pipeline is:

1. Merchant UI selects/crops a file
2. Browser `POST`s multipart bytes to legacy VendorDashboard
3. Server proxies bytes to **AWS S3** with `ACL: public-read`
4. Server returns **public HTTPS Location URL string(s)**
5. UI stores URLs in Formik (`photos`, `photoThumbnails`, `videos`, `promotional_videos`)
6. Experience `POST`/`PATCH` persists URL arrays on the Experience document (Nest: string columns)

There is **no** media asset entity, **no** asset ID on Experience, **no** CDN layer in-app, **no** signed URL flow.

---

## 2. Frontend flow (Experience)

**Primary screen:**  
`client/src/components/vendorDashboardComponents/Experiences/CreateExperiences/GeneralInfoExp.js`  
(used by Create + Edit Experience)

### 2.1 Photo upload

| Step | Behavior |
| ---- | -------- |
| Selection | `MultipleImageUploadComponent` file input → queues local `File`s in `restaurant_pictures_new` via `bankUploadMultipleFiles` |
| Crop | `ImageCropMultiple` (`ImageCrop/ImageCrop.js`) opens cropper; output MIME PNG |
| Request | `axios.post(`${serverApi}/upload-assets?uploadSide=${combined}`)` with `FormData` field **`files`** |
| `uploadSide` | `${vendor._id}_${restaurant_nameWithoutSpaces}` (tagging only on Feathers path; Express `uploadToS3` does not persist this tag) |
| Thumb parallel | When `thumbnail={true}` (Experience hardcodes `const thumbnail = true`): client-side resize 140×140 PNG via `react-image-file-resizer`, then second `POST /upload-assets?uploadSide=…&thumbnail=true` |
| Response used | **Only main upload URL** is passed to `onCompleteUploadMultipleCrop` |
| Thumb form value | **Path invention**, not thumb response: splice `"thumbnail"` before the last URL path segment of the **main** Location (e.g. `…/OBJECTID.png` → `…/thumbnail/OBJECTID.png`) |
| Form state | Append to `photos[]` and `photoThumbnails[]` (index-aligned removal via `bankDocMultipleRemove`) |
| Persist | Included in Experience create/patch payload |

**Auth on photo crop path:** raw `axios` to `serverApi` — **does not attach** merchant JWT (unlike `amApi`).

**UI copy:** “Min 2 pics \| Max size 500kb/pic” — **not enforced** in `bankUploadMultipleFiles` / crop upload path (global `imageUploadSize` = 2 MiB exists in `Keys.js` but is unused here).

### 2.2 Experience video (`videos[]`)

| Step | Behavior |
| ---- | -------- |
| Selection | Single file (`singleUpload`, `videoUpload`) |
| Validation | Frontend: presence; size ≤ `videoUploadSize` (50 485 760 ≈ 48 MiB); duplicate name+size; blocks concurrent upload; requires vendor + restaurant in Redux |
| Request | `amApi.post('/upload-assets-video', FormData)` field **`file`**; `onUploadProgress`; timeout 120 s |
| Response | Single URL string (`res.data`) |
| Form state | `videos: [videoUrl]` (replaces; effectively one video) |
| Remove | Clears form array only — **no S3 delete** |

### 2.3 Promotional video (`promotional_videos[]`)

Same endpoint and limits as experience video; writes `promotional_videos: [videoUrl]`.  
Nest maps alias → `promotionalVideos`.

### 2.4 Progress / error / retry

- Progress: axios `onUploadProgress` → local React state / dialog
- Errors: alert from `response.data.message` or generic; clears local upload state
- Retry: **manual only** (re-select file); no automatic retry

### 2.5 Deletion

- Form removes URL strings from arrays
- Experience UI does **not** call upload-assets `DELETE` / S3 delete
- Orphan objects may remain in the bucket

---

## 3. Backend flow (VendorDashboard)

### 3.1 Live path (authoritative)

`src/utils.ts` Express router, mounted in `src/app.ts` via `app.use(utils)` **before** Feathers configuration/auth:

| Route | Multer | Handler |
| ----- | ------ | ------- |
| `POST /upload-assets` | `upload.array("files", 10)` memory storage, **100 MB**/file | Loop `uploadToS3(file, req.query)` → `res.send(string[])` |
| `POST /upload-assets-video` | `upload.array("file", 1)` | `uploadToS3(file, { category: true, contentType: "video/mp4" })` → `res.send(string)` (first URL) |

`uploadToS3`:

- SDK: **`aws-sdk` (v2) `AWS.S3`**
- Credentials config key: `app.get("s3cred")` from env names only: `S3CRED_ACCESSKEYID`, `S3CRED_SECRETACCESSKEY`, `S3CRED_REGION`, `S3CRED_BUCKETNAME`
- Object key:
  - default: `{new ObjectId()}.{ext}`
  - `query.thumbnail`: `thumbnail/${file.originalname}`
  - `query.category`: `categoryicons/{ObjectId}.{ext}`
  - `query.reel`: `shorts/{ObjectId}.{ext}`
- ACL: **`public-read`**
- ContentType: `query.contentType` or `image/{ext}`
- Return: S3 **`data.Location`** (public HTTPS URL)

**Video quirk:** `/upload-assets-video` always passes `category: true`, so experience/promo videos are stored under the **`categoryicons/`** prefix.

### 3.2 Legacy Feathers services (secondary / partial)

| Service | Path | Notes |
| ------- | ---- | ----- |
| `upload-assets` | Feathers `/upload-assets` | Still `app.configure(uploadAssets)`; disk multer historically; **hooks: no `authenticate`**; Mongo model is placeholder `{ text }` unused by create |
| `upload-assets-video` | Feathers | **`app.configure(uploadAssetsVideo)` is commented out** in `services/index.ts` — video Feathers service is **not** live |
| Middleware multer in `middleware/index.ts` | commented for upload-assets* | Extension filter exists for disk path but not used by live Express memory router |

**Conclusion:** Runtime Experience traffic hits the **Express router in `utils.ts`**, not the Feathers class create path.

### 3.3 Separate short-video bucket

`SHORT_VIDEOS_S3_CREDENTIALS_*` exists for reels/scraping paths — **not** used by Experience `/upload-assets-video`.

---

## 4. Storage provider

| Item | Evidence |
| ---- | -------- |
| Provider | **AWS S3** |
| Library | `aws-sdk` v2 `S3.upload` |
| Bucket | `s3cred.bucketName` (env `S3CRED_BUCKETNAME`) — value not documented here |
| Access | Objects uploaded with **`public-read`**; URLs are **public**, not signed |
| Expiration | None for returned Location URLs |
| Image transform (server) | **None** (no sharp/ffmpeg on this path) |
| Image transform (client) | Crop + optional 140×140 PNG thumbnail resize |
| Video transform | **None** on Experience path; ContentType forced `video/mp4` |

**Do not expose or copy production credentials.** Env var **names** only are listed above.

---

## 5. Authentication

| Layer | Finding |
| ----- | ------- |
| Express `/upload-assets*` | **No authentication middleware** |
| Feathers upload-assets hooks | `authenticate` imported but **not applied** (`create: []`) |
| MVP photo crop | axios **without** JWT |
| MVP video | `amApi` may send Feathers JWT in `authorization` — **ignored by upload router** |

Uploads are effectively **open** at the HTTP layer (CORS `*`). Any party who can reach the API host can upload if network policy allows.

---

## 6. Authorization

| Claim | Evidence |
| ----- | -------- |
| Merchant-scoped upload? | **No server-side merchant/restaurant ownership check** on upload |
| Role-based upload? | **No** |
| Frontend-only hints | `combined` / vendor+restaurant checks before video; `uploadSide` query — not enforced as authz |
| Experience write authz | Separate: Experience create/update (legacy JWT / Nest staff + restaurant scope) — **after** URLs exist |

**Authorization model: frontend-only / none on binary upload; coarse Experience persistence authz is independent.**

---

## 7. Validation

| Check | Where | Notes |
| ----- | ----- | ----- |
| Image MIME (live Express) | **Not filtered** by multer in `utils.ts` | Disk middleware (unused) allowed png/jpg/jpeg/svg/gif/pdf |
| Video extension (unused disk path) | mp4/webm/ogg | Live Express video path relies on ContentType override |
| Size (server) | Multer 100 MB | |
| Size (client video) | `videoUploadSize` ≈ 48 MiB | |
| Size (client photo Experience) | UI claims 500 KB; **not enforced** in code path | |
| Type (client photo) | `accept="image/gif,image/jpeg,image/jpg,image/png"` | |
| Path traversal | ObjectId key for main uploads mitigates; thumbnail uses `originalname` in key — weaker |

---

## 8. URL semantics

- Response body: **array of URL strings** (images) or **single URL string** (video)
- Shape: S3 virtual-hosted / path-style Location from AWS SDK
- Experience domain stores **opaque URL strings** — no asset ID
- Public read; suitable for `<img>` / `<video>` without signing

---

## 9. Thumbnail semantics

1. Client generates small PNG (140×140)
2. Optional parallel upload with `thumbnail=true` (key under `thumbnail/…`, possibly nested with client filename prefix)
3. Experience Formik **`photoThumbnails` is populated by URL path rewriting of the main photo Location**, not by the thumbnail upload response
4. Index alignment with `photos[]` is maintained on remove
5. Clone-from-platform-folder sets `photoThumbnails ← photos` (same URLs) — no separate thumb generation

**Risk:** Invented `…/thumbnail/{objectId}.ext` may not match the object key written by the parallel thumb upload (`thumbnail/${originalname}`). Treat as legacy quirk; do not “fix” in forensics phase.

---

## 10. Video semantics

- Single-file upload per field
- Same endpoint for experience + promotional videos
- Stored under **`categoryicons/`** prefix due to `category: true`
- No server transcoding; no poster/thumbnail generation for video
- Nest fields: `videos[]`, `promotionalVideos[]` (+ legacy alias `promotional_videos`)

---

## 11. Error / retry behavior

| Case | Behavior |
| ---- | -------- |
| No files | HTTP 400 `{ status:false, message:"Files not found" }` |
| S3 failure | HTTP 400 `{ status:false, message:"Unable to upload files" }` |
| Client | Alert; reset progress; user must retry manually |
| Partial multi-image | Express loops sequentially; failed iteration may still push `undefined` Location in Feathers class path — Express path rejects whole request on throw |

---

## 12. Target existing infrastructure (`replateform-amealio`)

| Area | Status |
| ---- | ------ |
| `StorageProvider` port / S3 adapter | **Not implemented** |
| Upload HTTP endpoints | **None** |
| Prisma Media/Asset model | **None** |
| Experience media | URL `String[]` columns only (`photos`, `photoThumbnails`, `videos`, `promotionalVideos`) |
| Platform experience catalogue media | URL rows only; `PUT …/media` accepts URL arrays |
| Docs intent | ADAPT legacy S3 behind storage port (`03-SOURCE-TARGET-MAPPING`, `08-INTEGRATION-MIGRATION-MAP`); upload deferred in docs 48/84/85 |

---

## 13. Target gap

| Need | Gap |
| ---- | --- |
| Binary upload API on Nest | Missing |
| AuthZ on upload | Must be designed (legacy has none) |
| S3 adapter + config | Missing (env names known from legacy) |
| Preserve URL-only Experience contract | Already in place |
| Thumbnail contract | Ambiguous in legacy — needs owner decision |
| Video key prefix `categoryicons/` | Accidental coupling — needs owner decision to preserve or clean |

**Evidence-driven mode:** **D — adapt existing**, which historically is **C — server-proxy multipart** (multer → `s3.upload` → public Location). No evidence for presigned (B) or browser-direct multipart (A) in legacy or target code.

---

## 14. Minimum target contract (proposed; not implemented)

For Merchant Experience parity only:

1. **Authenticated** staff upload (`MERCHANT_OWNER` / `MERCHANT_STAFF`) with merchant scope validation
2. Server-proxy multipart (adapt legacy C), not a new CDN product
3. Same bucket semantics unless owner decides otherwise (reuse `S3CRED_*` names)
4. Response: **public URL string(s)** only — no asset IDs on Experience
5. Map into Experience fields:
   - photos ← image URL(s)
   - photoThumbnails ← explicit thumb URL(s) **or** documented path convention (owner decision)
   - videos / promotionalVideos ← video URL(s)
6. Do **not** migrate historical objects in this vertical
7. Do **not** change public-read without owner decision
8. Upload remains separable from Experience create/update (URL arrays on domain API)

---

## 15. Migration / cutover considerations

- Flag-gated Nest Experience vertical already works with **pre-hosted URLs** (clone folder + fixtures)
- UI still depends on legacy upload until Nest upload exists
- Switching UI upload base URL to Nest is a later implementation slice
- Keep Experience DTO URL-only (already shipped)
- Orphan S3 objects and `categoryicons/` video prefix are cleanup/policy topics, not blockers for contract

---

## 16. Explicit unknowns

1. Production bucket names / account IDs (intentionally not copied)
2. Whether invented thumbnail URLs resolve in production CDN/S3 layout
3. Whether any API gateway / WAF fronting production adds auth not present in source
4. Whether `upload-assets` Feathers service still receives traffic in some deployments despite Express-first mount
5. Exact CORS/network exposure of upload routes in each environment

---

## 17. Owner decisions (required before implementation)

1. **AUTHZ-UPLOAD-1:** Enforce Nest staff auth + merchant scope on upload (recommended) vs preserve open legacy behavior (not recommended)
2. **THUMB-1:** Persist thumbnail upload **response URLs** vs continue path-invention convention
3. **VIDEO-KEY-1:** Keep `categoryicons/` prefix for videos vs use a dedicated prefix (e.g. `experience/videos/`)
4. **ACL-1:** Keep `public-read` vs private + signed read (larger blast radius)
5. **BUCKET-1:** Reuse legacy `S3CRED_*` bucket vs new target bucket (no production cutover without owner)
6. **SCOPE-1:** Experience-only Nest upload first vs shared cross-domain upload module

---

## 18. Implementation gate

**Do not implement** Nest upload / CDN / bucket changes until:

- [ ] Owner decisions above recorded
- [ ] Credentials available in non-production only for the implementing environment
- [ ] Separate implementation slice opened (not this forensic commit)

**This document contains no secrets or production credential values.**

---

## Source index (traced)

| Area | Path |
| ---- | ---- |
| Experience UI uploads | `amealiodashboardmvp-/…/GeneralInfoExp.js` |
| Multi image + crop | `…/MultipleImageUploadComponent.js`, `…/ImageCrop/ImageCrop.js` |
| Client thumb resize | `…/ImageResizerComponent.js` |
| API client | `…/api/apiHelper.js`, `…/config/Keys.js` |
| Live upload router | `amealio-vendordashboard/src/utils.ts` |
| App mount | `…/src/app.ts` (`app.use(utils)`) |
| Feathers upload (secondary) | `…/src/services/upload-assets/*` |
| Video Feathers (disabled) | `…/src/services/index.ts` comment |
| S3 env names | `…/config/default.js` (`s3cred`, `SHORT_VIDEOS_S3_CREDENTIALS`) |
| Nest gap | docs 84/85; no StorageProvider in `apps/api` |
