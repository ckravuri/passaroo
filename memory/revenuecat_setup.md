# 🦘 Passaroo — RevenueCat Setup Guide

This is your **complete checklist** for wiring real in-app subscriptions for Passaroo. Follow it once and you're done.

Pricing (already configured on backend in `subscription_config.py`):

| Plan | Monthly | Yearly (Save 20%) | Yearly ÷ 12 |
|------|---------|-------------------|-------------|
| Premium | AUD **$7.99**/mo | AUD **$76.70**/yr | ≈ $6.39/mo |
| Pro | AUD **$14.99**/mo | AUD **$143.90**/yr | ≈ $11.99/mo |

Your **product IDs** (already coded — must match exactly when you create the SKUs below):

```
passaroo_premium_monthly
passaroo_premium_yearly
passaroo_pro_monthly
passaroo_pro_yearly
```

---

## 1️⃣ Apple App Store Connect (create the 4 iOS SKUs)

1. Sign in → **App Store Connect → My Apps → Passaroo**
2. Sidebar → **Subscriptions** → **+** (Create Subscription Group)
   - Group Reference Name: `Passaroo Premium Access`
3. Inside the group, click **Create Subscription** four times with these details:

   | Reference Name | Product ID | Subscription Duration | Price (AUD) |
   |---|---|---|---|
   | Premium Monthly | `passaroo_premium_monthly` | 1 Month | $7.99 |
   | Premium Yearly  | `passaroo_premium_yearly`  | 1 Year  | $76.99 (or use $76.70 if your tier allows custom) |
   | Pro Monthly     | `passaroo_pro_monthly`     | 1 Month | $14.99 |
   | Pro Yearly      | `passaroo_pro_yearly`      | 1 Year  | $143.99 (or custom $143.90) |

   For each subscription:
   - **Subscription Display Name**: e.g. "Passaroo Premium — Monthly"
   - **Description**: ~120 chars describing the tier
   - **Localized info**: at least English (AU)
   - **Review screenshot**: any screen showing the paywall (1284×2778 for iPhone)
   - **Review notes**: "Subscription unlocks unlimited mock exams and AI tutor for Australian DKT/Citizenship/RSA exam prep."

