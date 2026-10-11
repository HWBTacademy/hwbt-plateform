import type { Config, Context } from "@netlify/functions";
import {
  STATE_KEY,
  audit,
  authStore,
  clearSessionCookie,
  createSession,
  currentVersion,
  dataStore,
  dummyPasswordCheck,
  enforceLoginRateLimit,
  errorResponse,
  hashPassword,
  json,
  migrateLegacyPasswords,
  normalizeLogin,
  readJson,
  readSession,
  requireCsrf,
  requireSession,
  sanitizeState,
  saveVersionedBackup,
  validateNewPassword,
  verifyPassword,
} from "./_lib/security.mts";

async function coachPasswordHash() {
  const stored = await authStore().get("users/coach.json", { type: "json" }) as any;
  return { hash: stored?.passwordHash || process.env.HWBT_COACH_PASSWORD_HASH || "", mustChangePassword: !stored?.passwordHash };
}

async function login(req: Request) {
  const body = await readJson<{ username?: string; password?: string; role?: string }>(req, 8 * 1024);
  const username = String(body.username || "");
  const password = String(body.password || "");
  const requestedRole = body.role === "coach" ? "coach" : "player";
  if (!username || !password || password.length > 128) {
    dummyPasswordCheck(password);
    throw new Error("AUTH_FAILED");
  }
  await enforceLoginRateLimit(req, username);

  if (requestedRole === "coach") {
    const coachCredential = await coachPasswordHash();
    if (normalizeLogin(username) !== "coach" || !coachCredential.hash || !verifyPassword(password, coachCredential.hash)) {
      dummyPasswordCheck(password);
      throw new Error("AUTH_FAILED");
    }
    const created = createSession({ role: "coach", name: "Coach" });
    await audit("auth.login", created.session);
    return json(
      { ok: true, csrfToken: created.session.csrf, mustChangePassword: coachCredential.mustChangePassword, user: { role: "coach", name: "Coach" } },
      { headers: { "Set-Cookie": created.cookie } },
    );
  }

  const store = dataStore();
  const state = await store.get(STATE_KEY, { type: "json" }) as any;
  const normalized = normalizeLogin(username);
  const player = Array.isArray(state?.players)
    ? state.players.find((item: any) => [item?.code, item?.name, item?.firstName, item?.lastName].filter(Boolean).some((v: unknown) => normalizeLogin(v) === normalized))
    : null;
  if (!player || !Number.isInteger(Number(player.id))) {
    dummyPasswordCheck(password);
    throw new Error("AUTH_FAILED");
  }
  const authKey = `users/player-${Number(player.id)}.json`;
  const stored = await authStore().get(authKey, { type: "json" }) as any;
  let valid = !!stored?.passwordHash && verifyPassword(password, stored.passwordHash);
  if (!valid && !stored?.passwordHash && typeof player.playerPassword === "string") {
    valid = normalizeLogin(password) === normalizeLogin(player.playerPassword);
    if (valid) await authStore().setJSON(authKey, { passwordHash: hashPassword(password), updatedAt: new Date().toISOString() });
  }
  if (!valid) {
    if (!stored?.passwordHash) dummyPasswordCheck(password);
    throw new Error("AUTH_FAILED");
  }

  if (await migrateLegacyPasswords(state)) {
    const clean = sanitizeState(state);
    clean._version = currentVersion(state) + 1;
    clean.serverSavedAt = new Date().toISOString();
    await store.setJSON(STATE_KEY, clean);
    await saveVersionedBackup(store, clean, "credential-migration");
  }
  const created = createSession({ role: "player", playerId: Number(player.id), name: String(player.name || player.code || "Joueur") });
  await audit("auth.login", created.session);
  return json(
    { ok: true, csrfToken: created.session.csrf, user: { role: "player", playerId: Number(player.id), name: created.session.name } },
    { headers: { "Set-Cookie": created.cookie } },
  );
}

async function session(req: Request) {
  const current = readSession(req);
  if (!current) return json({ authenticated: false }, { status: 401 });
  return json({
    authenticated: true,
    csrfToken: current.csrf,
    user: { role: current.role, playerId: current.playerId, name: current.name },
  });
}

async function logout(req: Request) {
  const current = requireSession(req);
  requireCsrf(req, current);
  await audit("auth.logout", current);
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}

async function playerPassword(req: Request) {
  const current = requireSession(req, ["coach"]);
  requireCsrf(req, current);
  const body = await readJson<{ playerId?: number; password?: string }>(req, 8 * 1024);
  const playerId = Number(body.playerId);
  const password = validateNewPassword(body.password);
  const state = await dataStore().get(STATE_KEY, { type: "json" }) as any;
  if (!Array.isArray(state?.players) || !state.players.some((player: any) => Number(player.id) === playerId)) {
    return json({ error: "Joueur introuvable" }, { status: 404 });
  }
  await authStore().setJSON(`users/player-${playerId}.json`, { passwordHash: hashPassword(password), updatedAt: new Date().toISOString() });
  await audit("auth.player_password_changed", current, { playerId });
  return json({ ok: true });
}

async function coachPassword(req: Request) {
  const current = requireSession(req, ["coach"]);
  requireCsrf(req, current);
  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(req, 8 * 1024);
  const existing = await coachPasswordHash();
  if (!existing.hash || !verifyPassword(String(body.currentPassword || ""), existing.hash)) {
    return json({ error: "Mot de passe actuel incorrect" }, { status: 401 });
  }
  const password = validateNewPassword(body.newPassword);
  await authStore().setJSON("users/coach.json", { passwordHash: hashPassword(password), updatedAt: new Date().toISOString() });
  await audit("auth.coach_password_changed", current);
  return json({ ok: true });
}

export default async (req: Request, _context: Context) => {
  try {
    const action = new URL(req.url).pathname.split("/").filter(Boolean).pop();
    if (action === "login" && req.method === "POST") {
      try {
        return await login(req);
      } catch (error) {
        if (error instanceof Error && error.message === "AUTH_FAILED") return json({ error: "Identifiant ou mot de passe incorrect" }, { status: 401 });
        throw error;
      }
    }
    if (action === "session" && req.method === "GET") return await session(req);
    if (action === "logout" && req.method === "POST") return await logout(req);
    if (action === "player-password" && req.method === "POST") return await playerPassword(req);
    if (action === "coach-password" && req.method === "POST") return await coachPassword(req);
    return json({ error: "Route introuvable" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
};

export const config: Config = {
  path: "/api/auth/*",
  method: ["GET", "POST"],
};
