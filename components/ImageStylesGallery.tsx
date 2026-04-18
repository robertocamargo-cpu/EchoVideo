import React, { useState, useEffect, useRef } from 'react';
import { Palette, Sparkles, Zap, Loader2, ImageIcon, ArrowLeft, Download, Info, RefreshCw, Trash2, CheckCircle, PlayCircle } from 'lucide-react';
import { AppSettings, ImageStyleOption, StyleExample } from '../types';
import { generateImageUnified } from '../services/mediaService';
import { getStyleExamples, saveStyleExample, clearStyleExamples } from '../services/storageService';
import { generatePollinationsImage, GPT_MODEL_NAME } from '../services/pollinationsService';
import { generateImage, IMAGEN_ULTRA_MODEL_NAME, IMAGEN_FAST_MODEL_NAME, NANO_MODEL_NAME } from '../services/geminiService';

interface ImageStylesGalleryProps {
  settings: AppSettings;
  onBack: () => void;
}

const TEST_PROMPT_BASE = "Cenário: O interior de uma biblioteca antiga e mágica, com estantes de madeira entalhada que desaparecem na penumbra ao fundo. Sujeito: No centro, uma jovem exploradora de cabelos rebeldes e olhos muito expressivos, arregalados em um misto de susto e curiosidade. Ela veste uma jaqueta de couro com gola de lã e carrega uma mochila com alças de fivela metálica. Ação e Elementos: Ela segura em frente ao rosto um livro antigo e pesado que está aberto; das páginas do livro, emana uma luz dourada intensa que ilumina fortemente o seu rosto e projeta sombras profundas atrás dela. No topo do livro, está pousada uma pequena coruja mecânica feita de engrenagens de bronze e latão. Detalhes de Textura: A cena contém o brilho metálico do bronze, a aspereza do papel envelhecido, a maciez da lã da gola e o reflexo nos olhos da personagem. Há partículas de poeira suspensas no feixe de luz que sai do livro.";

