
import React, { useRef, useState, useEffect } from 'react';
import { Upload, FileAudio, X, MessageSquareQuote, Palette, FileText, CheckCircle2, Clapperboard } from 'lucide-react';
import { AppSettings } from '../types';

interface FileUploadProps {
  onFileSelected: (file: File, srt?: string, script?: string) => void;
  onScriptSelected?: (text: string) => void;
  onSrtSelected?: (text: string) => void;
  disabled: boolean;
  context: string;
  onContextChange: (value: string) => void;
  file: File | null;
  settings: AppSettings;
  selectedStyle: string;
  onStyleChange: (value: string) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelected,
  onScriptSelected,
  onSrtSelected,
  disabled,
  context,
  onContextChange,
  file,
  settings,
  selectedStyle,
  onStyleChange
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [scriptName, setScriptName] = useState<string | null>(null);
  const [srtName, setSrtName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!settings || !settings.items) return;
    const isValid = settings.items.some(item => item.id === selectedStyle);
    if (!isValid && settings.items.length > 0) {
      onStyleChange(settings.items[0].id);
    }
  }, [settings?.items, selectedStyle]);

  useEffect(() => {
    if (!file) {
      setSelectedFileName(null);
      if (inputRef.current) inputRef.current.value = "";
    } else {
      setSelectedFileName(file.name);
    }
  }, [file]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const processFiles = async (files: File[]) => {
    let audioFile: File | null = null;
    let srtData: string | undefined = undefined;
    let scriptData: string | undefined = undefined;

    for (const file of files) {
      const isAudio = file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3');
      const isTxt = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');
      const isSrt = file.name.toLowerCase().endsWith('.srt');

      if (isAudio) {
        audioFile = file;
      } else if (isTxt) {
        scriptData = await file.text();
        setScriptName(file.name);
        if (onScriptSelected) onScriptSelected(scriptData);
      } else if (isSrt) {
        srtData = await file.text();
        setSrtName(file.name);
        if (onSrtSelected) onSrtSelected(srtData);
      } else {
        alert("⚠️ Formato inválido ou pesado ignorado: " + file.name + ". Por favor, use .mp3, .srt ou .txt.");
      }
    }

    if (audioFile) {
      onFileSelected(audioFile, srtData, scriptData);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2 text-slate-300 font-medium text-sm">
            <Palette size={16} className="text-brand-400" />
            Estilo Visual da IA
          </div>
          <select
            value={selectedStyle}
            onChange={(e) => onStyleChange(e.target.value)}
            disabled={disabled}
            className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded px-3 py-2.5 focus:border-brand-500 outline-none"
          >
            {settings?.items?.map(style => (
              <option key={style.id} value={style.id}>{style.label}</option>
            ))}
          </select>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-slate-300 font-medium text-sm">
            <MessageSquareQuote size={16} className="text-brand-400" />
            Resumo do Contexto
          </div>
          <textarea
            value={context}
            onChange={(e) => onContextChange(e.target.value)}
            disabled={disabled}
            placeholder="Explique do que se trata o projeto para a IA entender melhor os prompts."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 placeholder:text-slate-600 resize-none h-20 transition-colors"
          />
        </div>
      </div>

      <div
        className={`relative flex flex-col items-center justify-center w-full h-72 border-2 border-dashed rounded-[3rem] transition-all duration-300 ease-in-out cursor-pointer group
          ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800' : 'bg-slate-900 hover:bg-slate-800/50'}
          ${dragActive ? 'border-brand-500 bg-slate-800 scale-[1.01]' : 'border-slate-800'}
        `}
        onDragEnter={!disabled ? handleDrag : undefined}
        onDragLeave={!disabled ? handleDrag : undefined}
        onDragOver={!disabled ? handleDrag : undefined}
        onDrop={!disabled ? handleDrop : undefined}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept=".mp3,.txt,.srt"
          onChange={handleChange}
          disabled={disabled}
        />

        <div className="flex flex-col items-center text-center p-8 gap-6 w-full">
          <div className="flex gap-4">
            <div className={`w-20 h-20 rounded-3xl flex flex-col items-center justify-center gap-2 transition-all border-2 ${selectedFileName ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-600'}`}>
              <FileAudio size={28} />
              <span className="text-[8px] font-black uppercase">Áudio</span>
            </div>
            <div className={`w-20 h-20 rounded-3xl flex flex-col items-center justify-center gap-2 transition-all border-2 ${srtName ? 'bg-green-500/10 border-green-500/30 text-green-400 shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-600'}`}>
              <Clapperboard size={28} />
              <span className="text-[8px] font-black uppercase">SRT</span>
            </div>
            <div className={`w-20 h-20 rounded-3xl flex flex-col items-center justify-center gap-2 transition-all border-2 ${scriptName ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-600'}`}>
              <FileText size={28} />
              <span className="text-[8px] font-black uppercase">Script</span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-300">
              {selectedFileName && srtName ? "Sincronia Garantida! Pronto para o Vídeo." :
                "Arraste seu Áudio e arquivo SRT de legendas."}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {srtName && (
                <div className="flex items-center gap-2 text-green-400 animate-in fade-in slide-in-from-top-1">
                  <CheckCircle2 size={12} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Tempos: {srtName}</span>
                </div>
              )}
              {scriptName && (
                <div className="flex items-center gap-2 text-indigo-400 animate-in fade-in slide-in-from-top-1">
                  <CheckCircle2 size={12} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Roteiro: {scriptName}</span>
                </div>
              )}
            </div>
          </div>

          {!selectedFileName && (
            <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest bg-slate-950 px-6 py-2.5 rounded-full border border-slate-800">
              Formatos aceitos: MP3, TXT e SRT
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
