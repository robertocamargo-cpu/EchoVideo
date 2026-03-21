import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tgdgbptqrambgkzagcjd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnZGdicHRxcmFtYmdremFnY2pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mjk0MDIsImV4cCI6MjA4ODUwNTQwMn0.q3m5BJNB0ld9DGS5FRVQOqiTjDB8r9FnwSJqexCN6PQ';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getRealLinks() {
  try {
    const { data: items } = await supabase
      .from('transcription_items')
      .select('imported_video_url')
      .not('imported_video_url', 'is', null)
      .limit(1);

    if (items && items.length > 0 && items[0].imported_video_url) {
      console.log("VID:", items[0].imported_video_url);
    } else {
      console.log("VID: N/A");
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

getRealLinks();
