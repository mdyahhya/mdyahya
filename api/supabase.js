// api/supabase.js — Robust Supabase Client Helper
const { createClient } = require('@supabase/supabase-js');
const { cleanEnv } = require('./utils');

function getSupabaseClient() {
  const supabaseUrl = cleanEnv(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  );
  
  const supabaseKey = cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.SUPABASE_ANON_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    process.env.SUPABASE_KEY
  );

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

module.exports = { getSupabaseClient };
