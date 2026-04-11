import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { TranscriptionItem, SubtitleStyleOption, MotionEffect, TransitionType } from '../types';
import { parseEffectInstruction, preselectEffectsForScenes, EffectParams } from './effectSelectionService';

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

  const width  = 640; // REDUÇÃO DE TESTE: 360p é ultra estável no Chrome
  const height = 360;
  const FPS = 24;
  const sessionID = Date.now();

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

  // Pré-selecionar efeitos para TODAS as cenas de imagem de uma vez (Continuidade Visual)
  const globalEffectMap = new Map<number, EffectParams>();
  const imageOnlyItems = itemsWithMedia.map((item, i) => ({ item, i })).filter(({ item }) => !item.importedVideoUrl);
  
  if (options.motionEffects?.length && imageOnlyItems.length > 0) {
    try {
      const preselectedMap = await preselectEffectsForScenes(imageOnlyItems.map(x => x.item), options.motionEffects);
      // Corrigindo mapeamento: preselectedMap usa índices 0, 1, 2... relativos à lista imageOnlyItems
      preselectedMap.forEach((effect, sceneIdx) => {
          const globalSceneIdx = imageOnlyItems[sceneIdx].i;
          globalEffectMap.set(globalSceneIdx, parseEffectInstruction(effect.instruction));
      });
      console.log(`🎬 [FFmpeg] ${globalEffectMap.size} cenas de imagem receberam animação Ken Burns roteada.`);
    } catch (e) {
      console.warn("[FFmpeg] Falha na pré-seleção global de efeitos:", e);
    }
  }

  const chunkFiles: string[] = [];
  const numChunks = Math.ceil(itemsWithMedia.length / CHUNK_SIZE);

  for (let c = 0; c < numChunks; c++) {
    const startIdx = c * CHUNK_SIZE;
    const endIdx = Math.min(startIdx + CHUNK_SIZE, itemsWithMedia.length);
    const chunkItems = itemsWithMedia.slice(startIdx, endIdx);
    
    // Sub-mapa de efeitos para este chunk específico
    const chunkEffects = new Map<number, EffectParams>();
    for (let i = startIdx; i < endIdx; i++) {
        if (globalEffectMap.has(i)) {
            chunkEffects.set(i - startIdx, globalEffectMap.get(i)!);
        }
    }

    onProgress(10 + Math.floor((c / numChunks) * 75), `Processando bloco ${c + 1} de ${numChunks}...`);

    const chunkPath = await renderChunk(ff, chunkItems, {
      width, height, FPS, sessionID, chunkIdx: c, hasFont, subtitleStyle, 
      motionEffects: chunkEffects
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
  cfg: { width: number, height: number, FPS: number, sessionID: number, chunkIdx: number, hasFont: boolean, subtitleStyle?: SubtitleStyleOption, motionEffects?: Map<number, EffectParams> }
): Promise<string> {
  const { width, height, FPS, sessionID, chunkIdx, hasFont, subtitleStyle, motionEffects } = cfg;
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
    const filename = `c${chunkIdx}_s${i}_${sessionID}.${detectExtension(url, mime)}`;
    await ff.writeFile(filename, data);
    localFiles.push(filename);
    const duration = Math.max(0.3, item.endSeconds - item.startSeconds);
    scenes.push({ filename, isVideo: !!item.importedVideoUrl, duration });
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

  const chunkEffectParams = motionEffects || new Map<number, EffectParams>();

  for (let i = 0; i < N; i++) {
    const s = scenes[i];
    const frames = Math.ceil(s.duration * FPS);
    
    if (s.isVideo) {
        // Cenas MP4: Zoom fixo de 12% (1.12) sem animação - Forçado via scale e setsar
        const zW = Math.round(width * 1.12);
        const zH = Math.round(height * 1.12);
        const ozW = width;
        const ozH = height;
        // Adicionando pad na escala para garantir que o enquadramento não mude por causa do aspect ratio
        const scaleBase = `scale=${zW}:${zH}:force_original_aspect_ratio=increase,crop=${ozW}:${ozH}:(iw-ow)/2:(ih-oh)/2,setsar=1`;
        filterScript += `[${i}:v]${scaleBase},fps=${FPS},setpts=PTS-STARTPTS,format=yuv420p[v${i}];\n`;
    } else {
        // Imagens: Aplica Zoompan com base 1.11
        const params = chunkEffectParams.get(i) || defaultParams;
        const zoom = buildZoompanFilter(params, frames, width, height);
        // Escala maior antes do zoompan para manter qualidade (supersampling)
        const scaleIn = `scale=${width*1.5}:${height*1.5}:force_original_aspect_ratio=increase,crop=${width*1.5}:${height*1.5}`;
        filterScript += `[${i}:v]${scaleIn},${zoom},fps=${FPS},setpts=PTS-STARTPTS,format=yuv420p[v${i}];\n`;
    }
  }

  const concatV = scenes.map((_, i) => `[v${i}]`).join('');
  filterScript += `${concatV}concat=n=${N}:v=1:a=0[vbase];\n`;

  let finalMap = '[vbase]';
  // Bypass total de legendas para teste de estabilidade
  filterScript += '[vbase]copy[vfinal]';
  finalMap = '[vfinal]';

  const scriptPath = `filter_c${chunkIdx}.ff`;
  console.log(`🎬 [FFmpeg] Script de Filtro para Chunk ${chunkIdx}:\n`, filterScript);
  await ff.writeFile(scriptPath, filterScript);
  localFiles.push(scriptPath);

  const args = [
    '-y', ...scenes.flatMap(s => s.isVideo ? ['-t', s.duration.toFixed(3), '-i', s.filename] : ['-loop', '1', '-t', s.duration.toFixed(3), '-i', s.filename]),
    '-filter_complex_script', scriptPath, 
    '-map', finalMap,
    '-vcodec', 'libx264', '-crf', '28', '-pix_fmt', 'yuv420p', '-an', '-r', String(FPS), chunkFilename
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
