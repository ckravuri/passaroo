"""
Public-facing legal pages for Passaroo, served as HTML at:
  /privacy
  /terms
  /refund-policy
  /disclaimer
  /support
  /
These URLs are required by Apple for the App Store submission and by Google
for Play Store submission. Content mirrors the in-app legal screens.
"""
from fastapi.responses import HTMLResponse

LAST_UPDATED = "May 29, 2026"


def _layout(title: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} · Passaroo</title>
  <meta name="robots" content="index,follow">
  <style>
    * {{ box-sizing: border-box; }}
    html, body {{ margin:0; padding:0; background:#FFF8F0; color:#0A2A33; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; -webkit-text-size-adjust: 100%; line-height:1.6; }}
    .wrap {{ max-width: 760px; margin: 0 auto; padding: 28px 22px 80px; }}
    header {{ border-bottom: 2px solid #F2E8D8; padding-bottom: 16px; margin-bottom: 24px; display:flex; align-items:center; gap:12px; }}
    header .logo {{ font-size: 28px; }}
    header h1 {{ margin:0; font-size: 22px; font-weight:800; }}
    header .sub {{ color:#6B7B7F; font-size:13px; }}
    h2 {{ font-size:18px; margin-top:28px; margin-bottom:8px; color:#0A2A33; }}
    p, li {{ font-size:15px; color:#243C42; }}
    a {{ color:#1F7A5C; text-decoration:underline; }}
    .meta {{ background:#FFF; border:1px solid #F0E5D0; border-radius:12px; padding:14px 16px; font-size:13px; color:#6B7B7F; margin: 18px 0 28px; }}
    nav {{ font-size:13px; margin-top:32px; padding-top:18px; border-top:1px solid #F2E8D8; color:#6B7B7F; }}
    nav a {{ margin-right:14px; }}
    footer {{ margin-top: 36px; font-size:12px; color:#9AA8AB; text-align:center; }}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <span class="logo">🦘</span>
      <div>
        <h1>{title}</h1>
        <div class="sub">Passaroo — Australian Exam Preparation</div>
      </div>
    </header>
    <div class="meta"><strong>Last updated:</strong> {LAST_UPDATED}</div>
    {body_html}
    <nav>
      <a href="/">Home</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/refund-policy">Refunds</a>
      <a href="/disclaimer">Disclaimer</a>
      <a href="/support">Support</a>
    </nav>
    <footer>© 2026 Passaroo · <a href="mailto:app.hrsupport@gmail.com">app.hrsupport@gmail.com</a></footer>
  </div>
</body>
</html>"""


def register_legal_routes(app):
    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    async def home():
        body = """
          <p>Passaroo is an independent educational platform that helps Australian learners practise for the
          <strong>Driver Knowledge Test (DKT)</strong>, the <strong>Australian Citizenship Test</strong>,
          and the <strong>Responsible Service of Alcohol (RSA)</strong> exam — and many more — using
          AI-powered explanations, mock exams, flashcards, and a friendly kangaroo tutor.</p>
          <h2>Get the app</h2>
          <p>Passaroo is available on iOS and Android. Visit the App Store or Google Play to download.</p>
          <h2>Helpful links</h2>
          <ul>
            <li><a href="/privacy">Privacy Policy</a></li>
            <li><a href="/terms">Terms of Service</a></li>
            <li><a href="/refund-policy">Refund &amp; Cancellation Policy</a></li>
            <li><a href="/disclaimer">Disclaimer</a></li>
            <li><a href="/support">Support</a></li>
          </ul>
          <p style="margin-top:24px"><em>Passaroo is an independent educational platform and is not affiliated with
          Australian government agencies or official examination bodies. All questions are independently created
          for practice and preparation purposes.</em></p>
        """
        return _layout("Welcome", body)

    @app.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
    async def privacy():
        body = """
          <p>Passaroo (\"we\", \"us\", \"our\") respects your privacy. This Privacy Policy explains what data we
          collect, how we use it, and your rights under the Australian Privacy Principles and applicable law.</p>

          <h2>1. Who we are</h2>
          <p>Passaroo is an independent educational platform. Contact: <a href="mailto:app.hrsupport@gmail.com">app.hrsupport@gmail.com</a>.</p>

          <h2>2. Information we collect</h2>
          <ul>
            <li><strong>Account info:</strong> name, email, password hash (when you sign up with email) or your
            display name and email from Google / Apple / Microsoft Sign-In.</li>
            <li><strong>Study data:</strong> your exam attempts, answers, scores, flashcards, study streak, XP
            and tier-related counters.</li>
            <li><strong>Device data:</strong> a stable device identifier (used to detect fraud, enforce single
            active session and stop bot abuse), OS version, app version, and approximate timezone.</li>
            <li><strong>Subscription data:</strong> tier, billing period, RevenueCat App User ID, and entitlement
            expiry — synced from the Apple App Store / Google Play purchase event.</li>
            <li><strong>AI usage data:</strong> we keep counters of how many AI explanations and tutor messages
            you've used per day so that we can enforce fair-use limits.</li>
            <li><strong>Push tokens:</strong> if you opt in to notifications, we store your device push token.</li>
            <li><strong>Ad identifiers:</strong> on iOS, only after you grant App Tracking Transparency consent.
            On Android, Google's Advertising ID is used by Google AdMob to serve ads. You can reset/limit this
            from your OS settings.</li>
          </ul>

          <h2>3. How we use your data</h2>
          <ul>
            <li>To provide the core service (track progress, save bookmarks, generate AI explanations).</li>
            <li>To enforce fair-use limits and protect against abuse, scraping, and account sharing.</li>
            <li>To manage your subscription and process renewals/cancellations via Apple App Store, Google
            Play, and RevenueCat.</li>
            <li>To send you study reminders, streak protection alerts, and product updates (only if you opt in
            to notifications).</li>
            <li>To serve relevant ads (free tier only) via Google AdMob.</li>
            <li>To improve our content (which questions are most missed) — aggregated and anonymised.</li>
          </ul>

          <h2>4. Third-party services we use</h2>
          <ul>
            <li><strong>MongoDB Atlas</strong> — database hosting.</li>
            <li><strong>Railway</strong> — backend hosting.</li>
            <li><strong>Google (AdMob, Firebase Cloud Messaging)</strong> — ads + push notifications.</li>
            <li><strong>RevenueCat</strong> — subscription management.</li>
            <li><strong>Apple, Google, Microsoft</strong> — OAuth sign-in (we receive your email and display
            name only, never your password).</li>
            <li><strong>Google Gemini (via Emergent)</strong> — AI explanations and tutor responses. Your study
            content is sent to the AI provider to generate replies; replies are not used to retrain models.</li>
          </ul>

          <h2>5. Children</h2>
          <p>Passaroo is intended for users aged 16+. If we learn that a child under 16 has created an account,
          we will delete their data.</p>

          <h2>6. International transfers</h2>
          <p>Your data may be processed on servers outside of Australia (e.g., in the US, Europe, or
          Singapore — wherever our cloud providers operate). We rely on standard contractual clauses where
          required.</p>

          <h2>7. Data retention</h2>
          <p>We keep your account and study data while your account is active. You can delete your account from
          Profile → Delete My Account &amp; Data; this triggers a hard-delete within 30 days. Some records (e.g.,
          purchase receipts for tax compliance) may be retained for the legally required period.</p>

          <h2>8. Your rights</h2>
          <p>You can: access your data, correct it, port it (via account export), delete it, or withdraw
          consent for marketing. Email <a href="mailto:app.hrsupport@gmail.com">app.hrsupport@gmail.com</a> with your
          request — we respond within 30 days.</p>

          <h2>9. Security</h2>
          <p>Passwords are hashed with bcrypt. Communications use TLS. We never sell your data.</p>

          <h2>10. Changes to this policy</h2>
          <p>Material changes are announced in the app and update the "Last updated" date above. Continued use
          after changes take effect means you accept the new policy.</p>

          <h2>11. Australian Consumer Law</h2>
          <p>Nothing in this policy excludes or limits your rights under the Australian Privacy Principles or the
          Australian Consumer Law.</p>

          <h2>12. Contact</h2>
          <p>Questions or complaints: <a href="mailto:app.hrsupport@gmail.com">app.hrsupport@gmail.com</a>. Unresolved
          complaints can be escalated to the Office of the Australian Information Commissioner (OAIC).</p>
        """
        return _layout("Privacy Policy", body)

    @app.get("/terms", response_class=HTMLResponse, include_in_schema=False)
    async def terms():
        body = """
          <p>By creating an account or using Passaroo, you agree to these Terms.</p>

          <h2>1. Independent platform — not a government service</h2>
          <p>Passaroo is an independent educational platform. We are not affiliated with, endorsed by, or
          connected to any Australian government department, state road authority, the Department of Home
          Affairs, examination bodies, or any official testing organisation. All questions on the platform are
          independently created for practice and preparation purposes and may differ from the official exams.</p>

          <h2>2. Eligibility</h2>
          <p>You must be at least 16 years old to create an account. By signing up you confirm the information
          you provide is accurate and that you are using the app for personal exam-preparation purposes.</p>

          <h2>3. Your account</h2>
          <p>You are responsible for maintaining the confidentiality of your account credentials. One account is
          for one person — account sharing, transfer, or sale is prohibited. Each account is limited to one
          active device session at a time; signing in on a new device will sign you out of the previous one.</p>

          <h2>4. Subscriptions &amp; billing</h2>
          <p>Premium and Pro subscriptions are billed through the Apple App Store or Google Play. Your
          subscription auto-renews at the end of each billing period unless you cancel at least 24 hours before
          the renewal date. Manage cancellations from your app-store subscription settings.
          See our <a href="/refund-policy">Refund Policy</a> for details on refunds.</p>

          <h2>5. Fair use</h2>
          <p>Pro is marketed as &ldquo;Unlimited Practice Exams&rdquo; but is subject to fair-use protections
          (currently capped at 50 exams per week) to keep the service available for everyone. AI features
          (explanations, tutor chat, flashcards) are similarly subject to per-minute and per-day fair-use limits
          that scale with your plan.</p>

          <h2>6. Acceptable use</h2>
          <p>You must not: (a) attempt to bypass paywalls, rate limits, or fair-use controls; (b) scrape,
          mirror, or republish exam questions, AI replies, or any in-app content; (c) automate access to the
          API using bots or scripts; (d) share your account credentials; (e) use the app to engage in academic
          dishonesty in any real-world exam. Violations may result in suspension or termination without refund.</p>

          <h2>7. AI-generated content</h2>
          <p>Explanations, study plans, flashcards, and tutor responses are generated by an AI model. While we
          work hard to keep them accurate and aligned with publicly available study material, you must verify
          critical information against official government sources before sitting any real exam. AI replies may
          occasionally contain errors.</p>

          <h2>8. Intellectual property</h2>
          <p>All Passaroo branding, design, original question banks, and AI-generated study materials are owned
          by Passaroo or its licensors. You may use them only inside the app for personal study; redistribution,
          reproduction, or commercial use is prohibited.</p>

          <h2>9. Service availability</h2>
          <p>We provide the app on an &ldquo;as-is&rdquo; basis. We do not guarantee uninterrupted access,
          error-free operation, or that you will pass any official exam after using Passaroo.</p>

          <h2>10. Limitation of liability</h2>
          <p>To the extent permitted by Australian law, Passaroo is not liable for any indirect, incidental, or
          consequential damages arising from your use of the app, including missed examinations, failed exams, or
          loss of study data. Our maximum liability is limited to the amount you paid us in the previous 12
          months.</p>

          <h2>11. Termination</h2>
          <p>We may suspend or close accounts that violate these Terms, abuse fair-use protections, scrape
          content, automate access, share accounts, or otherwise compromise the service — without refund. You
          can delete your account at any time from Profile → Delete My Account &amp; Data.</p>

          <h2>12. Governing law</h2>
          <p>These Terms are governed by the laws of Australia. Disputes will be resolved in the courts of
          Australia. Nothing in these Terms excludes your non-excludable rights under the Australian Consumer
          Law.</p>

          <h2>13. Changes to these Terms</h2>
          <p>We may update these Terms from time to time. Material changes will be announced inside the app.
          Continued use after the changes take effect means you accept the updated Terms.</p>

          <h2>14. Contact</h2>
          <p>Questions about these Terms? Email <a href="mailto:app.hrsupport@gmail.com">app.hrsupport@gmail.com</a>.</p>
        """
        return _layout("Terms of Service", body)

    @app.get("/refund-policy", response_class=HTMLResponse, include_in_schema=False)
    async def refund_policy():
        body = """
          <p>This policy explains how refunds and cancellations work for Passaroo Premium and Pro subscriptions
          purchased via the Apple App Store or Google Play.</p>

          <h2>1. Non-refundable subscriptions</h2>
          <p>All Passaroo subscriptions are non-refundable except where required by the Australian Consumer Law
          (ACL) or by the platform rules of the Apple App Store or Google Play.</p>

          <h2>2. Cancellations stop future renewals only</h2>
          <p>Cancelling your subscription stops it from auto-renewing at the next billing cycle. You keep access
          to your paid features until the end of the current billing period. Cancellation does NOT refund the
          current billing period.</p>

          <h2>3. You are responsible for cancelling before renewal</h2>
          <p>To avoid being charged for a new billing period, cancel at least 24 hours before the renewal date.
          Subscriptions are managed by Apple or Google — Passaroo cannot cancel a subscription on your behalf.</p>

          <h2>4. How to cancel</h2>
          <ul>
            <li><strong>iOS:</strong> Settings → [Your Name] → Subscriptions → Passaroo → Cancel Subscription.</li>
            <li><strong>Android:</strong> Google Play → Profile → Payments &amp; subscriptions → Subscriptions
            → Passaroo → Cancel.</li>
          </ul>

          <h2>5. How to request a refund</h2>
          <p>Refund requests for in-app purchases are handled by Apple or Google — not Passaroo.</p>
          <ul>
            <li><strong>iOS:</strong> <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener">reportaproblem.apple.com</a></li>
            <li><strong>Android:</strong> Google Play → Order history → Request a refund.</li>
          </ul>

          <h2>6. Your Australian Consumer Law rights</h2>
          <p>Nothing in this policy excludes or limits your rights under the Australian Consumer Law. If
          Passaroo has a major failure that cannot be reasonably fixed, you may be entitled to a refund or
          replacement. Contact <a href="mailto:app.hrsupport@gmail.com">app.hrsupport@gmail.com</a> to raise an ACL
          claim.</p>

          <h2>7. Abuse, fraud, and policy violations</h2>
          <p>Accounts found to be engaging in abuse — including bot traffic, scraping, account sharing,
          attempts to bypass rate limits, fraudulent chargebacks, or violation of our Terms of Service — may be
          suspended without refund.</p>

          <h2>8. &ldquo;Unlimited&rdquo; plans and fair use</h2>
          <p>Pro is marketed as &ldquo;Unlimited Practice Exams&rdquo; but is subject to fair-use protections
          (currently 50 exams/week, 200 AI tutor messages/day). Hitting these caps is not grounds for a
          refund.</p>

          <h2>9. Coupon and promotional credits</h2>
          <p>Promotional credits and coupon codes are non-transferable, have no cash value, and may not be
          combined unless explicitly stated.</p>

          <h2>10. Contact</h2>
          <p>For questions about this policy email <a href="mailto:app.hrsupport@gmail.com">app.hrsupport@gmail.com</a>.
          Please include your account email and (if relevant) the App Store / Play order ID.</p>
        """
        return _layout("Refund &amp; Cancellation Policy", body)

    @app.get("/disclaimer", response_class=HTMLResponse, include_in_schema=False)
    async def disclaimer():
        body = """
          <p>Important information about Passaroo and how our practice content relates to official Australian
          exams.</p>

          <h2>Independent platform</h2>
          <p>Passaroo is an independent educational platform and is not affiliated with Australian government
          agencies, state road authorities, the Department of Home Affairs, or any official examination
          body.</p>

          <h2>Practice content only</h2>
          <p>All questions, explanations, flashcards, study plans, and AI-generated content available in
          Passaroo are independently created for practice and preparation purposes only. They may differ in
          wording, structure, scope, or weighting from the official exams.</p>

          <h2>No guarantee of passing</h2>
          <p>Using Passaroo does not guarantee that you will pass any official examination. Real exams may
          change without notice. Always confirm current rules, fees and procedures with the official issuing
          authority before sitting an exam.</p>

          <h2>AI-generated information</h2>
          <p>AI explanations and tutor replies are generated by a large language model and may occasionally
          contain errors. Treat them as study aids and verify safety-critical or legal information against
          official sources.</p>

          <h2>Australian Consumer Law</h2>
          <p>Nothing in this disclaimer excludes or limits your rights under the Australian Consumer Law.</p>
        """
        return _layout("Disclaimer", body)

    @app.get("/support", response_class=HTMLResponse, include_in_schema=False)
    async def support():
        body = """
          <p>We're here to help! Reach out any time — most enquiries are answered within 24 hours on business
          days.</p>

          <h2>📧 Email support</h2>
          <p><a href="mailto:app.hrsupport@gmail.com">app.hrsupport@gmail.com</a></p>

          <h2>Before you email — common solutions</h2>
          <ul>
            <li><strong>Forgot password:</strong> open the app → Login → tap &ldquo;Forgot password&rdquo;.</li>
            <li><strong>Cancel subscription:</strong> see our <a href="/refund-policy">Refund Policy</a>.</li>
            <li><strong>Delete my account:</strong> in the app, go to Profile → Delete My Account &amp; Data.</li>
            <li><strong>App won't load:</strong> close it fully, check your internet, and reopen.</li>
            <li><strong>Restore Premium / Pro on a new device:</strong> Paywall screen → tap
            &ldquo;Restore Purchases&rdquo;.</li>
          </ul>

          <h2>Reporting bugs or content errors</h2>
          <p>Spotted a question with an incorrect answer? Email us with a screenshot. We review every report and
          fix the question bank weekly.</p>

          <h2>Privacy &amp; data requests</h2>
          <p>Want to access, export or delete your data? Email <a href="mailto:app.hrsupport@gmail.com">app.hrsupport@gmail.com</a>
          with the subject &ldquo;Data Request&rdquo;.</p>

          <h2>Business &amp; partnership enquiries</h2>
          <p>Email <a href="mailto:app.hrsupport@gmail.com">app.hrsupport@gmail.com</a> with subject &ldquo;Partnership&rdquo;.</p>
        """
        return _layout("Support", body)
