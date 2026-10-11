import type { Config, Context } from "@netlify/functions";
import {
  STATE_KEY,
  audit,
  currentVersion,
  dataStore,
  errorResponse,
  json,
  migrateLegacyPasswords,
  readJson,
  requireCsrf,
  requireSession,
  sanitizeState,
  saveVersionedBackup,
  stateForPlayer,
} from "./_lib/security.mts";

export default async (req: Request, _context: Context) => {
  try {
    const session = requireSession(req);
    const store = dataStore();

    if (req.method === "GET") {
      let state = await store.get(STATE_KEY, { type: "json" }) as any;
      if (!state) return json({ state: null, version: 0 });
      if (session.role === "coach" && await migrateLegacyPasswords(state)) {
        state = sanitizeState(state);
        state._version = currentVersion(state) + 1;
        state.serverSavedAt = new Date().toISOString();
        await store.setJSON(STATE_KEY, state);
        await saveVersionedBackup(store, state, "credential-migration");
        await audit("state.credentials_migrated", session);
      }
      const version = currentVersion(state);
      const visibleState = session.role === "coach" ? sanitizeState(state) : stateForPlayer(state, Number(session.playerId));
      delete (visibleState as any)._version;
      return json({ state: visibleState, version });
    }

    if (req.method === "POST") {
      requireCsrf(req, session);
      if (session.role !== "coach") return json({ error: "Accès refusé" }, { status: 403 });
      const body = await readJson<{ state?: unknown; expectedVersion?: number }>(req);
      if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
        return json({ error: "État invalide" }, { status: 400 });
      }
      const current = await store.get(STATE_KEY, { type: "json" }) as any;
      const version = currentVersion(current);
      if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) !== version) {
        return json({ error: "Les données ont été modifiées ailleurs", version }, { status: 409 });
      }
      const payload = sanitizeState(body.state);
      payload._version = version + 1;
      payload.serverSavedAt = new Date().toISOString();
      await store.setJSON(STATE_KEY, payload);
      await saveVersionedBackup(store, payload, "state-save");
      await audit("state.saved", session, { version: payload._version });
      return json({ ok: true, serverSavedAt: payload.serverSavedAt, version: payload._version });
    }

    return json({ error: "Méthode refusée" }, { status: 405, headers: { Allow: "GET, POST" } });
  } catch (error) {
    return errorResponse(error);
  }
};

export const config: Config = {
  path: "/api/state",
  method: ["GET", "POST"],
};
