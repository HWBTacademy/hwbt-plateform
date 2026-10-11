import type { Config, Context } from "@netlify/functions";
import { PRIVACY_NOTICE_VERSION, STATE_KEY, dataStore, errorResponse, json } from "./_lib/security.mts";

const text = (value: unknown, max = 240) => typeof value === "string" ? value.trim().slice(0, max) : "";

export default async (req: Request, _context: Context) => {
  try {
    if (req.method !== "GET") return json({ error: "Méthode refusée" }, { status: 405, headers: { Allow: "GET" } });
    const state = await dataStore().get(STATE_KEY, { type: "json" }) as any;
    const settings = state?.finance?.settings && typeof state.finance.settings === "object" ? state.finance.settings : {};
    return json({
      version: text(settings.privacyNoticeVersion, 32) || PRIVACY_NOTICE_VERSION,
      controller: {
        companyName: text(settings.companyName) || "HWBT Academy",
        ownerName: text(settings.ownerName),
        address: text(settings.address),
        postalCode: text(settings.postalCode, 24),
        city: text(settings.city, 120),
        enterpriseNumber: text(settings.enterpriseNumber, 80),
        email: text(settings.privacyEmail || settings.email, 200),
        phone: text(settings.phone, 80),
      },
      retention: {
        coachingMonths: Math.max(1, Math.min(120, Number(settings.coachingRetentionMonths) || 24)),
        inactiveAccountMonths: Math.max(1, Math.min(120, Number(settings.inactiveAccountRetentionMonths) || 24)),
        securityLogMonths: Math.max(1, Math.min(36, Number(settings.securityLogRetentionMonths) || 12)),
        backupDays: Math.max(7, Math.min(365, Number(settings.backupRetentionDays) || 90)),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
};

export const config: Config = {
  path: "/api/privacy",
  method: ["GET"],
};
