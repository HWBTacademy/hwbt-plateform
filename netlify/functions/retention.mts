import type { Config, Context } from "@netlify/functions";
import { STATE_KEY, audit, authStore, dataStore } from "./_lib/security.mts";

function dateInKey(key: string) {
  const match = key.match(/\/(\d{4}-\d{2}-\d{2})(?:\/|T)/);
  if (!match) return 0;
  const value = new Date(`${match[1]}T00:00:00Z`).getTime();
  return Number.isNaN(value) ? 0 : value;
}

async function deleteExpired(store: ReturnType<typeof dataStore>, prefix: string, cutoff: number) {
  let deleted = 0;
  for await (const page of store.list({ prefix, paginate: true })) {
    const expired = page.blobs.filter(blob => {
      const at = dateInKey(blob.key);
      return at > 0 && at < cutoff;
    });
    for (let index = 0; index < expired.length; index += 25) {
      await Promise.all(expired.slice(index, index + 25).map(blob => store.delete(blob.key)));
      deleted += Math.min(25, expired.length - index);
    }
  }
  return deleted;
}

export default async (_req: Request, _context: Context) => {
  const state = await dataStore().get(STATE_KEY, { type: "json" }) as any;
  const settings = state?.finance?.settings && typeof state.finance.settings === "object" ? state.finance.settings : {};
  const backupDays = Math.max(7, Math.min(365, Number(settings.backupRetentionDays) || 90));
  const auditMonths = Math.max(1, Math.min(36, Number(settings.securityLogRetentionMonths) || 12));
  const now = Date.now();
  const backupsDeleted = await deleteExpired(dataStore(), "state/backups/", now - backupDays * 24 * 60 * 60 * 1000);
  const auditsDeleted = await deleteExpired(authStore(), "audit/", now - auditMonths * 30.4375 * 24 * 60 * 60 * 1000);
  await audit("retention.cleanup", { role: "coach", sub: "system" }, { backupsDeleted, auditsDeleted });
  return new Response(null, { status: 204 });
};

export const config: Config = {
  schedule: "@daily",
};
