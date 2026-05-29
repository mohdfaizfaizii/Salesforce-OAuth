import { createHash, randomBytes } from "crypto";

export type SalesforceSession = {
  accessToken?: string;
  refreshToken?: string;
  instanceUrl?: string;
  userId?: string;
  username?: string;
  orgId?: string;
  codeVerifier?: string;
};

export const API_VERSION = "v60.0";

export function generatePkce() {
  const verifier = randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return { verifier, challenge };
}

export function getLoginUrl() {
  return process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
}

export function getSessionConfig() {
  const secret = process.env.SALESFORCE_CLIENT_SECRET || "default_fallback_secret_for_initialization_32_chars";
  if (!process.env.SALESFORCE_CLIENT_SECRET) {
    console.warn("[getSessionConfig] SALESFORCE_CLIENT_SECRET is missing from environment!");
  }
  // useSession requires >=32 char password
  const password = createHash("sha256")
    .update("sf-session::" + secret)
    .digest("hex");
  return {
    password,
    name: "sf_session",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: true,
      path: "/",
    },
  };
}

export function getCallbackUrl(request: Request) {
  // Use SALESFORCE_REDIRECT_URI env var for production, fallback to localhost for development
  const redirectUri = process.env.SALESFORCE_REDIRECT_URI || "http://localhost:5000/api/oauth/callback";
  return redirectUri;
}

/** Make an authenticated call to Salesforce */
export async function sfFetch(
  session: SalesforceSession,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!session.accessToken || !session.instanceUrl) {
    throw new Error("Not authenticated with Salesforce");
  }
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const url = path.startsWith("http") ? path : `${session.instanceUrl}${path}`;
  return fetch(url, { ...init, headers });
}
