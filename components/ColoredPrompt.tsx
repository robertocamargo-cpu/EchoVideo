
import React from 'react';
import { Copy, Check } from 'lucide-react';

interface PromptParts {
    medium?: string;
    subject?: string;
    action?: string;
    style?: string;
    camera?: string;
    propsPrompt?: string; // NOVO: Campo de propriedades formatado
    negative?: string;
    // Fallback para campos antigos caso ainda existam no cache/banco
    characterDescription?: string;
    locationDescription?: string;
    finalPrompt?: string; // NOVO: Prompt integral em raw text
}

interface ColoredPromptProps {
    promptData?: PromptParts;
    className?: string;
}

export const ColoredPrompt: React.FC<ColoredPromptProps> = ({ promptData, className = "" }) => {
    const [copied, setCopied] = React.useState(false);
    const [isExpanded, setIsExpanded] = React.useState(false);

    const handleCopy = () => {
        if (promptData?.finalPrompt) {
            navigator.clipboard.writeText(promptData.finalPrompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!promptData) return <span className="text-slate-500 italic">Sem prompt disponível.</span>;

    if (!isExpanded) {
        return (
            <div className={`flex items-center gap-2 relative ${className} text-[10px] w-full max-w-full overflow-hidden`}>
                <div 
                   onClick={() => setIsExpanded(true)} 
                   className="flex-1 bg-slate-900/50 border border-slate-800 rounded-lg p-3 text-slate-400 font-mono truncate cursor-pointer hover:bg-slate-800 transition-colors opacity-80 hover:opacity-100"
                   title="Clique para ver os blocos detalhados"
                >
                    {promptData.finalPrompt || "Prompt não gerado..."}
                </div>
                {promptData.finalPrompt && (
                    <button
                        onClick={handleCopy}
                        className="p-3 bg-brand-500/10 text-brand-400 border border-brand-500/20 rounded-lg hover:bg-brand-500 hover:text-white transition-all flex-shrink-0"
                        title="Copiar prompt completo"
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className={`flex flex-col gap-y-1.5 relative ${className} text-[10px]`}>
            {/* ESTILO + MEDIUM */}
            {(promptData.style || promptData.medium) && (
                <div className="bg-slate-900/50 rounded px-3 py-2 text-left leading-relaxed">
                    <span className="font-black uppercase tracking-widest text-slate-500 mr-2">Estilo de Imagem:</span>
                    <span className="text-sky-400 font-bold">
                        {promptData.style} {promptData.medium ? `(${promptData.medium})` : ''}
                    </span>
                </div>
            )}

            {/* SUBJECT / CHARACTER */}
            {(promptData.subject || promptData.characterDescription) && (
                <div className="bg-slate-900/50 rounded px-3 py-2 text-left leading-relaxed">
                    <span className="font-black uppercase tracking-widest text-slate-500 mr-2">Subject:</span>
                    <span className="text-fuchsia-400 font-bold">
                        {promptData.subject || promptData.characterDescription}
                    </span>
                </div>
            )}

            {/* ACTION */}
            {promptData.action && (
                <div className="bg-slate-900/50 rounded px-3 py-2 text-left leading-relaxed">
                    <span className="font-black uppercase tracking-widest text-slate-500 mr-2">Action:</span>
                    <span className="text-white font-black">
                        {promptData.action}
                    </span>
                </div>
            )}

            {/* CAMERA */}
            {promptData.camera && (
                <div className="bg-slate-900/50 rounded px-3 py-2 text-left leading-relaxed">
                    <span className="font-black uppercase tracking-widest text-slate-500 mr-2">Camera:</span>
                    <span className="text-purple-400 font-black italic">
                        {promptData.camera}
                    </span>
                </div>
            )}

            {/* PROPS / OBJETOS */}
            {promptData.propsPrompt && (
                <div className="bg-amber-500/10 rounded px-3 py-2 border border-amber-500/20 text-left leading-relaxed">
                    <span className="font-black uppercase tracking-widest text-amber-500/70 mr-2">Object:</span>
                    <span className="text-amber-500 font-bold">
                        {promptData.propsPrompt}
                    </span>
                </div>
            )}

            {/* CENARIO / LOCATION */}
            {(promptData.cenario || promptData.locationDescription) && (
                <div className="bg-slate-900/50 rounded px-3 py-2 text-left leading-relaxed">
                    <span className="font-black uppercase tracking-widest text-slate-500 mr-2">Cenário:</span>
                    <span className="text-emerald-400 font-bold">
                        {promptData.cenario || promptData.locationDescription}
                    </span>
                </div>
            )}

             {/* VISUAL INTEGRITY (Fallback if negative is raw text, otherwise hardcoded to visual check) */}
             <div className="bg-slate-900/50 rounded px-3 py-2 text-left leading-relaxed border-t border-slate-800/50 mt-1">
                 <span className="font-black uppercase tracking-widest text-slate-500 mr-2">Visual Integrity:</span>
                 <span className="text-rose-400 font-bold italic">
                     "Pure image only: all surfaces are blank and free of any text or letters."
                 </span>
             </div>

            {/* RAW FULL PROMPT FALLBACK (Visualizar a string completa montada) */}
            {promptData.finalPrompt && (
                <div className="w-full mt-3 pt-3 border-t border-white/5 relative group/prompt bg-black/20 p-2 rounded-lg">
                    <span className="text-slate-400 font-mono text-[9px] block pr-10 break-words leading-relaxed" title="Payload Completo enviado à API">
                        {promptData.finalPrompt}
                    </span>
                    <button
                        onClick={handleCopy}
                        className="absolute right-2 top-3 p-1.5 bg-brand-500/10 text-brand-400 rounded-md opacity-0 group-hover/prompt:opacity-100 transition-opacity hover:bg-brand-500 hover:text-white"
                        title="Copiar prompt completo"
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                </div>
            )}
            
            <button onClick={() => setIsExpanded(false)} className="mt-2 text-[9px] font-black uppercase text-slate-500 hover:text-white transition-colors text-center py-2 bg-slate-900/50 rounded-lg flex items-center justify-center gap-1 border border-slate-800">
                Ocultar Blocos Detalhados
            </button>
        </div>
    );
};
