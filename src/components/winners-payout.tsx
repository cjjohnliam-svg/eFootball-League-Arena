import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildRows, groupLetter, overallTable, publicLeagueQuery, seasonComplete } from "@/lib/league";
import { formatKes } from "@/lib/tournament";
import { cn } from "@/lib/utils";

type PayWinner = { place: number; gamer_tag: string; team_name: string | null; points: number; prize_kes: number; group?: number };
type Contact = { gamer_tag: string; phone: string; status: string; seasons: { number: number } | null };

const ORDINAL = ["", "1st", "2nd", "3rd"];
const MEDAL = ["", "🥇", "🥈", "🥉"];

/** 0712 345 678, +254 712 345 678 and 712345678 all become 254712345678 (the format wa.me needs). */
export function toIntl(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("254")) return d;
  if (d.length === 10 && d.startsWith("0")) return "254" + d.slice(1);
  if (d.length === 9 && /^[17]/.test(d)) return "254" + d;
  if (d.length >= 11 && d.length <= 15) return d; // another country code, used as typed
  return null;
}
const prettyPhone = (intl: string | null) => (intl && intl.startsWith("254") && intl.length === 12 ? `0${intl.slice(3, 6)} ${intl.slice(6, 9)} ${intl.slice(9)}` : intl ? `+${intl}` : "No number");

function payoutMessage(w: PayWinner, season: number, phone: string | null, payTime: string) {
  return [
    `Hi ${w.gamer_tag}, congratulations! 🏆`,
    ``,
    `You finished ${ORDINAL[w.place]} in Season ${season} of eFootball Arena Kenya, and your prize is ${formatKes(w.prize_kes)}.`,
    ``,
    `To send it to you, please reply with:`,
    `1️⃣ The M-Pesa number that should receive the reward`,
    `2️⃣ The full name registered on that M-Pesa number`,
    `3️⃣ Is it the same number we are chatting on${phone ? ` (${prettyPhone(phone)})` : ""}, or a different one?`,
    ``,
    `Rewards are settled by ${payTime || "the time announced"}. Thank you for playing, and well done! ⚽`,
    `– eFootball Arena Kenya`,
  ].join("\n");
}

/** A tick that survives a refresh, kept in this browser only. */
function useLocalFlag(key: string) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try { setOn(localStorage.getItem(key) === "1"); } catch { /* storage blocked */ }
  }, [key]);
  const set = (v: boolean) => {
    setOn(v);
    try { v ? localStorage.setItem(key, "1") : localStorage.removeItem(key); } catch { /* storage blocked */ }
  };
  return [on, set] as const;
}

