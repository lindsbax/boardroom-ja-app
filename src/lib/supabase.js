import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://czytcrcxfdmdmxqhybfi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6eXRjcmN4ZmRtZG14cWh5YmZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTQxMDcsImV4cCI6MjA5OTI3MDEwN30.1JPSMYugZp6QWXoy3WEYbPNYaZhzV1yAhKLyYMiZOPE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
