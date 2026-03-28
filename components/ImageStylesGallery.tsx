
import React, { useState, useEffect, useRef } from 'react';
import { Palette, Sparkles, Zap, Loader2, ImageIcon, ArrowLeft, Download, Info, RefreshCw, Trash2, CheckCircle, PlayCircle } from 'lucide-react';
import { AppSettings, ImageStyleOption, StyleExample } from '../types';
import { generateImage, IMAGEN_MODEL_NAME, IMAGE_MODEL_NAME } from '../services/geminiService';
import { generatePollinationsImage } from '../services/pollinationsService';
import { saveStyleExample, getStyleExamples, clearStyleExamples } from '../services/storageService';

interface ImageStylesGalleryProps {
  settings: AppSettings;
  onBack: () => void;
}

const TEST_PROMPT_BASE = "Cenário: O interior de uma biblioteca antiga e mágica, com estantes de madeira entalhada que desaparecem na penumbra ao fundo. Sujeito: No centro, uma jovem exploradora de cabelos rebeldes e olhos muito expressivos, arregalados em um misto de susto e curiosidade. Ela veste uma jaqueta de couro com gola de lã e carrega uma mochila com alças de fivela metálica. Ação e Elementos: Ela segura em frente ao rosto um livro antigo e pesado que está aberto; das páginas do livro, emana uma luz dourada intensa que ilumina fortemente o seu rosto e projeta sombras profundas atrás dela. No topo do livro, está pousada uma pequena coruja mecânica feita de engrenagens de bronze e latão. Detalhes de Textura: A cena contém o brilho metálico do bronze, a aspereza do papel envelhecido, a maciez da lã da gola e o reflexo nos olhos da personagem. Há partículas de poeira suspensas no feixe de luz que sai do livro.";