/** Admin tab: the season's top three, each with a ready-to-send WhatsApp message to arrange the payout. */
export function WinnersPayout() {
  const [season, setSeason] = useState<number | undefined>(undefined);
  const [payTime, setPayTime] = useState("6 pm");
  useEffect(() => {
    try { const v = localStorage.getItem("winners-pay-time"); if (v) setPayTime(v); } catch { /* storage blocked */ }
  }, []);

  const league = useQuery(publicLeagueQuery(season));
  const contacts = useQuery({
    queryKey: ["admin-winner-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("registrations").select("gamer_tag, phone, status, seasons(number)");
      if (error) throw error;
      return (data ?? []) as unknown as Contact[];
    },
  });

  const lg = league.data;
  const winners: PayWinner[] = useMemo(() => {
    if (!lg) return [];
    if (lg.prize.winners && lg.prize.winners.length > 0) return lg.prize.winners.map((w) => ({ place: w.place, gamer_tag: w.gamer_tag, team_name: w.team_name, points: w.points, prize_kes: w.prize_kes }));
    const played = lg.fixtures.some((f) => f.status === "confirmed");
    if (!played) return [];
    const prizes = [lg.prize.first_kes, lg.prize.second_kes, lg.prize.third_kes];
    return overallTable(buildRows(lg.groups, lg.fixtures)).slice(0, 3).map((r, i) => ({ place: i + 1, gamer_tag: r.gamer_tag, team_name: r.team_name, points: r.points, prize_kes: prizes[i] ?? 0, group: r.group_number }));
  }, [lg]);

  const phoneFor = (tag: string) => {
    const hit = (contacts.data ?? []).find((c) => c.seasons?.number === lg?.season.number && c.gamer_tag === tag && c.status === "verified");
    return toIntl(hit?.phone);
  };

  const openMatches = lg ? lg.fixtures.filter((f) => f.status !== "confirmed").length : 0;
  const ended = lg?.season.status === "completed";
  const final = lg ? ended || seasonComplete(lg.fixtures) : false;
  const pickable = (lg?.seasons ?? []).filter((s) => s.status !== "registration");

  return (
    <section className="mt-6">
      <h2 className="text-3xl font-bold uppercase">Winners &amp; payouts</h2>
      <p className="mt-1 text-sm text-muted-foreground">Message each winner on WhatsApp to confirm where their reward should be sent. The message is ready to go and can be edited first.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="winners-season">Season</Label>
          <select
            id="winners-season"
            value={season ?? lg?.season.number ?? ""}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {pickable.map((s) => (
              <option key={s.number} value={s.number}>
                Season {s.number} · {s.status === "running" ? "running" : "ended"}
              </option>
            ))}
            {pickable.length === 0 && <option value="">No season yet</option>}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="winners-time">Payout time shown in the message</Label>
          <Input
            id="winners-time"
            value={payTime}
            onChange={(e) => {
              setPayTime(e.target.value);
              try { localStorage.setItem("winners-pay-time", e.target.value); } catch { /* storage blocked */ }
            }}
            placeholder="6 pm"
            className="h-10"
          />
        </div>
      </div>

      {league.isLoading && <p className="mt-5 text-muted-foreground">Loading winners…</p>}
      {league.error && <p className="mt-5 text-destructive">Couldn't load the league. Please refresh.</p>}

      {lg && (
        <div className={cn("mt-5 rounded-lg border px-4 py-3 text-sm", final ? "border-primary/40 bg-primary/10" : "border-border bg-muted/40")}>
          {ended
            ? `Season ${lg.season.number} has ended. These winners are locked in.`
            : final
              ? `All matches are played, so these are the final standings. Ending the season locks the winners in.`
              : `Provisional: ${openMatches} match${openMatches === 1 ? " is" : "es are"} still to be played. Wait for the final results before paying out.`}
          {" "}Prize pool {formatKes(lg.prize.prize_pool_kes)}.
        </div>
      )}

      {lg && winners.length === 0 && <p className="mt-5 text-muted-foreground">No confirmed results yet, so there are no winners to show.</p>}

      <div className="mt-5 space-y-4">
        {winners.map((w) => (
          <WinnerCard key={`${lg?.season.number}-${w.place}-${w.gamer_tag}`} w={w} season={lg!.season.number} phone={phoneFor(w.gamer_tag)} payTime={payTime} />
        ))}
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        The Contacted and Paid ticks are saved in this browser only. Check each winner's M-Pesa name before sending money.
      </p>
    </section>
  );
}

function WinnerCard({ w, season, phone, payTime }: { w: PayWinner; season: number; phone: string | null; payTime: string }) {
  const key = `winner:${season}:${w.place}:${w.gamer_tag}`;
  const [contacted, setContacted] = useLocalFlag(`${key}:contacted`);
  const [paid, setPaid] = useLocalFlag(`${key}:paid`);
  const [custom, setCustom] = useState<string | null>(null);
  const generated = payoutMessage(w, season, phone, payTime);
  const text = custom ?? generated;
  const link = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Message copied");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it by hand.");
    }
  }

  return (
    <article className={cn("panel p-4 sm:p-5", paid && "border-primary")}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-2xl" aria-hidden="true">{MEDAL[w.place]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{ORDINAL[w.place]} place{w.group ? ` · Group ${groupLetter(w.group)}` : ""}</p>
          <h3 className="break-words text-xl font-bold">{w.gamer_tag}</h3>
          <p className="break-words text-sm text-muted-foreground">{[w.team_name, `${w.points} pts`].filter(Boolean).join(" · ")}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Prize</span>
        <span className="flex items-center gap-2">
          {paid && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">Paid</span>}
          <span className="font-display text-2xl font-bold text-primary">{formatKes(w.prize_kes)}</span>
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">WhatsApp number:</span>
        <span className={cn("font-semibold", !phone && "text-destructive")}>{phone ? prettyPhone(phone) : "Not found. Check the registration list"}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {link ? (
          <Button asChild className="bg-[#25D366] font-bold text-[#06210f] hover:bg-[#20bd5a]">
            <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => setContacted(true)}>
              <MessageCircle className="h-4 w-4" /> Message on WhatsApp
            </a>
          </Button>
        ) : (
          <Button disabled className="font-bold"><MessageCircle className="h-4 w-4" /> Message on WhatsApp</Button>
        )}
        <Button type="button" variant="outline" onClick={copy}><Copy className="h-4 w-4" /> Copy message</Button>
        {phone && (
          <Button asChild variant="outline" aria-label={`Call ${w.gamer_tag}`}>
            <a href={`tel:+${phone}`}><Phone className="h-4 w-4" /> Call</a>
          </Button>
        )}
      </div>

      <details className="mt-3 rounded-lg border border-border">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold">Preview or edit the message</summary>
        <div className="space-y-2 border-t border-border p-3">
          <Textarea value={text} onChange={(e) => setCustom(e.target.value)} rows={11} className="text-sm" aria-label={`Message to ${w.gamer_tag}`} />
          {custom !== null && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setCustom(null)}>Reset to the standard message</Button>
          )}
        </div>
      </details>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={contacted} onChange={(e) => setContacted(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" /> Contacted
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" /> Paid
        </label>
      </div>
    </article>
  );
}
