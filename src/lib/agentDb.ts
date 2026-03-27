import { supabase } from './supabase';
import type { CustomAgent } from '../types/counsel';

/** Fetch all active custom agents from the shared pool. */
export async function fetchCustomAgents(): Promise<CustomAgent[]> {
  const { data, error } = await supabase
    .from('custom_agents')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch custom agents:', error);
    return [];
  }

  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    abbr: row.abbr,
    group: row.group,
    accentColor: row.accent_color,
    bgColor: row.bg_color,
    expertiseTags: row.expertise_tags,
    systemPrompt: row.system_prompt,
    createdBy: row.created_by,
    createdAt: row.created_at,
    active: row.active,
  }));
}

/** Save a new custom agent to the shared pool. */
export async function saveCustomAgent(agent: CustomAgent): Promise<void> {
  const { error } = await supabase
    .from('custom_agents')
    .upsert({
      id: agent.id,
      name: agent.name,
      abbr: agent.abbr,
      group: agent.group,
      accent_color: agent.accentColor,
      bg_color: agent.bgColor,
      expertise_tags: agent.expertiseTags,
      system_prompt: agent.systemPrompt,
      created_by: agent.createdBy,
      active: agent.active,
    });

  if (error) {
    throw new Error(`Failed to save custom agent: ${error.message}`);
  }
}
