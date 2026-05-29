"""
FINAL screenshot generator for Passaroo — Apple-compliant 6.5" + login + premium.

Devices & exact dimensions:
  • iPhone 6.5" Display (1284 × 2778) — ✅ what Apple Store Connect requires (12/13 Pro Max)
  • iPad 13"          (2064 × 2752)   — Required because supportsTablet: true
  • Android Phone     (1080 × 1920)   — Play Store
  • Android Tablet    (1600 × 2560)   — Play Store

Screens captured per device (10 total):
  00_login, 01_dashboard, 02_select_exam,
  03_paywall_monthly, 03d_paywall_yearly, 03c_paywall_compare,
  04_analytics, 05_tutor, 07_flashcards, 06_profile

Admin user is upgraded to PRO before each device so locked screens show real content.
"""
import asyncio
import shutil
import zipfile
from pathlib import Path

from playwright.async_api import async_playwright

FRONTEND = "http://localhost:3000"
BACKEND  = "http://localhost:8001"
ADMIN_EMAIL = "admin@passaroo.app"
ADMIN_PASS = "Passaroo!Admin2026"

OUT_DIR = Path("/tmp/passaroo_screenshots")

# (slug, after-action-fn, screenshot route, must_be_logged_in)
SCREENS_LOGGED_OUT = [
    ("/login", "00_login", None),  # showcase OAuth buttons
]

SCREENS_LOGGED_IN = [
    ("/(tabs)",                  "01_dashboard",         None),
    ("/select-exam",             "02_select_exam",       None),
    ("/paywall",                 "03_paywall_monthly",   None),
    ("/paywall",                 "03d_paywall_yearly",   "click_yearly"),
    ("/(tabs)/tutor",            "05_tutor",             "seed_tutor_chat"),
    ("/(tabs)/analytics",        "04_analytics",         None),
    ("/flashcards",              "07_flashcards",        None),
    ("/(tabs)/profile",          "06_profile",           None),
]

DEVICES = [
    ("iphone_6_5",     (1284, 2778), True),
    ("ipad_13",        (2064, 2752), True),
    ("android_phone",  (1080, 1920), False),
    ("android_tablet", (1600, 2560), False),
]


async def ensure_pro_tier():
    """Hit backend directly to set admin user back to PRO tier AND set state=NSW."""
    import urllib.request, json
    req = urllib.request.Request(
        f"{BACKEND}/api/auth/email/login",
        data=json.dumps({"email": ADMIN_EMAIL, "password": ADMIN_PASS}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        token = json.loads(r.read())["session_token"]
    # Set plan=pro
    req2 = urllib.request.Request(
        f"{BACKEND}/api/user/plan",
        data=json.dumps({"plan": "pro"}).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(req2) as r:
        print("    PRO upgrade:", r.read()[:80])
    # Set state=NSW so user doesn't get redirected to /select-state on dashboard load
    req3 = urllib.request.Request(
        f"{BACKEND}/api/user/profile",
        data=json.dumps({"state": "NSW"}).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="PATCH",
    )
    with urllib.request.urlopen(req3) as r:
        print("    State set: NSW")


async def login(page):
    await page.goto(f"{FRONTEND}/login", wait_until="networkidle", timeout=30000)
    await page.wait_for_timeout(2000)
    try:
        await page.fill('[data-testid="auth-email"]', ADMIN_EMAIL, timeout=4000)
        await page.fill('[data-testid="auth-password"]', ADMIN_PASS, timeout=4000)
        await page.click('[data-testid="auth-submit"]', timeout=4000)
        await page.wait_for_timeout(4500)
    except Exception as e:
        print(f"  ! login: {e}")
    return "/login" not in page.url


async def action_click_yearly(page):
    try:
        await page.locator('text=/yearly.*save 20|^yearly/i').first.click(timeout=4000)
        await page.wait_for_timeout(1000)
    except Exception as e:
        print(f"      ! yearly toggle: {e}")


async def action_seed_tutor_chat(page):
    """Wait for tutor chat to load, then send a question and wait for AI reply."""
    await page.wait_for_timeout(3500)
    sent = False
    for sel in ['textarea', 'input[placeholder*="ask" i]', 'input[placeholder*="message" i]',
                'input[placeholder*="type" i]', '[contenteditable="true"]']:
        try:
            el = page.locator(sel).first
            if await el.count() > 0 and await el.is_visible():
                await el.fill("Why must you give way to pedestrians at a roundabout in NSW?")
                # Try send button or Enter
                try:
                    await page.locator('button:has-text("Send"), [aria-label*="Send" i]').first.click(timeout=2000)
                except Exception:
                    await page.keyboard.press("Enter")
                sent = True
                print("      ✓ Sent tutor message")
                break
        except Exception:
            continue
    if sent:
        # Wait for Gemini AI response to stream in
        await page.wait_for_timeout(10000)


ACTIONS = {
    "click_yearly": action_click_yearly,
    "seed_tutor_chat": action_seed_tutor_chat,
}


async def capture_device(name, viewport, is_ios, browser):
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

    # ---- Logged-OUT screens first (login page) ----
    for route, slug, action in SCREENS_LOGGED_OUT:
        target = OUT_DIR / f"{name}__{slug}.png"
        try:
            print(f"    · {slug:22s} → {route}")
            await page.goto(f"{FRONTEND}{route}", wait_until="networkidle", timeout=25000)
            await page.wait_for_timeout(3500)
            await page.screenshot(path=str(target), type="png")
        except Exception as e:
            print(f"      ✗ {slug}: {e}")

    # ---- Login & capture protected screens ----
    print("  → logging in…")
    await login(page)

    for route, slug, action in SCREENS_LOGGED_IN:
        target = OUT_DIR / f"{name}__{slug}.png"
        try:
            print(f"    · {slug:22s} → {route}")
            await page.goto(f"{FRONTEND}{route}", wait_until="domcontentloaded", timeout=25000)
            await page.wait_for_timeout(3000)
            try:
                await page.evaluate("window.scrollTo(0,0)")
            except Exception:
                pass
            # Run any special action (yearly toggle, send tutor msg, etc.)
            if action and action in ACTIONS:
                await ACTIONS[action](page)
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(target), type="png")
        except Exception as e:
            print(f"      ✗ {slug}: {e}")

    await ctx.close()


def remove_old_iphone_67():
    """Remove now-stale iphone_6_7 set; Apple wants 6.5"."""
    for f in OUT_DIR.glob("iphone_6_7__*.png"):
        f.unlink()


def make_zips():
    def zip_dir(out, pattern_filter):
        files = sorted([f for f in OUT_DIR.glob("*.png") if pattern_filter(f.name)])
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            for f in files:
                z.write(f, arcname=f.name)
        return len(files), out.stat().st_size

    backend = Path("/app/backend")
    n, sz = zip_dir(backend / "passaroo_screenshots.zip", lambda n: True)
    print(f"📦 Master:  {n} files, {sz // 1024} KB")
    n, sz = zip_dir(backend / "passaroo_ios.zip", lambda n: n.startswith(("iphone_", "ipad_")))
    print(f"📦 iOS:     {n} files, {sz // 1024} KB")
    n, sz = zip_dir(backend / "passaroo_android.zip", lambda n: n.startswith("android_"))
    print(f"📦 Android: {n} files, {sz // 1024} KB")


async def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    remove_old_iphone_67()

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        for name, viewport, is_ios in DEVICES:
            await ensure_pro_tier()  # make sure admin still pro
            await capture_device(name, viewport, is_ios, browser)
        await browser.close()

    make_zips()
    print("\n✅ All done.")


if __name__ == "__main__":
    asyncio.run(main())
