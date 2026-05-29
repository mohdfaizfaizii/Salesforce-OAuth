import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  API_VERSION,
  getSessionConfig,
  sfFetch,
  getCallbackUrl,
  type SalesforceSession,
} from "./salesforce.server";

async function loadSession() {
  const session = await useSession<SalesforceSession>(getSessionConfig());
  return session;
}

/** Refresh the Salesforce access token using the refresh token */
async function refreshAccessToken(session: Awaited<ReturnType<typeof loadSession>>): Promise<void> {
  if (!session.data?.refreshToken) {
    throw new Error("No refresh token available");
  }

  const clientId = process.env.SALESFORCE_CLIENT_ID!;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET!;
  const loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";

  const refreshBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: session.data.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: refreshBody,
  });

  if (!tokenRes.ok) {
    const error = await tokenRes.text();
    console.error("[refreshAccessToken] Token refresh failed:", error);
    throw new Error("Session expired and refresh failed. Please re-authenticate.");
  }

  const tokenData = (await tokenRes.json()) as Record<string, string>;
  console.log("[refreshAccessToken] Token refreshed successfully");

  await session.update({
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || session.data.refreshToken,
  });
}

export const getAuthStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const session = await loadSession();
    const s = session.data || {};
    
    return {
      authenticated: Boolean(s.accessToken && s.instanceUrl),
      instanceUrl: s.instanceUrl ?? null,
      username: s.username ?? null,
      redirectUri: "http://localhost:5000/api/oauth/callback",
      error: null,
    };
  } catch (err) {
    console.error(`[getAuthStatus] Error:`, err);
    return {
      authenticated: false,
      instanceUrl: null,
      username: null,
      redirectUri: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

export type ValidationRuleRow = {
  id: string;
  name: string;
  active: boolean;
  entity: string;
  errorMessage: string | null;
  description: string | null;
};

export const listValidationRules = createServerFn({ method: "GET" }).handler(async () => {
  const session = await loadSession();
  const s = session.data || {};
  const soql =
    "SELECT Id, ValidationName, Active, Description, ErrorMessage, EntityDefinition.DeveloperName FROM ValidationRule WHERE EntityDefinition.DeveloperName = 'Account' ORDER BY ValidationName";
  
  let res = await sfFetch(
    s,
    `/services/data/${API_VERSION}/tooling/query?q=${encodeURIComponent(soql)}`,
  );
  
  // If we get a 401, try to refresh the token and retry
  if (res.status === 401) {
    console.log("[listValidationRules] Session expired, refreshing token...");
    await refreshAccessToken(session);
    res = await sfFetch(
      session.data!,
      `/services/data/${API_VERSION}/tooling/query?q=${encodeURIComponent(soql)}`,
    );
  }
  
  const data = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`Salesforce query failed: ${JSON.stringify(data)}`);
  }
  const rows: ValidationRuleRow[] = (data.records || []).map((r: any) => ({
    id: r.Id,
    name: r.ValidationName,
    active: Boolean(r.Active),
    entity: r.EntityDefinition?.DeveloperName ?? "Account",
    errorMessage: r.ErrorMessage ?? null,
    description: r.Description ?? null,
  }));
  return { rules: rows };
});

/**
 * Update the Active flag for a single validation rule via Tooling API.
 * Tooling API requires sending the full Metadata object back.
 */
async function setRuleActive(session: Awaited<ReturnType<typeof loadSession>>, id: string, active: boolean) {
  // Read current Metadata
  let getRes = await sfFetch(
    session.data!,
    `/services/data/${API_VERSION}/tooling/sobjects/ValidationRule/${id}`,
  );
  
  // If we get a 401, try to refresh the token and retry
  if (getRes.status === 401) {
    console.log("[setRuleActive] Session expired during read, refreshing token...");
    await refreshAccessToken(session);
    getRes = await sfFetch(
      session.data!,
      `/services/data/${API_VERSION}/tooling/sobjects/ValidationRule/${id}`,
    );
  }
  
  const current = (await getRes.json()) as any;
  if (!getRes.ok) {
    throw new Error(`Read rule ${id} failed: ${JSON.stringify(current)}`);
  }
  const metadata = current.Metadata || {};
  metadata.active = active;

  let patchRes = await sfFetch(
    session.data!,
    `/services/data/${API_VERSION}/tooling/sobjects/ValidationRule/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ Metadata: metadata }),
    },
  );
  
  // If we get a 401, try to refresh the token and retry
  if (patchRes.status === 401) {
    console.log("[setRuleActive] Session expired during update, refreshing token...");
    await refreshAccessToken(session);
    patchRes = await sfFetch(
      session.data!,
      `/services/data/${API_VERSION}/tooling/sobjects/ValidationRule/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ Metadata: metadata }),
      },
    );
  }
  
  if (!patchRes.ok) {
    const err = await patchRes.text();
    throw new Error(`Update rule ${id} failed: ${err}`);
  }
  return { id, active };
}

export const deployRuleChanges = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        changes: z
          .array(z.object({ id: z.string().min(1).max(50), active: z.boolean() }))
          .min(1)
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const session = await loadSession();
    console.log(`[deployRuleChanges] Session loaded. accessToken present:`, !!session.data?.accessToken);
    if (!session.data?.accessToken) {
      console.error(`[deployRuleChanges] No access token in session. Session data:`, JSON.stringify(session.data));
      throw new Error("Not authenticated");
    }
    const results: { id: string; active: boolean; ok: boolean; error?: string }[] = [];
    for (const change of data.changes) {
      try {
        await setRuleActive(session, change.id, change.active);
        results.push({ id: change.id, active: change.active, ok: true });
      } catch (e) {
        results.push({
          id: change.id,
          active: change.active,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { results };
  });
