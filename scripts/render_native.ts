import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy, updateDoc } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import * as dotenv from 'dotenv';
import { spawn, execSync } from 'child_process';
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

// --- CONSTANTES DE BINÁRIOS ---
const FFMPEG_PATH = '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg';
const FFPROBE_PATH = '/opt/homebrew/opt/ffmpeg-full/bin/ffprobe';

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


function runFFmpeg(args: string[]): Promise<number | null> {
    return new Promise((resolve, reject) => {
        const process = spawn(FFMPEG_PATH, ['-y', ...args]);
        let errorMsg = '';
        process.stderr.on('data', (data) => { errorMsg += data.toString(); });
        process.on('close', (code) => {
            if (code === 0 || code === null) resolve(code);
            else reject(new Error(`FFmpeg falhou com código ${code}: ${errorMsg.slice(-500)}`));
        });
    });
}

function runFFprobe(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const process = spawn(FFPROBE_PATH, args);
        let output = '';
        let errorMsg = '';
        process.stdout.on('data', (data) => { output += data.toString(); });
        process.stderr.on('data', (data) => { errorMsg += data.toString(); });
        process.on('close', (code) => {
            if (code === 0) resolve(output.trim());
            else reject(new Error(`FFprobe falhou com código ${code}: ${errorMsg}`));
        });
    });
}

