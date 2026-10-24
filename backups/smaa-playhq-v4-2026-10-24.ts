// Club dashboards — PlayHQ messenger (SMAA, Metro Jets)
// Fetches a club's teams and fixtures from PlayHQ's public fixture feed and
// returns one tidy JSON bundle the dashboard can read. Only clubs in CLUBS
// below are allowed, so this can't be used as a general PlayHQ proxy.
// Read-only, public data only. Results are cached for 60 seconds so a
// crowd of parents opening the page at once doesn't hammer PlayHQ.

const PLAYHQ = "https://api.playhq.com/graphql";
const TENANT = "netball-australia";
// PlayHQ org ID -> club key + name. SMAA is the default (its page sends no org).
const CLUBS: Record<string, { key: string; name: string }> = {
  "72bc9771": { key: "smaa", name: "St Michael & All Angels" },
  "601b914e": { key: "metro-jets", name: "Metro Jets" },
};
const DEFAULT_ORG = "72bc9771";
const DEFAULT_SEASON = "e2eff7a5"; // SAUCNA Summer Juniors, Summer 2026/27
const CACHE_MS = 60_000;

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

async function gql(query: string, variables: Json): Promise<Json> {
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
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) {
    throw new Error(`PlayHQ ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
  }
  return body.data;
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

const cache = new Map<string, { at: number; body: string }>();

// Adds one to today's visit count in the database, and notes the phone's random
// ID (once per day) so we can count different phones. This is also real database
// activity, which stops Supabase pausing the free project. It never blocks or
// breaks the response.
const SB_URL = Deno.env.get("SUPABASE_URL");
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
function bumpVisit(club: string, device: string | null): Promise<void> {
  if (!SB_URL || !SB_KEY) return Promise.resolve();
  return fetch(`${SB_URL}/rest/v1/rpc/club_record_visit`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ p_club: club, p_device: device }),
  }).then(() => {}, () => {});
}
function inBackground(p: Promise<void>) {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(() => {});
}

async function build(org: string, season: string) {
  const teams: Json[] = (await gql(TEAMS_Q, { org, season })).discoverTeams ?? [];
  // A few at a time keeps us polite to PlayHQ while staying quick.
  const out: Json[] = [];
  const queue = [...teams];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const t = queue.shift()!;
      try {
        out.push(await buildTeam(t));
      } catch (e) {
        out.push({ id: t.id, name: t.name, grade: t.grade?.name ?? null, age: ageOf(t.name, t.grade?.name), games: [], error: String(e) });
      }
    }
  });
  await Promise.all(workers);
  out.sort((a, b) => (a.age ?? 99) - (b.age ?? 99) || a.name.localeCompare(b.name));
  return {
    club: CLUBS[org].name,
    season,
    orgId: org,
    fetchedAt: new Date().toISOString(),
    teams: out,
  };
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
  const key = `${org}:${season}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return new Response(hit.body, { headers: { ...CORS, "content-type": "application/json", "x-cache": "hit" } });
  }
  try {
    const body = JSON.stringify(await build(org, season));
    cache.set(key, { at: Date.now(), body });
    return new Response(body, { headers: { ...CORS, "content-type": "application/json", "x-cache": "miss" } });
  } catch (e) {
    if (hit) {
      return new Response(hit.body, { headers: { ...CORS, "content-type": "application/json", "x-cache": "stale" } });
    }
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { ...CORS, "content-type": "application/json" } });
  }
});
