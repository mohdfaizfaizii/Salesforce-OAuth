import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@tanstack/react-start/server";
import { getSessionConfig, type SalesforceSession } from "@/lib/salesforce.server";

export const Route = createFileRoute("/api/oauth/logout")({
  server: {
    handlers: {
      GET: async () => {
        const session = await useSession<SalesforceSession>(getSessionConfig());
        await session.clear();
        return new Response(null, { status: 302, headers: { Location: "/" } });
      },
    },
  },
});
