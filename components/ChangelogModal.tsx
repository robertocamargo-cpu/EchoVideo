
import React from 'react';
import { X, Calendar, Clock, GitCommit } from 'lucide-react';

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface LogEntry {
    version: string;
    date: string;
    time: string;
    changes: string[];
}

const getCurrentDateTime = () => {
    const now = new Date();
    return {
        date: now.toLocaleDateString('pt-BR'),
        time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
};

const LOGS: LogEntry[] = [
    {
        version: "v1.9.89",
        date: getCurrentDateTime().date,
        time: getCurrentDateTime().time,
        changes: [
            "UI/UX: Otimização extrema da altura do painel flutuante de direção e botões reposicionados junto às abas de navegação principal, liberando mais espaço visual na tela.",
            "Prompt AI: Diretriz rigorosa estabelecida para IAs contornarem os bloqueios de copyright utilizando apelidos de disfarces totalmente fonéticos (ex: 'REED' vira 'RIDI', 'MARC' vira 'MARQUI')."
        ]
    },
    {
        version: "v1.9.88",
        date: getCurrentDateTime().date,
        time: getCurrentDateTime().time,
        changes: [
            "UI/UX: Menu de direção e renderização agora é flutuante (sticky) para acompanhar projetos longos.",
            "Exportação em Massa ZIP: Geração de arquivo CSV, Prompts de Imagem (TXT), Ideias de Animação (TXT) e Áudio Original agora integrados dentro do mesmo ZIP das imagens.",
            "Proteção de Prompts (Personagens): Implementação do sistema de 'Apelidos', ocultando nomes reais durante a criação em inglês para evitar bloqueios de Copyright.",
            "Navegação Rápida: Adição das setas de avanço/retorno no ImageViewer para ler e navegar entre cenas facilmente."
        ]
    },
    {
        version: "v1.9.87",
        date: getCurrentDateTime().date,
        time: getCurrentDateTime().time,
        changes: [
            "Arquitetura de Prompt: Nova exportação em formato de Blocos ('Estilo de Imagem:', 'Subject:', 'Action:', etc) separados por pontos finais.",
            "Consistência Absoluta: Trava rígida implementada no Prompt Mestre exigindo a anatomia literal obrigatória de Personagens (Character Tokens) e Cenários (Scenario Blocks).",
            "Visual Integrity: Adição de tag protetora contra letras/alfabetos no motor final de prompt para polir a geração de imagens puras.",
            "Exportação TXT: Prompt organizado em parágrafos segmentados e limpos."
        ]
    },
    {
        version: "v1.9.86",
        date: "04/03/2026",
        time: "15:00",
        changes: [
            "Correção de Bug: Botão de redesenhar personagens agora funcional.",
            "Character Tokens: Nova lógica de geração focada puramente em descrição física para consistência absoluta.",
            "Scenario Tokens: Nova lógica de cenários estruturais em 6 pontos (Ancoragem, Materiais, Iluminação, etc).",
            "Injeção Inteligente: Cenários e Personagens são injetados automaticamente no prompt final de imagem para manter a identidade visual em todo o projeto.",
            "Otimização de Vídeo: Placeholder visual para cenas sem imagem carregada, eliminando a sensação de 'travamento'."
        ]
    },
    {
        version: "v1.9.39",
        date: "28/03/2024",
        time: "10:00",
        changes: [
            "Resolução de Identidade: O sistema agora substitui automaticamente pronomes como 'ele/ela' pelos nomes reais dos personagens no prompt de imagem.",
            "Detecção de Contexto: Melhoria na detecção de personagens e cenários mencionados no texto da cena.",
            "Correção de Prompt: Cabeçalhos estruturados para separar Ação, Estilo e Personagens no prompt enviado à IA."
        ]
    }
];

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-slate-950 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-2xl max-h-[80vh] flex flex-col relative overflow-hidden">
                <div className="p-6 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <GitCommit size={24} className="text-brand-400" /> Changelog
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">Histórico de atualizações e melhorias do echoVID.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="space-y-8">
                        {LOGS.map((log, index) => (
                            <div key={index} className="relative pl-8 border-l border-slate-800 last:border-0 pb-2">
                                <div className={`absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full ${index === 0 ? 'bg-brand-500 shadow-[0_0_8px_rgba(14,165,233,0.6)]' : 'bg-slate-700'}`}></div>
                                <div className="flex flex-col gap-2 mb-4">
                                    <div className="flex items-center gap-3">
                                        <span className={`text-lg font-bold ${index === 0 ? 'text-white' : 'text-slate-400'}`}>{log.version}</span>
                                        {index === 0 && <span className="bg-brand-900/30 text-brand-400 text-[10px] font-bold px-2 py-0.5 rounded border border-brand-500/30">LATEST</span>}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                                        <span className="flex items-center gap-1"><Calendar size={12} /> {log.date}</span>
                                        <span className="flex items-center gap-1"><Clock size={12} /> {log.time}</span>
                                    </div>
                                </div>
                                <ul className="space-y-2">
                                    {log.changes.map((change, i) => (
                                        <li key={i} className="text-sm text-slate-300 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-slate-600">
                                            {change}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="p-4 border-t border-slate-800 bg-slate-900 text-center">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};
