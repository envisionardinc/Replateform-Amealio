# AI Discovery / Home Page 2 — Forensic Deep Dive

**Repository:** `amealio-homepage-v2-rag-server`  
**Audit date:** 2026-09-02  
**Scope:** Read-only source-code forensics  
**Consumer:** `amealio_web_app` → `/homepage2` (HomePage2 chat UI)

---

## 1. Repository Purpose & Runtime

| Attribute | Evidence |
|-----------|----------|
| **Purpose** | Conversational food-discovery AI: restaurants, dishes, bytes/reels, events, recipes; chat history; concierge memory |
| **Production app** | FastAPI — `src/app/main.py` |
| **Docker CMD** | `uvicorn app.main:app --host 0.0.0.0 --port 8000` (`Dockerfile:34`) |
| **Python version** | 3.11 (`Dockerfile:1`, README) |
| **Local run** | `PYTHONPATH=./src uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` (README) |
| **PYTHONPATH** | `/app/src` in Docker; `./src` locally |

### Secondary / legacy entry points (NOT production Docker CMD)

| Entry | Path | Status |
|-------|------|--------|
| Legacy root app | `main.py` — "Skillstride RAG", JWT middleware, Whisper on startup | NOT production path; routes commented out |
| Item enrichment | `item_enrich/main.py` — `POST /ai/enrich` | Separate app; not wired into Docker CMD |
| Personalize CLI | `run_rich_personalize_pipeline.py`, `scripts/refresh_and_recommend.py` | Offline/batch; not live chat path |

### Dependency stack (`requirements.txt`)

| Package | Role |
|---------|------|
| fastapi | HTTP API |
| uvicorn | ASGI server |
| pydantic v2 | Request/response schemas |
| pymongo | MongoDB read + write (user_memory) |
| python-dotenv | Configuration |
| boto3 | AWS Personalize pipeline (offline) |
| certifi | MongoDB TLS |
| pytest | Tests |

**NOT in production requirements:** sentence-transformers, whisper (only legacy `main.py` startup).

### Deployment assumptions

- MongoDB Atlas/self-hosted via `MONGO_URI` (Docker note: `localhost` inside container ≠ host DB)
- MongoDB **vector search index** named `vector index` (configurable) on field `embedding` across searchable collections
- Remote LLM endpoint via `OPENAI_API_URL` / `DEEPSEEK_API_URL` + `OPENAI_API_PATH` (default `/responses`)
- Optional Bedrock embeddings via `AWS_BEARER_TOKEN_BEDROCK`, `AWS_REGION`, `BEDROCK_MODEL_ID`
- CORS: `CORS_ALLOWED_ORIGINS` (default `*`) + regex for localhost in non-prod
- Port **8000** exposed

**Production URLs (from `amealio_web_app/.env-cmdrc`):**

| Env | Base URL |
|-----|----------|
| dev | `https://dev-recommendation-api.amealio.com` |
| qa | `https://qa-recommendation-api.amealio.com` |
| uat | `https://uat-recommendation-api.amealio.com` |
| stage | `https://stage-recommendation-api.amealio.com` |
| prod | `https://api-homepage-v2-prod.amealio.com` |

---

## 2. API Surface

### Production app (`src/app/main.py`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | None | Health + model name + remote LLM flag |
| GET | `/health-check` | None | Alias for load balancers |
| POST | `/recommendations` | **None** (optional auth via middleware NOT mounted) | Main chat/recommendation turn |
| GET | `/recommendations/history` | None | Session list OR messages (if `session_id`) |
| GET | `/recommendations/history/sessions` | None | Session list only |
| GET | `/recommendations/history/messages` | None | Messages for one session |
| POST | `/personalize/refresh` | None | Offline AWS Personalize ETL + optional train |
| POST | `/personalize/train` | None | Train/deploy Personalize campaign |
| GET | `/personalize/recommendations/{user_id}` | None | Test Personalize recommendations |

**Streaming/WebSocket:** NOT FOUND in production app.

