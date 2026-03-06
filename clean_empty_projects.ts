import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function clean() {
    console.log("Buscando projetos...");
    const { data: projects, error } = await supabase.from('projects').select('id, name');
    if (error) {
        console.error("Erro ao buscar projetos:", error);
        return;
    }

    console.log(`Encontrados ${projects.length} projetos.`);

    let deleted = 0;
    for (const proj of projects) {
        const { count, error: countError } = await supabase
            .from('transcription_items')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', proj.id);

        if (countError) {
            console.error(`Erro ao checar itens do projeto ${proj.id}:`, countError);
            continue;
        }

        if (count === 0) {
            console.log(`Deletando projeto vazio: ${proj.name} (${proj.id})`);
            await supabase.from('projects').delete().eq('id', proj.id);
            deleted++;
        }
    }

    console.log(`Limpeza concluída. ${deleted} projetos vazios deletados.`);
}

clean();
