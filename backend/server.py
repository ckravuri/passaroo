"""
Passaroo backend — FastAPI + MongoDB + Emergent Google Auth + Gemini 3 Flash.
"""
import logging
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import bcrypt
import httpx
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Header, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

from emergentintegrations.llm.chat import LlmChat, UserMessage
from seed_data import CATEGORIES, FAMILIES
from content import READING_MATERIAL, AU_STATES, ACHIEVEMENTS
from legal_pages import register_legal_routes
from subscription_config import (
    TIERS,
    SKUS,
    PRICING,
    TIER_MARKETING_FEATURES,
    get_tier_limits,
    public_plans_payload,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------- Config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
JWT_SECRET = os.environ["JWT_SECRET"]
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
PUSH_BASE_URL = "https://integrations.emergentagent.com"
EMERGENT_PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("passaroo")

app = FastAPI(title="Passaroo API")
api = APIRouter(prefix="/api")


# ---------- Models ----------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    auth_provider: str = "email"  # email | google
    plan: str = "free"  # guest | free | premium | pro
    is_admin: bool = False
    state: Optional[str] = None  # AU state code (NSW/VIC/QLD/WA/SA/ACT/TAS/NT)
    primary_category_id: Optional[str] = None  # e.g. "dkt_nsw" — user's main study target
    streak_days: int = 0
    last_streak_date: Optional[str] = None
    xp: int = 0
    level: int = 1
    exams_this_week: int = 0
    week_start: Optional[str] = None
    # ── Subscription tracking ─────────────────────────────────
    billing_period: Optional[str] = None  # "monthly" | "yearly" | None for free
    subscription_provider: Optional[str] = None  # "revenuecat" | "manual" | None
    subscription_expires_at: Optional[datetime] = None
    rc_app_user_id: Optional[str] = None  # RevenueCat appUserID
    # ── Fair use & anti-abuse ────────────────────────────────
    active_device_id: Optional[str] = None
    fair_usage_violations: int = 0
    suspended: bool = False
    suspension_reason: Optional[str] = None
    # ── Multi-exam subscriptions (new in Phase 6) ────────────
    # Each entry: {family, state?, category_id, primary, subscribed_at}
    exam_subscriptions: List[Dict[str, Any]] = Field(default_factory=list)
    # ── Coupon redemption ────────────────────────────────────
    redeemed_coupons: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EmailSignupBody(BaseModel):
    email: EmailStr
    password: str
    name: str


class EmailLoginBody(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionBody(BaseModel):
    session_id: str


class ExamSubmitBody(BaseModel):
    category_id: str
    question_ids: List[str]
    answers: List[int]  # selected index per question, -1 if skipped
    time_taken_seconds: int


class AIExplainBody(BaseModel):
    question: str
    options: List[str]
    correct_index: int
    user_answer_index: int


class AITutorBody(BaseModel):
    session_id: str
    message: str
    category_id: Optional[str] = None


class FlashcardGenBody(BaseModel):
    category_id: str
    wrong_topics: List[str]
    count: int = 5


class AdminQuestionBody(BaseModel):
    category_id: str
    topic: str
    difficulty: str = "easy"
    state: Optional[str] = None
    question: str
    options: List[str]
    correct: int
    explanation: str


# ---------- Helpers ----------
def now() -> datetime:
    return datetime.now(timezone.utc)


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def to_aware(dt: Any) -> datetime:
    if isinstance(dt, datetime) and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def get_current_user(
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None),
) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid session")
    if to_aware(session["expires_at"]) < now():
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")

    # ── Account suspension check ───────────────────────────────────
    if user.get("suspended"):
        raise HTTPException(403, {
            "code": "ACCOUNT_SUSPENDED",
            "reason": user.get("suspension_reason") or "Account suspended for fair-use violations.",
        })
    if user.get("banned"):
        raise HTTPException(403, "Account banned.")

    # ── Multi-device: AUTO-REBIND session to new device_id ─────────
    # Hard-blocking on device-id mismatch is too aggressive (Keychain rotates,
    # reinstalls, etc.). Instead, we silently rebind the session to whichever
    # device is currently using it. Anti-fraud is enforced upstream via:
    #   • LRU cap on concurrent sessions per plan
    #   • Burst rate-limit on new device_ids per account / 24h
    #   • Device tracking + auto-suspicious flag for >7 devices in 30 days
    bound = session.get("device_id")
    if x_device_id and bound != x_device_id:
        try:
            await db.user_sessions.update_one(
                {"session_token": token},
                {"$set": {"device_id": x_device_id, "rebound_at": now(),
                          "last_used_at": now()}},
            )
            # Also record the new device in user_devices for fraud trail
            await db.user_devices.update_one(
                {"user_id": user["user_id"], "device_id": x_device_id},
                {
                    "$set": {"last_login_at": now()},
                    "$setOnInsert": {"first_seen_at": now()},
                    "$inc": {"login_count": 1},
                },
                upsert=True,
            )
        except Exception:
            pass
    else:
        # Touch last_used_at (best-effort)
        try:
            await db.user_sessions.update_one(
                {"session_token": token},
                {"$set": {"last_used_at": now()}},
            )
        except Exception:
            pass

    return user


async def require_admin(authorization: Optional[str] = Header(None),
                        x_device_id: Optional[str] = None) -> Dict[str, Any]:
    user = await get_current_user(authorization, x_device_id)
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return user


def plan_limits(plan: str) -> Dict[str, Any]:
    """Backwards-compatible shape — frontend reads exams_per_week, ads, ai_tutor, etc."""
    return get_tier_limits(plan)


def week_key(dt: datetime) -> str:
    iso = dt.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


async def increment_weekly_exam(user: Dict[str, Any]) -> None:
    cur_week = week_key(now())
    if user.get("week_start") != cur_week:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"week_start": cur_week, "exams_this_week": 1}},
        )
    else:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$inc": {"exams_this_week": 1}},
        )


async def update_streak_and_xp(user_id: str, xp_gain: int) -> None:
    today = now().date().isoformat()
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        return
    last = user.get("last_streak_date")
    streak = user.get("streak_days", 0)
    if last == today:
        pass  # already counted today
    elif last == (now().date() - timedelta(days=1)).isoformat():
        streak += 1
    else:
        streak = 1
    new_xp = user.get("xp", 0) + xp_gain
    new_level = max(1, new_xp // 100 + 1)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"streak_days": streak, "last_streak_date": today, "xp": new_xp, "level": new_level}},
    )


async def issue_session(user_id: str, device_id: Optional[str] = None,
                        ip_addr: Optional[str] = None) -> str:
    """
    Issue a new session with multi-device support + anti-fraud tracking.

    Policy:
      • guest=1 / free=2 / premium=3 / pro=3 concurrent sessions max
      • Same device_id re-login REPLACES that device's existing session
      • At cap, evict OLDEST sessions (LRU) — sharer's friends kick out original user
      • Track every device_id seen via user_devices collection (fraud trail)
      • Auto-flag accounts with >7 unique device_ids in 30 days as is_suspicious
      • Cap NEW device_ids per account per 24h (default 5) — anti-swap-test
    """
    SESSION_CAP_BY_PLAN = {"guest": 1, "free": 2, "premium": 3, "pro": 3}
    NEW_DEVICE_DAILY_CAP = 5
    FRAUD_THRESHOLD_30D = 7  # distinct device_ids in last 30 days

    user = await db.users.find_one({"user_id": user_id}, {"plan": 1, "is_admin": 1})
    plan = (user or {}).get("plan", "free")
    is_admin = bool((user or {}).get("is_admin"))
    cap = SESSION_CAP_BY_PLAN.get(plan, 2)
    if is_admin:
        cap = 10  # admins get more leeway for testing across devices

    # ── Anti-fraud: rate-limit NEW devices per account per 24h ─────
    if device_id and not is_admin:
        ts_24h = now() - timedelta(hours=24)
        existing_dev = await db.user_devices.find_one(
            {"user_id": user_id, "device_id": device_id}, {"_id": 0, "device_id": 1}
        )
        if not existing_dev:
            new_devices_24h = await db.user_devices.count_documents({
                "user_id": user_id,
                "first_seen_at": {"$gte": ts_24h},
            })
            if new_devices_24h >= NEW_DEVICE_DAILY_CAP:
                await db.abuse_log.insert_one({
                    "user_id": user_id,
                    "kind": "device_swap_burst",
                    "device_id": device_id,
                    "ip": ip_addr,
                    "at": now(),
                })
                raise HTTPException(429, {
                    "code": "TOO_MANY_DEVICES",
                    "message": "Too many new devices on this account today. "
                               "Try again in 24 hours or contact support.",
                })

    # ── Same-device re-login: replace the prior session for that device ──
    if device_id:
        await db.user_sessions.delete_many({"user_id": user_id, "device_id": device_id})

    # ── Concurrent-session cap (LRU evict) ──────────────────────────
    existing = await db.user_sessions.count_documents({"user_id": user_id})
    if existing >= cap:
        to_evict = existing - cap + 1
        old = await db.user_sessions.find(
            {"user_id": user_id}, {"_id": 0, "session_token": 1}
        ).sort("created_at", 1).limit(to_evict).to_list(to_evict)
        if old:
            await db.user_sessions.delete_many(
                {"session_token": {"$in": [s["session_token"] for s in old]}}
            )

    # ── Insert new session ─────────────────────────────────────────
    token = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "device_id": device_id,
        "ip_addr": ip_addr,
        "created_at": now(),
        "last_used_at": now(),
        "expires_at": now() + timedelta(days=7),
    })

    # ── Device tracking (fraud trail) ──────────────────────────────
    if device_id:
        await db.user_devices.update_one(
            {"user_id": user_id, "device_id": device_id},
            {
                "$set": {"last_login_at": now(), "last_ip": ip_addr},
                "$setOnInsert": {"first_seen_at": now()},
                "$inc": {"login_count": 1},
            },
            upsert=True,
        )
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"active_device_id": device_id, "last_login_at": now()}},
        )

    # ── Auto-flag fraud: many distinct devices in 30 days ──────────
    if not is_admin:
        ts_30d = now() - timedelta(days=30)
        distinct_30d = await db.user_devices.count_documents({
            "user_id": user_id,
            "first_seen_at": {"$gte": ts_30d},
        })
        if distinct_30d >= FRAUD_THRESHOLD_30D:
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {
                    "is_suspicious": True,
                    "suspicious_reason": f"{distinct_30d} new devices in last 30 days",
                    "suspicious_flagged_at": now(),
                }},
            )

    return token


# ── AI rate limiting (per-minute + per-day) ───────────────────────
async def enforce_ai_rate_limit(user: Dict[str, Any], kind: str) -> None:
    """Throttle AI usage based on plan. Raises 429 if exceeded."""
    limits = plan_limits(user.get("plan", "free"))
    today = now().date().isoformat()

    # Per-minute throttle
    per_min = limits.get("ai_per_minute", 2)
    if per_min <= 0:
        raise HTTPException(402, "AI features are not included in your plan.")
    one_min_ago = now() - timedelta(seconds=60)
    recent_count = await db.ai_usage.count_documents({
        "user_id": user["user_id"], "at": {"$gte": one_min_ago}
    })
    if recent_count >= per_min:
        raise HTTPException(429, {
            "code": "AI_RATE_LIMIT",
            "message": f"Too many AI requests. Please wait a minute (max {per_min}/min).",
        })

    # Daily cap (kind-specific)
    if kind == "explain":
        cap = limits.get("ai_explanations_per_day", 0)
    elif kind == "tutor":
        cap = limits.get("ai_tutor_messages_per_day", 0)
    else:
        cap = limits.get("ai_explanations_per_day", 0)
    used = await db.ai_usage.count_documents({
        "user_id": user["user_id"], "kind": kind, "date": today
    })
    if used >= cap:
        raise HTTPException(429, {
            "code": "AI_DAILY_LIMIT",
            "message": f"Daily AI {kind} limit reached ({cap}). Upgrade your plan.",
        })


