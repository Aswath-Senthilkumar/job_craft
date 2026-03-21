import { createClient } from "@insforge/sdk";

if (!process.env.INSFORGE_BASE_URL || !process.env.INSFORGE_API_KEY) {
  throw new Error("INSFORGE_BASE_URL and INSFORGE_API_KEY must be set when USE_INSFORGE=true");
}

// Singleton client (anon key) — used for auth operations (signup/login) and fallback
export const insforge = createClient({
  baseUrl: process.env.INSFORGE_BASE_URL,
  anonKey: process.env.INSFORGE_API_KEY,
});

// Factory: creates a per-request client scoped to a user's JWT
// RLS policies enforce data isolation via auth.uid()
export function createAuthenticatedClient(userToken: string) {
  return createClient({
    baseUrl: process.env.INSFORGE_BASE_URL!,
    anonKey: process.env.INSFORGE_API_KEY!,
    edgeFunctionToken: userToken,
    isServerMode: true,
  });
}

export default insforge;
