
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

    const handleCopy = () => {
        if (promptData?.finalPrompt) {
            navigator.clipboard.writeText(promptData.finalPrompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!promptData) return <span className="text-slate-500 italic">Sem prompt disponível.</span>;

    return (
        <div className={`leading-relaxed whitespace-pre-wrap flex flex-wrap gap-x-1.5 gap-y-1 relative ${className}`}>
            {/* MEDIUM - Estilo Base */}
            {(promptData.medium) && (
                <span className="text-amber-400 font-black uppercase tracking-tighter" title="Meio/Técnica">
                    {promptData.medium}
                </span>
            )}

            {/* SUBJECT / CHARACTER */}
            {(promptData.subject || promptData.characterDescription) && (
                <span className="text-fuchsia-400 font-bold" title="Sujeito/Personagem">
                    {promptData.subject || promptData.characterDescription}
                </span>
            )}

            {/* ACTION */}
            {promptData.action && (
                <span className="text-white font-black bg-white/10 px-1 rounded shadow-sm" title="Ação da Cena">
                    {promptData.action}
                </span>
            )}

            {/* CENARIO / LOCATION */}
            {(promptData.cenario || promptData.locationDescription) && (
                <span className="text-emerald-400 font-bold" title="Cenário">
                    {promptData.cenario || promptData.locationDescription}
                </span>
            )}

            {/* STYLE */}
            {promptData.style && (
                <span className="text-sky-400 font-bold" title="Estilo Visual">
                    {promptData.style}
                </span>
            )}

            {/* CAMERA */}
            {promptData.camera && (
                <span className="text-purple-400 font-black italic" title="Câmera/Lente">
                    {promptData.camera}
                </span>
            )}

            {/* PROPS / OBJETOS */}
            {promptData.propsPrompt && (
                <span className="text-amber-500 font-bold bg-amber-500/10 px-2 rounded border border-amber-500/20" title="Objetos Adicionais">
                    {promptData.propsPrompt}
                </span>
            )}

            {/* RAW FULL PROMPT FALLBACK (Visualizar a string completa montada) */}
            {promptData.finalPrompt && (
                <div className="w-full mt-2 pt-2 border-t border-white/5 relative group/prompt">
                    <span className="text-slate-300 font-mono text-[11px] block pr-10 break-words leading-relaxed" title="Payload Completo enviado à API">
                        {promptData.finalPrompt}
                    </span>
                    <button
                        onClick={handleCopy}
                        className="absolute right-0 top-2 p-1.5 bg-brand-500/10 text-brand-400 rounded-md opacity-0 group-hover/prompt:opacity-100 transition-opacity hover:bg-brand-500 hover:text-white"
                        title="Copiar prompt completo"
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                </div>
            )}

            {/* NEGATIVE */}
            {promptData.negative && (
                <span className="hidden text-rose-500 italic font-bold w-full mt-1 pt-1 border-t border-white/5 text-[9px]" title="Filtro Negativo">
                    NEGATIVO: {promptData.negative}
                </span>
            )}
        </div>
    );
};
