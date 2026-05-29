"""Re-capture screens that benefit from PRO tier (AI Tutor, Analytics, Flashcards)."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

FRONTEND = "http://localhost:3000"
ADMIN_EMAIL = "admin@passaroo.app"
ADMIN_PASS = "Passaroo!Admin2026"
OUT_DIR = Path("/tmp/passaroo_screenshots")

DEVICES = [
    ("iphone_6_7", (1290, 2796), True),
    ("ipad_13",    (2064, 2752), True),
    ("android_phone",  (1080, 1920), False),
    ("android_tablet", (1600, 2560), False),
]

# Premium / Pro screens to capture
PREMIUM_SCREENS = [
    ("/(tabs)/tutor",      "05_tutor"),          # Now shows the actual AI tutor chat
    ("/(tabs)/analytics",  "04_analytics"),      # Now shows advanced analytics (pro)
    ("/flashcards",        "07_flashcards"),     # Pro-tier flashcards
    ("/study-plan",        "08_study_plan"),     # Pro-tier study plan
]


async def login(page):
    await page.goto(f"{FRONTEND}/login", wait_until="networkidle", timeout=30000)
    await page.wait_for_timeout(1500)
    try:
        await page.fill('[data-testid="auth-email"]', ADMIN_EMAIL, timeout=4000)
        await page.fill('[data-testid="auth-password"]', ADMIN_PASS, timeout=4000)
        await page.click('[data-testid="auth-submit"]', timeout=4000)
        await page.wait_for_timeout(4000)
    except Exception as e:
        print(f"  ! login: {e}")
    return "/login" not in page.url


async def seed_tutor_chat(page):
    """Try to start an AI tutor conversation so the chat UI has visible content."""
    try:
        # Look for input field on tutor page
        await page.goto(f"{FRONTEND}/(tabs)/tutor", wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(3000)
        # Try multiple possible input selectors
        input_candidates = [
            'textarea',
            'input[placeholder*="ask" i]',
            'input[placeholder*="message" i]',
            'input[placeholder*="type" i]',
            '[contenteditable="true"]',
        ]
        for sel in input_candidates:
            try:
                el = page.locator(sel).first
                if await el.count() > 0 and await el.is_visible():
                    await el.fill("Why must you give way to pedestrians at a roundabout in NSW?", timeout=3000)
                    # Send button might be next to it
                    try:
                        await page.locator('button:has-text("Send"), button[aria-label*="Send" i], button:has-text("→")').first.click(timeout=2000)
                    except Exception:
                        await page.keyboard.press("Enter")
                    print("    ✓ Sent test message to AI tutor")
                    # Wait for AI response (Gemini takes a few seconds)
                    await page.wait_for_timeout(8000)
                    return True
            except Exception:
                continue
        print("    ⚠️ Could not find tutor input — taking screenshot of starter state")
    except Exception as e:
        print(f"    ! tutor seed failed: {e}")
    return False


async def capture(name, viewport, is_ios, browser):
    ctx = await browser.new_context(
        viewport={"width": viewport[0] // 2, "height": viewport[1] // 2},
        device_scale_factor=2,
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            if is_ios else
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
        ),
    )
    page = await ctx.new_page()
    print(f"  → Login for {name}…")
    await login(page)

    # Seed AI tutor with a message first (so 05_tutor.png shows real chat)
    await seed_tutor_chat(page)

    for route, slug in PREMIUM_SCREENS:
        url = f"{FRONTEND}{route}"
        target = OUT_DIR / f"{name}__{slug}.png"
        try:
            print(f"    · {slug:18s} → {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            await page.wait_for_timeout(3000)
            try:
                await page.evaluate("window.scrollTo(0,0)")
            except Exception:
                pass
            await page.wait_for_timeout(400)
            await page.screenshot(path=str(target), full_page=False, type="png")
        except Exception as e:
            print(f"      ✗ {slug}: {e}")
    await ctx.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        for name, vp, ios in DEVICES:
            print(f"\n=== {name} ({vp[0]}×{vp[1]}) ===")
            await capture(name, vp, ios, browser)
        await browser.close()
    print("\n✅ Premium screenshots done.")


if __name__ == "__main__":
    asyncio.run(main())
