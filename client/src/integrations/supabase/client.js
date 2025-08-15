import { createClient } from '@supabase/supabase-js'

// IMPORTANT: Replace with your actual Supabase URL and anon key
// You should use environment variables for this in a real project
const supabaseUrl = 'YOUR_SUPABASE_URL_HERE'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY_HERE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
