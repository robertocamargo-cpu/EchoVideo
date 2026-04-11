import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy, updateDoc } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// --- CONFIGURAÇÃO ---
dotenv.config();

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'echovid');
const storage = getStorage(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(process.cwd(), 'temp_render');

// --- HELPERS ---
const updateStatus = async (projectId: string, msg: string, progress: number) => {
    try {
        const docRef = doc(db, 'projects', projectId);
        await updateDoc(docRef, {
            render_status: {
                msg,
                progress,
                updated_at: Date.now()
            }
        });
    } catch (e) {
        // Silencioso para não travar o render se houver erro de rede
    }
};

const downloadFile = async (url: string, dest: string) => {
  if (!url) return;
  const response = await axios({ url, method: 'GET', responseType: 'stream' });
  const writer = fs.createWriteStream(dest);
  response.data.pipe(writer);
  return new Promise<void>((resolve, reject) => {
    writer.on('finish', () => resolve());
    writer.on('error', (err) => reject(err));
  });
};

const escapeDrawText = (t: string) => {
  return t
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,');
};

const wrapText = (text: string, maxWords: number): string => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    lines.push(words.slice(i, i + maxWords).join(' '));
  }
  return lines.join('\n');
};

function runFFmpeg(args: string[]): Promise<number | null> {
    return new Promise((resolve, reject) => {
        const ffmpegPath = '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg';
        const process = spawn(ffmpegPath, ['-y', ...args]);
        let errorMsg = '';
        process.stderr.on('data', (data) => { errorMsg += data.toString(); });
        process.on('close', (code) => {
            if (code === 0 || code === null) resolve(code);
            else reject(new Error(`FFmpeg falhou com código ${code}: ${errorMsg.slice(-500)}`));
        });
    });
}

function buildZoompanFilter(params: any, frames: number, width: number, height: number): string {
    const s = params.scale_start || 1.1;
    const e = params.scale_end || 1.3;
    const mx_s = params.move_x_start || 0;
    const mx_e = params.move_x_end || 0;
    const my_s = params.move_y_start || 0;
    const my_e = params.move_y_end || 0;

    const zoomExpr = `${s}+((on/${frames})*(${e - s}))`;
    const xExpr = `(iw*${mx_s})+(on/${frames})*(iw*${mx_e - mx_s})`;
    const yExpr = `(ih*${my_s})+(on/${frames})*(ih*${my_e - my_s})`;

    return `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${width}x${height}:fps=25`;
}

