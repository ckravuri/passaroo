"""
Tests for Passaroo Phase-2 endpoints:
- /api/exams/daily-quiz (GET + POST submit, idempotency, XP)
- /api/exams/{cat}/practice (now exposes correct + explanation)
- /api/exams/{cat}/topics
- /api/exams/retry-wrong (empty + populated)
- /api/bookmarks/{question_id} toggle
"""
import os
import uuid
import pytest
import requests

BASE_URL = "https://ai-study-companion-30.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@passaroo.app"
ADMIN_PASSWORD = "Passaroo!Admin2026"

RUN_ID = uuid.uuid4().hex[:8]
USER_EMAIL = f"phase2+{RUN_ID}@passaroo.app"
USER_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def user_token(session):
    body = {"email": USER_EMAIL, "password": USER_PASSWORD, "name": "Phase2"}
    r = session.post(f"{API}/auth/email/signup", json=body)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def auth(user_token):
    return {"Authorization": f"Bearer {user_token}"}


# ---------- Bookmarks ----------
def test_bookmark_toggle(session, auth):
    # Need a question id — pull from practice
    r = session.get(f"{API}/exams/dkt_nsw/practice?count=1", headers=auth)
    assert r.status_code == 200, r.text
    qid = r.json()["questions"][0]["question_id"]

    # toggle on
    r1 = session.post(f"{API}/bookmarks/{qid}", headers=auth)
    assert r1.status_code == 200, r1.text
    assert r1.json()["bookmarked"] is True

    # list contains it
    rl = session.get(f"{API}/bookmarks", headers=auth)
    assert rl.status_code == 200
    assert any(q["question_id"] == qid for q in rl.json()["bookmarks"])

    # toggle off
    r2 = session.post(f"{API}/bookmarks/{qid}", headers=auth)
    assert r2.status_code == 200, r2.text
    assert r2.json()["bookmarked"] is False


# ---------- Practice now returns correct + explanation ----------
def test_practice_returns_correct_and_explanation(session, auth):
    r = session.get(f"{API}/exams/dkt_nsw/practice?count=5", headers=auth)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "total_pool" in d
    qs = d["questions"]
    assert 1 <= len(qs) <= 5
    for q in qs:
        assert "correct" in q, f"correct missing: {q}"
        assert "explanation" in q, f"explanation missing: {q}"
        assert isinstance(q["correct"], int)
        assert 0 <= q["correct"] < len(q["options"])


def test_practice_with_topic_filter(session, auth):
    # Pick a topic from topics list
    rt = session.get(f"{API}/exams/dkt_nsw/topics", headers=auth)
    assert rt.status_code == 200, rt.text
    topics = rt.json()["topics"]
    assert len(topics) > 0
    # Pick first topic without special chars to avoid url encoding edge cases
    safe = next((x for x in topics if all(c.isalnum() or c == " " for c in x["topic"])), topics[0])
    t = safe["topic"]
    r = session.get(f"{API}/exams/dkt_nsw/practice", params={"topic": t, "count": 5}, headers=auth)
    assert r.status_code == 200, r.text
    for q in r.json()["questions"]:
        assert q["topic"] == t


def test_practice_unknown_filter_404(session, auth):
    r = session.get(f"{API}/exams/dkt_nsw/practice?topic=__nope__", headers=auth)
    assert r.status_code == 404


# ---------- Topics ----------
def test_topics_endpoint(session, auth):
    r = session.get(f"{API}/exams/dkt_nsw/topics", headers=auth)
    assert r.status_code == 200, r.text
    topics = r.json()["topics"]
    assert isinstance(topics, list) and len(topics) > 0
    for t in topics:
        assert "topic" in t and "count" in t


# ---------- Retry-wrong: empty initially ----------
def test_retry_wrong_empty(session, auth):
    r = session.get(f"{API}/exams/retry-wrong", headers=auth)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["count"] == 0
    assert d["questions"] == []


# ---------- Submit an attempt with intentional wrong answers, then retry-wrong populated ----------
def test_retry_wrong_populated_after_wrong_attempt(session, auth):
    # Fetch questions for exam
    qr = session.get(f"{API}/exams/dkt_nsw/questions", headers=auth)
    assert qr.status_code == 200, qr.text
    qs = qr.json()["questions"]
    qids = [q["question_id"] for q in qs]
    # Always answer 0 — guaranteed some wrong
    body = {
        "category_id": "dkt_nsw",
        "question_ids": qids,
        "answers": [0] * len(qids),
        "time_taken_seconds": 60,
    }
    sr = session.post(f"{API}/exams/attempts", json=body, headers=auth)
    assert sr.status_code == 200, sr.text
    review = sr.json()["review"]
    wrong_count = sum(1 for r_ in review if not r_["is_correct"])
    assert wrong_count >= 1

    r = session.get(f"{API}/exams/retry-wrong", headers=auth)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["count"] >= 1
    # Must include correct + explanation
    for q in d["questions"]:
        assert "correct" in q
        assert "explanation" in q


# ---------- Daily quiz GET ----------
def test_daily_quiz_get(session, auth):
    r = session.get(f"{API}/exams/daily-quiz", headers=auth)
    assert r.status_code == 200, r.text
    d = r.json()
    qs = d["questions"]
    assert len(qs) == 10
    for q in qs:
        assert "correct" in q
        assert "explanation" in q
        assert "options" in q and len(q["options"]) >= 2
    assert "date" in d


# ---------- Daily quiz Submit + idempotency ----------
def test_daily_quiz_submit_idempotent_and_xp(session, auth):
    # fetch today's quiz
    r = session.get(f"{API}/exams/daily-quiz", headers=auth)
    assert r.status_code == 200
    qs = r.json()["questions"]
    qids = [q["question_id"] for q in qs]
    answers = [q["correct"] for q in qs]  # all correct -> XP > 0

    # XP before
    before = session.get(f"{API}/auth/me", headers=auth).json()["user"].get("xp", 0)

    s1 = session.post(f"{API}/exams/daily-quiz/submit",
                      json={"question_ids": qids, "answers": answers},
                      headers=auth)
    assert s1.status_code == 200, s1.text
    d1 = s1.json()
    assert d1["correct"] == 10
    assert d1["total"] == 10
    assert d1["already_completed"] is False
    assert d1["xp_gained"] > 0

    after = session.get(f"{API}/auth/me", headers=auth).json()["user"].get("xp", 0)
    assert after >= before + d1["xp_gained"]

    # Second submit same day -> already_completed True, xp_gained 0
    s2 = session.post(f"{API}/exams/daily-quiz/submit",
                      json={"question_ids": qids, "answers": answers},
                      headers=auth)
    assert s2.status_code == 200, s2.text
    d2 = s2.json()
    assert d2["already_completed"] is True
    assert d2["xp_gained"] == 0
