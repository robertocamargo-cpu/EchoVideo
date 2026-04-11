import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const { data, error } = await supabase.from('projects').select('id, name').limit(10);
  console.log('Projetos encontrados:', data);
  if (error) console.error('Erro:', error);
}
check();
