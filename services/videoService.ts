
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
    srtSegments?: { start: number; end: number; text: string }[]
): WeightedChunk[] => {
    if (srtSegments && srtSegments.length > 0) {
        return srtSegments.map(seg => ({
            text: seg.text,
            startSeconds: seg.start,
            endSeconds: seg.end
        }));
    }
    if (!text) return [];

    // Limpeza de texto para evitar chunks com apenas pontuação
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];

    const rawChunks: string[] = [];
    const maxWords = maxWordsFromStyle || (isVertical ? 3 : 5);
    const maxChars = isVertical ? 25 : 42; // Conforme instructions.md (Horizontal: 42, Vertical: 20-25)

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
    audioDuration: number
): string => {
    const isVertical = preset === 'vertical';
    let srt = "";
    let counter = 1;
    // Garante que os itens estão ordenados para evitar saltos temporais no SRT
    const sortedItems = [...items].sort((a, b) => a.startSeconds - b.startSeconds);

    sortedItems.forEach((it) => {
        const duration = Math.max(0.1, it.endSeconds - it.startSeconds);
        const chunks = getPresetWeightedChunks(it.text, isVertical, it.startSeconds, duration, undefined, it.srtSegments);
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

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines.slice(0, 3);
};

const drawSubtitle = (ctx: CanvasRenderingContext2D, text: string, width: number, height: number, style: SubtitleStyleOption) => {
    if (!text) return;
    ctx.save();
    let displayText = applyCasing(text, style.textCasing);
    const weight = style.isBold ? '900' : '400';
    ctx.font = `${style.isItalic ? 'italic ' : ''}${weight} ${style.fontSize}px "${style.fontFamily}", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxWidth = width * 0.90;
    const lines = wrapText(ctx, displayText, maxWidth);
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
        ctx.fillText(line, x, y);
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
    motionEffect?: MotionEffect
) => {
    if (!source || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const isVideo = source instanceof HTMLVideoElement;
    const sWidth = isVideo ? (source as HTMLVideoElement).videoWidth : (source as HTMLImageElement).width;
    const sHeight = isVideo ? (source as HTMLVideoElement).videoHeight : (source as HTMLImageElement).height;
    if (sWidth === 0 || sHeight === 0) { ctx.restore(); return; }

    const coverScale = Math.max(width / sWidth, height / sHeight);
    let finalScale = coverScale;
    let offsetX = 0;
    let offsetY = 0;

    const moveRangeX = width * 0.08;
    const moveRangeY = height * 0.08;

    if (!isVideo) {
        if (motionEffect) {
            // Aplicar efeito customizado baseado na instrução técnica
            const params: EffectParams = parseEffectInstruction(motionEffect.instruction);

            // Calcular escala baseada nos parâmetros
            const scaleRange = params.scaleEnd - params.scaleStart;
            finalScale = coverScale * (params.scaleStart + (scaleRange * progress));

            // Calcular offset baseado nos ranges precisos
            const currentXPercent = params.moveXStart + ((params.moveXEnd - params.moveXStart) * progress);
            const currentYPercent = params.moveYStart + ((params.moveYEnd - params.moveYStart) * progress);

            offsetX = width * currentXPercent;
            offsetY = height * currentYPercent;

            // Aplicar rotação se especificada
            if (params.rotation) {
                const centerX = width / 2;
                const centerY = height / 2;
                ctx.translate(centerX, centerY);
                ctx.rotate((params.rotation * progress * Math.PI) / 180);
                ctx.translate(-centerX, -centerY);
            }
        } else {
            // Fallback para efeito padrão suave
            finalScale = coverScale * (1.15 + (0.10 * progress));
            offsetX = width * (-0.02 + (0.04 * progress)); // -2% a +2%
            offsetY = 0;
        }
    }

    const targetWidth = sWidth * finalScale;
    const targetHeight = sHeight * finalScale;
    const x = (width / 2) - (targetWidth / 2) + offsetX;
    const y = (height / 2) - (targetHeight / 2) + offsetY;

    if (isVideo) {
        const v = source as HTMLVideoElement;
        const targetTime = (progress * v.duration) % v.duration;
        if (Math.abs(v.currentTime - targetTime) > 0.1) {
            v.currentTime = targetTime;
        }
        if (v.paused) v.play().catch(() => { });
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
    motionEffects?: MotionEffect[]
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
            const ctx = canvas.getContext('2d', { alpha: false });
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
                sortedItems.forEach(it => {
                    if (it.srtSegments) {
                        it.srtSegments.forEach(seg => {
                            const key = `${seg.start.toFixed(3)}_${seg.text.trim()}`;
                            if (!seenSegments.has(key)) {
                                allSubtitleChunks.push({
                                    text: seg.text,
                                    startSeconds: seg.start,
                                    endSeconds: seg.end
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
                    const sceneChunks = getPresetWeightedChunks(it.text, isVertical, it.startSeconds, duration, subtitleStyle?.maxWordsPerLine, undefined);

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
            allSubtitleChunks.sort((a, b) => a.startSeconds - b.startSeconds);

            const loadedAssets = new Map<number, HTMLImageElement | HTMLVideoElement>();
            await Promise.all(sortedItems.map((item, idx) => {
                const url = item.importedVideoUrl || item.imageUrl || item.googleImageUrl || item.pollinationsImageUrl || item.importedImageUrl;
                if (!url) return Promise.resolve();
                return new Promise<void>((res) => {
                    if (item.importedVideoUrl) {
                        const v = document.createElement('video');
                        v.src = url; v.muted = true; v.crossOrigin = "anonymous"; v.playsInline = true; v.loop = true;
                        v.onloadeddata = () => { loadedAssets.set(idx, v); res(); };
                        v.onerror = () => res();
                        v.load();
                    } else {
                        const img = new Image(); img.crossOrigin = "anonymous";
                        img.onload = () => { loadedAssets.set(idx, img); res(); };
                        img.onerror = () => res();
                        img.src = url;
                    }
                });
            }));

            const streamDestination = audioContext.createMediaStreamDestination();
            const supportedType = getSupportedMimeType();

            // Reduzindo o bitrate para 12Mbps para maior estabilidade e compatibilidade
            const recorder = new MediaRecorder(new MediaStream([
                ...canvas.captureStream(30).getVideoTracks(),
                ...streamDestination.stream.getAudioTracks()
            ]), {
                mimeType: supportedType || undefined,
                videoBitsPerSecond: 12000000
            });

            const chunks: Blob[] = [];
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                audioContext.close();
                // Usar o tipo exato detectado pelo recorder no Blob final
                resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
            };

            const sourceNode = audioContext.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(streamDestination);

            if (audioContext.state === 'suspended') await audioContext.resume();

            const transitionDuration = 0.5;
            let isFinished = false;

            let audioStartTime = 0;
            let renderIntervalId: ReturnType<typeof setInterval> | null = null;
            let lastProgressUpdate = 0;

            const render = (forcedElapsed?: number) => {
                if (isFinished) return;

                // CRITICAL FIX: Use the exact audio hardware clock to avoid sync drift
                const elapsed = forcedElapsed !== undefined ? forcedElapsed : (audioContext.currentTime - audioStartTime);

                if (elapsed >= audioDuration && forcedElapsed === undefined) {
                    isFinished = true;
                    if (renderIntervalId !== null) clearInterval(renderIntervalId);
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

                    ctx.fillStyle = "#000";
                    ctx.fillRect(0, 0, width, height);

                    const timeLeft = currentItem.endSeconds - elapsed;
                    if (timeLeft < transitionDuration && nextItem) {
                        const fadeProgress = 1.0 - (timeLeft / transitionDuration);
                        drawSingleSource(ctx, loadedAssets.get(activeIdx) || null, width, height, activeIdx, progress, 1.0 - fadeProgress, effectMap.get(activeIdx));
                        const nextSceneProgress = Math.max(0, (elapsed - nextItem.startSeconds) / Math.max(nextItem.endSeconds - nextItem.startSeconds, 0.01));
                        drawSingleSource(ctx, loadedAssets.get(activeIdx + 1) || null, width, height, activeIdx + 1, nextSceneProgress, fadeProgress, effectMap.get(activeIdx + 1));
                    } else {
                        drawSingleSource(ctx, loadedAssets.get(activeIdx) || null, width, height, activeIdx, progress, 1.0, effectMap.get(activeIdx));
                    }

                    if (subtitleStyle) {
                        const currentChunk = allSubtitleChunks.find(c => elapsed >= c.startSeconds && elapsed < c.endSeconds);
                        if (currentChunk) {
                            drawSubtitle(ctx, currentChunk.text, width, height, subtitleStyle);
                        }
                    }
                }

                if (Date.now() - lastProgressUpdate > 500) {
                    onProgress(Math.floor((elapsed / audioDuration) * 100), `Renderizando Master (${elapsed.toFixed(1)}s / ${audioDuration.toFixed(1)}s)`);
                    lastProgressUpdate = Date.now();
                }
            };

            // 1. Pre-render the first frame SYNCHRONOUSLY before starting.
            // This guarantees the stream has visual data at 0.0s, eliminating the startup black-screen lag.
            render(0);

            // 2. Start exact clock
            audioStartTime = audioContext.currentTime;

            // 3. Start hardware processes
            recorder.start(1000); // Coleta chunks a cada 1 segundo
            sourceNode.start(0);

            // 4. Start tick loop
            renderIntervalId = setInterval(() => render(), 1000 / 30);

        } catch (e) { reject(e); }
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
