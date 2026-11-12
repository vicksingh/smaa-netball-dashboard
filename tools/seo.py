"""Search-engine pass for the club dashboards: title/description, canonical,
share previews (Open Graph), structured data, a readable "about + teams"
section, robots.txt and sitemap.xml. Run once per repo; safe to re-run."""
import json, re, sys, html
from datetime import date

TODAY = date.today().isoformat()
H = html.escape

CLUBS = {
  "smaa-netball-dashboard": dict(
    url="https://smaa.scozo.com.au/", short="SMAA", full="St Michael & All Angels",
    org_name="St Michael & All Angels Netball Club", site="https://www.smaanetballclub.com.au/",
    playhq="https://www.playhq.com/netball-australia/org/st-michael-and-all-angels/72bc9771",
    comp="SAUCNA Summer Juniors and Open 2026/27",
    where="SA United Church Netball Association (SAUCNA) venues around Adelaide",
    title="SMAA Netball Fixtures & Results | St Michael & All Angels | SAUCNA 2026/27",
    desc="This week's SMAA netball fixtures, game times, courts and results for every St Michael & All Angels junior and open team in SAUCNA Summer 2026/27. Live from PlayHQ.",
    teams=[("Juniors", "U8: 8A, 8B, 8C, 8D · U9: 9A, 9B, 9C, 9D · U11: 11A, 11B, 11C, 11D, 11E, 11F · U13: 13A, 13B, 13C, 13D, 13E, 13F, 13G · U15: 15A, 15B, 15C, 15D, 15E · U17: 17A"),
           ("Open", "Teams A to H, in grades A1, A2, A5, C5, D3 and E1")],
    prefix="SMAA"),
  "metrojets-dashboard": dict(
    url="https://jets.scozo.com.au/", short="Metro Jets", full="Metro Jets",
    org_name="Metro Jets Netball Club", site="https://metrojets.com.au/",
    playhq="https://www.playhq.com/netball-australia/org/metro-jets/601b914e",
    comp="Netball SA City Night Division 1, Summer 2026/27",
    where="Netball SA Stadium, Mile End, Adelaide",
    title="Metro Jets Netball Fixtures & Results | City Night Division 1 2026/27",
    desc="This week's Metro Jets netball fixtures, game times, courts and results for every team in Netball SA City Night Division 1, Summer 2026/27. Live from PlayHQ.",
    teams=[("Sub Primary", "1, 2"), ("Primary", "3, 4B, 5A, 6A, 6B"), ("Sub Junior", "3, 4, 5, 6B, 7"),
           ("Junior", "3, 4, 5B, 6, 7 (Blue and White)"), ("Inter", "2, 3, 4A, 4B"), ("Seniors", "A1, B3, C1")],
    prefix="Metro Jets"),
  "contax-dashboard": dict(
    url="https://contax.scozo.com.au/", short="Contax", full="Contax",
    org_name="Contax Netball Club", site="https://www.contax.net.au/",
    playhq="https://www.playhq.com/netball-australia/org/contax/a8ee2320",
    comp="Netball SA City Night Division 1, Summer 2026/27",
    where="Netball SA Stadium, Mile End, Adelaide",
    title="Contax Netball Fixtures & Results | City Night Division 1 2026/27",
    desc="This week's Contax netball fixtures, game times, courts and results for every Contax team in Netball SA City Night Division 1, Summer 2026/27. Live from PlayHQ.",
    teams=[("Sub Primary", "1, 2"), ("Primary", "1/2 (Blue and Pink), 3, 4A, 5A"), ("Sub Junior", "1, 2, 3, 4, 5, 6A, 7"),
           ("Junior", "1, 2, 3, 4, 5A, 6"), ("Inter", "1 (Blue and Pink), 2, 3, 4A, 4B"), ("Seniors", "A1, A2, B1, B2, B3, B5")],
    prefix="Contax"),
  "morialta-dashboard": dict(
    url="https://mnc.scozo.com.au/", short="Morialta", full="Morialta Uniting",
    org_name="Morialta Uniting Netball Club", site="https://www.morialtauca.org.au/netball",
    playhq="https://www.playhq.com/netball-australia/org/morialta-uniting/46cdd3a1",
    comp="SAUCNA Summer Juniors and Open 2026/27",
    where="SA United Church Netball Association (SAUCNA) venues around Adelaide",
    title="Morialta Netball Fixtures & Results | Morialta Uniting | SAUCNA 2026/27",
    desc="This week's Morialta netball fixtures, game times, courts and results for every Morialta Uniting junior and open team in SAUCNA Summer 2026/27. Live from PlayHQ.",
    teams=[("Juniors", "U8: 8A · U9: 9A, 9B · U11: 11A, 11B, 11C, 11D · U13: 13A, 13B, 13C, 13D, 13E, 13F · U15: Black 15A, Green 15B, 15C, 15D, 15E, 15F · U17: Black 17A, Green 17B, 17C, 17D, 17E"),
           ("Open", "Teams A to G, in grades A1, A3, B1, B4, D2, D5 and E3")],
    prefix="Morialta"),
  "henley-sharks": dict(
    url="https://henley.scozo.com.au/", short="Henley Sharks", full="Henley Sharks",
    org_name="Henley Sharks Netball Club", site=None,
    playhq="https://www.playhq.com/netball-australia/org/henley-sharks-netball-club/e234a948",
    comp="SAUCNA Summer Juniors and Open 2026/27",
    where="SA United Church Netball Association (SAUCNA) venues around Adelaide",
    title="Henley Sharks Netball Fixtures & Results | SAUCNA 2026/27",
    desc="This week's Henley Sharks netball fixtures, game times, courts and results for every junior and open team in SAUCNA Summer 2026/27. Live from PlayHQ.",
    teams=[("Juniors", "U8: 8A, 8B · U9: 9A · U11: 11A, Blue 11B, Silver 11C, 11D, 11E · U13: 13A, 13B, 13C, 13D · U15: 15A, 15B, 15C, 15D, 15E · U17: 17A"),
           ("Open", "Teams A to H, in grades A1, A4, B1, B2, B4, B5, C3 and D1")],
    prefix="Henley Sharks"),
  "matrics-dashboard": dict(
    url="https://matrics.scozo.com.au/", short="Matrics", full="Matrics",
    org_name="Matrics Netball Club", site="https://www.matricsnetball.com.au/",
    playhq="https://www.playhq.com/netball-australia/org/matrics/0969cc64",
    comp="Netball SA City Night Division 1, Summer 2026/27",
    where="Netball SA Stadium, Mile End, Adelaide",
    title="Matrics Netball Fixtures & Results | City Night Division 1 2026/27",
    desc="This week's Matrics netball fixtures, game times, courts and results for every Matrics, Matrics Gold and Matrics Maroon team in Netball SA City Night Division 1, Summer 2026/27. Live from PlayHQ.",
    teams=[("Sub Primary", "1A (Gold and Maroon), 2"), ("Primary", "1/2 (Gold and Maroon), 3 (Gold and Maroon), 4A, 5B (two teams)"),
           ("Sub Junior", "1, 2, 3 (two teams), 4, 5, 6A"), ("Junior", "1, 2 (Gold and Maroon), 3, 4 (Gold and Maroon), 5A, 6"),
           ("Inter", "1, 2 (Gold and Maroon), 3, 4A (Gold and Maroon)"), ("Seniors", "A1, A2 (Gold and Maroon), B2")],
    prefix="Matrics"),
}

