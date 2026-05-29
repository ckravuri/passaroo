"""Re-capture just the paywall screens with the YEARLY tab toggled."""
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


async def login(page):
    await page.goto(f"{FRONTEND}/login", wait_until="networkidle", timeout=30000)
    await page.wait_for_timeout(1200)
    try:
        await page.fill('input[type="email"], input[placeholder*="email" i]', ADMIN_EMAIL, timeout=4000)
        await page.fill('input[type="password"], input[placeholder*="password" i]', ADMIN_PASS, timeout=4000)
        # Press Enter on password field (works on most login forms)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(3000)
    except Exception as e:
        print(f"  ! login exception: {e}")
    return "/login" not in page.url


async def grab_yearly(name, viewport, is_ios, browser):
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
    await login(page)
    # Open paywall
    await page.goto(f"{FRONTEND}/paywall", wait_until="domcontentloaded", timeout=25000)
    await page.wait_for_timeout(2500)
    # Click the Yearly toggle (text contains "Yearly")
    try:
        await page.locator('text=/yearly.*save 20|^yearly/i').first.click(timeout=4000)
        await page.wait_for_timeout(800)
    except Exception as e:
        print(f"  ! yearly toggle click failed for {name}: {e}")
    target = OUT_DIR / f"{name}__03d_paywall_yearly.png"
    await page.screenshot(path=str(target), full_page=False, type="png")
    print(f"  ✓ saved {target.name}")
    await ctx.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        for name, vp, ios in DEVICES:
            print(f"=== {name} ({vp[0]}×{vp[1]}) ===")
            await grab_yearly(name, vp, ios, browser)
        await browser.close()
    print("\n✅ Yearly paywall screenshots done.")


if __name__ == "__main__":
    asyncio.run(main())
