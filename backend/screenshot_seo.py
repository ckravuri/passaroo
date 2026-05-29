"""
Generate SEO-optimized App Store screenshots for Passaroo (iPhone 6.5").

Takes raw 1284x2778 screenshots from /tmp/passaroo_screenshots/ and composes
them onto a branded gradient background with attractive marketing headlines.

Output: /tmp/passaroo_screenshots/seo/iphone_6_5__*.png  (1284 x 2778)
"""

import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# --- Config ---
SRC_DIR = "/tmp/passaroo_screenshots"
OUT_DIR = "/tmp/passaroo_screenshots/seo"
CANVAS_W, CANVAS_H = 1284, 2778

# Brand palette
BG_TOP = (10, 42, 51)        # #0A2A33 (Passaroo dark teal)
BG_BOTTOM = (20, 184, 166)   # #14B8A6 (vibrant teal)
ACCENT_GOLD = (255, 212, 138)
WHITE = (255, 255, 255)
SUBTITLE = (230, 250, 255)

# Fonts
FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

# Per-screen marketing copy crafted for App Store conversion
COPY = {
    "iphone_6_5__00_login.png": {
        "headline": "Pass Your\nAussie Exam",
        "subtitle": "AI-Powered Study  •  Free to Start",
        "badge": "#1 AUSTRALIAN EXAM PREP",
    },
    "iphone_6_5__01_dashboard.png": {
        "headline": "All Aussie Exams\nin One App",
        "subtitle": "DKT  •  Citizenship  •  RSA  •  RSG",
        "badge": "TRUSTED BY 10,000+ LEARNERS",
    },
    "iphone_6_5__02_select_exam.png": {
        "headline": "Practice Like\nthe Real Test",
        "subtitle": "Real Questions  •  Real Results",
        "badge": "OFFICIAL-STYLE MOCK EXAMS",
    },
    "iphone_6_5__05_tutor.png": {
        "headline": "Your Personal\nAI Tutor 24/7",
        "subtitle": "Instant Answers in Plain English",
        "badge": "POWERED BY GEMINI AI",
    },
    "iphone_6_5__04_analytics.png": {
        "headline": "Track Every\nMistake",
        "subtitle": "Smart Analytics That Help You Win",
        "badge": "DATA-DRIVEN LEARNING",
    },
    "iphone_6_5__07_flashcards.png": {
        "headline": "Master Concepts\nFast",
        "subtitle": "Smart Flashcards That Stick",
        "badge": "SCIENCE-BACKED REVISION",
    },
    "iphone_6_5__06_profile.png": {
        "headline": "Your Study\nJourney, Your Way",
        "subtitle": "Personalised  •  Powerful  •  Premium",
        "badge": "BUILT FOR AUSTRALIA",
    },
    "iphone_6_5__03_paywall_monthly.png": {
        "headline": "Unlock Unlimited\nPractice",
        "subtitle": "Cancel Anytime  •  No Strings Attached",
        "badge": "STUDENT-FRIENDLY PRICING",
    },
    "iphone_6_5__03d_paywall_yearly.png": {
        "headline": "Save Big with\nYearly Plans",
        "subtitle": "Best Value for Serious Learners",
        "badge": "BEST DEAL  •  LIMITED TIME",
    },
}


def make_gradient_bg(w: int, h: int) -> Image.Image:
    """Smooth vertical gradient + soft top highlight."""
    base = Image.new("RGB", (w, h), BG_TOP)
    px = base.load()
    for y in range(h):
        t = y / (h - 1)
        t = t * t * (3 - 2 * t)  # ease in/out
        r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)

    # Soft radial highlight near top-center for depth
    highlight = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    hd = ImageDraw.Draw(highlight)
    cx, cy = w // 2, int(h * 0.18)
    max_r = 700
    for r in range(max_r, 0, -20):
        alpha = int(55 * (1 - r / max_r))
        hd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, alpha))
    highlight = highlight.filter(ImageFilter.GaussianBlur(60))
    base = Image.alpha_composite(base.convert("RGBA"), highlight).convert("RGB")
    return base