### POST `/recommendations`

**Request schema** (`RecommendationRequest`):

```json
{
  "query": "string (required)",
  "user_id": "string | null",
  "session_id": "string | null",
  "current_area": "string | null",
  "current_city": "string | null",
  "current_latitude": "float | null",
  "current_longitude": "float | null",
  "top_k": "int 1-50 | null",
  "concierge_context": {
    "budget": "",
    "rooftop_view": "",
    "luxury": "",
    "anything_else_important": ""
  }
}
```

**Frontend also sends** (ignored by schema — Pydantic drops extras): `selected_date`, `country_code`, `timezone` (`HomePage2.jsx:902-911`).

**Response schema** (`RecommendationResponse`):

| Field | Type | UI use |
|-------|------|--------|
| `answer` | string | Assistant chat text |
| `rewritten_query` | string | Internal/debug |
| `session_id` | string | Session continuity |
| `clarification_needed` | bool | Clarification UX |
| `clarification_question` | string \| null | Early exit text |
| `missing_context` | string[] | e.g. `["location"]` |
| `confidence` | float \| null | Scoring |
| `fallback_used` | bool | Location/search fallback |
| `search_scope` | `"area"` \| `"city"` \| `"none"` | Search breadth |
| `match_signals` | string[] | Ranking debug |
| `sections` | `RecommendationSection[]` | Card carousels |
| `results` | `RecommendationCard[]` | Flat card list |
| `applied_preferences` | object | Profile/location/concierge applied |
| `memory_used` | MemoryReference[] | Retrieved memories |
| `concierge_context` | ConciergeContextMemory | Persisted concierge fields |
| `query_intent` | QueryIntentAttributes | Structured intent |
| `primary_suggestion_axis` | string | Follow-up chip axis |
| `follow_up_suggestions` | string[] | Refinement chips (UI maps to `refinement`) |
| `request_id` | string | Trace id |

**Section types:** `restaurants`, `items`, `bytes`, `events`, `recipes`

**Card payloads:** `RestaurantCard`, `ItemCard`, `BytesCard`, `EventCard`, `RecipeCard` (see `api/schemas/`)

### GET `/recommendations/history`

| Query param | Required | Behavior |
|-------------|----------|----------|
| `user_id` | Yes (400 if missing) | User scope |
| `limit` | No (default 50, max 500) | Pagination |
| `search` | No | Filter sessions by title/preview |
| `session_id` | No | If set → return messages for session |

### Error behavior

| Condition | HTTP | Behavior |
|-----------|------|----------|
| Missing `user_id` on history | 400 | `detail: "user_id is required"` |
| Unhandled exception | 500 | FastAPI default |
| LLM failure | 200 | Fallback answer via `build_offline_concierge_reply` or template text |
| MongoDB vector search failure (memory) | 200 | Falls back to recent documents (`get_memory` except block) |
| No matching candidates | 200 | `_build_no_match_response` with helpful message |
| Off-domain query | 200 | Domain guardrail redirect message (no retrieval) |

**Legacy JWT middleware** (`src/core/auth_middleware.py`): exists but is **only mounted on root `main.py`**, NOT on production `src/app/main.py`. Production `/recommendations` is **unauthenticated**.

---

## 3. AI/LLM Pipeline (8 Stages)

Implemented in `RecommendationService.recommend()` (`chat_handler.py:337-503`).

