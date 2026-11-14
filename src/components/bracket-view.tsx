import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/league-views";
import { friendlyError, formatKes } from "@/lib/tournament";
import { currentRound, publicBracketQuery, roundLabel, type BracketData, type BracketMatch } from "@/lib/bracket";
import { cn } from "@/lib/utils";

const PLACE = ["", "1st", "2nd", "3rd"];

function usePlayers(data: BracketData) {
  return useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
}

/** Public knockout bracket: pick a round, see every match in it. */
export function BracketView({ data }: { data: BracketData }) {
  const players = usePlayers(data);
  const [picked, setPicked] = useState<number | null>(null);
  const round = picked ?? currentRound(data.matches, data.rounds);
  const inRound = data.matches.filter((m) => m.round === round && !m.third_place && m.status !== "bye");
  const byeNames = data.matches.filter((m) => m.round === round && m.status === "bye").map((m) => players.get(m.winner_id ?? "")?.gamer_tag).filter(Boolean) as string[];
  const third = data.matches.find((m) => m.round === round && m.third_place);
  const winners = data.prize.winners ?? [];
  const total = data.matches.filter((m) => m.status !== "bye").length;
  const played = data.matches.filter((m) => m.status === "confirmed").length;

  if (data.rounds === 0) return <p className="panel p-6 text-muted-foreground">The bracket is drawn by the organiser once the season starts.</p>;

  return (
    <div>
      {winners.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {winners.slice(0, 3).map((w) => (
            <div key={w.place} className={cn("panel flex items-center gap-3 p-3", w.place === 1 && "border-primary/60")}>
              <Trophy className={cn("h-7 w-7 shrink-0", w.place === 1 ? "text-primary" : "text-accent")} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{w.gamer_tag}</p>
                <p className="text-xs text-muted-foreground">{w.place === 1 ? "Champion" : PLACE[w.place]} · {formatKes(w.prize_kes)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mb-3 text-sm text-muted-foreground">Knockout: lose once and you are out. {played} of {total} matches played.</p>
      <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Choose a round">
        {Array.from({ length: data.rounds }, (_, i) => i + 1).map((r) => (
          <Pill key={r} active={round === r} onClick={() => setPicked(r)} className="shrink-0">{roundLabel(r, data.rounds)}</Pill>
        ))}
      </div>

      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {inRound.map((m) => <MatchCard key={m.id} m={m} players={players} />)}
      </ul>
      {byeNames.length > 0 && (
        <p className="mt-4 rounded-lg border border-border p-3 text-sm text-muted-foreground">
          <b className="text-foreground">Bye into the next round ({byeNames.length}):</b> {byeNames.join(", ")}
        </p>
      )}
      {third && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">3rd place match</p>
          <ul className="grid gap-3 md:grid-cols-2"><MatchCard m={third} players={players} /></ul>
        </div>
      )}
    </div>
  );
}

function MatchCard({ m, players }: { m: BracketMatch; players: Map<string, { gamer_tag: string; team_name: string | null }> }) {
  const row = (id: string | null, score: number | null) => {
    const p = id ? players.get(id) : null;
    const won = !!id && m.winner_id === id && m.status !== "pending";
    return (
      <div className={cn("flex items-center gap-2", m.status === "confirmed" && !won && "text-muted-foreground")}>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", won ? "font-bold text-primary" : "font-semibold", !p && "font-normal italic text-muted-foreground")}>{p ? p.gamer_tag : "To be decided"}</span>
          {p?.team_name && <span className="block truncate text-xs text-muted-foreground">{p.team_name}</span>}
        </span>
        {won && <Check className="h-4 w-4 text-primary" aria-label="Winner" />}
        <span className="w-8 text-center font-display text-xl font-bold">{m.status === "confirmed" ? score : ""}</span>
      </div>
    );
  };
  return (
    <li className={cn("panel space-y-3 p-3", m.status === "bye" && "opacity-70")}>
      {row(m.a_id, m.score_a)}
      <div className="h-px bg-border" />
      {row(m.b_id, m.score_b)}
      <p className="text-xs text-muted-foreground">
        {m.status === "bye" ? "Bye: goes straight through" : m.status === "confirmed" ? (m.penalties ? "Decided on penalties" : "Full time") : m.a_id && m.b_id ? "To be played" : "Waiting for the earlier round"}
      </p>
    </li>
  );
}

/** Admin: enter results for the running knockout. Winners move on automatically; the season ends after the final and the 3rd-place match. */
export function KnockoutAdmin() {
  const q = useQuery(publicBracketQuery());
  const data = q.data;
  const players = usePlayers(data ?? { season: { number: 0, status: "running", format: "knockout" }, rounds: 0, prize: {}, players: [], matches: [] });
  const [picked, setPicked] = useState<number | null>(null);
  if (!data || data.season.format !== "knockout" || data.season.status !== "running") return null;
  const round = picked ?? currentRound(data.matches, data.rounds);
  const list = data.matches.filter((m) => m.round === round && m.status !== "bye").sort((a, b) => Number(a.third_place) - Number(b.third_place) || a.slot - b.slot);
  const byeNames = data.matches.filter((m) => m.round === round && m.status === "bye").map((m) => players.get(m.winner_id ?? "")?.gamer_tag).filter(Boolean) as string[];

  return (
    <div className="panel mt-5 p-5">
      <h3 className="text-2xl font-bold uppercase">Season {data.season.number} knockout <span className="text-sm font-normal text-muted-foreground">enter results here</span></h3>
      <p className="mt-1 text-sm text-muted-foreground">Winners move to the next round automatically. When the final and the 3rd-place match are both recorded, the season ends and the winners are locked in.</p>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Choose a round">
        {Array.from({ length: data.rounds }, (_, i) => i + 1).map((r) => (
          <Pill key={r} active={round === r} onClick={() => setPicked(r)} className="shrink-0">{roundLabel(r, data.rounds)}</Pill>
        ))}
      </div>
      <ul className="mt-4 space-y-3">
        {list.map((m) => <ResultRow key={`${m.id}-${m.status}-${m.score_a}-${m.score_b}`} m={m} players={players} />)}
      </ul>
      {byeNames.length > 0 && (
        <p className="mt-3 rounded-lg border border-border p-3 text-sm text-muted-foreground"><b className="text-foreground">Bye into the next round ({byeNames.length}):</b> {byeNames.join(", ")}. No result needed.</p>
      )}
    </div>
  );
}

function ResultRow({ m, players }: { m: BracketMatch; players: Map<string, { gamer_tag: string; team_name: string | null }> }) {
  const qc = useQueryClient();
  const a = m.a_id ? players.get(m.a_id) : null;
  const b = m.b_id ? players.get(m.b_id) : null;
  const [sa, setSa] = useState(m.score_a?.toString() ?? "");
  const [sb, setSb] = useState(m.score_b?.toString() ?? "");
  const [pen, setPen] = useState<string>(m.penalties ? (m.winner_id ?? "") : "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const level = sa !== "" && sb !== "" && Number(sa) === Number(sb);
  const label = m.third_place ? "3rd place match" : `Match ${m.slot}`;

  if (!a || !b) {
    return <li className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">{label}: waiting for the earlier round to finish.</li>;
  }

  async function save() {
    if (sa === "" || sb === "") { toast.error("Enter both scores."); return; }
    if (level && !pen) { toast.error("Scores are level. Choose who won on penalties."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("admin_record_knockout_result", { _match: m.id, _score_a: Number(sa), _score_b: Number(sb), ...(level ? { _winner: pen } : {}) });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Result saved");
    setEditing(false);
    for (const k of ["public-bracket", "public-league", "admin-league", "public-tournament"]) qc.invalidateQueries({ queryKey: [k] });
  }

  const done = m.status === "confirmed" && !editing;
  return (
    <li className="rounded-lg border border-border p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className={cn("break-words text-right font-semibold leading-tight", done && m.winner_id === m.a_id && "text-primary")}>{a.gamer_tag}</span>
        <div className="flex items-center gap-1">
          <Input inputMode="numeric" type="number" min={0} max={99} value={sa} onChange={(e) => setSa(e.target.value)} disabled={done} className="h-10 w-14 px-2 text-center" aria-label={`${a.gamer_tag} score`} />
          <span className="text-muted-foreground">-</span>
          <Input inputMode="numeric" type="number" min={0} max={99} value={sb} onChange={(e) => setSb(e.target.value)} disabled={done} className="h-10 w-14 px-2 text-center" aria-label={`${b.gamer_tag} score`} />
        </div>
        <span className={cn("break-words font-semibold leading-tight", done && m.winner_id === m.b_id && "text-primary")}>{b.gamer_tag}</span>
      </div>
      {level && !done && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-muted-foreground">Level. Winner on penalties:</span>
          <Pill active={pen === m.a_id} onClick={() => setPen(m.a_id!)}>{a.gamer_tag}</Pill>
          <Pill active={pen === m.b_id} onClick={() => setPen(m.b_id!)}>{b.gamer_tag}</Pill>
        </div>
      )}
      <div className="mt-3 flex items-center justify-center gap-2">
        {done ? (
          <>
            <span className="text-sm text-muted-foreground">{m.penalties ? "Decided on penalties" : "Full time"}</span>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Correct result</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="hero" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save result"}</Button>
            {editing && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
          </>
        )}
      </div>
    </li>
  );
}
