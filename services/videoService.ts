console.log("🚀 [VideoService] v8.1.0 - Diagnóstico Ativo!");

import { TranscriptionItem, TransitionType, SubtitleStyleOption, MotionEffect } from "../types";
import { createSilentAudioBlob } from "./audioService";
import { parseEffectInstruction, preselectEffectsForScenes, EffectParams } from "./effectSelectionService";

interface WeightedChunk {
    text: string;
    startSeconds: number;
    endSeconds: number;
}

/**
 * Detecta o melhor tipo MIME suportado pelo navegador para gravação de vídeo.
 */
const getSupportedMimeType = (): string => {
    const types = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
};

/**
 * Divide o texto de uma cena em partes menores para as legendas.
 * Garante sincronia rítmica baseada em palavras ou caracteres.
 */
const getPresetWeightedChunks = (
    text: string,
    isVertical: boolean,
    sceneStart: number,
    sceneDuration: number,
    maxWordsFromStyle?: number,
    maxCharsFromStyle?: number,
    srtSegments?: { start: number; end: number; text: string }[]
): WeightedChunk[] => {
    if (srtSegments && srtSegments.length > 0) {
        const SRT_ANTICIPATION_OFFSET = -0.5; // instructions.md §3.7: antecipação de 500ms
        return srtSegments.map(seg => ({
            text: seg.text,
            startSeconds: Math.max(0, seg.start + SRT_ANTICIPATION_OFFSET),
            endSeconds: Math.max(0.1, seg.end + SRT_ANTICIPATION_OFFSET)
        }));
    }
    if (!text) return [];

    // Limpeza de texto para evitar chunks com apenas pontuação
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];

    const rawChunks: string[] = [];
    const maxWords = maxWordsFromStyle || (isVertical ? 2 : 4);
    const maxChars = maxCharsFromStyle || (isVertical ? 25 : 42); 

    let current: string[] = [];
    for (const word of words) {
        const test = [...current, word].join(' ');
        // Vertical: Foco em poucas palavras (1-3). Horizontal: Foco em leitura (até 42 chars).
        if (current.length >= maxWords || test.length > maxChars) {
            if (current.length > 0) rawChunks.push(current.join(' '));
            current = [word];
        } else {
            current.push(word);
        }
    }
    if (current.length > 0) rawChunks.push(current.join(' '));

    // PESO RÍTMICO:
    // Para Vertical (Shorts), a troca rítmica palavra-por-palavra ou blocos curtos é melhor
    // estimada pela quantidade de palavras, não apenas caracteres.
    const weights = rawChunks.map(chunk => {
        const chunkWords = chunk.split(/\s+/).length;
        const chunkChars = chunk.length;
        // Combinação ponderada: Palavras valem 70%, Caracteres valem 30% do peso do tempo
        return (chunkWords * 0.7) + (chunkChars * 0.3);
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let currentAccumulatedWeight = 0;
    return rawChunks.map((chunkText, i) => {
        const chunkWeight = weights[i] / totalWeight;

        // Sincronia exata no start
        const start = sceneStart + (currentAccumulatedWeight * sceneDuration);
        currentAccumulatedWeight += chunkWeight;

        // Sincronia exata no end (o último deve bater exatamente com sceneStart + sceneDuration)
        const end = i === rawChunks.length - 1
            ? sceneStart + sceneDuration
            : sceneStart + (currentAccumulatedWeight * sceneDuration);

        return {
            text: chunkText,
            startSeconds: Number(start.toFixed(4)), // Precisão extra
            endSeconds: Number(end.toFixed(4))
        };
    });
};

const formatSRTTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

export const generatePresetSRT = (
    items: TranscriptionItem[],
    preset: 'horizontal' | 'vertical',
    audioDuration: number,
    subtitleStyle?: SubtitleStyleOption
): string => {
    const isVertical = preset === 'vertical';
    let srt = "";
    let counter = 1;
    // Garante que os itens estão ordenados para evitar saltos temporais no SRT
    const sortedItems = [...items].sort((a, b) => a.startSeconds - b.startSeconds);

    sortedItems.forEach((it) => {
        const duration = Math.max(0.1, it.endSeconds - it.startSeconds);
        const chunks = getPresetWeightedChunks(it.text, isVertical, it.startSeconds, duration, subtitleStyle?.maxWordsPerLine, subtitleStyle?.maxCharsPerLine, it.srtSegments);
        chunks.forEach(chunk => {
            srt += `${counter}\n${formatSRTTime(chunk.startSeconds)} --> ${formatSRTTime(chunk.endSeconds)}\n${chunk.text}\n\n`;
            counter++;
        });
    });
    return srt;
};

const applyCasing = (text: string, casing: 'uppercase' | 'sentence' | 'title') => {
    if (!text) return "";
    if (casing === 'uppercase') return text.toUpperCase();
    if (casing === 'title') return text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    if (casing === 'sentence') return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    return text;
};

const wrapText = (text: string, maxWords: number, maxChars: number = 25) => {
    if (!text) return [];
    const words = text.split(' ');
    const lines = [];
    let current: string[] = [];
    for (const word of words) {
        const test = [...current, word].join(' ');
        if (current.length >= maxWords || test.length > maxChars) {
            if (current.length > 0) lines.push(current.join(' '));
            current = [word];
        } else {
            current.push(word);
        }
    }
    if (current.length > 0) lines.push(current.join(' '));
    return lines;
};

const drawSubtitle = (ctx: CanvasRenderingContext2D, text: string, width: number, height: number, style: SubtitleStyleOption) => {
    if (!text) return;
    ctx.save();
    let displayText = applyCasing(text, style.textCasing);
    const weight = style.isBold ? '900' : '400';
    ctx.font = `${style.isItalic ? 'italic ' : ''}${weight} ${style.fontSize}px "${style.fontFamily}", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapText(displayText, style.maxWordsPerLine || 4, style.maxCharsPerLine || 42);
    const x = width / 2;
    const yBase = (height * style.yPosition) / 100;
    const lineHeight = style.fontSize * 1.25;

    lines.forEach((line, index) => {
        const y = yBase + (index * lineHeight) - ((lines.length - 1) * lineHeight / 2);

        if (style.shadowOpacity > 0) {
            const rad = (style.shadowAngle || 111) * (Math.PI / 180);
            ctx.shadowColor = `rgba(0,0,0,${style.shadowOpacity})`;
            ctx.shadowBlur = style.shadowBlur;
            ctx.shadowOffsetX = Math.cos(rad) * style.shadowDistance;
            ctx.shadowOffsetY = Math.sin(rad) * style.shadowDistance;
        }

        if (style.strokeWidth > 0) {
            ctx.strokeStyle = style.strokeColor;
            ctx.lineWidth = (style.fontSize * (style.strokeWidth / 100));
            ctx.lineJoin = "round";
            ctx.strokeText(line, x, y);
        }

        ctx.shadowColor = "transparent";
        ctx.fillStyle = style.textColor;
    });
    ctx.restore();
};

const drawSingleSource = (
    ctx: CanvasRenderingContext2D,
    source: HTMLImageElement | HTMLVideoElement | null,
    width: number,
    height: number,
    index: number,
    progress: number,
    alpha: number = 1.0,
    motionEffect?: MotionEffect,
    availableEffects?: MotionEffect[],
    placeholder?: HTMLImageElement
) => {
    if (!source || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const isVideo = source instanceof HTMLVideoElement;
    const sWidth = isVideo ? (source as HTMLVideoElement).videoWidth : (source as HTMLImageElement).width;
    const sHeight = isVideo ? (source as HTMLVideoElement).videoHeight : (source as HTMLImageElement).height;
    if (sWidth === 0 || sHeight === 0) { ctx.restore(); return; }

    const coverScale = Math.max(width / sWidth, height / sHeight);
    // Remover zoom de 1.15% em vídeos (Causa lentidão e lag no browser)
    let finalScale = coverScale;
    let offsetX = 0;
    let offsetY = 0;

    if (!isVideo) {
        let params: EffectParams | null = null;
        
        // 1. Tentar ler o efeito pré-selecionado (vinculado ao índice global da cena)
        if (motionEffect && motionEffect.instruction) {
            params = parseEffectInstruction(motionEffect.instruction);
            if (params && index % 5 === 0) console.log(`🎬 [VideoService] Aplicando: ${motionEffect.name} na cena ${index}`);
        } 
        
        // 2. Fallback: Se não tem efeito específico, tentar pegar um aleatório da biblioteca disponível
        if (!params && availableEffects && availableEffects.length > 0) {
            const fallbackEffect = availableEffects[Math.floor(Math.random() * availableEffects.length)];
            if (fallbackEffect.instruction) {
                params = parseEffectInstruction(fallbackEffect.instruction);
                console.warn(`⚠️ [VideoService] Usando FALLBACK ALEATÓRIO para cena ${index}: ${fallbackEffect.name}`);
            }
        }

        if (params) {
            const scaleRange = params.scaleEnd - params.scaleStart;
            finalScale = coverScale * (params.scaleStart + (scaleRange * progress));
            offsetX = width * (params.moveXStart + ((params.moveXEnd - params.moveXStart) * progress));
            offsetY = height * (params.moveYStart + ((params.moveYEnd - params.moveYStart) * progress));

            if (params.rotation) {
                const centerX = width / 2;
                const centerY = height / 2;
                ctx.translate(centerX, centerY);
                ctx.rotate((params.rotation * progress * Math.PI) / 180);
                ctx.translate(-centerX, -centerY);
            }
        } else {
            // 3. FALLBACK ABSOLUTO: Zoom suave padrão 1.1x -> 1.25x para evitar imagem estática
            if (index === 0) console.warn("🚨 [VideoService] NENHUM EFEITO VÁLIDO ENCONTRADO. Usando Fallback Absoluto (Zoom Único).");
            const zoomAmount = 0.15;
            finalScale = coverScale * (1.10 + (zoomAmount * progress));
            offsetX = 0;
            offsetY = 0;
        }
    }

    const targetWidth = sWidth * finalScale;
    const targetHeight = sHeight * finalScale;
    const x = (width / 2) - (targetWidth / 2) + offsetX;
    const y = (height / 2) - (targetHeight / 2) + offsetY;

    if (isVideo) {
        const v = source as HTMLVideoElement;
        v.muted = true;
        if (v.paused) v.play().catch(() => {});

        // v8.1.4: ANTI-FLASH - Desenha o placeholder se o vídeo não estiver pronto
        if (v.readyState < 2 && placeholder && placeholder.complete) {
            ctx.drawImage(placeholder, x, y, targetWidth, targetHeight);
            ctx.restore();
            return;
        }
        
        // Se estiver pronto, ainda desenhamos o placeholder por baixo por segurança extrema
        if (placeholder && placeholder.complete) {
            ctx.drawImage(placeholder, x, y, targetWidth, targetHeight);
        }
    }

    ctx.drawImage(source, x, y, targetWidth, targetHeight);
    ctx.restore();
};

export const generateTimelineVideo = async (
    audioFile: File | Blob,
    items: TranscriptionItem[],
    transitionType: TransitionType,
    onProgress: (progress: number, message: string) => void,
    aspectRatio: '16:9' | '9:16' = '16:9',
    subtitleStyle?: SubtitleStyleOption,
    motionEffects?: MotionEffect[],
    maxDuration?: number
): Promise<Blob> => {
    return new Promise(async (resolve, reject) => {
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const arrayBuffer = await audioFile.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const audioDuration = audioBuffer.duration;

            const width = aspectRatio === '9:16' ? 720 : 1280;
            const height = aspectRatio === '9:16' ? 1280 : 720;
            const isVertical = aspectRatio === '9:16';

            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!;

            // v5.4.0: Efeito Vinheta (Browser)
            const applyVignette = (targetCtx: CanvasRenderingContext2D) => {
                const centerX = width / 2;
                const centerY = height / 2;
                const radius = Math.sqrt(centerX * centerX + centerY * centerY);
                const grd = targetCtx.createRadialGradient(centerX, centerY, radius * 0.1, centerX, centerY, radius); // v7.9.4: Começa mais cedo (0.1)
                grd.addColorStop(0, 'rgba(0,0,0,0)');
                grd.addColorStop(0.4, 'rgba(0,0,0,0.1)');
                grd.addColorStop(0.7, 'rgba(0,0,0,0.5)');
                grd.addColorStop(1, 'rgba(0,0,0,0.95)'); // v7.9.4: 95% de sombra nas bordas
                targetCtx.fillStyle = grd;
                targetCtx.fillRect(0, 0, width, height);
            };

            // v7.8.0: Efeito VHS Overlay (Browser - Chromakey Verde #00B140)
            const vhsCanvas = document.createElement('canvas');
            vhsCanvas.width = width; vhsCanvas.height = height;
            const vhsCtx = vhsCanvas.getContext('2d', { willReadFrequently: true })!;

             const applyVHS = (targetCtx: CanvasRenderingContext2D, vhsVideo: HTMLVideoElement | null) => {
                 if (!vhsVideo) return;
                 
                 if (vhsVideo.paused) vhsVideo.play().catch(() => {});
                 
                 // v8.1.2: Fallback de dimensões para garantir desenho imediato mesmo sem metadados
                 const vWidth = vhsVideo.videoWidth || 1920;
                 const vHeight = vhsVideo.videoHeight || 1080;

                 try {
                     // Técnica COVER (Proporcional)
                     const scale = Math.max(width / vWidth, height / vHeight);
                     const drawW = vWidth * scale;
                     const drawH = vHeight * scale;
                     const drawX = (width - drawW) / 2;
                     const drawY = (height - drawH) / 2;

                     vhsCtx.clearRect(0, 0, width, height);
                     vhsCtx.drawImage(vhsVideo, drawX, drawY, drawW, drawH);
                     
                     const imageData = vhsCtx.getImageData(0, 0, width, height);
                     const data = imageData.data;
                     
                     for (let i = 0; i < data.length; i += 4) {
                         const r = data[i], g = data[i + 1], b = data[i + 2];
                         // Chromakey equilibrado para browser
                         if (g > 50 && g > r * 1.05 && g > b * 1.05) {
                             data[i + 3] = 0;
                         }
                     }
                     
                     vhsCtx.putImageData(imageData, 0, 0);
                     targetCtx.save();
                     targetCtx.globalAlpha = 0.85; // Opacidade calibrada
                     targetCtx.drawImage(vhsCanvas, 0, 0);
                     targetCtx.restore();
                 } catch (e) {
                     // Silently ignore
                 }
             };
            

            // Forçar dimensões estilo para garantir que o Stream capture o aspecto correto
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            canvas.style.position = 'fixed';
            canvas.style.left = '-9999px';
            canvas.style.top = '-9999px';
            document.body.appendChild(canvas);

            if (!ctx) throw new Error("Canvas context falhou.");

            const sortedItems = [...items].sort((a, b) => a.startSeconds - b.startSeconds);

            // Pré-selecionar efeitos para cada cena
            const effectMap = new Map<number, MotionEffect>();
            if (motionEffects && motionEffects.length > 0) {
                const preselectedEffects = await preselectEffectsForScenes(sortedItems, motionEffects);
                preselectedEffects.forEach((effect, index) => {
                    effectMap.set(index, effect);
                    console.log(`🎬 Cena ${index + 1}: Aplicando "${effect.name}" | Instrução: ${effect.instruction}`);
                });
            }

            // CRITICAL: Mapa Global de Legendas Pré-calculado e DESDUPLICADO
            const allSubtitleChunks: WeightedChunk[] = [];
            const seenSegments = new Set<string>();

            const hasGlobalSrtData = sortedItems.some(it => it.srtSegments && it.srtSegments.length > 0);

            if (hasGlobalSrtData) {
                // Modo Estrito: Se um SRT foi providenciado, APENAS legendas vindas do SRT serão renderizadas.
                // Cenas de silêncio absoluto (sem srtSegments atrelados) NÃO vão gerar blocos de texto matemáticos alucinados.
                const SRT_OFFSET = -0.5; // instructions.md §3.7: antecipação de 500ms
                sortedItems.forEach(it => {
                    if (it.srtSegments) {
                        it.srtSegments.forEach(seg => {
                            const key = `${seg.start.toFixed(3)}_${seg.text.trim()}`;
                            if (!seenSegments.has(key)) {
                                allSubtitleChunks.push({
                                    text: seg.text,
                                    startSeconds: Math.max(0, seg.start + SRT_OFFSET),
                                    endSeconds: Math.max(0.1, seg.end + SRT_OFFSET)
                                });
                                seenSegments.add(key);
                            }
                        });
                    }
                });
            } else {
                // Modo Fallback: Nenhum SRT foi providenciado para o projeto, então distribuímos matematicamente 
                // o iterado de texto cru da IA entre o inicio e o fim de cada cena.
                sortedItems.forEach(it => {
                    const duration = it.endSeconds - it.startSeconds;
                    const sceneChunks = getPresetWeightedChunks(it.text, isVertical, it.startSeconds, duration, subtitleStyle?.maxWordsPerLine, subtitleStyle?.maxCharsPerLine, undefined);

                    sceneChunks.forEach(chunk => {
                        const key = `${chunk.startSeconds.toFixed(3)}_${chunk.text.trim()}`;
                        if (!seenSegments.has(key)) {
                            allSubtitleChunks.push(chunk);
                            seenSegments.add(key);
                        }
                    });
                });
            }

            // Re-sort global subtitles just in case
            const loadedAssets = new Map<number, HTMLImageElement | HTMLVideoElement>();
            const loadedPlaceholders = new Map<number, HTMLImageElement>();
            const assetUrls = new Map<number, string>();
            let loadedCount = 0;
            const totalToLoad = sortedItems.length;

            if (totalToLoad > 0) {
                onProgress(0, `Preparando Mídias (0/${totalToLoad})...`);
                await Promise.all(sortedItems.map((item, idx) => {
                    const url = item.importedVideoUrl || item.imageUrl || item.googleImageUrl || item.pollinationsImageUrl || item.importedImageUrl;
                    if (!url) return Promise.resolve();
                    assetUrls.set(idx, url);
                    
                    // Carregar placeholder se for vídeo
                    const placeholderUrl = item.importedVideoUrl ? (item.imageUrl || item.googleImageUrl || item.pollinationsImageUrl || item.importedImageUrl) : null;

                    return new Promise<void>(async (res) => {
                        const timeout = setTimeout(() => {
                            console.warn(`[VideoService] Timeout carregando mídia da cena ${idx + 1}`);
                            res(); 
                        }, 15000);

                        const handleLoadSuccess = (asset: HTMLImageElement | HTMLVideoElement) => {
                            clearTimeout(timeout);
                            loadedAssets.set(idx, asset);
                            loadedCount++;
                            onProgress(Math.floor((loadedCount / totalToLoad) * 5), `Preparando Mídias (${loadedCount}/${totalToLoad})...`);
                            res();
                        };

                        // Se houver placeholder, carregar em paralelo
                        if (placeholderUrl) {
                            const pImg = new Image();
                            pImg.crossOrigin = "anonymous";
                            pImg.src = placeholderUrl;
                            pImg.onload = () => loadedPlaceholders.set(idx, pImg);
                        }

                        if (item.importedVideoUrl) {
                            const v = document.createElement('video');
                            v.src = url; v.muted = true; v.volume = 0; v.crossOrigin = "anonymous"; v.playsInline = true; v.loop = true;
                            v.onloadeddata = () => { v.volume = 0; handleLoadSuccess(v); };
                            v.onerror = () => { clearTimeout(timeout); res(); };
                            v.load();
                        } else {
                            const img = new Image();
                            img.onload = () => handleLoadSuccess(img);
                            img.onerror = () => { clearTimeout(timeout); res(); };
                            if (url.includes('data:')) {
                                img.src = url;
                            } else {
                                const cleanUrl = url.includes('?') ? `${url}&cb=${Date.now()}_${idx}` : `${url}?cb=${Date.now()}_${idx}`;
                                fetch(cleanUrl)
                                    .then(r => r.blob())
                                    .then(blob => {
                                        const blobUrl = URL.createObjectURL(blob);
                                        img.onload = () => { URL.revokeObjectURL(blobUrl); handleLoadSuccess(img); };
                                        img.src = blobUrl;
                                    })
                                    .catch(() => {
                                        img.crossOrigin = "anonymous";
                                        img.src = url;
                                    });
                            }
                        }
                    });
                }));
            }

            // v7.9.9: Carregamento do VHS não-bloqueante para evitar travamento do render
            let vhsVideo: HTMLVideoElement | null = null;
            const loadVHS = () => {
                try {
                    const v = document.createElement('video');
                    v.src = '/overlay-vhs.mp4'; // v8.0.9: Caminho raiz padrão
                    v.muted = true; v.loop = true; 
                    v.setAttribute('muted', '');
                    v.setAttribute('playsinline', '');
                    v.setAttribute('autoplay', '');
                    v.crossOrigin = "anonymous";
                    v.preload = "auto";
                    vhsVideo = v; // v7.9.9: Atribuição imediata para o loop não pular o efeito
                    v.onloadeddata = () => {
                        console.log("[VideoService] ✅ VHS Overlay pronto.");
                        v.play().catch(() => {});
                    };
                    v.onerror = () => {
                        console.warn("[VideoService] ❌ VHS indisponível");
                        vhsVideo = null;
                    };
                    v.style.position = 'fixed';
                    v.style.top = '-9999px';
                    v.style.left = '-9999px';
                    v.style.opacity = '0';
                    document.body.appendChild(v);
                    v.load();
                } catch (e) { console.warn("[VideoService] Falha ao preparar VHS"); }
            };
            loadVHS();

            const loadAssetForScene = async (idx: number): Promise<HTMLImageElement | HTMLVideoElement | null> => {
                if (loadedAssets.has(idx)) return loadedAssets.get(idx)!;
                const url = assetUrls.get(idx);
                if (!url) return null;
                
                const isVideo = sortedItems[idx]?.importedVideoUrl !== undefined;
                return new Promise((res) => {
                    if (isVideo) {
                        const v = document.createElement('video');
                        v.src = url; v.muted = true; v.volume = 0; v.crossOrigin = "anonymous"; v.playsInline = true; v.loop = true;
                        v.onloadeddata = () => { v.volume = 0; res(v); };
                        v.onerror = () => res(null);
                        v.load();
                    } else {
                        const img = new Image();
                        img.crossOrigin = "anonymous";
                        img.onload = () => res(img);
                        img.onerror = () => res(null);
                        img.src = url;
                    }
                });
            };

            const streamDestination = audioContext.createMediaStreamDestination();
            const supportedType = getSupportedMimeType();

            // Reduzindo o bitrate para 6Mbps para maior estabilidade e fluidez (Fim do soquinho)
            const recorder = new MediaRecorder(new MediaStream([
                ...canvas.captureStream(30).getVideoTracks(), 
                ...streamDestination.stream.getAudioTracks()
            ]), {
                mimeType: supportedType || undefined,
                videoBitsPerSecond: 6000000
            });

            const chunks: Blob[] = [];
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
                audioContext.close();
                const mime = recorder.mimeType || 'video/webm';
                resolve(new Blob(chunks, { type: mime }));
            };
            const sourceNode = audioContext.createBufferSource();
            sourceNode.buffer = audioBuffer;
            // GainNode como buffer intermediário para evitar glitches/chiados de áudio
            const gainNode = audioContext.createGain();
            gainNode.gain.setValueAtTime(1.0, audioContext.currentTime);
            sourceNode.connect(gainNode);
            gainNode.connect(streamDestination);
            // gainNode.connect(audioContext.destination); // MUDO DURANTE RENDER: Monitor local desativado para evitar áudio duplo/travado

            if (audioContext.state === 'suspended') await audioContext.resume();

            let isFinished = false;
            let audioStartTime = 0;
            const startTime = Date.now();

            let lastProgressUpdate = 0;
            let animationFrameId: number | null = null;
            let lastActiveIdx = -1; // Rastreia a cena ativa anterior para seek de entrada único
            let preloadedNextIdx = -1; // Pré-carregou a próxima cena?

            const renderLoop = () => {
                if (isFinished) return;

                // CRITICAL FIX: Use the exact audio hardware clock to avoid sync drift
                // Also auto-resume AudioContext if browser suspended it (e.g. tab lost focus)
                if (audioContext.state === 'suspended') {
                    audioContext.resume().catch(() => {});
                }

                try {
                    // v7.9.9: Relógio Híbrido (Audio + Backup de Tempo Real)
                    const audioElapsed = audioContext.currentTime - audioStartTime;
                    const wallElapsed = (Date.now() - startTime) / 1000;
                    
                    // Se o áudio estiver muito atrasado (> 200ms) em relação ao tempo real, usamos o tempo real
                    // Isso evita congelamentos se o hardware de áudio do navegador travar.
                    const elapsed = Math.max(audioElapsed, wallElapsed);
                    
                    const transitionDuration = 0.1; // v8.0.6: Quase um corte seco para evitar frames mortos
                    const effectiveDuration = maxDuration ? Math.min(audioDuration, maxDuration) : audioDuration;

                    // Safety: force stop if we're 10% past effectiveDuration
                    if (elapsed >= effectiveDuration * 1.1) {
                        console.warn('[VideoService] Safety timeout reached, forcing stop');
                        isFinished = true;
                        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
                        if (recorder.state === 'recording') {
                            setTimeout(() => recorder.stop(), 200);
                        }
                        return;
                    }

                    if (elapsed >= effectiveDuration) {
                        isFinished = true;
                        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
                        if (recorder.state === 'recording') {
                            setTimeout(() => recorder.stop(), 200); // small buffer for encoder to flush
                        }
                        return;
                    }

                    let activeIdx = -1;
                    for (let i = 0; i < sortedItems.length; i++) {
                        if (elapsed >= sortedItems[i].startSeconds && elapsed < sortedItems[i].endSeconds) {
                            activeIdx = i;
                            break;
                        }
                    }

                    if (activeIdx === -1) {
                        // Use the last known scene to keep the canvas alive instead of going black
                        for (let i = sortedItems.length - 1; i >= 0; i--) {
                            if (elapsed >= sortedItems[i].endSeconds) {
                                activeIdx = i;
                                break;
                            }
                        }
                    }

                    if (activeIdx !== -1) {
                        const currentItem = sortedItems[activeIdx];
                        const nextItem = sortedItems[activeIdx + 1];
                        const sceneElapsed = elapsed - currentItem.startSeconds;
                        const sceneDuration = currentItem.endSeconds - currentItem.startSeconds;
                        const progress = Math.min(1, Math.max(0, sceneElapsed / Math.max(sceneDuration, 0.01)));

                        // SYNC DETERMINÍSTICO PARA VÍDEOS COM THRESHOLD (Evita Jitter/Engasgos):
                        // Só forçamos o seek se o vídeo se desviar mais de 50ms do tempo alvo do áudio.
                        // Isso permite que o decodificador do navegador rode mais solto e fluido.
                        const activeAsset = loadedAssets.get(activeIdx);
                        let activeLoopAlpha = 1.0;
                        let nextLoopAlpha = 1.0; // CORREÇÃO: Declarado para evitar ReferenceError
                        const LOOP_FADE = 0.3; // 300ms de suavização no loop

                        // Pré-carregar próxima cena 2 segundos antes da transição
                        const timeToNextScene = nextItem ? (nextItem.startSeconds - elapsed) : 999;
                        if (nextItem && timeToNextScene < 2 && preloadedNextIdx !== activeIdx + 1) {
                            loadAssetForScene(activeIdx + 1).then(asset => {
                                if (asset) loadedAssets.set(activeIdx + 1, asset);
                            });
                            preloadedNextIdx = activeIdx + 1;
                        }

                        if (activeAsset instanceof HTMLVideoElement) {
                            // ADAPTAÇÃO DE VELOCIDADE: Ajusta a velocidade para que o vídeo rode exatamente uma vez na duração da cena
                            const activeSceneDuration = currentItem.endSeconds - currentItem.startSeconds;
                            if (activeAsset.duration > 0 && activeSceneDuration > 0) {
                                activeAsset.playbackRate = activeAsset.duration / activeSceneDuration;
                            }

                            // SYNC DETERMINÍSTICO SUAVE: 
                            // Solo forçamos o seek se o desvio for maior que 100ms.
                            // Agora calculamos o targetTime proporcional à duração do vídeo/cena para respeitar o playbackRate.
                            const videoSceneRatio = activeAsset.duration > 0 ? (activeAsset.duration / activeSceneDuration) : 1;
                            const targetTime = Math.max(0, (elapsed - currentItem.startSeconds) * videoSceneRatio);
                            const drift = Math.abs(activeAsset.currentTime - targetTime);
                            
                            if (drift > 0.15 || activeAsset.paused) {
                                activeAsset.currentTime = targetTime;
                                activeAsset.playbackRate = videoSceneRatio; // v8.0.4: Reforçar após seek
                                activeAsset.play().catch(() => {});
                            } else {
                                // Garantir que a velocidade permaneça mesmo sem drift
                                if (activeAsset.playbackRate !== videoSceneRatio) {
                                    activeAsset.playbackRate = videoSceneRatio;
                                }
                            }
                        }

                        // Se houver transição de cena, sincronizar o próximo vídeo com a mesma lógica
                        const timeLeft = currentItem.endSeconds - elapsed;
                        
                        if (timeLeft < transitionDuration && nextItem) {
                            const nextAsset = loadedAssets.get(activeIdx + 1);
                            if (nextAsset instanceof HTMLVideoElement) {
                                const nextSceneDuration = nextItem.endSeconds - nextItem.startSeconds;
                                const nextVideoRatio = nextAsset.duration > 0 ? (nextAsset.duration / nextSceneDuration) : 1;
                                
                                if (nextAsset.duration > 0 && nextSceneDuration > 0) {
                                    nextAsset.playbackRate = nextVideoRatio;
                                }
                                const nextTargetTime = Math.max(0, (elapsed - nextItem.startSeconds) * nextVideoRatio);
                                if (Math.abs(nextAsset.currentTime - nextTargetTime) > 0.1) {
                                    nextAsset.currentTime = nextTargetTime;
                                }
                                if (nextAsset.paused) nextAsset.play().catch(() => {});
                            }
                        }

                        ctx.fillStyle = "#000";
                        ctx.fillRect(0, 0, width, height);

                        const nextAsset = loadedAssets.get(activeIdx + 1);
                        const isNextReady = nextAsset && (nextAsset instanceof HTMLImageElement || (nextAsset instanceof HTMLVideoElement && nextAsset.readyState >= 2));

                        if (timeLeft < transitionDuration && nextItem && isNextReady) {
                            const fadeProgress = 1.0 - (timeLeft / transitionDuration);
                            // v8.0.6: TÉCNICA OPAQUE UNDERLAY
                            // Desenha a cena atual com 100% de alpha por baixo
                            drawSingleSource(ctx, loadedAssets.get(activeIdx) || null, width, height, activeIdx, progress, 1.0 * activeLoopAlpha, effectMap.get(activeIdx), motionEffects, loadedPlaceholders.get(activeIdx));
                            // Desenha a próxima cena com fade por cima (evita o "buraco preto" no meio do crossfade)
                            const nextSceneProgress = Math.max(0, (elapsed - nextItem.startSeconds) / Math.max(nextItem.endSeconds - nextItem.startSeconds, 0.01));
                            drawSingleSource(ctx, nextAsset, width, height, activeIdx + 1, nextSceneProgress, fadeProgress * nextLoopAlpha, effectMap.get(activeIdx + 1), motionEffects, loadedPlaceholders.get(activeIdx + 1));
                        } else {
                            const currentEffect = effectMap.get(activeIdx);
                            drawSingleSource(ctx, loadedAssets.get(activeIdx) || null, width, height, activeIdx, progress, 1.0 * activeLoopAlpha, currentEffect, motionEffects, loadedPlaceholders.get(activeIdx));
                        }

                        if (subtitleStyle) {
                            // v5.4.0: Restaurado sincronia simples das legendas
                            const currentChunk = allSubtitleChunks.find(c => elapsed >= c.startSeconds && elapsed < c.endSeconds);
                            if (currentChunk) {
                                drawSubtitle(ctx, currentChunk.text, width, height, subtitleStyle);
                            }
                        }

                        lastActiveIdx = activeIdx;
                    }

                    // v7.9.6: VINHETA e VHS aplicados FORA do if(activeIdx)
                    // Garante que estes efeitos aparecem em TODOS os frames, sem exceção
                    applyVignette(ctx);

                    if (vhsVideo) {
                        if (vhsVideo.paused) vhsVideo.play().catch(() => {});
                        applyVHS(ctx, vhsVideo);
                    }

                    if (Date.now() - lastProgressUpdate > 500) {
                        onProgress(Math.floor((elapsed / effectiveDuration) * 100), `Renderizando Master (${elapsed.toFixed(1)}s / ${effectiveDuration.toFixed(1)}s)`);
                        lastProgressUpdate = Date.now();
                    }
                } catch (renderError) {
                    // RESILIENCE: Absorb any render frame error silently.
                    // The rAF will still be scheduled below, keeping the loop alive.
                    console.warn('[VideoService] RenderLoop frame error (loop continues):', renderError);
                }

                // CRITICAL: requestAnimationFrame is ALWAYS called, even on errors above.
                // Moving it outside the try-catch ensures the loop NEVER dies silently.
                animationFrameId = requestAnimationFrame(renderLoop);
            };

            // 1. Pre-render initial frame with warm-up for videos
            const firstAsset = loadedAssets.get(0);
            if (firstAsset instanceof HTMLVideoElement) {
                firstAsset.currentTime = 0;
                // Aguarda o vídeo estar pronto para o primeiro frame (readyState >= 2)
                await new Promise<void>(res => {
                    if (firstAsset.readyState >= 2) res();
                    else firstAsset.onseeked = () => res();
                });
            }

            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, width, height);
            drawSingleSource(ctx, firstAsset || null, width, height, 0, 0, 1.0, effectMap.get(0), motionEffects, loadedPlaceholders.get(0));

            // 2. Start exact clock
            audioStartTime = audioContext.currentTime;

            // 3. Start hardware processes
            recorder.start(1000); 
            sourceNode.start(0);

            // 4. Start tick loop (rAF)
            animationFrameId = requestAnimationFrame(renderLoop);

        } catch (e) { 
            if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
            reject(e); 
        }
    });
};

export const generatePreviewVideo = async (items: TranscriptionItem[], transitionType: TransitionType, aspectRatio: '16:9' | '9:16', subtitleStyle?: SubtitleStyleOption, motionEffects?: MotionEffect[]): Promise<string> => {
    const valid = items.filter(it => it.imageUrl || it.importedVideoUrl || it.googleImageUrl || it.pollinationsImageUrl || it.importedImageUrl);
    if (valid.length === 0) throw new Error("Mídias necessárias para o preview.");
    const previewItems = valid.slice(0, 2).map((it, idx) => ({
        ...it,
        startSeconds: idx * 5,
        endSeconds: (idx + 1) * 5,
        duration: 5
    }));
    const totalDuration = previewItems.length * 5;
    const silent = createSilentAudioBlob(totalDuration);
    const blob = await generateTimelineVideo(silent, previewItems, transitionType, () => { }, aspectRatio, subtitleStyle, motionEffects);
    return URL.createObjectURL(blob);
};
