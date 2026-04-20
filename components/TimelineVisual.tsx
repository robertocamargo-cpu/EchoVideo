
import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { TranscriptionItem } from '../types';
import { Play, Square, Volume2, PlayCircle } from 'lucide-react';

export interface TimelineVisualHandle {
    startPreview: () => void;
    stopPreview: () => void;
}

interface TimelineVisualProps {
    items: TranscriptionItem[];
    onImageClick: (index: number) => void;
    audioFile: File | null;
    videoUrl: string | null;
    onPreviewStateChange?: (isActive: boolean) => void;
}

// v7.9.8: Componente de vídeo com ajuste de velocidade dinâmico para paridade com Desktop
const AdaptiveVideo = ({ src, sceneDuration }: { src: string, sceneDuration: number }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    const handleMetadata = () => {
        if (!videoRef.current) return;
        const originalDuration = videoRef.current.duration;
        if (originalDuration > 0 && sceneDuration > 0) {
            // Se o vídeo tem 5s e a cena 10s, playbackRate = 0.5 (fica mais lento)
            // Se o vídeo tem 10s e a cena 5s, playbackRate = 2.0 (fica mais rápido)
            const rate = originalDuration / sceneDuration;
            // Limites de segurança do navegador (0.0625 a 16.0)
            videoRef.current.playbackRate = Math.max(0.1, Math.min(rate, 10));
        }
    };

    return (
        <video 
            ref={videoRef}
            src={src} 
            className="w-full h-full object-cover pointer-events-none" 
            muted 
            autoPlay 
            loop 
            playsInline 
            onLoadedMetadata={handleMetadata}
        />
    );
};

