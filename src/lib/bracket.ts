import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BracketMatch = {
  id: string;
  round: number;
  slot: number;
  third_place: boolean;
  a_id: string | null;
  b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  winner_id: string | null;
  status: "pending" | "confirmed" | "bye";
  penalties: boolean;
};
export type BracketPlayer = { id: string; gamer_tag: string; team_name: string | null };
export type BracketWinner = { place: number; gamer_tag: string; team_name: string | null; prize_kes: number };
export type BracketData = {
  season: { number: number; status: "registration" | "running" | "completed"; format: "league" | "knockout" };
  rounds: number;
  prize: { prize_pool_kes?: number; winners?: BracketWinner[] };
  players: BracketPlayer[];
  matches: BracketMatch[];
};

/** Knockout bracket for a season. Returns null (not an error) if the knockout SQL has not been installed yet. */
export const publicBracketQuery = (season?: number) =>
  queryOptions({
    queryKey: ["public-bracket", season ?? "default"],
    queryFn: async (): Promise<BracketData | null> => {
      const { data, error } = await supabase.rpc("get_public_bracket", season ? { _season: season } : {});
      if (error) return null;
      return (data as unknown as BracketData | null) ?? null;
    },
    staleTime: 10_000,
    retry: false,
  });

export function roundLabel(round: number, rounds: number) {
  const left = rounds - round + 1; // rounds still to play including this one
  if (left === 1) return "Final";
  if (left === 2) return "Semi-finals";
  if (left === 3) return "Quarter-finals";
  return `Round of ${2 ** left}`;
}

/** The round players are currently waiting on: first round with a playable pending match, else the final. */
export function currentRound(m: BracketMatch[], rounds: number) {
  const open = m.filter((x) => x.status === "pending" && x.a_id && x.b_id).map((x) => x.round);
  return open.length ? Math.min(...open) : Math.max(rounds, 1);
}

/** Smallest power of two that holds n players, and how many of them get a bye in round 1. */
export function bracketShape(n: number) {
  let size = 2;
  while (size < n) size *= 2;
  return { size, byes: size - n, firstRoundMatches: size / 2 - (size - n) };
}
