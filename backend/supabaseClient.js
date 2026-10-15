const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

let supabaseInstance = null;

/**
 * Check if valid Supabase configuration is present
 */
function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  return Boolean(
    url &&
    key &&
    !url.includes('your-project-id') &&
    !key.includes('your_supabase_') &&
    url.trim() !== '' &&
    key.trim() !== ''
  );
}

/**
 * Get or initialize the Supabase client
 */
function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!supabaseInstance) {
    const url = process.env.SUPABASE_URL.trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY).trim();
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return supabaseInstance;
}

/**
 * Test the Supabase connection
 */
async function testSupabaseConnection() {
  const client = getSupabaseClient();
  if (!client) {
    return { connected: false, message: 'Supabase credentials not configured or incomplete in backend/.env' };
  }

  try {
    const { error } = await client.from('conversations').select('id').limit(1);
    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') {
        return {
          connected: true,
          tablesReady: false,
          message: 'Connected to Supabase, but "conversations" table is missing. Run backend/supabase-schema.sql in the Supabase SQL editor.'
        };
      }
      return { connected: false, message: error.message };
    }
    return { connected: true, tablesReady: true, message: 'Successfully connected to Supabase database!' };
  } catch (err) {
    return { connected: false, message: err.message || 'Connection failed' };
  }
}

/**
 * Database operations for chat persistence
 */
const db = {
  // Get all conversations
  async getConversations() {
    const client = getSupabaseClient();
    if (!client) return [];

    const { data, error } = await client
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Create a new conversation
  async createConversation(title = 'New Chat') {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase is not configured');

    const { data, error } = await client
      .from('conversations')
      .insert([{ title, updated_at: new Date().toISOString() }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get messages for a conversation
  async getMessages(conversationId) {
    const client = getSupabaseClient();
    if (!client) return [];

    const { data, error } = await client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Add a message and update conversation timestamp
  async addMessage({ conversationId, role, text, model = null }) {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase is not configured');

    const { data, error } = await client
      .from('messages')
      .insert([{
        conversation_id: conversationId,
        role,
        text,
        model
      }])
      .select()
      .single();

    if (error) throw error;

    // Update parent conversation updated_at
    await client
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    return data;
  },

  // Delete a conversation
  async deleteConversation(conversationId) {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase is not configured');

    const { error } = await client
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (error) throw error;
    return { success: true };
  }
};

module.exports = {
  isSupabaseConfigured,
  getSupabaseClient,
  testSupabaseConnection,
  db
};
