"""
Passaroo backend API tests — covers auth, exams, AI, admin, plan, weekly limits.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = "https://ai-study-companion-30.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@passaroo.app"
ADMIN_PASSWORD = "Passaroo!Admin2026"

# unique email per run
RUN_ID = uuid.uuid4().hex[:8]
TEST_EMAIL = f"demo+{RUN_ID}@passaroo.app"
TEST_PASSWORD = "Demo1234!"
TEST_NAME = "Demo"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def state():
    """Shared mutable state across tests."""
    return {}


# ---------------- Health ----------------
def test_health(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("status") == "ok"
    assert data.get("app") == "Passaroo"


# ---------------- Categories ----------------
def test_categories(session):
    r = session.get(f"{API}/exams/categories")
    assert r.status_code == 200, r.text
    cats = r.json()["categories"]
    ids = {c["id"] for c in cats}
    assert {"dkt", "citizenship", "rsa"}.issubset(ids), f"Got: {ids}"
    for c in cats:
        assert c["question_bank_size"] >= 25, f"{c['id']} bank size {c['question_bank_size']}"


# ---------------- Auth: Signup ----------------
def test_signup(session, state):
    body = {"email": TEST_EMAIL, "password": TEST_PASSWORD, "name": TEST_NAME}
    r = session.post(f"{API}/auth/email/signup", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "session_token" in d
    assert d["user"]["email"] == TEST_EMAIL.lower()
    assert d["user"]["plan"] == "free"
    assert "password_hash" not in d["user"]
    state["user_token"] = d["session_token"]
    state["user_id"] = d["user"]["user_id"]


def test_signup_duplicate(session):
    body = {"email": TEST_EMAIL, "password": TEST_PASSWORD, "name": TEST_NAME}
    r = session.post(f"{API}/auth/email/signup", json=body)
    assert r.status_code == 400, r.text


# ---------------- Auth: Login ----------------
def test_login_success(session, state):
    r = session.post(f"{API}/auth/email/login",
                     json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "session_token" in d
    # NOTE: issue_session deletes old sessions — refresh stored token
    state["user_token"] = d["session_token"]


def test_login_wrong_password(session):
    r = session.post(f"{API}/auth/email/login",
                     json={"email": TEST_EMAIL, "password": "WrongPass!"})
    assert r.status_code == 401, r.text


# ---------------- Auth: Me ----------------
def test_me_with_token(session, state):
    r = session.get(f"{API}/auth/me",
                    headers={"Authorization": f"Bearer {state['user_token']}"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["email"] == TEST_EMAIL.lower()
    assert "limits" in d


def test_me_without_token(session):
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401, r.text


# ---------------- Exams: questions leak check ----------------
def test_dkt_questions_no_leak(session, state):
    r = session.get(f"{API}/exams/dkt/questions",
                    headers={"Authorization": f"Bearer {state['user_token']}"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["category"]["id"] == "dkt"
    assert len(d["questions"]) > 0
    for q in d["questions"]:
        assert "correct" not in q, f"correct leaked: {q}"
        assert "explanation" not in q, f"explanation leaked: {q}"
    state["dkt_questions"] = d["questions"]


# ---------------- Exams: Submit attempt ----------------
def test_submit_attempt(session, state):
    qs = state["dkt_questions"]
    qids = [q["question_id"] for q in qs]
    body = {
        "category_id": "dkt",
        "question_ids": qids,
        "answers": [0] * len(qids),
        "time_taken_seconds": 120,
    }
    r = session.post(f"{API}/exams/attempts", json=body,
                     headers={"Authorization": f"Bearer {state['user_token']}"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "score_percent" in d
    assert "weak_topics" in d
    assert "xp_gained" in d
    assert "review" in d
    assert isinstance(d["review"], list)


def test_my_attempts(session, state):
    r = session.get(f"{API}/exams/attempts/me",
                    headers={"Authorization": f"Bearer {state['user_token']}"})
    assert r.status_code == 200, r.text
    arr = r.json()["attempts"]
    assert len(arr) >= 1


def test_user_stats(session, state):
    r = session.get(f"{API}/user/stats",
                    headers={"Authorization": f"Bearer {state['user_token']}"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "dkt" in d["by_category"]
    assert "weak_topics_top" in d
    assert "streak_days" in d["user"]


# ---------------- AI Tutor free-tier denial ----------------
def test_ai_tutor_free_402(session, state):
    body = {"session_id": f"sess_{RUN_ID}", "message": "Hi"}
    r = session.post(f"{API}/ai/tutor", json=body,
                     headers={"Authorization": f"Bearer {state['user_token']}"})
    assert r.status_code == 402, r.text


# ---------------- Plan upgrade ----------------
def test_upgrade_to_premium(session, state):
    r = session.post(f"{API}/user/plan", json={"plan": "premium"},
                     headers={"Authorization": f"Bearer {state['user_token']}"})
    assert r.status_code == 200, r.text
    assert r.json()["plan"] == "premium"
    r2 = session.get(f"{API}/auth/me",
                     headers={"Authorization": f"Bearer {state['user_token']}"})
    assert r2.json()["user"]["plan"] == "premium"


# ---------------- AI explain (Gemini, allow 502 as warning) ----------------
def test_ai_explain(session, state):
    body = {
        "question": "What does a red octagonal STOP sign mean?",
        "options": ["Slow", "Stop completely", "Give way", "No entry"],
        "correct_index": 1,
        "user_answer_index": 0,
    }
    r = session.post(f"{API}/ai/explain", json=body, timeout=45,
                     headers={"Authorization": f"Bearer {state['user_token']}"})
    if r.status_code == 502:
        pytest.skip(f"Upstream Gemini error (502): {r.text}")
    assert r.status_code == 200, r.text
    assert "explanation" in r.json()
    assert len(r.json()["explanation"]) > 0


# ---------------- AI tutor (premium) ----------------
def test_ai_tutor_premium(session, state):
    body = {"session_id": f"tutor_{RUN_ID}", "message": "Give me one DKT study tip.",
            "category_id": "dkt"}
    r = session.post(f"{API}/ai/tutor", json=body, timeout=45,
                     headers={"Authorization": f"Bearer {state['user_token']}"})
    if r.status_code == 502:
        pytest.skip(f"Upstream Gemini error (502): {r.text}")
    assert r.status_code == 200, r.text
    assert "reply" in r.json()


# ---------------- Weekly exam limit (free user, 3rd call → 429) ----------------
def test_weekly_exam_limit(session, state):
    # downgrade back to free
    r = session.post(f"{API}/user/plan", json={"plan": "free"},
                     headers={"Authorization": f"Bearer {state['user_token']}"})
    assert r.status_code == 200
    headers = {"Authorization": f"Bearer {state['user_token']}"}

    # User already submitted 1 attempt (test_submit_attempt) — increments weekly counter to 1.
    # As free (2 exams/week): 1st GET ok, 2nd GET ok (used=1), 3rd GET should 429 (used=2)
    # Submit one more to reach used=2
    qs_resp = session.get(f"{API}/exams/dkt/questions", headers=headers)
    assert qs_resp.status_code == 200, qs_resp.text
    qs = qs_resp.json()["questions"]
    submit = session.post(f"{API}/exams/attempts",
                          json={"category_id": "dkt",
                                "question_ids": [q["question_id"] for q in qs],
                                "answers": [0] * len(qs),
                                "time_taken_seconds": 60},
                          headers=headers)
    assert submit.status_code == 200, submit.text

    # Now used=2 -> next GET should 429
    third = session.get(f"{API}/exams/dkt/questions", headers=headers)
    assert third.status_code == 429, f"Expected 429, got {third.status_code}: {third.text}"


# ---------------- Admin login ----------------
def test_admin_login(session, state):
    r = session.post(f"{API}/auth/email/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["is_admin"] is True
    state["admin_token"] = d["session_token"]


def test_admin_analytics(session, state):
    r = session.get(f"{API}/admin/analytics",
                    headers={"Authorization": f"Bearer {state['admin_token']}"})
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("total_users", "total_questions", "total_attempts", "by_plan"):
        assert k in d


def test_admin_add_question(session, state):
    body = {
        "category_id": "dkt",
        "topic": "Test",
        "difficulty": "easy",
        "question": "TEST_Q What colour is a stop sign?",
        "options": ["Red", "Blue", "Green", "Yellow"],
        "correct": 0,
        "explanation": "Stop signs are red.",
    }
    r = session.post(f"{API}/admin/questions", json=body,
                     headers={"Authorization": f"Bearer {state['admin_token']}"})
    assert r.status_code == 200, r.text
    q = r.json()["question"]
    assert "question_id" in q
    state["admin_q_id"] = q["question_id"]


def test_non_admin_forbidden(session, state):
    # use regular user token (still valid)
    r = session.get(f"{API}/admin/analytics",
                    headers={"Authorization": f"Bearer {state['user_token']}"})
    assert r.status_code == 403, r.text


# ---------------- Logout invalidates session ----------------
def test_logout(session, state):
    tok = state["user_token"]
    r = session.post(f"{API}/auth/logout",
                     headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200, r.text
    # subsequent me should 401
    me = session.get(f"{API}/auth/me",
                     headers={"Authorization": f"Bearer {tok}"})
    assert me.status_code == 401, me.text


# ---------------- Cleanup ----------------
def test_cleanup_admin_question(session, state):
    qid = state.get("admin_q_id")
    if not qid:
        pytest.skip("no admin question created")
    r = session.delete(f"{API}/admin/questions/{qid}",
                       headers={"Authorization": f"Bearer {state['admin_token']}"})
    assert r.status_code == 200
