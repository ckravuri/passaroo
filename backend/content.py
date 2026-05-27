"""Static reading material for Passaroo — original, paraphrased study notes."""

READING_MATERIAL = {
    "dkt": [
        {
            "title": "Speed Limits in Australia",
            "summary": "Know the defaults: 50 km/h in built-up areas, 100 km/h on most rural roads, and lower limits in school zones and shared spaces. Signs always override defaults.",
            "key_points": [
                "Default urban speed limit is 50 km/h unless signed",
                "School zones: 40 km/h on weekdays during posted hours in school terms",
                "When passing a stopped school bus with flashing red lights, max 40 km/h",
                "Towing a trailer on a freeway: usually capped at 100 km/h",
            ],
        },
        {
            "title": "Alcohol, Drugs & Driving",
            "summary": "Australia enforces strict BAC limits. Penalties are severe and include fines, demerit points, suspension, and criminal records.",
            "key_points": [
                "Full licence: BAC under 0.05%",
                "Learner / P1 / P2 drivers: ZERO alcohol (0.00%)",
                "Mixing alcohol with prescription/illicit drugs is dangerous and illegal",
                "Liver processes about one standard drink per hour — there's no fast cure",
            ],
        },
        {
            "title": "Road Signs Decoded",
            "summary": "Shape and colour tell you the type. Memorise the three core families.",
            "key_points": [
                "Regulatory (round/octagonal): orders you to act — STOP, GIVE WAY, no entry",
                "Warning (yellow diamond): hazard ahead — slow down, scan",
                "Information (rectangular): services, distances, route guidance",
            ],
        },
        {
            "title": "Intersections & Roundabouts",
            "summary": "Knowing who gives way is essential for safe driving and exam questions.",
            "key_points": [
                "Uncontrolled intersection: give way to vehicles on your right",
                "Turning right at green light (no arrow): give way to oncoming traffic",
                "Roundabouts: give way to vehicles already in the roundabout",
                "Always signal LEFT just before your exit from a roundabout",
            ],
        },
        {
            "title": "Following Distance & Hazards",
            "summary": "Time-based gaps keep you out of trouble. Adjust for conditions.",
            "key_points": [
                "Minimum 3-second gap in good conditions",
                "Double the gap in wet weather or low visibility",
                "Headlights on between sunset and sunrise — and any time visibility drops",
                "Fatigue: best cure is a 15–20 minute nap, not caffeine",
            ],
        },
    ],
    "citizenship": [
        {
            "title": "Australian Values",
            "summary": "Equal worth, freedom, fair go and the rule of law are core to Australian identity.",
            "key_points": [
                "Respect for equal worth, dignity and freedom of each person",
                "Equality of men and women under the law",
                "Freedom of speech, association and religion within the law",
                "Australia is a peaceful, secular, multicultural society",
            ],
        },
        {
            "title": "How Australia is Governed",
            "summary": "Parliamentary democracy + constitutional monarchy with three levels of government.",
            "key_points": [
                "Three levels: Federal, State/Territory, Local",
                "Federal Parliament: House of Representatives (3-year terms) + Senate (6-year terms)",
                "Constitution can only be changed by referendum",
                "Sovereign is Head of State, represented by the Governor-General",
            ],
        },
        {
            "title": "Symbols of Australia",
            "summary": "Flag, anthem, floral emblem and key dates carry national meaning.",
            "key_points": [
                "Australian flag: Union Jack + Commonwealth Star (7 points) + Southern Cross",
                "National anthem: ‘Advance Australia Fair’ (since 1984)",
                "Floral emblem: Golden Wattle",
                "Key dates: Australia Day 26 Jan · ANZAC Day 25 Apr",
            ],
        },
        {
            "title": "Rights & Responsibilities",
            "summary": "Citizenship comes with civic duties — and important freedoms.",
            "key_points": [
                "Responsibilities: obey laws, vote, serve on jury if called, defend Australia if called",
                "Rights: live and work in Australia, vote, apply for an Australian passport",
                "Voting in federal/state/territory elections is COMPULSORY at 18+",
                "Discrimination by race/religion/sex is unlawful",
            ],
        },
    ],
    "rsa": [
        {
            "title": "Standard Drinks & the Body",
            "summary": "A ‘standard drink’ has 10 g of pure alcohol — but every body processes it differently.",
            "key_points": [
                "One standard drink ≈ 285 ml beer @ 4.8% OR 100 ml wine @ 12% OR 30 ml spirit @ 40%",
                "Body weight, gender, food and tolerance all affect BAC",
                "On average, the liver clears 1 standard drink per hour",
                "Pregnant women should avoid alcohol completely",
            ],
        },
        {
            "title": "Identifying Intoxication",
            "summary": "Use the SLURRED scan: Speech, Loss of balance, Unsteady, Reactions slow, Repetitive, Emotional, Disturbance.",
            "key_points": [
                "Slurred speech, glassy eyes, unsteady balance, loud or aggressive behaviour",
                "Track patrons throughout service — not just on entry",
                "Top-ups disguise true consumption — avoid them",
                "Serving an intoxicated person is a legal offence",
            ],
        },
        {
            "title": "Refusing Service Safely",
            "summary": "Polite, firm, and consistent — and always with the law on your side.",
            "key_points": [
                "Stay calm, polite and firm — refer to RSA law, not personal opinion",
                "Offer water, food, or a non-alcoholic alternative",
                "Notify management or security if a patron becomes aggressive",
                "Document incidents in the venue’s incident register",
            ],
        },
        {
            "title": "ID & Minor Service",
            "summary": "If they look under 25, ask. No ID, no service.",
            "key_points": [
                "Legal age to be served alcohol in Australia: 18",
                "Acceptable ID: Australian driver licence, passport, approved proof-of-age card",
                "If ID looks fake, refuse service and follow venue policy",
                "Serving a minor exposes you and the venue to fines, suspension and prosecution",
            ],
        },
        {
            "title": "Safe Transport & Duty of Care",
            "summary": "Duty of care doesn’t stop at the door.",
            "key_points": [
                "Help intoxicated patrons get home safely — taxi, rideshare, sober friend",
                "Free drinking water must always be available",
                "Encourage moderation with low- and no-alcohol options",
                "If you see harassment, discreetly intervene and escalate to management",
            ],
        },
    ],
}


