

import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Plus, Trash2, Type, Palette, Edit2, Zap, Shield, Wand2, Target, Save, Monitor, Key, Globe, ExternalLink, Loader2 } from 'lucide-react';
import { AppSettings, SubtitleStyleOption, ImageStyleOption, MotionEffect } from '../types';
import { getApiInfrastructure } from '../services/geminiService';
import { getImageStylePrompts, getSubtitlePresets, getMotionEffects, saveImageStylePromptsBatch, saveSubtitlePresetsBatch, saveMotionEffectsBatch, saveSettingsToDB, deleteImageStylePrompt, deleteSubtitlePreset, deleteMotionEffect } from '../services/storageService';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onSave: (newSettings: AppSettings) => void;
}

export const DEFAULT_SETTINGS: AppSettings = {
    transcriptionPrompt: `🧠 MASTER PROMPT — AUDIO-TEXT SYNCHRONIZATION ENGINE
    Divide this audio into scenes FOLLOWING THE DIRECTOR'S RULE.
    
    Duração e Ritmo (Cinematográfico):
    - Sweet Spot: 8.0 seconds per scene.
    - Range: 5.0s (min) to 10.0s (max).
    - HEURISTIC FOR SEGMENTATION (The Director's Rule):
      1. PRIMARY ANCHOR: Always try to end a scene at a full stop (.) between 6s and 10s.
      2. SECONDARY ANCHOR: If no full stop exists, split at the nearest comma (,) or breath between 5s and 10s.
      3. EMERGENCY CUT: If no punctuation exists by 10s, YOU MUST force a cut exactly at 8.0s. Change the ACTION/CAMERA entirely.
      4. NEVER exceed 10.0s. It is better to have a dry cut than a boring scene.
    
    🗣️ FIELD RULES (STRICT, 'subject', 'action', 'cenario', 'props', and 'animation' MUST be in ENGLISH ONLY):
    - action: The ONLY creative field. Make the action intensely cinematic. Use Conceptual Surrealism or Magical Realism as the core aesthetic. 
    - subject: ONE SINGLE FLUID PARAGRAPH (English ONLY). Follow the ANATOMY PROTOCOL: Archetype, Facial Features (detailed for real figures, NO names), Hair, Face/Skin, Upper/Lower Clothing, Footwear, Accessories. NO LABELS.
    - cenario: ONE SINGLE DENSE PARAGRAPH (English ONLY). Follow THE MASTER SCENARIO BLOCK: 1. Structure/Limits (Skeleton), 2. Fixed Anchors with positions, 3. Materials/Textures, 4. Lighting/Colors. LITERAL descriptions only, NO metaphors.
    - camera: Pick a camera angle from: [Wide shot, Close-up, Low angle, Eye level, Bird's eye view, Dutch angle]. YOU MUST VARY THE CAMERA ANGLE WILDLY!
    - animation: Create a UNIQUE and CREATIVE animation concept for this specific scene. DO NOT use technical names like "Zoompan". Instead, describe a visual idea (e.g., "The camera floats through the dust motes like a silent ghost", "Time slows down as the character rotates in a frozen sunset").
    - NO PLACEHOLDERS: NEVER use "(continua)", "(pausa)", or empty strings for the 'text' field.
    - NO METADATA IN TEXT: The 'text' field MUST contain ONLY the spoken words. NEVER include system instructions, labels, or technical markers (e.g., "Densidade", "Scene X") inside it.
    - DO NOT SKIP TEXT: You must transcribe 100% of the spoken text.
    - SYNC PARAMOUNT: Timestamps MUST match reality perfectly.
    
    Return JSON: { items: [...] } following the TranscriptionResponse schema.`,

    effectsPrompt: `Efeito Ken Burns: Aplica movimentos suaves baseados na paridade da cena.`,

    titlesPrompt: `ATUE COMO: Um Copywriter de Elite para YouTube, especialista em Psicologia do Clique e Retenção Visual. Sua especialidade é unir a estética de autoridade do canal "O Primo Rico" (High-End Business) com as táticas de CTR agressivo dos maiores YouTubers do mundo.
SUA TAREFA: Analisar o roteiro/tema fornecido e gerar 10 títulos únicos de alta conversão, otimizados para dispositivos móveis e baseados em dados de impacto real.

⚠️ REGRAS OBRIGATÓRIAS DE ESTRUTURA (VISUAL):
- A Regra dos 50 Caracteres (Front-Loading): A "Isca" e as palavras-chave principais devem estar nos primeiros 50 caracteres.
- Formatação de Impacto: Coloque em NEGRITO apenas os primeiros ~50 caracteres (a zona que aparece no celular). O restante (SEO/Contexto) fica normal.
- Tamanho Ideal: Mantenha o título total em torno de 90 caracteres para maximizar o SEO sem ser cortado.
- Uso de Elementos Visuais: Utilize colchetes [ ] ou parênteses ( ) para adicionar contexto ou provas sociais.
- Números de Precisão: Use números ímpares ou valores exatos (ex: R$ 4.502,31 em vez de "quase 5 mil").
- Power Words (Dica Extra): Sempre que possível, inclua termos como: O Fim, O Erro, Invisível, Bilionário, O Plano, 24 horas, Proibido.

🧠 MATRIZ DE GATILHOS (GERAR UM PARA CADA):
1. O Erro Fatal | 2. A Lacuna de Curiosidade | 3. O Valor do Prejuízo/Lucro | 4. A Transformação Temporal | 5. O Segredo Revelado | 6. A Lição do Bilhão | 7. Autoridade Emprestada | 8. Urgência Negativa | 9. Desafio Impossível | 10. O Atalho Técnico.

📋 FORMATO DA ENTREGA:
Título: [Impacto Inicial em Negrito: Contexto e SEO normal]
Gatilho & Lógica: [Explicação do gatilho]
Sugestão de Thumbnail:
Visual: [Descrição da cena]
Texto na Imagem: [2 a 3 palavras]

🏁 TESTE A/B FINAL:
Escolha os 2 melhores candidatos e justifique por que eles teriam o CTR mais alto.`,

    items: [
        { 
            id: 'disney', 
            label: 'Disney / Pixar (3D)', 
            prompt: '3D animated feature film style, stylized character design, vibrant colors, warm soft lighting, subsurface scattering, smooth textures, clean shapes, polished cinematic render, high detail.' 
        },
        { 
            id: 'ultrarealistic', 
            label: 'Ultra-realista', 
            prompt: 'Ultra-realistic photography, 35mm lens, shallow depth of field, highly detailed skin texture, natural lighting, soft shadows, realistic colors, photographic realism, high detail.' 
        },
        { 
            id: 'cinematic', 
            label: 'Cinemático Dramático', 
            prompt: 'Cinematic film still, anamorphic lens look, teal and orange color grading, volumetric haze, rim lighting, controlled contrast, shallow depth of field, high production value, detailed image.' 
        },
        { 
            id: 'papercut', 
            label: 'Paper Cut (Arte em Papel)', 
            prompt: 'Layered paper cut art, multi-layered cutout shapes, handcrafted diorama look, visible paper texture, soft diffuse lighting, pastel color palette, clean edges, strong depth separation.' 
        },
        { 
            id: 'sketch', 
            label: 'Sketch (Lápis)', 
            prompt: 'Traditional graphite pencil sketch, monochromatic greyscale, visible paper grain, cross-hatching shading, rough hand-drawn strokes, unfinished edges, natural sketch texture.' 
        },
        { 
            id: 'noir', 
            label: 'Noir Graphic Novel', 
            prompt: 'Noir graphic novel style, stark high-contrast black and white, deep shadows, heavy ink outlines, strong chiaroscuro, gritty texture, minimal selective yellow accent only, black, grey and white dominant palette, no red accents.' 
        },
        { 
            id: 'stickman', 
            label: 'Stickman (Palito)', 
            prompt: 'Minimalist stickman illustration, thin black lines, flat simple shapes, light blue background, subtle light purple accents, clean composition, no shadows, no 3D, whiteboard explainer look.' 
        },
        { 
            id: 'goldenage', 
            label: 'Golden Age (Vintage 40/50)', 
            prompt: 'Vintage Golden Age comic style, Ben-Day dots, CMYK offset print look, aged yellowed paper texture, retro 1940s to 1950s aesthetic, bold primary colors, slightly worn print finish, simple backgrounds.' 
        },
        { 
            id: 'hqcartoon', 
            label: 'HQ Cartoon', 
            prompt: 'Western comic book style, bold black outlines, vibrant flat colors, dynamic cel shading, halftone texture, expressive character design, detailed inking, clean graphic finish, 1990s animation influence.' 
        },
        { 
            id: 'ligneclaire', 
            label: 'Ligne Claire (Franco-Belga)', 
            prompt: 'Ligne Claire comic style, clear line art, uniform line weight, flat vivid colors, no hatching, clean backgrounds, minimal shadows, precise architectural details.' 
        }
    ],
    subtitleStyles: [
        {
            id: 'horizontal-16-9',
            label: 'HORIZONTAL (16:9)',
            maxWordsPerLine: 4,
            fontSize: 40,
            fontFamily: 'Montserrat ExtraBold',
            fontWeight: '900',
            textColor: '#FFD700',  // Amarelo
            strokeColor: '#000000',  // Preto
            strokeWidth: 7,  // 7%
            shadowColor: '#000000',  // Preto
            shadowBlur: 12,  // Média de 10-15 (estilo suave)
            shadowOpacity: 0.6,  // 60%
            shadowDistance: 6,  // Média de 5-8
            shadowAngle: 111,
            padding: 20,
            yPosition: 75,  // 75% - rodapé
            isBold: true,
            isItalic: false,
            textCasing: 'uppercase'
        },
        {
            id: 'vertical-9-16',
            label: 'VERTICAL (9:16)',
            maxWordsPerLine: 3,
            fontSize: 45,
            fontFamily: 'The Bold Font',
            fontWeight: '900',
            textColor: '#FFFFFF',  // Branco (não especificado, usando padrão)
            strokeColor: '#000000',  // Preto
            strokeWidth: 7,  // 7%
            shadowColor: '#000000',  // Preto
            shadowBlur: 0,  // Zero (estilo sticker/dura)
            shadowOpacity: 1.0,  // 100% sólida
            shadowDistance: 6,
            shadowAngle: 111,
            padding: 10,
            yPosition: 60,  // 60% - levemente abaixo do centro
            isBold: true,
            isItalic: false,
            textCasing: 'uppercase'
        }
    ],
    stickmanStyle: '',
    disneyStyle: '',
    audioChunkDuration: 1,
    aspectRatio: '16:9',
    imageGenerationStrategy: 'gemini-preferred'
};

