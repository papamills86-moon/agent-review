import { supabase } from "./supabase";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  // Try current session first
  let { data: { session } } = await supabase.auth.getSession();

  // If no session, attempt a refresh — handles magic link race conditions
  // where the URL token hasn't been exchanged yet
  if (!session) {
    const { data: refreshData } = await supabase.auth.refreshSession();
    session = refreshData.session;
  }

  if (!session) {
    // Session truly expired — force sign out so LoginGate redirects to login
    await supabase.auth.signOut();
    throw new Error("SESSION_EXPIRED");
  }

  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    "x-agent-secret": import.meta.env.VITE_EDGE_FUNCTION_SECRET,
    Authorization: `Bearer ${session.access_token}`,
  };
}