```
Stage 1 — Query Preprocessing (_stage_preprocess_query)
  → sanitize query
  → load user profile from MongoDB (if user_id)
  → resolve location (query > current_area/city > profile)
  → merge concierge context (session patch + stored + query inference)

Stage 2 — Query Understanding (_stage_understand_query)
  → domain relevance guardrail (assess_domain_relevance)
  → early exit: off-domain, clarification needed, special_answer (greetings/rude/relationship)
  → understand_query(): regex/hint extraction → QueryUnderstanding

Stage 3 — Query Expansion (_stage_expand_query)
  → embedding_service.generate(rewritten_query)

Stage 4 — Parallel Retrieval (_retrieve_all_sources)
  → asyncio parallel vector search: restaurants, items, recipes, bytes, events
  → location fallback (area → city → none)
  → MongoDB $vectorSearch + $match filters + lookups (cuisine, restaurant for items)

Stage 5 — Re-ranking (_rerank_retrieval_results / _rank_candidates)
  → score boosts: location, cravings, meals, moods, profile preferences, allergies penalty
  → dietary query contract filtering
  → section limits (restaurants 10, items 30, bytes 10, events 20, recipes 10)
  → items per vendor cap (3)

Stage 6 — Context Building (_stage_build_context)
  → retrieve similar memories (vector search on user_memory)
  → build_query_intent + primary_suggestion_axis
  → build_assistant_prompt (prompt_templates.py)

Stage 7 — LLM Generation (_build_answer → OpenAILLMClient.generate)
  → POST to remote LLM with full prompt
  → fallback if remote fails or no API URL

Stage 8 — Response Assembly (_stage_assemble_response)
  → compose sections + follow_up_suggestions
  → async persist concierge_context + chat memories (if user_id)
```

---

## 4. Models & Providers

| Component | Provider / implementation | Config | Status |
|-----------|---------------------------|--------|--------|
| **Answer LLM** | Remote HTTP API (OpenAI-compatible / DeepSeek / Ollama-style) | `OPENAI_API_URL`, `OPENAI_API_PATH`, `OPENAI_MODEL_NAME`, `OPENAI_API_KEY` | IMPLEMENTED |
| **Default model name** | `gpt-5.4-mini` (fallback if unset) | settings.py | IMPLEMENTED |
| **Legacy DeepSeek env** | `DEEPSEEK_*`, `DEEPSEAK_*` typos accepted | settings.py | IMPLEMENTED |
| **Embeddings (prod selection)** | AWS Bedrock **if** bearer token + region + model configured | `AWS_BEARER_TOKEN_BEDROCK`, `BEDROCK_MODEL_ID` | IMPLEMENTED |
| **Embeddings (fallback)** | `DeterministicEmbeddingService` — char-ordinal hash vector | No external call | IMPLEMENTED (dev/test; weak for real retrieval) |
| **Vector index** | MongoDB Atlas Vector Search | `VECTOR_INDEX_NAME`, `VECTOR_EMBEDDING_FIELD` | IMPLEMENTED |
| **Reranker** | None (custom score arithmetic in `_rank_candidates`) | — | NOT FOUND |
| **AWS Personalize** | Offline pipeline + test endpoints | Personalize env vars | IMPLEMENTED (separate from live `/recommendations`) |
| **NLP libraries** | Python `re`, `difflib.SequenceMatcher` — no spaCy/NLTK in prod deps | query_understanding, domain_relevance | IMPLEMENTED |

**LLM request format** (`OpenAILLMClient._call_remote_model`):

```json
POST {OPENAI_API_URL}{OPENAI_API_PATH}
{ "model": "<model_name>", "input": "<full prompt string>" }
```

**Response parsing order:** `output_text` → `response` → `answer`/`text`/`content` → OpenAI `choices[0].message.content` → nested `output[].content[].text`

---

## 5. Prompt Inventory

| Prompt / template | Location | Purpose |
|-------------------|----------|---------|
| **Main assistant prompt** | `prompt_templates.build_assistant_prompt()` | Full concierge generation prompt with candidates, profile, location, intent, concierge memory |
| **Intent block** | `intent_suggestions.format_intent_for_prompt()` | Structured query intent injection |
| **Concierge block** | `concierge_memory.format_concierge_for_prompt()` | budget/rooftop/luxury/other fields |
| **Offline concierge fallback** | `offline_concierge_reply.build_offline_concierge_reply()` | 9 templates when LLM unavailable |
| **Domain redirect messages** | `domain_relevance.pick_domain_redirect_message()` | Off-domain early exit copy |
| **Greeting responses** | `query_understanding.GREETING_*` | Special answers without retrieval |
| **Clarification questions** | `understand_query()` | Location/cuisine vagueness |
| **Banned phrases list** | Inside `build_assistant_prompt` | e.g. "Based on your preferences" |

