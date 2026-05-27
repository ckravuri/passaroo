"""
Phase-3 backend tests for Passaroo:
- 14 categories across 3 families
- GET /api/exams/categories includes families[] array
- GET /api/exams/families returns 3 families (driving=8, citizenship=1, work_license=5)
- Each new category has working questions endpoint and topics endpoint
- PATCH /api/user/profile: state validation + auto primary_category_id + primary_category_id update
- Legacy "dkt" migration (no questions left with category_id='dkt')
- 14 mock exam IDs work end-to-end: GET /exams/{id}/questions + POST /exams/attempts
"""
import os
import uuid
import pytest
import requests

BASE_URL = "https://ai-study-companion-30.preview.emergentagent.com"
API = f"{BASE_URL}/api"

RUN_ID = uuid.uuid4().hex[:8]
USER_EMAIL = f"phase3+{RUN_ID}@passaroo.app"
USER_PASSWORD = "Demo1234!"

ALL_14 = [
    "dkt_nsw", "dkt_vic", "dkt_qld", "dkt_wa", "dkt_sa", "dkt_act", "dkt_tas", "dkt_nt",
    "citizenship", "rsa", "white_card", "rcg", "security", "forklift",
]
NEW_11 = [
    "dkt_vic", "dkt_qld", "dkt_wa", "dkt_sa", "dkt_act", "dkt_tas", "dkt_nt",
    "white_card", "rcg", "security", "forklift",
]


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def user_token(session):
    body = {"email": USER_EMAIL, "password": USER_PASSWORD, "name": "Phase3"}
    r = session.post(f"{API}/auth/email/signup", json=body)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def auth(user_token):
    return {"Authorization": f"Bearer {user_token}"}


# ---------- Categories: 14 + families[] ----------
def test_categories_returns_14_with_family_and_state(session):
    r = session.get(f"{API}/exams/categories")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "categories" in d and "families" in d
    cats = d["categories"]
    assert len(cats) == 14, f"expected 14, got {len(cats)}: {[c['id'] for c in cats]}"
    ids = {c["id"] for c in cats}
    for cid in ALL_14:
        assert cid in ids, f"missing category {cid}"
    # family + state present
    for c in cats:
        assert "family" in c, c
        if c["family"] == "driving":
            assert c["state"] in {"NSW", "VIC", "QLD", "WA", "SA", "ACT", "TAS", "NT"}
        else:
            assert c.get("state") is None or c.get("state") == ""
    # families array
    fam_ids = {f["id"] for f in d["families"]}
    assert fam_ids == {"driving", "citizenship", "work_license"}


# ---------- Families endpoint ----------
def test_families_endpoint_grouping(session):
    r = session.get(f"{API}/exams/families")
    assert r.status_code == 200, r.text
    fams = r.json()["families"]
    assert len(fams) == 3
    by_id = {f["id"]: f for f in fams}
    assert len(by_id["driving"]["categories"]) == 8
    assert len(by_id["citizenship"]["categories"]) == 1
    assert len(by_id["work_license"]["categories"]) == 5
    # driving cats all start with dkt_
    for c in by_id["driving"]["categories"]:
        assert c["id"].startswith("dkt_")
        assert c["state"] is not None


# ---------- Question banks: >=10 each + topics endpoint ----------
@pytest.mark.parametrize("cid", NEW_11)
def test_topics_endpoint_per_new_category(session, auth, cid):
    rt = session.get(f"{API}/exams/{cid}/topics", headers=auth)
    assert rt.status_code == 200, f"{cid}: {rt.status_code} {rt.text}"
    topics = rt.json()["topics"]
    total = sum(t["count"] for t in topics)
    assert total >= 10, f"{cid} has only {total} questions"


def test_legacy_dkt_has_no_questions_after_migration(session, auth):
    r = session.get(f"{API}/exams/dkt/topics", headers=auth)
    # Either 404 (category not found) OR returns 0 topics — both are acceptable
    if r.status_code == 200:
        topics = r.json()["topics"]
        total = sum(t["count"] for t in topics)
        assert total == 0, f"legacy dkt still has {total} questions"
    else:
        assert r.status_code == 404


