import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

const STORE_NAME = "hwbt-academy";
const STATE_KEY = "state/current.json";

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });
}

export default async (req: Request, _context: Context) => {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  if (req.method === "GET") {
    const state = await store.get(STATE_KEY, { type: "json" });
    return json({ state: state || null });
  }

  if (req.method === "POST") {
    const state = await req.json();
    const savedAt = new Date().toISOString();
    const payload = {
      ...state,
      serverSavedAt: savedAt,
    };

    await store.setJSON(STATE_KEY, payload);
    await store.setJSON(`state/backups/${dayKey()}.json`, payload);

    return json({ ok: true, serverSavedAt: savedAt });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = {
  path: "/api/state",
  method: ["GET", "POST"],
};
