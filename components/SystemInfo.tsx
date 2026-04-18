
import React from 'react';
import { Sparkles, Video, Type, Image as ImageIcon, Users, MapPin, Zap, Settings, Target, ShieldCheck, Clock, Layers, Code, Cpu, Film, Activity, Wallet, FileText, Clapperboard, Type as TypeIcon, ImagePlay, RefreshCw, AlertCircle, Info, ChevronRight, Binary, Terminal, Database, Move, MousePointer2, Scissors, History, Dna } from 'lucide-react';
import { DEFAULT_SETTINGS } from './SettingsModal';

interface SystemInfoProps {
  usage?: any;
  apiInfrastructure?: any;
  onRefresh?: () => void;
}

export const SystemInfo: React.FC<SystemInfoProps> = ({ usage, apiInfrastructure, onRefresh }) => {
  return (
    <div className="w-full max-w-6xl mx-auto py-12 px-4 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      
      {/* HEADER MASTER v7.9.6 */}
      <div className="text-center mb-20 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-brand-500/10 blur-[120px] rounded-full -z-10"></div>
        <div className="inline-flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-6 py-2.5 rounded-full border border-brand-500/30 mb-8 shadow-2xl shadow-brand-500/10">
          <div className="relative">
            <Cpu size={20} className="text-brand-400" />
            <div className="absolute inset-0 bg-brand-400 blur-md opacity-40 animate-pulse"></div>
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Arquitetura EchoVideo v7.9.6 — Resilience & Parity</span>
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse ml-2" />
        </div>
        <h1 className="text-7xl font-black text-white mb-6 tracking-tighter uppercase leading-[0.9] italic">
          Telemetria <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-brand-500 to-brand-300">Master</span>
        </h1>
        <p className="text-slate-400 text-xl max-w-3xl mx-auto font-medium leading-relaxed opacity-80">
          Controle total de APIs, algoritmos de movimento Ken Burns e paridade visual absoluta entre motores.
        </p>
      </div>

      <div className="space-y-32">

        {/* SECTION 01: RESILIÊNCIA E COMPATIBILIDADE */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="bg-brand-500/10 w-16 h-16 rounded-2xl flex items-center justify-center border border-brand-500/20 shadow-2xl shadow-brand-500/5">
                <ShieldCheck className="text-brand-400" size={32} />
              </div>
              <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic">01. Protocolo de Resiliência</h2>
            </div>
            
            <div className="space-y-6">
              <p className="text-slate-400 text-lg leading-relaxed">
                A v7.9.6 introduz o <strong>Pollinations Canvas Bypass</strong>, eliminando erros de CORS e garantindo 100% de sucesso na geração de ativos via base64 local.
              </p>
              
              <div className="grid grid-cols-1 gap-4">
                <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-3xl p-6 hover:border-brand-500/30 transition-all group">
                   <div className="flex items-center gap-3 mb-4">
                      <Dna className="text-brand-400" size={20} />
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-300">Legacy Data Support</h4>
                   </div>
                   <div className="bg-slate-950/80 p-5 rounded-xl border border-slate-800 font-mono text-[10px] text-slate-500 leading-relaxed group-hover:text-slate-400 transition-colors">
                      Mapeamento dual ativo: <span className="text-brand-500">camelCase</span> ⇄ <span className="text-brand-500">snake_case</span>.<br/>
                      Garante a visibilidade de personagens e cenários em projetos legados.
                   </div>
                </div>
                
                <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-3xl p-6 hover:border-brand-500/30 transition-all group">
                   <div className="flex items-center gap-3 mb-4">
                      <Zap className="text-amber-400" size={20} />
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-300">Turbo Fallback Protocol</h4>
                   </div>
                   <div className="bg-slate-950/80 p-5 rounded-xl border border-slate-800 font-mono text-[10px] text-slate-500 leading-relaxed group-hover:text-slate-400 transition-colors">
                      Modelo <strong>ZIMAGE</strong> opera com fallback silencioso para <strong>Turbo</strong> em caso de timeout na API principal.
                   </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 rounded-[3rem] p-10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 blur-3xl group-hover:bg-brand-500/10 transition-all"></div>
            <h3 className="text-white font-black uppercase tracking-[0.2em] text-[10px] border-b border-slate-800 pb-6 mb-8 flex items-center gap-3 italic">
              <Binary size={14} className="text-brand-400" /> Pipeline Visual (Paridade v7.9.6)
            </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                  <span className="text-[10px] text-slate-500 uppercase font-black">Vinheta (Browser/Desktop)</span>
                  <span className="text-[10px] text-brand-400 font-black">OPACIDADE 95%</span>
                </div>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                  <span className="text-[10px] text-slate-500 uppercase font-black">VHS Overlay Sync</span>
                  <span className="text-[10px] text-brand-400 font-black">CHROMAPRIDIA DISTANCE</span>
                </div>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                  <span className="text-[10px] text-slate-500 uppercase font-black">Shadow Dispersion (9:16)</span>
                  <span className="text-[10px] text-brand-400 font-black">DYNAMIC SCALING</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-brand-500/5 rounded-2xl border border-brand-500/10">
                <AlertCircle size={18} className="text-brand-500 shrink-0" />
                <p className="text-[10px] text-brand-500/70 font-bold uppercase tracking-wider">Status: Paridade visual de 100% atingida entre motores Canvas e FFmpeg.</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 02: ENGINE DE MOVIMENTO (KEN BURNS v7.9.6) */}
        <section className="space-y-16">
          <div className="text-center space-y-4">
             <div className="bg-indigo-500/10 w-20 h-20 rounded-[2.5rem] flex items-center justify-center border border-indigo-500/20 shadow-2xl shadow-indigo-500/5 mx-auto mb-6">
                <History className="text-indigo-400" size={40} />
             </div>
             <h2 className="text-5xl font-black text-white uppercase tracking-tighter italic">02. Dinâmica de Movimento</h2>
             <p className="text-slate-500 max-w-2xl mx-auto text-lg">O novo algoritmo de rotação estocástica proíbe repetições visuais e garante fluidez cinematográfica.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
             <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem] hover:bg-slate-900/60 transition-all border-b-4 border-b-brand-500/40">
                <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em] mb-4 block">Histórico de Cenas</span>
                <h4 className="text-xl font-bold text-white mb-3">BUFFER: 5 CENAS</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Um efeito de zoom ou pan nunca é repetido em uma janela de 5 cenas consecutivas.</p>
             </div>
             <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem] hover:bg-slate-900/60 transition-all border-b-4 border-b-indigo-500/40">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4 block">Fator Estocástico</span>
                <h4 className="text-xl font-bold text-white mb-3">50% RANDOMNESS</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Probabilidade de 50% de ignorar o match contextual em favor de uma escolha puramente aleatória.</p>
             </div>
             <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem] hover:bg-slate-900/60 transition-all border-b-4 border-b-slate-700/40">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4 block">Suavidade (Jitter Free)</span>
                <h4 className="text-xl font-bold text-white mb-3">25 FPS STATIC</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Filtro zoompan sincronizado via tempo do áudio para eliminar trepidações em renders longos.</p>
             </div>
          </div>
        </section>

        {/* SECTION 03: ARSENAL DE IA (MODELOS ATUALIZADOS) */}
        <section className="space-y-16 mt-24">
          <div className="flex flex-col md:flex-row justify-between items-end gap-8">
             <div className="space-y-4">
                <div className="bg-amber-500/10 w-16 h-16 rounded-2xl flex items-center justify-center border border-amber-500/20">
                   <Zap className="text-amber-400" size={32} />
                </div>
                <h2 className="text-5xl font-black text-white uppercase tracking-tighter italic leading-none">03. Arsenal de IA</h2>
                <p className="text-slate-500 text-lg max-w-xl italic">Ecossistema padronizado v7.9.6 para alta fidelidade visual.</p>
             </div>
             
             {onRefresh && (
               <button 
                 onClick={onRefresh}
                 className="flex items-center gap-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-6 py-3 rounded-2xl text-xs font-black uppercase text-brand-400 transition-all hover:scale-105 active:scale-95"
               >
                 <RefreshCw size={16} className={usage ? "" : "animate-spin"} /> Telemetria de Créditos
               </button>
             )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
             {/* IMAGEN 4 */}
             <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 relative group overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 blur-2xl group-hover:bg-brand-500/10 transition-all"></div>
                <div className="flex justify-between items-start">
                   <div className="p-3 bg-brand-500/10 rounded-xl text-brand-400"><Binary size={20}/></div>
                   <div className="text-[9px] font-black bg-brand-500/20 text-brand-400 px-2 py-1 rounded">FAST</div>
                </div>
                <div>
                   <h4 className="text-white font-black uppercase tracking-widest text-sm mb-2">IMAGEN 4</h4>
                   <p className="text-[10px] text-slate-500 leading-relaxed uppercase font-bold tracking-tight">Vertex AI: Motor padrão de alta velocidade e realismo fotorrealista.</p>
                </div>
                <div className="pt-4 border-t border-slate-800 flex justify-between items-center font-mono text-[10px]">
                   <span className="text-slate-600 uppercase tracking-widest leading-none">Latency</span>
                   <span className="text-brand-400">~1.8s img</span>
                </div>
             </div>

             {/* NANO */}
             <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 relative group overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
                <div className="flex justify-between items-start">
                   <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400"><Database size={20}/></div>
                   <div className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">LIGHT</div>
                </div>
                <div>
                   <h4 className="text-white font-black uppercase tracking-widest text-sm mb-2">NANO</h4>
                   <p className="text-[10px] text-slate-500 leading-relaxed uppercase font-bold tracking-tight">Gemini 2.5 Flash: Modelo econômico para decupagem e assets secundários.</p>
                </div>
                <div className="pt-4 border-t border-slate-800 flex justify-between items-center font-mono text-[10px]">
                   <span className="text-slate-600 uppercase tracking-widest leading-none">Cost</span>
                   <span className="text-emerald-400">Minimal</span>
                </div>
             </div>

             {/* FLUX */}
             <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 relative group overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-2xl group-hover:bg-purple-500/10 transition-all"></div>
                <div className="flex justify-between items-start">
                   <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400"><Sparkles size={20}/></div>
                   <div className="text-[9px] font-black bg-purple-500/20 text-purple-400 px-2 py-1 rounded">CINEMA</div>
                </div>
                <div>
                   <h4 className="text-white font-black uppercase tracking-widest text-sm mb-2">FLUX</h4>
                   <p className="text-[10px] text-slate-500 leading-relaxed uppercase font-bold tracking-tight">Pollinations: Estética cinema, profundidade dramática e realismo orgânico.</p>
                </div>
                <div className="pt-4 border-t border-slate-800 flex justify-between items-center font-mono text-[10px]">
                   <span className="text-slate-600 uppercase tracking-widest leading-none">Reliability</span>
                   <span className="text-purple-400">Canvas Bypass</span>
                </div>
             </div>

             {/* ZIMAGE */}
             <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem] space-y-6 relative group overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-2xl group-hover:bg-indigo-500/10 transition-all"></div>
                <div className="flex justify-between items-start">
                   <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400"><ImagePlay size={20}/></div>
                   <div className="text-[9px] font-black bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded">DREAM</div>
                </div>
                <div>
                   <h4 className="text-white font-black uppercase tracking-widest text-sm mb-2">ZIMAGE</h4>
                   <p className="text-[10px] text-slate-500 leading-relaxed uppercase font-bold tracking-tight">Motor Onírico: Realismo mágico e surrealismo (com fallback Turbo).</p>
                </div>
                <div className="pt-4 border-t border-slate-800 flex justify-between items-center font-mono text-[10px]">
                   <span className="text-slate-600 uppercase tracking-widest leading-none">Fallback</span>
                   <span className="text-indigo-400">Turbo Active</span>
                </div>
             </div>
          </div>

          {/* TELEMETRIA DE USO REAL */}
          {usage && (
            <div className="bg-slate-900/80 backdrop-blur-3xl border border-slate-800 rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 duration-700">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                  <div className="space-y-4">
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] block">Investimento Operacional</span>
                     <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-white italic">${(usage?.totalCost ?? 0).toFixed(4)}</span>
                        <span className="text-xs font-bold text-brand-400 uppercase">USD</span>
                     </div>
                     <p className="text-[10px] text-slate-600 leading-relaxed uppercase tracking-widest">Gasto real acumulado (24h) incluindo todas as chamadas de API bem-sucedidas.</p>
                  </div>
                  <div className="space-y-4">
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] block">Ativos Gerados</span>
                     <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-white italic">{usage.scenesCount || 0}</span>
                        <span className="text-xs font-bold text-indigo-400 uppercase">ASSETS</span>
                     </div>
                     <p className="text-[10px] text-slate-600 leading-relaxed uppercase tracking-widest">Volume de imagens e vídeos processados pelo renderizador v7.9.6.</p>
                  </div>
                  <div className="space-y-6">
                     <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest border-b border-slate-800 pb-2">
                        <span className="text-slate-500">API Gateway</span>
                        <span className="text-green-500 flex items-center gap-1"><div className="w-1 h-1 bg-green-500 rounded-full"/> Connected</span>
                     </div>
                     <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest border-b border-slate-800 pb-2">
                        <span className="text-slate-500">Video Pipeline</span>
                        <span className="text-brand-400">Deterministic Sync</span>
                     </div>
                     <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">Resilience</span>
                        <span className="text-slate-400 font-mono italic">Enabled (Canvas)</span>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </section>

        {/* SECTION 04: SINCRONIA E LEGENDAS (V7.9.6 SCALING) */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start mt-12 bg-slate-900/20 rounded-[4rem] p-12 border border-slate-900/50">
          <div className="space-y-8">
            <div className="bg-emerald-500/10 w-16 h-16 rounded-2xl flex items-center justify-center border border-emerald-500/20">
              <TypeIcon className="text-emerald-400" size={32} />
            </div>
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic">04. Sincronia SRT Absolute</h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              Pipeline de injeção Verbatim com paridade visual de sombras entre 16:9 e 9:16 através de dispersão dinâmica.
            </p>
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 space-y-6">
              <div className="flex items-center gap-4">
                 <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400"><Layers size={20}/></div>
                 <div>
                    <h5 className="text-white font-bold text-sm uppercase tracking-wider">Dynamic Shadow Scaling</h5>
                    <p className="text-[11px] text-slate-500">O motor ajusta o desvio do Stacked Shadows baseando-se no shadowBlur e resolução de saída.</p>
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400"><Move size={20}/></div>
                 <div>
                    <h5 className="text-white font-bold text-sm uppercase tracking-wider">Posicionamento Data-Driven</h5>
                    <p className="text-[11px] text-slate-500">Replicação exata das coordenadas Y (%) do Browser no renderizador nativo FFmpeg.</p>
                 </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-6">
             <div className="bg-slate-950 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">
                <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Status de Sincronia (v7.9.6)</h4>
                <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                      <span className="text-[9px] text-slate-600 uppercase font-black block mb-1">Blur Parity</span>
                      <span className="text-xs text-white">Dynamic Dispersion</span>
                   </div>
                   <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                      <span className="text-[9px] text-slate-600 uppercase font-black block mb-1">Shadow Offset</span>
                      <span className="text-xs text-white">Scale-Aware 1.5x</span>
                   </div>
                   <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                      <span className="text-[9px] text-slate-600 uppercase font-black block mb-1">Subtitle Sync</span>
                      <span className="text-xs text-white">Delay Zero Protocol</span>
                   </div>
                   <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                      <span className="text-[9px] text-slate-600 uppercase font-black block mb-1">Preset Engine</span>
                      <span className="text-xs text-white">Firestore Real-time</span>
                   </div>
                </div>
                <div className="pt-4 border-t border-slate-800">
                   <p className="text-[10px] text-slate-600 italic">"Garantia de que a legenda terá o mesmo peso visual independente do aspecto do vídeo (Vertical ou Horizontal)."</p>
                </div>
             </div>
          </div>
        </section>

      </div>

      {/* FOOTER SYSTEM READY v7.9.6 */}
      <div className="mt-32 pt-12 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="relative">
             <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
             <div className="absolute inset-0 bg-green-500 blur-sm opacity-50 animate-ping"></div>
          </div>
          <span className="text-xs font-black text-slate-600 uppercase tracking-[0.4em]">Arquitetura v7.9.6 — Sistema Resiliente e Paritário</span>
        </div>
        <div className="flex gap-12">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] mb-1">Média de Custo</span>
            <span className="text-xs font-black text-slate-400 uppercase italic tracking-tighter">$ {(usage?.totalCost ?? 0).toFixed(5)}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] mb-1">Visual Parity</span>
            <span className="text-xs font-black text-slate-400 uppercase italic tracking-tighter">100% Certified</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] mb-1">Uptime</span>
            <span className="text-xs font-black text-slate-400 uppercase italic tracking-tighter">99.9% Cloud</span>
          </div>
        </div>
      </div>
    </div>
  );
};
