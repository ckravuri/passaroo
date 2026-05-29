"""
Add App Store SEO text overlays to iPhone 6.5" screenshots.
Top banner: bold marketing headline + tagline
Bottom navigation bar is preserved (no overlay there)
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

SRC_DIR = Path("/tmp/passaroo_screenshots")
OUT_DIR = Path("/tmp/passaroo_screenshots_overlay")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Find a usable bold font; PIL falls back gracefully.
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVu-Sans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]
FONT_BOLD = None
for fp in FONT_CANDIDATES:
    if Path(fp).exists():
        FONT_BOLD = fp
        break

OVERLAYS = {
    "00_login": {
        "title": "Sign in your way",
        "sub": "Apple · Google · Microsoft · Email",
        "bg": (255, 95, 31),  # orange
    },
    "01_dashboard": {
        "title": "Pass on your first try",
        "sub": "AI-powered Aussie exam prep",
        "bg": (24, 144, 255),  # blue
    },
    "02_select_exam": {
        "title": "14+ Australian exams",
        "sub": "DKT · Citizenship · RSA · White Card",
        "bg": (255, 95, 31),  # orange
    },
    "03_paywall_monthly": {
        "title": "Unlock AI tutor & analytics",
        "sub": "Premium from $7.99/mo · Cancel anytime",
        "bg": (147, 51, 234),  # purple
    },
    "03d_paywall_yearly": {
        "title": "Save 20% with yearly",
        "sub": "Premium $76.99/yr · Pro $144.99/yr",
        "bg": (16, 185, 129),  # green
    },
    "04_analytics": {
        "title": "Track your progress",
        "sub": "Smart analytics show your weak spots",
        "bg": (24, 144, 255),  # blue
    },
    "05_tutor": {
        "title": "Stuck? Ask Passaroo",
        "sub": "24/7 AI tutor explains every question",
        "bg": (147, 51, 234),  # purple
    },
    "06_profile": {
        "title": "Your study, your way",
        "sub": "Personalise streaks, goals & XP",
        "bg": (255, 95, 31),
    },
    "07_flashcards": {
        "title": "AI-made flashcards",
        "sub": "Auto-generated from your weak topics",
        "bg": (16, 185, 129),
    },
}


def add_overlay(src_path: Path, title: str, sub: str, bg_color: tuple) -> Path:
    img = Image.open(src_path).convert("RGB")
    W, H = img.size  # 1284 × 2778

    # Top banner band: 380 px tall, colored
    banner_h = 380
    banner = Image.new("RGB", (W, banner_h), bg_color)

    # Compose: new canvas = banner on top, then original (shifted down)
    # Apple guidelines: keep the device frame visible, no edge bleed
    new_h = H + banner_h
    canvas = Image.new("RGB", (W, new_h), bg_color)
    canvas.paste(banner, (0, 0))
    canvas.paste(img, (0, banner_h))

    # Draw text on banner
    draw = ImageDraw.Draw(canvas)
    title_size = 96
    sub_size = 48
    try:
        ftitle = ImageFont.truetype(FONT_BOLD, title_size) if FONT_BOLD else ImageFont.load_default()
        fsub = ImageFont.truetype(FONT_BOLD, sub_size) if FONT_BOLD else ImageFont.load_default()
    except Exception:
        ftitle = ImageFont.load_default()
        fsub = ImageFont.load_default()

    # Title centered horizontally
    tb = draw.textbbox((0, 0), title, font=ftitle)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    draw.text(((W - tw) / 2, 110), title, font=ftitle, fill=(255, 255, 255))

    # Subtitle below title
    sb = draw.textbbox((0, 0), sub, font=fsub)
    sw, sh = sb[2] - sb[0], sb[3] - sb[1]
    draw.text(((W - sw) / 2, 110 + th + 30), sub, font=fsub, fill=(255, 255, 255, 230))

    # Now resize back to exactly 1284 × 2778 (Apple's iPhone 6.5" requirement)
    final = canvas.resize((1284, 2778), Image.LANCZOS)

    out_path = OUT_DIR / src_path.name.replace(".png", "_seo.png")
    final.save(out_path, "PNG", optimize=True)
    return out_path


def main():
    print(f"Using font: {FONT_BOLD}")
    print(f"Output dir: {OUT_DIR}\n")
    for slug, cfg in OVERLAYS.items():
        src = SRC_DIR / f"iphone_6_5__{slug}.png"
        if not src.exists():
            print(f"  ✗ missing: {src.name}")
            continue
        out = add_overlay(src, cfg["title"], cfg["sub"], cfg["bg"])
        print(f"  ✓ {out.name}  ({cfg['title']})")

    # Bundle into a zip for easy download
    import zipfile
    bundle = Path("/app/backend/passaroo_ios_seo.zip")
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(OUT_DIR.glob("*.png")):
            z.write(f, arcname=f.name)
    print(f"\n📦 SEO bundle: {bundle} ({bundle.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
