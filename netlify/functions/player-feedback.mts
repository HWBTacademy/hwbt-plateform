import type { Config, Context } from "@netlify/functions";
import {
  STATE_KEY,
  audit,
  currentVersion,
  dataStore,
  errorResponse,
  json,
  readJson,
  requireCsrf,
  requireSession,
  sanitizeState,
  saveVersionedBackup,
} from "./_lib/security.mts";

const ALLOWED = {
  helped: ["Consigne claire", "Exercice concret", "Feedback court", "Rythme de séance", "Partenaire", "Répétition", "Objectif clair", "Ambiance positive"],
  difficult: ["Pression", "Vitesse", "Fatigue", "Compréhension", "Technique", "Communication", "Confiance", "Régularité"],
};

function playerIds(session: any) {
  const ids = Array.isArray(session?.playerIds) ? session.playerIds : [session?.playerId];
  return ids.map(Number).filter(Number.isInteger);
}

function cleanOptions(value: unknown, allowed?: string[]) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map(v => v.trim()).filter(v => v && v.length <= 80 && (!allowed || allowed.includes(v))))].slice(0, 12);
}

export default async (req: Request, _context: Context) => {
  try {
    if (req.method !== "POST") return json({ error: "Méthode refusée" }, { status: 405, headers: { Allow: "POST" } });
    const auth = requireSession(req, ["player"]);
    requireCsrf(req, auth);
    const body = await readJson<{
      sessionId?: number;
      feeling?: number;
      helped?: string[];
      difficult?: string[];
      wantNext?: string[];
      note?: string;
    }>(req, 32 * 1024);
    const sessionId = Number(body.sessionId);
    const feeling = Number(body.feeling);
    if (!Number.isInteger(sessionId) || !Number.isInteger(feeling) || feeling < 1 || feeling > 5) {
      return json({ error: "Retour invalide" }, { status: 400 });
    }
    const store = dataStore();
    const raw = await store.get(STATE_KEY, { type: "json" }) as any;
    const session = Array.isArray(raw?.sessions) ? raw.sessions.find((item: any) => Number(item.id) === sessionId) : null;
    const playerId = Number(auth.playerId);
    if (!session || !playerIds(session).includes(playerId)) return json({ error: "Séance introuvable" }, { status: 404 });
    if (!["closed_coach", "completed"].includes(String(session.status))) return json({ error: "Le retour n’est pas encore ouvert" }, { status: 409 });
    const feedback = {
      feeling,
      helped: cleanOptions(body.helped, ALLOWED.helped),
      difficult: cleanOptions(body.difficult, ALLOWED.difficult),
      wantNext: cleanOptions(body.wantNext),
      note: String(body.note || "").trim().slice(0, 500),
      submitted: true,
      submittedAt: new Date().toISOString(),
    };
    if (!feedback.helped.length && !feedback.difficult.length && !feedback.wantNext.length) {
      return json({ error: "Choisis au moins un ressenti" }, { status: 400 });
    }
    session.playerFeedbackByPlayer = session.playerFeedbackByPlayer && typeof session.playerFeedbackByPlayer === "object" ? session.playerFeedbackByPlayer : {};
    session.playerFeedbackByPlayer[playerId] = feedback;
    if (playerIds(session).every(id => !!session.playerFeedbackByPlayer?.[id]?.submitted)) session.status = "completed";
    const payload = sanitizeState(raw);
    payload._version = currentVersion(raw) + 1;
    payload.serverSavedAt = new Date().toISOString();
    await store.setJSON(STATE_KEY, payload);
    await saveVersionedBackup(store, payload, "player-feedback");
    await audit("player.feedback_submitted", auth, { sessionId });
    return json({ ok: true, version: payload._version });
  } catch (error) {
    return errorResponse(error);
  }
};

export const config: Config = {
  path: "/api/player-feedback",
  method: ["POST"],
};
