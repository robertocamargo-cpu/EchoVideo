import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { TranscriptionItem, SubtitleStyleOption, MotionEffect, TransitionType } from '../types';
import { parseEffectInstruction, EffectParams } from './effectSelectionService';

// ─── Singleton ─────────────────────────────────────────────────────────────
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

export interface FFmpegRenderOptions {
  audioFile: File;
  items: TranscriptionItem[];
  transitionType: TransitionType;
  aspectRatio: '16:9' | '9:16';
  subtitleStyle?: SubtitleStyleOption;
  motionEffects?: MotionEffect[];
  maxDuration?: number;
}

interface SceneEntry {
  filename: string;
  isVideo: boolean;
  duration: number;
}

// ─── Carregar FFmpeg WASM ──────────────────────────────────────────────────
export const loadFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpegInstance && ffmpegLoaded) return ffmpegInstance;
  ffmpegInstance = new FFmpeg();
  ffmpegInstance.on('log', ({ message }) => console.log(`[FFmpeg Log] ${message}`));
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  ffmpegLoaded = true;
  return ffmpegInstance;
};

// ─── Helpers ──────────────────────────────────────────────────────────────
const detectExtension = (url: string, mimeType = ''): string => {
  if (url.startsWith('data:')) return url.includes('video') ? 'mp4' : 'jpg';
  const clean = url.split('?')[0].toLowerCase();
  for (const ext of ['mp4', 'webm', 'mov', 'jpg', 'jpeg', 'png', 'webp']) {
    if (clean.endsWith(`.${ext}`)) return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'jpg';
};

const urlToUint8Array = async (url: string): Promise<{ data: Uint8Array; mime: string } | null> => {
  if (url.startsWith('data:')) {
    const [header, base64] = url.split(',');
    const binary = atob(base64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
    return { data, mime: header.split(':')[1].split(';')[0] };
  }
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!res.ok) {
        console.warn(`[FFmpeg] Mídia ignorada (Status ${res.status}): ${url}`);
        return null;
    }
    const blob = await res.blob();
    return { data: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
  } catch (e) {
    console.warn(`[FFmpeg] Falha no download da mídia: ${url}`, e);
    return null;
  }
};

const wrapText = (text: string, maxWords: number): string => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) lines.push(words.slice(i, i + maxWords).join(' '));
  return lines.join('\n');
};

const escapeDrawText = (t: string) => {
  if (!t) return '';
  // Para arquivos de script (-filter_complex_script), o FFmpeg espera:
  // 1. Aspas simples escapadas com UMA barra invertida: \'
  // 2. Dois pontos escapados com UMA barra invertida: \:
  return t
    .replace(/\\/g, '\\\\')    // Escapar barras invertidas primeiro
    .replace(/'/g, "\\'")      // Aspas simples simples: \'
    .replace(/:/g, '\\:')      // Dois pontos: \:
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, ' ')
    .trim();
};

const buildZoompanFilter = (params: EffectParams, frames: number, width: number, height: number): string => {
  const { scaleStart, scaleEnd, moveXStart, moveXEnd, moveYStart, moveYEnd } = params;
  const N = Math.max(frames, 2);
  const prog = `(on-1)/${N-1}`;
  const zExpr = `${scaleStart.toFixed(4)}+(${(scaleEnd - scaleStart).toFixed(4)})*${prog}`;
  const mxExpr = `(${moveXStart.toFixed(4)}+(${(moveXEnd - moveXStart).toFixed(4)})*${prog})`;
  const xExpr  = `iw/2-iw/(2*z)+${mxExpr}*iw`;
  const myExpr = `(${moveYStart.toFixed(4)}+(${(moveYEnd - moveYStart).toFixed(4)})*${prog})`;
  const yExpr  = `ih/2-ih/(2*z)+${myExpr}*ih`;
  return `zoompan=z='${zExpr}':d=${N}:x='${xExpr}':y='${yExpr}':s=${width}x${height}`;
};

