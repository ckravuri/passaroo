# Passaroo AdMob — Configuration Reference

## Account: AdMob Publisher ID `pub-9480363771925708`

### App IDs (in `app.json` plugin config)
| Platform | App ID |
|---|---|
| Android | `ca-app-pub-9480363771925708~6873878189` |
| iOS | `ca-app-pub-9480363771925708~4247714848` |

### Ad Unit IDs (in `/app/frontend/.env`, EXPO_PUBLIC_*)
| Placement | Android | iOS |
|---|---|---|
| Dashboard banner | `…/2432447598` | `…/7452158761` |
| Results banner   | `…/9332520560` | `…/3114973877` |
| Exam interstitial| `…/3704485447` | `…/2199832085` |

(All units share publisher prefix `ca-app-pub-9480363771925708/…`)

## Where each value lives

- **App IDs** → `/app/frontend/app.json` → `plugins[].react-native-google-mobile-ads`
- **Ad unit IDs** → `/app/frontend/.env` → `EXPO_PUBLIC_PROD_ADMOB_*`
- **TestIds (dev fallback)** → `/app/frontend/src/ads/config.ts` (auto-selected via `__DEV__`)

## Verification checklist (when you're ready to publish)

1. Emergent **Publish** button → in Secrets / Env UI, confirm `EXPO_PUBLIC_PROD_ADMOB_*` vars are populated.
2. Trigger an **EAS production build** for Android and iOS.
3. Install on a real device (NOT Expo Go — ads won't work there).
4. Verify:
   - Free user: banner on dashboard + results, interstitial on 2nd exam
   - Premium/Pro user: NO ads at all, "Remove ads" button hidden
   - "Remove ads" → deep-links to `/paywall`
5. AdMob console → check **App-ads.txt** instructions if you have a website (for Play Store optional verification).
6. Play Store: **App content → Ads → Yes, contains ads**.
7. Wait 24-48h for "house ads" → real paying advertisers will start serving.

## Notes
- The "No 'androidAppId' was provided…" warning in Metro/Expo Go logs is **cosmetic only** — the SDK reads IDs from native AndroidManifest.xml / Info.plist, which are only generated during `expo prebuild` / EAS Build.
- Ads NEVER appear in: Expo Go, Web preview, dev simulator without dev-client.
- During development EAS builds → Google **TestIds** are used (safe, no policy risk).
- Production EAS builds → your real IDs.