ABOUT_CSS = """
/* About + team list: plain text search engines can read without running the page's code. */
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.about { margin: 4px 0 18px; color: var(--muted); font-size: 13px; line-height: 1.55; }
.about h2 { font-size: 15px; color: var(--ink); margin: 0 0 6px; }
.about h3 { font-size: 13px; color: var(--ink); margin: 12px 0 4px; }
.about p { margin: 0 0 6px; }
.about a { color: inherit; }
"""

def run(repo: str):
    c = CLUBS[repo]
    p = f"/home/claude/{repo}/index.html"
    s = open(p).read()
    logo = re.search(r'<header[\s\S]*?<img src="(assets/[^"]+)"', s).group(1)
    logo_abs = c["url"] + logo

    # 1) title + description (replace whatever is there)
    s = re.sub(r"<title>.*?</title>", f"<title>{H(c['title'])}</title>", s, count=1)
    s = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{H(c["desc"])}">', s, count=1)

    # 2) canonical, share previews, structured data (drop an earlier copy first)
    s = re.sub(r"\n<!-- seo:start -->[\s\S]*?<!-- seo:end -->", "", s)
    same_as = [x for x in [c["site"], c["playhq"]] if x]
    ld = {
      "@context": "https://schema.org",
      "@graph": [
        {"@type": "WebPage", "@id": c["url"], "url": c["url"], "name": c["title"], "description": c["desc"],
         "inLanguage": "en-AU", "dateModified": TODAY,
         "about": {"@id": c["url"] + "#club"},
         "publisher": {"@type": "Organization", "name": "ScoZo", "url": "https://scozo.com.au/"}},
        {"@type": "SportsOrganization", "@id": c["url"] + "#club", "name": c["org_name"], "alternateName": c["short"],
         "sport": "Netball", "logo": logo_abs,
         **({"url": c["site"]} if c["site"] else {}),
         "address": {"@type": "PostalAddress", "addressLocality": "Adelaide", "addressRegion": "SA", "addressCountry": "AU"},
         "sameAs": same_as},
      ],
    }
    head = f"""
<!-- seo:start -->
<link rel="canonical" href="{c['url']}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ScoZo Matchday">
<meta property="og:locale" content="en_AU">
<meta property="og:url" content="{c['url']}">
<meta property="og:title" content="{H(c['short'])} Netball Fixtures &amp; Results">
<meta property="og:description" content="{H(c['desc'])}">
<meta property="og:image" content="{c['url']}assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{H(c['short'])} netball fixtures and results">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<!-- seo:end -->"""
    anchor = re.search(r'<meta name="description" content="[^"]*">', s)
    s = s[:anchor.end()] + head + s[anchor.end():]

    # 3) h1 that says what the page is (visually still "Matchday")
    s = re.sub(r"<h1>Matchday(?:<span class=\"sr-only\">.*?</span>)?</h1>",
               f'<h1>Matchday<span class="sr-only"> · {H(c["short"])} netball fixtures &amp; results</span></h1>', s, count=1)

    # 4) readable about + team list, just above the small print in the footer
    s = re.sub(r'\n  <section class="about"[\s\S]*?</section>', "", s)
    teams = "\n".join(f"    <p><b>{H(k)}:</b> {H(v)}</p>" for k, v in c["teams"])
    links = f'<a href="{c["playhq"]}" rel="noopener">PlayHQ</a>'
    if c["site"]:
        links = f'<a href="{c["site"]}" rel="noopener">{H(c["org_name"])} website</a> · ' + links
    about = f"""
  <section class="about" aria-labelledby="aboutTitle">
    <h2 id="aboutTitle">{H(c['short'])} netball fixtures &amp; results</h2>
    <p>Draw, game times, courts and scores for every {H(c['full'])} team in {H(c['comp'])}. Games are played at {H(c['where'])}. Results update live from PlayHQ, so this page is always current.</p>
    <h3>{H(c['prefix'])} teams this season</h3>
{teams}
    <p>{links}</p>
  </section>"""
    i = s.index('  <p class="fine">')
    s = s[:i].rstrip(" ") + about.lstrip("\n") + "\n  " + s[i:].lstrip(" ")

    # 5) CSS once
    if ".about {" not in s:
        s = s.replace("</style>", ABOUT_CSS + "</style>", 1)
    open(p, "w").write(s)

    # 6) robots + sitemap
    open(f"/home/claude/{repo}/robots.txt", "w").write(f"User-agent: *\nAllow: /\n\nSitemap: {c['url']}sitemap.xml\n")
    open(f"/home/claude/{repo}/sitemap.xml", "w").write(
      f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      f'  <url><loc>{c["url"]}</loc><lastmod>{TODAY}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n</urlset>\n')
    print(repo, "ok", logo)

