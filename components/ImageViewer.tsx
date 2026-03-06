
import React from 'react';
import { X, Download, FileText, Info } from 'lucide-react';
import { ColoredPrompt } from './ColoredPrompt';

interface ImageViewerProps {
  imageUrl: string;
  promptData: any;
  onClose: () => void;
  filename: string;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ imageUrl, promptData, onClose, filename }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/98 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <div className="relative bg-slate-950 rounded-[2.5rem] shadow-2xl border border-slate-800 max-w-7xl w-full h-[90vh] flex overflow-hidden flex-col md:flex-row border-brand-500/10">
        
        {/* Área da Imagem */}
        <div className="flex-[1.5] bg-black/50 flex items-center justify-center p-6 relative overflow-hidden group">
            <div className="absolute inset-0 opacity-5" style={{backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px'}}></div>
            
            {imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt="IA Generated Output" 
                  className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.8)] relative z-10 transition-transform duration-500 group-hover:scale-[1.01]"
                />
            ) : (
                <div className="text-slate-800 flex flex-col items-center gap-4 uppercase font-black tracking-widest opacity-20">
                    <Info size={120}/>
                    <span>Sem Preview Disponível</span>
                </div>
            )}
            
            <button 
                onClick={onClose}
                className="md:hidden absolute top-6 right-6 p-3 bg-slate-900/80 text-white rounded-full z-20 backdrop-blur-lg border border-white/10"
            >
                <X size={28} />
            </button>
        </div>

        {/* Painel Lateral de Dados */}
        <div className="w-full md:w-[450px] bg-slate-900/40 backdrop-blur-md border-t md:border-t-0 md:border-l border-slate-800 flex flex-col h-[50%] md:h-full">
            <div className="p-8 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/50">
                <div className="flex flex-col">
                    <h3 className="font-black text-white text-base truncate pr-4 uppercase tracking-tight" title={filename}>
                        {filename}
                    </h3>
                    <span className="text-[10px] text-brand-400 font-black uppercase tracking-widest mt-0.5">Prompt Master de Produção</span>
                </div>
                <button 
                    onClick={onClose}
                    className="hidden md:flex p-2 hover:bg-slate-800 rounded-2xl transition-all text-slate-500 hover:text-white"
                >
                    <X size={24} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
                <div>
                    <div className="mb-4 flex items-center gap-3 text-brand-400 font-black text-[11px] uppercase tracking-[0.2em]">
                        <div className="bg-brand-500/10 p-2 rounded-lg"><FileText size={16}/></div>
                        Blocos de Composição
                    </div>
                    <div className="bg-slate-950/80 rounded-[1.5rem] border border-slate-800 p-6 shadow-inner group/code relative">
                        <ColoredPrompt promptData={promptData} className="text-[13px] font-mono" />
                    </div>
                </div>

                <div className="bg-brand-900/10 border border-brand-500/10 rounded-2xl p-4">
                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic">
                        "O prompt final é montado sem metadados estruturais para maximizar a qualidade da IA. As cores diferenciam Personagem, Ação, Cenário e Estilo."
                    </p>
                </div>
            </div>

            <div className="p-8 border-t border-slate-800 bg-slate-900/80">
                {imageUrl && (
                    <a 
                        href={imageUrl} 
                        download={filename || 'echogen_output.png'}
                        className="flex items-center justify-center gap-3 bg-brand-500 hover:bg-brand-400 text-white px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-brand-900/20 active:scale-95"
                    >
                        <Download size={20} />
                        Baixar PNG Original
                    </a>
                )}
            </div>
        </div>

      </div>
    </div>
  );
};
