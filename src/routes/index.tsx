import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  getAuthStatus,
  listValidationRules,
  deployRuleChanges,
  type ValidationRuleRow,
} from "@/lib/salesforce.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { CheckCircle2, CloudUpload, LogIn, LogOut, RefreshCcw, Shield, XCircle } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Salesforce Validation Rules Manager" },
      {
        name: "description",
        content:
          "Connect to your Salesforce org, manage Account validation rules, and deploy changes via the Tooling API.",
      },
    ],
  }),
});

function Index() {
  const fetchAuth = useServerFn(getAuthStatus);
  const fetchRules = useServerFn(listValidationRules);
  const deployFn = useServerFn(deployRuleChanges);
  const qc = useQueryClient();

  const auth = useQuery({ queryKey: ["sf-auth"], queryFn: () => fetchAuth() });

  const rulesQuery = useQuery({
    queryKey: ["sf-rules"],
    queryFn: () => fetchRules(),
    enabled: false,
  });

  // pending state map: id -> active
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // Reset pending whenever fresh data arrives
  useEffect(() => {
    if (rulesQuery.data) setPending({});
  }, [rulesQuery.data]);

  const rules: ValidationRuleRow[] = rulesQuery.data?.rules ?? [];

  const effectiveActive = (r: ValidationRuleRow) =>
    r.id in pending ? pending[r.id] : r.active;

  const dirtyChanges = useMemo(() => {
    return rules
      .filter((r) => r.id in pending && pending[r.id] !== r.active)
      .map((r) => ({ id: r.id, active: pending[r.id] }));
  }, [rules, pending]);

  const deploy = useMutation({
    mutationFn: () => deployFn({ data: { changes: dirtyChanges } }),
    onSuccess: (res) => {
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length === 0) {
        toast.success(`Deployed ${res.results.length} change(s) to Salesforce`);
      } else {
        toast.error(`${failed.length} change(s) failed`, {
          description: failed.map((f) => f.error).slice(0, 2).join(" • "),
        });
      }
      qc.invalidateQueries({ queryKey: ["sf-rules"] });
      rulesQuery.refetch();
    },
    onError: (e: Error) => toast.error("Deploy failed", { description: e.message }),
  });

  const toggleOne = (id: string, value: boolean) =>
    setPending((p) => ({ ...p, [id]: value }));

  const setAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    for (const r of rules) next[r.id] = value;
    setPending(next);
  };

  const isAuthed = auth.data?.authenticated;

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header
        className="border-b border-border"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="mx-auto max-w-5xl px-6 py-10 text-primary-foreground">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8" />
            <h1 className="text-3xl font-bold tracking-tight">
              Salesforce Validation Rules Manager
            </h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm opacity-90">
            Connect to your Salesforce Developer Org, view all Account validation
            rules, toggle their active state, and deploy via the Tooling API.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        <Card style={{ boxShadow: "var(--shadow-elegant)" }}>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Connection</CardTitle>
                <CardDescription>
                  {auth.isLoading
                    ? "Checking session…"
                    : auth.isError
                      ? `Error checking session: ${(auth.error as Error).message}`
                      : isAuthed
                        ? `Connected to ${auth.data?.instanceUrl}`
                        : "Not connected to Salesforce"}
                </CardDescription>
              </div>
              {isAuthed ? (
                <Button 
                  variant="outline" 
                  onClick={() => { window.location.href = "/api/oauth/logout" }}
                >
                  <LogOut className="mr-2 h-4 w-4" /> Disconnect
                </Button>
              ) : (
                <Button 
                  size="lg" 
                  onClick={() => { window.location.href = "/api/oauth/login" }}
                >
                  <LogIn className="mr-2 h-4 w-4" /> Login with Salesforce
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Account Validation Rules</CardTitle>
                <CardDescription>
                  Pulled live via the Tooling API. Toggle and deploy to push
                  changes back to your org.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => rulesQuery.refetch()}
                  disabled={!isAuthed || rulesQuery.isFetching}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {rulesQuery.isFetching ? "Loading…" : "Get Validation Rules"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setAll(true)}
                  disabled={rules.length === 0}
                >
                  Enable all
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setAll(false)}
                  disabled={rules.length === 0}
                >
                  Disable all
                </Button>
                <Button
                  onClick={() => deploy.mutate()}
                  disabled={dirtyChanges.length === 0 || deploy.isPending}
                >
                  <CloudUpload className="mr-2 h-4 w-4" />
                  {deploy.isPending
                    ? "Deploying…"
                    : `Deploy${dirtyChanges.length ? ` (${dirtyChanges.length})` : ""}`}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {rulesQuery.isError && (
              <p className="text-sm text-destructive">
                {(rulesQuery.error as Error).message}
              </p>
            )}
            {!isAuthed && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Login first to fetch validation rules from your org.
                </p>
                {auth.data?.redirectUri && (
                  <div className="rounded-md bg-muted p-4 border border-border">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Salesforce Callback URL
                    </p>
                    <p className="text-sm font-mono break-all mb-2">
                      {auth.data.redirectUri}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ensure this exact URL is added to your Salesforce Connected App configuration to avoid <strong>redirect_uri_mismatch</strong> errors.
                    </p>
                  </div>
                )}
              </div>
            )}
            {isAuthed && !rulesQuery.data && !rulesQuery.isFetching && (
              <p className="text-sm text-muted-foreground">
                Click <strong>Get Validation Rules</strong> to fetch them from
                Salesforce.
              </p>
            )}

            {rules.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {rules.map((r) => {
                  const active = effectiveActive(r);
                  const dirty = r.id in pending && pending[r.id] !== r.active;
                  return (
                    <li
                      key={r.id}
                      className="flex items-start gap-4 p-4 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">
                            {r.name}
                          </span>
                          {active ? (
                            <Badge
                              style={{
                                background: "var(--success)",
                                color: "var(--success-foreground)",
                              }}
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="mr-1 h-3 w-3" /> Inactive
                            </Badge>
                          )}
                          {dirty && (
                            <Badge
                              variant="outline"
                              style={{
                                borderColor: "var(--warning)",
                                color: "var(--warning)",
                              }}
                            >
                              Pending
                            </Badge>
                          )}
                        </div>
                        {r.errorMessage && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                            {r.errorMessage}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground font-mono">
                          {r.entity} · {r.id}
                        </p>
                      </div>
                      <Switch
                        checked={active}
                        onCheckedChange={(v) => toggleOne(r.id, v)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        
      </main>
    </div>
  );
}