**Dynamic prompt construction:** All context is concatenated into a single string prompt — no multi-message chat API format to remote LLM.

**System vs user roles:** Single blob prompt; no separate system message channel to remote API.

---

## 6. Retrieval & MongoDB Data Sources

### Database

| Setting | Default |
|---------|---------|
| `MONGO_URI` | `mongodb://localhost:27017` |
| `MONGO_DATABASE` | `amealio` |

### Collections used by live `/recommendations`

| Collection | Env override | Read | Write | Vector search |
|------------|--------------|------|-------|---------------|
| `restaurants` | RESTAURANTS_COLLECTION | ✓ | — | ✓ |
| `vendoritems` | VENDOR_ITEMS_COLLECTION | ✓ | — | ✓ |
| `reels` | REELS_COLLECTION | ✓ | — | ✓ |
| `exp_events` | EVENTS_COLLECTION | ✓ | — | ✓ |
| `RecipeItem` | RECIPE_ITEMS_COLLECTION | ✓ | — | ✓ |
| `sub categories` / `subcategories` | SUBCATEGORIES_COLLECTION | ✓ (lookup) | — | — |
| `users` | USERS_COLLECTION | ✓ profile | — | — |
| `user_memory` | USER_MEMORY_COLLECTION | ✓ | ✓ | ✓ |

### Key fields accessed

**restaurants:** `restaurant_name`, `restaurant_address`, `city`, `area`, `rating`, `cost_for_two`, `vegOnly`, `selected_cusine`, `restaurant_pictures`, `logo_url`, `sessionSettings.restaurant_open`, `is_deleted`

**vendoritems:** `name`, `description`, `veg`, `tags`, `vendor_id`, `status`, `visibility`, `size[]` (price, calories), `rating`, `prepTime`

**reels (bytes):** `thumbnailUrl`, `videoUrl`, `description`, `restaurant.*`, `archive`

**exp_events:** `event_name`, `city`, `card_price`, `event_image`, `isActive`/`is_active`, venue fields

**RecipeItem:** `recipe_name`, `cuisine`, `food_type`, `formatted_ingredients`, `formatted_methods`, `allergy`, etc.

**users (profile):** `dietary_preferences`, `do_you_have_allergies`, `selected_cuisine`, `selectedCravings`, `selectedMoods`, `itemFav`, `favourites`, `eventFav`, `experienceFav`, `city`, `location`

**user_memory:** chat turns (`event_type`: query/reply), `concierge_context`, embeddings, `sections`, `refinement`

### Aggregation patterns

- `$vectorSearch` with `numCandidates = max(top_k * 10, 50)`
- Restaurant cuisine `$lookup` into subcategories
- Item `$lookup` into restaurants for location filtering
- `$match` filters: active items, non-deleted restaurants, non-archived reels, active events
- Dietary **query contract** filters in `_contract_filter` (veg/nonveg/vegan/jain + cuisine regex)

### Indexes (explicit in code)

- `user_memory`: compound indexes on `(user_id, event_type, created_at)` and `(user_id, session_id, event_type, created_at)`
- Vector index name: `"vector index"` (must exist in MongoDB for each searchable collection)

### AWS Personalize ETL (offline — additional collections read)

`orderings`, `eventhandlers`, `events`, `diners`, `reels` likes/shares/views, `userstats` — see `personalize_pipeline/config.py`

---

## 7. Business Logic by Domain