async function getVideoDuration(filePath: string): Promise<number> {
    try {
        const output = await runFFprobe([
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);
        return parseFloat(output);
    } catch (e) {
        console.warn(`⚠️ Erro ao obter duração do vídeo (${filePath}):`, (e as any).message);
        return 0;
    }
}

async function getResolution(filePath: string): Promise<{ width: number, height: number }> {
    try {
        const output = await runFFprobe([
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'csv=s=x:p=0',
            filePath
        ]);
        const [w, h] = output.split('x').map(n => parseInt(n));
        return { width: w || 0, height: h || 0 };
    } catch (e) {
        return { width: 0, height: 0 };
    }
}

// Parser de instrução técnica (mesma lógica do Browser effectSelectionService.ts)
function parseEffectInstruction(instruction: string): { scaleStart: number, scaleEnd: number, moveXStart: number, moveXEnd: number, moveYStart: number, moveYEnd: number } {
    const defaults = { scaleStart: 1.15, scaleEnd: 1.25, moveXStart: 0, moveXEnd: 0, moveYStart: 0, moveYEnd: 0 };
    if (!instruction) return defaults;
    try {
        const text = instruction.toLowerCase();
        const params = { ...defaults };

        // 1. Extrair Escalas (Ex: "scale from 1.16 to 1.20")
        const scaleMatch = text.match(/scale\s+from\s+([\d.]+)\s+to\s+([\d.]+)/i);
        if (scaleMatch) { params.scaleStart = parseFloat(scaleMatch[1]); params.scaleEnd = parseFloat(scaleMatch[2]); }

        // 2. Detectar Tags de Movimento (Ex: "move:right")
        let moveTag = 'none';
        const tagMatch = text.match(/move:([a-z-]+)/i);
        if (tagMatch) moveTag = tagMatch[1];

        // 3. Extrair Eixos Nomeados
        const hMatch = text.match(/horizontal axis.*?from\s+([+-]?\d+)%\s+to\s+([+-]?\d+)%/i);
        const vMatch = text.match(/vertical axis.*?from\s+([+-]?\d+)%\s+to\s+([+-]?\d+)%/i);
        
        if (hMatch) { params.moveXStart = parseFloat(hMatch[1]) / 100; params.moveXEnd = parseFloat(hMatch[2]) / 100; }
        if (vMatch) { params.moveYStart = parseFloat(vMatch[1]) / 100; params.moveYEnd = parseFloat(vMatch[2]) / 100; }

        // 4. Fallback: busca range por moveTag
        if (!hMatch && !vMatch) {
            const specificPattern = new RegExp(`move:${moveTag}.*?from\\s+([+-]?\\d+)%\\s+to\\s+([+-]?\\d+)%`, 'i');
            const specificMatch = text.match(specificPattern);
            if (specificMatch) {
                const s = parseFloat(specificMatch[1]) / 100;
                const e = parseFloat(specificMatch[2]) / 100;
                if (['left', 'right'].includes(moveTag)) { params.moveXStart = s; params.moveXEnd = e; }
                else if (['up', 'down'].includes(moveTag)) { params.moveYStart = s; params.moveYEnd = e; }
                else { params.moveXStart = s; params.moveXEnd = e; }
            }
        }

        // 5. Fallback Geométrico
        if (params.moveXStart === 0 && params.moveXEnd === 0 && params.moveYStart === 0 && params.moveYEnd === 0 && moveTag !== 'none') {
            const range = 0.05;
            if (moveTag === 'right') { params.moveXStart = -range; params.moveXEnd = range; }
            else if (moveTag === 'left') { params.moveXStart = range; params.moveXEnd = -range; }
            if (moveTag.includes('up')) { params.moveYStart = range; params.moveYEnd = -range; }
            else if (moveTag.includes('down')) { params.moveYStart = -range; params.moveYEnd = range; }
        }

        return params;
    } catch { return defaults; }
}

function buildZoompanFilter(params: { scaleStart: number, scaleEnd: number, moveXStart: number, moveXEnd: number, moveYStart: number, moveYEnd: number }, frames: number, width: number, height: number): string {
    const s = params.scaleStart;
    const e = params.scaleEnd;
    const mx_s = params.moveXStart;
    const mx_e = params.moveXEnd;
    const my_s = params.moveYStart;
    const my_e = params.moveYEnd;

    const zoomExpr = `${s}+((on/${frames})*(${e - s}))`;
    const xExpr = `(iw*${mx_s})+(on/${frames})*(iw*${mx_e - mx_s})`;
    const yExpr = `(ih*${my_s})+(on/${frames})*(ih*${my_e - my_s})`;

    return `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${width}x${height}:fps=25`;
}

// --- GERADOR DE LEGENDAS ASS (Substation Alpha) ---
// --- GERADOR DE FILTROS DRAWTEXT (Estilo Browser) ---
// v7.9.8: Função de Word Wrap para FFmpeg
function wrapText(text: string, maxWords: number, maxChars: number = 25) {
    if (!text) return '';
    const words = text.split(' ');
    let lines = [];
    let currentLine: string[] = [];
    
    for (const word of words) {
        const testLine = [...currentLine, word].join(' ');
        if (currentLine.length >= maxWords || testLine.length > maxChars) {
            if (currentLine.length > 0) lines.push(currentLine.join(' '));
            currentLine = [word];
        } else {
            currentLine.push(word);
        }
    }
    if (currentLine.length > 0) lines.push(currentLine.join(' '));
    return lines.join('\n');
}

// --- GERADOR DE FILTROS DRAWTEXT (Estilo Browser com Stacked Shadows para Blur) ---
function generateDrawTextFilters(items: any[], style: any, isVertical: boolean, fontPath: string) {
    // Calibração de Escala: 
    // Em horizontal, usamos a altura (1080) / 720 como base.
    // Em vertical, usamos a largura (1080) / 720 como base para evitar que o texto estoure as laterais.
    const scaleFactor = isVertical ? (1080 / 720) : (1080 / 720); // Ambos resultam em 1.5x para resolução 1080p
    const fontSize = Math.round((style.fontSize || 42) * scaleFactor);
    const filters: string[] = [];

    const textColor = (style.textColor || '#FFD700').replace('#', '0x');
    const outlineColor = (style.strokeColor || '#000000').replace('#', '0x');
    const shadowColor = (style.shadowColor || '#000000').replace('#', '0x');
    
    const borderW = (style.fontSize * ((style.strokeWidth || 7) / 100)) * scaleFactor;
    const yPosRatio = style.yPosition / 100;
    const SRT_ANTICIPATION_OFFSET = -0.5; // v7.9.9: Paridade com Browser (antecipação de 500ms)

    items.forEach(item => {
        const segments = item.srt_segments || [];
        const processText = (t: string, start: number, end: number) => {
            // v7.9.9: Paridade Estrita com Browser
            const defaultMaxWords = isVertical ? 2 : 4;
            const maxChars = style.maxCharsPerLine || (isVertical ? 25 : 42);
            const effectiveMaxWords = style.maxWordsPerLine || defaultMaxWords;
            
            let text = wrapText(t || '', effectiveMaxWords, maxChars);
            if (style.textCasing === 'uppercase') text = text.toUpperCase();
            
            const textLines = text.split('\n');
            const lineHeight = fontSize * 1.25;
            const x = '(w-text_w)/2';

            const s = Math.max(0, start + SRT_ANTICIPATION_OFFSET);
            const e = Math.max(0.1, end + SRT_ANTICIPATION_OFFSET);

            textLines.forEach((line, idx) => {
                const escapedLine = line
                    .replace(/\\/g, '\\\\')
                    .replace(/'/g, "'\\''")
                    .replace(/:/g, '\\:')
                    .replace(/,/g, '\\,')
                    .replace(/;/g, '\\;')
                    .replace(/%/g, '\\%');

                const totalTextH = textLines.length * lineHeight;
                const lineY = `h*${yPosRatio} - ${totalTextH}/2 + ${idx}*${lineHeight}`;
                const enable = `between(t,${s.toFixed(3)},${e.toFixed(3)})`;

                // --- TÉCNICA DE STACKED SHADOWS (Simulação de Blur) ---
                const dist = (style.shadowDistance || 4) * scaleFactor;
                const angleRad = ((style.shadowAngle || 111) * Math.PI) / 180;
                const baseSX = Math.cos(angleRad) * dist;
                const baseSY = Math.sin(angleRad) * dist;
                
                if (style.shadowOpacity > 0) {
                    // v7.9.6: Dispersão dinâmica baseada no shadowBlur configurado e na resolução do vídeo
                    // Isso garante que a sombra tenha o mesmo aspecto "suave" tanto em 1080p quanto em resoluções verticais maiores.
                    const shadowOpacity = (style.shadowOpacity || 0.6) / 4;
                    const blurDispersion = ((style.shadowBlur || 4) / 4) * scaleFactor;
                    
                    const offsets = [
                        { dx: baseSX - blurDispersion, dy: baseSY - blurDispersion },
                        { dx: baseSX + blurDispersion, dy: baseSY - blurDispersion },
                        { dx: baseSX - blurDispersion, dy: baseSY + blurDispersion },
                        { dx: baseSX + blurDispersion, dy: baseSY + blurDispersion }
                    ];

                    offsets.forEach(off => {
                        filters.push(`drawtext=text='${escapedLine}':fontfile='${fontPath}':fontsize=${fontSize}:fontcolor=${shadowColor}@${shadowOpacity.toFixed(2)}:x=${x}+${off.dx.toFixed(1)}:y=${lineY}+${off.dy.toFixed(1)}:enable='${enable}'`);
                    });
                }

                // --- CAMADA PRINCIPAL (Texto Frontal) ---
                filters.push(`drawtext=text='${escapedLine}':fontfile='${fontPath}':fontsize=${fontSize}:fontcolor=${textColor}:borderw=${borderW.toFixed(1)}:bordercolor=${outlineColor}:x=${x}:y=${lineY}:enable='${enable}'`);
            });
        };

        if (segments.length > 0) {
            segments.forEach((seg: any) => processText(seg.text, seg.start, seg.end));
        } else if (item.text) {
             const itStart = item.start_seconds;
             const itDur = item.end_seconds - item.start_seconds;
             const words = item.text.split(' ');
             // v7.9.9: Fallback de grupo também respeita limite vertical
             const groupSize = style.maxWordsPerLine || (isVertical ? 2 : 4);
             for (let i = 0; i < words.length; i += groupSize) {
                 const group = words.slice(i, i + groupSize).join(' ');
                 const start = itStart + (i / words.length) * itDur;
                 const end = itStart + ((i + groupSize) / words.length) * itDur;
                 processText(group, start, Math.min(end, item.end_seconds));
             }
        }
    });

    return filters.join(',');
}

// --- RENDERIZADOR ---
async function main() {
  const args = process.argv.slice(2);
  const projectId = args.find(a => a.startsWith('--id='))?.split('=')[1];
  const includeSubs = args.find(a => a.startsWith('--subs='))?.split('=')[1] !== 'false';
  const presetId = args.find(a => a.startsWith('--presetId='))?.split('=')[1];

  if (!projectId) {
    console.error('Uso: npx tsx scripts/render_native.ts --id=ID --subs=true/false');
    process.exit(1);
  }

  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  await updateStatus(projectId, "Iniciando...", 0);

  console.log(`\n🚀 [FIREBASE MODE] v7.5.0 Nativa: ${projectId} (Legendas: ${includeSubs ? 'SIM' : 'NÃO'})`);

  // 1. Buscar dados
  const docRef = doc(db, 'projects', projectId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) { process.exit(1); }
  const project = docSnap.data();

  const itemsSnap = await getDocs(query(collection(db, 'projects', projectId, 'transcription_items')));
  const items = itemsSnap.docs.map(d => d.data()).sort((a, b) => a.start_seconds - b.start_seconds);
  
  const effectsSnap = await getDocs(query(collection(db, 'motion_effects')));
  const availableEffects = effectsSnap.docs.map(d => d.data());

  // Determinar aspecto: Priorizar parâmetro da linha de comando sobre o banco de dados
  let isVertical = project.aspect_ratio === '9:16';
  if (presetId) {
      if (presetId.startsWith('vertical')) isVertical = true;
      else if (presetId.startsWith('horizontal')) isVertical = false;
  }

  // Carregar preset de legenda se solicitado
  let subStyle: any = null;
  if (includeSubs) {
      const stylesSnap = await getDocs(collection(db, 'subtitle_presets'));
      const allStyles = stylesSnap.docs.map(d => {
          const data = d.data();
          return {
              id: data.id || d.id,
              label: data.label || 'Sem Nome',
              maxWordsPerLine: data.max_words_per_line || data.maxWordsPerLine || (isVertical ? 2 : 4),
              maxCharsPerLine: data.max_chars_per_line || data.maxCharsPerLine || (isVertical ? 25 : 42),
              fontSize: data.font_size || data.fontSize || 42,
              fontFamily: data.font_family || data.fontFamily || 'Montserrat',
              textColor: data.text_color || data.textColor || '#FFDD00',
              strokeColor: data.stroke_color || data.strokeColor || '#000000',
              strokeWidth: data.stroke_width || data.strokeWidth || 8,
              yPosition: data.y_position || data.yPosition || 80,
              textCasing: data.text_casing || data.textCasing || 'uppercase',
              isBold: data.is_bold !== undefined ? data.is_bold : (data.isBold !== undefined ? data.isBold : true),
              shadowColor: data.shadow_color || data.shadowColor || '#000000',
              shadowOpacity: data.shadow_opacity !== undefined ? parseFloat(data.shadow_opacity) : (data.shadowOpacity !== undefined ? data.shadowOpacity : 0.6),
              shadowBlur: data.shadow_blur !== undefined ? data.shadow_blur : (data.shadowBlur !== undefined ? data.shadowBlur : 12),
              shadowDistance: data.shadow_distance !== undefined ? data.shadow_distance : (data.shadowDistance !== undefined ? data.shadowDistance : 6),
              shadowAngle: data.shadow_angle !== undefined ? data.shadow_angle : (data.shadowAngle !== undefined ? data.shadowAngle : 111)
          };
      });
      const defaultId = isVertical ? 'vertical-9-16' : 'horizontal-16-9';
      const targetId = presetId || defaultId;
      subStyle = allStyles.find((s: any) => s.id === targetId) || allStyles.find((s: any) => s.id === defaultId) || allStyles[0];
      console.log(`📝 [Legendas] Usando preset: ${subStyle?.label || 'Padrão'} (ID: ${subStyle?.id})`);
      console.log(`📝 [Legendas] maxWordsPerLine=${subStyle?.maxWordsPerLine}, fontSize=${subStyle?.fontSize}, textColor=${subStyle?.textColor}, yPosition=${subStyle?.yPosition}`);
  }
  
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
  // Histórico de efeitos para evitar repetição excessiva (5 cenas conforme instructions.md)
  const effectHistory: any[] = [];

  // v7.9.8: Medir áudio ANTES do loop para garantir sincronia na última cena
  const audioDuration = await getVideoDuration(audioLocalPath);
  const totalItemsDuration = items.reduce((acc, item) => acc + (item.end_seconds - item.start_seconds), 0);
  const finalGap = audioDuration > totalItemsDuration ? (audioDuration - totalItemsDuration) : 0;
  
  if (finalGap > 0) {
      console.log(`⏳ Sincronia Master: Áudio é ${finalGap.toFixed(2)}s mais longo que as cenas. Ajustando última cena.`);
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // v7.9.9: Prioridade Máxima para mídias IMPORTADAS pelo usuário
    const url = item.imported_video_url || item.imported_image_url || item.image_url || item.google_image_url || item.pollinations_image_url;
    if (!url) continue;

    const progress = 10 + Math.round((i / items.length) * 80);
    await updateStatus(projectId, `Renderizando Cena ${i+1}/${items.length}...`, progress);

    const isVideo = !!item.imported_video_url;
    
    // v7.9.8: Se for a última cena, esticar para cobrir o gap do áudio
    const duration = (i === items.length - 1) 
        ? Math.max(0.1, (item.end_seconds - item.start_seconds) + finalGap)
        : Math.max(0.1, item.end_seconds - item.start_seconds);
    
    // Extensão
    const urlParts = url.split('?')[0].split('/');
    const lastPart = urlParts[urlParts.length - 1];
    const ext = lastPart.includes('.') ? lastPart.split('.').pop() : (isVideo ? 'mp4' : 'png');
    const assetPath = path.join(sessionPath, `asset_${i}.${ext}`);
    const sceneOutputPath = path.join(scenesPath, `scene_${String(i).padStart(4, '0')}.ts`);
    
    if (fs.existsSync(sceneOutputPath)) {
        const res = await getResolution(sceneOutputPath);
        if (res.width === width && res.height === height) {
            sceneFiles.push(sceneOutputPath);
            continue;
        } else {
            console.log(`⚠️ Cena ${i} incompatível (${res.width}x${res.height}). Re-renderizando para ${width}x${height}...`);
            fs.unlinkSync(sceneOutputPath);
        }
    }

    await downloadFile(url, assetPath);
    const originalDuration = isVideo ? await getVideoDuration(assetPath) : 0;

    let sceneFilter = '';
    if (isVideo) {
        // v7.9.9: Vídeo 1:1 (Sem zoom forçado)
        const zW = width;
        const zH = height;
        
        const ptsScale = originalDuration > 0 ? (duration / originalDuration) : 1;
        
        // v7.9.9: Pipeline de alta velocidade 1:1
        sceneFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setpts=(PTS-STARTPTS)*${ptsScale.toFixed(4)},fps=${FPS},setsar=1`;
        console.log(`🎥 Cena ${i}: VÍDEO MP4 — Duração: ${originalDuration.toFixed(2)}s -> ${duration.toFixed(2)}s (Scale: ${ptsScale.toFixed(2)}x) | FPS: ${FPS}`);
    } else {
        // Imagens: Rodízio aleatório de efeitos (sem repetir os últimos 5 conforme instructions.md)
        let effect;
        if (availableEffects.length > 0) {
            // Candidatos que não estão no histórico recente
            let candidates = availableEffects.filter(e => !effectHistory.some(h => (h as any).id === (e as any).id));
            
            // Se esgotarmos todos os candidatos únicos, relaxamos a restrição mas ainda evitamos o imediatamente anterior
            if (candidates.length === 0) {
                const previousEffect = effectHistory[effectHistory.length - 1];
                candidates = availableEffects.filter(e => (e as any).id !== (previousEffect as any)?.id);
            }

            const effectIndex = Math.floor(Math.random() * candidates.length);
            effect = candidates[effectIndex];
            
            // Atualizar histórico (limite de 5 cenas)
            effectHistory.push(effect);
            if (effectHistory.length > 5) effectHistory.shift();

            const instruction = (effect as any).instruction || '';
            const parsedParams = parseEffectInstruction(instruction);
            console.log(`🖼️ Cena ${i}: IMAGEM — Efeito: ${(effect as any).label || (effect as any).name || effectIndex}`);
            console.log(`   📐 Instrução: ${instruction.substring(0, 80)}...`);
            console.log(`   📐 Parâmetros: scale=${parsedParams.scaleStart}→${parsedParams.scaleEnd}, moveX=${parsedParams.moveXStart}→${parsedParams.moveXEnd}, moveY=${parsedParams.moveYStart}→${parsedParams.moveYEnd}`);
            
            const frames = Math.ceil(duration * FPS);
            const zoom = buildZoompanFilter(parsedParams, frames, width, height);
            sceneFilter = `scale=${width*1.12}:${height*1.12}:force_original_aspect_ratio=increase,crop=${width*1.12}:${height*1.12},${zoom},setsar=1`;
        } else {
            sceneFilter = `scale=${width*1.12}:${height*1.12}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
        }
    }
    const sceneArgs = [
        ...(isVideo ? ['-stream_loop', '-1'] : ['-loop', '1', '-t', duration.toFixed(3)]), 
        '-i', assetPath,
        '-vf', sceneFilter,
        '-t', duration.toFixed(3),
        '-r', FPS.toString(),
        '-pix_fmt', 'yuv420p',
        '-c:v', 'libx264',
        '-preset', 'ultrafast', 
        '-crf', '18',
        sceneOutputPath
    ];

    await runFFmpeg(sceneArgs);
    sceneFiles.push(sceneOutputPath);
  }


  const concatListPath = path.join(sessionPath, 'concat_list.txt');
  fs.writeFileSync(concatListPath, sceneFiles.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));

  const outputName = `OUTPUT_FIREBASE_${projectId}_${Date.now()}.mp4`;

  const overlayVhsPath = path.join(process.cwd(), 'public', 'overlay-vhs.mp4');
  const hasOverlayVhs = fs.existsSync(overlayVhsPath);
  
  // v6.2.1: Máscara Circular Dinâmica por Resolução (Evita reaproveitar 16:9 em 9:16)
  const maskPath = path.join(process.cwd(), `vignette_alpha_v62_${width}x${height}.png`);
  if (!fs.existsSync(maskPath)) {
      console.log(`🎨 Gerando máscara de vinheta v6.2.1 (${width}x${height})...`);
      // Usar binário absoluto para evitar erro de PATH
      const genMaskCmd = `"${FFMPEG_PATH}" -y -f lavfi -i "color=black:s=${width}x${height}" -vf "format=rgba,geq=r=0:g=0:b=0:a='255*(pow(hypot(X-W/2,Y-H/2)/hypot(W/2,H/2), 3.2))'" -vframes 1 "${maskPath}"`;
      try { execSync(genMaskCmd); } catch (e) { console.error('Erro ao gerar máscara:', e); }
  }

  const finalArgs = [
      '-f', 'concat', '-safe', '0', '-i', concatListPath,
      '-i', audioLocalPath,
  ];

  if (hasOverlayVhs) {
      finalArgs.push('-stream_loop', '-1', '-i', overlayVhsPath);
  }

  // v5.8.0: Adicionar máscara como input extra
  finalArgs.push('-i', maskPath);

  finalArgs.push(
      '-map', '1:a', // Mapear o áudio do input 1
      '-c:a', 'aac', '-b:a', '192k',
      '-shortest',
      '-aspect', isVertical ? '9:16' : '16:9',
  );

  // v6.0.1: Hotfix ESM + Estética Refinada
  const maskInputIdx = hasOverlayVhs ? '3' : '2';
  const drawTextFilters = (includeSubs && subStyle) ? generateDrawTextFilters(items, subStyle, isVertical, fontPath) : '';
  
  // v6.2.0: Estética 'True Contrast' (Apenas Vinheta Mask, cores originais)
  let visualEffects = '';
  if (drawTextFilters && drawTextFilters.trim().length > 0) {
      visualEffects += `${drawTextFilters},`;
  }
  visualEffects += `setsar=1`;

  let filterComplex = '';
  if (hasOverlayVhs) {
      // 1. Processar Overlay (Chromakey da cor exata #00B140 + Rescale)
      const vhsProcess = `[2:v]colorkey=0x00B140:0.3:0.1,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[vhs]`;
      
      // 2. Sobrepor VHS [vhs] nas cenas base [0:v]
      const compose = `[0:v][vhs]overlay=0:0[mixed]`;
      
      // 3. Aplicar Filtros Finais (v5.8.0: Máscara de Vinheta + Legendas)
      filterComplex = `${vhsProcess};${compose};[mixed][${maskInputIdx}:v]overlay=0:0,format=yuv420p,${visualEffects}[v_out]`;
  } else {
      filterComplex = `[0:v][${maskInputIdx}:v]overlay=0:0,format=yuv420p,${visualEffects}[v_out]`;
  }

  console.log(`📼 [VHS] Filter Complex: ${filterComplex}`);
  finalArgs.push('-filter_complex', filterComplex, '-map', '[v_out]');
  
  // v7.9.9: Masterização de Alta Velocidade (Turbo)
  finalArgs.push(
      '-c:v', 'libx264', 
      '-preset', 'fast', 
      '-crf', '18', 
      '-pix_fmt', 'yuv420p'
  );

  finalArgs.push(outputName);

  console.log(`\n🎬 [FFMPEG] Comando final: ffmpeg ${finalArgs.join(' ')}\n`);

  await runFFmpeg(finalArgs);
  await updateStatus(projectId, "Concluído!", 100);
  console.log(`\n✅ CONCLUÍDO! Vídeo gerado: ${outputName}`);
}

main().catch(async err => {
  const pid = process.argv.find(a => a.startsWith('--id='))?.split('=')[1] || "UNKNOWN";
  if (pid !== "UNKNOWN") {
      await updateStatus(pid, `Erro: ${err.message}`, 0);
  }
  console.error('\n❌ Erro Crítico:', err);
});