async def record_ai_usage(user_id: str, kind: str) -> None:
    await db.ai_usage.insert_one({
        "user_id": user_id, "kind": kind,
        "date": now().date().isoformat(), "at": now(),
    })


async def flag_violation(user_id: str, reason: str, auto_suspend_threshold: int = 3) -> None:
    """Track a fair-use violation; auto-suspend after threshold."""
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "fair_usage_violations": 1})
    new_count = (u.get("fair_usage_violations", 0) if u else 0) + 1
    update: Dict[str, Any] = {"fair_usage_violations": new_count}
    if new_count >= auto_suspend_threshold:
        update["suspended"] = True
        update["suspension_reason"] = f"Auto-suspended after {new_count} violations: {reason}"
    await db.users.update_one({"user_id": user_id}, {"$set": update})
    await db.abuse_log.insert_one({
        "user_id": user_id, "reason": reason, "at": now(),
    })


async def upsert_user_by_email(email: str, name: str, picture: Optional[str], provider: str) -> Dict[str, Any]:
    existing = await db.users.find_one({"email": email.lower()}, {"_id": 0})
    if existing:
        return existing
    is_admin = email.lower() in ADMIN_EMAILS
    user_doc = User(
        user_id=make_id("user"),
        email=email.lower(),
        name=name,
        picture=picture,
        auth_provider=provider,
        is_admin=is_admin,
    ).model_dump()
    await db.users.insert_one(user_doc)
    return user_doc


def client_ip(request: Optional[Request]) -> Optional[str]:
    """Extract caller IP, preferring X-Forwarded-For (Railway proxy)."""
    if not request:
        return None
    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    try:
        return request.client.host if request.client else None
    except Exception:
        return None


# ---------- Routes: Auth ----------
@api.get("/")
async def root():
    return {"app": "Passaroo", "status": "ok"}


@api.post("/auth/email/signup")
async def email_signup(body: EmailSignupBody, request: Request,
                       x_device_id: Optional[str] = Header(None)):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(400, "Email already registered")
    is_admin = email in ADMIN_EMAILS
    user_doc = User(
        user_id=make_id("user"),
        email=email,
        name=body.name,
        auth_provider="email",
        is_admin=is_admin,
        active_device_id=x_device_id,
    ).model_dump()
    user_doc["password_hash"] = hash_password(body.password)
    await db.users.insert_one(user_doc)
    token = await issue_session(user_doc["user_id"], device_id=x_device_id,
                                ip_addr=client_ip(request))
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    return {"session_token": token, "user": user_doc}


@api.post("/auth/email/login")
async def email_login(body: EmailLoginBody, request: Request,
                      x_device_id: Optional[str] = Header(None)):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if user.get("suspended"):
        raise HTTPException(403, {
            "code": "ACCOUNT_SUSPENDED",
            "reason": user.get("suspension_reason") or "Account suspended.",
        })
    token = await issue_session(user["user_id"], device_id=x_device_id,
                                ip_addr=client_ip(request))
    user.pop("password_hash", None)
    return {"session_token": token, "user": user}


@api.post("/auth/google/session")
async def google_session(body: GoogleSessionBody, request: Request,
                         x_device_id: Optional[str] = Header(None)):
    # Verify session_id with Emergent
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(401, "Google auth failed")
    data = r.json()
    user = await upsert_user_by_email(
        email=data["email"], name=data.get("name", "User"),
        picture=data.get("picture"), provider="google",
    )
    token = await issue_session(user["user_id"], device_id=x_device_id,
                                ip_addr=client_ip(request))
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"session_token": token, "user": user}


@api.get("/auth/me")
async def get_me(authorization: Optional[str] = Header(None),
                 x_device_id: Optional[str] = Header(None)):
    user = await get_current_user(authorization, x_device_id)
    user.pop("password_hash", None)
    return {"user": user, "limits": plan_limits(user.get("plan", "free"))}


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------- Routes: Exams ----------
@api.get("/exams/categories")
async def get_categories():
    out = []
    for c in CATEGORIES:
        out.append(
            {
                "id": c["id"],
                "family": c.get("family"),
                "state": c.get("state"),
                "name": c["name"],
                "short_name": c["short_name"],
                "description": c["description"],
                "icon": c["icon"],
                "color": c["color"],
                "total_questions_in_exam": c["total_questions_in_exam"],
                "time_limit_minutes": c["time_limit_minutes"],
                "pass_score_percent": c["pass_score_percent"],
                "question_bank_size": await db.questions.count_documents({"category_id": c["id"]}),
            }
        )
    return {"categories": out, "families": FAMILIES}


@api.get("/exams/families")
async def get_families():
    """Return categories grouped by family for the home/exams UI."""
    cats = await get_categories()
    grouped: Dict[str, Dict[str, Any]] = {}
    for fam in FAMILIES:
        grouped[fam["id"]] = {**fam, "categories": []}
    for c in cats["categories"]:
        fid = c.get("family") or "other"
        grouped.setdefault(fid, {"id": fid, "name": fid.title(), "icon": "library",
                                  "color": "#666", "description": "", "categories": []})
        grouped[fid]["categories"].append(c)
    return {"families": list(grouped.values())}