# Australian states for DKT
AU_STATES = [
    {"code": "NSW", "name": "New South Wales"},
    {"code": "VIC", "name": "Victoria"},
    {"code": "QLD", "name": "Queensland"},
    {"code": "WA", "name": "Western Australia"},
    {"code": "SA", "name": "South Australia"},
    {"code": "TAS", "name": "Tasmania"},
    {"code": "ACT", "name": "Australian Capital Territory"},
    {"code": "NT", "name": "Northern Territory"},
]


ACHIEVEMENTS = [
    {"id": "first_exam", "title": "First Steps", "description": "Complete your first mock exam", "icon": "footsteps", "color": "#00D1FF"},
    {"id": "first_pass", "title": "Pass Master", "description": "Pass any mock exam", "icon": "trophy", "color": "#00FF9D"},
    {"id": "streak_3", "title": "On Fire", "description": "3-day study streak", "icon": "flame", "color": "#FF8F00"},
    {"id": "streak_7", "title": "Week Warrior", "description": "7-day study streak", "icon": "flame", "color": "#FF4B4B"},
    {"id": "streak_30", "title": "Month Champion", "description": "30-day study streak", "icon": "flame", "color": "#7B61FF"},
    {"id": "xp_100", "title": "Centurion", "description": "Earn 100 XP", "icon": "flash", "color": "#00D1FF"},
    {"id": "xp_500", "title": "High Achiever", "description": "Earn 500 XP", "icon": "flash", "color": "#7B61FF"},
    {"id": "xp_1000", "title": "Legend", "description": "Earn 1,000 XP", "icon": "star", "color": "#FFD700"},
    {"id": "all_categories", "title": "Triple Threat", "description": "Attempt all 3 exam types", "icon": "ribbon", "color": "#00FF9D"},
    {"id": "perfect_score", "title": "Flawless", "description": "Score 100% on any exam", "icon": "diamond", "color": "#00D1FF"},
]
