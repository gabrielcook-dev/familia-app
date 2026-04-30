import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qopnhbcbeysjdwzcczei.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvcG5oYmNiZXlzamR3emNjemVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MDQ3NTMsImV4cCI6MjA5MzA4MDc1M30._rb7d93skqeQz3y2B7HvHvrXbKbzRSMQRfZQ4ATD3zA'

export const supabase = createClient(supabaseUrl, supabaseKey)
