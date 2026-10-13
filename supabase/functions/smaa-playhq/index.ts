// SMAA Netball — PlayHQ messenger
// Fetches St Michael & All Angels teams and fixtures from PlayHQ's public
// fixture feed and returns one tidy JSON bundle the dashboard can read.
// Read-only, public data only. Results are cached for 60 seconds so a
// crowd of parents opening the page at once doesn't hammer PlayHQ.

const PLAYHQ = "https://api.playhq.com/graphql";
const TENANT = "netball-australia";
const ORG_ID = "72bc9771"; // St Michael & All Angels
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

async function build(season: string) {
  const teams: Json[] = (await gql(TEAMS_Q, { org: ORG_ID, season })).discoverTeams ?? [];
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
    club: "St Michael & All Angels",
    season,
    orgId: ORG_ID,
    fetchedAt: new Date().toISOString(),
    teams: out,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const season = (url.searchParams.get("season") ?? DEFAULT_SEASON).replace(/[^a-z0-9]/gi, "").slice(0, 16);
  const hit = cache.get(season);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return new Response(hit.body, { headers: { ...CORS, "content-type": "application/json", "x-cache": "hit" } });
  }
  try {
    const body = JSON.stringify(await build(season));
    cache.set(season, { at: Date.now(), body });
    return new Response(body, { headers: { ...CORS, "content-type": "application/json", "x-cache": "miss" } });
  } catch (e) {
    if (hit) {
      return new Response(hit.body, { headers: { ...CORS, "content-type": "application/json", "x-cache": "stale" } });
    }
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { ...CORS, "content-type": "application/json" } });
  }
});
