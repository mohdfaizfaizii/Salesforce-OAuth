import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@tanstack/react-start/server";
import {
  getCallbackUrl,
  getLoginUrl,
  getSessionConfig,
  type SalesforceSession,
} from "@/lib/salesforce.server";

export const Route = createFileRoute("/api/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        if (error) {
          const redirectUri = getCallbackUrl(request);
          const msg = [
            `OAuth error: ${error}`,
            url.searchParams.get("error_description"),
            "",
            "To fix this, ensure your Salesforce Connected App 'Callback URL' matches exactly:",
            redirectUri,
            "",
            "Current URL detected by server:",
            request.url,
          ].filter(Boolean).join("\n");
          
          return new Response(msg, { 
            status: 400,
            headers: { "Content-Type": "text/plain" }
          });
        }
        if (!code) return new Response("Missing code", { status: 400 });

        const clientId = process.env.SALESFORCE_CLIENT_ID!;
        const clientSecret = process.env.SALESFORCE_CLIENT_SECRET!;
        const redirectUri = getCallbackUrl(request);
        
        const session = await useSession<SalesforceSession>(getSessionConfig());
        const codeVerifier = session.data.codeVerifier;

        console.log(`[OAuth Callback] Session ID: ${session.id}`);
        console.log(`[OAuth Callback] Code Verifier in session: ${codeVerifier ? "Found" : "Missing"}`);

        if (!codeVerifier) {
          console.error("[OAuth Callback] Missing code_verifier in session. Check if cookies are being blocked or Secure flag is issue.");
        }

        console.log(`[OAuth Callback] Using redirect_uri: ${redirectUri}`);

        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        });

        if (codeVerifier) {
          body.set("code_verifier", codeVerifier);
        }

        const tokenRes = await fetch(`${getLoginUrl()}/services/oauth2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        const tokenData = (await tokenRes.json()) as Record<string, string>;
        
        console.log(`[OAuth Callback] Token Response Status: ${tokenRes.status}`);

        if (!tokenRes.ok) {
          console.error(`[OAuth Callback] Token exchange failed: ${JSON.stringify(tokenData)}`);
          return new Response(`Token exchange failed: ${JSON.stringify(tokenData)}`, { status: 400 });
        }

        console.log(`[OAuth Callback] Updating session for user: ${tokenData.id}`);

        await session.update({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          instanceUrl: tokenData.instance_url,
          userId: tokenData.id?.split("/").pop(),
          username: tokenData.id,
          orgId: tokenData.id?.split("/").slice(-2, -1)[0],
          codeVerifier: undefined, // Clear verifier after use
        });

        console.log(`[OAuth Callback] Session updated successfully. Redirecting to frontend...`);

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
        return new Response(null, { status: 302, headers: { Location: frontendUrl } });
      },
    },
  },
});
