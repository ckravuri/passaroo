"""
Generate SEO-optimized App Store screenshots for Passaroo across all devices.

Devices & exact dimensions:
  • iphone_6_5     1284 × 2778  (Apple App Store - iPhone 6.5")
  • ipad_13        2064 × 2752  (Apple App Store - iPad 13")
  • android_phone  1080 × 1920  (Google Play - Phone)
  • android_tablet 1600 × 2560  (Google Play - 10" Tablet)

For each raw screenshot in /tmp/passaroo_screenshots/<device>__<slug>.png,
composes onto a branded gradient with a marketing headline + badge,
saves to /tmp/passaroo_screenshots/seo/<device>__<slug>.png.
"""

import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# --- Config ---
SRC_DIR = "/tmp/passaroo_screenshots"
OUT_DIR = "/tmp/passaroo_screenshots/seo"

# Brand palette
BG_TOP = (10, 42, 51)        # #0A2A33 dark teal
BG_BOTTOM = (20, 184, 166)   # #14B8A6 vibrant teal
WHITE = (255, 255, 255)
SUBTITLE = (230, 250, 255)

FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

# Device profile: (canvas_w, canvas_h, font_scale, phone_width_ratio, top_pad)
# font_scale lets us scale text appropriately for each canvas height
DEVICES = {
    "iphone_6_5":     {"size": (1284, 2778), "scale": 1.00, "phone_ratio": 0.78, "top_pad": 130},
    "ipad_13":        {"size": (2064, 2752), "scale": 1.15, "phone_ratio": 0.64, "top_pad": 140},
    "android_phone":  {"size": (1080, 1920), "scale": 0.72, "phone_ratio": 0.78, "top_pad": 90},
    "android_tablet": {"size": (1600, 2560), "scale": 0.96, "phone_ratio": 0.68, "top_pad": 120},
}

# Per-screen marketing copy (keyed by slug — device-agnostic)
COPY_BY_SLUG = {
    "00_login": {
        "headline": "Pass Your\nAussie Exam",
        "subtitle": "AI-Powered Study  •  Free to Start",
        "badge": "#1 AUSTRALIAN EXAM PREP",
    },
    "01_dashboard": {
        "headline": "All Aussie Exams\nin One App",
        "subtitle": "DKT  •  Citizenship  •  RSA  •  RSG",
        "badge": "TRUSTED BY 10,000+ LEARNERS",
    },
    "02_select_exam": {
        "headline": "Practice Like\nthe Real Test",
        "subtitle": "Real Questions  •  Real Results",
        "badge": "OFFICIAL-STYLE MOCK EXAMS",
    },
    "05_tutor": {
        "headline": "Your Personal\nAI Tutor 24/7",
        "subtitle": "Instant Answers in Plain English",
        "badge": "POWERED BY GEMINI AI",
    },
    "04_analytics": {
        "headline": "Track Every\nMistake",
        "subtitle": "Smart Analytics That Help You Win",
        "badge": "DATA-DRIVEN LEARNING",
    },
    "07_flashcards": {
        "headline": "Master Concepts\nFast",
        "subtitle": "Smart Flashcards That Stick",
        "badge": "SCIENCE-BACKED REVISION",
    },
    "06_profile": {
        "headline": "Your Study\nJourney, Your Way",
        "subtitle": "Personalised  •  Powerful  •  Premium",
        "badge": "BUILT FOR AUSTRALIA",
    },
    "03_paywall_monthly": {
        "headline": "Unlock Unlimited\nPractice",
        "subtitle": "Cancel Anytime  •  No Strings Attached",
        "badge": "STUDENT-FRIENDLY PRICING",
    },
    "03d_paywall_yearly": {
        "headline": "Save Big with\nYearly Plans",
        "subtitle": "Best Value for Serious Learners",
        "badge": "BEST DEAL  •  LIMITED TIME",
    },
    "10_exam_driving": {
        "headline": "Ace Your\nDriver Test",
        "subtitle": "DKT for NSW, VIC, QLD, WA & More",
        "badge": "ALL AUSTRALIAN STATES",
    },
    "11_exam_citizenship": {
        "headline": "Become an\nAussie Citizen",
        "subtitle": "Official-Style Citizenship Practice Tests",
        "badge": "20 QUESTIONS  •  REAL FORMAT",
    },
    "12_exam_forklift": {
        "headline": "Get Forklift\nLicensed Fast",
        "subtitle": "LF Knowledge Test — Done Right",
        "badge": "WORKPLACE-READY  •  TLILIC0003",
    },
    "13_exam_rsa": {
        "headline": "Pass Your\nRSA First Go",
        "subtitle": "Responsible Service of Alcohol Made Easy",
        "badge": "HOSPITALITY  •  NSW & VIC",
    },
}


