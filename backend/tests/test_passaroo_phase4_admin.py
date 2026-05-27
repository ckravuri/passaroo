"""
Phase-4 backend tests: Admin Panel CRUD + bulk import + user mgmt + new AI prompts.

Endpoints under test:
  - /api/admin/stats
  - /api/admin/users (+ ?q= search)
  - /api/admin/users/{user_id} PATCH (plan / ban)
  - /api/admin/questions (POST / PATCH / DELETE)
  - /api/admin/questions/bulk-import (POST)
  - /api/ai/explain (new 3-line structured format)
  - /api/ai/tutor (richer Passaroo persona prompt)
  - /api/ai/flashcards (FRONT/BACK parse)

Notes:
  * AI endpoints cost LLM tokens — we limit ourselves to 1 call per endpoint.
  * Auth: admin@passaroo.app / Passaroo!Admin2026 (seeded by backend on startup).
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admin@passaroo.app"
ADMIN_PASS = "Passaroo!Admin2026"

# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/email/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["is_admin"] is True
    return data["session_token"]


@pytest.fixture(scope="module")
def normal_user():
    """Create a fresh non-admin user for permission tests."""
    suffix = uuid.uuid4().hex[:8]
    email = f"phase4-user-{suffix}@passaroo.app"
    r = requests.post(
        f"{BASE_URL}/api/auth/email/signup",
        json={"email": email, "password": "TestPass123!", "name": "Phase4 User"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["session_token"], "user_id": data["user"]["user_id"], "email": email}


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ===================== /admin/stats =====================
class TestAdminStats:
    def test_stats_admin_ok(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/stats", headers=H(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # totals
        assert set(d["totals"].keys()) >= {"users", "questions", "attempts", "categories"}
        assert d["totals"]["categories"] == 14
        assert d["totals"]["users"] >= 1
        # signups
        assert set(d["signups"].keys()) == {"day", "week", "month"}
        for k in ("day", "week", "month"):
            assert isinstance(d["signups"][k], int)
        # attempts_week
        assert isinstance(d["attempts_week"], int)
        # by_plan & by_state
        assert isinstance(d["by_plan"], dict)
        assert isinstance(d["by_state"], dict)
        assert "pro" in d["by_plan"]  # admin is pro
        # per_category covers all 14
        assert len(d["per_category"]) == 14
        cat_ids = {c["id"] for c in d["per_category"]}
        assert "dkt_nsw" in cat_ids
        for c in d["per_category"]:
            assert "question_count" in c and "attempt_count" in c

    def test_stats_non_admin_403(self, normal_user):
        r = requests.get(f"{BASE_URL}/api/admin/stats", headers=H(normal_user["token"]), timeout=15)
        assert r.status_code == 403

    def test_stats_no_auth_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/stats", timeout=15)
        assert r.status_code == 401


# ===================== /admin/users =====================
class TestAdminUsers:
    def test_list_users_default(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=H(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "users" in d and isinstance(d["users"], list)
        assert d["count"] == len(d["users"])
        # Should NOT leak password_hash
        for u in d["users"]:
            assert "password_hash" not in u

    def test_users_search_by_email(self, admin_token, normal_user):
        r = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers=H(admin_token),
            params={"q": normal_user["email"][:10]},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        emails = [u["email"] for u in d["users"]]
        assert normal_user["email"] in emails

    def test_users_search_admin_by_name(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers=H(admin_token),
            params={"q": "Passaroo Admin"},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert any(u["email"] == ADMIN_EMAIL for u in d["users"])

    def test_users_non_admin_403(self, normal_user):
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=H(normal_user["token"]), timeout=15)
        assert r.status_code == 403


# ===================== PATCH /admin/users/{id} =====================
class TestAdminUserUpdate:
    def test_update_plan_free_to_premium(self, admin_token, normal_user):
        r = requests.patch(
            f"{BASE_URL}/api/admin/users/{normal_user['user_id']}",
            headers=H(admin_token),
            json={"plan": "premium"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["user"]["plan"] == "premium"

    def test_update_plan_invalid_400(self, admin_token, normal_user):
        r = requests.patch(
            f"{BASE_URL}/api/admin/users/{normal_user['user_id']}",
            headers=H(admin_token),
            json={"plan": "ultra"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_ban_user_deletes_sessions(self, admin_token):
        # create a throwaway user, then ban them
        suffix = uuid.uuid4().hex[:8]
        email = f"phase4-ban-{suffix}@passaroo.app"
        r = requests.post(
            f"{BASE_URL}/api/auth/email/signup",
            json={"email": email, "password": "TestPass123!", "name": "Ban Me"},
            timeout=15,
        )
        assert r.status_code == 200
        token = r.json()["session_token"]
        uid = r.json()["user"]["user_id"]

        # Sanity: token works
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=H(token), timeout=15)
        assert me.status_code == 200

        # Ban
        r = requests.patch(
            f"{BASE_URL}/api/admin/users/{uid}",
            headers=H(admin_token), json={"banned": True}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["user"].get("banned") is True

        # Token should now be invalid (sessions wiped)
        me2 = requests.get(f"{BASE_URL}/api/auth/me", headers=H(token), timeout=15)
        assert me2.status_code == 401

    def test_update_user_non_admin_403(self, normal_user):
        r = requests.patch(
            f"{BASE_URL}/api/admin/users/{normal_user['user_id']}",
            headers=H(normal_user["token"]),
            json={"plan": "pro"},
            timeout=15,
        )
        assert r.status_code == 403


# ===================== Questions CRUD =====================
class TestAdminQuestionsCRUD:
    def test_add_question_autofills_family_and_state(self, admin_token):
        body = {
            "category_id": "dkt_vic",
            "topic": "TEST_topic",
            "difficulty": "easy",
            "question": "TEST_What is the VIC default speed limit in built-up areas?",
            "options": ["40", "50", "60", "70"],
            "correct": 1,
            "explanation": "50 km/h is the urban default in VIC.",
        }
        r = requests.post(f"{BASE_URL}/api/admin/questions", headers=H(admin_token), json=body, timeout=15)
        assert r.status_code == 200, r.text
        q = r.json()["question"]
        assert q["question_id"].startswith("q_")
        # store for later tests BEFORE potentially failing assertions
        TestAdminQuestionsCRUD.q_id = q["question_id"]
        assert q.get("family") == "driving"
        # BUG: state remains None because Pydantic dump includes state=None
        # and server uses setdefault(...) which is a no-op when key exists with None value.
        assert q.get("state") == "VIC", (
            f"state auto-fill BUG: expected 'VIC' but got {q.get('state')!r}. "
            "Server uses doc.setdefault('state', cat.get('state')) but AdminQuestionBody.state "
            "defaults to None and is always present in model_dump()."
        )

    def test_add_question_non_admin_403(self, normal_user):
        r = requests.post(
            f"{BASE_URL}/api/admin/questions",
            headers=H(normal_user["token"]),
            json={
                "category_id": "dkt_nsw", "topic": "x", "question": "q?",
                "options": ["a", "b"], "correct": 0, "explanation": "x",
            },
            timeout=15,
        )
        assert r.status_code == 403

    def test_patch_question_ok(self, admin_token):
        qid = getattr(TestAdminQuestionsCRUD, "q_id", None)
        assert qid, "previous test must have created a question"
        r = requests.patch(
            f"{BASE_URL}/api/admin/questions/{qid}",
            headers=H(admin_token),
            json={"topic": "TEST_updated", "explanation": "Updated explanation"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["question"]["topic"] == "TEST_updated"

    def test_patch_question_correct_out_of_range_400(self, admin_token):
        qid = getattr(TestAdminQuestionsCRUD, "q_id", None)
        r = requests.patch(
            f"{BASE_URL}/api/admin/questions/{qid}",
            headers=H(admin_token),
            json={"options": ["a", "b"], "correct": 5},
            timeout=15,
        )
        assert r.status_code == 400

    def test_delete_question_ok(self, admin_token):
        qid = getattr(TestAdminQuestionsCRUD, "q_id", None)
        r = requests.delete(f"{BASE_URL}/api/admin/questions/{qid}", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["deleted"] == 1


# ===================== Bulk import =====================
class TestBulkImport:
    def test_bulk_import_all_valid(self, admin_token):
        body = {
            "category_id": "dkt_qld",
            "questions": [
                {"topic": "TEST_signs", "question": "What does a red octagon mean?",
                 "options": ["Stop", "Yield", "Go", "Caution"], "correct": 0,
                 "explanation": "A red octagonal sign means STOP."},
                {"topic": "TEST_signs", "question": "What does a yellow triangle warn?",
                 "options": ["Hazard ahead", "Stop", "No entry", "Roundabout"], "correct": 0,
                 "explanation": "Yellow triangle = warning of hazard ahead."},
            ],
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/questions/bulk-import",
            headers=H(admin_token), json=body, timeout=20,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] == 2
        assert d["errors"] == []
        assert d["total_attempted"] == 2

    def test_bulk_import_invalid_category_400(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/questions/bulk-import",
            headers=H(admin_token),
            json={"category_id": "not_a_cat", "questions": []},
            timeout=15,
        )
        assert r.status_code == 400

    def test_bulk_import_partial(self, admin_token):
        body = {
            "category_id": "dkt_nsw",
            "questions": [
                {"topic": "TEST_partial", "question": "Valid Q?",
                 "options": ["a", "b"], "correct": 0, "explanation": "ok"},
                {"topic": "TEST_partial", "question": "Missing correct"},  # missing fields
                {"topic": "TEST_partial", "question": "Bad index",
                 "options": ["a", "b"], "correct": 5, "explanation": "bad"},  # out of range
            ],
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/questions/bulk-import",
            headers=H(admin_token), json=body, timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] == 1
        assert d["total_attempted"] == 3
        assert len(d["errors"]) == 2
        # error structure
        for e in d["errors"]:
            assert "index" in e and "error" in e

    def test_bulk_import_non_admin_403(self, normal_user):
        r = requests.post(
            f"{BASE_URL}/api/admin/questions/bulk-import",
            headers=H(normal_user["token"]),
            json={"category_id": "dkt_nsw", "questions": []},
            timeout=15,
        )
        assert r.status_code == 403


# ===================== AI prompt updates =====================
class TestAIPrompts:
    """Each AI endpoint hit exactly once to limit LLM cost."""

    def test_ai_explain_returns_text(self, admin_token):
        body = {
            "question": "What does a red traffic light mean?",
            "options": ["Go", "Stop", "Slow down", "Speed up"],
            "correct_index": 1,
            "user_answer_index": 0,
        }
        r = requests.post(f"{BASE_URL}/api/ai/explain", headers=H(admin_token), json=body, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        text = d["explanation"]
        assert isinstance(text, str) and len(text) > 20
        # Best-effort: should mention at least one structured cue word
        lower = text.lower()
        hits = sum(any(kw in lower for kw in keys) for keys in
                   [("why",), ("common", "mistake"), ("memory", "tip", "mnemonic")])
        assert hits >= 1, f"Explain response missing structured cues: {text!r}"

    def test_ai_tutor_admin_unlimited(self, admin_token):
        body = {
            "session_id": f"phase4_tutor_{uuid.uuid4().hex[:8]}",
            "message": "Hi! What's the speed limit in a NSW school zone?",
            "category_id": "dkt_nsw",
        }
        r = requests.post(f"{BASE_URL}/api/ai/tutor", headers=H(admin_token), json=body, timeout=60)
        assert r.status_code == 200, r.text
        reply = r.json()["reply"]
        assert isinstance(reply, str) and len(reply) > 10

    def test_ai_flashcards_parses_pairs(self, admin_token):
        body = {
            "category_id": "dkt_nsw",
            "wrong_topics": ["speed limits", "road signs"],
            "count": 3,
        }
        r = requests.post(f"{BASE_URL}/api/ai/flashcards", headers=H(admin_token), json=body, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "cards" in d and "raw" in d
        assert len(d["cards"]) >= 3, f"Expected >=3 cards, got {len(d['cards'])}; raw={d['raw'][:300]}"
        for c in d["cards"]:
            assert c["front"] and c["back"]
            assert "card_id" in c
