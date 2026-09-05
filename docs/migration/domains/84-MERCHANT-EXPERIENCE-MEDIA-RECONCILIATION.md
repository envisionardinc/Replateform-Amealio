# 84 — Merchant Experience Media Reconciliation

**Status:** IMPLEMENTED (minimum verified media/content fields)  
**Date:** 2026-09-04  
**Target branch:** `replatform/backend-consolidation`  
**Depends on:** docs 49, 83; platform catalogue commit `55cc9f2`

## 1. Legacy media contract (verified)

Merchant `Experience` stores media as **string URL arrays** (not nested media objects):

| LEGACY FIELD                      | MEANING            | WHERE STORED       | CREATE   | UPDATE       | TARGET FIELD                 | DISPOSITION                             |
| --------------------------------- | ------------------ | ------------------ | -------- | ------------ | ---------------------------- | --------------------------------------- |
| `photos`                          | Photo URLs         | Experience         | yes      | yes (`$set`) | `photos String[]`            | **IMPLEMENT**                           |
| `photoThumbnails`                 | Thumbnail URLs     | Experience         | yes      | yes          | `photoThumbnails String[]`   | **IMPLEMENT**                           |
| `videos`                          | Video URLs         | Experience         | yes      | yes          | `videos String[]`            | **IMPLEMENT**                           |
| `promotional_videos`              | Promo video URLs   | Experience         | yes      | yes          | `promotionalVideos String[]` | **NORMALIZE**                           |
| `userBenefits`                    | Benefits text      | Experience         | yes      | yes          | `userBenefits`               | **IMPLEMENT** (needed for folder clone) |
| `tc`                              | Terms & conditions | Experience         | yes      | yes          | `termsAndConditions`         | **NORMALIZE**                           |
| `tags`                            | Keywords           | Experience         | yes      | yes          | `tags String[]`              | **IMPLEMENT**                           |
| `name` / `description`            | Already present    | Experience         | yes      | yes          | existing                     | already present                         |
| `category` / `subCategory`        | Taxonomy           | Experience         | yes      | yes          | existing FKs                 | already present                         |
| Folder nested `{url,is_archived}` | Platform only      | experience_catalog | n/a      | n/a          | platform module              | stay on platform                        |
| `sourceFolderId` / lineage        | —                  | **absent**         | no       | no           | —                            | **DO NOT INVENT**                       |
| Binary/CDN assets                 | Upload returns URL | upload service     | URL only | URL only     | —                            | **DEFER** upload service                |

Clone-from-folder (client): non-archived folder photo/video URLs → Experience arrays; photoThumbnails ← photos; promotionalVideos ← `[]`.

## 2. Target media contract

- Store **URL references** on merchant `Experience` (option A from the brief).
- No embedded media child table for merchant Experience in this slice.
- No platform-folder FK / lineage.
- Discovery remains `GET /platform-experience-catalogue*`; create remains `POST /experiences` with mapped fields.
- Helper: `mapPlatformFolderToExperienceMedia` (client-side mapping parity).

## 3. Explicit non-goals

No `POST …/materialize`, no `POST …/clone`, no sync/propagation, no restaurants[] write path.
