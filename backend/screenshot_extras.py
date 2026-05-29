"""
Capture extra screenshots (login + 4 exam screens) across all devices.

Devices:
  • iphone_6_5   (1284 x 2778) - iOS UA -> Apple Sign-In visible
  • ipad_13      (2064 x 2752) - iOS UA -> Apple Sign-In visible
  • android_phone  (1080 x 1920) - Android UA -> No Apple button
  • android_tablet (1600 x 2560) - Android UA -> No Apple button

Output to /tmp/passaroo_screenshots/<device>__<slug>.png
"""
import asyncio
import json
import sys
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright

FRONTEND = "http://localhost:3000"
BACKEND = "http://localhost:8001"
ADMIN_EMAIL = "admin@passaroo.app"
ADMIN_PASS = "Passaroo!Admin2026"

OUT_DIR = Path("/tmp/passaroo_screenshots")
OUT_DIR.mkdir(parents=True, exist_ok=True)

EXAMS = [
    ("dkt_nsw",      "10_exam_driving"),
    ("citizenship",  "11_exam_citizenship"),
    ("forklift",     "12_exam_forklift"),
    ("rsa",          "13_exam_rsa"),
]

# (device_name, (canvas_w, canvas_h), is_ios)
DEVICES = [
    ("iphone_6_5",     (1284, 2778), True),
    ("ipad_13",        (2064, 2752), True),
    ("android_phone",  (1080, 1920), False),
    ("android_tablet", (1600, 2560), False),
]


async def ensure_pro_tier():
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


async def login(page):
    await page.goto(f"{FRONTEND}/login", wait_until="networkidle", timeout=30000)
    await page.wait_for_timeout(2500)
    # Retry up to 3 times in case form isn't ready on first try
    last_err = None
    for attempt in range(3):
        try:
            await page.fill('[data-testid="auth-email"]', ADMIN_EMAIL, timeout=5000)
            await page.fill('[data-testid="auth-password"]', ADMIN_PASS, timeout=5000)
            await page.click('[data-testid="auth-submit"]', timeout=5000)
            # Wait for either redirect away from /login OR a 200-OK auth event
            try:
                await page.wait_for_url(lambda u: "/login" not in u, timeout=8000)
                print(f"      ✓ login redirected -> {page.url[:60]}")
                await page.wait_for_timeout(2500)
                return True
            except Exception:
                await page.wait_for_timeout(3000)
                if "/login" not in page.url:
                    return True
                last_err = f"still on /login after submit (attempt {attempt+1})"
                print(f"      ! {last_err}, retrying...")
                # Press Enter as fallback
                try:
                    await page.locator('[data-testid="auth-password"]').press("Enter")
                    await page.wait_for_timeout(4000)
                    if "/login" not in page.url:
                        return True
                except Exception:
                    pass
        except Exception as e:
            last_err = str(e)
            print(f"      ! login attempt {attempt+1}: {e}")
            await page.wait_for_timeout(1500)
    print(f"      ✗ login FAILED after 3 attempts: {last_err}")
    return False


async def capture_login(page, device_name):
    target = OUT_DIR / f"{device_name}__00_login.png"
    print(f"    · {device_name}__00_login")
    try:
        await page.context.clear_cookies()
        await page.evaluate("() => { try { localStorage.clear(); } catch(e){} }")
    except Exception:
        pass
    await page.goto(f"{FRONTEND}/login", wait_until="networkidle", timeout=25000)
    await page.wait_for_timeout(4000)
    try:
        await page.evaluate("window.scrollTo(0,0)")
    except Exception:
        pass
    await page.screenshot(path=str(target), type="png")
    print(f"      ✓ saved {target.name}")


async def capture_exam(page, device_name, category_id, slug):
    target = OUT_DIR / f"{device_name}__{slug}.png"
    url = f"{FRONTEND}/exam/{category_id}"
    print(f"    · {device_name}__{slug}")

    # Verify token is in storage BEFORE navigating to exam page.
    # On Android UA the JS engine can race storage reads, so we verify.
    for _ in range(10):
        try:
            has_token = await page.evaluate(
                """async () => {
                    try {
                        const v = await (window.AsyncStorage?.getItem?.('passaroo_session_token'));
                        if (v) return true;
                    } catch (e) {}
                    // Fallback: scan IndexedDB via AsyncStorage default key
                    try {
                        return new Promise((res) => {
                            const req = indexedDB.open('AsyncStorage');
                            req.onsuccess = () => {
                                try {
                                    const db = req.result;
                                    const tx = db.transaction('keyvaluepairs', 'readonly');
                                    const store = tx.objectStore('keyvaluepairs');
                                    const g = store.get('passaroo_session_token');
                                    g.onsuccess = () => res(!!g.result);
                                    g.onerror = () => res(false);
                                } catch { res(false); }
                            };
                            req.onerror = () => res(false);
                        });
                    } catch (e) { return false; }
                }"""
            )
            if has_token:
                break
        except Exception:
            pass
        await page.wait_for_timeout(500)

    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    # Wait longer for questions to load (api call + render)
    await page.wait_for_timeout(8000)
    try:
        await page.evaluate("window.scrollTo(0,0)")
    except Exception:
        pass
    await page.wait_for_timeout(500)
    await page.screenshot(path=str(target), type="png")
    print(f"      ✓ saved {target.name}")


async def capture_device(browser, name, viewport, is_ios, only=None):
    print(f"\n=== {name} ({viewport[0]}×{viewport[1]}) ===")
    ctx = await browser.new_context(
        viewport={"width": viewport[0] // 2, "height": viewport[1] // 2},
        device_scale_factor=2,
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
            "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            if is_ios else
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
        ),
    )
    page = await ctx.new_page()

    # Login screen (logged out)
    await capture_login(page, name)

    # Login as admin, then capture exam pages
    print(f"  → logging in as admin (device={name})...")
    try:
        await login(page)
    except Exception as e:
        print(f"    ! login failed: {e}")

    for cat_id, slug in EXAMS:
        if only and slug not in only:
            continue
        try:
            await capture_exam(page, name, cat_id, slug)
        except Exception as e:
            print(f"      ✗ {slug}: {e}")

    await ctx.close()


async def main():
    await ensure_pro_tier()

    # Optional device filter from CLI: python screenshot_extras.py ipad_13 android_phone
    requested = [a for a in sys.argv[1:] if not a.startswith("--")]
    devices = [d for d in DEVICES if not requested or d[0] in requested]

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        for name, viewport, is_ios in devices:
            await capture_device(browser, name, viewport, is_ios)
        await browser.close()

    print("\n✅ All extras captured.")


if __name__ == "__main__":
    asyncio.run(main())
