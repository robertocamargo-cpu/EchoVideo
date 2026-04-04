
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

            // Throttle: Atualiza o estado da UI apenas se o tempo decorrido desde a última atualização for > 16ms (60fps)
            const now = performance.now();
            if (now - lastUpdateRef.current > 16) {
                lastUpdateRef.current = now;
                setGlobalProgress((t / calcDuration) * 100);
                
                // Busca otimizada do índice ativo com verificação de igualdade para evitar sets repetidos
                const activeIdx = items.findIndex(i => t >= i.startSeconds && t < i.endSeconds);
                if (activeIdx !== -1) {
                    setPlayingIndex(prev => prev !== activeIdx ? activeIdx : prev);
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
                {/* Rótulos de duração acima da barra */}
                <div className="flex w-full h-5 items-end overflow-hidden mb-1">
                    {items.map((item, index) => {
                        const totalTime = items[items.length - 1].endSeconds || 1;
                        const widthPercent = (item.duration / totalTime) * 100;
                        return (
                            <div key={index} style={{ width: `${widthPercent}%` }} className="text-[8px] font-black text-slate-600 text-center uppercase tracking-tighter truncate px-0.5">
                                {item.duration.toFixed(1)}s
                            </div>
                        );
                    })}
                </div>

                <div className={`w-full bg-slate-900 rounded-xl flex relative border border-slate-800 shadow-inner transition-all duration-500 ease-in-out ${isFullPreview ? 'h-56' : 'h-28'}`}>
                    {items.map((item, index) => {
                        const totalTime = items[items.length - 1].endSeconds || 1;
                        const widthPercent = (item.duration / totalTime) * 100;
                        const isPlaying = playingIndex === index;
                        const imageUrl = item.imageUrl || item.googleImageUrl || item.pollinationsImageUrl || item.importedImageUrl || item.importedVideoUrl;
                        const isEmpty = !imageUrl;

                        return (
                            <div key={index} style={{ width: `${widthPercent}%` }} onClick={() => onImageClick(index)} className={`h-full relative border-r border-slate-950/20 transition-all cursor-pointer group ${isPlaying ? 'ring-2 ring-brand-500 z-50' : 'opacity-80 hover:opacity-100 hover:z-40'}`}>
                                {imageUrl ? (
                                    imageUrl.match(/\.(mp4|webm|mov)(\?|$)/i) || item.importedVideoUrl
                                        ? <video src={imageUrl} className="w-full h-full object-cover pointer-events-none" muted autoPlay loop playsInline />
                                        : <img src={imageUrl} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-[#b026ff]/20 flex items-center justify-center border-b-2 border-[#b026ff]">
                                        <div className="w-2 h-2 rounded-full bg-[#b026ff] animate-pulse"></div>
                                    </div>
                                )}
                                <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity z-50 ${isPlaying ? 'bg-brand-500/20' : 'opacity-0 group-hover:opacity-100 bg-black/75 backdrop-blur-[2px]'}`}>
                                    <div className={`bg-slate-950 px-2 py-1 md:px-4 md:py-2 rounded-xl border border-white/30 flex flex-col items-center shadow-2xl transition-all ${widthPercent < 4 ? 'scale-75 origin-center' : ''}`}>
                                        <span className="text-brand-400 font-mono text-[9px] md:text-xs font-black mb-1 drop-shadow-md">{item.duration.toFixed(1)}s</span>
                                        <span className="text-white font-black text-[10px] md:text-sm tracking-wider uppercase whitespace-nowrap drop-shadow-lg">
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
                <div className="flex justify-between text-[10px] text-slate-600 mt-2 font-mono uppercase tracking-widest">
                    <span>00:00</span>
                    <span>{items[items.length - 1].endTimestamp}</span>
                </div>
            </div>
        </div>
    );
});
