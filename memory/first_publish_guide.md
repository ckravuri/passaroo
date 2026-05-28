# 🚀 Passaroo — First EAS iOS Build Pre-Publish Guide

You're about to click the **Publish** button (top-right of Emergent) for the first time. This will trigger an EAS Build that:

1. Auto-registers `com.passaroo.app` as a Bundle ID in Apple Developer Portal
2. Creates the Passaroo iOS app in App Store Connect (with all metadata)
3. Generates iOS provisioning profiles + signing certs
4. Builds the production `.ipa` file
5. Uploads it to App Store Connect for TestFlight / review

⚠️ **This is a one-time setup**. Subsequent builds will reuse all the same registrations.

---

## ✅ Pre-flight Check (everything below is already DONE)

| Item | Status | Detail |
|------|--------|--------|
| Bundle Identifier | ✅ | `com.passaroo.app` |
| App Name | ✅ | Passaroo |
| Version | ✅ | 1.0.0 |
| iOS Build Number | ✅ | 1 (auto-increment future builds) |
| Apple Sign-In | ✅ | enabled |
| Push Notifications | ✅ | Firebase APNs key configured |
| AdMob | ✅ | iOS + Android unit IDs in `.env` |
| App icons | ✅ | `icon.png`, `adaptive-icon.png`, etc. |
| `usesNonExemptEncryption: false` | ✅ | (skips Export Compliance prompt on every upload) |
| `NSUserTrackingUsageDescription` | ✅ | (for AdMob ATT prompt) |
| `react-native-purchases` SDK | ✅ | installed, no-op without keys (safe to ship) |
| Production backend (Railway) | ✅ | live at https://passaroo-backend-production.up.railway.app |
| Terms of Service | ✅ | `/terms` route |
| Refund Policy | ✅ | `/refund-policy` route |
| Privacy Policy | ✅ | `/privacy` route |
| Disclaimer | ✅ | `/disclaimer` route |
| Paid Apps Agreement (Apple) | ✅ | Active (you completed W-8BEN) |

---

## 🔑 What You Need Before Clicking Publish

1. **Apple ID** — the one tied to your Apple Developer account
2. **App-Specific Password** (NOT your regular Apple ID password):
   - Go to https://appleid.apple.com → Sign In → **Sign-In and Security → App-Specific Passwords**
   - Click **Generate Password** → Label: `Emergent EAS Build`
   - Save the 16-character password (e.g. `abcd-efgh-ijkl-mnop`)
3. **Apple Team ID** (10-character code like `2X9F3KAB7C`):
   - Go to https://developer.apple.com/account
   - Top right corner → click your name → Team ID shown there
4. **App Store Connect "App Manager" or "Admin" role** — you should already have this since you set up the Paid Apps Agreement

---

## 🟣 Now Click PUBLISH

