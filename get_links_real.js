import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tgdgbptqrambgkzagcjd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnZGdicHRxcmFtYmdremFnY2pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mjk0MDIsImV4cCI6MjA4ODUwNTQwMn0.q3m5BJNB0ld9DGS5FRVQOqiTjDB8r9FnwSJqexCN6PQ';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getRealLinks() {
  try {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, audio_url')
      .not('audio_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (!projects || projects.length === 0) return console.log("No projects found with audio.");

    const p = projects[0];
    console.log("--- REAL LINKS ---");
    console.log("MP3:", p.audio_url);

    const { data: items } = await supabase
      .from('transcription_items')
      .select('image_url, imported_video_url')
      .eq('project_id', p.id)
      .limit(100);

    const image = items.find(it => it.image_url && !it.image_url.startsWith('data:'))?.image_url;
    const video = items.find(it => it.imported_video_url)?.imported_video_url;

    console.log("IMG:", image || "N/A (Cenas sem imagem ou apenas Base64)");
    console.log("VID:", video || "N/A (Nenhum vídeo importado neste projeto)");
  } catch (e) {
    console.error("Error:", e);
  }
}

getRealLinks();
