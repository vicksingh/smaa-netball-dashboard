# SMAA Netball Matchday

A one-page dashboard for St Michael & All Angels junior netball. It shows this week's games and results, grouped by age group (U8 to U17), and pulls fresh data from PlayHQ every time it opens.

## How it works

- `index.html` is the whole dashboard: one file, no build step. GitHub Pages hosts it.
- PlayHQ won't let other websites read its data straight from a browser. So the page asks a small Supabase Edge Function (`supabase/functions/smaa-playhq`), which fetches from PlayHQ server-side and hands back one tidy JSON bundle.
- The function caches for 60 seconds, so lots of parents opening the page at once only costs PlayHQ one fetch.
- The page keeps the last copy on the phone, so it opens instantly and still works with patchy wifi at the courts.

## New season

When the next season starts, change `DEFAULT_SEASON` in the function (the code after the season name in the PlayHQ teams URL, e.g. `.../saucna-summer-juniors-summer-202627/e2eff7a5/teams` → `e2eff7a5`), and update the `PLAYHQ_TEAM` link path in `index.html`.