// --- RENDERIZADOR ---
async function main() {
  const args = process.argv.slice(2);
  const projectId = args.find(a => a.startsWith('--id='))?.split('=')[1];
  const includeSubs = args.find(a => a.startsWith('--subs='))?.split('=')[1] !== 'false';

  if (!projectId) {
    console.error('Uso: npx tsx scripts/render_native.ts --id=ID --subs=true/false');
    process.exit(1);
  }

  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  await updateStatus(projectId, "Iniciando...", 0);

  console.log(`\n🚀 [FIREBASE MODE] Renderização Nativa: ${projectId} (Legendas: ${includeSubs ? 'SIM' : 'NÃO'})`);

  // 1. Buscar dados
  const docRef = doc(db, 'projects', projectId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) { process.exit(1); }
  const project = docSnap.data();

  const itemsSnap = await getDocs(query(collection(db, 'projects', projectId, 'transcription_items')));
  const items = itemsSnap.docs.map(d => d.data()).sort((a, b) => a.start_seconds - b.start_seconds);
  
  const effectsSnap = await getDocs(query(collection(db, 'motion_effects')));
  const availableEffects = effectsSnap.docs.map(d => d.data());

  const isVertical = project.aspect_ratio === '9:16';
  const width = isVertical ? 1080 : 1920;
  const height = isVertical ? 1920 : 1080;
  const FPS = 25;

  const sessionPath = path.join(TEMP_DIR, projectId);
  const scenesPath = path.join(sessionPath, 'scenes');
  if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });
  if (!fs.existsSync(scenesPath)) fs.mkdirSync(scenesPath, { recursive: true });

  // 2. Downloads
  await updateStatus(projectId, "Baixando Áudio e Fontes...", 5);
  const audioLocalPath = path.join(sessionPath, 'audio.mp3');
  let audioUrl = project.audio_url;
  if (!audioUrl) {
      const audioRef = ref(storage, `project-audio/${projectId}.mp3`);
      audioUrl = await getDownloadURL(audioRef);
  }
  if (!fs.existsSync(audioLocalPath)) await downloadFile(audioUrl, audioLocalPath);

  const fontPath = path.join(sessionPath, 'font.ttf');
  if (!fs.existsSync(fontPath)) await downloadFile('https://raw.githubusercontent.com/googlefonts/montserrat/master/fonts/ttf/Montserrat-ExtraBold.ttf', fontPath);

  // 3. Renderizar Cenas
  const sceneFiles: string[] = [];
  let lastEffectIndex = -1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const url = item.imported_video_url || item.image_url || item.google_image_url || item.pollinations_image_url || item.imported_image_url;
    if (!url) continue;

    const progress = 10 + Math.round((i / items.length) * 80);
    await updateStatus(projectId, `Renderizando Cena ${i+1}/${items.length}...`, progress);

    const duration = Math.max(0.1, item.end_seconds - item.start_seconds);
    const isVideo = !!item.imported_video_url;
    
    // Extensão
    const urlParts = url.split('?')[0].split('/');
    const lastPart = urlParts[urlParts.length - 1];
    const ext = lastPart.includes('.') ? lastPart.split('.').pop() : (isVideo ? 'mp4' : 'png');
    const assetPath = path.join(sessionPath, `asset_${i}.${ext}`);
    const sceneOutputPath = path.join(scenesPath, `scene_${String(i).padStart(4, '0')}.ts`);
    
    if (fs.existsSync(sceneOutputPath)) {
        sceneFiles.push(sceneOutputPath);
        continue;
    }

    await downloadFile(url, assetPath);

    let sceneFilter = '';
    if (isVideo) {
        // Cenas MP4: Zoom fixox de 12% (1.12) sem animação
        const zW = Math.round(width * 1.12);
        const zH = Math.round(height * 1.12);
        sceneFilter = `scale=${zW}:${zH}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
    } else {
        // Imagens: Rodízio aleatório (sem repetir o anterior)
        let effectIndex;
        do {
            effectIndex = Math.floor(Math.random() * availableEffects.length);
        } while (effectIndex === lastEffectIndex && availableEffects.length > 1);
        
        lastEffectIndex = effectIndex;
        const effect = availableEffects[effectIndex];
        
        const frames = Math.ceil(duration * FPS);
        const zoomWidth = width * 1.5; 
        const zoomHeight = height * 1.5;
        const zoom = buildZoompanFilter(effect, frames, width, height);
        sceneFilter = `scale=${zoomWidth}:${zoomHeight}:force_original_aspect_ratio=increase,crop=${zoomWidth}:${zoomHeight},${zoom},setsar=1`;
    }
    
    if (includeSubs && item.text) {
        const escaped = escapeDrawText(wrapText(item.text, 5));
        const fontSize = Math.round(42 * (height / 720));
        const yPos = Math.round(75 * (height / 100));
        const fontParam = `:fontfile='${fontPath.replace(/\\/g, '/')}'`;
        sceneFilter += `,drawtext=text='${escaped}'${fontParam}:fontcolor=0xFFD700:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPos}-(text_h/2):borderw=5:bordercolor=0x000000`;
    }

    const sceneArgs = [
        ...(isVideo ? [] : ['-loop', '1']), 
        '-t', duration.toFixed(3),
        '-i', assetPath,
        '-vf', sceneFilter,
        '-t', duration.toFixed(3),
        '-r', FPS.toString(),
        '-pix_fmt', 'yuv420p',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '20',
        sceneOutputPath
    ];

    await runFFmpeg(sceneArgs);
    sceneFiles.push(sceneOutputPath);
  }

  // 4. Conectar Final
  await updateStatus(projectId, "Finalizando Vídeo...", 95);
  const concatListPath = path.join(sessionPath, 'concat_list.txt');
  fs.writeFileSync(concatListPath, sceneFiles.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));

  const outputName = `OUTPUT_FIREBASE_${projectId}_${Date.now()}.mp4`;
  const finalArgs = [
      '-f', 'concat', '-safe', '0', '-i', concatListPath,
      '-i', audioLocalPath,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-shortest',
      outputName
  ];

  await runFFmpeg(finalArgs);
  await updateStatus(projectId, "Concluído!", 100);
  console.log(`\n✅ CONCLUÍDO! Vídeo gerado: ${outputName}`);
}

main().catch(async err => {
  await updateStatus("ERROR", err.message, 0);
  console.error('\n❌ Erro Crítico:', err);
});