// ─── Render Principal com Suporte a Chunks (Resiliência ao Código 1) ──────────
export const renderWithFFmpeg = async (
  options: FFmpegRenderOptions,
  onProgress: (progress: number, message: string) => void
): Promise<Blob> => {
  const { audioFile, items, aspectRatio, maxDuration, subtitleStyle } = options;
  const ff = await loadFFmpeg();
  
  const CHUNK_SIZE = 8; 
  const sortedItems = [...items].sort((a, b) => a.startSeconds - b.startSeconds);
  const itemsWithMedia = sortedItems.filter(item => (item.importedVideoUrl || item.imageUrl || item.googleImageUrl || item.pollinationsImageUrl || item.importedImageUrl));

  if (itemsWithMedia.length === 0) throw new Error('Cenas sem mídia para exportar.');

  onProgress(0, `Iniciando renderização de ${itemsWithMedia.length} cenas em blocos...`);

  // Limpeza inicial de arquvos órfãos
  try {
    const files = await ff.listDir('.');
    for (const f of files) if (f.name !== '.' && f.name !== '..') await ff.deleteFile(f.name).catch(() => {});
  } catch (e) {}

  const width  = 1280; // 720p HD: qualidade de preview profissional
  const height = 720;
  const FPS = 24;
  const sessionID = Date.now();
  console.log(`🚀 [FFmpeg-WASM] Motor v2.6.5-HOTFIX iniciado. (Zoom 1.12 ativo)`);

  // Carregar Áudio e Fonte
  const audioFilename = `master_audio_${sessionID}.mp3`;
  await ff.writeFile(audioFilename, new Uint8Array(await audioFile.arrayBuffer()));
  
  let hasFont = false;
  try {
    const fontRes = await fetch('https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Bold.ttf');
    if (fontRes.ok) {
      await ff.writeFile('font.ttf', new Uint8Array(await fontRes.arrayBuffer()));
      hasFont = true;
    }
  } catch (e) {}

  // A seleção de efeitos agora será feita cena a cena no renderChunk para garantir aleatoriedade real
  // igual ao script render_native.ts (Desktop)

  const chunkFiles: string[] = [];
  const numChunks = Math.ceil(itemsWithMedia.length / CHUNK_SIZE);

  for (let c = 0; c < numChunks; c++) {
    const startIdx = c * CHUNK_SIZE;
    const endIdx = Math.min(startIdx + CHUNK_SIZE, itemsWithMedia.length);
    const chunkItems = itemsWithMedia.slice(startIdx, endIdx);

    onProgress(10 + Math.floor((c / numChunks) * 75), `Processando bloco ${c + 1} de ${numChunks}...`);

    const chunkPath = await renderChunk(ff, chunkItems, {
      width, height, FPS, sessionID, chunkIdx: c, hasFont, subtitleStyle, 
      availableEffects: options.motionEffects || []
    });
    chunkFiles.push(chunkPath);
  }

  // Merge Final de Chunks + Áudio
  onProgress(90, 'Unindo blocos e áudio final...');
  const concatList = chunkFiles.map(f => `file '${f}'`).join('\n');
  await ff.writeFile('list.txt', concatList);

  const finalDuration = itemsWithMedia[itemsWithMedia.length - 1].endSeconds;
  
  const mergeArgs = [
    '-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt',
    '-i', audioFilename,
    '-c', 'copy', '-map', '0:v', '-map', '1:a',
    '-t', finalDuration.toFixed(3),
    '-movflags', '+faststart',
    'final_output.mp4'
  ];

  const exitCode = await ff.exec(mergeArgs);
  if (exitCode !== 0) throw new Error(`Erro na união final (Código ${exitCode})`);

  const finalData = await ff.readFile('final_output.mp4');
  const blob = new Blob([new Uint8Array((finalData as Uint8Array).buffer.slice(0))], { type: 'video/mp4' });

  // Limpeza geral
  for (const f of chunkFiles) await ff.deleteFile(f).catch(() => {});
  await ff.deleteFile('list.txt').catch(() => {});
  await ff.deleteFile(audioFilename).catch(() => {});
  await ff.deleteFile('final_output.mp4').catch(() => {});

  onProgress(100, 'Renderização finalizada!');
  return blob;
};

