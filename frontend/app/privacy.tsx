import { LegalScreen } from "@/src/components/LegalScreen";

export default function Privacy() {
  return (
    <LegalScreen
      testID="privacy-screen"
      title="Privacy Policy"
      intro="Your privacy matters at Passaroo. This policy explains what we collect, how we use it, and the controls you have over your data."
      sections={[
        {
          heading: "What we collect",
          body:
            "Account info you provide: your name, email address, and (if you sign in with Google/Apple/Microsoft) your basic profile picture. We also store study activity you create in the app: exam attempts, bookmarks, flashcards and AI tutor messages.",
        },
        {
          heading: "How we use it",
          body:
            "To run the app: authenticate you, save your progress, calculate streaks/XP, generate personalised study insights, and deliver AI explanations through our AI provider. We never sell your personal data.",
        },
        {
          heading: "AI processing",
          body:
            "When you tap “Explain with AI”, ask the AI Tutor, or generate flashcards, we send the question text and your selected answer to a large language model provider (Google Gemini, via Emergent). We do not send your email, name or device identifiers to the AI provider.",
        },
        {
          heading: "Data storage & retention",
          body:
            "Your data is stored on managed MongoDB servers. Sessions auto-expire after 7 days. You can delete your entire account and all associated data at any time from Profile → Delete My Account & Data.",
        },
        {
          heading: "Children",
          body:
            "Passaroo is intended for users aged 16 and over. We do not knowingly collect data from children under 16.",
        },
        {
          heading: "Your rights",
          body:
            "You can request access to, correction of, or deletion of your personal data at any time. Account deletion is available in-app and is irreversible. For other requests, contact privacy@passaroo.app.",
        },
        {
          heading: "Cookies & tracking",
          body:
            "On mobile we use only the tokens necessary to keep you signed in. We do not use third-party advertising trackers in our paid tiers. The free tier may include non-tracking, contextual ads in the future.",
        },
        {
          heading: "Changes to this policy",
          body:
            "We may update this policy as the app evolves. Any material change will be announced inside the app before it takes effect.",
        },
      ]}
    />
  );
}