export const ImageStylesGallery: React.FC<ImageStylesGalleryProps> = ({ settings, onBack }) => {
  const [examples, setExamples] = useState<Record<string, StyleExample>>({});
  const [loadingStyles, setLoadingStyles] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState<'google-nano' | 'google-imagen' | 'pollinations' | 'pollinations-zimage'>('google-imagen');
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [userIdea, setUserIdea] = useState('');
  const abortRef = useRef(false);

  // Carregar exemplos do cache ao montar (apenas carrega, não gera)
  useEffect(() => {
    loadCachedExamples();
    return () => { abortRef.current = true; };
  }, []);

  const loadCachedExamples = async () => {
    try {
      const cached = await getStyleExamples();
      const map: Record<string, StyleExample> = {};
      cached.forEach(ex => map[ex.styleId] = ex);
      setExamples(map);
    } catch (e) { console.error(e); }
  };

  const handleGenerate = async (style: ImageStyleOption, silent = false) => {
    if (!silent) setLoadingStyles(prev => ({ ...prev, [style.id]: true }));
    try {
      const promptBase = userIdea.trim() || TEST_PROMPT_BASE;
      const finalPrompt = `${promptBase} style: ${style.prompt}, Strictly: Absolutely no text, no written characters, no alphabet, no letters, no words, no typography. Pure imagery only.`;

      const isPol = provider.startsWith('pollinations');
      const isPollinationsZ = provider === 'pollinations-zimage';
      const isGoogleImagen = provider === 'google-imagen';
      const polModel = isPollinationsZ ? 'zimage' : 'flux';
      const geminiModel = isGoogleImagen ? IMAGEN_MODEL_NAME : IMAGE_MODEL_NAME;

      const result = !isPol
        ? await generateImage(finalPrompt, '16:9', geminiModel)
        : await generatePollinationsImage(finalPrompt, polModel, "", '16:9');

      const newExample: StyleExample = {
        styleId: style.id,
        imageUrl: result.image,
        prompt: style.prompt,
        timestamp: Date.now()
      };

      await saveStyleExample(newExample);
      setExamples(prev => ({ ...prev, [style.id]: newExample }));
    } catch (error: any) {
      if (!silent) alert(`Erro ao gerar estilo ${style.label}: ${error.message}`);
      throw error;
    } finally {
      if (!silent) setLoadingStyles(prev => ({ ...prev, [style.id]: false }));
    }
  };

  const handleAutoGenerate = async (stylesToGen: ImageStyleOption[]) => {
    if (isAutoGenerating) return;
    setIsAutoGenerating(true);
    abortRef.current = false;

    for (const style of stylesToGen) {
      if (abortRef.current) break;
      setLoadingStyles(prev => ({ ...prev, [style.id]: true }));
      try {
        await handleGenerate(style, true);
      } catch (e) {
        console.error(`Falha ao auto-gerar ${style.label}`, e);
      } finally {
        setLoadingStyles(prev => ({ ...prev, [style.id]: false }));
      }
    }
    setIsAutoGenerating(false);
  };

  const handleResetGallery = async () => {
    if (!confirm("Isso apagará todas as imagens de exemplo salvas e reiniciará a galeria. Deseja continuar?")) return;
    await clearStyleExamples();
    setExamples({});
  };

  const handleStopAuto = () => {
    abortRef.current = true;
    setIsAutoGenerating(false);
  };

  const hasMissingImages = settings.items.some(s => !examples[s.id]);

  return (
    <div className="w-full max-w-7xl mx-auto py-12 px-4 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Top Navigation — Single Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-brand-400 transition-colors"
          >
            <ArrowLeft size={14} /> Voltar
          </button>
          <div className="w-px h-5 bg-slate-800" />
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 p-2 rounded-2xl border border-brand-500/20 text-brand-400">
              <Palette size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black text-white uppercase tracking-tighter italic leading-none">Galeria de <span className="text-brand-400">Estilos</span></h1>
              <p className="text-slate-500 text-[10px] font-medium">Guia visual de calibração estética echoVID.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 px-4 py-2 rounded-2xl border border-slate-800">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button onClick={() => setProvider('google-nano')} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${provider === 'google-nano' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Nano Pro</button>
            <button onClick={() => setProvider('google-imagen')} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${provider === 'google-imagen' ? 'bg-brand-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Imagen 4 Fast</button>
            <button onClick={() => setProvider('pollinations')} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${provider === 'pollinations' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Flux Cinematic</button>
            <button onClick={() => setProvider('pollinations-zimage')} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${provider === 'pollinations-zimage' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>ZImage Magic</button>
          </div>
          <div className="flex items-center gap-2">
            {isAutoGenerating ? (
              <button onClick={handleStopAuto} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border border-red-500/20">
                <Loader2 size={14} className="animate-spin" /> Parar
              </button>
            ) : (
              <button onClick={() => handleAutoGenerate(settings.items)} className="bg-slate-800 hover:bg-slate-700 text-brand-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border border-slate-700">
                <RefreshCw size={14} /> Regerar Tudo
              </button>
            )}
            <button onClick={handleResetGallery} className="p-2 text-slate-600 hover:text-red-500 transition-colors" title="Limpar Cache"><Trash2 size={16} /></button>
          </div>
        </div>
      </div>

      {/* Idea Input Row — Compacto */}
      <div className="mb-6">
        <div className="bg-slate-900/60 px-5 py-3 rounded-2xl border border-slate-800 flex items-center gap-4">
          <div className="bg-brand-500/10 p-2 rounded-xl text-brand-400 border border-brand-500/20 shrink-0">
            <Sparkles size={16} />
          </div>
          <div className="flex-1">
            <label className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em]">Ideia para Teste de Estilo</label>
            <input
              type="text"
              value={userIdea}
              onChange={(e) => setUserIdea(e.target.value)}
              placeholder="Ex: Um astronauta medieval em Marte..."
              className="w-full bg-transparent text-white placeholder-slate-700 outline-none text-sm font-medium"
            />
          </div>
          <span className="text-[9px] text-slate-600 italic hidden md:block shrink-0">Vazio = Biblioteca Mágica</span>
        </div>
      </div>

      {/* Empty Gallery Prompt */}
      {hasMissingImages && !isAutoGenerating && Object.keys(examples).length === 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-[3rem] p-20 flex flex-col items-center justify-center text-center gap-8 mb-20 animate-in fade-in zoom-in duration-500">
          <div className="bg-brand-500/10 p-10 rounded-full text-brand-400 border border-brand-500/20">
            <PlayCircle size={80} />
          </div>
          <div className="max-w-xl space-y-4">
            <h2 className="text-3xl font-black text-white uppercase tracking-tight">Galeria Vazia</h2>
            <p className="text-slate-500 text-sm font-medium">Escolha seu provedor acima (Gemini ou Flux) e inicie a geração automática para criar seu manual visual de referência.</p>
          </div>
          <button
            onClick={() => handleAutoGenerate(settings.items)}
            className="px-12 py-5 bg-brand-500 text-white rounded-3xl font-black uppercase text-xs tracking-[0.3em] hover:bg-brand-400 transition-all shadow-2xl shadow-brand-500/20"
          >
            Gerar Manual de Estilos
          </button>
        </div>
      )}

      {/* Grid de Estilos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {settings.items.map((style) => {
          const example = examples[style.id];
          const isLoading = loadingStyles[style.id];

          return (
            <div key={style.id} className="bg-slate-900/40 border border-slate-800 rounded-[3rem] overflow-hidden flex flex-col shadow-2xl group hover:border-brand-500/30 transition-all duration-500">

              {/* Media Container */}
              <div className="aspect-video bg-black relative flex items-center justify-center overflow-hidden">
                {example ? (
                  <img
                    src={example.imageUrl}
                    alt={style.label}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 opacity-10">
                    <ImageIcon size={80} />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em]">Fila de Espera</span>
                  </div>
                )}

                {/* Loading Overlay */}
                {isLoading && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-6 z-20">
                    <div className="relative">
                      <Loader2 className="animate-spin text-brand-400" size={64} />
                      <Sparkles className="absolute -top-2 -right-2 text-brand-300 animate-pulse" size={24} />
                    </div>
                    <div className="text-center">
                      <span className="text-[12px] font-black uppercase tracking-[0.3em] text-brand-400 block mb-1">Pintando Exemplo</span>
                      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest italic">Benchmark v1.85</span>
                    </div>
                  </div>
                )}

                {/* Botões de Ação na Imagem */}
                {example && !isLoading && (
                  <div className="absolute top-6 right-6 flex gap-3 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                    <a
                      href={example.imageUrl}
                      download={`echogen_style_${style.label.replace(/\s+/g, '_').toLowerCase()}.png`}
                      className="p-3 bg-slate-900/80 text-white rounded-2xl hover:bg-brand-500 shadow-2xl border border-white/10 transition-colors"
                    >
                      <Download size={20} />
                    </a>
                  </div>
                )}

                {/* Status Indicator */}
                {example && (
                  <div className="absolute bottom-6 left-6 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <CheckCircle size={14} className="text-green-500" />
                    <span className="text-[9px] font-black text-white uppercase tracking-widest">Cache Ativo</span>
                  </div>
                )}
              </div>

              {/* Info Panel */}
              <div className="p-10 flex-1 flex flex-col gap-6 bg-slate-900/20 backdrop-blur-sm">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight italic leading-none">{style.label}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-500"></div>
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Token Visual Permanente</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleGenerate(style)}
                    disabled={isLoading}
                    className="bg-brand-500 hover:bg-brand-400 text-white p-4 rounded-2xl shadow-xl shadow-brand-500/20 transition-all active:scale-90 disabled:opacity-50"
                  >
                    <RefreshCw size={24} className={isLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                <div className="bg-slate-950/60 p-6 rounded-[2rem] border border-slate-800 shadow-inner group-hover:border-slate-700 transition-colors relative">
                  <div className="absolute -top-3 left-6 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[8px] font-black text-slate-500 uppercase tracking-widest">Lógica Estética</div>
                  <p className="text-[12px] font-mono text-slate-400 leading-relaxed italic mt-2">
                    "{style.prompt}"
                  </p>
                </div>

                <div className="flex items-center justify-between mt-auto pt-6 border-t border-slate-800/50">
                  <div className="flex items-center gap-3 text-slate-600 text-[10px] font-black uppercase tracking-widest">
                    <div className="bg-slate-800 p-2 rounded-xl"><Info size={14} /></div>
                    <span>Render Master Engine</span>
                  </div>
                  {example && (
                    <span className="text-[10px] font-mono text-slate-700">Ref: {new Date(example.timestamp).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer / Benchmark Info */}
      <div className="mt-32 pt-16 border-t border-slate-900 flex flex-col lg:flex-row justify-between items-start gap-12">
        <div className="max-w-2xl space-y-6">
          <div className="flex items-center gap-3 text-brand-400">
            <Sparkles size={24} />
            <h4 className="text-white font-black uppercase tracking-[0.2em] text-sm">Protocolo de Benchmark Visual</h4>
          </div>
          <p className="text-slate-500 text-sm leading-relaxed font-medium">
            Para garantir uma comparação técnica honesta, todas as imagens acima utilizam o mesmo prompt "Biblioteca Mágica". Este prompt foi desenhado para testar:
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              "Iluminação Volumétrica (Luz Dourada)",
              "Física de Materiais (Bronze, Lã, Couro)",
              "Micro-detalhes (Poeira e Engrenagens)",
              "Expressão Facial e Anatomia",
              "Profundidade de Campo (Bokeh)",
              "Renderização de Texturas Orgânicas"
            ].map(item => (
              <li key={item} className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-600 tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-900"></div>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4 w-full lg:w-auto">
          <button
            onClick={onBack}
            className="px-16 py-6 bg-brand-500 text-white rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] hover:bg-brand-400 transition-all shadow-2xl shadow-brand-500/20 border-b-4 border-brand-700 active:border-b-0 active:translate-y-1"
          >
            Aplicar nos Projetos
          </button>
          <p className="text-[9px] text-slate-700 font-black uppercase text-center tracking-widest">echoVID v1.85 • IA Creative Suite</p>
        </div>
      </div>
    </div>
  );
};
