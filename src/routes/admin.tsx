diff --git a/src/routes/admin.tsx b/src/routes/admin.tsx
index 884977d..655c423 100644
--- a/src/routes/admin.tsx
+++ b/src/routes/admin.tsx
@@ -1,6 +1,7 @@
 import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
 import { useQuery, useQueryClient } from "@tanstack/react-query";
 import { useEffect, useRef, useState } from "react";
+import { ChevronDown } from "lucide-react";
 import { toast } from "sonner";
 import { supabase } from "@/integrations/supabase/client";
 import { Button } from "@/components/ui/button";
@@ -9,6 +10,8 @@ import { Label } from "@/components/ui/label";
 import { Textarea } from "@/components/ui/textarea";
 import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
 import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
+import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
+import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
 import { PageShell, StatusBadge } from "@/components/site";
 import { useDialogs } from "@/components/dialogs";
 import { formatKes, friendlyError } from "@/lib/tournament";
@@ -118,11 +121,29 @@ function Dashboard() {
     const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "registrations.csv"; a.click();
   }
   const shown = all.filter((r) => !filter || `${r.gamer_tag} ${r.reference} ${r.phone} ${r.status}`.toLowerCase().includes(filter.toLowerCase()));
+  // All registrations, grouped by season (newest first). Only the season open for sign-ups starts expanded.
+  const [openSeasons, setOpenSeasons] = useState<Record<string, boolean>>({});
+  const seasonGroups = (() => {
+    const m = new Map<string, { key: string; label: string; number: number; status: string | null; rows: Reg[] }>();
+    for (const r of shown) {
+      const key = r.seasons ? String(r.seasons.number) : "none";
+      const g = m.get(key) ?? { key, label: r.seasons ? `Season ${r.seasons.number}` : "No season", number: r.seasons?.number ?? -1, status: r.seasons?.status ?? null, rows: [] };
+      g.rows.push(r);
+      m.set(key, g);
+    }
+    return [...m.values()].sort((a, b) => b.number - a.number);
+  })();
 
   return (
     <PageShell kicker="Organiser" title="Dashboard">
       <div className="mb-4 flex justify-end"><Button variant="outline" onClick={logout}>Log out</Button></div>
-      <div className="grid gap-4 sm:grid-cols-4">
+      <Tabs defaultValue="dashboard">
+      <TabsList className="h-11">
+        <TabsTrigger value="dashboard" className="px-4">Dashboard</TabsTrigger>
+        <TabsTrigger value="settings" className="px-4">Tournament settings</TabsTrigger>
+      </TabsList>
+      <TabsContent value="dashboard" forceMount className="data-[state=inactive]:hidden">
+      <div className="mt-4 grid gap-4 sm:grid-cols-4">
         <Card l="Verified" v={String(verified.length)} /><Card l="Pending payments" v={String(pending.length)} />
         <Card l="Verified collections" v={formatKes(collected)} /><OpenSlots verified={verified.length} />
       </div>
@@ -153,21 +174,42 @@ function Dashboard() {
         <Input placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-10 max-w-xs" />
         <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
       </div>
-      <div className="panel mt-4 overflow-x-auto">
-        <table className="w-full text-sm">
-          <thead className="text-left text-muted-foreground"><tr><th className="p-3">Tag</th><th>Season</th><th>Ref</th><th>Status</th><th>Group/Slot</th><th>Code</th><th /></tr></thead>
-          <tbody>{shown.map((r) => { const why = removalReason(r); return (
-            <tr key={r.id} className="border-t border-border"><td className="p-3 font-semibold">{r.gamer_tag}</td><td>{r.seasons ? `S${r.seasons.number}` : "—"}</td><td>{r.reference}</td>
-              <td><StatusBadge status={r.status} />{why && <span className="block max-w-[220px] truncate text-xs text-muted-foreground" title={why}>{why}</span>}</td>
-              <td>{r.tournament_groups ? `${String.fromCharCode(64 + r.tournament_groups.group_number)} / ${r.slot_number}` : "—"}</td><td>{r.payment_submissions[0]?.method === "free_trial" ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">Free trial</span> : r.payment_submissions[0]?.transaction_code}</td>
-              <td className="whitespace-nowrap pr-3 text-right">{r.status === "verified" && r.seasons?.status === "registration" && <Button size="sm" variant="destructive" onClick={() => removePlayer(r)}>Remove</Button>}</td></tr>
-          ); })}</tbody>
-        </table>
+      <div className="mt-4 space-y-3">
+        {seasonGroups.length === 0 && <p className="text-muted-foreground">No registrations found.</p>}
+        {seasonGroups.map((g) => {
+          const isOpen = openSeasons[g.key] ?? (g.status === "registration" || filter !== "");
+          const pendingN = g.rows.filter((r) => r.status === "pending").length;
+          return (
+            <Collapsible key={g.key} open={isOpen} onOpenChange={(v) => setOpenSeasons((m) => ({ ...m, [g.key]: v }))} className={"panel overflow-hidden " + (g.status === "registration" ? "border-primary" : "")}>
+              <CollapsibleTrigger className="group flex w-full items-center gap-3 p-4 text-left" aria-label={`${isOpen ? "Collapse" : "Expand"} ${g.label}`}>
+                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
+                <span className="font-display text-xl font-bold uppercase">{g.label}</span>
+                {g.status && <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (g.status === "registration" ? "bg-primary/15 text-primary" : g.status === "running" ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground")}>{g.status === "registration" ? "Sign-ups open" : g.status === "running" ? "Running" : "Completed"}</span>}
+                <span className="ml-auto text-xs text-muted-foreground">{g.rows.length} {g.rows.length === 1 ? "registration" : "registrations"}{pendingN > 0 ? ` · ${pendingN} pending` : ""}</span>
+              </CollapsibleTrigger>
+              <CollapsibleContent className="overflow-x-auto border-t border-border">
+                <table className="w-full text-sm">
+                  <thead className="text-left text-muted-foreground"><tr><th className="p-3">Tag</th><th>Season</th><th>Ref</th><th>Status</th><th>Group/Slot</th><th>Code</th><th /></tr></thead>
+                  <tbody>{g.rows.map((r) => { const why = removalReason(r); return (
+                    <tr key={r.id} className="border-t border-border"><td className="p-3 font-semibold">{r.gamer_tag}</td><td>{r.seasons ? `S${r.seasons.number}` : "—"}</td><td>{r.reference}</td>
+                      <td><StatusBadge status={r.status} />{why && <span className="block max-w-[220px] truncate text-xs text-muted-foreground" title={why}>{why}</span>}</td>
+                      <td>{r.tournament_groups ? `${String.fromCharCode(64 + r.tournament_groups.group_number)} / ${r.slot_number}` : "—"}</td><td>{r.payment_submissions[0]?.method === "free_trial" ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">Free trial</span> : r.payment_submissions[0]?.transaction_code}</td>
+                      <td className="whitespace-nowrap pr-3 text-right">{r.status === "verified" && r.seasons?.status === "registration" && <Button size="sm" variant="destructive" onClick={() => removePlayer(r)}>Remove</Button>}</td></tr>
+                  ); })}</tbody>
+                </table>
+              </CollapsibleContent>
+            </Collapsible>
+          );
+        })}
       </div>
 
       <LeagueAdmin />
+      </TabsContent>
 
-      <Settings onSaved={refresh} />
+      <TabsContent value="settings" forceMount className="data-[state=inactive]:hidden">
+        <Settings onSaved={refresh} />
+      </TabsContent>
+      </Tabs>
     </PageShell>
   );
 }