| Domain | Status | Evidence |
|--------|--------|----------|
| Restaurant discovery | **IMPLEMENTED** | Vector search + location filter + ranking |
| Menu/dish discovery | **IMPLEMENTED** | ITEM_SOURCE retrieval, item intent detection, vendor item expansion |
| Location (area/city/near me) | **IMPLEMENTED** | `location_context.py`, fallback area→city |
| Cuisine | **IMPLEMENTED** | CUISINE_HINTS, contract filters, profile cuisine boost |
| Dietary preferences | **IMPLEMENTED** | Query dietary intents + profile + Mongo contract filters |
| Allergens | **PARTIAL** | Profile `do_you_have_allergies` → -0.30 score penalty; no hard exclusion |
| Price/budget | **PARTIAL** | Budget hints in query + concierge; `cost_for_two` on cards; no strict price filter |
| Ratings | **PARTIAL** | `rating` on restaurant/item cards; ranking boost weak |
| Availability (open/closed) | **PARTIAL** | `open_status` computed on RestaurantCard; not used to filter retrieval |
| Occasions | **IMPLEMENTED** | intent_suggestions occasion regex; mood hints |
| Celebrations | **PARTIAL** | Regex `(celebration\|party)` in intent/domain copy only; events retrieved as `exp_events` |
| Personalization (profile) | **IMPLEMENTED** | `_rank_candidates` profile boosts |
| Personalization (AWS Personalize) | **NOT in live path** | Separate `/personalize/*` endpoints |
| Natural-language filters | **IMPLEMENTED** | `understand_query` + `_contract_filter` |
| Conversational follow-ups | **IMPLEMENTED** | `follow_up_suggestions`, refinement chips, memory persistence |
| Recipe/home cooking | **IMPLEMENTED** | Explicit recipe intent → RECIPE_SOURCE priority |
| Bytes/reels | **IMPLEMENTED** | BYTES_SOURCE + restaurant-linked fallback |
| Platform events | **IMPLEMENTED** | EVENT_SOURCE from `exp_events` |
| Domain guardrail (non-food) | **IMPLEMENTED** | `domain_relevance.py` early exit |
| Greetings/small talk | **IMPLEMENTED** | `special_answer` without retrieval |
| Relationship/abuse handling | **IMPLEMENTED** | RELATIONSHIP_PATTERNS, RUDE_WORDS |

---

## 8. Conversation / Session State

| State type | Storage | Status |
|------------|---------|--------|
| Chat history (query/reply) | MongoDB `user_memory` + frontend localStorage fallback | IMPLEMENTED |
| Session ID | Client-generated `sess_*`; server returns `session_id` | IMPLEMENTED |
| Concierge memory (4 fields) | MongoDB `user_memory` event_type=`concierge_context` | IMPLEMENTED |
| Semantic memory retrieval | Vector search on `user_memory` per turn | IMPLEMENTED |
| User profile preferences | MongoDB `users` collection read per request | IMPLEMENTED (if user_id + doc found) |
| Previous searches | Derived from chat history | IMPLEMENTED |
| AWS Personalize model state | S3 + Personalize campaign | OFFLINE (not live chat) |

**Frontend local fallback:** `homepage2_chat_history_*` in localStorage; merges with API history when API sections empty (`homepage2ChatApi.js`).

---

## 9. Customer Identity

| Mode | Production behavior |
|------|---------------------|
| **Anonymous chat** | Allowed — `user_id` may be null; no memory persist |
| **User-ID based** | Primary — frontend sends Redux `userId` in POST body |
| **JWT Bearer** | NOT enforced on production app (middleware not mounted) |
| **Session based** | Client `session_id` + server echo |

**Auth middleware** (`JWTMiddleware`): validates JWT against `JWT_SECRET`, loads user from `users` collection — **legacy app only**.

**Risk:** History endpoints accept `user_id` query param without auth — any caller with a user ID can read history.

---

## 10. Performance Characteristics

