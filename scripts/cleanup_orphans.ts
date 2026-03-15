import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Função simples para ler .env manualmente
function loadEnv() {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=').trim().replace(/^"(.*)"$/, '$1');
                process.env[key.trim()] = value;
            }
        });
    }
}

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function cleanupOrphans() {
    console.log("🚀 Iniciando limpeza de arquivos órfãos no Supabase...");

    // 1. Buscar todos os IDs de projetos válidos
    const { data: projects, error: projError } = await supabase.from('projects').select('id');
    if (projError) {
        console.error("❌ Erro ao buscar projetos:", projError);
        return;
    }
    const validProjectIds = new Set(projects.map(p => p.id));
    console.log(`✅ Encontrados ${validProjectIds.size} projetos válidos no banco.`);

    // 2. Limpar Bucket 'project-audio'
    console.log("\n--- Analisando bucket 'project-audio' ---");
    const { data: audioFiles, error: audioError } = await supabase.storage.from('project-audio').list();
    if (audioError) {
        console.error("❌ Erro ao listar bucket project-audio:", audioError);
    } else if (audioFiles) {
        const orphans = audioFiles.filter(f => {
            const id = f.name.split('.')[0];
            return !validProjectIds.has(id) && f.name !== '.emptyFolderPlaceholder';
        });
        
        if (orphans.length > 0) {
            console.log(`🗑️ Deletando ${orphans.length} arquivos de áudio órfãos...`);
            const { error: delError } = await supabase.storage.from('project-audio').remove(orphans.map(o => o.name));
            if (delError) console.error("❌ Erro ao deletar áudios:", delError);
            else console.log("✅ Áudios órfãos removidos.");
        } else {
            console.log("✨ Nenhum áudio órfão encontrado.");
        }
    }

    // 3. Limpar Bucket 'project-images'
    console.log("\n--- Analisando bucket 'project-images' ---");
    const { data: imageFolders, error: imageError } = await supabase.storage.from('project-images').list();
    if (imageError) {
        console.error("❌ Erro ao listar pastas no bucket project-images:", imageError);
    } else if (imageFolders) {
        const orphanFolders = imageFolders.filter(f => !validProjectIds.has(f.name) && f.name !== '.emptyFolderPlaceholder');
        
        for (const folder of orphanFolders) {
            console.log(`📂 Limpando pasta de imagens órfã: ${folder.name}`);
            const { data: files } = await supabase.storage.from('project-images').list(folder.name);
            if (files && files.length > 0) {
                const paths = files.map(f => `${folder.name}/${f.name}`);
                await supabase.storage.from('project-images').remove(paths);
            }
            // Infelizmente o Supabase não deleta a "pasta" vazia via API, mas remover os arquivos já libera o espaço.
        }
        if (orphanFolders.length > 0) console.log(`✅ ${orphanFolders.length} pastas de imagens processadas.`);
        else console.log("✨ Nenhuma pasta de imagem órfã encontrada.");
    }

    console.log("\n🏁 Limpeza concluída!");
}

cleanupOrphans();