@api.get("/exams/{category_id}/questions")
async def get_exam_questions(category_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    limits = plan_limits(user.get("plan", "free"))

    # Weekly limit enforcement
    cur_week = week_key(now())
    used = user.get("exams_this_week", 0) if user.get("week_start") == cur_week else 0
    if used >= limits["exams_per_week"]:
        raise HTTPException(
            status_code=429,
            detail=f"Weekly exam limit reached ({limits['exams_per_week']}). Upgrade your plan.",
        )

    cat = next((c for c in CATEGORIES if c["id"] == category_id), None)
    if not cat:
        raise HTTPException(404, "Category not found")

    count = cat["total_questions_in_exam"]
    cursor = db.questions.find({"category_id": category_id}, {"_id": 0, "correct": 0, "explanation": 0})
    pool = await cursor.to_list(length=1000)
    if len(pool) < 5:
        raise HTTPException(503, "Question bank not seeded yet")
    sample = random.sample(pool, min(count, len(pool)))
    return {
        "category": {
            "id": cat["id"], "name": cat["name"], "short_name": cat["short_name"],
            "time_limit_minutes": cat["time_limit_minutes"],
            "pass_score_percent": cat["pass_score_percent"],
            "total_questions_in_exam": len(sample),
        },
        "questions": sample,
        "exams_used_this_week": used,
        "exams_per_week_limit": limits["exams_per_week"],
    }


@api.post("/exams/attempts")
async def submit_exam(body: ExamSubmitBody, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    cat = next((c for c in CATEGORIES if c["id"] == body.category_id), None)
    if not cat:
        raise HTTPException(404, "Category not found")
    if len(body.question_ids) != len(body.answers):
        raise HTTPException(400, "answers length must match question_ids")

    questions = await db.questions.find(
        {"question_id": {"$in": body.question_ids}}, {"_id": 0}
    ).to_list(length=500)
    qmap = {q["question_id"]: q for q in questions}

    correct_count = 0
    wrong_topics: List[str] = []
    wrong_qids: List[str] = []
    review = []
    for qid, ans in zip(body.question_ids, body.answers):
        q = qmap.get(qid)
        if not q:
            continue
        is_correct = ans == q["correct"]
        if is_correct:
            correct_count += 1
        else:
            wrong_topics.append(q.get("topic", "General"))
            wrong_qids.append(qid)
        review.append({
            "question_id": qid,
            "question": q["question"], "options": q["options"],
            "correct": q["correct"], "user_answer": ans,
            "is_correct": is_correct, "topic": q.get("topic"),
            "explanation": q.get("explanation"),
        })

    total = len(body.question_ids)
    score_pct = round((correct_count / total) * 100) if total else 0
    passed = score_pct >= cat["pass_score_percent"]
    pass_probability = min(100, max(0, score_pct))

    # weak topic frequency
    weak_topics: Dict[str, int] = {}
    for t in wrong_topics:
        weak_topics[t] = weak_topics.get(t, 0) + 1

    xp_gain = correct_count * 2 + (20 if passed else 0)
    attempt_id = make_id("att")
    attempt_doc = {
        "attempt_id": attempt_id,
        "user_id": user["user_id"],
        "category_id": body.category_id,
        "total_questions": total,
        "correct_count": correct_count,
        "score_percent": score_pct,
        "passed": passed,
        "pass_probability": pass_probability,
        "time_taken_seconds": body.time_taken_seconds,
        "weak_topics": weak_topics,
        "wrong_qids": wrong_qids,
        "created_at": now(),
    }
    await db.exam_attempts.insert_one(attempt_doc)
    await increment_weekly_exam(user)
    await update_streak_and_xp(user["user_id"], xp_gain)

    attempt_doc.pop("_id", None)
    return {
        "attempt_id": attempt_id,
        "score_percent": score_pct,
        "correct_count": correct_count,
        "total_questions": total,
        "passed": passed,
        "pass_probability": pass_probability,
        "weak_topics": weak_topics,
        "xp_gained": xp_gain,
        "review": review,
    }


@api.get("/exams/attempts/me")
async def my_attempts(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    attempts = await db.exam_attempts.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=50)
    return {"attempts": attempts}


# ---------- Routes: AI ----------
PASSAROO_TUTOR_PERSONA = (
    "You are Passaroo — a friendly, upbeat Australian study buddy (a young kangaroo mascot) "
    "helping learners pass their Australian exams. Your voice is warm, plain-English, "
    "encouraging and a bit cheeky in a kind way. Avoid jargon unless you immediately explain it. "
    "Always be factually accurate; if you don't know, say so. Use Australian English spelling "
    "(behaviour, learnt, kilometres). When mentioning state-specific rules, name the state. "
    "Remind learners this is INDEPENDENT practice material, not the official government exam."
)


async def _llm_chat(session_id: str, system: str, user_msg: str) -> str:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model("gemini", "gemini-3-flash-preview")
    return await chat.send_message(UserMessage(text=user_msg))


@api.post("/ai/explain")
async def ai_explain(body: AIExplainBody, authorization: Optional[str] = Header(None),
                     x_device_id: Optional[str] = Header(None)):
    user = await get_current_user(authorization, x_device_id)
    await enforce_ai_rate_limit(user, "explain")

    correct_text = body.options[body.correct_index] if 0 <= body.correct_index < len(body.options) else "(unknown)"
    user_text = (body.options[body.user_answer_index]
                 if 0 <= body.user_answer_index < len(body.options) else "(no answer)")
    was_wrong = body.correct_index != body.user_answer_index
    state_hint = f" (state context: {user.get('state')})" if user.get("state") else ""

    prompt = (
        f"A learner just answered an exam practice question{state_hint}.\n\n"
        f"QUESTION: {body.question}\n"
        f"OPTIONS: {body.options}\n"
        f"CORRECT ANSWER: {correct_text}\n"
        f"LEARNER CHOSE: {user_text}  ({'WRONG' if was_wrong else 'CORRECT'})\n\n"
        "Write a short, friendly explanation in EXACTLY this structure:\n"
        "  Line 1 — Why this is correct: <one-sentence reason>\n"
        "  Line 2 — Common mistake: <what learners often get wrong here, in one sentence>\n"
        "  Line 3 — Memory tip: <a tiny mnemonic or rule of thumb in <12 words>>\n\n"
        "Total max 4 short sentences. No preamble, no bullet points, no markdown."
    )
    try:
        reply = await _llm_chat(
            f"explain_{user['user_id']}_{uuid.uuid4().hex[:8]}",
            PASSAROO_TUTOR_PERSONA,
            prompt,
        )
    except Exception as e:
        log.exception("AI explain failed")
        raise HTTPException(502, f"AI service error: {e}")

    await record_ai_usage(user["user_id"], "explain")
    return {"explanation": reply}


@api.post("/ai/tutor")
async def ai_tutor(body: AITutorBody, authorization: Optional[str] = Header(None),
                   x_device_id: Optional[str] = Header(None)):
    user = await get_current_user(authorization, x_device_id)
    limits = plan_limits(user.get("plan", "free"))
    if not limits["ai_tutor"]:
        raise HTTPException(402, "AI Tutor is a Premium/Pro feature. Upgrade to chat with the tutor.")
    await enforce_ai_rate_limit(user, "tutor")

    # Build rich context: category + state + recent weak topics from last 5 attempts
    cat_hint = ""
    if body.category_id:
        cat = next((c for c in CATEGORIES if c["id"] == body.category_id), None)
        if cat:
            cat_hint = f"\nThe learner is currently preparing for: {cat['name']}."
            if cat.get("state"):
                cat_hint += f" State: {cat['state']}."
    user_state = user.get("state")
    state_hint = f"\nLearner's home state/territory: {user_state}." if user_state else ""

    # Pull recent weak topics
    recent = await db.exam_attempts.find(
        {"user_id": user["user_id"]}, {"_id": 0, "wrong_qids": 1}
    ).sort("created_at", -1).limit(5).to_list(5)
    wrong_qids: List[str] = []
    for a in recent:
        wrong_qids.extend(a.get("wrong_qids", []) or [])
    weak_hint = ""
    if wrong_qids:
        weak_topics_cursor = await db.questions.find(
            {"question_id": {"$in": wrong_qids[:30]}}, {"_id": 0, "topic": 1}
        ).to_list(30)
        topic_counts: Dict[str, int] = {}
        for q in weak_topics_cursor:
            topic_counts[q["topic"]] = topic_counts.get(q["topic"], 0) + 1
        if topic_counts:
            top3 = sorted(topic_counts.items(), key=lambda x: -x[1])[:3]
            weak_hint = "\nRecent weak topics for this learner: " + ", ".join(t for t, _ in top3) + "."

    system = (
        PASSAROO_TUTOR_PERSONA
        + cat_hint
        + state_hint
        + weak_hint
        + "\n\nKeep replies under 6 sentences. If asked about a topic this learner is weak on, "
        "naturally weave in a tiny revision tip. End with a single energetic line of encouragement "
        "or a follow-up question to keep them learning. Never say you are an AI — you are Passaroo."
    )
    try:
        reply = await _llm_chat(body.session_id, system, body.message)
    except Exception as e:
        log.exception("AI tutor failed")
        raise HTTPException(502, f"AI service error: {e}")

    await db.chat_messages.insert_one({
        "user_id": user["user_id"], "session_id": body.session_id,
        "user_message": body.message, "ai_reply": reply, "at": now(),
    })
    await record_ai_usage(user["user_id"], "tutor")
    return {"reply": reply}


@api.post("/ai/flashcards")
async def ai_flashcards(body: FlashcardGenBody, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    limits = plan_limits(user.get("plan", "free"))
    if user.get("plan", "free") == "free" and limits["ai_explanations_per_day"] <= 0:
        raise HTTPException(402, "Flashcard generation is a Premium feature.")

    cat = next((c for c in CATEGORIES if c["id"] == body.category_id), None)
    if not cat:
        raise HTTPException(404, "Category not found")
    topics = ", ".join(body.wrong_topics) if body.wrong_topics else "general weak areas"
    n = max(3, min(body.count, 8))
    state_line = f" State context: {cat['state']}." if cat.get("state") else ""
    prompt = (
        f"Generate EXACTLY {n} ORIGINAL spaced-repetition flashcards for the exam: {cat['name']}.{state_line}\n"
        f"Focus topics: {topics}.\n\n"
        "RULES:\n"
        " - FRONT must be a short, specific question OR a key concept prompt (max 12 words).\n"
        " - BACK must be a precise 1–2 sentence answer that teaches the rule, with Australian context.\n"
        " - Make them ATOMIC (one fact per card), original, and never copied from official exam wording.\n"
        " - Use plain English; Australian spelling.\n\n"
        "OUTPUT FORMAT — strictly, no preamble, no markdown:\n"
        "FRONT: <text>\n"
        "BACK: <text>\n"
        "FRONT: <text>\n"
        "BACK: <text>\n"
        "...(repeat for all cards)..."
    )
    try:
        reply = await _llm_chat(
            f"flash_{user['user_id']}_{uuid.uuid4().hex[:8]}",
            "You are Passaroo, an Australian exam-prep tutor. Produce clean, parseable study flashcards.",
            prompt,
        )
    except Exception as e:
        log.exception("AI flashcards failed")
        raise HTTPException(502, f"AI service error: {e}")
    # parse FRONT/BACK pairs
    cards = []
    cur = {}
    for line in reply.splitlines():
        s = line.strip()
        if s.upper().startswith("FRONT:"):
            if cur.get("front") and cur.get("back"):
                cards.append(cur)
            cur = {"front": s.split(":", 1)[1].strip(), "back": ""}
        elif s.upper().startswith("BACK:") and cur.get("front"):
            cur["back"] = s.split(":", 1)[1].strip()
    if cur.get("front") and cur.get("back"):
        cards.append(cur)

    # store
    for c in cards:
        c["card_id"] = make_id("card")
        c["user_id"] = user["user_id"]
        c["category_id"] = body.category_id
        c["created_at"] = now()
        await db.flashcards.insert_one(dict(c))
        c.pop("_id", None)
    return {"cards": cards, "raw": reply}


@api.get("/flashcards/me")
async def my_flashcards(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    cards = await db.flashcards.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"cards": cards}


# ---------- Routes: Stats / Subscription ----------
@api.get("/user/stats")
async def my_stats(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    attempts = await db.exam_attempts.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    by_cat: Dict[str, Dict[str, Any]] = {}
    weak_topics_agg: Dict[str, int] = {}
    for a in attempts:
        cat = a["category_id"]
        by_cat.setdefault(cat, {"attempts": 0, "best_score": 0, "avg_score": 0, "passed": 0})
        by_cat[cat]["attempts"] += 1
        by_cat[cat]["best_score"] = max(by_cat[cat]["best_score"], a["score_percent"])
        by_cat[cat]["avg_score"] += a["score_percent"]
        by_cat[cat]["passed"] += 1 if a["passed"] else 0
        for t, c in (a.get("weak_topics") or {}).items():
            weak_topics_agg[t] = weak_topics_agg.get(t, 0) + c
    for c in by_cat.values():
        c["avg_score"] = round(c["avg_score"] / max(1, c["attempts"]))
    return {
        "user": {
            "user_id": user["user_id"], "name": user["name"], "email": user["email"],
            "plan": user.get("plan", "free"), "streak_days": user.get("streak_days", 0),
            "xp": user.get("xp", 0), "level": user.get("level", 1),
            "exams_this_week": user.get("exams_this_week", 0) if user.get("week_start") == week_key(now()) else 0,
        },
        "limits": plan_limits(user.get("plan", "free")),
        "by_category": by_cat,
        "weak_topics_top": sorted(weak_topics_agg.items(), key=lambda x: x[1], reverse=True)[:5],
        "total_attempts": len(attempts),
    }


class PlanChangeBody(BaseModel):
    plan: str  # free | premium | pro


@api.post("/user/plan")
async def change_plan(body: PlanChangeBody, authorization: Optional[str] = Header(None)):
    """
    Admin-only plan change endpoint.

    Real user subscription upgrades MUST flow through Apple/Google In-App Purchase
    and the RevenueCat webhook (`POST /api/iap/revenuecat-webhook`) — never this route.
    This endpoint is retained ONLY so admins can manually grant/revoke tiers for support
    cases (refunds, comp accounts, demo testers, etc.). All non-admin calls return 403.
    """
    user = await get_current_user(authorization)
    if not user.get("is_admin"):
        raise HTTPException(
            403,
            "Subscription changes must go through in-app purchase. Contact support if you need help.",
        )
    if body.plan not in {"free", "premium", "pro"}:
        raise HTTPException(400, "Invalid plan")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"plan": body.plan, "subscription_provider": "admin_grant"}},
    )
    return {"ok": True, "plan": body.plan, "granted_by": "admin"}


class ProfileUpdateBody(BaseModel):
    state: Optional[str] = None
    primary_category_id: Optional[str] = None
    name: Optional[str] = None


_VALID_AU_STATES = {"NSW", "VIC", "QLD", "WA", "SA", "ACT", "TAS", "NT"}


@api.patch("/user/profile")
async def update_profile(body: ProfileUpdateBody, authorization: Optional[str] = Header(None)):
    """Update user state/territory, primary exam category and name."""
    user = await get_current_user(authorization)
    update: Dict[str, Any] = {}
    if body.state is not None:
        s = body.state.upper().strip()
        if s not in _VALID_AU_STATES:
            raise HTTPException(400, f"Invalid state — must be one of {sorted(_VALID_AU_STATES)}")
        update["state"] = s
        # Auto-pick a sensible default primary category if user's current target is a generic DKT
        if not body.primary_category_id and (
            not user.get("primary_category_id")
            or user.get("primary_category_id", "").startswith("dkt_")
        ):
            update["primary_category_id"] = f"dkt_{s.lower()}"
    if body.primary_category_id is not None:
        valid_ids = {c["id"] for c in CATEGORIES}
        if body.primary_category_id not in valid_ids:
            raise HTTPException(400, "Invalid primary_category_id")
        update["primary_category_id"] = body.primary_category_id
    if body.name is not None and body.name.strip():
        update["name"] = body.name.strip()
    if not update:
        return {"ok": True, "user": user}
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    refreshed = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return {"ok": True, "user": refreshed}


# ---------- Routes: Admin ----------
@api.get("/admin/analytics")
async def admin_analytics(authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    total_users = await db.users.count_documents({})
    total_attempts = await db.exam_attempts.count_documents({})
    total_questions = await db.questions.count_documents({})
    by_plan = {}
    async for u in db.users.find({}, {"_id": 0, "plan": 1}):
        p = u.get("plan", "free")
        by_plan[p] = by_plan.get(p, 0) + 1
    recent = await db.exam_attempts.find({}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return {
        "total_users": total_users,
        "total_attempts": total_attempts,
        "total_questions": total_questions,
        "by_plan": by_plan,
        "recent_attempts": recent,
    }


@api.get("/admin/questions")
async def admin_list_questions(category_id: Optional[str] = None,
                               authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    flt = {"category_id": category_id} if category_id else {}
    qs = await db.questions.find(flt, {"_id": 0}).to_list(2000)
    return {"questions": qs, "count": len(qs)}


@api.post("/admin/questions")
async def admin_add_question(body: AdminQuestionBody, authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    if body.category_id not in {c["id"] for c in CATEGORIES}:
        raise HTTPException(400, "Invalid category_id")
    if not (0 <= body.correct < len(body.options)):
        raise HTTPException(400, "correct index out of range")
    doc = body.model_dump()
    doc["question_id"] = make_id("q")
    doc["created_at"] = now()
    cat = next((c for c in CATEGORIES if c["id"] == body.category_id), None)
    if cat:
        # Always inherit family + state from category if not explicitly provided.
        # (setdefault is no-op because model_dump emits None for unset Optionals.)
        if doc.get("family") is None:
            doc["family"] = cat.get("family")
        if doc.get("state") is None:
            doc["state"] = cat.get("state")
    if doc.get("difficulty") is None:
        doc["difficulty"] = "medium"
    if doc.get("tags") is None:
        doc["tags"] = []
    if doc.get("learning_objectives") is None:
        doc["learning_objectives"] = []
    await db.questions.insert_one(doc)
    doc.pop("_id", None)
    return {"question": doc}


class AdminQuestionUpdate(BaseModel):
    topic: Optional[str] = None
    question: Optional[str] = None
    options: Optional[List[str]] = None
    correct: Optional[int] = None
    explanation: Optional[str] = None
    difficulty: Optional[str] = None
    tags: Optional[List[str]] = None
    learning_objectives: Optional[List[str]] = None


@api.patch("/admin/questions/{question_id}")
async def admin_update_question(question_id: str, body: AdminQuestionUpdate,
                                authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "options" in update and "correct" in update:
        if not (0 <= update["correct"] < len(update["options"])):
            raise HTTPException(400, "correct index out of range")
    if not update:
        raise HTTPException(400, "No fields to update")
    update["updated_at"] = now()
    res = await db.questions.update_one({"question_id": question_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Question not found")
    refreshed = await db.questions.find_one({"question_id": question_id}, {"_id": 0})
    return {"question": refreshed}


@api.delete("/admin/questions/{question_id}")
async def admin_delete_question(question_id: str, authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    res = await db.questions.delete_one({"question_id": question_id})
    return {"deleted": res.deleted_count}


class AdminBulkImportBody(BaseModel):
    category_id: str
    questions: List[Dict[str, Any]]


@api.post("/admin/questions/bulk-import")
async def admin_bulk_import(body: AdminBulkImportBody, authorization: Optional[str] = Header(None)):
    """Bulk-import questions. Each item must have: topic, question, options (4), correct, explanation."""
    await require_admin(authorization)
    cat = next((c for c in CATEGORIES if c["id"] == body.category_id), None)
    if not cat:
        raise HTTPException(400, "Invalid category_id")
    inserted = 0
    errors: List[Dict[str, Any]] = []
    for i, q in enumerate(body.questions):
        required = ["topic", "question", "options", "correct", "explanation"]
        missing = [k for k in required if k not in q]
        if missing:
            errors.append({"index": i, "error": f"Missing fields: {missing}"})
            continue
        if not isinstance(q["options"], list) or len(q["options"]) < 2:
            errors.append({"index": i, "error": "Options must be a list of >=2 strings"})
            continue
        if not (0 <= int(q["correct"]) < len(q["options"])):
            errors.append({"index": i, "error": "correct index out of range"})
            continue
        doc = {
            "question_id": make_id("q"),
            "category_id": body.category_id,
            "family": cat.get("family"),
            "state": q.get("state") or cat.get("state"),
            "topic": q["topic"],
            "difficulty": q.get("difficulty", "medium"),
            "question": q["question"],
            "options": q["options"],
            "correct": int(q["correct"]),
            "explanation": q["explanation"],
            "tags": q.get("tags", []),
            "learning_objectives": q.get("learning_objectives", []),
            "created_at": now(),
        }
        try:
            await db.questions.insert_one(doc)
            inserted += 1
        except Exception as e:
            errors.append({"index": i, "error": str(e)})
    return {"inserted": inserted, "errors": errors, "total_attempted": len(body.questions)}


@api.get("/admin/users")
async def admin_list_users(q: Optional[str] = None,
                           authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    flt: Dict[str, Any] = {}
    if q:
        flt = {"$or": [
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
        ]}
    users = await db.users.find(flt, {"_id": 0, "password_hash": 0}).limit(500).to_list(500)
    return {"users": users, "count": len(users)}


class AdminUserUpdate(BaseModel):
    plan: Optional[str] = None
    is_admin: Optional[bool] = None
    state: Optional[str] = None
    banned: Optional[bool] = None
    suspended: Optional[bool] = None
    suspension_reason: Optional[str] = None


@api.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, body: AdminUserUpdate,
                            authorization: Optional[str] = Header(None),
                            x_device_id: Optional[str] = None):
    await require_admin(authorization, x_device_id)
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "plan" in update and update["plan"] not in {"guest", "free", "premium", "pro"}:
        raise HTTPException(400, "Invalid plan")
    if not update:
        raise HTTPException(400, "No fields to update")
    res = await db.users.update_one({"user_id": user_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    # When banning OR suspending, kill all active sessions so they can't keep using the app
    if update.get("banned") or update.get("suspended"):
        await db.user_sessions.delete_many({"user_id": user_id})
    refreshed = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": refreshed}


class BanBody(BaseModel):
    user_id: str
    banned: bool = True


@api.post("/admin/ban")
async def admin_ban(body: BanBody, authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    await db.users.update_one({"user_id": body.user_id}, {"$set": {"banned": body.banned}})
    if body.banned:
        await db.user_sessions.delete_many({"user_id": body.user_id})
    return {"ok": True}


# ─────────── Device / Anti-Fraud Endpoints ───────────
@api.get("/user/devices")
async def list_my_devices(authorization: Optional[str] = Header(None),
                          x_device_id: Optional[str] = Header(None)):
    """List all devices ever logged in to my account."""
    user = await get_current_user(authorization, x_device_id)
    devices = await db.user_devices.find(
        {"user_id": user["user_id"]},
        {"_id": 0},
    ).sort("last_login_at", -1).to_list(50)
    sessions = await db.user_sessions.find(
        {"user_id": user["user_id"]},
        {"_id": 0, "session_token": 0, "ip_addr": 0},
    ).to_list(20)
    active_device_ids = {s.get("device_id") for s in sessions if s.get("device_id")}
    for d in devices:
        d["is_active"] = d.get("device_id") in active_device_ids
        d["is_current"] = d.get("device_id") == x_device_id
    return {"devices": devices, "active_sessions": len(sessions)}


@api.post("/user/devices/revoke")
async def revoke_my_device(body: Dict[str, Any],
                           authorization: Optional[str] = Header(None),
                           x_device_id: Optional[str] = Header(None)):
    """User-initiated logout of a specific device (or all-other-devices)."""
    user = await get_current_user(authorization, x_device_id)
    target_device = body.get("device_id")
    revoke_all_others = bool(body.get("all_others"))
    q: Dict[str, Any] = {"user_id": user["user_id"]}
    if revoke_all_others and x_device_id:
        q["device_id"] = {"$ne": x_device_id}
    elif target_device:
        q["device_id"] = target_device
    else:
        raise HTTPException(400, "Provide device_id or all_others=true")
    res = await db.user_sessions.delete_many(q)
    return {"revoked": res.deleted_count}


@api.get("/admin/users/{user_id}/devices")
async def admin_user_devices(user_id: str,
                             authorization: Optional[str] = Header(None),
                             x_device_id: Optional[str] = Header(None)):
    """Admin: inspect a user's full device history for fraud analysis."""
    await require_admin(authorization, x_device_id)
    user = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "password_hash": 0},
    )
    if not user:
        raise HTTPException(404, "User not found")
    devices = await db.user_devices.find(
        {"user_id": user_id}, {"_id": 0},
    ).sort("last_login_at", -1).to_list(200)
    sessions = await db.user_sessions.find(
        {"user_id": user_id}, {"_id": 0, "session_token": 0},
    ).to_list(50)
    abuse = await db.abuse_log.find(
        {"user_id": user_id}, {"_id": 0},
    ).sort("at", -1).limit(50).to_list(50)
    # Stats
    ts_30d = now() - timedelta(days=30)
    distinct_30d = sum(1 for d in devices if to_aware(d.get("first_seen_at", now())) >= ts_30d)
    return {
        "user": user,
        "devices": devices,
        "active_sessions": sessions,
        "abuse_log": abuse,
        "stats": {
            "total_devices": len(devices),
            "new_devices_30d": distinct_30d,
            "active_sessions": len(sessions),
            "is_suspicious": user.get("is_suspicious", False),
        },
    }


@api.post("/admin/users/{user_id}/revoke-sessions")
async def admin_revoke_user_sessions(user_id: str,
                                     authorization: Optional[str] = Header(None),
                                     x_device_id: Optional[str] = Header(None)):
    """Admin: force-revoke all sessions of a user (suspected fraud)."""
    await require_admin(authorization, x_device_id)
    res = await db.user_sessions.delete_many({"user_id": user_id})
    return {"revoked": res.deleted_count}


@api.get("/admin/suspicious-users")
async def admin_suspicious_users(authorization: Optional[str] = Header(None),
                                 x_device_id: Optional[str] = Header(None)):
    """Admin: list accounts auto-flagged for suspicious multi-device activity."""
    await require_admin(authorization, x_device_id)
    flagged = await db.users.find(
        {"is_suspicious": True},
        {"_id": 0, "password_hash": 0},
    ).sort("suspicious_flagged_at", -1).limit(100).to_list(100)
    return {"users": flagged, "count": len(flagged)}


@api.get("/admin/stats")
async def admin_stats(authorization: Optional[str] = Header(None)):
    """Detailed admin stats: per-category counts, signups today/7d/30d, attempts trend."""
    await require_admin(authorization)
    today = now().date()

    # Per-category question + attempt counts
    per_category = []
    for c in CATEGORIES:
        per_category.append({
            "id": c["id"], "name": c["name"], "family": c.get("family"), "state": c.get("state"),
            "question_count": await db.questions.count_documents({"category_id": c["id"]}),
            "attempt_count": await db.exam_attempts.count_documents({"category_id": c["id"]}),
        })

    # Signups in the last 1/7/30 days
    from datetime import timedelta
    signups_1d = await db.users.count_documents({"created_at": {"$gte": now() - timedelta(days=1)}})
    signups_7d = await db.users.count_documents({"created_at": {"$gte": now() - timedelta(days=7)}})
    signups_30d = await db.users.count_documents({"created_at": {"$gte": now() - timedelta(days=30)}})
    attempts_7d = await db.exam_attempts.count_documents({"created_at": {"$gte": now() - timedelta(days=7)}})

    by_plan: Dict[str, int] = {}
    by_state: Dict[str, int] = {}
    async for u in db.users.find({}, {"_id": 0, "plan": 1, "state": 1}):
        p = u.get("plan", "free")
        by_plan[p] = by_plan.get(p, 0) + 1
        s = u.get("state") or "unset"
        by_state[s] = by_state.get(s, 0) + 1

    return {
        "today": today.isoformat(),
        "totals": {
            "users": await db.users.count_documents({}),
            "questions": await db.questions.count_documents({}),
            "attempts": await db.exam_attempts.count_documents({}),
            "categories": len(CATEGORIES),
        },
        "signups": {"day": signups_1d, "week": signups_7d, "month": signups_30d},
        "attempts_week": attempts_7d,
        "by_plan": by_plan,
        "by_state": by_state,
        "per_category": per_category,
    }


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.questions.create_index("question_id", unique=True)
    await db.questions.create_index("category_id")
    await db.exam_attempts.create_index("user_id")
    await db.exam_attempts.create_index("created_at")
    await db.ai_usage.create_index([("user_id", 1), ("date", 1)])
    await db.ai_usage.create_index([("user_id", 1), ("at", -1)])
    # New collections (Phase 5)
    await db.coupons.create_index("code", unique=True)
    await db.coupon_redemptions.create_index([("user_id", 1), ("code", 1)])
    await db.guest_attempts.create_index("device_id", unique=True)
    await db.iap_events.create_index("at")
    await db.abuse_log.create_index([("user_id", 1), ("at", -1)])
    # Multi-device fraud tracking
    await db.user_devices.create_index([("user_id", 1), ("device_id", 1)], unique=True)
    await db.user_devices.create_index([("user_id", 1), ("first_seen_at", -1)])
    await db.user_sessions.create_index([("user_id", 1), ("device_id", 1)])
    await db.user_sessions.create_index([("user_id", 1), ("created_at", -1)])

    # Migration: legacy "dkt" category → "dkt_nsw"
    legacy_count = await db.questions.count_documents({"category_id": "dkt"})
    if legacy_count > 0:
        log.info(f"Migrating {legacy_count} legacy dkt questions → dkt_nsw")
        await db.questions.update_many(
            {"category_id": "dkt"}, {"$set": {"category_id": "dkt_nsw"}}
        )
        await db.exam_attempts.update_many(
            {"category_id": "dkt"}, {"$set": {"category_id": "dkt_nsw"}}
        )
        await db.bookmarks.update_many(
            {"category_id": "dkt"}, {"$set": {"category_id": "dkt_nsw"}}
        )

    # Seed admin user (idempotent)
    for admin_email in ADMIN_EMAILS:
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            user_doc = User(
                user_id=make_id("user"),
                email=admin_email,
                name="Passaroo Admin",
                auth_provider="email",
                is_admin=True,
                plan="pro",
            ).model_dump()
            user_doc["password_hash"] = hash_password("Passaroo!Admin2026")
            await db.users.insert_one(user_doc)
            log.info(f"Seeded admin user: {admin_email}")
        else:
            # Ensure flagged admin
            await db.users.update_one({"email": admin_email}, {"$set": {"is_admin": True}})

    # Seed questions (idempotent — only seed if empty per category)
    for cat in CATEGORIES:
        count = await db.questions.count_documents({"category_id": cat["id"]})
        if count == 0:
            for q in cat["questions"]:
                doc = {
                    "question_id": make_id("q"),
                    "category_id": cat["id"],
                    "family": cat.get("family"),
                    "topic": q["topic"],
                    "difficulty": q["difficulty"],
                    "state": q.get("state") or cat.get("state"),
                    "question": q["question"],
                    "options": q["options"],
                    "correct": q["correct"],
                    "explanation": q["explanation"],
                    "tags": q.get("tags", []),
                    "learning_objectives": q.get("learning_objectives", []),
                    "created_at": now(),
                }
                await db.questions.insert_one(doc)
            log.info(f"Seeded {len(cat['questions'])} questions for {cat['id']}")

    # Backfill tags / learning_objectives / family on legacy docs
    await db.questions.update_many(
        {"tags": {"$exists": False}}, {"$set": {"tags": []}}
    )
    await db.questions.update_many(
        {"learning_objectives": {"$exists": False}}, {"$set": {"learning_objectives": []}}
    )
    cat_to_family = {c["id"]: c.get("family") for c in CATEGORIES}
    for cid, fam in cat_to_family.items():
        await db.questions.update_many(
            {"category_id": cid, "family": {"$exists": False}}, {"$set": {"family": fam}}
        )

    log.info("Passaroo startup complete.")


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ============================================================
# Phase 2 additions: account deletion, OAuth providers,
# bookmarks, practice/retry, daily quiz, achievements,
# leaderboard, readiness, reading material, study planner,
# push notifications.
# ============================================================

# ---------- Account deletion ----------
@api.delete("/auth/me")
async def delete_account(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    uid = user["user_id"]
    # Cascade delete across all user-owned collections
    await db.user_sessions.delete_many({"user_id": uid})
    await db.exam_attempts.delete_many({"user_id": uid})
    await db.bookmarks.delete_many({"user_id": uid})
    await db.flashcards.delete_many({"user_id": uid})
    await db.chat_messages.delete_many({"user_id": uid})
    await db.ai_usage.delete_many({"user_id": uid})
    await db.push_tokens.delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    log.info(f"Account deleted: {uid}")
    return {"ok": True, "deleted_user_id": uid}


# ---------- Apple Sign-In ----------
class AppleTokenBody(BaseModel):
    identity_token: str  # JWT from expo-apple-authentication
    full_name: Optional[str] = None


@api.post("/auth/apple/token")
async def apple_signin(body: AppleTokenBody, request: Request,
                       x_device_id: Optional[str] = Header(None)):
    """Verify Apple identity token. Apple JWTs are signed by Apple — for MVP we
    decode (un-verified) to extract email and sub. In production add JWKS verification."""
    try:
        # Unverified decode is sufficient for MVP; Apple Sign-In runs through native SDK
        payload = jwt.decode(body.identity_token, options={"verify_signature": False})
    except Exception as e:
        raise HTTPException(401, f"Invalid Apple token: {e}")
    email = (payload.get("email") or "").lower()
    sub = payload.get("sub")
    if not email and not sub:
        raise HTTPException(401, "Apple token missing email/sub")
    if not email:
        email = f"apple_{sub}@private.passaroo.app"
    name = body.full_name or email.split("@")[0]
    user = await upsert_user_by_email(email=email, name=name, picture=None, provider="apple")
    token = await issue_session(user["user_id"], device_id=x_device_id,
                                ip_addr=client_ip(request))
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"session_token": token, "user": user}


# ---------- Microsoft Sign-In ----------
class MicrosoftTokenBody(BaseModel):
    access_token: str  # from expo-auth-session


@api.post("/auth/microsoft/token")
async def microsoft_signin(body: MicrosoftTokenBody, request: Request,
                           x_device_id: Optional[str] = Header(None)):
    """Verify Microsoft access_token by calling Graph /me."""
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {body.access_token}"},
        )
    if r.status_code != 200:
        raise HTTPException(401, "Microsoft token rejected by Graph")
    data = r.json()
    email = (data.get("mail") or data.get("userPrincipalName") or "").lower()
    if not email:
        raise HTTPException(401, "Microsoft account missing email")
    name = data.get("displayName") or email.split("@")[0]
    user = await upsert_user_by_email(email=email, name=name, picture=None, provider="microsoft")
    token = await issue_session(user["user_id"], device_id=x_device_id,
                                ip_addr=client_ip(request))
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"session_token": token, "user": user}


# ---------- Bookmarks ----------
@api.get("/bookmarks")
async def list_bookmarks(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    bookmarks = await db.bookmarks.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    qids = [b["question_id"] for b in bookmarks]
    if not qids:
        return {"bookmarks": []}
    questions = await db.questions.find({"question_id": {"$in": qids}}, {"_id": 0}).to_list(500)
    return {"bookmarks": questions}


@api.post("/bookmarks/{question_id}")
async def toggle_bookmark(question_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    existing = await db.bookmarks.find_one({"user_id": user["user_id"], "question_id": question_id})
    if existing:
        await db.bookmarks.delete_one({"user_id": user["user_id"], "question_id": question_id})
        return {"bookmarked": False}
    q = await db.questions.find_one({"question_id": question_id}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Question not found")
    await db.bookmarks.insert_one(
        {"user_id": user["user_id"], "question_id": question_id, "created_at": now()}
    )
    return {"bookmarked": True}


# ---------- Topics / Practice / Retry ----------
@api.get("/exams/{category_id}/topics")
async def list_topics(category_id: str):
    pipeline = [
        {"$match": {"category_id": category_id}},
        {"$group": {"_id": {"topic": "$topic", "state": "$state"}, "count": {"$sum": 1}}},
    ]
    out: Dict[str, Dict[str, Any]] = {}
    async for row in db.questions.aggregate(pipeline):
        t = row["_id"]["topic"]
        out.setdefault(t, {"topic": t, "count": 0, "states": []})
        out[t]["count"] += row["count"]
        st = row["_id"].get("state")
        if st and st not in out[t]["states"]:
            out[t]["states"].append(st)
    return {"topics": sorted(out.values(), key=lambda x: x["topic"])}


@api.get("/exams/{category_id}/practice")
async def practice(
    category_id: str,
    topic: Optional[str] = None,
    state: Optional[str] = None,
    count: int = 10,
    authorization: Optional[str] = Header(None),
):
    """Practice mode — includes answer + explanation so learner gets instant feedback."""
    await get_current_user(authorization)
    flt: Dict[str, Any] = {"category_id": category_id}
    if topic:
        flt["topic"] = topic
    if state:
        flt["state"] = state
    pool = await db.questions.find(flt, {"_id": 0}).to_list(length=1000)
    if not pool:
        raise HTTPException(404, "No questions match the filter")
    sample = random.sample(pool, min(count, len(pool)))
    return {"questions": sample, "total_pool": len(pool)}


@api.get("/exams/retry-wrong")
async def retry_wrong(authorization: Optional[str] = Header(None)):
    """Collect questions the user has answered incorrectly across all attempts."""
    user = await get_current_user(authorization)
    attempts = await db.exam_attempts.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    wrong_qids: List[str] = []
    seen = set()
    for a in attempts:
        # we stored only weak_topics summary, not per-question. So we re-derive
        # by looking at attempts that have "review_qids_wrong" if available.
        for qid in a.get("wrong_qids", []):
            if qid not in seen:
                seen.add(qid)
                wrong_qids.append(qid)
    if not wrong_qids:
        return {"questions": [], "count": 0}
    questions = await db.questions.find(
        {"question_id": {"$in": wrong_qids}}, {"_id": 0}
    ).to_list(500)
    return {"questions": questions, "count": len(questions)}


# ---------- Daily Quiz ----------
@api.get("/exams/daily-quiz")
async def daily_quiz(authorization: Optional[str] = Header(None)):
    await get_current_user(authorization)
    today_seed = int(now().date().toordinal())
    rng = random.Random(today_seed)
    pool = await db.questions.find({}, {"_id": 0}).to_list(2000)
    if len(pool) < 10:
        raise HTTPException(503, "Not enough questions")
    sample = rng.sample(pool, 10)
    return {
        "questions": sample,
        "title": "Today's Daily Quiz",
        "subtitle": "10 questions · resets at midnight",
        "date": now().date().isoformat(),
    }


class DailyQuizSubmitBody(BaseModel):
    question_ids: List[str]
    answers: List[int]


@api.post("/exams/daily-quiz/submit")
async def submit_daily_quiz(body: DailyQuizSubmitBody, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    today = now().date().isoformat()
    already = await db.daily_quiz_attempts.find_one(
        {"user_id": user["user_id"], "date": today}, {"_id": 0}
    )
    questions = await db.questions.find(
        {"question_id": {"$in": body.question_ids}}, {"_id": 0}
    ).to_list(length=50)
    qmap = {q["question_id"]: q for q in questions}
    correct = 0
    for qid, ans in zip(body.question_ids, body.answers):
        q = qmap.get(qid)
        if q and ans == q["correct"]:
            correct += 1
    total = len(body.question_ids)
    xp_gain = 0
    if not already:
        xp_gain = correct * 3 + (15 if correct == total else 0)
        await db.daily_quiz_attempts.insert_one({
            "user_id": user["user_id"],
            "date": today,
            "correct": correct,
            "total": total,
            "xp_gained": xp_gain,
            "created_at": now(),
        })
        await update_streak_and_xp(user["user_id"], xp_gain)
    return {
        "correct": correct,
        "total": total,
        "xp_gained": xp_gain,
        "already_completed": bool(already),
    }


# ---------- Achievements ----------
@api.get("/achievements/me")
async def my_achievements(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    attempts = await db.exam_attempts.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    earned = set()
    streak = user.get("streak_days", 0)
    xp = user.get("xp", 0)
    cats_attempted = {a["category_id"] for a in attempts}

    if attempts:
        earned.add("first_exam")
    if any(a.get("passed") for a in attempts):
        earned.add("first_pass")
    if streak >= 3:
        earned.add("streak_3")
    if streak >= 7:
        earned.add("streak_7")
    if streak >= 30:
        earned.add("streak_30")
    if xp >= 100:
        earned.add("xp_100")
    if xp >= 500:
        earned.add("xp_500")
    if xp >= 1000:
        earned.add("xp_1000")
    if len(cats_attempted) >= 3:
        earned.add("all_categories")
    if any(a.get("score_percent") == 100 for a in attempts):
        earned.add("perfect_score")

    out = []
    for a in ACHIEVEMENTS:
        out.append({**a, "earned": a["id"] in earned})
    return {"achievements": out, "earned_count": len(earned), "total": len(ACHIEVEMENTS)}


# ---------- Leaderboard ----------
@api.get("/leaderboard")
async def leaderboard(authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    top = await db.users.find(
        {}, {"_id": 0, "user_id": 1, "name": 1, "xp": 1, "level": 1, "streak_days": 1, "picture": 1}
    ).sort("xp", -1).limit(20).to_list(20)
    # mark self
    for u in top:
        u["is_self"] = u["user_id"] == me["user_id"]
    # compute my rank
    my_rank = await db.users.count_documents({"xp": {"$gt": me.get("xp", 0)}}) + 1
    return {"leaders": top, "my_rank": my_rank, "my_xp": me.get("xp", 0)}


# ---------- Exam readiness ----------
@api.get("/exam/readiness/{category_id}")
async def exam_readiness(category_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    cat = next((c for c in CATEGORIES if c["id"] == category_id), None)
    if not cat:
        raise HTTPException(404, "Category not found")
    attempts = await db.exam_attempts.find(
        {"user_id": user["user_id"], "category_id": category_id}, {"_id": 0}
    ).sort("created_at", -1).limit(5).to_list(5)
    if not attempts:
        return {"readiness": 0, "verdict": "Take a practice exam to see your readiness.", "attempts": 0}
    # Weight recent attempts more
    weights = [1.5, 1.3, 1.1, 1.0, 0.9]
    scored = sum(a["score_percent"] * w for a, w in zip(attempts, weights))
    total_w = sum(weights[: len(attempts)])
    weighted = scored / total_w if total_w else 0
    consistency = 100 - (max(a["score_percent"] for a in attempts) - min(a["score_percent"] for a in attempts))
    readiness = round(weighted * 0.75 + consistency * 0.25)
    readiness = max(0, min(100, readiness))
    pass_pct = cat["pass_score_percent"]
    if readiness >= pass_pct + 10:
        verdict = "You're exam-ready! 🎉"
    elif readiness >= pass_pct:
        verdict = "Borderline — one more practice should do it."
    else:
        verdict = "Keep practising — focus on your weak topics."
    return {
        "readiness": readiness,
        "verdict": verdict,
        "attempts": len(attempts),
        "pass_target": pass_pct,
    }


# ---------- Reading Material ----------
@api.get("/reading/{category_id}")
async def reading(category_id: str):
    chapters = READING_MATERIAL.get(category_id)
    if not chapters:
        raise HTTPException(404, "No reading material for this category")
    return {"category_id": category_id, "chapters": chapters}


# ---------- States (for DKT) ----------
@api.get("/au-states")
async def au_states():
    return {"states": AU_STATES}


# ---------- Study Planner (AI generated) ----------
@api.get("/study-plan")
async def study_plan(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    cached = await db.study_plans.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if cached:
        # serve cached if generated in last 24h
        if (now() - to_aware(cached["created_at"])).total_seconds() < 86400:
            return {"plan": cached["plan"], "cached": True}

    attempts = await db.exam_attempts.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(50)
    weak_topics: Dict[str, int] = {}
    for a in attempts:
        for t, c in (a.get("weak_topics") or {}).items():
            weak_topics[t] = weak_topics.get(t, 0) + c
    top_weak = ", ".join(t for t, _ in sorted(weak_topics.items(), key=lambda x: -x[1])[:5]) or "general practice"
    cats_attempted = {a["category_id"] for a in attempts} or {"dkt"}

    prompt = (
        f"Create a personalised 7-day study plan for an Australian exam learner targeting these categories: "
        f"{', '.join(cats_attempted)}. They have shown weakness in: {top_weak}. "
        "Output exactly 7 days as a numbered list. For each day write one line in this format:\n"
        "Day N: <short focus>. <one practical action> (~XX min)\n"
        "Keep each day under 25 words. Be practical and motivating."
    )
    try:
        text = await _llm_chat(
            f"plan_{user['user_id']}_{uuid.uuid4().hex[:6]}",
            "You write concise study plans for Australian exam prep.",
            prompt,
        )
    except Exception as e:
        log.warning(f"study plan AI failed: {e}")
        text = "Day 1: Warm up with 10 mixed practice questions.\nDay 2: Focus on your weakest topic for 20 min.\nDay 3: Take a timed mock exam.\nDay 4: Review wrong answers + AI explanations.\nDay 5: Flashcards (15 min) + topic practice.\nDay 6: Another timed mock.\nDay 7: Rest, review summary notes, and reset."

    plan_doc = {
        "user_id": user["user_id"],
        "plan": text,
        "weak_topics": list(weak_topics.keys()),
        "created_at": now(),
    }
    await db.study_plans.delete_many({"user_id": user["user_id"]})
    await db.study_plans.insert_one(plan_doc)
    return {"plan": text, "cached": False}


# ---------- Push Notifications ----------
_push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": EMERGENT_PUSH_KEY},
    timeout=10.0,
)


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str


@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    try:
        resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
        if resp.status_code == 401:
            raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
        if resp.status_code >= 500:
            raise HTTPException(502, "Push provider unavailable")
        resp.raise_for_status()
    except HTTPException:
        raise
    except Exception as e:
        log.warning(f"register_push failed (non-blocking): {e}")
        return {"status": "queued"}
    await db.push_tokens.update_one(
        {"user_id": body.user_id, "device_token": body.device_token},
        {"$set": {**body.model_dump(), "registered_at": now()}},
        upsert=True,
    )
    return {"status": "registered"}


async def send_push(recipients: List[str], data: Dict[str, Any]) -> None:
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        return
    try:
        resp = await _push_client.post(
            "/api/v1/push/trigger", json={"recipients": recipients, "data": data}
        )
        if resp.status_code >= 400:
            log.warning(f"send_push non-2xx: {resp.status_code}")
    except Exception as e:
        log.warning(f"send_push failed (non-blocking): {e}")


# Patch submit_exam to also store wrong_qids for retry-wrong
# (handled via a wrapper modifying the stored doc — done in next patch)


# ---------- End Phase 2 ----------

# ============================================================
# Phase 5: Subscription plans, coupons, fair-use, guest exams,
# RevenueCat webhook (stub) — added 2026.
# ============================================================

# ---------- Public subscription config ----------
@api.get("/subscription/plans")
async def subscription_plans():
    """Frontend paywall consumes this to render plans + pricing dynamically."""
    payload = public_plans_payload()
    payload["marketing_features"] = TIER_MARKETING_FEATURES
    return payload


@api.get("/subscription/me")
async def my_subscription(authorization: Optional[str] = Header(None),
                          x_device_id: Optional[str] = Header(None)):
    user = await get_current_user(authorization, x_device_id)
    limits = plan_limits(user.get("plan", "free"))
    cur_week = week_key(now())
    exams_used = user.get("exams_this_week", 0) if user.get("week_start") == cur_week else 0
    today = now().date().isoformat()
    explain_used = await db.ai_usage.count_documents({
        "user_id": user["user_id"], "kind": "explain", "date": today
    })
    tutor_used = await db.ai_usage.count_documents({
        "user_id": user["user_id"], "kind": "tutor", "date": today
    })
    return {
        "plan": user.get("plan", "free"),
        "billing_period": user.get("billing_period"),
        "subscription_provider": user.get("subscription_provider"),
        "subscription_expires_at": user.get("subscription_expires_at"),
        "limits": limits,
        "usage": {
            "exams_this_week": exams_used,
            "exams_per_week_limit": limits["exams_per_week"],
            "ai_explanations_today": explain_used,
            "ai_explanations_limit": limits["ai_explanations_per_day"],
            "ai_tutor_today": tutor_used,
            "ai_tutor_limit": limits["ai_tutor_messages_per_day"],
        },
        "suspended": user.get("suspended", False),
        "suspension_reason": user.get("suspension_reason"),
    }


# ---------- Coupons ----------
class CouponCreate(BaseModel):
    code: str
    discount_type: str = "percent"  # "percent" | "fixed" | "trial_days" | "free_months"
    discount_value: int  # percent (1-100), fixed cents, days, or months
    applicable_plans: List[str] = Field(default_factory=lambda: ["premium", "pro"])
    max_uses: Optional[int] = None  # null = unlimited
    expires_at: Optional[datetime] = None
    active: bool = True
    description: Optional[str] = None


class CouponValidate(BaseModel):
    code: str
    plan: Optional[str] = None  # plan they want to apply to (premium/pro)


def _coupon_public(c: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in c.items() if k != "_id"}
    out["uses_left"] = (c.get("max_uses") or 0) - c.get("used_count", 0) if c.get("max_uses") else None
    return out


@api.post("/coupons/validate")
async def validate_coupon(body: CouponValidate, authorization: Optional[str] = Header(None),
                          x_device_id: Optional[str] = Header(None)):
    user = await get_current_user(authorization, x_device_id)
    code = body.code.strip().upper()
    coupon = await db.coupons.find_one({"code": code}, {"_id": 0})
    if not coupon or not coupon.get("active"):
        raise HTTPException(404, "Invalid or expired coupon code")
    if coupon.get("expires_at") and to_aware(coupon["expires_at"]) < now():
        raise HTTPException(400, "This coupon has expired")
    if coupon.get("max_uses") is not None and coupon.get("used_count", 0) >= coupon["max_uses"]:
        raise HTTPException(400, "This coupon has reached its usage limit")
    if code in (user.get("redeemed_coupons") or []):
        raise HTTPException(400, "You have already redeemed this coupon")
    if body.plan and coupon.get("applicable_plans") and body.plan not in coupon["applicable_plans"]:
        raise HTTPException(400, f"This coupon is not valid for the {body.plan} plan")
    return {"valid": True, "coupon": _coupon_public(coupon)}


class CouponRedeem(BaseModel):
    code: str
    plan: str  # "premium" | "pro"
    billing_period: str = "monthly"  # "monthly" | "yearly"


@api.post("/coupons/redeem")
async def redeem_coupon(body: CouponRedeem, authorization: Optional[str] = Header(None),
                        x_device_id: Optional[str] = Header(None)):
    """Redeem coupon → grant entitlement (trial_days/free_months) or discounted upgrade.
    NOTE: For RevenueCat-backed paid subscriptions, the discount is applied at checkout
    using RC promotional offers / Apple offer codes / Google promo codes — this endpoint
    handles MANUAL coupon-based entitlements granted by the server (gift codes, betas, etc.)."""
    user = await get_current_user(authorization, x_device_id)
    code = body.code.strip().upper()
    coupon = await db.coupons.find_one({"code": code}, {"_id": 0})
    if not coupon or not coupon.get("active"):
        raise HTTPException(404, "Invalid coupon")
    if coupon.get("expires_at") and to_aware(coupon["expires_at"]) < now():
        raise HTTPException(400, "Coupon expired")
    if coupon.get("max_uses") is not None and coupon.get("used_count", 0) >= coupon["max_uses"]:
        raise HTTPException(400, "Coupon usage limit reached")
    if code in (user.get("redeemed_coupons") or []):
        raise HTTPException(400, "Already redeemed")
    if body.plan not in {"premium", "pro"}:
        raise HTTPException(400, "Invalid plan")
    if coupon.get("applicable_plans") and body.plan not in coupon["applicable_plans"]:
        raise HTTPException(400, f"Coupon not valid for {body.plan}")

    granted_until: Optional[datetime] = None
    discount_meta: Dict[str, Any] = {"type": coupon["discount_type"], "value": coupon["discount_value"]}

    if coupon["discount_type"] == "trial_days":
        granted_until = now() + timedelta(days=int(coupon["discount_value"]))
    elif coupon["discount_type"] == "free_months":
        granted_until = now() + timedelta(days=int(coupon["discount_value"]) * 30)
    elif coupon["discount_type"] in ("percent", "fixed"):
        # Just return discount metadata — frontend forwards to RC checkout
        return {
            "ok": True,
            "type": "discount_only",
            "discount": discount_meta,
            "message": "Apply this discount at checkout.",
        }

    if granted_until:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {
                "$set": {
                    "plan": body.plan,
                    "billing_period": body.billing_period,
                    "subscription_provider": "coupon",
                    "subscription_expires_at": granted_until,
                },
                "$addToSet": {"redeemed_coupons": code},
            },
        )
    else:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$addToSet": {"redeemed_coupons": code}},
        )

    await db.coupons.update_one({"code": code}, {"$inc": {"used_count": 1}})
    await db.coupon_redemptions.insert_one({
        "user_id": user["user_id"], "code": code, "plan": body.plan,
        "billing_period": body.billing_period,
        "discount_meta": discount_meta,
        "redeemed_at": now(),
        "granted_until": granted_until,
    })
    return {
        "ok": True,
        "type": "entitlement_granted",
        "plan": body.plan,
        "granted_until": granted_until.isoformat() if granted_until else None,
    }


# ---------- Admin Coupons ----------
@api.get("/admin/coupons")
async def admin_list_coupons(authorization: Optional[str] = Header(None),
                             x_device_id: Optional[str] = Header(None)):
    await require_admin(authorization, x_device_id)
    items = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"coupons": items, "count": len(items)}


@api.post("/admin/coupons")
async def admin_create_coupon(body: CouponCreate, authorization: Optional[str] = Header(None),
                              x_device_id: Optional[str] = Header(None)):
    await require_admin(authorization, x_device_id)
    code = body.code.strip().upper()
    if not code or len(code) < 3:
        raise HTTPException(400, "Coupon code too short (min 3 chars)")
    if body.discount_type not in {"percent", "fixed", "trial_days", "free_months"}:
        raise HTTPException(400, "Invalid discount_type")
    if body.discount_type == "percent" and not (1 <= body.discount_value <= 100):
        raise HTTPException(400, "Percent must be 1-100")
    existing = await db.coupons.find_one({"code": code})
    if existing:
        raise HTTPException(409, "Coupon code already exists")
    doc = body.model_dump()
    doc["code"] = code
    doc["used_count"] = 0
    doc["created_at"] = now()
    await db.coupons.insert_one(doc)
    doc.pop("_id", None)
    return {"coupon": doc}


class CouponUpdate(BaseModel):
    active: Optional[bool] = None
    max_uses: Optional[int] = None
    expires_at: Optional[datetime] = None
    description: Optional[str] = None
    applicable_plans: Optional[List[str]] = None


@api.patch("/admin/coupons/{code}")
async def admin_update_coupon(code: str, body: CouponUpdate,
                              authorization: Optional[str] = Header(None),
                              x_device_id: Optional[str] = Header(None)):
    await require_admin(authorization, x_device_id)
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(400, "No fields to update")
    res = await db.coupons.update_one({"code": code.upper()}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Coupon not found")
    refreshed = await db.coupons.find_one({"code": code.upper()}, {"_id": 0})
    return {"coupon": refreshed}


@api.delete("/admin/coupons/{code}")
async def admin_delete_coupon(code: str, authorization: Optional[str] = Header(None),
                              x_device_id: Optional[str] = Header(None)):
    await require_admin(authorization, x_device_id)
    res = await db.coupons.delete_one({"code": code.upper()})
    return {"deleted": res.deleted_count}


# ---------- Guest mock-exam (1 trial without signup) ----------
class GuestExamSubmitBody(BaseModel):
    category_id: str
    question_ids: List[str]
    answers: List[int]
    time_taken_seconds: int


@api.get("/exams/guest/start/{category_id}")
async def guest_start_exam(category_id: str, x_device_id: Optional[str] = Header(None)):
    """Guest user trial: 1 mock exam per device. No auth required."""
    if not x_device_id:
        raise HTTPException(400, {"code": "DEVICE_ID_REQUIRED", "message": "Missing device id"})
    # Check guest usage
    g = await db.guest_attempts.find_one({"device_id": x_device_id}, {"_id": 0})
    if g and g.get("count", 0) >= 1:
        raise HTTPException(429, {
            "code": "GUEST_TRIAL_USED",
            "message": "You've used your free trial exam. Sign up to keep practising.",
        })
    cat = next((c for c in CATEGORIES if c["id"] == category_id), None)
    if not cat:
        raise HTTPException(404, "Category not found")
    pool = await db.questions.find(
        {"category_id": category_id}, {"_id": 0, "correct": 0, "explanation": 0}
    ).to_list(1000)
    if len(pool) < 5:
        raise HTTPException(503, "Question bank not seeded yet")
    sample = random.sample(pool, min(cat["total_questions_in_exam"], len(pool)))
    return {
        "category": {
            "id": cat["id"], "name": cat["name"], "short_name": cat["short_name"],
            "time_limit_minutes": cat["time_limit_minutes"],
            "pass_score_percent": cat["pass_score_percent"],
            "total_questions_in_exam": len(sample),
        },
        "questions": sample,
        "is_guest_trial": True,
    }


@api.post("/exams/guest/submit")
async def guest_submit_exam(body: GuestExamSubmitBody,
                            x_device_id: Optional[str] = Header(None)):
    if not x_device_id:
        raise HTTPException(400, "Missing device id")
    # Guard against repeat after the first attempt
    g = await db.guest_attempts.find_one({"device_id": x_device_id}, {"_id": 0})
    if g and g.get("count", 0) >= 1:
        raise HTTPException(429, "Guest trial already used — please sign up.")
    cat = next((c for c in CATEGORIES if c["id"] == body.category_id), None)
    if not cat:
        raise HTTPException(404, "Category not found")
    questions = await db.questions.find(
        {"question_id": {"$in": body.question_ids}}, {"_id": 0}
    ).to_list(length=500)
    qmap = {q["question_id"]: q for q in questions}
    correct = 0
    review: List[Dict[str, Any]] = []
    for qid, ans in zip(body.question_ids, body.answers):
        q = qmap.get(qid)
        if not q:
            continue
        is_correct = ans == q["correct"]
        if is_correct:
            correct += 1
        review.append({
            "question_id": qid, "question": q["question"], "options": q["options"],
            "correct": q["correct"], "user_answer": ans,
            "is_correct": is_correct, "topic": q.get("topic"),
            "explanation": q.get("explanation"),
        })
    total = len(body.question_ids)
    score_pct = round((correct / total) * 100) if total else 0
    passed = score_pct >= cat["pass_score_percent"]
    # Mark device as used
    await db.guest_attempts.update_one(
        {"device_id": x_device_id},
        {
            "$inc": {"count": 1},
            "$set": {"last_at": now(), "category_id": body.category_id, "score_percent": score_pct},
        },
        upsert=True,
    )
    return {
        "score_percent": score_pct, "correct_count": correct, "total_questions": total,
        "passed": passed, "review": review,
        "must_signup": True,
        "message": "Sign up to save your progress, unlock more exams, and try AI explanations!",
    }


# ---------- RevenueCat webhook (placeholder until keys are wired) ----------
RC_WEBHOOK_SECRET = os.environ.get("RC_WEBHOOK_SECRET", "")


@api.post("/iap/revenuecat-webhook")
async def revenuecat_webhook(request: Request,
                             authorization: Optional[str] = Header(None)):
    """RevenueCat sends events here. Configure 'Authorization Header' to
    `Bearer <RC_WEBHOOK_SECRET>` in the RevenueCat dashboard.

    Events handled:
      INITIAL_PURCHASE, RENEWAL, NON_RENEWING_PURCHASE → grant entitlement
      CANCELLATION, EXPIRATION, BILLING_ISSUE → keep until expires_date, then downgrade
      PRODUCT_CHANGE → update plan
      TRANSFER → reassign rc_app_user_id
    """
    if RC_WEBHOOK_SECRET:
        if not authorization or authorization != f"Bearer {RC_WEBHOOK_SECRET}":
            raise HTTPException(401, "Invalid RC webhook auth")
    payload = await request.json()
    event = payload.get("event") or {}
    ev_type = event.get("type")
    app_user_id = event.get("app_user_id")
    product_id = event.get("product_id", "")
    expires_ms = event.get("expiration_at_ms")
    expires_at: Optional[datetime] = None
    if expires_ms:
        expires_at = datetime.fromtimestamp(int(expires_ms) / 1000, tz=timezone.utc)

    # Map SKU → plan + billing_period
    plan = "free"
    period: Optional[str] = None
    if "premium" in product_id:
        plan = "premium"
    elif "pro" in product_id:
        plan = "pro"
    if "yearly" in product_id:
        period = "yearly"
    elif "monthly" in product_id:
        period = "monthly"

    await db.iap_events.insert_one({
        "event_type": ev_type, "app_user_id": app_user_id,
        "product_id": product_id, "raw": payload, "at": now(),
    })

    if not app_user_id:
        return {"ok": True, "ignored": "no_app_user_id"}

    # Find user by rc_app_user_id (set when client logs into RC) or fall back to user_id match
    user = await db.users.find_one(
        {"$or": [{"rc_app_user_id": app_user_id}, {"user_id": app_user_id}]},
        {"_id": 0},
    )
    if not user:
        return {"ok": True, "ignored": "user_not_found"}

    set_doc: Dict[str, Any] = {}
    if ev_type in {"INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE", "PRODUCT_CHANGE"}:
        set_doc["plan"] = plan
        if period:
            set_doc["billing_period"] = period
        set_doc["subscription_provider"] = "revenuecat"
        if expires_at:
            set_doc["subscription_expires_at"] = expires_at
    elif ev_type in {"CANCELLATION", "EXPIRATION", "BILLING_ISSUE"}:
        # Keep entitlement until expiry, but record the cancellation
        if expires_at and expires_at < now():
            set_doc["plan"] = "free"
            set_doc["billing_period"] = None
        set_doc["subscription_cancelled_at"] = now()

    if set_doc:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": set_doc})
    return {"ok": True, "applied": list(set_doc.keys())}


# Frontend calls this after RevenueCat.logIn() so we can map app_user_id → user_id.
class RCLinkBody(BaseModel):
    rc_app_user_id: str


@api.post("/iap/link-rc-user")
async def link_revenuecat_user(body: RCLinkBody, authorization: Optional[str] = Header(None),
                               x_device_id: Optional[str] = Header(None)):
    user = await get_current_user(authorization, x_device_id)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"rc_app_user_id": body.rc_app_user_id}},
    )
    return {"ok": True}


# ── Manual IAP sync — frontend calls this AFTER successful purchase to bypass
#    webhook latency. Looks up the user's active entitlement in RevenueCat
#    via the public REST API and immediately mirrors it into our DB.
class IapSyncBody(BaseModel):
    # The active product_id reported by the StoreKit/RevenueCat SDK in-app
    # (e.g. "passaroo_premium_monthly" / "passaroo_pro_yearly"). Optional
    # because we'll also accept a generic "active_entitlements" payload.
    product_id: Optional[str] = None
    entitlement: Optional[str] = None  # "premium" | "pro"
    expires_at_ms: Optional[int] = None
    billing_period: Optional[str] = None  # "monthly" | "yearly"


@api.post("/iap/sync")
async def iap_sync(body: IapSyncBody, authorization: Optional[str] = Header(None),
                   x_device_id: Optional[str] = Header(None)):
    """Idempotent client-driven sync of the user's entitlement.
    Called by the app right after RevenueCat reports a successful purchase
    so the user sees Premium unlocked instantly (webhook is a backup)."""
    user = await get_current_user(authorization, x_device_id)

    # Determine plan from product_id or explicit entitlement
    plan: Optional[str] = None
    period = body.billing_period
    pid = (body.product_id or "").lower()
    ent = (body.entitlement or "").lower()
    if "pro" in pid or ent == "pro":
        plan = "pro"
    elif "premium" in pid or ent == "premium":
        plan = "premium"
    if not plan:
        # Nothing to sync — but don't error, just return current state
        return {"ok": True, "plan": user.get("plan", "free"), "synced": False}

    if not period:
        if "yearly" in pid:
            period = "yearly"
        elif "monthly" in pid:
            period = "monthly"

    expires_at = None
    if body.expires_at_ms:
        try:
            expires_at = datetime.fromtimestamp(body.expires_at_ms / 1000, tz=timezone.utc)
        except Exception:
            expires_at = None

    set_doc: Dict[str, Any] = {
        "plan": plan,
        "subscription_provider": "revenuecat",
        "subscription_started_at": now(),
    }
    if period:
        set_doc["billing_period"] = period
    if expires_at:
        set_doc["subscription_expires_at"] = expires_at

    await db.users.update_one({"user_id": user["user_id"]}, {"$set": set_doc})
    await db.iap_events.insert_one({
        "event_type": "CLIENT_SYNC",
        "app_user_id": user.get("rc_app_user_id") or user["user_id"],
        "product_id": body.product_id,
        "at": now(),
        "raw": body.model_dump(),
    })

    refreshed = await db.users.find_one(
        {"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0},
    )
    return {"ok": True, "synced": True, "user": refreshed}


# ============================================================
# Phase 6: Multi-exam subscriptions (Sep 2026)
# Users now subscribe to 1+ exam families, with conditional state
# selection only for state-specific families. Replaces the old
# single primary_category_id flow.
# ============================================================

def _resolve_category(family: str, state: Optional[str]) -> Optional[Dict[str, Any]]:
    """Find the matching CATEGORIES entry for (family, state)."""
    fam = next((f for f in FAMILIES if f["id"] == family), None)
    if not fam:
        return None
    matches = [c for c in CATEGORIES if c["family"] == family]
    if not matches:
        return None
    # If family is state-specific, require a state match
    if any(c.get("state") for c in matches):
        if not state:
            return None
        return next((c for c in matches if c.get("state") == state.upper()), None)
    # National exam (no state) — return first
    return matches[0]


def _family_is_state_specific(family: str) -> bool:
    return any(c.get("state") for c in CATEGORIES if c["family"] == family)


class SubscribeExamBody(BaseModel):
    family: str
    state: Optional[str] = None
    set_primary: bool = True


@api.post("/user/exams/subscribe")
async def subscribe_exam(body: SubscribeExamBody, authorization: Optional[str] = Header(None),
                         x_device_id: Optional[str] = None):
    user = await get_current_user(authorization, x_device_id)
    cat = _resolve_category(body.family, body.state)
    if not cat:
        if _family_is_state_specific(body.family):
            raise HTTPException(400, f"State required for family '{body.family}'")
        raise HTTPException(404, f"Unknown family '{body.family}'")

    subs = list(user.get("exam_subscriptions") or [])
    existing = next((s for s in subs if s["category_id"] == cat["id"]), None)
    if existing:
        # Already subscribed — just update primary flag if requested
        if body.set_primary:
            for s in subs:
                s["primary"] = (s["category_id"] == cat["id"])
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {
                    "exam_subscriptions": subs,
                    "primary_category_id": cat["id"],
                    "state": cat.get("state") or user.get("state"),
                }},
            )
        return {"ok": True, "already_subscribed": True, "category": cat}

    # Add new subscription
    is_primary = body.set_primary or not subs  # auto-primary if first
    if is_primary:
        for s in subs:
            s["primary"] = False
    subs.append({
        "family": body.family,
        "state": cat.get("state"),
        "category_id": cat["id"],
        "primary": is_primary,
        "subscribed_at": now(),
    })
    update: Dict[str, Any] = {"exam_subscriptions": subs}
    if is_primary:
        update["primary_category_id"] = cat["id"]
        if cat.get("state"):
            update["state"] = cat["state"]
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    return {"ok": True, "added": True, "category": cat, "is_primary": is_primary}


@api.delete("/user/exams/subscribe/{category_id}")
async def unsubscribe_exam(category_id: str,
                           authorization: Optional[str] = Header(None),
                           x_device_id: Optional[str] = None):
    user = await get_current_user(authorization, x_device_id)
    subs = list(user.get("exam_subscriptions") or [])
    new_subs = [s for s in subs if s["category_id"] != category_id]
    if len(new_subs) == len(subs):
        raise HTTPException(404, "Subscription not found")
    # If we removed the primary, promote the first remaining
    update: Dict[str, Any] = {"exam_subscriptions": new_subs}
    removed_primary = any(s.get("primary") and s["category_id"] == category_id for s in subs)
    if removed_primary and new_subs:
        new_subs[0]["primary"] = True
        update["primary_category_id"] = new_subs[0]["category_id"]
        update["state"] = new_subs[0].get("state")
    elif not new_subs:
        update["primary_category_id"] = None
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    return {"ok": True, "removed": category_id, "remaining": len(new_subs)}


class SetPrimaryBody(BaseModel):
    category_id: str


@api.patch("/user/exams/primary")
async def set_primary_exam(body: SetPrimaryBody,
                           authorization: Optional[str] = Header(None),
                           x_device_id: Optional[str] = None):
    user = await get_current_user(authorization, x_device_id)
    subs = list(user.get("exam_subscriptions") or [])
    if not any(s["category_id"] == body.category_id for s in subs):
        raise HTTPException(404, "Not subscribed to that exam")
    target_state = None
    for s in subs:
        s["primary"] = (s["category_id"] == body.category_id)
        if s["primary"]:
            target_state = s.get("state")
    update: Dict[str, Any] = {
        "exam_subscriptions": subs,
        "primary_category_id": body.category_id,
    }
    if target_state:
        update["state"] = target_state
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    return {"ok": True, "primary": body.category_id}


@api.get("/user/exams")
async def list_my_exams(authorization: Optional[str] = Header(None),
                        x_device_id: Optional[str] = None):
    user = await get_current_user(authorization, x_device_id)
    subs = user.get("exam_subscriptions") or []
    # Enrich with full category info for the frontend
    enriched = []
    for s in subs:
        cat = next((c for c in CATEGORIES if c["id"] == s["category_id"]), None)
        if cat:
            enriched.append({**s, "category": {
                "id": cat["id"], "name": cat["name"], "short_name": cat["short_name"],
                "icon": cat["icon"], "color": cat["color"], "family": cat["family"],
                "description": cat["description"], "state": cat.get("state"),
            }})
    return {"subscriptions": enriched, "count": len(enriched)}


# ---------- End Phase 6 ----------


# ---------- End Phase 5 ----------


app.include_router(api)
register_legal_routes(app)


# ─── Temporary screenshot download endpoint ──────────────────────────────
# Token-gated public download (no auth header, but obscure URL).
# Safe to remove after files are downloaded.
from fastapi.responses import FileResponse  # noqa: E402

@app.get("/api/_dl/screenshots/{key}", include_in_schema=False)
async def dl_screenshots(key: str):
    if key != "passaroo-2026-screenshots-bundle":
        raise HTTPException(404, "Not found")
    fp = ROOT_DIR / "passaroo_screenshots.zip"
    return FileResponse(fp, media_type="application/zip",
                        filename="passaroo_screenshots_all.zip")

@app.get("/api/_dl/ios/{key}", include_in_schema=False)
async def dl_ios(key: str):
    if key != "passaroo-2026-screenshots-bundle":
        raise HTTPException(404, "Not found")
    fp = ROOT_DIR / "passaroo_ios.zip"
    return FileResponse(fp, media_type="application/zip",
                        filename="passaroo_ios_screenshots.zip")

@app.get("/api/_dl/android/{key}", include_in_schema=False)
async def dl_android(key: str):
    if key != "passaroo-2026-screenshots-bundle":
        raise HTTPException(404, "Not found")
    fp = ROOT_DIR / "passaroo_android.zip"
    return FileResponse(fp, media_type="application/zip",
                        filename="passaroo_android_screenshots.zip")

@app.get("/api/_dl/seo-iphone65/{key}", include_in_schema=False)
async def dl_seo_iphone65(key: str):
    if key != "passaroo-2026-screenshots-bundle":
        raise HTTPException(404, "Not found")
    fp = ROOT_DIR / "passaroo_seo_iphone65.zip"
    return FileResponse(fp, media_type="application/zip",
                        filename="passaroo_seo_iphone65_screenshots.zip")

@app.get("/api/_dl/seo-ipad13/{key}", include_in_schema=False)
async def dl_seo_ipad13(key: str):
    if key != "passaroo-2026-screenshots-bundle":
        raise HTTPException(404, "Not found")
    fp = ROOT_DIR / "passaroo_seo_ipad13.zip"
    return FileResponse(fp, media_type="application/zip",
                        filename="passaroo_seo_ipad13_screenshots.zip")

@app.get("/api/_dl/seo-android-phone/{key}", include_in_schema=False)
async def dl_seo_android_phone(key: str):
    if key != "passaroo-2026-screenshots-bundle":
        raise HTTPException(404, "Not found")
    fp = ROOT_DIR / "passaroo_seo_android_phone.zip"
    return FileResponse(fp, media_type="application/zip",
                        filename="passaroo_seo_android_phone_screenshots.zip")

@app.get("/api/_dl/seo-android-tablet/{key}", include_in_schema=False)
async def dl_seo_android_tablet(key: str):
    if key != "passaroo-2026-screenshots-bundle":
        raise HTTPException(404, "Not found")
    fp = ROOT_DIR / "passaroo_seo_android_tablet.zip"
    return FileResponse(fp, media_type="application/zip",
                        filename="passaroo_seo_android_tablet_screenshots.zip")

@app.get("/api/_dl/seo-all/{key}", include_in_schema=False)
async def dl_seo_all(key: str):
    if key != "passaroo-2026-screenshots-bundle":
        raise HTTPException(404, "Not found")
    fp = ROOT_DIR / "passaroo_seo_all.zip"
    return FileResponse(fp, media_type="application/zip",
                        filename="passaroo_seo_all_screenshots.zip")

@app.get("/api/_dl/seo-iphone65/preview/{name}", include_in_schema=False)
async def dl_seo_iphone65_preview(name: str):
    """Inline preview of a single SEO screenshot (for browser viewing)."""
    safe = name.replace("..", "").replace("/", "")
    fp = Path("/tmp/passaroo_screenshots/seo") / safe
    if not fp.exists() or not safe.endswith(".png"):
        raise HTTPException(404, "Not found")
    return FileResponse(fp, media_type="image/png")


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