def make_gradient_bg(w: int, h: int) -> Image.Image:
    base = Image.new("RGB", (w, h), BG_TOP)
    px = base.load()
    for y in range(h):
        t = y / (h - 1)
        t = t * t * (3 - 2 * t)
        r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)

    highlight = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    hd = ImageDraw.Draw(highlight)
    cx, cy = w // 2, int(h * 0.18)
    max_r = int(min(w, h) * 0.55)
    for r in range(max_r, 0, -20):
        alpha = int(55 * (1 - r / max_r))
        hd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, alpha))
    highlight = highlight.filter(ImageFilter.GaussianBlur(max(30, w // 30)))
    base = Image.alpha_composite(base.convert("RGBA"), highlight).convert("RGB")
    return base


def rounded_corner_mask(size, radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255
    )
    return mask


def drop_shadow(img: Image.Image, offset, blur, opacity) -> Image.Image:
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


def draw_headline(canvas: Image.Image, copy: dict, profile: dict) -> int:
    draw = ImageDraw.Draw(canvas, "RGBA")
    scale = profile["scale"]
    canvas_w = profile["size"][0]
    top_pad = profile["top_pad"]

    badge_font = ImageFont.truetype(FONT_BOLD, int(34 * scale))
    headline_font = ImageFont.truetype(FONT_BOLD, int(110 * scale))
    sub_font = ImageFont.truetype(FONT_REG, int(44 * scale))

    # Badge pill
    badge_text = copy["badge"]
    btw = draw.textlength(badge_text, font=badge_font)
    bh = int(66 * scale)
    bp = int(32 * scale)  # horizontal padding inside pill
    bx = (canvas_w - (btw + bp * 2)) // 2
    by = top_pad
    draw.rounded_rectangle(
        [bx, by, bx + btw + bp * 2, by + bh],
        radius=bh // 2,
        fill=(255, 212, 138, 245),
    )
    draw.text(
        (bx + bp, by + (bh - int(34 * scale)) // 2 - int(4 * scale)),
        badge_text,
        font=badge_font,
        fill=(45, 25, 0, 255),
    )

    # Headline
    headline = copy["headline"]
    y_cursor = by + bh + int(42 * scale)
    lines = headline.split("\n")
    line_h = int(122 * scale)
    for i, ln in enumerate(lines):
        tw = draw.textlength(ln, font=headline_font)
        # shadow
        draw.text(((canvas_w - tw) // 2 + 3, y_cursor + i * line_h + 3),
                  ln, font=headline_font, fill=(0, 0, 0, 120))
        draw.text(((canvas_w - tw) // 2, y_cursor + i * line_h),
                  ln, font=headline_font, fill=WHITE)

    # Subtitle
    sub_y = y_cursor + len(lines) * line_h + int(12 * scale)
    sub = copy["subtitle"]
    tw = draw.textlength(sub, font=sub_font)
    draw.text(((canvas_w - tw) // 2, sub_y), sub, font=sub_font, fill=SUBTITLE)

    return sub_y + int(70 * scale)


def compose_one(src_path: str, copy: dict, out_path: str, profile: dict):
    canvas_w, canvas_h = profile["size"]
    bg = make_gradient_bg(canvas_w, canvas_h)
    headline_bottom_y = draw_headline(bg, copy, profile)

    shot = Image.open(src_path).convert("RGBA")
    target_w = int(canvas_w * profile["phone_ratio"])
    ratio = target_w / shot.width
    target_h = int(shot.height * ratio)

    # Don't let phone exceed remaining vertical space
    max_h = canvas_h - headline_bottom_y - 40
    if target_h > max_h:
        target_h = max_h
        target_w = int(shot.width * (max_h / shot.height))
    shot = shot.resize((target_w, target_h), Image.LANCZOS)

    radius = max(40, int(70 * profile["scale"]))
    mask = rounded_corner_mask(shot.size, radius)
    rounded = Image.new("RGBA", shot.size, (0, 0, 0, 0))
    rounded.paste(shot, (0, 0), mask)

    shadowed = drop_shadow(
        rounded,
        offset=(0, int(24 * profile["scale"])),
        blur=int(46 * profile["scale"]),
        opacity=170,
    )

    avail_top = headline_bottom_y + int(30 * profile["scale"])
    avail_bottom = canvas_h - 40
    avail_h = avail_bottom - avail_top
    phone_y = avail_top + max(0, (avail_h - shadowed.height) // 2)
    phone_x = (canvas_w - shadowed.width) // 2

    bg_rgba = bg.convert("RGBA")
    bg_rgba.alpha_composite(shadowed, (phone_x, phone_y))
    bg_rgba.convert("RGB").save(out_path, "PNG", optimize=True)


def slug_from_filename(filename: str, device: str) -> str:
    """Extract slug like '10_exam_driving' from 'android_phone__10_exam_driving.png'."""
    base = filename.replace(f"{device}__", "").replace(".png", "")
    return base


def main(devices=None):
    os.makedirs(OUT_DIR, exist_ok=True)
    devices = devices or list(DEVICES.keys())
    total = 0
    for device in devices:
        profile = DEVICES.get(device)
        if not profile:
            print(f"  [skip] unknown device: {device}")
            continue
        print(f"\n=== {device} ({profile['size'][0]}×{profile['size'][1]}) ===")
        device_count = 0
        for fname in sorted(os.listdir(SRC_DIR)):
            if not fname.startswith(f"{device}__") or not fname.endswith(".png"):
                continue
            slug = slug_from_filename(fname, device)
            copy = COPY_BY_SLUG.get(slug)
            if not copy:
                # Not a screen we're producing SEO for
                continue
            src = os.path.join(SRC_DIR, fname)
            out = os.path.join(OUT_DIR, fname)
            try:
                compose_one(src, copy, out, profile)
                kb = os.path.getsize(out) / 1024
                print(f"  [ok]   {fname}  ({kb:.0f} KB)")
                device_count += 1
            except Exception as e:
                print(f"  [err]  {fname}: {e}")
        total += device_count
        print(f"  → {device_count} screenshots for {device}")
    print(f"\n✅ Generated {total} SEO screenshots -> {OUT_DIR}")


if __name__ == "__main__":
    import sys
    requested = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(requested or None)