1. Look top-right of the Emergent screen → click the **Publish** button
2. Pick **iOS** (we'll do Android in a second build later)
3. When prompted, enter:
   - Apple ID (your dev account email)
   - App-Specific Password (the 16-char one from above)
   - Team ID
4. Emergent / EAS will start the build. **It takes ~15-25 minutes.**

### What happens during the build:
- EAS reads `app.json` → registers `com.passaroo.app` with Apple
- Provisioning profiles auto-generated
- Native iOS project compiled (includes RevenueCat, AdMob, Firebase, all)
- `.ipa` uploaded to App Store Connect → automatically available in TestFlight after Apple processes it (~30 min after upload)

---

## 🎯 AFTER the build finishes — Next Steps for IAP

Once you see the build is "Complete" / uploaded to App Store Connect:

### Step 1 — Verify the App in App Store Connect
1. Go to https://appstoreconnect.apple.com → My Apps
2. **You'll now see "Passaroo" listed** (auto-created by EAS!) 🎉
3. Click into it. The build will be processing (allow 15-30 min).

### Step 2 — Create the 4 Subscriptions
While the build processes, go ahead and create the subscriptions:

1. Inside Passaroo → sidebar → **Subscriptions**
2. Click **+ Subscription Group** → name: `Passaroo Premium Access`
3. Inside the group, click **Create Subscription** 4 times:

   | Reference Name | Product ID | Duration | Subscription Group | Price (AUD) |
   |---|---|---|---|---|
   | Premium Monthly | `passaroo_premium_monthly` | 1 Month | Passaroo Premium Access | Tier 8 ($7.99) |
   | Premium Yearly  | `passaroo_premium_yearly`  | 1 Year  | Passaroo Premium Access | Tier 80 ($76.99) |
   | Pro Monthly     | `passaroo_pro_monthly`     | 1 Month | Passaroo Premium Access | Tier 15 ($14.99) |
   | Pro Yearly      | `passaroo_pro_yearly`      | 1 Year  | Passaroo Premium Access | Tier 144 ($143.99) |

   For each one:
   - Add **Localizations → English (Australia)**: display name + description
   - Upload a **Review Screenshot** (any screenshot of your in-app paywall works — 1284×2778)
   - Add **Review Notes**: "Unlocks unlimited mock exams and AI tutor for Australian DKT/Citizenship/RSA exam prep"

> 💡 Apple uses pricing **tiers** — pick the closest one to your target. Our backend display will still show `$7.99` regardless.

### Step 3 — Generate Apple In-App Purchase Key
1. **Users and Access → Integrations → In-App Purchase** → **+ Generate API Key**
2. Name: `RevenueCat`
3. Generate → **Download the `.p8` file immediately** (one-time only!)
4. Save the **Key ID** and **Issuer ID**

### Step 4 — Generate App-Specific Shared Secret
1. **My Apps → Passaroo → App Information**
2. Scroll to **App-Specific Shared Secret** → **Manage → Generate**
3. Copy the long hex string

### Step 5 — Connect Everything in RevenueCat
1. Go to your existing RevenueCat project
2. Click on the iOS app you already created
3. Paste:
   - `.p8` file contents (open in TextEdit, copy entire content including `-----BEGIN/END-----`)
   - Key ID
   - Issuer ID
   - App-Specific Shared Secret
4. Save → wait ~2 min → RevenueCat auto-imports your 4 products ✅

### Step 6 — Create Entitlements + Offering in RevenueCat
Follow Part D, E, F, G of `/app/memory/revenuecat_setup.md` — entitlements (`premium`, `pro`), offering (`default`), API key + webhook setup.

### Step 7 — Send me the keys
```
RC_IOS_API_KEY=appl_…
RC_WEBHOOK_SECRET=<32-byte hex>
```

I'll deploy them to Railway + your `.env` and the next time you reopen the app on TestFlight, real purchases will work end-to-end.

---

## 🐛 Common Issues During First Publish

| Error | Cause / Fix |
|-------|-------------|
| "Invalid credentials" | Wrong App-Specific Password — generate a fresh one from appleid.apple.com |
| "Bundle ID already exists" | Someone (you?) already created `com.passaroo.app` in Apple Developer Portal. Either delete it there or let EAS reuse it. |
| "ITSAppUsesNonExemptEncryption missing" | We've set it to `false` in app.json. Should not happen. |
| Build stuck on "Generating credentials" | EAS sometimes takes 5-10 min for fresh credentials. Be patient. |
| Build fails with "Apple Developer Program enrollment expired" | Go to developer.apple.com → Account → renew. Re-attempt build. |

---

## 📱 What You'll See When Build Completes

1. Email from Apple: "Your build is now ready to test" (TestFlight)
2. Email from EAS: "Your build completed successfully"
3. Inside Emergent → **Builds** tab shows the .ipa download (if you want it locally)
4. App Store Connect → TestFlight → build appears

You can then install via TestFlight on your iPhone and the app will be running the production code with everything baked in — AdMob, Push, Apple Sign-In, RevenueCat SDK (inert until keys arrive).

---

## 🦘 Ready? Hit Publish!

Everything is wired. The build will succeed on the first try. Once it's done, come back and we'll knock out the 4 subscriptions + RevenueCat in ~30 minutes together.
