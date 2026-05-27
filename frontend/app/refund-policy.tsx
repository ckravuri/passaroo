import { LegalScreen } from "@/src/components/LegalScreen";

export default function RefundPolicy() {
  return (
    <LegalScreen
      testID="refund-policy-screen"
      title="Refund & Cancellation Policy"
      intro="This policy explains how refunds and cancellations work for Passaroo Premium and Pro subscriptions purchased via the Apple App Store or Google Play."
      sections={[
        {
          heading: "1. Non-refundable subscriptions",
          body:
            "All Passaroo subscriptions are non-refundable except where required by the Australian Consumer Law (ACL) or by the platform rules of the Apple App Store or Google Play.",
        },
        {
          heading: "2. Cancellations stop future renewals only",
          body:
            "Cancelling your subscription stops it from auto-renewing at the next billing cycle. You keep access to your paid features until the end of the current billing period. Cancellation does NOT refund the current billing period (e.g. cancelling on day 5 of a monthly plan still gives you access for the remaining 25 days, but no money is returned).",
        },
        {
          heading: "3. You are responsible for cancelling before renewal",
          body:
            "To avoid being charged for a new billing period, cancel at least 24 hours before the renewal date. Subscriptions are managed by Apple or Google — Passaroo cannot cancel a subscription on your behalf.",
        },
        {
          heading: "4. How to cancel",
          body:
            "iOS: Settings → [Your Name] → Subscriptions → Passaroo → Cancel Subscription.\nAndroid: Google Play → Profile → Payments & subscriptions → Subscriptions → Passaroo → Cancel.",
        },
        {
          heading: "5. How to request a refund",
          body:
            "Refund requests for in-app purchases are handled by Apple or Google — not Passaroo. iOS: reportaproblem.apple.com. Android: play.google.com/store/account → Order history → Request a refund. We have no ability to issue, accelerate, or override these decisions.",
        },
        {
          heading: "6. Your Australian Consumer Law rights",
          body:
            "Nothing in this policy excludes or limits your rights under the Australian Consumer Law. If Passaroo has a major failure that cannot be reasonably fixed, you may be entitled to a refund or replacement. Contact support@passaroo.app to raise an ACL claim.",
        },
        {
          heading: "7. Abuse, fraud, and policy violations",
          body:
            "Accounts found to be engaging in abuse — including bot traffic, scraping, account sharing, attempts to bypass rate limits, fraudulent chargebacks, or violation of our Terms of Service — may be suspended without refund. The amounts already paid remain non-refundable in these cases.",
        },
        {
          heading: "8. “Unlimited” plans and fair use",
          body:
            "Pro is marketed as “Unlimited Practice Exams” but is subject to fair-use protections (currently 50 exams/week, 200 AI tutor messages/day) to keep the service available for all users. Hitting these caps is not grounds for a refund.",
        },
        {
          heading: "9. Account deletion",
          body:
            "You can delete your account at any time from Profile → Delete My Account & Data. Account deletion does NOT automatically cancel an active App Store / Play subscription — please cancel it separately via the relevant store first.",
        },
        {
          heading: "10. Coupon and promotional credits",
          body:
            "Promotional credits and coupon codes are non-transferable, have no cash value, and may not be combined unless explicitly stated. We reserve the right to revoke promotional credits applied as a result of policy violations.",
        },
        {
          heading: "11. Contact",
          body:
            "For questions about this policy email support@passaroo.app. Please include your account email and (if relevant) the App Store / Play order ID.",
        },
      ]}
    />
  );
}
