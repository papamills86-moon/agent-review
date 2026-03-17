import { supabase } from "./supabase";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("SESSION_EXPIRED");
  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    "x-agent-secret": import.meta.env.VITE_EDGE_FUNCTION_SECRET,
    Authorization: `Bearer ${session.access_token}`,
  };
}
