"""
Passaroo screenshot generator — App Store Connect & Google Play sizes.

Generates the official sets:
  • iPhone 6.7" (1290 × 2796) — REQUIRED by Apple
  • iPad 13"   (2064 × 2752) — required because app supports tablets
  • Android Phone (1080 × 1920) — Google Play Store
  • Android Tablet (1600 × 2560) — optional

Each device captures the same screen set:
  01_dashboard, 02_select_exam, 03_paywall, 03b_paywall_pro,
  03c_paywall_compare, 04_analytics, 05_tutor, 06_profile

Login uses admin@passaroo.app / Passaroo!Admin2026 from test_credentials.md.
Outputs to /tmp/passaroo_screenshots/ and zips to /app/backend/passaroo_screenshots.zip
"""
import asyncio
import os
import shutil
import zipfile
from pathlib import Path

from playwright.async_api import async_playwright

FRONTEND = "http://localhost:3000"
ADMIN_EMAIL = "admin@passaroo.app"
ADMIN_PASS = "Passaroo!Admin2026"

OUT_DIR = Path("/tmp/passaroo_screenshots")
ZIP_OUT = Path("/app/backend/passaroo_screenshots.zip")
IOS_ZIP = Path("/app/backend/passaroo_ios_screenshots.zip")
AND_ZIP = Path("/app/backend/passaroo_android_screenshots.zip")

DEVICES = [
    # name, viewport (w, h), device_scale, is_ios
    ("iphone_6_7", (1290, 2796), 1, True),
    ("ipad_13",    (2064, 2752), 1, True),
    ("android_phone",  (1080, 1920), 1, False),
    ("android_tablet", (1600, 2560), 1, False),
]

# (route, slug, after_navigate_action)
SCREENS = [
    ("/(tabs)",                  "01_dashboard",         None),
    ("/select-exam",             "02_select_exam",       None),
    ("/paywall",                 "03_paywall",           None),
    ("/paywall?tier=pro",        "03b_paywall_pro",      None),
    ("/paywall?view=compare",    "03c_paywall_compare",  None),
    ("/(tabs)/analytics",        "04_analytics",         None),
    ("/(tabs)/tutor",            "05_tutor",             None),
    ("/(tabs)/profile",          "06_profile",           None),
]


async def login(page) -> bool:
    """Navigate to login page and authenticate as admin."""
    await page.goto(f"{FRONTEND}/login", wait_until="networkidle", timeout=30000)
    await page.wait_for_timeout(1500)

    # Try the email/password login fields. The login page may have a "Continue with Email"
    # button first that reveals fields.
    try:
        # Try clicking "Sign in with email" if present
        email_toggle = page.locator('text=/sign in with email|continue with email|use email/i').first
        if await email_toggle.count() > 0:
            await email_toggle.click(timeout=2000)
            await page.wait_for_timeout(500)
    except Exception:
        pass

    # Fill email / password inputs by placeholder/label
    try:
        email_in = page.locator('input[type="email"], input[placeholder*="email" i], input[placeholder*="Email" i]').first
        await email_in.fill(ADMIN_EMAIL, timeout=5000)
        pass_in = page.locator('input[type="password"], input[placeholder*="password" i]').first
        await pass_in.fill(ADMIN_PASS, timeout=5000)
        # Click sign-in button
        btn = page.locator('button:has-text("Sign In"), button:has-text("Log In"), button:has-text("Login"), text=/^Sign In$|^Log In$|^Login$/i').first
        await btn.click(timeout=5000)
        await page.wait_for_timeout(3500)
        # Check we ended up logged in: URL changed away from /login
        cur = page.url
        if "/login" in cur:
            # Maybe the button label was different — try any visible "Sign" button
            try:
                await page.click('button:has-text("Sign")', timeout=2000)
                await page.wait_for_timeout(3000)
            except Exception:
                pass
        return "/login" not in page.url
    except Exception as e:
        print(f"  ! Login flow had an exception: {e}")
        return False


async def capture_for_device(name, viewport, scale, is_ios, browser):
    out_subdir = OUT_DIR
    out_subdir.mkdir(parents=True, exist_ok=True)

    context = await browser.new_context(
        viewport={"width": viewport[0] // 2, "height": viewport[1] // 2},  # render half-size for speed
        device_scale_factor=2,  # then 2x retina → correct final pixel size
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
            "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            if is_ios else
            "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
        ),
    )
    page = await context.new_page()

    print(f"  → Logging in for {name}…")
    ok = await login(page)
    if not ok:
        print(f"  ⚠️  Login may have failed for {name}; will still try to capture (some screens may need auth)")

    # Ensure user has a state set so onboarding doesn't intercept
    try:
        await page.evaluate(f"""
          fetch('{FRONTEND}/api/user/profile', {{
            method: 'PATCH',
            headers: {{
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + (window.__passaroo_token__ || '')
            }},
            body: JSON.stringify({{ state: 'NSW' }})
          }}).catch(() => {{}});
        """)
    except Exception:
        pass

    for route, slug, action in SCREENS:
        url = f"{FRONTEND}{route}"
        target = out_subdir / f"{name}__{slug}.png"
        try:
            print(f"    · {slug}  → {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            await page.wait_for_timeout(2800)
            # Scroll to top to be consistent
            try:
                await page.evaluate("window.scrollTo(0, 0)")
            except Exception:
                pass
            await page.wait_for_timeout(400)
            await page.screenshot(path=str(target), full_page=False, type="png")
        except Exception as e:
            print(f"      ✗ failed {slug}: {e}")

    await context.close()


def make_zips():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Master zip
    with zipfile.ZipFile(ZIP_OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(OUT_DIR.glob("*.png")):
            z.write(f, arcname=f.name)

    # iOS-only zip
    with zipfile.ZipFile(IOS_ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(OUT_DIR.glob("iphone_*.png")):
            z.write(f, arcname=f.name)
        for f in sorted(OUT_DIR.glob("ipad_*.png")):
            z.write(f, arcname=f.name)

    # Android-only zip
    with zipfile.ZipFile(AND_ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(OUT_DIR.glob("android_*.png")):
            z.write(f, arcname=f.name)

    print(f"\n📦 Master:  {ZIP_OUT}  ({ZIP_OUT.stat().st_size // 1024} KB)")
    print(f"📦 iOS:     {IOS_ZIP}  ({IOS_ZIP.stat().st_size // 1024} KB)")
    print(f"📦 Android: {AND_ZIP}  ({AND_ZIP.stat().st_size // 1024} KB)")


async def main():
    # Clear old files
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        for name, viewport, scale, is_ios in DEVICES:
            print(f"\n=== Device: {name} ({viewport[0]}×{viewport[1]}) ===")
            await capture_for_device(name, viewport, scale, is_ios, browser)
        await browser.close()

    make_zips()
    print("\n✅ Done.")


if __name__ == "__main__":
    asyncio.run(main())
