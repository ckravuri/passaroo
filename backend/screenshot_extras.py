"""
Capture additional iPhone 6.5" screenshots for App Store:
  • Re-capture login with Apple Sign-In visible
  • Exam-in-progress for 4 categories: DKT (driving), Citizenship, Forklift, RSA

Output: /tmp/passaroo_screenshots/iphone_6_5__<slug>.png at 1284x2778
"""
import asyncio
import json
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright

FRONTEND = "http://localhost:3000"
BACKEND = "http://localhost:8001"
ADMIN_EMAIL = "admin@passaroo.app"
ADMIN_PASS = "Passaroo!Admin2026"

OUT_DIR = Path("/tmp/passaroo_screenshots")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Exam screens to capture (category_id, output_slug)
EXAMS = [
    ("dkt_nsw",      "10_exam_driving"),
    ("citizenship",  "11_exam_citizenship"),
    ("forklift",     "12_exam_forklift"),
    ("rsa",          "13_exam_rsa"),
]


async def ensure_pro_tier():
    """Login admin and set PRO + NSW state."""
    req = urllib.request.Request(
        f"{BACKEND}/api/auth/email/login",
        data=json.dumps({"email": ADMIN_EMAIL, "password": ADMIN_PASS}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        token = json.loads(r.read())["session_token"]
    for endpoint, body, method in [
        ("/api/user/plan", {"plan": "pro"}, "POST"),
        ("/api/user/profile", {"state": "NSW"}, "PATCH"),
    ]:
        req2 = urllib.request.Request(
            f"{BACKEND}{endpoint}",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
            method=method,
        )
        try:
            urllib.request.urlopen(req2).read()
        except Exception as e:
            print(f"  ! {endpoint}: {e}")
    print("  ✓ Admin set to PRO + NSW")


async def login(page):
    await page.goto(f"{FRONTEND}/login", wait_until="networkidle", timeout=30000)
    await page.wait_for_timeout(2000)
    await page.fill('[data-testid="auth-email"]', ADMIN_EMAIL, timeout=4000)
    await page.fill('[data-testid="auth-password"]', ADMIN_PASS, timeout=4000)
    await page.click('[data-testid="auth-submit"]', timeout=4000)
    await page.wait_for_timeout(4500)


async def capture_login(page):
    """Re-capture login showing Apple Sign-In (logged-out)."""
    target = OUT_DIR / "iphone_6_5__00_login.png"
    print(f"    · 00_login (with Apple Sign-In) → /login")
    # Clear any session
    try:
        await page.context.clear_cookies()
        await page.evaluate("() => { try { localStorage.clear(); } catch(e){} }")
    except Exception:
        pass
    await page.goto(f"{FRONTEND}/login", wait_until="networkidle", timeout=25000)
    await page.wait_for_timeout(4000)
    # Force visibility by scrolling so Apple button is in shot
    try:
        await page.evaluate("window.scrollTo(0,0)")
    except Exception:
        pass
    await page.screenshot(path=str(target), type="png")
    print(f"      ✓ saved {target.name}")


async def capture_exam(page, category_id: str, slug: str):
    """Navigate to /exam/<id>, wait for first question to render, capture."""
    target = OUT_DIR / f"iphone_6_5__{slug}.png"
    url = f"{FRONTEND}/exam/{category_id}"
    print(f"    · {slug} → {url}")
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    # Wait for question content to load (network/API call) and avoid loading spinner
    await page.wait_for_timeout(6000)
    try:
        await page.evaluate("window.scrollTo(0,0)")
    except Exception:
        pass
    await page.wait_for_timeout(500)

    # Try to select the second option to make the screenshot look "in-progress"
    # (highlighted selected state). Use a generic approach.
    try:
        # Find option buttons — they're typically TouchableOpacity rendering letter A/B/C/D
        # Look for buttons containing "A.", "B.", or with role
        opts = page.locator('text=/^B\\./').first
        if await opts.count() > 0:
            await opts.click(timeout=2000)
            await page.wait_for_timeout(700)
    except Exception:
        pass

    await page.screenshot(path=str(target), type="png")
    print(f"      ✓ saved {target.name}")


async def main():
    await ensure_pro_tier()

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        # iPhone 6.5" — 1284x2778 with DPR 2 → viewport 642x1389
        ctx = await browser.new_context(
            viewport={"width": 642, "height": 1389},
            device_scale_factor=2,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
                "Mobile/15E148 Safari/604.1"
            ),
        )
        page = await ctx.new_page()

        # 1) Re-capture login screen with Apple Sign-In visible
        await capture_login(page)

        # 2) Login as admin, then capture exam pages
        print("  → logging in as admin...")
        await login(page)

        for cat_id, slug in EXAMS:
            try:
                await capture_exam(page, cat_id, slug)
            except Exception as e:
                print(f"      ✗ {slug}: {e}")

        await ctx.close()
        await browser.close()

    print("\n✅ Done. New screenshots in /tmp/passaroo_screenshots/")


if __name__ == "__main__":
    asyncio.run(main())
