import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { getStore } from "@netlify/blobs";

export const DATA_STORE = "hwbt-academy";
export const AUTH_STORE = "hwbt-auth";
export const STATE_KEY = "state/current.json";
export const SESSION_COOKIE = "__Host-hwbt_session";
export const MAX_JSON_BYTES = 5 * 1024 * 1024;

export type Role = "coach" | "player";
export type Session = {
  sub: string;
  role: Role;
  playerId?: number;
  name?: string;
  csrf: string;
  iat: number;
  exp: number;
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return json({ error: error.message }, { status: error.status });
  }
  console.error("HWBT server error", error instanceof Error ? error.message : "unknown");
  return json({ error: "Erreur serveur" }, { status: 500 });
}

function sessionSecret() {
  const value = process.env.HWBT_SESSION_SECRET || "";
  if (value.length < 32) throw new HttpError(503, "Sécurité serveur non configurée");
  return value;
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function cookieValue(req: Request, name: string) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

export function createSession(identity: { role: Role; playerId?: number; name?: string }) {
  const now = Math.floor(Date.now() / 1000);
  const session: Session = {
    sub: identity.role === "coach" ? "coach" : `player:${identity.playerId}`,
    role: identity.role,
    ...(identity.playerId ? { playerId: identity.playerId } : {}),
    ...(identity.name ? { name: identity.name } : {}),
    csrf: randomBytes(24).toString("base64url"),
    iat: now,
    exp: now + 12 * 60 * 60,
  };
  const payload = encode(JSON.stringify(session));
  const token = `${payload}.${sign(payload)}`;
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${12 * 60 * 60}; HttpOnly; Secure; SameSite=Strict`;
  return { session, cookie };
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function readSession(req: Request): Session | null {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (!session || !["coach", "player"].includes(session.role)) return null;
    if (!session.csrf || !session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    if (session.role === "player" && !Number.isInteger(session.playerId)) return null;
    return session;
  } catch {
    return null;
  }
}

export function requireSession(req: Request, allowed?: Role[]) {
  const session = readSession(req);
  if (!session) throw new HttpError(401, "Connexion requise");
  if (allowed && !allowed.includes(session.role)) throw new HttpError(403, "Accès refusé");
  return session;
}

export function requireSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const expected = new URL(req.url).origin;
  if (!origin || origin !== expected) throw new HttpError(403, "Origine refusée");
}

export function requireCsrf(req: Request, session: Session) {
  requireSameOrigin(req);
  const token = req.headers.get("x-csrf-token") || "";
  if (!token || !safeEqual(token, session.csrf)) throw new HttpError(403, "Jeton de sécurité invalide");
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = MAX_JSON_BYTES): Promise<T> {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Contenu JSON requis");
  }
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new HttpError(413, "Requête trop volumineuse");
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new HttpError(413, "Requête trop volumineuse");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value as T;
  } catch {
    throw new HttpError(400, "JSON invalide");
  }
}

export function normalizeLogin(value: unknown) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
}

export function hashPassword(password: string) {
  const normalized = password.normalize("NFKC");
  const salt = randomBytes(16);
  const derived = scryptSync(normalized, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, encoded: string) {
  try {
    const [algorithm, n, r, p, saltValue, hashValue, extra] = encoded.split("$");
    if (algorithm !== "scrypt" || extra) return false;
    const expected = Buffer.from(hashValue, "base64url");
    const actual = scryptSync(password.normalize("NFKC"), Buffer.from(saltValue, "base64url"), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

const dummyPasswordHash = hashPassword("not-a-real-hwbt-password");

export function dummyPasswordCheck(password: string) {
  verifyPassword(password, dummyPasswordHash);
}

export function validateNewPassword(password: unknown) {
  const value = String(password || "").normalize("NFKC");
  if (value.length < 12) throw new HttpError(400, "Le mot de passe doit contenir au moins 12 caractères");
  if (value.length > 128) throw new HttpError(400, "Mot de passe trop long");
  return value;
}

export function dataStore() {
  return getStore({ name: DATA_STORE, consistency: "strong" });
}

export function authStore() {
  return getStore({ name: AUTH_STORE, consistency: "strong" });
}

export function currentVersion(state: any) {
  return Math.max(0, Number(state?._version) || 0);
}

export function sanitizeState(input: any) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const cleanPlayers = Array.isArray(source.players)
    ? source.players.slice(0, 500).filter((p: any) => p && typeof p === "object").map((player: any) => {
        const clean = { ...player };
        delete clean.playerPassword;
        delete clean.password;
        delete clean.passwordHash;
        return clean;
      })
    : [];
  return {
    players: cleanPlayers,
    sessions: Array.isArray(source.sessions) ? source.sessions.slice(0, 5000) : [],
    matches: Array.isArray(source.matches) ? source.matches.slice(0, 5000) : [],
    customExercises: Array.isArray(source.customExercises) ? source.customExercises.slice(0, 5000) : [],
    testResults: source.testResults && typeof source.testResults === "object" ? source.testResults : {},
    commandCenter: source.commandCenter && typeof source.commandCenter === "object" ? source.commandCenter : {},
    contentStudio: source.contentStudio && typeof source.contentStudio === "object" ? source.contentStudio : {},
    performanceLab: source.performanceLab && typeof source.performanceLab === "object" ? source.performanceLab : {},
    finance: source.finance && typeof source.finance === "object" ? source.finance : {},
    _version: currentVersion(source),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt.slice(0, 64) : new Date().toISOString(),
    serverSavedAt: typeof source.serverSavedAt === "string" ? source.serverSavedAt.slice(0, 64) : undefined,
  };
}

function sessionHasPlayer(session: any, playerId: number) {
  const ids = Array.isArray(session?.playerIds) ? session.playerIds : [session?.playerId];
  return ids.map(Number).includes(playerId);
}

function ownKeyedObject(value: any, playerId: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  for (const key of [String(playerId), `player-${playerId}`]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = value[key];
  }
  return result;
}

export function stateForPlayer(rawState: any, playerId: number) {
  const state = sanitizeState(rawState);
  const player = state.players.find((item: any) => Number(item.id) === playerId);
  if (!player) throw new HttpError(403, "Compte joueur introuvable");
  const ownPlayer = { ...player } as Record<string, unknown>;
  for (const key of [
    "phone", "email", "billingName", "billingVat", "billingAddress", "billingPostalCode", "billingCity",
    "parentFirstName", "parentLastName", "parentPhone", "parentEmail", "parent2FirstName", "parent2LastName",
    "parent2Phone", "parent2Email",
  ]) delete ownPlayer[key];
  const ownSessions = state.sessions.filter((session: any) => sessionHasPlayer(session, playerId));
  const ownMatches = state.matches.filter((match: any) => Number(match?.playerId) === playerId);
  const performance = state.performanceLab && typeof state.performanceLab === "object" ? state.performanceLab as any : {};
  return {
    players: [ownPlayer],
    sessions: ownSessions,
    matches: ownMatches,
    customExercises: [],
    testResults: ownKeyedObject(state.testResults, playerId),
    commandCenter: {},
    contentStudio: {},
    performanceLab: { players: ownKeyedObject(performance.players, playerId), notes: [] },
    finance: { payments: [], invoiceSeq: 1, settings: {}, defaults: {} },
    updatedAt: state.updatedAt,
    serverSavedAt: state.serverSavedAt,
  };
}

export async function migrateLegacyPasswords(state: any) {
  if (!state || !Array.isArray(state.players)) return false;
  const store = authStore();
  let changed = false;
  for (const player of state.players) {
    const plain = typeof player?.playerPassword === "string" ? player.playerPassword : "";
    if (plain && Number.isInteger(Number(player.id))) {
      const key = `users/player-${Number(player.id)}.json`;
      const existing = await store.get(key, { type: "json" }) as any;
      if (!existing?.passwordHash) {
        await store.setJSON(key, { passwordHash: hashPassword(plain), updatedAt: new Date().toISOString() });
      }
    }
    if (player && Object.prototype.hasOwnProperty.call(player, "playerPassword")) {
      delete player.playerPassword;
      changed = true;
    }
  }
  return changed;
}

export async function audit(action: string, session: Partial<Session>, details: Record<string, unknown> = {}) {
  try {
    const store = authStore();
    const at = new Date().toISOString();
    const suffix = randomBytes(8).toString("hex");
    await store.setJSON(`audit/${at.slice(0, 10)}/${at}-${suffix}.json`, {
      at,
      action,
      actor: session.sub || "anonymous",
      role: session.role || "anonymous",
      ...details,
    });
  } catch (error) {
    console.error("HWBT audit log failure", error instanceof Error ? error.message : "unknown");
  }
}

export async function saveVersionedBackup(store: ReturnType<typeof dataStore>, state: any, reason: string) {
  const at = new Date().toISOString();
  const hour = at.slice(0, 13).replace("T", "-");
  await store.setJSON(`state/backups/${at.slice(0, 10)}/${hour}-${reason}.json`, state);
}

function requestFingerprint(req: Request) {
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  return createHash("sha256").update(`${sessionSecret().slice(0, 16)}:${ip}`).digest("hex").slice(0, 32);
}

export async function enforceLoginRateLimit(req: Request, username: string) {
  const store = authStore();
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  const ipKey = `rate/login/ip-${requestFingerprint(req)}-${bucket}.json`;
  const userHash = createHash("sha256").update(normalizeLogin(username)).digest("hex").slice(0, 32);
  const userKey = `rate/login/user-${userHash}-${bucket}.json`;
  for (const [key, limit] of [[ipKey, 20], [userKey, 10]] as const) {
    const current = await store.get(key, { type: "json" }) as any;
    const count = Math.max(0, Number(current?.count) || 0);
    if (count >= limit) throw new HttpError(429, "Trop de tentatives. Réessaie dans quelques minutes.");
    await store.setJSON(key, { count: count + 1, bucket });
  }
}