def rounded_corner_mask(size, radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def drop_shadow(img: Image.Image, offset=(0, 24), blur=46, opacity=170) -> Image.Image:
    pad = blur * 2 + max(abs(offset[0]), abs(offset[1]))
    canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    alpha = img.split()[-1] if img.mode == "RGBA" else Image.new("L", img.size, 255)
    sd = Image.new("RGBA", img.size, (0, 0, 0, opacity))
    sd.putalpha(alpha.point(lambda p: int(p * opacity / 255)))
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_layer.paste(sd, (pad + offset[0], pad + offset[1]), sd)
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(blur))
    canvas = Image.alpha_composite(canvas, shadow_layer)
    canvas.paste(img, (pad, pad), img if img.mode == "RGBA" else None)
    return canvas


def draw_headline(canvas: Image.Image, copy: dict) -> int:
    """Draw badge + headline + subtitle. Returns bottom Y of the text block."""
    draw = ImageDraw.Draw(canvas, "RGBA")

    badge_font = ImageFont.truetype(FONT_BOLD, 34)
    headline_font = ImageFont.truetype(FONT_BOLD, 110)
    sub_font = ImageFont.truetype(FONT_REG, 44)

    top_pad = 130

    # Badge pill
    badge_text = copy["badge"]
    btw = draw.textlength(badge_text, font=badge_font)
    bh = 66
    bx = (CANVAS_W - (btw + 64)) // 2
    by = top_pad
    draw.rounded_rectangle(
        [bx, by, bx + btw + 64, by + bh],
        radius=bh // 2,
        fill=(255, 212, 138, 245),
    )
    draw.text(
        (bx + 32, by + (bh - 34) // 2 - 4),
        badge_text,
        font=badge_font,
        fill=(45, 25, 0, 255),
    )

    # Headline
    headline = copy["headline"]
    y_cursor = by + bh + 42
    lines = headline.split("\n")
    line_h = 122
    for i, ln in enumerate(lines):
        tw = draw.textlength(ln, font=headline_font)
        # subtle text shadow for legibility
        draw.text(((CANVAS_W - tw) // 2 + 3, y_cursor + i * line_h + 3),
                  ln, font=headline_font, fill=(0, 0, 0, 120))
        draw.text(((CANVAS_W - tw) // 2, y_cursor + i * line_h),
                  ln, font=headline_font, fill=WHITE)

    # Subtitle
    sub_y = y_cursor + len(lines) * line_h + 12
    sub = copy["subtitle"]
    tw = draw.textlength(sub, font=sub_font)
    draw.text(((CANVAS_W - tw) // 2, sub_y), sub, font=sub_font, fill=SUBTITLE)

    return sub_y + 70


def compose_one(src_path: str, copy: dict, out_path: str):
    bg = make_gradient_bg(CANVAS_W, CANVAS_H)
    headline_bottom_y = draw_headline(bg, copy)

    shot = Image.open(src_path).convert("RGBA")
    target_w = int(CANVAS_W * 0.78)
    ratio = target_w / shot.width
    target_h = int(shot.height * ratio)
    shot = shot.resize((target_w, target_h), Image.LANCZOS)

    radius = 70
    mask = rounded_corner_mask(shot.size, radius)
    rounded = Image.new("RGBA", shot.size, (0, 0, 0, 0))
    rounded.paste(shot, (0, 0), mask)

    shadowed = drop_shadow(rounded, offset=(0, 24), blur=46, opacity=170)

    avail_top = headline_bottom_y + 30
    avail_bottom = CANVAS_H - 40
    avail_h = avail_bottom - avail_top
    phone_y = avail_top + max(0, (avail_h - shadowed.height) // 2)
    phone_x = (CANVAS_W - shadowed.width) // 2

    bg_rgba = bg.convert("RGBA")
    bg_rgba.alpha_composite(shadowed, (phone_x, phone_y))
    bg_rgba.convert("RGB").save(out_path, "PNG", optimize=True)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    generated = 0
    for fname, copy in COPY.items():
        src = os.path.join(SRC_DIR, fname)
        if not os.path.exists(src):
            print(f"  [skip] {fname} (missing source)")
            continue
        out = os.path.join(OUT_DIR, fname)
        compose_one(src, copy, out)
        kb = os.path.getsize(out) / 1024
        print(f"  [ok]   {fname}  ({kb:.0f} KB)")
        generated += 1
    print(f"\nGenerated {generated} screenshots -> {OUT_DIR}")


if __name__ == "__main__":
    main()
