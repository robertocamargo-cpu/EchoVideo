import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// v5.5.0: Script de Limpeza Local (Desktop)

const firebaseConfig = {
    apiKey: "AIzaSyDT2jresvDKecs1kNvuPF5RBqsW_mQa3w4",
    authDomain: "manifest-altar-323123.firebaseapp.com",
    projectId: "manifest-altar-323123",
    storageBucket: "manifest-altar-323123.firebasestorage.app",
    messagingSenderId: "533759879075",
    appId: "1:533759879075:web:e6ee7f7d88f7e3c4a89c16"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'echovid');

const TEMP_DIR = path.join(process.cwd(), 'temp_render');
const RAIZ_DIR = process.cwd();

async function cleanupProject(projectId: string) {
    console.log(`\n🧹 Iniciando limpeza do projeto: ${projectId}`);

    // 1. Apagar pasta temp_render
    const projectTempPath = path.join(TEMP_DIR, projectId);
    if (fs.existsSync(projectTempPath)) {
        console.log(`- Removendo pasta temporária: ${projectTempPath}`);
        fs.rmSync(projectTempPath, { recursive: true, force: true });
    }

    // 2. Apagar arquivos de saída na raiz
    const files = fs.readdirSync(RAIZ_DIR);
    const outputPattern = `OUTPUT_FIREBASE_${projectId}_`;
    
    files.forEach(file => {
        if (file.startsWith(outputPattern) && (file.endsWith('.mp4') || file.endsWith('.mov'))) {
            const filePath = path.join(RAIZ_DIR, file);
            console.log(`- Removendo vídeo gerado: ${file}`);
            fs.unlinkSync(filePath);
        }
    });

    console.log(`✅ Limpeza local do projeto ${projectId} concluída.\n`);
}

async function pruneOrphans() {
    console.log(`\n🔍 Buscando arquivos órfãos (sem registro no banco)...`);
    
    try {
        const querySnapshot = await getDocs(collection(db, 'projects'));
        const activeIds = new Set(querySnapshot.docs.map(doc => doc.id));
        
        console.log(`- Projetos ativos no banco: ${activeIds.size}`);

        // Verificar pastas em temp_render
        if (fs.existsSync(TEMP_DIR)) {
            const folders = fs.readdirSync(TEMP_DIR);
            for (const folder of folders) {
                if (folder !== '.DS_Store' && !activeIds.has(folder)) {
                    console.log(`⚠️ Órfão encontrado em temp_render: ${folder}`);
                    await cleanupProject(folder);
                }
            }
        }

        // Verificar vídeos na raiz
        const files = fs.readdirSync(RAIZ_DIR);
        for (const file of files) {
            if (file.startsWith('OUTPUT_FIREBASE_')) {
                const parts = file.split('_');
                // Padrão: OUTPUT_FIREBASE_ID_TIMESTAMP.mp4
                // O ID está nas posições de índice 2 em diante se o ID for UUID
                // Mas o ID pode conter sub-underscores se não for UUID puro? Não, é UUID v4.
                const potentialId = parts[2]; 
                if (potentialId && !activeIds.has(potentialId)) {
                   console.log(`⚠️ Vídeo órfão encontrado: ${file}`);
                   fs.unlinkSync(path.join(RAIZ_DIR, file));
                }
            }
        }

        console.log(`✅ Pruning concluído.\n`);
    } catch (e) {
        console.error("❌ Erro ao conectar ao Firebase para prune:", e);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const projectId = args.find(a => a.startsWith('--id='))?.split('=')[1];
    const isPrune = args.includes('--prune');

    if (isPrune) {
        await pruneOrphans();
    } else if (projectId) {
        await cleanupProject(projectId);
    } else {
        console.log(`
Uso do ECHO Cleanup Tool:
  --id=XYZ      Limpa arquivos locais do projeto específico
  --prune       Detecta e apaga arquivos de projetos que não existem mais no Firebase
        `);
    }
    process.exit(0);
}

main();
