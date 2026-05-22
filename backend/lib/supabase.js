import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Charger les variables d'environnement AVANT tout
dotenv.config({ path: process.env.DOTENV_PATH || '.env', override: true })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