// ─── Render Chunk ───────────────────────────────────────────────────────────
async function renderChunk(
  ff: FFmpeg,
  items: TranscriptionItem[],
  cfg: { width: number, height: number, FPS: number, sessionID: number, chunkIdx: number, hasFont: boolean, subtitleStyle?: SubtitleStyleOption, availableEffects: MotionEffect[] }
): Promise<string> {
  const { width, height, FPS, sessionID, chunkIdx, hasFont, subtitleStyle, availableEffects } = cfg;
  const chunkFilename = `part_${chunkIdx}_${sessionID}.mp4`;
  const localFiles: string[] = [];

  const scenes: SceneEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const url = item.importedVideoUrl || item.imageUrl || item.googleImageUrl || item.pollinationsImageUrl || item.importedImageUrl || '';
    const mediaBuffer = await urlToUint8Array(url);

    if (!url || !mediaBuffer) {
        console.warn(`[FFmpeg] Cena ${i} sem mídia válida. Criando placeholder.`);
        const blackPixel = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 120, 156, 99, 96, 96, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
        await ff.writeFile('placeholder.png', blackPixel);
        scenes.push({ filename: 'placeholder.png', isVideo: false, duration: Math.max(0.3, item.endSeconds - item.startSeconds) });
        continue;
    }

    const { data, mime } = mediaBuffer;
    const isActuallyVideo = (item.importedVideoUrl && (url.includes('.mp4') || mime.includes('video'))) || url.toLowerCase().endsWith('.mp4');
    const filename = `c${chunkIdx}_s${i}_${sessionID}.${isActuallyVideo ? 'mp4' : 'jpg'}`;
    
    await ff.writeFile(filename, data);
    localFiles.push(filename);
    const duration = Math.max(0.3, item.endSeconds - item.startSeconds);
    scenes.push({ filename, isVideo: isActuallyVideo, duration });
  }

  // PROTEÇÃO: Se o bloco não tem nenhuma cena válida (ex: falha de download total)
  if (scenes.length === 0) {
    console.warn(`[FFmpeg] Bloco ${chunkIdx} vazio. Gerando placeholder.`);
    const placeholderArgs = [
      '-y', '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:d=1`,
      '-c:v', 'libx264', '-t', '1', '-pix_fmt', 'yuv420p', chunkFilename
    ];
    await ff.exec(placeholderArgs);
    return chunkFilename;
  }

  let filterScript = '';
  const N = scenes.length;
  const defaultParams: EffectParams = { scaleStart: 1.15, scaleEnd: 1.30, moveXStart: -0.02, moveXEnd: 0.02, moveYStart: 0, moveYEnd: 0 };
  let lastEffectId = '';

  for (let i = 0; i < N; i++) {
    const s = scenes[i];
    const frames = Math.ceil(s.duration * FPS);
    
    if (s.isVideo) {
        // Cenas MP4: Zoom fixo de 112% (1.12) — Mesmo método do Desktop
        const zW = Math.round(width * 1.12);
        const zH = Math.round(height * 1.12);
        console.log(`🎥 [FFmpeg-WASM] Cena ${i} VÍDEO MP4. Zoom 112%: scale=${zW}x${zH} → crop=${width}x${height}`);
        filterScript += `[${i}:v]scale=${zW}:${zH},crop=${width}:${height},fps=${FPS},setpts=PTS-STARTPTS,format=yuv420p[v${i}];\n`;
    } else {
        // Imagens: Efeitos do banco de dados (mesma lógica do Desktop)
        if (availableEffects.length > 0) {
            let effectIndex;
            do {
                effectIndex = Math.floor(Math.random() * availableEffects.length);
            } while (availableEffects[effectIndex].id === lastEffectId && availableEffects.length > 1);
            
            const effect = availableEffects[effectIndex];
            lastEffectId = effect.id;
            console.log(`🖼️ [FFmpeg-WASM] Cena ${i} IMAGEM. Efeito: ${effect.name || effect.id}`);
            const params = parseEffectInstruction(effect.instruction);
            console.log(`   📐 Parâmetros: scale=${params.scaleStart}→${params.scaleEnd}, moveX=${params.moveXStart}→${params.moveXEnd}`);
            const zoom = buildZoompanFilter(params, frames, width, height);
            // Mesmo supersampling do Desktop: 1.5x input → zoompan output na resolução final
            const zoomW = Math.round(width * 1.5);
            const zoomH = Math.round(height * 1.5);
            filterScript += `[${i}:v]scale=${zoomW}:${zoomH},crop=${zoomW}:${zoomH},${zoom},fps=${FPS},setpts=PTS-STARTPTS,format=yuv420p[v${i}];\n`;
        } else {
            console.warn(`⚠️ [FFmpeg-WASM] Cena ${i} sem efeitos. Usando padrão.`);
            const zoom = buildZoompanFilter(defaultParams, frames, width, height);
            const zoomW = Math.round(width * 1.5);
            const zoomH = Math.round(height * 1.5);
            filterScript += `[${i}:v]scale=${zoomW}:${zoomH},crop=${zoomW}:${zoomH},${zoom},fps=${FPS},setpts=PTS-STARTPTS,format=yuv420p[v${i}];\n`;
        }
    }
  }

  const concatV = scenes.map((_, i) => `[v${i}]`).join('');
  filterScript += `${concatV}concat=n=${N}:v=1:a=0[vbase];\n`;

  let finalMap = '[vbase]';
  filterScript += '[vbase]copy[vfinal]';
  finalMap = '[vfinal]';

  const scriptPath = `filter_c${chunkIdx}.ff`;
  await ff.writeFile(scriptPath, filterScript);
  localFiles.push(scriptPath);

  const args = [
    '-y', ...scenes.flatMap(s => s.isVideo ? ['-t', s.duration.toFixed(3), '-i', s.filename] : ['-loop', '1', '-t', s.duration.toFixed(3), '-i', s.filename]),
    '-filter_complex_script', scriptPath, 
    '-map', finalMap,
    '-vcodec', 'libx264', '-crf', '24', '-pix_fmt', 'yuv420p', '-an', '-r', String(FPS), chunkFilename
  ];

  const exitCode = await ff.exec(args);
  if (exitCode !== 0) {
    // Diagnóstico avançado do erro 404 que você viu
    const failedAsset = scenes.find(s => !s.filename);
    const msg = failedAsset 
      ? `A cena 0 falhou por erro na IA (404/Not Found). Verifique se o ID do modelo Gemini está correto no seu plano.` 
      : `Erro na Renderização do Bloco ${chunkIdx}. Verifique o console para detalhes.`;

    console.error(`❌ ERRO CRÍTICO FFmpeg (Chunk ${chunkIdx}):`, {
      exitCode,
      diagnostico: msg,
      args: args.join(' ')
    });
    throw new Error(msg);
  }
  
  for (const f of localFiles) await ff.deleteFile(f).catch(() => {});
  return chunkFilename;
}