# ---------- PATCH /user/profile ----------
def test_profile_patch_state_VIC_auto_sets_primary(session, auth):
    # User was just created with no state — patch to VIC
    r = session.patch(f"{API}/user/profile", json={"state": "VIC"}, headers=auth)
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["state"] == "VIC"
    assert u["primary_category_id"] == "dkt_vic"


def test_profile_patch_state_lowercase_normalised(session, auth):
    r = session.patch(f"{API}/user/profile", json={"state": "qld"}, headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["state"] == "QLD"
    assert r.json()["user"]["primary_category_id"] == "dkt_qld"


def test_profile_patch_invalid_state_400(session, auth):
    r = session.patch(f"{API}/user/profile", json={"state": "ZZ"}, headers=auth)
    assert r.status_code == 400


def test_profile_patch_primary_category_forklift(session, auth):
    r = session.patch(f"{API}/user/profile",
                      json={"primary_category_id": "forklift"}, headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["primary_category_id"] == "forklift"


def test_profile_patch_invalid_primary_category_400(session, auth):
    r = session.patch(f"{API}/user/profile",
                      json={"primary_category_id": "nope"}, headers=auth)
    assert r.status_code == 400


def test_profile_patch_state_does_not_overwrite_non_dkt_primary(session, auth):
    # Currently primary is 'forklift' (from previous test in module order). State change must NOT reset it.
    r = session.patch(f"{API}/user/profile", json={"state": "NSW"}, headers=auth)
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["state"] == "NSW"
    # Since primary was forklift (not a dkt_), state change should keep it
    assert u["primary_category_id"] == "forklift", u


# ---------- End-to-end: all 14 mock exams ----------
@pytest.fixture(scope="module")
def fresh_user_token(session):
    """Separate user for repeated exam attempts (to avoid weekly limit interactions on the parametrised user)."""
    body = {
        "email": f"phase3-attempts+{RUN_ID}@passaroo.app",
        "password": USER_PASSWORD,
        "name": "Phase3Attempts",
    }
    r = session.post(f"{API}/auth/email/signup", json=body)
    assert r.status_code == 200, r.text
    tok = r.json()["session_token"]
    # Make the user premium so they can run 14 exams in a row
    h = {"Authorization": f"Bearer {tok}"}
    session.post(f"{API}/user/plan", json={"plan": "pro"}, headers=h)
    return tok


@pytest.mark.parametrize("cid", ALL_14)
def test_exam_questions_and_submit_each_category(session, fresh_user_token, cid):
    h = {"Authorization": f"Bearer {fresh_user_token}"}
    # Get expected exam size from category metadata
    rc = session.get(f"{API}/exams/categories")
    cat = next(c for c in rc.json()["categories"] if c["id"] == cid)
    expected = cat["total_questions_in_exam"]

    rq = session.get(f"{API}/exams/{cid}/questions", headers=h)
    assert rq.status_code == 200, f"{cid}: {rq.status_code} {rq.text}"
    qs = rq.json()["questions"]
    assert len(qs) == expected, f"{cid}: got {len(qs)} expected {expected}"
    qids = [q["question_id"] for q in qs]

    body = {
        "category_id": cid,
        "question_ids": qids,
        "answers": [0] * len(qids),
        "time_taken_seconds": 30,
    }
    sr = session.post(f"{API}/exams/attempts", json=body, headers=h)
    assert sr.status_code == 200, f"{cid}: submit failed {sr.status_code} {sr.text}"
    d = sr.json()
    assert "attempt_id" in d
    assert "correct_count" in d
    assert "pass_probability" in d
    assert "passed" in d
    assert "review" in d and len(d["review"]) == expected
    # correct_count must equal number of items in review marked is_correct
    review_correct = sum(1 for r in d["review"] if r.get("is_correct"))
    assert d["correct_count"] == review_correct
