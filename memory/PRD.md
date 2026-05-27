# Passaroo — Product Requirements Document

## Overview
**Passaroo** is an AI-powered Australian exam preparation companion (mobile-first Expo app + FastAPI backend).
Starts with three certifications and is built to scale to more (White Card, Security, Forklift, Trade, Cyber, APS, Real Estate, Insurance).

### Tagline
"Your AI-powered Aussie study buddy for the DKT, Citizenship Test and RSA."

### Legal Position
Passaroo is an **independent educational platform** and is **not affiliated with Australian government agencies or official testing bodies**. All practice questions are independently written/paraphrased around publicly known learning objectives.

---

## Tech Stack (built)
- **Frontend:** Expo SDK 54 + React Native + TypeScript + Expo Router (file-based routing)
- **Backend:** FastAPI + Motor (MongoDB)
- **Auth:** Emergent-managed Google OAuth + Email/Password (bcrypt + session tokens)
- **AI:** Gemini 3 Flash via Emergent Universal LLM Key (cheapest available)
- **Storage:** MongoDB with TTL indexes on sessions

> Note: User originally requested Node.js + Railway + Firebase Auth. Emergent platform uses FastAPI + Python + Emergent-managed OAuth (Firebase OAuth requires native builds). Architecture is equivalent and works in Expo Go.

---

## Exam Categories (seeded)
| Category | Questions in Bank | Exam Size | Time | Pass |
|---|---|---|---|---|
| DKT (NSW) | 30 | 25 | 30 min | 80% |
| Citizenship | 30 | 20 | 25 min | 75% |
| RSA | 30 | 20 | 25 min | 75% |

All questions are **original paraphrased content** with custom explanations.

---

## Subscription Tiers (mocked upgrades — real IAP on native build)
| Tier | Price | Exams/Week | AI Explanations/Day | AI Tutor | Ads |
|---|---|---|---|---|---|
| Guest | — | 1 | 0 | ❌ | ✅ |
| Free | AUD $0 | 2 | 5 | ❌ | ✅ |
| Premium | AUD $7.99/mo | 15 | 100 | ✅ | ❌ |
| Pro | AUD $14.99/mo | 50 (marketed "unlimited") | 500 | ✅ | ❌ |

---

## Implemented Features

### Authentication
- Email/password sign up + sign in (bcrypt-hashed, JWT-style session tokens, 7-day expiry)
- Emergent-managed Google OAuth (cross-platform: Expo Go + production)
- One active device session per user (previous sessions invalidated)
- TTL index auto-expires sessions

### Exam Flow
- Browse 3 categories from dashboard / exams tab
- Timed mock exam (live countdown, auto-submit at 0)
- Progress bar + chunky multiple-choice options
- Weekly per-tier exam limit (server-enforced)
- Results screen with pass probability, weak-topic chips, per-question review

### AI (Gemini 3 Flash)
- **Explain this answer** — per-question AI breakdown on results screen
- **AI Tutor chat** — multi-turn conversation (Premium/Pro)
- **Flashcard generation** — from weak topics post-exam

### Gamification
- Daily streak (resets if a day is missed)
- XP system (2 XP per correct + 20 for pass)
- Level (xp / 100 + 1)

### Stats / Analytics tab
- Per-category attempts, avg & best score, pass count
- Top 5 weak topics across all attempts
- Plan + weekly exam usage

### Admin Dashboard
- Protected by `is_admin` flag (auto-flagged via `ADMIN_EMAILS` env)
- Totals: users, attempts, questions
- Plan distribution
- Add question form (live insert with auto-generated question_id)
- Recent attempts feed
- Ban endpoint (`POST /api/admin/ban`)

### Other Screens
- Onboarding carousel (3 slides + Skip)
- Profile with plan badge + sign-out
- Paywall (Free/Premium/Pro cards)
- Flashcards deck (tap to flip)
- About / Legal Disclaimer screen

---

## API Surface
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/` | — | Health |
| POST | `/api/auth/email/signup` | — | Email signup |
| POST | `/api/auth/email/login` | — | Email login |
| POST | `/api/auth/google/session` | — | Exchange Emergent session_id |
| GET | `/api/auth/me` | ✅ | Get current user + limits |
| POST | `/api/auth/logout` | ✅ | Invalidate session |
| GET | `/api/exams/categories` | — | List 3 categories |
| GET | `/api/exams/{cat}/questions` | ✅ | Start exam (weekly-limited) |
| POST | `/api/exams/attempts` | ✅ | Submit & score |
| GET | `/api/exams/attempts/me` | ✅ | My history |
| POST | `/api/ai/explain` | ✅ | Per-question AI explanation |
| POST | `/api/ai/tutor` | ✅ Premium+ | AI tutor chat |
| POST | `/api/ai/flashcards` | ✅ Premium+ | Generate flashcards |
| GET | `/api/flashcards/me` | ✅ | My flashcards |
| GET | `/api/user/stats` | ✅ | Dashboard stats |
| POST | `/api/user/plan` | ✅ | Mock subscription change |
| GET | `/api/admin/analytics` | ✅ admin | Admin dashboard data |
| GET / POST / DELETE | `/api/admin/questions` | ✅ admin | Question CRUD |
| GET | `/api/admin/users` | ✅ admin | List users |
| POST | `/api/admin/ban` | ✅ admin | Ban / un-ban |

---

## Future Roadmap (not built)
- Real Apple/Microsoft sign-in (require native build)
- Apple/Google IAP for real subscriptions
- AdMob (require native build)
- More categories: White Card, Security, Forklift, Trade, Cyber, APS, Real Estate, Insurance
- Push notifications for daily reminders
- Leaderboards
- Voice tutor (Pro)

---

## Branding & Design
- Mascot: friendly kangaroo with graduation cap, holding tablet (provided as image asset).
- Palette: neon blue `#00D1FF`, neon green `#00FF9D`, orange `#FF8F00` (streaks), purple `#7B61FF` (premium).
- Style: Duolingo-inspired "chunky" cards with `borderBottomWidth: 4` and rounded `borderRadius: 16-20`.
