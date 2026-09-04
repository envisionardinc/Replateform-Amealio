# 03 — Frontend Inventory

Consumer app (`amealio_web_app`) and admin/merchant app (`amealiodashboardmvp-`). Routes/screens are cited to their router files. The backend has no frontend.

## A. Consumer — `amealio_web_app`

- **Router:** `src/setup/routes-manager/index.js` (React Router v6; public auth, `ProtectedLayer` soft-auth, and eager "pilot" routes). App shell/auth bootstrap: `src/App.js`. REST paths: `src/common/api/urls.js`. State: `src/store/store.js`.

### Major routes / screens

| Capability | Routes (examples) | Screen files |
|-----------|-------------------|--------------|
| Home / discovery | `/home`, `/homepage2`, `/search`, `/mood/:…`, `/craving/:…`, `/curation/:…` | `src/screens/AmealioHome/MainHomeScreen.jsx`, `.../HomePage2/HomePage2.jsx`, `GlobalSearch.jsx` |
| Restaurant details | `/restaurant/:ID`, `/restaurant/:ID/food/menu/v1`, `/restaurant/:ID/details/v2Gallery|v2Reviews` | `NewRestaurantDetails`, `MainMenu` |
| Menu / item | `/restaurant/:ID/food/itemdetails/:itemId` | item detail screens |
| Ordering (legacy + V1) | `/restaurant/:ID/food/cart(page)`, `/food/ordercheckout` or `/food/checkout/:order_id`, `/food/ordertrack/:order_id(/new)` | `src/screens/ordering/**`, `src/screens/orderingv1/**` |
| Seating/reservation | `/restaurant/:restaurantId/seating/waitlist`, `/seating/reservation`, `/seating/track/:dinerId` | `NewSeatingResquest.jsx`, track wrappers |
| Experiences/events | `/experience`, `/experience/events/:eventId`, `/restaurant/:ID/experiences/:experienceId/(details|booking|checkout)`, `/experiences/track/:trackId` | `V2Experience`, `ExperienceBookingPage.jsx`, `ExpCheckout.jsx` |
| ONDC buyer | `/<:::-ONDC-:::>`, `/ondc/:ID/(menu|ondccart|checkout/:order_id|ondctrack/:order_id)` | `src/screens/ONDC/**` |
| Profile / account | `/profile/new`, `/Profile/(preferences|favoritesPage|track-order|order-history|saved-addresses)`, `/qruser` | `AmealioProfilePageRoute.jsx` |
| Wallet | API present (`wallet`, `payment/wallet`); no dedicated `/wallet` route (**UNKNOWN — REQUIRES REVIEW**, may be mobile-only) | — |
| Community | `/community` (WebView) | `Community.jsx` |
| Bytes/reels | `/bytes`, `/restaurant/:ID/bytes` | `MainBytesScreen.jsx` |
| Auth | `/login`, `/signup`, `/enterotp`, `/enterloginotp`, `/auth/whatsapp/callback|result` | `UserRegistration`/`SeatingUserRegistration`, `SignUp.js`, OTP screens |

### Navigation & journeys
- Bottom navigation + side bar (`BottomNavigationBar`, `MainsideBar`). Guest-first browsing; `useRequireAuth` opens an OTP login modal on gated actions; guest cart merges on login (`common/utility/cartManager.js`).
- Journeys detailed in [11](./11-END-TO-END-WORKFLOWS.md).

### Consumer capability → repo
All consumer UI is implemented in `amealio_web_app`; all data/logic in `amealio-vendordashboard`.

## B. Admin + Merchant — `amealiodashboardmvp-`

- **Router:** `client/src/store/utils/Routes.js` (~4,900 lines, ~400+ routes) with guards `PrivateRoute` (vendor), `AdminPrivateRoute` (superadmin), `DetailsPrivateRoute`/`MerchantDashboardAndOnboardingRoute` (onboarding). Auth bootstrap: `client/src/App.js`. Auth actions: `client/src/store/actions/authAction.js`.
- **Portal selection:** hostname (`admin`/`merchant`) → `portal` header (`authAction.js`).

### Merchant workflows (role `vendor`)

