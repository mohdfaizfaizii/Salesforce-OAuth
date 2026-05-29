import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@tanstack/react-start/server";
import {
  getCallbackUrl,
  getLoginUrl,
  getSessionConfig,
  generatePkce,
  type SalesforceSession,
} from "@/lib/salesforce.server";

export const Route = createFileRoute("/api/oauth/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.SALESFORCE_CLIENT_ID;
        const loginUrl = getLoginUrl();
        if (!clientId) {
          return new Response("SALESFORCE_CLIENT_ID not configured", { status: 500 });
        }

        const { verifier, challenge } = generatePkce();
        const session = await useSession<SalesforceSession>(getSessionConfig());
        await session.update({ codeVerifier: verifier });

        const redirectUri = getCallbackUrl(request);
        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: "api refresh_token offline_access",
          code_challenge: challenge,
          code_challenge_method: "S256",
        });
        const authUrl = `${getLoginUrl()}/services/oauth2/authorize?${params.toString()}`;
        
        console.log("Salesforce redirect URI:", redirectUri);
        console.log("Salesforce authorize URL:", authUrl);
        console.log("PKCE Challenge generated and Verifier stored in session");
        
        return new Response(null, { status: 302, headers: { Location: authUrl } });
      },
    },
  },
});
