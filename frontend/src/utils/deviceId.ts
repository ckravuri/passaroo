// Stable per-installation device identifier used by:
//   - Anti-abuse / fraud detection on the backend (X-Device-Id header)
//   - Single-device session enforcement
//   - Guest exam trial gating (1 exam per device)
//
// We persist a UUID via SecureStore (on native) / localStorage fallback (web).
// expo-device alone is not stable across reinstalls on Android, so we treat the
// generated UUID as the source of truth, supplemented with device metadata.
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

const KEY = "passaroo_device_id";
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await storage.secureGet<string | null>(KEY, null);
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
    // ignore
  }

  // Generate fresh id. Use crypto-strong UUID so it can't easily be spoofed
  // by reading a public device serial.
  const prefix = Platform.OS;
  const meta = [
    Device.osBuildId || Device.osVersion || "",
    Device.modelName || "",
    Device.deviceName || "",
  ].filter(Boolean).join("_").replace(/\s+/g, "-").slice(0, 24);
  const uuid =
    typeof Crypto.randomUUID === "function"
      ? Crypto.randomUUID()
      : await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${Date.now()}_${Math.random()}_${meta}`,
        );
  const id = `${prefix}_${meta || "unknown"}_${uuid}`.slice(0, 128);
  try {
    await storage.secureSet(KEY, id);
  } catch {
    // best effort
  }
  cached = id;
  return id;
}

/** Hard-reset device id (admin/debug only). */
export async function resetDeviceId(): Promise<void> {
  cached = null;
  try {
    await storage.secureRemove(KEY);
  } catch {}
}
