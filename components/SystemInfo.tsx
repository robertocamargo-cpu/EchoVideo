
import React from 'react';
import { Sparkles, Video, Type, Image as ImageIcon, Users, MapPin, Zap, Settings, Target, ShieldCheck, Clock, Layers, Code, Cpu, Film, Activity, Wallet, FileText, Clapperboard, Type as TypeIcon, ImagePlay } from 'lucide-react';
import { DEFAULT_SETTINGS } from './SettingsModal';

export const SystemInfo: React.FC = () => {
  return (
    <div className="w-full max-w-6xl mx-auto py-12 px-4 animate-in fade-in duration-700">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 bg-brand-500/10 px-4 py-2 rounded-full border border-brand-500/20 mb-6">
          <Cpu size={16} className="text-brand-400" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400">AI Art Direction Engine v1.90</span>
        </div>
        <h1 className="text-6xl font-black text-white mb-6 tracking-tighter uppercase leading-none">Manual Técnico <span className="text-brand-400">echoVID</span></h1>
        <p className="text-slate-500 text-xl max-w-3xl mx-auto font-medium leading-relaxed">
          Documentação completa dos protocolos de consistência visual, engenharia de prompts e custos operacionais.
        </p>
      </div>

      <div className="space-y-24">

        {/* Seção 1: Inteligência e Custos */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div className="space-y-6">
            <div className="bg-brand-500/10 w-16 h-16 rounded-[2rem] flex items-center justify-center border border-brand-500/20 shadow-xl shadow-brand-500/5">
              <Wallet className="text-brand-400" size={32} />
            </div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight">01. Monitoramento de Investimento</h2>
            <p className="text-slate-400 leading-relaxed">
              Cada imagem gerada possui um custo rastreado com precisão de <strong>6 casas decimais</strong>. O investimento é calculado dinamicamente no momento da geração.
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-inner">
              <div className="flex justify-between items-center text-xs font-bold border-b border-slate-800 pb-2">
                <span className="text-slate-500 uppercase tracking-widest">Gemini 2.5 Flash Image:</span>
                <span className="text-brand-400 font-mono">Dinâmico ($ ~0.035000)</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-500 uppercase tracking-widest">Flux (Pollinations):</span>
                <span className="text-green-500 font-mono">$ 0.000000</span>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 rounded-[3rem] p-8 space-y-6">
            <h3 className="text-white font-black uppercase tracking-widest text-sm border-b border-slate-800 pb-4">Prompt de Transcrição (System)</h3>
            <div className="space-y-4 overflow-hidden">
              <p className="text-slate-400 text-xs">O prompt de transcrição força o modelo a agir como Diretor de Arte:</p>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 font-mono text-[9px] text-slate-500 leading-relaxed overflow-y-auto max-h-60 custom-scrollbar">
                {DEFAULT_SETTINGS.transcriptionPrompt}
              </div>
            </div>
          </div>
        </section>

        {/* Seção 2: Tokens de Personagem e Cenário */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div className="space-y-6">
            <div className="bg-indigo-500/10 w-16 h-16 rounded-[2rem] flex items-center justify-center border border-indigo-500/20 shadow-xl shadow-indigo-500/5">
              <Users className="text-indigo-400" size={32} />
            </div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight">02. Character Tokens</h2>
            <p className="text-slate-400 leading-relaxed">
              Garante a consistência absoluta da fisionomia. Focado puramente na descrição física.
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h4 className="text-[10px] font-black text-brand-400 uppercase tracking-widest">Prompt de Consistência Física:</h4>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[9px] text-slate-500 space-y-2">
                <p><strong>Sujeito:</strong> Middle-aged man with sharp features.</p>
                <p><strong>Cabelo:</strong> Short black salt-and-pepper hair.</p>
                <p><strong>Vestuário:</strong> Heavy linen white shirt, brown leather boots.</p>
              </div>
              <p className="text-[9px] text-slate-600 italic">"Nomes reais de figuras históricas são convertidos em descrições físicas detalhadas para evitar filtros de política de IA."</p>
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 rounded-[3rem] p-8 space-y-6">
            <h3 className="text-white font-black uppercase tracking-widest text-sm border-b border-slate-800 pb-4">Scenario Tokens</h3>
            <div className="space-y-4">
              <p className="text-slate-400 text-xs">"Congelamos" o ambiente para múltiplas gerações através de descritores espaciais literais.</p>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 font-mono text-[9px] text-slate-500 space-y-3 leading-relaxed">
                <p><strong className="text-indigo-400">1. Esqueleto:</strong> Arquitetura e Limites (Paredes, Teto, Horizonte).</p>
                <p><strong className="text-indigo-400">2. Ancoragem:</strong> Objetos fixos em posições exatas (ex: mesa ao fundo à direita).</p>
                <p><strong className="text-indigo-400">3. Texturas:</strong> Materiais (concreto, madeira envelhecida).</p>
                <p><strong className="text-indigo-400">4. Atmosfera:</strong> Fonte de luz e paleta cromática dominante.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Seção 3: CTR Ninja e Suporte a Vídeo */}
        <section className="space-y-12">
          <div className="text-center">
            <div className="bg-red-500/10 w-20 h-20 rounded-[2.5rem] flex items-center justify-center border border-red-500/20 shadow-xl shadow-red-500/5 mx-auto mb-6">
              <Clapperboard className="text-red-400" size={40} />
            </div>
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter">03. Importação de MP4 & CTR Ninja</h2>
            <p className="text-slate-500 mt-4 max-w-2xl mx-auto leading-relaxed">
              Além de imagens estáticas, o echoVID v1.8 suporta a importação de vídeos MP4 para cada cena, mantendo a sincronia perfeita com o áudio original.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-[3rem] p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-4">
                <h4 className="text-brand-400 font-black uppercase tracking-widest text-xs">Prompt CTR Ninja (System)</h4>
                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 font-mono text-[9px] text-slate-600 italic leading-relaxed overflow-y-auto max-h-40 custom-scrollbar">
                  {DEFAULT_SETTINGS.titlesPrompt}
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-indigo-400 font-black uppercase tracking-widest text-xs">Regras de Produção</h4>
                <ul className="text-xs text-slate-400 space-y-3 leading-relaxed">
                  <li className="flex gap-3"><div className="w-1.5 h-1.5 bg-brand-500 rounded-full mt-1.5"></div> <strong>Janela de Cena:</strong> Strict 5s a 10s por imagem/vídeo.</li>
                  <li className="flex gap-3"><div className="w-1.5 h-1.5 bg-brand-500 rounded-full mt-1.5"></div> <strong>Importação de Vídeo:</strong> MP4 suportado com playback sincronizado.</li>
                  <li className="flex gap-3"><div className="w-1.5 h-1.5 bg-brand-500 rounded-full mt-1.5"></div> <strong>Persistência:</strong> Projetos salvos incluem todas as mídias geradas ou importadas.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Seção 4: Motor de Sincronia de Legendas */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start mt-24">
          <div className="space-y-6">
            <div className="bg-emerald-500/10 w-16 h-16 rounded-[2rem] flex items-center justify-center border border-emerald-500/20 shadow-xl shadow-emerald-500/5">
              <TypeIcon className="text-emerald-400" size={32} />
            </div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight">04. Arquitetura de Sincronia (SRT)</h2>
            <p className="text-slate-400 leading-relaxed">
              O pipeline de injeção de SRT foi desenhado para garantir <strong>100% de timing fiel</strong> sem perdas matemáticas (drift) durante a renderização do vídeo.
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Proteção Anti-Race Condition:</h4>
              <p className="text-xs text-slate-400">
                A etapa de carregamento de arquivos na UI bloqueia execuções paralelas. Se o usuário soltar SRT e Áudio ao mesmo tempo, o sistema garante que o Áudio espere a tabela SRT ser indexada globalmente. Antigamente, uma "corrida" assíncrona gerava projetos orfãos de SRT.
              </p>
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 rounded-[3rem] p-8 space-y-6">
            <h3 className="text-white font-black uppercase tracking-widest text-sm border-b border-slate-800 pb-4">Strict SRT Mode Engine</h3>
            <div className="space-y-4">
              <p className="text-slate-400 text-xs">A renderização no Canvas utiliza condicional estrita.</p>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 font-mono text-[9px] text-slate-500 space-y-3 leading-relaxed">
                <p><strong className="text-emerald-400">Parsing Global:</strong> O SRT não é cortado artificialmente pela IA. O VTT/SRT matriz inteiro é indexado no array globalSrtSegments na memória na inicialização.</p>
                <p><strong className="text-emerald-400">Modo Estrito (Strict Mode):</strong> Se o array de arquivos detectar um SRT, a ferramenta de render fallback (matemática de preenchimento) é TOTALMENTE DESLIGADA. O vídeo obedece EXCLUSIVAMENTE ao milissegundo do arquivo da voz. Cenas mudas ficam corretamente sem legendas.</p>
                <p><strong className="text-emerald-400">Overlap Prevention:</strong> Blocos de SRT nunca aparecem 1cs antes de serem falados. Isso foi fixado amarrando o início lógico da cena subsequente (currentBoundary) ao fim pontual da última cena.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Seção 5: Motor Gráfico e Efeitos */}
        <section className="space-y-12 mt-24">
          <div className="text-center">
            <div className="bg-amber-500/10 w-20 h-20 rounded-[2.5rem] flex items-center justify-center border border-amber-500/20 shadow-xl shadow-amber-500/5 mx-auto mb-6">
              <ImagePlay className="text-amber-400" size={40} />
            </div>
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter">05. Motor de Motion Analytics</h2>
            <p className="text-slate-500 mt-4 max-w-2xl mx-auto leading-relaxed">
              Sistema randômico ponderado que dá movimento cinematográfico às imagens estáticas no render.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-[3rem] p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-4">
                <h4 className="text-amber-400 font-black uppercase tracking-widest text-xs">Ponderação Estocástica (Pesos)</h4>
                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 font-mono text-[10px] text-slate-500 space-y-4">
                  <p>O `videoService.tsx` sorteia os efeitos em arrays matematicamente calibrados. Não é um Math.random simples. Alguns efeitos mais nauseantes têm a raridade reduzida manualmente.</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    <li><strong className="text-white">Zoom In Slow:</strong> Probabilidade dominante. 35% de chance. Cria a sensação fundamental de imersão.</li>
                    <li><strong className="text-white">Pan Right / Left:</strong> 20% de chance. Move gentilmente a câmera pelos eixos horizontais para revelar cenários.</li>
                    <li><strong className="text-white">Pan Up / Down:</strong> 15% de chance. Usado geralmente em arquiteturas e descrições humanas verticais.</li>
                    <li><strong className="text-white">Zoom Out (Parallax):</strong> 10% de chance. Revelação de cenário de fundo.</li>
                  </ul>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-indigo-400 font-black uppercase tracking-widest text-xs">Draw Pipeline (Context2D)</h4>
                <ul className="text-xs text-slate-400 space-y-3 leading-relaxed">
                  <li className="flex gap-3"><div className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5"></div> <strong>Calculo de Proporção:</strong> Imagens geradas horizontalmente sofrem downscaling antes do fit no vídeo, as verticais escalonam com clamp.</li>
                  <li className="flex gap-3"><div className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5"></div> <strong>Loop Renderizacional (fps):</strong> Usa o milissegundo decorrido do áudio via AudioContext.currentTime garantindo que as imagens não fiquem presas em travamentos de renderização local. O frame sempre avança no step exato do áudio.</li>
                  <li className="flex gap-3"><div className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5"></div> <strong>Interpolation:</strong> As imagens animadas usam Canvas `transformation matrix` (`ctx.translate`, `ctx.scale`), gerando pan/zooms fluídos.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

      </div>

      <div className="mt-32 pt-12 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-black text-slate-600 uppercase tracking-[0.3em]">System Architecture v1.90 Ready</span>
        </div>
        <div className="flex gap-8">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Custo</span>
            <span className="text-xs font-bold text-slate-400">Dinâmico (Gemini)</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Cenas</span>
            <span className="text-xs font-bold text-slate-400">5s - 10s</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Midia</span>
            <span className="text-xs font-bold text-slate-400">IMG + MP4</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const CheckCircleIcon = () => (
  <div className="bg-brand-500/20 p-1.5 rounded-full border border-brand-500/20">
    <Sparkles size={14} className="text-brand-400" />
  </div>
);

const Hash = ({ size, className }: { size: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="4" y1="9" x2="20" y2="9"></line>
    <line x1="4" y1="15" x2="20" y2="15"></line>
    <line x1="10" y1="3" x2="8" y2="21"></line>
    <line x1="16" y1="3" x2="14" y2="21"></line>
  </svg>
);
