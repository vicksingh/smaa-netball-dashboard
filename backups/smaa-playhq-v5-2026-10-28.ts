// Club dashboards — PlayHQ messenger (SMAA, Metro Jets)
// Fetches a club's teams and fixtures from PlayHQ's public fixture feed and
// returns one tidy JSON bundle the dashboard can read. Only clubs in CLUBS
// below are allowed, so this can't be used as a general PlayHQ proxy.
// Read-only, public data only.
//
// Saved copy: the last good bundle per club/season lives in the database
// (club_dashboard_cache), shared by every copy of this function and kept while
// it sleeps. Visits within 60 seconds of the last fetch are answered from it,
// so PlayHQ is asked at most about once a minute per club. If PlayHQ refuses,
// the saved copy is served instead of an error.

const PLAYHQ = "https://api.playhq.com/graphql";
const TENANT = "netball-australia";
// PlayHQ org ID -> club key + name. SMAA is the default (its page sends no org).
const CLUBS: Record<string, { key: string; name: string }> = {
  "72bc9771": { key: "smaa", name: "St Michael & All Angels" },
  "601b914e": { key: "metro-jets", name: "Metro Jets" },
};
const DEFAULT_ORG = "72bc9771";
const DEFAULT_SEASON = "e2eff7a5"; // SAUCNA Summer Juniors, Summer 2026/27
const FRESH_MS = 60_000;        // reuse a saved copy younger than this
const PARALLEL = 3;             // PlayHQ requests in flight at once (gentle)
const RETRY_DELAYS = [500, 1500]; // wait before 2nd and 3rd attempts

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const TEAMS_Q = `query($org:ID!,$season:ID!){
  discoverTeams(filter:{organisationID:$org, seasonID:$season}){ id name grade { id name } }
}`;

const FIXTURE_Q = `query($t:ID!){ discoverTeamFixture(teamID:$t){
  name provisionalDates
  fixture {
    games {
      id date status { value name }
      home { ... on DiscoverTeam { id name } ... on ProvisionalTeam { name } }
      away { ... on DiscoverTeam { id name } ... on ProvisionalTeam { name } }
      result { home { score outcome { value name } } away { score outcome { value name } } }
      allocation { time court { name venue { name } } }
    }
    byes { ... on DiscoverTeam { id name } }
  }
} }`;

type Json = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One PlayHQ request, retried on refusals (429/5xx) and network hiccups.
async function gql(query: string, variables: Json): Promise<Json> {
  let lastErr = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt) await sleep(RETRY_DELAYS[attempt - 1] + Math.random() * 300);
    try {
      const res = await fetch(PLAYHQ, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant": TENANT,
          "origin": "https://www.playhq.com",
          "referer": "https://www.playhq.com/",
        },
        body: JSON.stringify({ query, variables }),
      });
      const text = await res.text();
      let body: Json = {};
      try { body = JSON.parse(text); } catch { /* not JSON */ }
      if (res.ok && !body.errors && body.data) return body.data;
      lastErr = `PlayHQ ${res.status}: ${(body.errors ? JSON.stringify(body.errors) : text).slice(0, 200)}`;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) break;
    } catch (e) {
      lastErr = `PlayHQ network error: ${String(e).slice(0, 200)}`;
    }
  }
  throw new Error(lastErr);
}

// "SMAA Matt S 11A" -> 11 ; falls back to the grade "11U/1" -> 11
function ageOf(name: string, grade?: string): number | null {
  const m = name.match(/(\d{1,2})\s*[A-Z]\s*$/i);
  if (m) return Number(m[1]);
  const g = grade?.match(/^(\d{1,2})U/i);
  return g ? Number(g[1]) : null;
}

async function buildTeam(t: Json) {
  const rounds: Json[] = (await gql(FIXTURE_Q, { t: t.id })).discoverTeamFixture ?? [];
  const games: Json[] = [];
  rounds.forEach((r, idx) => {
    const fx = r.fixture;
    if (!fx) {
      games.push({ round: r.name, roundNo: idx + 1, confirmed: false });
      return;
    }
    if ((fx.byes ?? []).some((b: Json) => b?.id === t.id)) {
      games.push({ round: r.name, roundNo: idx + 1, confirmed: true, bye: true });
    }
    for (const g of fx.games ?? []) {
      const isHome = g.home?.id === t.id;
      const isAway = g.away?.id === t.id;
      if (!isHome && !isAway) continue;
      const us = isHome ? g.result?.home : g.result?.away;
      const them = isHome ? g.result?.away : g.result?.home;
      games.push({
        round: r.name,
        roundNo: idx + 1,
        confirmed: true,
        id: g.id,
        date: g.date ?? null,
        time: g.allocation?.time ?? null,
        venue: g.allocation?.court?.venue?.name ?? null,
        court: g.allocation?.court?.name ?? null,
        home: isHome,
        opponent: (isHome ? g.away?.name : g.home?.name) ?? "TBC",
        status: g.status?.value ?? null,
        statusLabel: g.status?.name ?? null,
        score: us?.score ?? null,
        oppScore: them?.score ?? null,
        outcome: us?.outcome?.value ?? null,
        outcomeLabel: us?.outcome?.name ?? null,
      });
    }
  });
  return {
    id: t.id,
    name: t.name,
    grade: t.grade?.name ?? null,
    age: ageOf(t.name, t.grade?.name),
    games,
  };
}

