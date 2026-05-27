import { LegalScreen } from "@/src/components/LegalScreen";

export default function Security() {
  return (
    <LegalScreen
      testID="security-screen"
      title="Security Policy"
      intro="We take the security of your study data seriously. Here is how Passaroo is built and what you can do to keep your account safe."
      sections={[
        {
          heading: "Encryption in transit",
          body:
            "All traffic between the Passaroo app and our servers uses HTTPS with modern TLS. Authentication tokens are stored in the platform secure keystore (Keychain on iOS, EncryptedSharedPreferences on Android).",
        },
        {
          heading: "Password storage",
          body:
            "Email/password accounts are hashed using bcrypt (industry-standard one-way hashing). We never store plaintext passwords. Use a unique, strong password (12+ characters).",
        },
        {
          heading: "OAuth sign-in",
          body:
            "If you sign in with Google, Apple or Microsoft, Passaroo never sees your password — we receive a verified identity token from the provider. You can revoke access at any time in your provider account settings.",
        },
        {
          heading: "One active device",
          body:
            "For security and abuse prevention, only one device session per user is active at a time. Signing in elsewhere will invalidate previous sessions. Sessions expire automatically after 7 days.",
        },
        {
          heading: "Rate limiting & abuse prevention",
          body:
            "We enforce server-side rate limits on AI endpoints, weekly exam limits per plan, and monitor for anomalous activity. Admin accounts may ban abusive users.",
        },
        {
          heading: "Vulnerability disclosure",
          body:
            "If you discover a security issue, please email security@passaroo.app with details. We respond to responsible reports within 72 hours and credit reporters where appropriate.",
        },
        {
          heading: "Your part",
          body:
            "Keep your device OS up to date, use a screen lock, do not share your account, and review your sign-in activity regularly. Sign out from shared devices when finished.",
        },
      ]}
    />
  );
}
