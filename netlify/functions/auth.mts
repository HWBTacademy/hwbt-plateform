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
  minorPlatformApproved,
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

  if (!minorPlatformApproved(player)) {
    await audit("auth.minor_consent_required", { role: "player", sub: `player:${Number(player.id)}` }, { playerId: Number(player.id) });
    return json({ error: "Accès mineur en attente de l’autorisation parentale" }, { status: 403 });
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

function playerIds(value: any): number[] {
  return (Array.isArray(value?.playerIds) ? value.playerIds : [value?.playerId]).map(Number).filter(Number.isInteger);
}

function deleteObjectKeys(value: any, playerId: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = { ...value };
  delete copy[String(playerId)];
  delete copy[`player-${playerId}`];
  return copy;
}

function redactValue(value: any, terms: string[]): any {
  if (typeof value === "string") {
    let result = value;
    for (const term of terms.filter(Boolean)) result = result.split(term).join("Joueur supprimé");
    return result;
  }
  if (Array.isArray(value)) return value.map(item => redactValue(item, terms));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, terms)]));
  }
  return value;
}

function prunePlayerData(rawState: any, playerId: number) {
  const state = sanitizeState(rawState);
  const player = state.players.find((item: any) => Number(item?.id) === playerId);
  const terms = player
    ? [String(player.name || ""), String(player.code || ""), String(player.email || ""), String(player.phone || "")].filter(value => value.length >= 3)
    : [];
  state.players = state.players.filter((item: any) => Number(item?.id) !== playerId);
  state.matches = state.matches.filter((match: any) => !playerIds(match).includes(playerId));
  state.sessions = state.sessions
    .map((session: any) => {
      const ids = playerIds(session).filter(id => id !== playerId);
      if (!ids.length) return null;
      const copy = redactValue({ ...session, playerIds: ids, playerId: ids[0] }, terms);
      if (copy.playerFeedbackByPlayer && typeof copy.playerFeedbackByPlayer === "object") delete copy.playerFeedbackByPlayer[String(playerId)];
      return copy;
    })
    .filter(Boolean);
  state.customExercises = redactValue(state.customExercises, terms);
  state.testResults = deleteObjectKeys(redactValue(state.testResults, terms), playerId);
  state.commandCenter = redactValue(state.commandCenter, terms);
  state.contentStudio = redactValue(state.contentStudio, terms);
  state.performanceLab = redactValue(state.performanceLab, terms);
  if (state.performanceLab?.players) state.performanceLab.players = deleteObjectKeys(state.performanceLab.players, playerId);
  return state;
}

async function anonymizeAuditForPlayer(playerId: number) {
  const store = authStore();
  for await (const page of store.list({ prefix: "audit/", paginate: true })) {
    for (let index = 0; index < page.blobs.length; index += 20) {
      await Promise.all(page.blobs.slice(index, index + 20).map(async blob => {
        const entry = await store.get(blob.key, { type: "json" }) as any;
        if (!entry || typeof entry !== "object") return;
        if (entry.actor !== `player:${playerId}` && Number(entry.playerId) !== playerId) return;
        const clean = { ...entry, actor: entry.actor === `player:${playerId}` ? "erased-player" : entry.actor };
        delete clean.playerId;
        await store.setJSON(blob.key, clean);
      }));
    }
  }
}

async function rewriteBackupsWithoutPlayer(playerId: number) {
  const store = dataStore();
  for await (const page of store.list({ prefix: "state/backups/", paginate: true })) {
    for (let index = 0; index < page.blobs.length; index += 20) {
      await Promise.all(page.blobs.slice(index, index + 20).map(async blob => {
        const backup = await store.get(blob.key, { type: "json" }) as any;
        if (!backup || typeof backup !== "object") return;
        const cleaned = prunePlayerData(backup, playerId);
        await store.setJSON(blob.key, cleaned);
      }));
    }
  }
}

async function deletePlayer(req: Request) {
  const current = requireSession(req, ["coach"]);
  requireCsrf(req, current);
  const body = await readJson<{ playerId?: number; expectedVersion?: number }>(req, 8 * 1024);
  const playerId = Number(body.playerId);
  if (!Number.isInteger(playerId)) return json({ error: "Joueur invalide" }, { status: 400 });
  const store = dataStore();
  const state = await store.get(STATE_KEY, { type: "json" }) as any;
  if (!Array.isArray(state?.players) || !state.players.some((player: any) => Number(player?.id) === playerId)) {
    return json({ error: "Joueur introuvable" }, { status: 404 });
  }
  const version = currentVersion(state);
  if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) !== version) {
    return json({ error: "Les données ont été modifiées ailleurs", version }, { status: 409 });
  }
  const cleaned = prunePlayerData(state, playerId);
  cleaned._version = version + 1;
  cleaned.serverSavedAt = new Date().toISOString();
  await rewriteBackupsWithoutPlayer(playerId);
  await anonymizeAuditForPlayer(playerId);
  await store.setJSON(STATE_KEY, cleaned);
  await authStore().delete(`users/player-${playerId}.json`);
  await saveVersionedBackup(store, cleaned, "player-erasure");
  await audit("player.erased", current, { erasedRecord: true, version: cleaned._version });
  return json({ ok: true, version: cleaned._version });
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
    if (action === "delete-player" && req.method === "POST") return await deletePlayer(req);
    return json({ error: "Route introuvable" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
};

export const config: Config = {
  path: "/api/auth/*",
  method: ["GET", "POST"],
};
