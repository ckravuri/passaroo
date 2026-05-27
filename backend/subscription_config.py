"""
Passaroo subscription tiers — single source of truth for pricing, limits,
and fair usage rules. Frontend reads this via /api/subscription/plans.
"""
from typing import Dict, Any, List

# Monetary configuration (AUD, in cents to avoid float math)
PRICING = {
    "premium_monthly": {"amount_cents": 799, "currency": "AUD"},
    "premium_yearly":  {"amount_cents": 7670, "currency": "AUD"},   # ~20% off → 7.99*12*0.8 ≈ 76.70
    "pro_monthly":     {"amount_cents": 1499, "currency": "AUD"},
    "pro_yearly":      {"amount_cents": 14390, "currency": "AUD"},  # ~20% off → 14.99*12*0.8 ≈ 143.90
}

# RevenueCat Product / SKU identifiers — MUST match what you create in App Store Connect & Google Play
SKUS = {
    "premium_monthly": "passaroo_premium_monthly",
    "premium_yearly":  "passaroo_premium_yearly",
    "pro_monthly":     "passaroo_pro_monthly",
    "pro_yearly":      "passaroo_pro_yearly",
}

# Tier feature limits & gating
TIERS: Dict[str, Dict[str, Any]] = {
    "guest": {
        "label": "Guest",
        "exams_per_week": 1,                  # one trial mock exam without signup
        "exams_per_day": 1,
        "ai_explanations_per_day": 0,
        "ai_tutor_messages_per_day": 0,
        "ai_per_minute": 0,
        "ads": True,
        "ai_tutor": False,
        "flashcards": False,
        "reading_material": False,
        "study_planner": False,
        "advanced_analytics": False,
        "bookmarks": False,
        "weak_topic_analysis": False,
        "exam_readiness_score": False,
        "priority_ai": False,
        "voice_tutor": False,
        "interview_prep": False,
        "early_access": False,
    },
    "free": {
        "label": "Free",
        "exams_per_week": 2,
        "exams_per_day": 1,
        "ai_explanations_per_day": 5,
        "ai_tutor_messages_per_day": 0,
        "ai_per_minute": 2,
        "ads": True,
        "ai_tutor": False,
        "flashcards": True,                   # basic flashcards
        "reading_material": False,
        "study_planner": False,
        "advanced_analytics": False,
        "bookmarks": True,
        "weak_topic_analysis": False,
        "exam_readiness_score": False,
        "priority_ai": False,
        "voice_tutor": False,
        "interview_prep": False,
        "early_access": False,
    },
    "premium": {
        "label": "Premium",
        "exams_per_week": 15,
        "exams_per_day": 5,
        "ai_explanations_per_day": 100,
        "ai_tutor_messages_per_day": 50,
        "ai_per_minute": 6,
        "ads": False,
        "ai_tutor": True,
        "flashcards": True,
        "reading_material": True,
        "study_planner": True,
        "advanced_analytics": True,
        "bookmarks": True,
        "weak_topic_analysis": True,
        "exam_readiness_score": True,
        "priority_ai": False,
        "voice_tutor": False,
        "interview_prep": False,
        "early_access": False,
    },
    "pro": {
        "label": "Pro",
        # Marketed as "Unlimited" but soft-capped at 50/week to prevent abuse.
        "exams_per_week": 50,
        "exams_per_day": 15,
        "ai_explanations_per_day": 500,
        "ai_tutor_messages_per_day": 200,
        "ai_per_minute": 12,
        "ads": False,
        "ai_tutor": True,
        "flashcards": True,
        "reading_material": True,
        "study_planner": True,
        "advanced_analytics": True,
        "bookmarks": True,
        "weak_topic_analysis": True,
        "exam_readiness_score": True,
        "priority_ai": True,
        "voice_tutor": True,        # future
        "interview_prep": True,     # future
        "early_access": True,
    },
}


def get_tier_limits(plan: str) -> Dict[str, Any]:
    return TIERS.get(plan, TIERS["free"])


def public_plans_payload() -> Dict[str, Any]:
    """What the frontend paywall consumes."""
    return {
        "currency": "AUD",
        "yearly_discount_percent": 20,
        "products": {
            "premium_monthly": {
                "sku": SKUS["premium_monthly"],
                "price_cents": PRICING["premium_monthly"]["amount_cents"],
                "price_display": "$7.99",
                "period": "month",
                "tier": "premium",
            },
            "premium_yearly": {
                "sku": SKUS["premium_yearly"],
                "price_cents": PRICING["premium_yearly"]["amount_cents"],
                "price_display": "$76.70",
                "period": "year",
                "tier": "premium",
                "savings_pct": 20,
                "monthly_equivalent": "$6.39",
            },
            "pro_monthly": {
                "sku": SKUS["pro_monthly"],
                "price_cents": PRICING["pro_monthly"]["amount_cents"],
                "price_display": "$14.99",
                "period": "month",
                "tier": "pro",
            },
            "pro_yearly": {
                "sku": SKUS["pro_yearly"],
                "price_cents": PRICING["pro_yearly"]["amount_cents"],
                "price_display": "$143.90",
                "period": "year",
                "tier": "pro",
                "savings_pct": 20,
                "monthly_equivalent": "$11.99",
            },
        },
        "tiers": {
            k: {
                "label": v["label"],
                "exams_per_week": v["exams_per_week"],
                "ads": v["ads"],
                "ai_tutor": v["ai_tutor"],
                "ai_explanations_per_day": v["ai_explanations_per_day"],
                "advanced_analytics": v["advanced_analytics"],
                "voice_tutor": v.get("voice_tutor", False),
                "interview_prep": v.get("interview_prep", False),
                "weak_topic_analysis": v["weak_topic_analysis"],
                "study_planner": v["study_planner"],
                "reading_material": v["reading_material"],
                "flashcards": v["flashcards"],
                "exam_readiness_score": v["exam_readiness_score"],
                "early_access": v.get("early_access", False),
            }
            for k, v in TIERS.items()
        },
    }


# Curated marketing feature list per tier (for paywall UI)
TIER_MARKETING_FEATURES: Dict[str, List[str]] = {
    "free": [
        "2 mock exams per week",
        "Basic flashcards",
        "Progress tracking & streaks",
        "Daily challenges",
        "5 AI explanations per day",
        "Ad-supported",
    ],
    "premium": [
        "15 mock exams per week",
        "Ad-free experience",
        "AI tutor chat (fair use)",
        "Unlimited AI explanations*",
        "Weak-topic analysis",
        "Reading materials & study planner",
        "Exam readiness score",
        "Bookmarks & revision mode",
        "Advanced analytics",
    ],
    "pro": [
        "Unlimited practice exams*",
        "Ad-free experience",
        "Priority AI access",
        "Advanced analytics",
        "Premium study modes",
        "Early access to new features",
        "Voice tutor (coming soon)",
        "Interview preparation (coming soon)",
        "Future professional exam packs",
    ],
}
