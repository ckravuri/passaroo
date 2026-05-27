// Passaroo design tokens — single source of truth.
export const colors = {
  primary: "#00D1FF",
  primaryDark: "#009BCC",
  primaryGreen: "#00FF9D",
  primaryGreenDark: "#00CC7E",
  bg: "#FFFFFF",
  bgAlt: "#F4F5F9",
  surface: "#FFFFFF",
  textPrimary: "#1A1A24",
  textSecondary: "#8A8A93",
  textTertiary: "#C1C1C8",
  fire: "#FF8F00",
  wrong: "#FF4B4B",
  correct: "#58CC02",
  border: "#E5E5EA",
  premium: "#7B61FF",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const typography = {
  h1: { fontSize: 32, fontWeight: "800" as const, color: colors.textPrimary, letterSpacing: 0.3 },
  h2: { fontSize: 24, fontWeight: "800" as const, color: colors.textPrimary },
  h3: { fontSize: 20, fontWeight: "700" as const, color: colors.textPrimary },
  bodyLarge: { fontSize: 18, fontWeight: "600" as const, color: colors.textPrimary },
  body: { fontSize: 16, fontWeight: "400" as const, color: colors.textPrimary, lineHeight: 23 },
  caption: { fontSize: 14, fontWeight: "500" as const, color: colors.textSecondary },
  button: { fontSize: 16, fontWeight: "800" as const, letterSpacing: 1, textTransform: "uppercase" as const },
};

export const IMAGES = {
  mascot: "https://static.prod-images.emergentagent.com/jobs/5c23184e-8a9e-4e85-aa5f-50bd78e7c8d6/images/40fda80bcaeed8ae4574a3912f56128d8ba07f787d148cc9cee0bb7285a9cf84.png",
  motif: "https://static.prod-images.emergentagent.com/jobs/5c23184e-8a9e-4e85-aa5f-50bd78e7c8d6/images/79ca3b44dfbdc78c0f58b71a6191e128ffcdcb331cfb6c1c7382baf473e709bc.png",
  badge: "https://static.prod-images.emergentagent.com/jobs/5c23184e-8a9e-4e85-aa5f-50bd78e7c8d6/images/963397790a1f88e2f203b651537c5aaa493537a7e8ede54fa7004b720a249850.png",
};

export const DISCLAIMER =
  "Passaroo is an independent educational platform and is not affiliated with Australian government agencies or official testing bodies.";