| Aspect | Behavior |
|--------|----------|
| **Sync vs async** | FastAPI async; LLM call uses blocking `urllib.request.urlopen` inside async method |
| **Parallel retrieval** | `asyncio.gather` on 5 source types |
| **Expensive operations** | 5× `$vectorSearch`; optional memory vector search; 1× LLM HTTP call |
| **Repeated LLM calls** | 1 per `/recommendations` request |
| **Caching** | `@lru_cache` on settings, repository, embedding service, recommendation service only (process lifetime) |
| **Batching** | Bulk `get_items_for_vendor_ids` instead of N queries |
| **Timeouts** | LLM: `REQUEST_TIMEOUT_SECONDS` (default 30); Bedrock embeddings same |
| **Retries** | NOT FOUND |
| **Rate limiting** | NOT FOUND |
| **Logging** | Latency logged: `total_ms`, `embedding_ms`, `search_ms`, `llm_ms` |
| **Background persist** | `asyncio.create_task` for memory/concierge writes (non-blocking response) |

**Concurrency assumption:** Single-process uvicorn; no distributed lock on memory writes.

---

## 11. Failure & Fallback Behavior

| Failure | Behavior |
|---------|----------|
| LLM HTTP error / timeout | `build_offline_concierge_reply` or static template; HTTP 200 |
| No `OPENAI_API_URL` | Offline template answer always |
| MongoDB vector search error (memory) | Fallback to recent docs by timestamp |
| No candidates + location set | `_build_no_match_response` |
| No candidates + clarification | Returns clarification question |
| Off-domain query | Redirect message; no cards |
| Malformed query | Sanitized via `_sanitize_query_value`; empty query UNKNOWN |
| Bedrock embedding misconfig | RuntimeError if Bedrock selected but fails |
| Deterministic embeddings | Silent fallback — retrieval quality degraded |

---

## 12. Security

| Area | Finding |
|------|---------|
| **Authentication** | Production `/recommendations` — **none** |
| **Authorization** | History readable by `user_id` query param only |
| **Secrets** | Env vars: `MONGO_URI`, `OPENAI_API_KEY`, `JWT_SECRET` (legacy), `AWS_*` |
| **PII** | User profile fields, chat text stored in `user_memory`; query logged |
| **Prompt injection** | Query passed into prompt with sanitization (`_sanitize_query_value`); no dedicated injection guard |
| **Mongo query safety** | Dietary/cuisine terms escaped via `re.escape` in regex filters |
| **CORS** | Default `*` origins in settings |
| **Data leakage** | `applied_preferences` and `memory_used` returned to client |
| **Personalize admin endpoints** | No auth on `/personalize/*` |

---

## 13. Integration Contract (Home Page 2)

```
User → /homepage2 (HomePage2.jsx)
  → POST {REACT_APP_RECOMMENDATIONS_API_BASE}/recommendations
     Body: { query, user_id, session_id, current_area, current_city, ... }
     Headers: Content-Type: application/json (NO Authorization)
  → Python RecommendationService (8-stage pipeline)
  → MongoDB amealio (read catalog + write user_memory)
  → Remote LLM HTTP API
  → Response: { answer, sections[], follow_up_suggestions[], session_id, ... }
  → UI: AssistantMessageCard + section carousels + refinement chips
  → Local persist: homepage2_chat_history_{userId} + sessionStorage session id
  → History drawer: GET /recommendations/history?user_id=&limit=50
  → Recipe detail: /homepage2/recipe/:recipeId (uses recipe card id from sections)
```

**Navigation entry points:** `/homepage2`, floating AI button from `/home`, V2NavBar home→homepage2.

**Card click behavior:** Restaurants/items/events/bytes navigate to restaurant or experience routes (`HomePage2.jsx` analytics + navigation handlers).

---

## 14. NestJS Integration Readiness (Constraints Only)

### What NestJS would need to call

| Item | Contract |
|------|----------|
| Endpoint | `POST /recommendations` (proxy as-is initially) |
| Request | `RecommendationRequest` fields above |
| Response | Full `RecommendationResponse` JSON |
| History | `GET /recommendations/history?user_id=&session_id=` |
| Health | `GET /health` |

### Required configuration to preserve

- `MONGO_URI`, `MONGO_DATABASE`, collection name overrides
- Vector index name + embedding field
- LLM URL, path, model, API key
- Bedrock embedding vars (if used in prod)
- CORS origins for user app domains
- `REQUEST_TIMEOUT_SECONDS`, concierge length limits

