
import React, { useRef, useState, useEffect } from 'react';
import { TranscriptionItem } from '../types';
import { Play, Square, Volume2, PlayCircle } from 'lucide-react';

interface TimelineVisualProps {
    items: TranscriptionItem[];
    onImageClick: (index: number) => void;
    audioFile: File | null;
    videoUrl: string | null;
}

export const TimelineVisual: React.FC<TimelineVisualProps> = ({ items, onImageClick, audioFile, videoUrl }) => {
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);
    const [isFullPreview, setIsFullPreview] = useState(false);
    const [globalProgress, setGlobalProgress] = useState(0);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const animationRef = useRef<number | null>(null);

    // Proteção contra array vazio
    if (!items || items.length === 0) {
        return (
            <div className="w-full mb-8 animate-in fade-in duration-700">
                <div className="flex justify-between items-end mb-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        Timeline Visual
                    </h3>
                </div>
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

        const checkFullTime = () => {
            if (!audioRef.current) return;
            const t = audioRef.current.currentTime;
            if (audioRef.current.paused || audioRef.current.ended) { stopPlayback(); return; }
            setGlobalProgress((t / calcDuration) * 100);
            const activeIdx = items.findIndex(i => t >= i.startSeconds && t <= i.endSeconds);
            if (activeIdx !== -1) setPlayingIndex(activeIdx);
            animationRef.current = requestAnimationFrame(checkFullTime);
        };
        animationRef.current = requestAnimationFrame(checkFullTime);
    };

    return (
        <div className="w-full mb-8 animate-in fade-in duration-700">
            <div className="flex justify-between items-end mb-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    Timeline Visual
                    {isFullPreview && <span className="text-brand-400 animate-pulse ml-2 flex items-center gap-1"><Volume2 size={12} /> Preview Ativo</span>}
                </h3>
                <div className="flex items-center gap-2">
                    {audioFile && (
                        <button onClick={handleFullPreview} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all border ${isFullPreview ? 'bg-brand-600 text-white border-brand-500 shadow-lg shadow-brand-500/20' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-brand-500'}`}>
                            {isFullPreview ? <Square size={12} fill="currentColor" /> : <PlayCircle size={14} />}
                            {isFullPreview ? "Parar Preview" : "Preview Completo"}
                        </button>
                    )}
                </div>
            </div>

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

                <div className={`w-full bg-slate-900 rounded-xl overflow-hidden flex relative border border-slate-800 shadow-inner transition-all duration-500 ease-in-out ${isFullPreview ? 'h-56' : 'h-28'}`}>
                    {items.map((item, index) => {
                        const totalTime = items[items.length - 1].endSeconds || 1;
                        const widthPercent = (item.duration / totalTime) * 100;
                        const isPlaying = playingIndex === index;
                        const imageUrl = item.imageUrl || item.googleImageUrl || item.pollinationsImageUrl || item.importedImageUrl || item.importedVideoUrl;
                        const isEmpty = !imageUrl;

                        return (
                            <div key={index} style={{ width: `${widthPercent}%` }} onClick={() => onImageClick(index)} className={`h-full relative border-r border-slate-950/20 transition-all cursor-pointer group ${isPlaying ? 'ring-2 ring-brand-500 z-10' : 'opacity-80 hover:opacity-100'}`}>
                                {imageUrl ? (
                                    <img src={imageUrl} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-[#b026ff]/20 flex items-center justify-center border-b-2 border-[#b026ff]">
                                        <div className="w-2 h-2 rounded-full bg-[#b026ff] animate-pulse"></div>
                                    </div>
                                )}
                                <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity ${isPlaying ? 'bg-brand-500/20' : 'opacity-0 group-hover:opacity-100 bg-black/60'}`}>
                                    <span className="text-white font-black text-xs md:text-sm lg:text-lg tracking-widest mb-1 drop-shadow-md">CENA {index + 1}</span>
                                    <button onClick={(e) => handlePlayPreview(e, index, item.startSeconds, item.endSeconds)} className="p-2 bg-brand-600 text-white rounded-full shadow-xl">
                                        {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {isFullPreview && (
                        <div className="absolute top-0 bottom-0 w-[3px] bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.8)] z-[60] pointer-events-none" style={{ left: `${globalProgress}%` }}>
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
};
