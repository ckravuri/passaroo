"""
One-time / idempotent seed for production MongoDB (Atlas, Railway-attached, etc.).

Usage:
    cd /app/backend
    MONGO_URL='mongodb+srv://...' DB_NAME=passaroo python3 seed_atlas.py

What it does:
  - Connects to the MONGO_URL you provide (does NOT touch the local pod .env)
  - Creates all production indexes
  - Seeds the 14 categories with their question banks (idempotent per category)
  - Backfills `family`, `tags`, `learning_objectives` on any existing docs
  - Seeds the admin user (admin@passaroo.app) if missing

Re-running is safe.
"""
import asyncio, os, sys, hashlib
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Allow override of env file location; default to .env in CWD
load_dotenv()

from seed_data import CATEGORIES, FAMILIES  # noqa: E402

ADMIN_EMAIL = "admin@passaroo.app"
ADMIN_PASSWORD = "Passaroo!Admin2026"


def now():
    return datetime.now(timezone.utc)


def hash_password(p: str) -> str:
    # Match the bcrypt-ish hash used in server.py — for portability we import the same helper.
    import bcrypt
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def make_id(prefix: str) -> str:
    import uuid
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


async def main():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "passaroo")
    if not mongo_url:
        print("ERROR: set MONGO_URL env var first.")
        sys.exit(1)

    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=15000)
    db = client[db_name]

    # Sanity ping
    await client.admin.command("ping")
    print(f"✓ Connected to {db_name} ({mongo_url.split('@')[-1].split('/')[0]})")

    # ---------- Indexes ----------
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.questions.create_index("question_id", unique=True)
    await db.questions.create_index("category_id")
    await db.questions.create_index([("category_id", 1), ("state", 1)])
    await db.exam_attempts.create_index("user_id")
    await db.exam_attempts.create_index("created_at")
    await db.ai_usage.create_index([("user_id", 1), ("date", 1)])
    await db.bookmarks.create_index([("user_id", 1), ("question_id", 1)], unique=True)
    print("✓ Indexes ensured")

    # ---------- Admin user ----------
    if not await db.users.find_one({"email": ADMIN_EMAIL}):
        await db.users.insert_one({
            "user_id": make_id("u"),
            "email": ADMIN_EMAIL,
            "name": "Passaroo Admin",
            "auth_provider": "email",
            "plan": "pro",
            "is_admin": True,
            "state": "NSW",
            "primary_category_id": "dkt_nsw",
            "streak_days": 0,
            "xp": 0,
            "level": 1,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "created_at": now(),
        })
        print(f"✓ Admin seeded: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    else:
        await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {"is_admin": True, "plan": "pro"}})
        print(f"✓ Admin exists: {ADMIN_EMAIL} (re-flagged as admin)")

    # ---------- Migration: legacy 'dkt' -> 'dkt_nsw' ----------
    legacy = await db.questions.count_documents({"category_id": "dkt"})
    if legacy:
        await db.questions.update_many({"category_id": "dkt"}, {"$set": {"category_id": "dkt_nsw"}})
        await db.exam_attempts.update_many({"category_id": "dkt"}, {"$set": {"category_id": "dkt_nsw"}})
        await db.bookmarks.update_many({"category_id": "dkt"}, {"$set": {"category_id": "dkt_nsw"}})
        print(f"✓ Migrated {legacy} legacy dkt → dkt_nsw")

    # ---------- Question seeding ----------
    total_seeded = 0
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
            total_seeded += len(cat["questions"])
            print(f"  + {cat['id']:14s} seeded {len(cat['questions'])} questions")
        else:
            print(f"  · {cat['id']:14s} already has {count} questions — skipped")

    # ---------- Backfill missing fields on legacy docs ----------
    await db.questions.update_many({"tags": {"$exists": False}}, {"$set": {"tags": []}})
    await db.questions.update_many({"learning_objectives": {"$exists": False}}, {"$set": {"learning_objectives": []}})
    cat_to_family = {c["id"]: c.get("family") for c in CATEGORIES}
    for cid, fam in cat_to_family.items():
        await db.questions.update_many(
            {"category_id": cid, "family": {"$exists": False}}, {"$set": {"family": fam}}
        )
    print("✓ Backfilled tags / learning_objectives / family")

    # ---------- Summary ----------
    print("\n=== Production DB summary ===")
    for cat in CATEGORIES:
        c = await db.questions.count_documents({"category_id": cat["id"]})
        print(f"  {cat['id']:14s} {cat['name']:42s} {c} Qs")
    print(f"  TOTAL newly seeded this run: {total_seeded}")
    print(f"  Categories: {len(CATEGORIES)}  Families: {len(FAMILIES)}")
    print("✅ Done.")


if __name__ == "__main__":
    asyncio.run(main())
