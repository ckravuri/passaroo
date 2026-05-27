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
from seed_data import CATEGORIES

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------- Config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
JWT_SECRET = os.environ["JWT_SECRET"]
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}

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
    streak_days: int = 0
    last_streak_date: Optional[str] = None
    xp: int = 0
    level: int = 1
    exams_this_week: int = 0
    week_start: Optional[str] = None
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


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
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
    return user


async def require_admin(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user = await get_current_user(authorization)
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return user


def plan_limits(plan: str) -> Dict[str, Any]:
    return {
        "guest": {"exams_per_week": 1, "ai_explanations_per_day": 0, "ai_tutor": False, "ads": True},
        "free": {"exams_per_week": 2, "ai_explanations_per_day": 5, "ai_tutor": False, "ads": True},
        "premium": {"exams_per_week": 15, "ai_explanations_per_day": 100, "ai_tutor": True, "ads": False},
        "pro": {"exams_per_week": 50, "ai_explanations_per_day": 500, "ai_tutor": True, "ads": False},
    }.get(plan, {"exams_per_week": 2, "ai_explanations_per_day": 5, "ai_tutor": False, "ads": True})


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


async def issue_session(user_id: str) -> str:
    token = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    await db.user_sessions.delete_many({"user_id": user_id})  # one active device session
    await db.user_sessions.insert_one(
        {
            "session_token": token,
            "user_id": user_id,
            "created_at": now(),
            "expires_at": now() + timedelta(days=7),
        }
    )
    return token


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


# ---------- Routes: Auth ----------
@api.get("/")
async def root():
    return {"app": "Passaroo", "status": "ok"}


@api.post("/auth/email/signup")
async def email_signup(body: EmailSignupBody):
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
    ).model_dump()
    user_doc["password_hash"] = hash_password(body.password)
    await db.users.insert_one(user_doc)
    token = await issue_session(user_doc["user_id"])
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    return {"session_token": token, "user": user_doc}


@api.post("/auth/email/login")
async def email_login(body: EmailLoginBody):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = await issue_session(user["user_id"])
    user.pop("password_hash", None)
    return {"session_token": token, "user": user}


@api.post("/auth/google/session")
async def google_session(body: GoogleSessionBody):
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
    token = await issue_session(user["user_id"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"session_token": token, "user": user}


@api.get("/auth/me")
async def get_me(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
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
    return {"categories": out}


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
async def _llm_chat(session_id: str, system: str, user_msg: str) -> str:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model("gemini", "gemini-3-flash-preview")
    return await chat.send_message(UserMessage(text=user_msg))


@api.post("/ai/explain")
async def ai_explain(body: AIExplainBody, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    limits = plan_limits(user.get("plan", "free"))
    # daily limit
    today = now().date().isoformat()
    used = await db.ai_usage.count_documents(
        {"user_id": user["user_id"], "kind": "explain", "date": today}
    )
    if used >= limits["ai_explanations_per_day"]:
        raise HTTPException(429, "Daily AI explanation limit reached. Upgrade your plan.")

    correct_text = body.options[body.correct_index] if 0 <= body.correct_index < len(body.options) else "(unknown)"
    user_text = (body.options[body.user_answer_index]
                 if 0 <= body.user_answer_index < len(body.options) else "(no answer)")
    prompt = (
        f"Question: {body.question}\nOptions: {body.options}\n"
        f"Correct answer: {correct_text}\nLearner chose: {user_text}\n"
        "Give a concise, friendly explanation (max 4 sentences) suitable for an Australian "
        "exam learner. If they were wrong, briefly say why their choice was wrong, then explain the correct answer."
    )
    try:
        reply = await _llm_chat(
            f"explain_{user['user_id']}_{uuid.uuid4().hex[:8]}",
            "You are Passaroo, a friendly Australian exam tutor. Be concise, accurate, encouraging.",
            prompt,
        )
    except Exception as e:
        log.exception("AI explain failed")
        raise HTTPException(502, f"AI service error: {e}")

    await db.ai_usage.insert_one(
        {"user_id": user["user_id"], "kind": "explain", "date": today, "at": now()}
    )
    return {"explanation": reply}


@api.post("/ai/tutor")
async def ai_tutor(body: AITutorBody, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    limits = plan_limits(user.get("plan", "free"))
    if not limits["ai_tutor"]:
        raise HTTPException(402, "AI Tutor is a Premium/Pro feature. Upgrade to chat with the tutor.")

    cat_hint = ""
    if body.category_id:
        cat = next((c for c in CATEGORIES if c["id"] == body.category_id), None)
        if cat:
            cat_hint = f" The learner is preparing for: {cat['name']}."

    system = (
        "You are Passaroo, an upbeat Australian exam-prep tutor. "
        "Keep answers concise (under 6 sentences), accurate, and encouraging. "
        "Always remind learners this is independent practice content, not official." + cat_hint
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
    prompt = (
        f"Generate exactly {min(body.count, 8)} concise study flashcards for {cat['name']} on these topics: {topics}. "
        "Respond as a numbered list. Each item must be:\n"
        "FRONT: <short question or concept>\nBACK: <clear 1–2 sentence answer>\n\n"
        "Make them practical, Australia-specific where relevant, and original (not copied from official exams)."
    )
    try:
        reply = await _llm_chat(
            f"flash_{user['user_id']}_{uuid.uuid4().hex[:8]}",
            "You write study flashcards for Australian exam prep. Output is plain text, easy to parse.",
            prompt,
        )
    except Exception as e:
        log.exception("AI flashcards failed")
        raise HTTPException(502, f"AI service error: {e}")
    # naive parse
    cards = []
    cur = {}
    for line in reply.splitlines():
        s = line.strip()
        if s.upper().startswith("FRONT:"):
            if cur.get("front") and cur.get("back"):
                cards.append(cur)
            cur = {"front": s.split(":", 1)[1].strip(), "back": ""}
        elif s.upper().startswith("BACK:"):
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
    """Mock subscription upgrade — in production hook to in-app purchase / Stripe."""
    user = await get_current_user(authorization)
    if body.plan not in {"free", "premium", "pro"}:
        raise HTTPException(400, "Invalid plan")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"plan": body.plan}})
    return {"ok": True, "plan": body.plan}


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
    qs = await db.questions.find(flt, {"_id": 0}).to_list(1000)
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
    await db.questions.insert_one(doc)
    doc.pop("_id", None)
    return {"question": doc}


@api.delete("/admin/questions/{question_id}")
async def admin_delete_question(question_id: str, authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    res = await db.questions.delete_one({"question_id": question_id})
    return {"deleted": res.deleted_count}


@api.get("/admin/users")
async def admin_list_users(authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return {"users": users}


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
                    "topic": q["topic"],
                    "difficulty": q["difficulty"],
                    "state": q.get("state"),
                    "question": q["question"],
                    "options": q["options"],
                    "correct": q["correct"],
                    "explanation": q["explanation"],
                    "created_at": now(),
                }
                await db.questions.insert_one(doc)
            log.info(f"Seeded {len(cat['questions'])} questions for {cat['id']}")

    log.info("Passaroo startup complete.")


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