### Dependencies that cannot yet move

| Dependency | Reason |
|------------|--------|
| MongoDB `$vectorSearch` on 5+ collections | Embeddings precomputed in platform Mongo |
| Prebuilt vector index `"vector index"` | Atlas/search index infra |
| Remote LLM HTTP contract | Custom response parsing |
| `user_memory` write format | Chat history + concierge persistence |
| 2900+ lines ranking/retrieval in `chat_handler.py` | Heavily tuned Python logic |

### Could eventually move to PostgreSQL (with effort)

- User profile reads (if synced from main platform)
- Chat history storage (if embedding strategy preserved)
- Catalog metadata (if embeddings regenerated/reindexed)

### Should likely remain Python

- `understand_query` + `domain_relevance` hint engines
- `_rank_candidates` scoring matrix
- `_contract_filter` Mongo aggregation dietary logic
- Prompt template assembly + offline concierge fallbacks
- Personalize offline pipeline (already separate)

---

## 15. Critical Preservation Lists

### TOP 25 AI BEHAVIORS THAT MUST NOT BE LOST

1. 8-stage recommendation pipeline (preprocess → assemble)
2. Multi-source parallel retrieval (5 object types)
3. MongoDB vector search with location fallback (area → city)
4. Domain guardrail for off-topic queries
5. Location clarification when missing for "near me" queries
6. Dietary intent extraction (veg/nonveg/vegan/jain)
7. Mongo `$match` dietary contract filters on retrieval
8. Profile-based ranking boosts (cuisine, cravings, moods, favourites)
9. Allergy penalty on ranking (-0.30)
10. Concierge memory merge (budget, rooftop, luxury, other)
11. Concierge persistence to `user_memory`
12. Chat turn persistence (query + reply with sections)
13. Session list + message history API
14. Follow-up suggestion chips (`follow_up_suggestions`)
15. Structured `query_intent` in response
16. Sectioned cards (restaurants/items/bytes/events/recipes)
17. LLM concierge-style answer generation
18. Offline LLM fallback (non-identical templated answers)
19. Recipe explicit intent detection (home cooking vs dish discovery)
20. Event retrieval from `exp_events`
21. Item-per-vendor cap (3) in item sections
22. Greeting/special-answer short paths
23. `rewritten_query` for downstream debugging/sync
24. Frontend local history merge when API sections empty
25. CORS support for `dev-user.amealio.com` and prod user domains

### TOP 15 AI/LLM DEPENDENCIES

1. MongoDB Atlas (or compatible) with vector search indexes
2. Remote LLM HTTP endpoint (OpenAI-compatible)
3. Pre-embedded documents in restaurants, vendoritems, reels, exp_events, RecipeItem
4. AWS Bedrock (if used for embeddings in prod)
5. `amealio` MongoDB database (shared with main platform)
6. `users` collection with preference fields
7. `user_memory` collection (dedicated or shared)
8. Environment-specific recommendation API hostnames
9. CORS configuration for user web app origins
10. `subcategories` collection for cuisine lookup
11. Python 3.11 runtime
12. FastAPI/uvicorn serving layer
13. Frontend `REACT_APP_RECOMMENDATIONS_API_BASE` per env
14. Optional: AWS Personalize pipeline (offline analytics path)
15. Optional: DeepSeek/Ollama-compatible LLM URL (README documents Ollama path)

### TOP 15 PYTHON COMPONENTS THAT SHOULD NOT BE REWRITTEN WITHOUT REVIEW