export const TimelineVisual = forwardRef<TimelineVisualHandle, TimelineVisualProps>(({ items, onImageClick, audioFile, videoUrl, onPreviewStateChange }, ref) => {
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);
    const [isFullPreview, setIsFullPreview] = useState(false);
    const [globalProgress, setGlobalProgress] = useState(0);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const animationRef = useRef<number | null>(null);

    useImperativeHandle(ref, () => ({
        startPreview: () => handleFullPreview(),
        stopPreview: () => stopPlayback(),
    }));

    // Proteção contra array vazio
    if (!items || items.length === 0) {
        return (
            <div className="w-full mb-8 animate-in fade-in duration-700">
                <div className="w-full bg-slate-900 rounded-xl overflow-hidden flex relative border border-slate-800 shadow-inner h-28">
                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
                        Nenhum item de transcrição disponível
                    </div>
                </div>
            </div>
        );
    }

    useEffect(() => {
        if (!audioFile) return;
        const url = URL.createObjectURL(audioFile);
        if (!audioRef.current) {
            audioRef.current = new Audio(url);
        } else {
            audioRef.current.src = url;
            audioRef.current.load();
        }

        return () => {
            URL.revokeObjectURL(url);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
        };
    }, [audioFile]);

    const stopPlayback = () => {
        if (audioRef.current) audioRef.current.pause();
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }
        setPlayingIndex(null);
        setIsFullPreview(false);
        setGlobalProgress(0);
        if (onPreviewStateChange) onPreviewStateChange(false);
    };

    const handlePlayPreview = (e: React.MouseEvent, index: number, start: number, end: number) => {
        e.stopPropagation();
        if (!audioRef.current) return;
        if (playingIndex === index && !isFullPreview) { stopPlayback(); return; }
        stopPlayback();
        audioRef.current.currentTime = start;
        audioRef.current.play().catch(() => stopPlayback());
        setPlayingIndex(index);

        const checkTime = () => {
            if (!audioRef.current) return;
            if (audioRef.current.currentTime >= end) stopPlayback();
            else animationRef.current = requestAnimationFrame(checkTime);
        };
        animationRef.current = requestAnimationFrame(checkTime);
    };

    const lastUpdateRef = useRef<number>(performance.now());

    const handleFullPreview = () => {
        if (!audioRef.current) return;
        if (isFullPreview) { stopPlayback(); return; }
        stopPlayback();
        const lastItem = items[items.length - 1];
        const visualTotal = lastItem?.endSeconds || 1;
        const calcDuration = Math.max(visualTotal, audioRef.current.duration || 1);

        audioRef.current.currentTime = 0;
        audioRef.current.play();
        setIsFullPreview(true);
        if (onPreviewStateChange) onPreviewStateChange(true);

        const checkFullTime = () => {
            if (!audioRef.current) return;
            const t = audioRef.current.currentTime;
            
            if (audioRef.current.paused || audioRef.current.ended) { 
                stopPlayback(); 
                return; 
            }

            const now = performance.now();
            if (now - lastUpdateRef.current > 16) {
                lastUpdateRef.current = now;
                setGlobalProgress((t / calcDuration) * 100);
                
                const activeIdx = items.findIndex(i => t >= i.startSeconds && t < i.endSeconds);
                if (activeIdx !== -1) {
                    setPlayingIndex(prev => prev !== activeIdx ? activeIdx : prev);
                    
                    // Auto-scroll para manter o item ativo visível se houver scroll
                    const element = document.getElementById(`timeline-item-${activeIdx}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }
                }
            }
            
            animationRef.current = requestAnimationFrame(checkFullTime);
        };
        animationRef.current = requestAnimationFrame(checkFullTime);
    };

    return (
        <div className="w-full mb-8 animate-in fade-in duration-700">
            {/* O cabeçalho flex anterior com o botão de preview local foi removido 
                conforme solicitação de "subir" o botão para a toolbar principal */}

            <div className="relative w-full">
                {/* Container com scroll horizontal para não cortar nada */}
                <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
                    <div className="min-w-full inline-flex flex-col">
                        {/* Rótulos de duração acima da barra */}
                        <div className="flex h-5 items-end mb-1">
                            {items.map((item, index) => {
                                const totalTime = Math.max(...items.map(i => i.endSeconds), 1);
                                const widthPercent = (item.duration / totalTime) * 100;
                                return (
                                    <div key={index} style={{ width: `${widthPercent}%`, minWidth: `${item.duration * 15}px` }} className="text-[9px] font-black text-slate-600 text-center uppercase tracking-tighter truncate px-0.5">
                                        {item.duration.toFixed(1)}s
                                    </div>
                                );
                            })}
                        </div>

                        <div className={`bg-slate-900 rounded-xl flex relative border border-slate-800 shadow-inner transition-all duration-500 ease-in-out ${isFullPreview ? 'h-56' : 'h-28'}`}>
                            {items.map((item, index) => {
                                const totalTime = Math.max(...items.map(i => i.endSeconds), 1);
                                const widthPercent = (item.duration / totalTime) * 100;
                                const isPlaying = playingIndex === index;
                                
                                // v8.1.1: Mapeamento idêntico ao TranscriptionTable.tsx para garantir paridade total
                                const imageUrl = item.importedVideoUrl || item.importedImageUrl || item.imageUrl || (item as any).googleImageUrl || (item as any).pollinationsImageUrl;
                                const isVideo = !!item.importedVideoUrl || (typeof imageUrl === 'string' && !!imageUrl.match(/\.(mp4|webm|mov|m4v)(\?|$)/i));
                                
                                const isEmpty = !imageUrl;

                                if (index < 10) {
                                    console.log(`[Timeline] Item ${index}: imageUrl=${imageUrl}, isVideo=${isVideo}`);
                                }

                                return (
                                    <div 
                                        key={index} 
                                        id={`timeline-item-${index}`}
                                        style={{ width: `${widthPercent}%`, minWidth: `${item.duration * 15}px` }} 
                                        onClick={() => onImageClick(index)} 
                                        className={`h-full relative border-r border-slate-950/20 transition-all cursor-pointer group ${isPlaying ? 'ring-2 ring-brand-500 z-50' : 'opacity-80 hover:opacity-100 hover:z-40'}`}
                                    >
                                        {imageUrl ? (
                                            isVideo
                                                ? <AdaptiveVideo src={imageUrl} sceneDuration={item.duration} />
                                                : <img src={imageUrl} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full bg-slate-800 flex items-center justify-center border-b-2 border-brand-500/50">
                                                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></div>
                                            </div>
                                        )}
                                        <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity z-50 ${isPlaying ? 'bg-brand-500/20' : 'opacity-0 group-hover:opacity-100 bg-black/75 backdrop-blur-[2px]'}`}>
                                            <div className={`bg-slate-950 px-2 py-1 md:px-4 md:py-2 rounded-xl border border-white/30 flex flex-col items-center shadow-2xl transition-all ${widthPercent < 4 ? 'scale-75 origin-center' : ''}`}>
                                                <span className="text-brand-400 font-mono text-[10px] md:text-xs font-black mb-1 drop-shadow-md">{item.duration.toFixed(1)}s</span>
                                                <span className="text-white font-black text-[11px] md:text-sm tracking-wider uppercase whitespace-nowrap drop-shadow-lg">
                                                    {widthPercent < 4 ? `${index + 1}` : `CENA ${index + 1}`}
                                                </span>
                                            </div>
                                            <button onClick={(e) => handlePlayPreview(e, index, item.startSeconds, item.endSeconds)} className={`mt-2 md:mt-3 p-1.5 md:p-2.5 bg-brand-600 text-white rounded-full shadow-xl hover:scale-110 active:scale-95 transition-all ${widthPercent < 4 ? 'scale-75' : ''}`}>
                                                {isPlaying ? <Square size={10} md:size={12} fill="currentColor" /> : <Play size={10} md:size={12} fill="currentColor" />}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            {isFullPreview && (
                                <div className="absolute top-0 bottom-0 w-[3px] bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.8)] z-[60] pointer-events-none transition-all duration-150 ease-linear" style={{ left: `${globalProgress}%` }}>
                                    <div className="absolute -top-1 -left-[5px] w-3 h-3 bg-red-600 rounded-full border border-white"></div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-between text-[11px] text-slate-600 mt-2 font-mono uppercase tracking-widest">
                    <span>00:00</span>
                    <span>{items[items.length - 1].endTimestamp}</span>
                </div>
            </div>
        </div>
    );
});