if __name__ == "__main__":
    for r in (sys.argv[1:] or CLUBS):
        run(r)


def llms(repo: str):
    """llms.txt: a plain summary for AI assistants (see llmstxt.org)."""
    c = CLUBS[repo]
    teams = "\n".join(f"- {k}: {v}" for k, v in c["teams"])
    site = f"\n- [{c['org_name']} website]({c['site']}): the club's own site" if c["site"] else ""
    txt = f"""# {c['short']} Netball Matchday

> Live fixtures and results for every {c['full']} netball team in {c['comp']}. Shows this week's games (date, time, court, opponent, home or away) and recent scores, grouped by age or grade. Data comes from PlayHQ each time the page opens; this page is an unofficial fan-made view by ScoZo, not the club's official site.

Games are played at {c['where']}. Fixtures change weekly, so for a specific game time or score, open the live page rather than relying on this file.

## Live page

- [{c['short']} fixtures & results]({c['url']}): this week's games and results, with a Results tab and a Teams tab (tap a team for its full season)

## Teams this season

{teams}

## Sources

- [PlayHQ club page]({c['playhq']}): the official fixture source{site}
- [ScoZo Netball Scorer](https://apps.apple.com/au/app/scozo-netball-scorer/id6760931216): free netball scoring app by the same maker
"""
    open(f"/home/claude/{repo}/llms.txt", "w").write(txt)