| Area | Routes (examples) |
|------|-------------------|
| Onboarding | `/mapsetup`, `/map-setup-two`, subscription pickers (`/casual-fine-dining/*`, `/fastfood/*`, `/multi-service/*`), `/termcondition` |
| Menu/catalog | `/menusetup-dashboard`, `/categorydashboard`, `/addcategory`, `/createcustommenu`, `/additemavailablity` |
| Seating/dining | `/seatingdashboard`, `/pendingdashboard`, `/reservationdashboard`, `/historydashboard`, `/manage-block-reservation-calendar` |
| Orders | `/orderdashboard/:page?`, `/orderrequest/:token?`, `/ordertrack`, `/addorder`, `/payment`, `/itemavailablitydashboard` |
| Experiences/events | `/experienceDashboard/*`, `/event`, `/curatedDashboard`, `/specialDashboard` |
| Staff/roles | `/rolemanagement`, `/addrole`, `/staffmanagement`, `/addstaff` |
| Subscriptions | `/edit-ordering-subscription/*`, `/edit-seating-subscription`, `/edit-event-subscription` |
| Settlements/earnings | `/mainsettlementsvendor`, `/settlementsvendor/:type/:id/:restaurant_id`, `/earnings`, `/merchantStatement` |
| Reports | `/reportdashboard`, `/allorderreport`, `/experiencereport`, `/scanandpayreport` |
| Support/ops | `/chat-dashboard`, `/vendorreviews`, `/disputemanagement`, `/notification`, `/referrals` |

### Admin workflows (role `superadmin`)

| Area | Routes (examples) |
|------|-------------------|
| Users/vendors | `/superadmindashboard`, `/superadminallusers`, `/superadminallvendors`, `/superadminallpendingvendors` |
| Vendor onboarding (admin-led) | `/addvendor`, `/addvendormapdetails`, `/addvendorbusinessdetails`, `/admin_edit_*` |
| ONDC | `/superadmin/ondc/(merchant-management|order-management|open-settlements|requested-settlements|approved-settlements|refunds|issueandgrievancemanagement)` |
| Delivery partner (Dunzo) | `/superadmindunzoDeliverySettings`, `/superadmindunzostatement`, `/superadmin/dunzo/settlements/restaurants`, `/admindeliveryreports` |
| Settlements/payouts | `/superadminopenitemsettlement`, `/superadmin/initiated-settlement`, `/superadminpayoutdetails/:id`, `/superadminuserwithdrawalrequests` |
| Staff/roles | `/superadmin-role-management`, `/superadmin-add-role` |
| POS/referrals/wallet | `/superadminposdashboard`, `/SuperAdminReferralRewarddashboard`, `/closewallet` |
| Content/curation | `/superadmin/home/mood`, reels/templates/promo-videos/UOM |
| Reports | `/superadminreports`, `/superadminsettlementsummaryreport`, `/superadminordersettlementreport` |
| Voice | Twilio browser calling (`twilio-client`), token from `GET ${serverApi}/token` |

## C. Capability → implementing repository (baseline)

| Capability | Consumer UI | Operator UI | Data/logic |
|-----------|-------------|-------------|-----------|
| Auth flows | `amealio_web_app` | `amealiodashboardmvp-` | `amealio-vendordashboard` |
| Restaurant discovery | `amealio_web_app` | (mgmt only) | backend |
| Restaurant details | `amealio_web_app` | `amealiodashboardmvp-` (edit) | backend |
| Menu browsing / mgmt | `amealio_web_app` (browse) | `amealiodashboardmvp-` (manage) | backend |
| Ordering / checkout | `amealio_web_app` | `amealiodashboardmvp-` (ops) | backend |
| Payments | `amealio_web_app` (Razorpay SDK) | `amealiodashboardmvp-` (settlement views) | backend |
| Reservations / seating | `amealio_web_app` | `amealiodashboardmvp-` | backend |
| Celebrations / experiences | `amealio_web_app` | `amealiodashboardmvp-` | backend |
| Events / ticketing | `amealio_web_app` (book) | `amealiodashboardmvp-` (manage, QR tickets) | backend |
| Notifications | `amealio_web_app` (in-app/push) | `amealiodashboardmvp-` | backend |
| Promotions | `amealio_web_app` (apply) | `amealiodashboardmvp-` (create) | backend |
| Personalization/AI | `amealio_web_app` (moods/cravings/recos) | — | backend + **external recommendations API** |
| Admin workflows | — | `amealiodashboardmvp-` | backend |
| Merchant workflows | — | `amealiodashboardmvp-` | backend |
| Delivery (tracking UI) | `amealio_web_app` (map via external socket) | `amealiodashboardmvp-` (Dunzo admin) | backend + **deferred/external tracker** |

## D. Design/state notes (baseline)
- Consumer: MUI v5 + Bootstrap + partial Tailwind + SCSS; Redux Toolkit + redux-persist; parallel legacy/V2 flows. Admin/Merchant: MUI v4 + Bootstrap 4 + styled-components + SCSS; Redux + thunk; per-screen `createTheme`. No shared design system across the two. (Full design inventory: `docs/migration/09-design-system-inventory.md`.)