1. `chat_handler.py` — RecommendationService (~2900 lines)
2. `mongo.py` — vector search + contract filters + payload normalization
3. `query_understanding.py` — intent extraction
4. `domain_relevance.py` — guardrails
5. `prompt_templates.py` — assistant prompt
6. `intent_suggestions.py` — query intent + follow-ups
7. `location_context.py` — location resolution
8. `concierge_memory.py` — memory merge/inference
9. `offline_concierge_reply.py` — LLM fallback copy
10. `embed_generator.py` — Bedrock/deterministic embedding selection
11. `recommendation_schema.py` — API contract
12. `personalize_pipeline/*` — AWS ETL (if retained)
13. Ranking helpers in `_rank_candidates`, `_filter_ranked_items_for_query`
14. `_search_with_location_fallback` cascade logic
15. History session grouping in `mongo.py` `_build_chat_sessions`

### TOP 15 RISKS OF MOVING LOGIC TO NESTJS

1. Loss of tuned Python ranking weights without regression suite
2. Vector index + embedding field mismatch breaks retrieval silently
3. Deterministic embedding fallback masks config errors in dev
4. Dual user collection naming (`users` vs platform `User Service`)
5. Chat history format mismatch breaks HomePage2 drawer
6. LLM prompt drift if template not byte-identical
7. Dietary contract filter parity across SQL vs Mongo aggregation
8. Loss of domain guardrail → irrelevant food searches or bad UX
9. Blocking LLM call inside async — NestJS must handle timeouts carefully
10. Unauthenticated API — exposing proxy increases abuse surface
11. Extra frontend fields (`timezone`, `selected_date`) silently dropped — may need future support
12. Personalize pipeline confusion if merged into live path prematurely
13. Memory write race conditions under concurrent requests
14. CORS misconfiguration breaks SPA in prod only
15. Undocumented production embedding provider (Bedrock vs deterministic)

### TOP 15 QUESTIONS / UNKNOWNS

1. Production embedding provider: Bedrock or deterministic?
2. Production LLM endpoint: OpenAI, DeepSeek, or custom?
3. Is `users` collection same as platform `User Service` in prod env?
4. Are vector indexes maintained by separate ETL job?
5. Who writes `embedding` field on catalog documents?
6. Is AWS Personalize intended to feed live recommendations later?
7. Why is JWT middleware not on production app?
8. Are `/personalize/*` endpoints exposed publicly in prod?
9. Actual retrieval quality with deterministic embeddings in any env?
10. Is `item_enrich` service deployed alongside main app?
11. Legacy `main.py` still deployed anywhere?
12. Rate/abuse protection on recommendation API?
13. Are `selected_date` / `timezone` frontend fields planned for backend use?
14. Open status filtering — intentional omission or gap?
15. Allergy handling — penalty only; is hard filter required by product?

---

## 16. Migration Constraints (Evidence-Based)

| Category | Items |
|----------|-------|
| **MUST PRESERVE** | POST/GET API contracts; 5-section card response; 8-stage pipeline behavior; vector search retrieval; chat history + concierge persistence; HomePage2 frontend integration URLs; follow-up chips; domain guardrails |
| **MUST UNDERSTAND FIRST** | Production embedding source; users collection mapping; vector index maintenance; LLM endpoint contract; auth/security requirements for history |
| **SAFE TO REFACTOR LATER** | Personalize pipeline isolation; legacy `main.py` removal; item_enrich deployment model; internal logging/metrics; CORS tightening |
| **UNKNOWN** | NestJS proxy vs Python sidecar vs full port; PostgreSQL role in discovery; whether timezone/date should affect ranking |

---

## Evidence Index

| File | Role |
|------|------|
| `src/app/main.py` | Production FastAPI entry |
| `src/models/llm/chat_handler.py` | Core pipeline |
| `src/core/db/mongo.py` | MongoDB vector search |
| `src/models/llm/query_understanding.py` | Intent extraction |
| `src/models/llm/prompt_templates.py` | LLM prompt |
| `src/core/settings.py` | Configuration |
| `src/api/routers/recommendations.py` | HTTP routes |
| `amealio_web_app/.../HomePage2.jsx` | Frontend integration |
| `amealio_web_app/.../homepage2ChatApi.js` | API client |
| `amealio_web_app/.env-cmdrc` | Env URLs |