// ---------- database helpers (service role, server-side only) ----------
const SB_URL = Deno.env.get("SUPABASE_URL");
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const sbHeaders = () => ({ apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" });

type Saved = { body: string; at: number };

async function loadSaved(org: string, season: string): Promise<Saved | null> {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/club_dashboard_cache?select=body,fetched_at&org=eq.${org}&season=eq.${season}&limit=1`,
      { headers: sbHeaders() },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows?.[0]?.body) return null;
    return { body: rows[0].body, at: Date.parse(rows[0].fetched_at) };
  } catch {
    return null;
  }
}

async function storeSaved(org: string, season: string, body: string, at: number): Promise<void> {
  if (!SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/club_dashboard_cache?on_conflict=org,season`, {
      method: "POST",
      headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ org, season, body, fetched_at: new Date(at).toISOString() }),
    });
  } catch { /* best effort */ }
}

// Adds one to today's visit count and notes the phone's random ID (once per
// day). Also real database activity, which stops Supabase pausing the project.
function bumpVisit(club: string, device: string | null): Promise<void> {
  if (!SB_URL || !SB_KEY) return Promise.resolve();
  return fetch(`${SB_URL}/rest/v1/rpc/club_record_visit`, {
    method: "POST",
    headers: sbHeaders(),
    body: JSON.stringify({ p_club: club, p_device: device }),
  }).then(() => {}, () => {});
}

function inBackground(p: Promise<void>) {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(() => {});
}

// ---------- build a fresh bundle ----------
async function build(org: string, season: string, previous: Json | null) {
  // If this fails, the whole fetch fails and the saved copy is used instead.
  const teams: Json[] = (await gql(TEAMS_Q, { org, season })).discoverTeams ?? [];
  const prevById = new Map<string, Json>((previous?.teams ?? []).map((t: Json) => [t.id, t]));
  const out: Json[] = [];
  let failed = 0;
  const queue = [...teams];
  const workers = Array.from({ length: PARALLEL }, async () => {
    while (queue.length) {
      const t = queue.shift()!;
      try {
        out.push(await buildTeam(t));
      } catch (e) {
        failed++;
        // Keep this team's last good games rather than showing an empty season.
        const prev = prevById.get(t.id);
        out.push(prev ? { ...prev, stale: true } : {
          id: t.id, name: t.name, grade: t.grade?.name ?? null,
          age: ageOf(t.name, t.grade?.name), games: [], error: String(e).slice(0, 200),
        });
      }
    }
  });
  await Promise.all(workers);
  if (failed) console.error(`[${CLUBS[org].key}] ${failed}/${teams.length} team fixtures failed; kept last good copies where available`);
  out.sort((a, b) => (a.age ?? 99) - (b.age ?? 99) || a.name.localeCompare(b.name));
  return { club: CLUBS[org].name, season, orgId: org, fetchedAt: new Date().toISOString(), teams: out };
}

// Within one running copy: memory copy + one shared in-flight fetch per club/season,
// so a burst of visitors triggers a single PlayHQ refresh.
const memory = new Map<string, Saved>();
const inflight = new Map<string, Promise<Saved>>();

async function getBundle(org: string, season: string): Promise<{ body: string; source: string }> {
  const key = `${org}:${season}`;
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && now - mem.at < FRESH_MS) return { body: mem.body, source: "memory" };

  const saved = await loadSaved(org, season);
  const best = [mem, saved].filter(Boolean).sort((a, b) => b!.at - a!.at)[0] as Saved | undefined;
  if (best && now - best.at < FRESH_MS) {
    memory.set(key, best);
    return { body: best.body, source: "saved" };
  }

  let job = inflight.get(key);
  if (!job) {
    job = (async () => {
      let previous: Json | null = null;
      try { previous = best ? JSON.parse(best.body) : null; } catch { /* ignore */ }
      const bundle = await build(org, season, previous);
      const fresh: Saved = { body: JSON.stringify(bundle), at: Date.parse(bundle.fetchedAt) };
      memory.set(key, fresh);
      inBackground(storeSaved(org, season, fresh.body, fresh.at));
      return fresh;
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
  }

  try {
    const fresh = await job;
    return { body: fresh.body, source: "fresh" };
  } catch (e) {
    console.error(`[${CLUBS[org].key}] PlayHQ refresh failed: ${String(e)}`);
    if (best) return { body: best.body, source: "fallback" };
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const org = (url.searchParams.get("org") ?? DEFAULT_ORG).replace(/[^a-z0-9]/gi, "").slice(0, 16);
  if (!CLUBS[org]) {
    return new Response(JSON.stringify({ error: "Unknown club" }), { status: 403, headers: { ...CORS, "content-type": "application/json" } });
  }
  const season = (url.searchParams.get("season") ?? DEFAULT_SEASON).replace(/[^a-z0-9]/gi, "").slice(0, 16);
  // Count each page open once: a page marks one of its requests with count=1.
  // (SMAA's page predates that, so its Juniors request counts.)
  const count = url.searchParams.get("count") === "1" ||
    (!url.searchParams.has("count") && org === DEFAULT_ORG && season === DEFAULT_SEASON);
  // d = the phone's random ID (made and kept on the phone); only used for counting.
  const rawDevice = (url.searchParams.get("d") ?? "").toLowerCase();
  const device = /^[a-z0-9-]{8,40}$/.test(rawDevice) ? rawDevice : null;
  if (count) inBackground(bumpVisit(CLUBS[org].key, device));

  try {
    const { body, source } = await getBundle(org, season);
    return new Response(body, { headers: { ...CORS, "content-type": "application/json", "x-cache": source } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { ...CORS, "content-type": "application/json" } });
  }
});