4. Go to **Users and Access → Integrations → In-App Purchase Keys → Generate API Key**
   - Name: `RevenueCat`
   - Save the **Key ID** (e.g. `8X7Y9Z...`) and **Issuer ID**
   - Download the `.p8` file (you'll only get to do this **ONCE** — save it!)

5. Get your **App Store Connect Shared Secret**:
   - **My Apps → Passaroo → App Information → App-Specific Shared Secret → Generate**
   - Copy the long hex string

✅ Status check: All four products show "Ready to Submit" (or "Approved").

---

## 2️⃣ Google Play Console (create matching Android SKUs)

> Prerequisite: Your Play Console **Merchant Account** must be set up. Go to **Setup → Payments profile**.

1. **Play Console → Passaroo → Monetize → Products → Subscriptions** → **Create subscription**
2. Create 4 subscriptions with the same product IDs as Apple:
   - `passaroo_premium_monthly` — AUD $7.99 / 1 month
   - `passaroo_premium_yearly` — AUD $76.70 / 1 year
   - `passaroo_pro_monthly` — AUD $14.99 / 1 month
   - `passaroo_pro_yearly` — AUD $143.90 / 1 year
3. For each: add at least one **Base plan** (Auto-renewing). Skip offers for now.
4. Set status to **Active** for each.

5. Create a **Service Account** for RevenueCat:
   - **Setup → API access → Create new service account** → opens Google Cloud
   - Create service account with name `revenuecat-passaroo`
   - Skip role assignment in Cloud (Play handles permissions)
   - Click the new service account → **Keys → Add Key → JSON** → download `passaroo-play-sa.json`
   - Back in Play Console → **Grant access** for the service account
   - Permissions: Financial data, View, Manage orders and subscriptions (only these — RC docs)

---

## 3️⃣ RevenueCat (the magic glue)

1. Sign up free at https://app.revenuecat.com
2. **Create new project** → name it `Passaroo`

### Add iOS app
   - **Project → Apps → Add App → App Store**
   - Bundle ID: `com.passaroo.app` (must match your `app.json` → `ios.bundleIdentifier`)
   - Upload **App Store Connect API Key**: paste the `.p8` file contents, plus Key ID + Issuer ID from Step 1️⃣.4
   - Paste the **App-Specific Shared Secret** from Step 1️⃣.5
   - RevenueCat will auto-import your 4 SKUs ✅

### Add Android app
   - **Project → Apps → Add App → Play Store**
   - Package name: `com.passaroo.app`
   - Upload `passaroo-play-sa.json` from Step 2️⃣.5
   - RevenueCat will auto-import your 4 SKUs ✅

### Create Entitlements
- **Project → Entitlements → New**
  - Entitlement 1: `premium` — description: "Premium tier access"
  - Entitlement 2: `pro` — description: "Pro tier access"

### Attach products to entitlements
- Click the `premium` entitlement → **Attach products**
  - Attach `passaroo_premium_monthly` (both iOS + Android)
  - Attach `passaroo_premium_yearly` (both iOS + Android)
- Click the `pro` entitlement → **Attach products**
  - Attach `passaroo_pro_monthly` (both)
  - Attach `passaroo_pro_yearly` (both)

### Create Offerings (paywall layout)
- **Project → Offerings → New Offering**
  - Identifier: `default`
  - Description: "Passaroo default paywall"
- Inside the offering, click **+ Add package** and create:
  - `$rc_monthly` → linked to `passaroo_premium_monthly` (iOS + Android)
  - `$rc_annual` → linked to `passaroo_premium_yearly`
  - `pro_monthly` → linked to `passaroo_pro_monthly`
  - `pro_yearly` → linked to `passaroo_pro_yearly`
- Set this offering as **Current**.

### Get API Keys
- **Project Settings → API Keys**
- Copy these two values **PUBLIC keys (start with `appl_` and `goog_`)** — these go in the mobile app:
  - **iOS API Key** (starts with `appl_…`) → save as `RC_IOS_API_KEY`
  - **Android API Key** (starts with `goog_…`) → save as `RC_ANDROID_API_KEY`

### Configure Webhook
- **Project Settings → Integrations → Webhooks → Add Webhook**
- URL: `https://passaroo-backend-production.up.railway.app/api/iap/revenuecat-webhook`
  (use this exact URL — backend route already exists and validates the auth header)
- **Authorization Header**: choose **Bearer Token** and paste any long random string (this becomes `RC_WEBHOOK_SECRET`).
  Generate one with: `openssl rand -hex 32` — example: `e3a1c4f9b2…`
- **Events to send**: enable ALL (Initial purchase, Renewal, Cancellation, Expiration, Billing issue, Product change, Transfer, Non-renewing purchase, Uncancellation)
- Save & click **Send test event** — you should see a 200 response (the backend stores it in `iap_events`).

---

## 4️⃣ Send me these 3 secrets

When you're done with the above, paste these to me in chat and I'll wire them up in 5 minutes:

```
RC_IOS_API_KEY = appl_…
RC_ANDROID_API_KEY = goog_…
RC_WEBHOOK_SECRET = <the random string you used in the webhook>
```

I'll then:
1. Set them as env vars on Railway + .env
2. Install `react-native-purchases` via `yarn expo install`
3. Initialise RC in `_layout.tsx` after login
4. Replace the paywall's mock "Choose plan" with a real `Purchases.purchasePackage()` call
5. Hook up restore purchases in Profile

---

## 5️⃣ Things to know

- **Sandbox testing**: Apple sandbox subscriptions renew **every few minutes** instead of monthly — perfect for QA.
- **Promo codes / Discounts**: You can issue Apple Promo Codes from App Store Connect or Google Promo Codes from Play. The **in-app coupons** I built (admin panel → Coupons tab) work independently — they grant entitlements directly via the server (perfect for influencers, beta testers, "first 100 users" promos).
- **Free trial**: Once your products are live, you can add Introductory Offers in App Store Connect / Play Console for 3-day or 7-day free trials. RevenueCat automatically detects them.
- **Reviewing**: Apple reviewers will buy your subscription with a test card during review. Make sure restore purchases works.
- **Fair use**: Pro is sold as "Unlimited" but capped at 50 exams/week on the backend. This is disclosed in Terms.

---

## ⚠️ Common gotchas

| Symptom | Cause |
|---------|-------|
| "Product not found" on iOS | Apple subscription is in **"Waiting for review"** — needs review screenshot uploaded |
| "Product not found" on Android | License testing not set up. Add yourself as a tester in **Setup → License testing** |
| Webhook 401 | Your `RC_WEBHOOK_SECRET` doesn't match what's set in Railway env |
| Yearly price shows weird | Apple/Play only allow prices from their tier list. If $76.70 isn't selectable, choose the nearest tier ($76.99) — backend pricing is just display. |
| User upgraded but app still shows free | Backend webhook hadn't fired yet — call `Purchases.syncPurchases()` then `/api/auth/me`. |

---

That's it! Once you ping me with the 3 keys, real subscriptions will be live in minutes. 🦘🚀
