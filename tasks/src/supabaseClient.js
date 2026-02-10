import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ldhfidbjclcoussgglwn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkaGZpZGJqY2xjb3Vzc2dnbHduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3Mzc3NDgsImV4cCI6MjA4NjMxMzc0OH0.ym_gHpP12xvwDkdP-nyeRQSOye1vjFWmN22QvBDLmd0'

export const supabase = createClient(supabaseUrl, supabaseKey)
