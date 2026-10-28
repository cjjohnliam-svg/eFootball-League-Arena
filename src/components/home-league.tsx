import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Pill } from "@/components/league-views";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { buildRows, groupLetter, groupTable, overallTable, publicLeagueQuery, useLiveFixtures, type Fixture, type TableRow } from "@/lib/league";

type Tab = "standings" | "fixtures" | "results";
const PREVIEW_ROWS = 10;
const PREVIEW_MATCHES = 10;

const initials = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/**
 * Homepage preview of the live league: standings, upcoming fixtures and latest results.
 * Shows the running season, or the most recent finished one when none is running.
 */
export function HomeLeague() {
  useLiveFixtures();
  const { data, isLoading, error } = useQuery(publicLeagueQuery());
  const [tab, setTab] = useState<Tab>("standings");
  const [view, setView] = useState<"overall" | number>("overall");

  const groups = data?.groups ?? [];
  const fixtures = data?.fixtures ?? [];
  const rows = useMemo(() => buildRows(groups, fixtures), [groups, fixtures]);
  const names = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const scoped = (f: Fixture) => view === "overall" || f.group_number === view;
  const table = view === "overall" ? overallTable(rows) : groupTable(rows, view);

  const upcoming = fixtures
    .filter((f) => f.status !== "confirmed" && scoped(f))
    .sort((a, b) => a.round - b.round || a.group_number - b.group_number)
    .slice(0, PREVIEW_MATCHES);
  const results = fixtures
    .filter((f) => f.status === "confirmed" && scoped(f))
    .sort((a, b) => b.round - a.round || a.group_number - b.group_number)
    .slice(0, PREVIEW_MATCHES);

  const status = data?.season.status;
  const badge = !data ? null : status === "running" ? "Live" : status === "completed" ? "Final table" : "Sign-ups open";

  return (
    <section className="mx-auto max-w-6xl px-4 pt-6 md:pt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">{data ? `Season ${data.season.number}` : "League"}</p>
          <h2 className="text-2xl font-extrabold uppercase md:text-4xl">League table &amp; fixtures</h2>
        </div>
        <div className="flex items-center gap-3">
          {badge && (
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase", status === "running" ? "border-primary/40 text-primary" : "border-border text-muted-foreground")}>
              {status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
              {badge}
            </span>
          )}
          <Link to="/league" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            Full league <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="panel overflow-hidden">
        {/* Tabs */}
        <div role="tablist" aria-label="League view" className="flex border-b border-border">
          {(["standings", "fixtures", "results"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "relative flex-1 px-4 py-3 text-sm font-bold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none sm:px-6",
                tab === t ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
              {tab === t && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        {/* Overall / group pills */}
        {groups.length > 0 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-4 py-3" role="group" aria-label="Choose a group">
            <Pill active={view === "overall"} onClick={() => setView("overall")} className="shrink-0 uppercase">Overall</Pill>
            {groups.map((g) => (
              <Pill key={g.group_number} active={view === g.group_number} onClick={() => setView(g.group_number)} className="shrink-0 uppercase">
                Group {groupLetter(g.group_number)}
              </Pill>
            ))}
          </div>
        )}

        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
          {isLoading ? (
            <Skeleton className="h-80 rounded-xl" />
          ) : error ? (
            <p className="p-4 text-destructive">Couldn't load the league. Please refresh.</p>
          ) : tab === "standings" ? (
            <Standings rows={table} showGroup={view === "overall"} />
          ) : tab === "fixtures" ? (
            <Matches list={upcoming} names={names} empty="No upcoming matches yet. Fixtures appear once a group has all 8 players verified." />
          ) : (
            <Matches list={results} names={names} empty="No results yet." />
          )}
        </div>

        <div className="border-t border-border px-4 py-3 text-center">
          <Link to="/league" className="text-sm font-semibold text-primary hover:underline">
            {tab === "standings" ? "View full table" : tab === "fixtures" ? "All fixtures" : "All results"} →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Standings({ rows, showGroup }: { rows: TableRow[]; showGroup: boolean }) {
  if (rows.length === 0) return <p className="p-6 text-center text-muted-foreground">No confirmed players yet. Register to claim your place in the table.</p>;
  const shown = rows.slice(0, PREVIEW_ROWS);
  const cols = "grid-cols-[2rem_minmax(0,1fr)_2rem_3.5rem_2.25rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_3.5rem_5.5rem_3.5rem]";
  return (
    <div>
      <div className={cn("grid items-center gap-1 rounded-lg bg-muted/60 px-2 py-2 text-xs font-bold uppercase text-muted-foreground sm:px-3", cols)}>
        <span className="text-center">#</span>
        <span>Player</span>
        <span className="text-center">MP</span>
        <span className="text-center">G</span>
        <span className="text-center">PTS</span>
      </div>
      <ol>
        {shown.map((r, i) => (
          <li key={r.id} className={cn("grid items-center gap-1 border-b border-border/50 px-2 py-2.5 last:border-b-0 sm:px-3", cols)}>
            <span
              className={cn(
                "mx-auto grid h-6 w-6 place-items-center rounded-md font-display text-sm font-bold sm:h-7 sm:w-7",
                i < 3 ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
              aria-label={`Position ${i + 1}`}
            >
              {i + 1}
            </span>
            <span className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="grid h-7 w-7 shrink-0 sm:h-9 sm:w-9 place-items-center rounded-full border border-border bg-muted font-display text-xs font-bold text-accent sm:text-sm" aria-hidden="true">
                {initials(r.team_name ?? r.gamer_tag)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.gamer_tag}</span>
                {(r.team_name || showGroup) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {[r.team_name, showGroup ? `Group ${groupLetter(r.group_number)}` : null].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </span>
            <span className="text-center text-sm">{r.played}</span>
            <span className="text-center text-sm">{r.gf}:{r.ga}</span>
            <span className="text-center font-display text-lg font-bold text-primary">{r.points}</span>
          </li>
        ))}
      </ol>
      {rows.length > PREVIEW_ROWS && <p className="px-3 pt-2 text-center text-xs text-muted-foreground">Showing the top {PREVIEW_ROWS} of {rows.length} players</p>}
    </div>
  );
}

function Matches({ list, names, empty }: { list: Fixture[]; names: Map<string, TableRow>; empty: string }) {
  if (list.length === 0) return <p className="p-6 text-center text-muted-foreground">{empty}</p>;
  const label = (id: string) => names.get(id)?.gamer_tag ?? "—";
  const rounds = [...new Set(list.map((f) => f.round))];
  return (
    <div className="space-y-3">
      {rounds.map((round) => (
        <div key={round}>
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs font-bold uppercase text-muted-foreground">Round {round}</p>
          <ul>
            {list.filter((f) => f.round === round).map((f) => {
              const confirmed = f.status === "confirmed";
              const noShow = confirmed && f.result_type === "no_show";
              return (
                <li key={f.id} className="grid grid-cols-[1.5rem_1fr_auto_1fr] items-center gap-2 border-b border-border/50 px-2 py-2.5 text-sm last:border-b-0 sm:px-3">
                  <span className="text-xs font-bold text-muted-foreground">{groupLetter(f.group_number)}</span>
                  <span className="truncate text-right font-semibold">{label(f.home_id)}</span>
                  <span
                    className={cn(
                      "min-w-[64px] rounded-md px-2 py-1 text-center font-display text-base font-bold",
                      noShow ? "bg-muted text-muted-foreground line-through" : confirmed ? "bg-primary/15 text-primary" : f.status === "disputed" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {confirmed ? (noShow ? "No-show" : `${f.home_score} - ${f.away_score}`) : f.status === "disputed" ? "Disputed" : "vs"}
                  </span>
                  <span className="truncate font-semibold">{label(f.away_id)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