export const ImageStylesGallery: React.FC<ImageStylesGalleryProps> = ({ settings, onBack }) => {
  const [examples, setExamples] = useState<Record<string, StyleExample>>({});
  const [loadingStyles, setLoadingStyles] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState<'google-fast' | 'google-nano' | 'pollinations-flux' | 'pollinations-gpt'>('google-fast');
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [autoGenProgress, setAutoGenProgress] = useState(0);
  const [autoGenCurrentLabel, setAutoGenCurrentLabel] = useState('');
  const [userIdea, setUserIdea] = useState('');
  
  // Estados para o Benchmark de 4 Colunas
  const [benchmarkStates, setBenchmarkStates] = useState<Record<string, { url: string, loading: boolean, error: string }>>({
    'google-fast': { url: '', loading: false, error: '' },
    'google-nano': { url: '', loading: false, error: '' },
    'pollinations-flux': { url: '', loading: false, error: '' },
    'pollinations-gpt': { url: '', loading: false, error: '' }
  });

  const abortRef = useRef(false);

  useEffect(() => {
    loadCachedExamples();
    return () => { abortRef.current = true; };
  }, []);

  const loadCachedExamples = async () => {
    try {
      const cached = await getStyleExamples();
      const map: Record<string, StyleExample> = {};
      const benchMap = { 
        'google-fast': { url: '', loading: false, error: '' },
        'google-nano': { url: '', loading: false, error: '' },
        'pollinations-flux': { url: '', loading: false, error: '' },
        'pollinations-gpt': { url: '', loading: false, error: '' }
      };

      cached.forEach(ex => {
        if (ex.styleId === 'benchmark_master') {
          if (ex.providerId && benchMap[ex.providerId as keyof typeof benchMap]) {
            benchMap[ex.providerId as keyof typeof benchMap] = { url: ex.imageUrl, loading: false, error: '' };
          }
        } else {
          // Chave composta: styleId_providerId
          const key = ex.providerId ? `${ex.styleId}_${ex.providerId}` : ex.styleId;
          map[key] = ex;
        }
      });
      setExamples(map);
      setBenchmarkStates(benchMap);
    } catch (e) { console.error(e); }
  };

  // O useEffect abaixo foi removido para evitar recarregamento desnecessário, 
  // já que a galeria agora é única e persistente independente do seletor visual de benchmark.
  /*
  useEffect(() => {
    loadCachedExamples();
  }, [provider]);
  */

  const handleGenerateBenchmark = async (targetProvider: string) => {
    setBenchmarkStates(prev => ({ ...prev, [targetProvider]: { ...prev[targetProvider], loading: true, error: '' } }));
    try {
      const promptBase = userIdea.trim() || TEST_PROMPT_BASE;
      const finalPrompt = `${promptBase}. Strictly: Absolutely no text, no written characters, no alphabet, no letters, no words, no typography. Pure imagery only.`;

      let result: { image: string };
      if (targetProvider === 'google-fast') result = await generateImage(finalPrompt, '16:9', IMAGEN_FAST_MODEL_NAME);
      else if (targetProvider === 'google-nano') result = await generateImage(finalPrompt, '16:9', NANO_MODEL_NAME);
      else if (targetProvider === 'pollinations-flux') result = await generatePollinationsImage(finalPrompt, 'flux', "", '16:9');
      else if (targetProvider === 'pollinations-gpt') result = await generatePollinationsImage(finalPrompt, GPT_MODEL_NAME, "", '16:9');
      else throw new Error("Provedor inválido");

      const masterExample: StyleExample = {
        styleId: 'benchmark_master',
        providerId: targetProvider,
        imageUrl: result.image,
        prompt: promptBase,
        timestamp: Date.now()
      };
      await saveStyleExample(masterExample);
      setBenchmarkStates(prev => ({ ...prev, [targetProvider]: { url: result.image, loading: false, error: '' } }));
    } catch (error: any) {
      setBenchmarkStates(prev => ({ ...prev, [targetProvider]: { url: '', loading: false, error: error.message || 'Falha na API' } }));
    }
  };

  const handleGlobalBenchmark = async () => {
    // Dispara as 4 simultaneamente
    const providers = ['google-fast', 'google-nano', 'pollinations-flux', 'pollinations-gpt'];
    await Promise.all(providers.map(p => handleGenerateBenchmark(p)));
  };

  const handleGenerate = async (style: ImageStyleOption, targetProvider: string, silent = false) => {
    if (!silent) setLoadingStyles(prev => ({ ...prev, [style.id]: true }));
    try {
      const promptBase = userIdea.trim() || TEST_PROMPT_BASE;
      const finalPrompt = `${promptBase} style: ${style.prompt}, Strictly: Absolutely no text, no written characters, no alphabet, no letters, no words, no typography. Pure imagery only.`;

      const result = await generateImageUnified(finalPrompt, targetProvider, '16:9');

      const newExample: StyleExample = {
        styleId: style.id,
        providerId: targetProvider,
        imageUrl: result.image,
        prompt: style.prompt,
        timestamp: Date.now()
      };

      await saveStyleExample(newExample);
      const key = `${style.id}_${targetProvider}`;
      setExamples(prev => ({ ...prev, [key]: newExample }));
    } catch (error: any) {
      if (!silent) alert(`Erro ao gerar estilo ${style.label} com ${targetProvider}: ${error.message}`);
      throw error;
    } finally {
      if (!silent) setLoadingStyles(prev => ({ ...prev, [style.id]: false }));
    }
  };

  const handleManualBuild = async (targetProvider: 'google-fast' | 'google-nano' | 'pollinations-flux' | 'pollinations-gpt') => {
    if (isAutoGenerating) return;
    setProvider(targetProvider);
    setIsAutoGenerating(true);
    setAutoGenProgress(0);
    abortRef.current = false;

    const total = settings.items.length;
    for (let i = 0; i < total; i++) {
      const style = settings.items[i];
      if (abortRef.current) break;
      setAutoGenCurrentLabel(style.label);
      setAutoGenProgress(Math.round(((i) / total) * 100));
      setLoadingStyles(prev => ({ ...prev, [style.id]: true }));
      try {
        await handleGenerate(style, targetProvider, true);
      } catch (e) {
        console.error(`Falha ao auto-gerar ${style.label}`, e);
      } finally {
        setLoadingStyles(prev => ({ ...prev, [style.id]: false }));
      }
    }
    setAutoGenProgress(100);
    setTimeout(() => setIsAutoGenerating(false), 1000);
  };

  const handleResetGallery = async () => {
    if (!confirm("Isso apagará todas as imagens de exemplo salvas e reiniciará a galeria. Deseja continuar?")) return;
    await clearStyleExamples();
    setExamples({});
    setBenchmarkStates({
      'google-fast': { url: '', loading: false, error: '' },
      'google-nano': { url: '', loading: false, error: '' },
      'pollinations-flux': { url: '', loading: false, error: '' },
      'pollinations-gpt': { url: '', loading: false, error: '' }
    });
  };

  const handleStopAuto = () => {
    abortRef.current = true;
    setIsAutoGenerating(false);
  };

  return (
    <div className="w-full max-w-7xl mx-auto py-12 px-4 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Top Header */}
      <div className="flex items-center justify-between mb-12">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-brand-400 transition-colors"
        >
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="flex items-center gap-3">
          <div className="bg-brand-500/10 p-2 rounded-2xl border border-brand-500/20 text-brand-400">
            <Palette size={20} />
          </div>
          <h1 className="text-xl font-black text-white uppercase tracking-tighter italic leading-none">Galeria de <span className="text-brand-400">Estilos</span></h1>
        </div>
        <div className="w-24" /> {/* Spacer */}
      </div>

      {/* Layout Principal: Prompt + Benchmark */}
      <div className="space-y-12 mb-20">
        {/* Barra de Prompt e Ação Principal */}
        <div className="bg-slate-900/40 p-1.5 rounded-[2.5rem] border border-slate-800/50 backdrop-blur-2xl shadow-2xl flex flex-col md:flex-row items-center gap-2 group focus-within:border-brand-500/30 transition-all duration-500">
          <div className="flex-1 w-full flex items-center gap-4 px-6 py-4">
            <div className="text-brand-400 opacity-50 group-focus-within:opacity-100 transition-opacity">
              <Sparkles size={24} />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] mb-1 block italic opacity-50">Ideia para Benchmark Global</label>
              <input
                type="text"
                value={userIdea}
                onChange={(e) => setUserIdea(e.target.value)}
                placeholder="Descreva uma cena mágica para testar as IAs..."
                className="w-full bg-transparent text-white placeholder-slate-800 outline-none text-xl font-bold tracking-tight"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 w-full md:w-auto">
            <button 
              onClick={handleGlobalBenchmark}
              disabled={isAutoGenerating}
              className="flex-1 md:flex-none px-10 py-5 bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white rounded-[1.8rem] font-black uppercase text-xs tracking-[0.2em] transition-all shadow-xl shadow-brand-500/20 active:scale-95 disabled:opacity-50 flex items-center gap-3"
            >
              Criar Benchmark <Zap size={16} />
            </button>
            <button 
              onClick={handleResetGallery}
              className="p-5 bg-slate-950/50 hover:bg-red-500/10 text-slate-700 hover:text-red-400 rounded-[1.8rem] border border-slate-800/50 transition-all active:scale-95"
              title="Limpar Tudo"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        {/* 4 Colunas de Modelos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { id: 'google-fast', label: 'Imagen 4 Fast', color: 'from-blue-400 to-cyan-500' },
            { id: 'google-nano', label: 'Nano Banana', color: 'from-amber-400 to-orange-600' },
            { id: 'pollinations-flux', label: 'Flux Cinematic', color: 'from-purple-500 to-pink-600' },
            { id: 'pollinations-gpt', label: 'Image GPT', color: 'from-emerald-500 to-teal-600' }
          ].map((m) => (
            <div key={m.id} className={`bg-slate-900/30 border border-slate-800/50 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl transition-all duration-500 group relative ${provider === m.id ? 'ring-2 ring-brand-500/50 scale-[1.02] bg-slate-900/60' : 'hover:border-slate-700 hover:scale-[1.01]'}`}>
              
              <div className="aspect-[4/5] bg-slate-950 relative flex items-center justify-center overflow-hidden">
                {benchmarkStates[m.id].url ? (
                  <div className="relative w-full h-full group/img">
                    <img src={benchmarkStates[m.id].url} alt={m.label} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                      <button 
                        onClick={() => handleGenerateBenchmark(m.id)}
                        className="p-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-white transition-all backdrop-blur-md shadow-2xl hover:scale-110 active:scale-95"
                        title="Regerar este modelo"
                      >
                        <RefreshCw size={24} />
                      </button>
                    </div>
                  </div>
                ) : benchmarkStates[m.id].error ? (
                  <div className="p-8 text-center bg-red-500/5 h-full flex flex-col items-center justify-center">
                    <div className="bg-red-500/20 p-3 rounded-full text-red-400 mb-4">
                      <Info size={24} />
                    </div>
                    <span className="text-red-400 text-[10px] font-black uppercase tracking-widest block mb-2">ERRO API</span>
                    <p className="text-slate-500 text-[10px] leading-relaxed line-clamp-3 mb-6 italic">{benchmarkStates[m.id].error}</p>
                    <button onClick={() => handleGenerateBenchmark(m.id)} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-[9px] font-black uppercase text-white tracking-widest transition-all">Re-tentar</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 px-8 text-center group-hover:opacity-100 transition-opacity">
                    <div className="opacity-10 group-hover:opacity-20 transition-opacity">
                      <ImageIcon size={64} />
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] block mt-2">Standby</span>
                    </div>
                    <button 
                      onClick={() => handleGenerateBenchmark(m.id)}
                      className="mt-4 px-8 py-3 bg-brand-500/80 hover:bg-brand-500 border border-brand-400/30 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all backdrop-blur-md shadow-xl shadow-brand-500/20"
                    >
                      Gerar Teste
                    </button>
                  </div>
                )}

                {/* Overlays */}
                <div className={`absolute top-6 left-6 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-white bg-gradient-to-r ${m.color} shadow-lg z-10`}>
                  {m.label}
                </div>

                {benchmarkStates[m.id].loading && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-6 z-20">
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-full border-2 border-brand-500/20 border-t-brand-400 animate-spin`}></div>
                      <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-400 animate-pulse" size={16} />
                    </div>
                    <span className="text-[10px] font-black uppercase text-brand-400 tracking-[0.4em]">Renderizando...</span>
                  </div>
                )}
              </div>
              
              <div className="p-8 flex flex-col gap-6 bg-gradient-to-b from-transparent to-slate-950/50">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-black uppercase text-white tracking-widest italic">{m.label.split(' ')[0]}</span>
                    <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${m.color} animate-pulse`}></div>
                  </div>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Engine Power</span>
                </div>

                <button 
                  onClick={() => handleManualBuild(m.id as any)}
                  disabled={isAutoGenerating}
                  className={`w-full py-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border flex items-center justify-center gap-3 ${provider === m.id ? 'bg-white text-slate-950 border-white shadow-[0_0_30px_rgba(255,255,255,0.2)]' : 'bg-slate-950/50 text-slate-400 border-slate-800/50 hover:text-white hover:border-slate-600'}`}
                >
                  {isAutoGenerating && provider === m.id ? (
                    <><Loader2 size={16} className="animate-spin" /> Gerando...</>
                  ) : (
                    <>Gerar Manual <ArrowLeft className="rotate-180" size={14} /></>
                  )}
                </button>
              </div>
              
              {/* Active Glow */}
              {provider === m.id && (
                <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${m.color}`}></div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Feedback de Progresso Global */}
      {isAutoGenerating && (
        <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-slate-900/80 border border-brand-500/30 backdrop-blur-xl rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            <div className="flex justify-between items-end mb-4 relative z-10">
              <div>
                <span className="text-[10px] font-black uppercase text-brand-400 tracking-[0.4em] mb-1 block">Construindo Manual Estrutural</span>
                <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter italic leading-none">Pintando: <span className="text-brand-400">{autoGenCurrentLabel}</span></h2>
              </div>
              <div className="text-right text-white font-mono text-xl font-black italic">{autoGenProgress}%</div>
            </div>
            {/* Background Bar */}
            <div className="w-full h-3 bg-slate-950 rounded-full border border-slate-800 overflow-hidden relative">
              <div 
                className="h-full bg-gradient-to-r from-brand-600 to-indigo-500 transition-all duration-700 shadow-[0_0_20px_rgba(var(--brand-rgb),0.5)]" 
                style={{ width: `${autoGenProgress}%` }}
              />
            </div>
            {/* Cancel Button */}
            <button 
              onClick={handleStopAuto}
              className="mt-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} /> Abortar Sequência
            </button>
          </div>
        </div>
      )}

      <div className="h-px bg-slate-800/50 mb-12" />

      {/* Grid de Estilos */}
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 ${isAutoGenerating ? 'opacity-50 pointer-events-none' : ''}`}>
        {settings.items.map((style) => {
          const key = `${style.id}_${provider}`;
          const example = examples[key];
          const isLoading = loadingStyles[style.id];

          return (
            <div key={style.id} className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl group hover:border-brand-500/30 transition-all duration-500">

              <div className="aspect-video bg-black relative flex items-center justify-center overflow-hidden">
                {example ? (
                  <img
                    src={example.imageUrl}
                    alt={style.label}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 opacity-10">
                    <ImageIcon size={60} />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em]">Fila</span>
                  </div>
                )}

                {isLoading && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-20">
                    <Loader2 className="animate-spin text-brand-400" size={32} />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-400 block">Gerando...</span>
                  </div>
                )}

                {example && !isLoading && (
                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <a
                      href={example.imageUrl}
                      download={`style_${style.label.toLowerCase()}.png`}
                      className="p-2 bg-slate-900/80 text-white rounded-lg hover:bg-brand-500 transition-colors"
                    >
                      <Download size={16} />
                    </a>
                  </div>
                )}
              </div>

              <div className="p-8 flex-1 flex flex-col gap-4">
                <div className="flex justify-between items-center gap-4">
                  <h3 className="text-xl font-black text-white uppercase tracking-tight italic">{style.label}</h3>
                  <div className="flex gap-1.5">
                    <button
                      onClick={async () => {
                        const models = ['google-fast', 'google-nano', 'pollinations-flux', 'pollinations-gpt'];
                        setLoadingStyles(prev => ({ ...prev, [style.id]: true }));
                        await Promise.all(models.map(m => handleGenerate(style, m, true)));
                        setLoadingStyles(prev => ({ ...prev, [style.id]: false }));
                      }}
                      disabled={isLoading}
                      title="Gerar em todos os modelos"
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-brand-400 hover:bg-brand-500 hover:text-white transition-all disabled:opacity-30 border border-brand-500/20"
                    >
                      <Sparkles size={16} />
                    </button>
                    {[
                      { id: 'google-fast', label: 'Fast', color: 'from-blue-500 to-cyan-500' },
                      { id: 'google-nano', label: 'Nano', color: 'from-amber-500 to-orange-500' },
                      { id: 'pollinations-flux', label: 'Flux', color: 'from-purple-500 to-pink-500' },
                      { id: 'pollinations-gpt', label: 'GPT', color: 'from-emerald-500 to-teal-500' }
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setProvider(m.id as any);
                          handleGenerate(style, m.id);
                        }}
                        disabled={isLoading}
                        title={`Gerar com ${m.label}`}
                        className={`w-9 h-9 flex items-center justify-center rounded-xl text-white transition-all disabled:opacity-30 hover:scale-110 active:scale-95 bg-gradient-to-br shadow-lg ${m.color} ${isLoading && provider === m.id ? 'animate-pulse ring-2 ring-white' : ''}`}
                      >
                        <Zap size={14} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 relative">
                  <p className="text-[11px] font-mono text-slate-400 leading-relaxed italic">
                    "{style.prompt}"
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Informative */}
      <div className="mt-20 pt-10 border-t border-slate-900 text-center">
        <p className="text-slate-500 text-xs font-medium max-w-2xl mx-auto">
          Estes exemplos ajudam a calibrar o tom visual dos seus projetos. O Manual de Estilo gerado será salvo no cache e poderá ser visualizado a qualquer momento.
        </p>
        <div className="flex justify-center gap-4 mt-8">
           <button
            onClick={onBack}
            className="px-12 py-4 bg-brand-500 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-brand-400 transition-all shadow-xl shadow-brand-500/20"
          >
            Aplicar e Voltar
          </button>
        </div>
      </div>
    </div>
  );
};