type TabType = 'styles' | 'subtitles' | 'effects' | 'titles' | 'api';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
    const [activeTab, setActiveTab] = useState<TabType>('styles');
    const [apiStatus, setApiStatus] = useState<'STANDARD' | 'PREMIUM'>('STANDARD');
    const [motionEffects, setMotionEffects] = useState<MotionEffect[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadDataFromDatabase();
            checkApi();
        }
    }, [settings, isOpen]);

    const loadDataFromDatabase = async () => {
        try {
            // Carregar estilos de imagem
            const styles = await getImageStylePrompts();

            // Carregar presets de legendas
            const subtitles = await getSubtitlePresets();

            // Carregar efeitos de movimento
            const effects = await getMotionEffects();

            // Remover estilos duplicados verificando o nome (label)
            const uniqueStyles = styles.filter((v, i, a) => a.findIndex(t => (t.label === v.label)) === i);

            setLocalSettings(prev => ({
                ...prev,
                items: uniqueStyles.length > 0 ? uniqueStyles : prev.items,
                subtitleStyles: subtitles.length > 0 ? subtitles : prev.subtitleStyles,
            }));

            setMotionEffects(effects);
        } catch (error) {
            console.error('Erro ao carregar dados do banco:', error);
            setLocalSettings({ ...DEFAULT_SETTINGS, ...settings });
        }
    };

    const checkApi = async () => {
        const info = await getApiInfrastructure();
        setApiStatus(info.isPremium ? 'PREMIUM' : 'STANDARD');
    };

    const handleOpenKey = async () => {
        if (!window.aistudio?.openSelectKey) {
            alert('Esta funcionalidade está disponível apenas quando o app está rodando no AI Studio.');
            return;
        }
        await window.aistudio.openSelectKey();
        // Wait a bit for the key to be set, then check again
        setTimeout(async () => {
            await checkApi();
        }, 500);
    };
    const handleAddStyle = () => {
        const id = `style_${Date.now()}`;
        const newStyle: ImageStyleOption = {
            id,
            label: 'Novo Estilo',
            prompt: 'Descreva o estilo aqui...'
        };
        setLocalSettings(prev => ({ ...prev, items: [...prev.items, newStyle] }));
    };

    const handleDeleteStyle = async (id: string) => {
        if (!window.confirm('Excluir este estilo permanentemente?')) return;
        setLocalSettings(prev => ({ ...prev, items: prev.items.filter(s => s.id !== id) }));
        await deleteImageStylePrompt(id);
    };

    const handleAddSubtitlePreset = () => {
        const id = `preset_${Date.now()}`;
        const newPreset: SubtitleStyleOption = {
            ...DEFAULT_SETTINGS.subtitleStyles[0],
            id,
            label: 'Novo Preset',
        };
        setLocalSettings(prev => ({ ...prev, subtitleStyles: [...prev.subtitleStyles, newPreset] }));
    };

    const handleDeleteSubtitlePreset = async (id: string, label: string) => {
        if (!window.confirm(`Excluir o preset "${label}" permanentemente?`)) return;
        setLocalSettings(prev => ({ ...prev, subtitleStyles: prev.subtitleStyles.filter(s => s.id !== id) }));
        await deleteSubtitlePreset(id);
    };

    const handleAddMotionEffect = () => {
        const id = `effect_${Date.now()}`;
        const newEffect: MotionEffect = {
            id,
            name: 'Novo Efeito',
            description: 'Uso recomendado...',
            instruction: 'Instrução para a IA...'
        };
        setMotionEffects(prev => [...prev, newEffect]);
    };

    const handleDeleteMotionEffect = async (id: string, name: string) => {
        if (!window.confirm(`Excluir o efeito "${name}" permanentemente?`)) return;
        setMotionEffects(prev => prev.filter(e => e.id !== id));
        await deleteMotionEffect(id);
    };

    const handleCloseAndSave = async () => {
        setIsSaving(true);
        try {
            // Salvar configurações gerais no estado do app
            onSave(localSettings);

            // Salvar em lote no banco de dados para máxima performance
            // Usamos Promise.all para disparar todas as atualizações simultaneamente
            await Promise.all([
                saveSettingsToDB(localSettings),
                saveImageStylePromptsBatch(localSettings.items),
                saveSubtitlePresetsBatch(localSettings.subtitleStyles),
                saveMotionEffectsBatch(motionEffects)
            ]);

            onClose();
        } catch (error) {
            console.error("Erro ao salvar configurações:", error);
            alert("Houve um erro ao salvar algumas configurações. Por favor, verifique sua conexão.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateSubtitle = (id: string, field: keyof SubtitleStyleOption, value: any) => {
        setLocalSettings(prev => ({
            ...prev,
            subtitleStyles: prev.subtitleStyles.map(s => s.id === id ? { ...s, [field]: value } : s)
        }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-slate-950 rounded-[2.5rem] border border-slate-800 w-full max-w-6xl h-[90vh] flex overflow-hidden flex-col shadow-2xl">
                <div className="p-8 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/40">
                    <div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-tighter italic">Painel <span className="text-brand-400">Master</span></h1>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1">Configuração de Engine v7.5.0</p>
                    </div>
                    <button
                        onClick={handleCloseAndSave}
                        disabled={isSaving}
                        className="p-3 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative"
                    >
                        {isSaving ? (
                            <Loader2 className="animate-spin text-brand-400" size={28} />
                        ) : (
                            <X size={28} />
                        )}
                        {isSaving && (
                            <span className="absolute -bottom-8 right-0 text-[8px] font-black uppercase text-brand-400 tracking-widest whitespace-nowrap animate-pulse">
                                Salvando...
                            </span>
                        )}
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    <div className="w-72 bg-slate-900/20 border-r border-slate-800">
                        <nav className="p-5 space-y-2">
                            {[
                                { id: 'styles', label: 'Estilos de Imagem', icon: Palette },
                                { id: 'subtitles', label: 'Legendas', icon: Type },
                                { id: 'effects', label: 'EFEITOS', icon: Zap },
                                { id: 'titles', label: 'Engenharia CTR', icon: Target },
                                { id: 'api', label: 'Infraestrutura', icon: Shield },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabType)}
                                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-xs font-black uppercase tracking-[0.15em] transition-all ${activeTab === tab.id ? 'bg-brand-500 text-white shadow-xl shadow-brand-500/20' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-200'}`}
                                >
                                    <tab.icon size={18} />
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-slate-950">
                        {activeTab === 'api' && (
                            <div className="space-y-12 animate-in slide-in-from-bottom-4">
                                <div className="flex items-center gap-3 text-brand-400"><Shield size={24} /><h3 className="font-black uppercase tracking-widest text-white italic">Conexão & Cloud Bridge</h3></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] space-y-6">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Status da Chave</span>
                                            <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${apiStatus === 'PREMIUM' ? 'bg-green-500/10 text-green-500' : 'bg-brand-500/10 text-brand-400'}`}>
                                                {apiStatus}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-xl font-black text-white">Gemini Pro Infra</h4>
                                            <p className="text-xs text-slate-500 leading-relaxed">Infraestrutura paga para acesso sem limites a modelos Veo e Imagen 4.</p>
                                        </div>
                                        {typeof window !== 'undefined' && window.aistudio?.openSelectKey ? (
                                            <button onClick={handleOpenKey} className="w-full py-4 bg-brand-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 hover:bg-brand-400 transition-all">
                                                <Key size={16} /> Gerenciar Chave API
                                            </button>
                                        ) : (
                                            <div className="space-y-4">
                                                {apiStatus === 'PREMIUM' ? (
                                                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                                                        <p className="text-xs text-green-200 leading-relaxed">
                                                            <strong>✓ Chave Configurada:</strong> Sua chave API está ativa no arquivo <code className="bg-slate-950 px-2 py-1 rounded">.env.local</code>
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                                                            <p className="text-xs text-yellow-200 leading-relaxed">
                                                                <strong>Rodando Localmente:</strong> Configure sua chave API no arquivo <code className="bg-slate-950 px-2 py-1 rounded">.env.local</code>
                                                            </p>
                                                        </div>
                                                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-[10px] text-slate-400">
                                                            <div>GEMINI_API_KEY=sua_chave_aqui</div>
                                                        </div>
                                                    </>
                                                )}
                                                <a
                                                    href="https://aistudio.google.com/apikey"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-full py-4 bg-brand-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 hover:bg-brand-400 transition-all"
                                                >
                                                    <ExternalLink size={16} /> {apiStatus === 'PREMIUM' ? 'Ver Chaves API' : 'Obter Chave API'}
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                    <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] space-y-4">
                                        <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Documentação Billing</h4>
                                        <p className="text-xs text-slate-400">É necessário projeto com faturamento ativo no Google Cloud Console.</p>
                                        <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-brand-400 hover:text-white transition-colors text-xs"><ExternalLink size={12} /> ai.google.dev/gemini-api/docs/billing</a>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'styles' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-brand-400">
                                        <Palette size={24} />
                                        <h3 className="font-black uppercase tracking-widest text-white italic">Catálogo de Estilos IA</h3>
                                    </div>
                                    <button onClick={handleAddStyle} className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all">
                                        <Plus size={16} />
                                        Novo Estilo
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    {localSettings.items.map((style) => (
                                        <div key={style.id} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
                                            <div className="flex justify-between items-start gap-4">
                                                <input value={style.label} onChange={(e) => {
                                                    const newItems = localSettings.items.map(s => s.id === style.id ? { ...s, label: e.target.value } : s);
                                                    setLocalSettings({ ...localSettings, items: newItems });
                                                }} className="bg-transparent text-white font-black uppercase text-sm flex-1 outline-none" />
                                                <div className="flex gap-2">
                                                    <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-brand-400 transition-all">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteStyle(style.id)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-all">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            <textarea value={style.prompt} onChange={(e) => {
                                                const newItems = localSettings.items.map(s => s.id === style.id ? { ...s, prompt: e.target.value } : s);
                                                setLocalSettings({ ...localSettings, items: newItems });
                                            }} className="w-full h-24 bg-slate-950 border border-slate-800 rounded-xl p-4 text-[11px] font-mono text-slate-500 outline-none" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {activeTab === 'subtitles' && (
                            <div className="space-y-8">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-brand-400">
                                        <Type size={24} />
                                        <h3 className="font-black uppercase tracking-widest text-white italic">Calibração de Legendas</h3>
                                    </div>
                                    <button onClick={handleAddSubtitlePreset} className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all">
                                        <Plus size={16} />
                                        Novo Preset
                                    </button>
                                </div>
                                {localSettings.subtitleStyles.map((sub) => (
                                    <div key={sub.id} className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] space-y-6">
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-white font-black uppercase text-sm italic">{sub.label}</h4>
                                            <div className="flex gap-2">
                                                <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-brand-400 transition-all">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => handleDeleteSubtitlePreset(sub.id, sub.label)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-all">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                            {/* Campos Básicos */}
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Tamanho</label>
                                                <input type="number" value={sub.fontSize} onChange={e => handleUpdateSubtitle(sub.id, 'fontSize', parseInt(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs outline-none" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Limite Palavras</label>
                                                <input type="number" value={sub.maxWordsPerLine} onChange={e => handleUpdateSubtitle(sub.id, 'maxWordsPerLine', parseInt(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs outline-none" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Posição Y (%)</label>
                                                <input type="number" value={sub.yPosition} onChange={e => handleUpdateSubtitle(sub.id, 'yPosition', parseInt(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs outline-none" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Cor Texto</label>
                                                <input type="color" value={sub.textColor} onChange={e => handleUpdateSubtitle(sub.id, 'textColor', e.target.value)} className="w-full h-10 bg-slate-950 border border-slate-800 rounded-xl outline-none" />
                                            </div>

                                            {/* Campo Fonte */}
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Fonte</label>
                                                <input type="text" value={sub.fontFamily} onChange={e => handleUpdateSubtitle(sub.id, 'fontFamily', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs outline-none" />
                                            </div>

                                            {/* Campos de Contorno */}
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Cor Contorno</label>
                                                <input type="color" value={sub.strokeColor} onChange={e => handleUpdateSubtitle(sub.id, 'strokeColor', e.target.value)} className="w-full h-10 bg-slate-950 border border-slate-800 rounded-xl outline-none" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Espessura Contorno (%)</label>
                                                <input type="number" value={sub.strokeWidth} onChange={e => handleUpdateSubtitle(sub.id, 'strokeWidth', parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs outline-none" />
                                            </div>

                                            {/* Campos de Sombra Detalhada */}
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Cor Sombra</label>
                                                <input type="color" value={sub.shadowColor} onChange={e => handleUpdateSubtitle(sub.id, 'shadowColor', e.target.value)} className="w-full h-10 bg-slate-950 border border-slate-800 rounded-xl outline-none" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Opacidade Sombra (%)</label>
                                                <input type="number" min="0" max="100" value={Math.round(sub.shadowOpacity * 100)} onChange={e => handleUpdateSubtitle(sub.id, 'shadowOpacity', (parseFloat(e.target.value) || 0) / 100)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs outline-none" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Distância Sombra</label>
                                                <input type="number" value={sub.shadowDistance} onChange={e => handleUpdateSubtitle(sub.id, 'shadowDistance', parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs outline-none" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Desfoque Sombra</label>
                                                <input type="number" value={sub.shadowBlur} onChange={e => handleUpdateSubtitle(sub.id, 'shadowBlur', parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs outline-none" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Ângulo Sombra (°)</label>
                                                <input type="number" min="0" max="360" value={sub.shadowAngle} onChange={e => handleUpdateSubtitle(sub.id, 'shadowAngle', parseInt(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs outline-none" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {activeTab === 'effects' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-brand-400">
                                        <Zap size={24} />
                                        <h3 className="font-black uppercase tracking-widest text-white italic">
                                            Biblioteca de Efeitos Cinematográficos
                                        </h3>
                                    </div>
                                    <button onClick={handleAddMotionEffect} className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all">
                                        <Plus size={16} />
                                        Novo Efeito
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {motionEffects.map((effect) => (
                                        <div key={effect.id} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
                                            <div className="flex justify-between items-start gap-4">
                                                <input
                                                    value={effect.name}
                                                    onChange={(e) => {
                                                        const newEffects = motionEffects.map(eff =>
                                                            eff.id === effect.id ? { ...eff, name: e.target.value } : eff
                                                        );
                                                        setMotionEffects(newEffects);
                                                    }}
                                                    className="bg-transparent text-white font-black uppercase text-sm flex-1 outline-none italic"
                                                />
                                                <div className="flex gap-2">
                                                    <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-brand-400 transition-all">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteMotionEffect(effect.id, effect.name)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-all">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                                        Aplicação
                                                    </label>
                                                    <input
                                                        value={effect.description}
                                                        onChange={(e) => {
                                                            const newEffects = motionEffects.map(eff =>
                                                                eff.id === effect.id ? { ...eff, description: e.target.value } : eff
                                                            );
                                                            setMotionEffects(newEffects);
                                                        }}
                                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-400 outline-none mt-1"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                                        Instrução Técnica
                                                    </label>
                                                    <textarea
                                                        value={effect.instruction}
                                                        onChange={(e) => {
                                                            const newEffects = motionEffects.map(eff =>
                                                                eff.id === effect.id ? { ...eff, instruction: e.target.value } : eff
                                                            );
                                                            setMotionEffects(newEffects);
                                                        }}
                                                        className="w-full h-24 bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 font-mono outline-none mt-1"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {activeTab === 'titles' && (
                            <div className="space-y-6 h-full flex flex-col">
                                <div className="flex items-center gap-3 text-brand-400"><Target size={24} /><h3 className="font-black uppercase tracking-widest text-white italic">Engenharia CTR Pro</h3></div>
                                <textarea value={localSettings.titlesPrompt} onChange={(e) => setLocalSettings({ ...localSettings, titlesPrompt: e.target.value })} className="w-full flex-1 bg-slate-900 border border-slate-800 rounded-3xl p-8 text-xs font-mono text-slate-400 outline-none" />
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};
