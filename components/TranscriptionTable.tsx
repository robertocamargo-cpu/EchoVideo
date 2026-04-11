
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Clapperboard, Download, Edit3, FileArchive, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, MapPin, Monitor, Play, PlayCircle, RefreshCw, Sparkles, Square, Type, Upload, Users, Video, X, Zap, Ban, Activity, Wallet, Target, Layers, Video as VideoIcon, HelpCircle, Box, Plus, Trash2, AlertTriangle, Clock, AlertCircle, MonitorPlay, Terminal, Copy, Cpu } from 'lucide-react';
import { TranscriptionItem, AppSettings, TransitionType, ViralTitle, MasterAsset, MotionEffect, RenderEngine } from '../types';
import { db } from '../services/firebaseClient';
import { onSnapshot, doc as fireDoc } from 'firebase/firestore';
import { generateImage, generateViralTitles, getApiInfrastructure, generateText, TEXT_MODEL_NAME, IMAGEN_MODEL_NAME, IMAGE_MODEL_NAME, syncScenesWithAudio } from '../services/geminiService';
import { generatePollinationsImage } from '../services/pollinationsService';
import { logApiCost } from '../services/usageService';
import { generateTimelineVideo, generatePreviewVideo, generatePresetSRT } from '../services/videoService';
import { renderWithFFmpeg } from '../services/ffmpegService';
import { uploadProjectFile, getMotionEffects } from '../services/storageService';
import { TimelineVisual, TimelineVisualHandle } from './TimelineVisual';
import { ImageViewer } from './ImageViewer';
import { ColoredPrompt } from './ColoredPrompt';
import JSZip from 'jszip';

interface TranscriptionTableProps {
    data: TranscriptionItem[];
    onUpdateItem: (index: number, item: Partial<TranscriptionItem>) => void;
    onUpdateAllItems?: (items: TranscriptionItem[]) => void;
    audioFile: File | null;
    audioDuration: number;
    onAudioAttached: (file: File) => void;
    settings: AppSettings;
    onSave: (project: any) => void;
    context: string;
    projectCharacters: MasterAsset[];
    projectLocations: MasterAsset[];
    activeStylePrompt: string;
    onUpdateProjectInfo: (field: 'characters' | 'locations' | 'props', value: MasterAsset[] | ((prev: MasterAsset[]) => MasterAsset[])) => void;
    onUpdateGlobalSetting: (field: keyof AppSettings, value: any) => void;
    projectName?: string;
    projectId?: string;
    projectProps: MasterAsset[];
    selectedStyleId: string;
    onStyleChange: (id: string) => void;
    onForceSave?: () => void;
    project?: any;
    // Estado de renderização persistente (elevado ao App.tsx)
    externalRenderState?: {
        isGenerating: boolean;
        progress: number;
        status: string;
        elapsed: number;
        setIsGenerating: (v: boolean) => void;
        setProgress: (v: number) => void;
        setStatus: (v: string) => void;
        setElapsed: (v: number) => void;
    };
}

type TabMode = 'scenes' | 'characters' | 'locations' | 'props' | 'titles';

export const TranscriptionTable: React.FC<TranscriptionTableProps> = ({
    data, onUpdateItem, onUpdateAllItems, audioFile, audioDuration, settings, onSave, project, context, projectCharacters, projectLocations, projectProps, activeStylePrompt, onUpdateProjectInfo, onUpdateGlobalSetting, projectName = 'projeto-sem-nome', projectId, selectedStyleId, onStyleChange, onForceSave, externalRenderState
}) => {
    const [activeTab, setActiveTab] = useState<TabMode>('scenes');
    // Estado de render: usa o externo (do App.tsx) se fornecido, senão usa local
    const [_isVideoGenerating, _setIsVideoGenerating] = useState(false);
    const [_videoProgress, _setVideoProgress] = useState(0);
    const [_videoStatus, _setVideoStatus] = useState('');
    const [_renderElapsed, _setRenderElapsed] = useState(0);

    const isVideoGenerating = externalRenderState?.isGenerating ?? _isVideoGenerating;
    const setIsVideoGenerating = externalRenderState?.setIsGenerating ?? _setIsVideoGenerating;
    const videoProgress = externalRenderState?.progress ?? _videoProgress;
    const setVideoProgress = externalRenderState?.setProgress ?? _setVideoProgress;
    const videoStatus = externalRenderState?.status ?? _videoStatus;
    const setVideoStatus = externalRenderState?.setStatus ?? _setVideoStatus;
    const renderElapsed = externalRenderState?.elapsed ?? _renderElapsed;
    const setRenderElapsed = externalRenderState?.setElapsed ?? _setRenderElapsed;

    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [showVideoSettings, setShowVideoSettings] = useState(false);
    const [includeSubtitles, setIncludeSubtitles] = useState<boolean>(true);
    const [viewingImageState, setViewingImageState] = useState<{ imageUrl: string, promptData: any, filename: string, sourceIndex?: number, sourceType?: 'scene' | 'thumbnail' } | null>(null);
    const [globalProvider, setGlobalProvider] = useState<'google-nano' | 'google-fast' | 'google-ultra' | 'pollinations' | 'pollinations-zimage'>('google-fast');
    const [generatedTitles, setGeneratedTitles] = useState<ViralTitle[]>([]);
    const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);
    const [generatingThumbnailMap, setGeneratingThumbnailMap] = useState<Record<number, boolean>>({});
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isTimelinePreviewActive, setIsTimelinePreviewActive] = useState(false);
    const [isGeneratingAll, setIsGeneratingAll] = useState(false);
    const [motionEffects, setMotionEffects] = useState<MotionEffect[]>([]);
    const [selectedSubtitlePresetId, setSelectedSubtitlePresetId] = useState<string>('');
    const timelineRef = useRef<TimelineVisualHandle>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [comparisonAsset, setComparisonAsset] = useState<{ asset: MasterAsset, type: 'characters' | 'locations' | 'props' } | null>(null);
    const [isComparing, setIsComparing] = useState(false);
    const [comparisonResults, setComparisonResults] = useState<{ modelId: string, label: string, imageUrl: string, loading: boolean, error?: string }[]>([]);
    const renderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [renderEngine, setRenderEngine] = useState<RenderEngine>('browser');

    const [apiInfo, setApiInfo] = useState<{ type: string, isPremium: boolean }>({ type: 'STANDARD', isPremium: false });

    const bulkAbortRef = useRef<boolean>(false);
    const importInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        refreshApiInfo();
        
        if (renderEngine === 'ffmpeg' && projectId) {
            const unsub = onSnapshot(fireDoc(db, 'projects', projectId), (snap) => {
                const projData = snap.data();
                if (projData?.render_status) {
                    setVideoStatus(projData.render_status.msg || '');
                    setVideoProgress(projData.render_status.progress || 0);
                    if (projData.render_status.progress === 100) {
                        setTimeout(() => setIsVideoGenerating(false), 3000);
                    }
                }
            });
            return () => unsub();
        }
    }, [renderEngine, projectId]);

    useEffect(() => {
        loadMotionEffects();
        return () => {
            if (previewVideoUrl) URL.revokeObjectURL(previewVideoUrl);
            if (videoUrl) URL.revokeObjectURL(videoUrl);
        };
    }, []);

    const refreshApiInfo = async () => {
        const info = await getApiInfrastructure();
        setApiInfo(info);
    };

    const loadMotionEffects = async () => {
        try {
            const effects = await getMotionEffects();
            setMotionEffects(effects);
        } catch (error) {
            console.error('Erro ao carregar efeitos de movimento:', error);
        }
    };

    const totalInvestment = useMemo(() => {
        return data.reduce((acc, item) => acc + (item.imageCost || 0), 0);
    }, [data]);

    const totalDurationSum = useMemo(() => {
        return data.reduce((acc, item) => acc + (item.duration || 0), 0);
    }, [data]);

    const isSyncError = totalDurationSum > (audioDuration + 15.0); // Tolerância relaxada para 15s dados os travamentos de 5s mínimos

    const formatTime = (seconds: number): string => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    const handleDurationChange = (index: number, newDuration: number) => {
        if (!onUpdateAllItems) return;
        const val = Math.max(0.1, newDuration);
        
        const updatedData = [...data];
        updatedData[index] = { ...updatedData[index], duration: val };
        
        // Recalcular toda a cadeia
        let currentStart = 0;
        for (let i = 0; i < updatedData.length; i++) {
            updatedData[i] = {
                ...updatedData[i],
                startSeconds: currentStart,
                endSeconds: currentStart + updatedData[i].duration,
                startTimestamp: formatTime(currentStart),
                endTimestamp: formatTime(currentStart + updatedData[i].duration)
            };
            currentStart = updatedData[i].endSeconds;
        }
        
        onUpdateAllItems(updatedData);
    };



    const handleManualImageUpload = async (index: number, file: File) => {
        if (!projectId) {
            alert("Aviso: Salve o projeto pelo menos uma vez antes de subir imagens manuais para garantir persistência.");
            // Mesmo sem ID, podemos gerar uma URL local temporária se for o caso, 
            // mas o ideal é ter o projectId para subir pro bucket correto.
            const localUrl = URL.createObjectURL(file);
            onUpdateItem(index, { 
                imageUrl: localUrl, 
                importedVideoUrl: file.type.includes('video') ? localUrl : '', 
                importedImageUrl: file.type.includes('image') ? localUrl : '',
                googleImageUrl: '',
                pollinationsImageUrl: ''
            });
            return;
        }
        
        try {
            const publicUrl = await uploadProjectFile(projectId, file, 'image', file.name);
            if (publicUrl) {
                onUpdateItem(index, { 
                    imageUrl: publicUrl, 
                    importedVideoUrl: file.type.includes('video') ? publicUrl : '',
                    importedImageUrl: file.type.includes('image') ? publicUrl : '',
                    googleImageUrl: '',
                    pollinationsImageUrl: ''
                });
                if (onForceSave) onForceSave();
            }
        } catch (error) {
            console.error("Erro no upload manual:", error);
            alert("Falha ao subir imagem.");
        }
    };

    const getPromptData = (index: number, overrideItem?: Partial<TranscriptionItem>) => {
        const item = overrideItem ? { ...data[index], ...overrideItem } : data[index];
        const relevantChars = projectCharacters.filter(c => item.characterIds?.includes(c.id));
        const relevantLocs = projectLocations.filter(l => item.locationIds?.includes(l.id));
        const relevantProps = projectProps.filter(p => item.propIds?.includes(p.id) || (item as any).prop_ids?.includes(p.id));

        // (1) MEDIUM - Override manual > Estilo Global
        const medium = item.medium || (activeStylePrompt ? activeStylePrompt.split(',')[0].trim() : '');

        // (2) SUBJECT - APENAS características físicas dos personagens
        let subject = '';
        if (relevantChars.length > 0) {
            // Prioriza descrições dos assets vinculados
            subject = relevantChars.map(c => c.description).filter(Boolean).join(", ");
        }
        
        // Se o subject manual tiver algo que não está na descrição (e respeitando a regra de ser característica), apenda
        if (item.subject && !subject.includes(item.subject)) {
            subject = subject ? `${subject}, ${item.subject}` : item.subject;
        }

        // (3) ACTION / SYMBOLISM - A ideia da cena (O que está acontecendo)
        let action = (item.action || item.imagePrompt || '')
            .replace(/style:.*$/gi, '')
            .replace(/master cinematic.*$/gi, '')
            .trim();

        const parts = action.split(/,(?:\s*)Strictly:|,(?:\s*)Visual Integrity:/i);
        action = parts[0].trim();

        // (4) CENARIO / LOCATION & PROPS (OBJETOS) - Características do local e dos objetos
        let cenario = item.cenario || '';
        if (!cenario && relevantLocs.length > 0) {
            cenario = relevantLocs.map(l => l.description).filter(Boolean).join(" ");
        }

        // Integra Objetos (Props) no Cenário conforme solicitado pelo usuário
        let propsText = '';
        if (relevantProps.length > 0) {
            propsText = relevantProps.map(p => p.description).filter(Boolean).join(", ");
        } else if (item.props) {
            propsText = item.props;
        }

        if (propsText) {
            // Adiciona as características dos objetos ao cenário
            cenario = cenario ? `${cenario}. Objects: ${propsText}` : `Objects: ${propsText}`;
        }

        // Quantidade de personagens: não exportar no prompt, removido por redução de ruído

        // --- SISTEMA ANTI-NOMES REAIS (AGRESSIVO v2.1.1) ---
        const allAssets = [...projectCharacters, ...projectLocations, ...projectProps];
        
        const cleanRealNames = (text: string) => {
            if (!text) return '';
            let sanitized = text;

            // 1. Limpeza de Nomes Reais Cadastrados
            allAssets.forEach(asset => {
                if (asset.realName && asset.realName.trim().length > 2) {
                    const escaped = asset.realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
                    // Substitui o nome real pela descrição física (se houver) ou pelo apelido
                    const replacement = asset.description ? asset.description.split('.')[0] : asset.name;
                    sanitized = sanitized.replace(regex, replacement);
                }
                
                // 2. Limpeza de Apelidos que parecem nomes (ex: "Elon Musk" como apelido)
                if (asset.name && asset.name.includes(' ') && asset.name.length > 5) {
                    const escapedName = asset.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regexName = new RegExp(`\\b${escapedName}\\b`, 'gi');
                    const replacement = asset.description ? asset.description.split('.')[0] : 'a person';
                    sanitized = sanitized.replace(regexName, replacement);
                }
            });

            // 3. Heurística de Nomes Próprios (Palavras capitalizadas consecutivas)
            // Tenta capturar "Nomes" que não foram cadastrados
            sanitized = sanitized.replace(/\b([A-Z][a-z]+)\s([A-Z][a-z]+)\b/g, (match) => {
                // Se o match for um apelido válido cadastrado (sem espaços), não tocamos. 
                // Mas aqui o regex já pegou com espaço.
                return "someone";
            });

            return sanitized;
        };

        subject = cleanRealNames(subject);
        action = cleanRealNames(action);
        cenario = cleanRealNames(cenario);

        // (5) STYLE
        const styleName = project?.image_style_name || 'Generic';
        const stylePrompt = activeStylePrompt || item.style || '';

        // (6) CAMERA
        const camera = item.camera || '';

        // NOVO FORMATO DE PROMPT (CONCATENAÇÃO POR BLOCOS COM PONTOS)
        let finalPrompt = '';

        // Se houver um estilo mestre selecionado na galeria do projeto, USAMOS ELE COM PRIORIDADE.
        // Omitimos o item.style e item.medium gerados pela IA para evitar contradições e misturas visuais.
        if (activeStylePrompt) {
            // Remove "Generic - " do prefixo do estilo para reduzir ruído no prompt
            const cleanStyle = activeStylePrompt.replace(/^generic\s*[-–]\s*/i, '');
            finalPrompt += `${styleName} - ${cleanStyle}. `;
        } else if (stylePrompt || medium) {
            finalPrompt += `${styleName} - ${stylePrompt} ${medium ? `(${medium})` : ''}. `;
        }

        // Função para higienizar formatações rudes da inteligência artificial
        const cleanText = (str: string) => {
            if (!str) return '';
            return str
                .replace(/[\[\]\/]/g, ' ') // Remove brackets and slashes
                // Separa CamelCase (ex: ExplorerRafael -> Explorer Rafael)
                .replace(/([a-z])([A-Z])/g, '$1 $2') 
                .replace(/\s+/g, ' ') // Remove duplo espaço
                .trim();
        };

        // Personagens: apelido (descrição física), sem palavra-chave "Subject:"
        if (subject) finalPrompt += `${cleanText(subject)}. `;
        if (action) finalPrompt += `${cleanText(action)}. `;
        if (camera) finalPrompt += `Camera: ${cleanText(camera)}. `;
        if (cenario) finalPrompt += `${cleanText(cenario)}. `;

        finalPrompt += `Visual Integrity: "Pure image only: all surfaces are blank and free of any text or letters."`;

        const forbiddenWords = ["nude", "naked", "sex", "violence", "blood", "gore", "photorealistic", "realistic"];
        forbiddenWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            finalPrompt = finalPrompt.replace(regex, '');
        });

        // Limpeza de espaços extras
        finalPrompt = finalPrompt.replace(/\s+/g, ' ').replace(/\s*\.\s*\./g, '.').replace(/,\s*,/g, ',').replace(/, ,/g, ',').trim();

        return { medium, subject, action, cenario, propsPrompt: '', style: stylePrompt, camera, negative: '', finalPrompt };
    };

    const getAssetOccurrence = (id: string, type: 'char' | 'loc' | 'prop' = 'char') => {
        return data.filter(item => {
            if (type === 'char') return item.characterIds?.includes(id);
            if (type === 'loc') return item.locationIds?.includes(id);
            if (type === 'prop') return item.propIds?.includes(id) || (item as any).prop_ids?.includes(id);
            return false;
        }).length;
    };

    const sanitizeFilename = (name: string) => {
        return name.replace(/[<>:"/\\|?*]/g, '').trim().replace(/\s+/g, '_') || 'video_final';
    };

    const handleExportPrompts = () => {
        const exportedContent = data.map((_, index) => {
            const promptData = getPromptData(index);
            return promptData.finalPrompt;
        }).join('\n\n');
        const blob = new Blob([exportedContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const sanitizedName = sanitizeFilename(projectName);
        const styleName = project?.image_style_name || 'NoStyle';
        link.download = `${sanitizedName}_${styleName}_prompts_imagem.txt`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportAnimationPrompts = () => {
        const exportedContent = data.map((item, index) => {
            const promptData = getPromptData(index);
            const animationIdea = item.animation?.trim();
            // Prompt imagem + animacao na MESMA linha, continuando após o ponto final do prompt de imagem
            const base = promptData.finalPrompt.replace(/\.\s*$/, '');
            return animationIdea ? `${base}. ${animationIdea}` : base;
        }).join('\n\n');
        const blob = new Blob([exportedContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const sanitizedName = sanitizeFilename(projectName);
        link.download = `${sanitizedName}_prompts_imagem_mais_anim.txt`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportCSV = () => {
        const headers = ["Número da Cena", "Total de Segundos", "Nome da Imagem", "Texto da Legenda"];
        const rows = data.map((item, index) => [(index + 1).toString(), item.duration.toFixed(3), item.filename, `"${item.text.replace(/"/g, '""')}"`]);
        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const sanitizedName = sanitizeFilename(projectName);
        link.download = `${sanitizedName}-cenas.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportAllImages = async () => {
        const zip = new JSZip();

        // 1. Prompts de Imagem
        const promptsContent = data.map((_, index) => getPromptData(index).finalPrompt).join('\n\n');
        zip.file(`${sanitizeFilename(projectName)}_prompts_imagem.txt`, promptsContent);

        // 2a. Prompts de Imagem + Animação (mesma linha, após ponto final)
        const animComboContent = data.map((item, index) => {
            const promptData = getPromptData(index);
            const animationIdea = item.animation?.trim();
            const base = promptData.finalPrompt.replace(/\.\s*$/, '');
            return animationIdea ? `${base}. ${animationIdea}` : base;
        }).join('\n\n');
        zip.file(`${sanitizeFilename(projectName)}_prompts_imagem_mais_anim.txt`, animComboContent);

        // 2b. Somente animação (nada mais)
        const soloAnimContent = data.map((item) => {
            return (item.animation?.trim()) || '(sem animação)';
        }).join('\n\n');
        zip.file(`${sanitizeFilename(projectName)}_somente_animacao.txt`, soloAnimContent);

        // 3. Planilha CSV
        const headers = ["Número da Cena", "Total de Segundos", "Nome da Imagem", "Texto da Legenda"];
        const rows = data.map((item, index) => [(index + 1).toString(), item.duration.toFixed(3), item.filename, `"${item.text.replace(/"/g, '""')}"`]);
        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        zip.file(`${sanitizeFilename(projectName)}-cenas.csv`, "\ufeff" + csvContent);

        if (audioFile) {
            zip.file(audioFile.name || 'audio_original.mp3', audioFile);
        } else if (project?.audioUrl) {
            try {
                const audioRes = await fetch(project.audioUrl);
                if (audioRes.ok) zip.file(`audio_original.mp3`, await audioRes.blob());
            } catch (e) {
                console.warn("Could not fetch remote audio for zip", e);
            }
        }

        const folder = zip.folder("midias_projeto");
        if (!folder) return;
        setIsVideoGenerating(true);
        setVideoStatus('ZIP_COMPRESSION');
        let addedCount = 0;
        
        try {
            for (let i = 0; i < data.length; i++) {
                const imgUrl = data[i].imageUrl || data[i].googleImageUrl || data[i].pollinationsImageUrl || data[i].importedImageUrl;
                const videoUrl = data[i].importedVideoUrl;
                
                if (videoUrl) {
                    const response = await fetch(videoUrl);
                    if (response.ok) {
                        const blob = await response.blob();
                        folder.file(`scene_${i + 1}.mp4`, blob);
                        addedCount++;
                    }
                } else if (imgUrl) {
                    if (imgUrl.startsWith('data:')) {
                        const base64Data = imgUrl.split(',')[1];
                        folder.file(`scene_${i + 1}.png`, base64Data, { base64: true });
                        addedCount++;
                    } else {
                        const response = await fetch(imgUrl);
                        if (response.ok) {
                            const blob = await response.blob();
                            folder.file(`scene_${i + 1}.png`, blob);
                            addedCount++;
                        }
                    }
                }
                setVideoStatus('ZIP_COMPRESSION');
                setVideoProgress(Math.floor(((i + 1) / data.length) * 100));
            }
            
            if (addedCount === 0) {
                alert("Nenhuma imagem ou vídeo disponível para exportar.");
                setIsVideoGenerating(false);
                return;
            }

            const content = (await zip.generateAsync({ type: "blob" })) as Blob;
            const downloadUrl = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = downloadUrl;
            const sanitizedName = sanitizeFilename(projectName);
            link.download = `${sanitizedName}_midias.zip`;
            link.click();
            URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            console.error("Erro exportando midias ZIP:", error);
            alert("Ocorreu um erro baixando os arquivos para o ZIP. Pode haver restrições de CORS nas URLs.");
        }
        setIsVideoGenerating(false);
    };

    const handleGenerateImage = async (index: number, providerParam?: 'google-nano' | 'google-fast' | 'google-ultra' | 'pollinations' | 'pollinations-zimage', overrideItem?: Partial<TranscriptionItem>) => {
        // Usar o modelo preferencial se existir, senão o parâmetro ou globalProvider
        const provider = providerParam || (project?.preferredImageModel as any) || globalProvider;
        // Limpar a imagem anterior para feedback visual de regeneração
        onUpdateItem(index, {
            ...overrideItem,
            imageUrl: '',
            importedVideoUrl: '',
            importedImageUrl: '',
            googleImageUrl: '',
            pollinationsImageUrl: '',
            [!provider.startsWith('pollinations') ? 'isGeneratingGoogle' : 'isGeneratingPollinations']: true
        });

        try {
            const pData = getPromptData(index, overrideItem);
            const isPol = provider.startsWith('pollinations');
            const isPollinationsZ = provider === 'pollinations-zimage';
            const isGoogleNano = provider === 'google-nano';
            const isGoogleUltra = provider === 'google-ultra';
            const isGoogleFast = provider === 'google-fast';

            const polModel = isPollinationsZ ? 'zimage' : 'flux';
            
            let geminiModel = 'imagen-3.0-generate-002'; // default
            if (isGoogleFast) geminiModel = 'imagen-3.0-generate-002';
            if (isGoogleUltra) geminiModel = 'imagen-3.0-ultra-001';
            if (isGoogleNano) geminiModel = 'gemini-nano';

            const result = !isPol
                ? await generateImage(pData.finalPrompt, settings.aspectRatio, geminiModel)
                : await generatePollinationsImage(pData.finalPrompt, polModel, "", settings.aspectRatio);

            // Upload da imagem gerada ao Supabase Storage para persistência
            let finalImageUrl = result.image; // base64 como fallback imediato
            if (projectId && result.image.startsWith('data:')) {
                try {
                    const [meta, base64Data] = result.image.split(',');
                    const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/png';
                    const byteString = atob(base64Data);
                    const byteArray = new Uint8Array(byteString.length);
                    for (let j = 0; j < byteString.length; j++) byteArray[j] = byteString.charCodeAt(j);
                    const blob = new Blob([byteArray], { type: mimeType });
                    // Filename único por cena: scene_001.png, scene_002.png...
                    // NÃO usar data[index].filename pois pode ser o nome do áudio (igual para todas as cenas)
                    const sceneFilename = `scene_${String(index + 1).padStart(3, '0')}.png`;
                    const publicUrl = await uploadProjectFile(projectId, blob, 'image', sceneFilename);
                    // Adiciona o cache buster ?v=timestamp para forçar a atualização visual da UI
                    if (publicUrl) finalImageUrl = `${publicUrl}?v=${Date.now()}`;
                } catch (uploadErr) {
                    console.warn('[TranscriptionTable] Falha no upload da imagem ao Storage, usando base64:', uploadErr);
                }
            }
            onUpdateItem(index, {
                googleImageUrl: (!isPol && finalImageUrl.startsWith('data:')) ? result.image : '',
                pollinationsImageUrl: (isPol && finalImageUrl.startsWith('data:')) ? result.image : '',
                [!isPol ? 'isGeneratingGoogle' : 'isGeneratingPollinations']: false,
                selectedProvider: provider,
                imageUrl: finalImageUrl,
                importedVideoUrl: '', 
                importedImageUrl: '',
                imageCost: !isPol ? 0.035000 : 0.000000
            });

            // Auto-save após gerar imagem utilizando a nova closure funcional blindada contra stale-closures
            if (onForceSave) {
                onForceSave();
            } else if (project) {
                // Fallback (antigo método obsoleto, raramente atingido com a v1.9.32)
                const updatedItems = data.map((it, i) => i === index ? {
                    ...it,
                    imageUrl: finalImageUrl,
                    [!provider.startsWith('pollinations') ? 'googleImageUrl' : 'pollinationsImageUrl']: result.image,
                    selectedProvider: provider as any,
                } : it);
                onSave({ ...project, items: updatedItems } as any);
            }
        } catch (error: any) {
            const isPol = provider.startsWith('pollinations');
            onUpdateItem(index, { [!isPol ? 'isGeneratingGoogle' : 'isGeneratingPollinations']: false });
            alert(error.message);
        }
    };
    const handleAddAsset = (type: 'characters' | 'locations' | 'props') => {
        const list = type === 'characters' ? [...projectCharacters] : type === 'locations' ? [...projectLocations] : [...projectProps];
        const newAsset: MasterAsset = {
            id: `asset_${Date.now()}`,
            name: type === 'characters' ? 'Novo Personagem' : type === 'locations' ? 'Novo Cenário' : 'Novo Objeto',
            realName: '',
            description: '',
            imageUrl: ''
        };
        onUpdateProjectInfo(type, [...list, newAsset]);
    };

    const handleDeleteAsset = (id: string, type: 'characters' | 'locations' | 'props') => {
        if (!confirm('Tem certeza que deseja excluir este item?')) return;
        const list = type === 'characters' ? [...projectCharacters] : type === 'locations' ? [...projectLocations] : [...projectProps];
        onUpdateProjectInfo(type, list.filter(a => a.id !== id));
    };

    const handleCompareModels = async (asset: MasterAsset, type: 'characters' | 'locations' | 'props') => {
        setComparisonAsset({ asset, type });
        setIsComparing(true);
        
        const models = [
            { id: 'google-imagen', label: 'GEN NANO (IMAGEN 3)' },
            { id: 'pollinations-flux', label: 'FLUX' },
            { id: 'pollinations-zimage', label: 'ZIMAGE' },
            { id: 'pollinations-turbo', label: 'TURBO' }
        ];

        setComparisonResults(models.map(m => ({ modelId: m.id, label: m.label, imageUrl: '', loading: true })));

        const assetPrompt = `${asset.description} style: ${activeStylePrompt}, Visual Integrity: "Pure image only: all surfaces are blank and free of any text or letters."`;

        // Execução paralela
        models.forEach(async (model, idx) => {
            try {
                let result;
                if (model.id === 'google-imagen') {
                    result = await generateImage(assetPrompt, '1:1' as any, IMAGEN_MODEL_NAME);
                } else {
                    const polModel = model.id === 'pollinations-zimage' ? 'zimage' : (model.id === 'pollinations-turbo' ? 'turbo' : 'flux');
                    result = await generatePollinationsImage(assetPrompt, polModel, "", '16:9');
                }
                
                setComparisonResults(prev => prev.map(r => r.modelId === model.id ? { ...r, imageUrl: result.image, loading: false } : r));
            } catch (err: any) {
                setComparisonResults(prev => prev.map(r => r.modelId === model.id ? { ...r, loading: false, error: err.message } : r));
            }
        });
    };

    const handleSelectModel = async (modelId: string, imageUrl: string) => {
        if (!comparisonAsset) return;
        const { asset, type } = comparisonAsset;

        // 1. Atualizar a imagem do asset
        const list = type === 'characters' ? [...projectCharacters] : type === 'locations' ? [...projectLocations] : [...projectProps];
        const newList = list.map(a => a.id === asset.id ? { ...a, imageUrl } : a);
        onUpdateProjectInfo(type, newList);

        // 2. Definir este modelo como o PREFERENCIAL do projeto
        if (onUpdateAllItems && project) {
            onSave({ 
                ...project, 
                preferredImageModel: modelId as any 
            } as any);
            alert(`Motor ${modelId.toUpperCase()} definido como padrão para o projeto!`);
        }

        setIsComparing(false);
        setComparisonAsset(null);
    };

    const handleGenerateAssetImage = async (asset: MasterAsset, type: 'characters' | 'locations' | 'props') => {
        // Obrigatório: Usar a API do dropdown global e o aspect ratio definido do projeto
        const provider = globalProvider;
        const updateList = (update: Partial<MasterAsset>) => {
            onUpdateProjectInfo(type, (prevList: MasterAsset[]) => {
                return prevList.map(a => a.id === asset.id ? { ...a, ...update } : a);
            });
        };
        updateList({ 
            imageUrl: '', 
            [!provider.startsWith('pollinations') ? 'isGeneratingGoogle' : 'isGeneratingPollinations']: true 
        });
        try {
            const realWorldNote = type === 'characters'
                ? `IMPORTANT: If the character "${asset.name}" is a real-world person (celebrity, historical figure, athlete, politician, etc.), you MUST faithfully reproduce their known physical characteristics: face, skin tone, hair color/style, body type, and their most iconic/default outfit or uniform. Do not invent or stylize beyond what the style dictates.`
                : '';
            const assetPrompt = `${realWorldNote ? realWorldNote + ' ' : ''}${asset.description} style: ${activeStylePrompt}, Visual Integrity: "Pure image only: all surfaces are blank and free of any text or letters."`;

            const isPollinationsZ = provider === 'pollinations-zimage';
            const isGoogleNano = provider === 'google-nano';
            const isGoogleUltra = provider === 'google-ultra';
            const isGoogleFast = provider === 'google-fast';

            const assetFinalProvider = (provider === 'pollinations' || provider === 'pollinations-zimage') ? 'pollinations' : 'google';
            const polModel = isPollinationsZ ? 'zimage' : 'flux';
            
            let geminiModel = IMAGEN_MODEL_NAME; // default Imagen 3
            if (isGoogleFast) geminiModel = 'imagen-3.0-generate-002'; // Ou o nome correto do Fast
            if (isGoogleUltra) geminiModel = 'imagen-3.0-ultra-001';
            if (isGoogleNano) geminiModel = 'gemini-nano'; // Se houver esse mapeamento no service

            // Mas para garantir o mesmo código da galeria, vou usar as constantes do geminiService se estiverem lá
            // Na galeria usa: IMAGEN_ULTRA_MODEL_NAME, IMAGEN_FAST_MODEL_NAME, NANO_MODEL_NAME
            
            const result = assetFinalProvider === 'google'
                ? await generateImage(assetPrompt, settings.aspectRatio, 
                    isGoogleUltra ? 'imagen-3.0-ultra-001' : 
                    isGoogleFast ? 'imagen-3.0-generate-002' : 
                    isGoogleNano ? 'gemini-nano' : 'imagen-3.0-generate-002'
                  )
                : await generatePollinationsImage(assetPrompt, polModel, "", settings.aspectRatio);

            let finalImageUrl = result.image;
            if (projectId && result.image.startsWith('data:')) {
                try {
                    const [meta, base64Data] = result.image.split(',');
                    const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/png';
                    const byteString = atob(base64Data);
                    const byteArray = new Uint8Array(byteString.length);
                    for (let j = 0; j < byteString.length; j++) byteArray[j] = byteString.charCodeAt(j);
                    const blob = new Blob([byteArray], { type: mimeType });
                    // Save file identically to how scene images are preserved in storage to avoid breaking base64 JSON saves.
                    const assetFilename = `asset_${asset.id}_${Date.now()}.png`;
                    const publicUrl = await uploadProjectFile(projectId, blob, 'image', assetFilename);
                    if (publicUrl) finalImageUrl = `${publicUrl}?v=${Date.now()}`;
                } catch (uploadErr) {
                    console.warn('[TranscriptionTable] Falha no upload da imagem do asset ao Storage, usando base64:', uploadErr);
                }
            } else if (!result.image.startsWith('data:')) {
                finalImageUrl = `${result.image}?v=${Date.now()}`;
            }

            const isPol = provider.startsWith('pollinations');
            updateList({ imageUrl: finalImageUrl, [!isPol ? 'isGeneratingGoogle' : 'isGeneratingPollinations']: false });
        } catch (e: any) {
            const isPol = provider.startsWith('pollinations');
            updateList({ [!isPol ? 'isGeneratingGoogle' : 'isGeneratingPollinations']: false });
            alert(e.message);
        }
    };

    const handleGenerateAll = async () => {
        if (isGeneratingAll) { bulkAbortRef.current = true; return; }
        setIsGeneratingAll(true);
        bulkAbortRef.current = false;
        for (let i = 0; i < data.length; i++) {
            if (bulkAbortRef.current) break;
            // Gera imagem para todos os itens exceto se o cara subiu um vídeo importado manualmente
            if (!data[i].importedVideoUrl) await handleGenerateImage(i, globalProvider as any);
        }
        setIsGeneratingAll(false);
    };

    const handleGenerateMissing = async () => {
        if (isGeneratingAll) { bulkAbortRef.current = true; return; }
        setIsGeneratingAll(true);
        bulkAbortRef.current = false;
        for (let i = 0; i < data.length; i++) {
            if (bulkAbortRef.current) break;
            const hasMedia = !!(data[i].imageUrl || data[i].importedVideoUrl);
            if (!hasMedia) await handleGenerateImage(i, globalProvider as any);
        }
        setIsGeneratingAll(false);
    };

    const handleRecreateSceneBroll = async (index: number) => {
        onUpdateItem(index, { isGeneratingGoogle: true });
        try {
            const item = data[index];
            const systemPrompt = `You are an expert video producer. Rewrite this scene to be a generic B-roll shot without any specific character names. It should describe a cinematic visually stunning establishing shot or abstract concept representation related to the text.
            
Original text: "${item.text}"
Current action: "${item.action}"

Return ONLY a valid JSON object with the following keys, no markdown formatting at all:
{
  "medium": "cinematic photography, 3d render, etc",
  "subject": "generic description, e.g., A lone silhouette, A glowing orb (NO real names)",
  "action": "what is happening",
  "cenario": "the environment",
  "props": "objects in the scene",
  "symbolism": "visual metaphor",
  "camera": "camera angle/movement",
  "animation": "motion prompt for runway/luma"
}`;
            
            const newActionRaw = await generateText(systemPrompt);
            const cleanedJson = newActionRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanedJson);
            
            const overrideItem = { 
                action: parsed.action || item.action,
                medium: parsed.medium || item.medium,
                subject: parsed.subject || '',
                cenario: parsed.cenario || item.cenario,
                props: parsed.props || item.props,
                symbolism: parsed.symbolism || item.symbolism,
                camera: parsed.camera || item.camera,
                animation: parsed.animation || item.animation,
                characterIds: [],
                locationIds: []
            };
            await handleGenerateImage(index, globalProvider as any, overrideItem);
        } catch (e: any) {
            onUpdateItem(index, { isGeneratingGoogle: false });
            alert(`Erro ao gerar nova ideia de cena b-roll: ${e.message}`);
        }
    };

    const handleGenerateTitles = async () => {
        if (isGeneratingTitles) return;
        setIsGeneratingTitles(true);
        try {
            const script = data.map(item => item.text).join('\n');
            const titles = await generateViralTitles(script, context || "Geral", settings.titlesPrompt);
            setGeneratedTitles(titles);
        } catch (e: any) { console.error(e); } finally { setIsGeneratingTitles(false); }
    };

    const handleGenerateThumbnail = async (idx: number) => {
        const title = generatedTitles[idx];
        if (!title) return;

        setGeneratingThumbnailMap(prev => ({ ...prev, [idx]: true }));
        try {
            const prompt = `${title.thumbnailVisual} style: ${activeStylePrompt}`;
            const provider = (project?.preferredImageModel as any) || globalProvider;
            const isPol = provider.startsWith('pollinations');
            const isPollinationsZ = provider === 'pollinations-zimage';
            const isGoogleImagen = provider === 'google-imagen';
            const polModel = isPollinationsZ ? 'zimage' : 'flux';
            const geminiModel = isGoogleImagen ? IMAGEN_MODEL_NAME : IMAGE_MODEL_NAME;

            const result = !isPol
                ? await generateImage(prompt, settings.aspectRatio, geminiModel)
                : await generatePollinationsImage(prompt, polModel, "", settings.aspectRatio);

            const updatedTitlesList = [...generatedTitles];
            (updatedTitlesList[idx] as any).imageUrl = result.image; // Extensão temporária para exibição
            setGeneratedTitles(updatedTitlesList);

            setViewingImageState({
                imageUrl: result.image,
                promptData: { action: title.thumbnailVisual, style: activeStylePrompt },
                filename: `thumbnail_${idx + 1}.png`
            });

            // Auto-save após gerar thumbnail (salva o estado do projeto)
            if (project) {
                onSave({ ...project, items: data } as any);
            }
        } catch (e: any) {
            alert(`Erro na thumbnail: ${e.message}`);
        } finally {
            setGeneratingThumbnailMap(prev => ({ ...prev, [idx]: false }));
        }
    };

    const handleBulkImportImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0 || !projectId) return;

        console.log(`[Import] Iniciando importação em lote de ${files.length} arquivos...`);

        // CRIAR CÓPIA LIMPA E CONTROLADA: Garante que nunca vamos ultrapassar o número original de cenas
        const originalLength = data.length;
        const updatedItems = data.map(item => ({ ...item }));
        const usedIndices = new Set<number>();

        // 1. Converter e ordenar arquivos numericamente pelo prefixo
        const fileArray = (Array.from(files) as File[]).sort((a, b) => {
            const numA = parseInt(a.name.match(/^(\d+)/)?.[1] || "999999", 10);
            const numB = parseInt(b.name.match(/^(\d+)/)?.[1] || "999999", 10);
            if (numA !== numB) return numA - numB;
            return a.name.localeCompare(b.name);
        });

        // 2. PRIMEIRA PASSADA: Mapeamento Direto por Número (Prioridade)
        const unmappedFiles: File[] = [];
        for (const file of fileArray) {
            const numberMatch = file.name.match(/^(\d+)/);
            if (numberMatch) {
                const sceneNum = parseInt(numberMatch[1], 10);
                const targetIdx = sceneNum - 1;

                if (targetIdx >= 0 && targetIdx < originalLength && !usedIndices.has(targetIdx)) {
                    await processFileImport(file, targetIdx);
                } else {
                    unmappedFiles.push(file);
                }
            } else {
                unmappedFiles.push(file);
            }
        }

        // 3. SEGUNDA PASSADA: Preencher slots vazios com arquivos sem número ou conflitantes
        for (const file of unmappedFiles) {
            const targetIdx = updatedItems.findIndex((item, idx) =>
                !item.imageUrl && !item.importedVideoUrl && !usedIndices.has(idx)
            );
            if (targetIdx !== -1) {
                await processFileImport(file, targetIdx);
            }
        }

        async function processFileImport(file: File, targetIdx: number) {
            try {
                usedIndices.add(targetIdx);
                const isVideo = file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4');
                const fileType = isVideo ? 'video' : 'image';

                onUpdateItem(targetIdx, { isGeneratingGoogle: true });
                const publicUrl = await uploadProjectFile(projectId, file, fileType, file.name);

                if (publicUrl) {
                    const update = {
                        importedVideoUrl: isVideo ? publicUrl : '',
                        importedImageUrl: !isVideo ? publicUrl : '',
                        imageUrl: !isVideo ? publicUrl : updatedItems[targetIdx].imageUrl,
                        selectedProvider: 'imported' as any,
                        isGeneratingGoogle: false
                    };
                    updatedItems[targetIdx] = { ...updatedItems[targetIdx], ...update };
                    onUpdateItem(targetIdx, update);
                    console.log(`[Import] OK: ${file.name} -> Cena ${targetIdx + 1}`);
                } else {
                    onUpdateItem(targetIdx, { isGeneratingGoogle: false });
                }
            } catch (err) {
                console.error(`[Import] Erro ao processar ${file.name}:`, err);
                onUpdateItem(targetIdx, { isGeneratingGoogle: false });
            }
        }

        if (importInputRef.current) importInputRef.current.value = '';

        // IMPORTANTE: Corte final para garantir que o array tem o tamanho original
        const finalItems = updatedItems.slice(0, originalLength);
        onUpdateProjectInfo('items', finalItems);
    };

    const handlePreview = async () => {
        setIsPreviewing(true);
        if (previewVideoUrl) URL.revokeObjectURL(previewVideoUrl);
        setPreviewVideoUrl(null);
        try {
            const style = includeSubtitles ? settings.subtitleStyles.find(s => s.id === (selectedSubtitlePresetId || (settings.aspectRatio === '16:9' ? 'horizontal-16-9' : 'vertical-9-16'))) : undefined;
            const url = await generatePreviewVideo(data, TransitionType.CUTAWAY, settings.aspectRatio, style, motionEffects);
            setPreviewVideoUrl(url);
        } catch (e: any) { alert(e.message); } finally { setIsPreviewing(false); }
    };

    const handleFinalRender = async () => {
        if (!audioFile) return alert("Áudio global necessário.");
        
        // Verifica Cenas Vazias
        const emptyScenes = data.map((item, index) => {
            const hasMedia = item.imageUrl || item.importedVideoUrl || item.googleImageUrl || item.pollinationsImageUrl || item.importedImageUrl;
            return hasMedia ? null : (index + 1);
        }).filter(val => val !== null);

        if (emptyScenes.length > 0) {
            const proceed = window.confirm(`Atenção: As cenas a seguir estão vazias:\n[Cenas: ${emptyScenes.join(', ')}]\n\nO vídeo vai conter trechos pretos nestes momentos. Deseja continuar assim mesmo?`);
            if (!proceed) return;
        }
        
        setIsVideoGenerating(true);
        setShowVideoSettings(false);
        setVideoStatus(`Sincronizando Master via ${renderEngine === 'ffmpeg' ? 'Desktop' : 'Browser'}...`);
        setRenderElapsed(0);

        // Timer de render
        const startTime = Date.now();
        if (renderTimerRef.current) clearInterval(renderTimerRef.current);
        renderTimerRef.current = setInterval(() => {
            setRenderElapsed((Date.now() - startTime) / 1000);
        }, 1000);

        const sub = includeSubtitles ? settings.subtitleStyles.find(s => s.id === (selectedSubtitlePresetId || (settings.aspectRatio === '16:9' ? 'horizontal-16-9' : 'vertical-9-16'))) : undefined;
        
        try {
            let blob: Blob;
            
            if (renderEngine === 'ffmpeg') {
                blob = await renderWithFFmpeg(
                    {
                        audioFile,
                        items: data,
                        transitionType: settings.transitionType,
                        aspectRatio: settings.aspectRatio,
                        subtitleStyle: sub,
                        motionEffects: settings.motionEffects
                    },
                    (p, msg) => {
                        setVideoProgress(p);
                        setVideoStatus(msg);
                    }
                );
            } else {
                blob = await generateTimelineVideo(audioFile, data, TransitionType.CUTAWAY, (p, msg) => { setVideoProgress(p); setVideoStatus(msg); }, settings.aspectRatio, sub, settings.motionEffects);
            }
            
            if (renderTimerRef.current) clearInterval(renderTimerRef.current);
            const url = URL.createObjectURL(blob);
            setVideoUrl(url);

            const extension = blob.type.split('/')[1]?.split(';')[0] || 'webm';
            const sanitizedName = projectName ? projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'video';
            const link = document.createElement('a');
            link.href = url;
            link.download = `${renderEngine.toUpperCase()}_${sanitizedName}.${extension === 'x-matroska' ? 'mkv' : extension}`;
            link.click();
        } catch (e: any) {
            if (renderTimerRef.current) clearInterval(renderTimerRef.current);
            setVideoStatus("Erro de processamento: " + e.message);
        } finally { setIsVideoGenerating(false); }
    };

    const handleTestExport = async () => {
        if (!audioFile) return alert("Áudio global necessário para o teste.");
        
        setIsVideoGenerating(true);
        setVideoProgress(0);
        setVideoStatus(`Iniciando Exportação Teste (1 min) via ${renderEngine === 'ffmpeg' ? 'Desktop' : 'Browser'}...`);

        try {
            const sub = includeSubtitles ? settings.subtitleStyles.find(s => s.id === (selectedSubtitlePresetId || (settings.aspectRatio === '16:9' ? 'horizontal-16-9' : 'vertical-9-16'))) : undefined;
            
            let testBlob: Blob;
            
            if (renderEngine === 'ffmpeg') {
                testBlob = await renderWithFFmpeg(
                    {
                        audioFile,
                        items: data,
                        transitionType: settings.transitionType,
                        aspectRatio: settings.aspectRatio,
                        subtitleStyle: sub,
                        motionEffects: settings.motionEffects,
                        maxDuration: 60
                    },
                    (p, msg) => {
                        setVideoProgress(p);
                        setVideoStatus(msg);
                    }
                );
            } else {
                testBlob = await generateTimelineVideo(
                    audioFile, 
                    data, 
                    settings.transitionType, 
                    (p, msg) => { 
                        setVideoProgress(p); 
                        setVideoStatus(msg); 
                    },
                    settings.aspectRatio,
                    sub,
                    settings.motionEffects,
                    60 // maxDuration: 60 segundos
                );
            }
            
            const url = URL.createObjectURL(testBlob);
            const extension = testBlob.type.split('/')[1]?.split(';')[0] || 'webm';
            const a = document.createElement('a');
            a.href = url;
            a.download = `TESTE_1MIN_${renderEngine.toUpperCase()}_${project?.name || 'video'}.${extension === 'x-matroska' ? 'mkv' : extension}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            console.error("Erro na exportação teste:", e);
            alert("Erro ao realizar exportação rápida: " + e.message);
        } finally {
            setIsVideoGenerating(false);
            setVideoStatus("");
        }
    };

    return (
        <div className="w-full max-w-[1600px] mx-auto mt-3 flex flex-col gap-3 relative">

            {/* O overlay de renderização agora é gerenciado globalmente pelo App.tsx */}

            {
                showVideoSettings && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 backdrop-blur-xl p-2 animate-in fade-in duration-300">
                        <div className="bg-slate-900 rounded-[2.5rem] border border-slate-800 w-full max-w-3xl h-auto flex flex-col shadow-2xl overflow-hidden relative">
                            {/* Header compacto */}
                            <div className="px-3 py-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
                                <div className="flex items-center gap-2">
                                    <Clapperboard className="text-brand-400" size={18} />
                                    <h3 className="text-sm font-black text-white uppercase tracking-tight italic">Exportação Vídeo Master</h3>
                                </div>
                                <button onClick={() => setShowVideoSettings(false)} className="p-1.5 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all"><X size={20} /></button>
                            </div>
                            {/* Corpo horizontal: legenda à esquerda + preview à direita */}
                            <div className="flex flex-row gap-2 p-2">
                                {/* Coluna esquerda: controles de legenda + gerar */}
                                <div className="flex flex-col gap-3 w-[220px] shrink-0">
                                    <label className="text-[10px] font-black uppercase text-brand-400 tracking-widest flex items-center gap-1.5"><MonitorPlay size={11} /> Motor</label>
                                    <div className="flex gap-2">
                                        <button onClick={() => setRenderEngine('browser')} className={`flex-1 py-2 rounded-sm font-black uppercase text-[11px] tracking-widest transition-all border ${renderEngine === 'browser' ? 'bg-brand-500 text-white border-brand-400' : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'}`}>Browser</button>
                                        <button onClick={() => setRenderEngine('ffmpeg')} className={`flex-1 py-2 rounded-sm font-black uppercase text-[11px] tracking-widest transition-all border ${renderEngine === 'ffmpeg' ? 'bg-brand-500 text-white border-brand-400' : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'}`}>Desktop</button>
                                    </div>
                                    {renderEngine === 'ffmpeg' && (
                                        <div className="text-[9px] text-amber-400 bg-amber-500/10 px-2 py-1.5 rounded-sm border border-amber-500/20">
                                            ✦ Usa FFmpeg (mais rápido, melhor qualidade)
                                        </div>
                                    )}
                                    <label className="text-[10px] font-black uppercase text-brand-400 tracking-widest flex items-center gap-1.5 mt-2"><Type size={11} /> Legendas</label>
                                    <div className="flex gap-2">
                                        <button onClick={() => setIncludeSubtitles(true)} className={`flex-1 py-2 rounded-sm font-black uppercase text-[11px] tracking-widest transition-all border ${includeSubtitles ? 'bg-brand-500 text-white border-brand-400' : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'}`}>Sim</button>
                                        <button onClick={() => setIncludeSubtitles(false)} className={`flex-1 py-2 rounded-sm font-black uppercase text-[11px] tracking-widest transition-all border ${!includeSubtitles ? 'bg-red-500 text-white border-red-400' : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'}`}>Não</button>
                                    </div>
                                    {includeSubtitles && (
                                        <select
                                            value={selectedSubtitlePresetId || (settings.aspectRatio === '16:9' ? 'horizontal-16-9' : 'vertical-9-16')}
                                            onChange={(e) => setSelectedSubtitlePresetId(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-sm px-3 py-2 text-white text-[11px] outline-none focus:border-brand-500 transition-colors"
                                        >
                                            {settings.subtitleStyles.map(preset => (
                                                <option key={preset.id} value={preset.id}>{preset.label}</option>
                                            ))}
                                        </select>
                                    )}
                                    {renderEngine === 'ffmpeg' && (
                                        <div className="mt-2 p-3 bg-slate-950 border border-brand-500/30 rounded-lg flex flex-col gap-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest flex items-center gap-1.5"><Terminal size={12}/> Comando Desktop</span>
                                                <button 
                                                    onClick={() => {
                                                        const cmd = `rm -rf temp_render/* && npx tsx scripts/render_native.ts --id=${projectId} --subs=${includeSubtitles}`;
                                                        navigator.clipboard.writeText(cmd);
                                                        alert("Comando COMPLETO copiado! Cole no seu Terminal.");
                                                        setIsVideoGenerating(true);
                                                    }}
                                                    className="p-1 hover:bg-brand-500/20 text-brand-400 rounded-md transition-colors"
                                                    title="Copiar Comando Completo"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                            </div>
                                            <code className="text-[9px] font-mono text-slate-400 bg-black/40 p-2 rounded block break-all leading-relaxed border border-white/5">
                                                rm -rf temp_render/* && npx tsx scripts/render_native.ts --id={projectId} --subs={String(includeSubtitles)}
                                            </code>
                                            <p className="text-[9px] text-slate-500 italic">Cole este comando no terminal para renderizar vídeos longos com todo o poder da sua CPU.</p>
                                        </div>
                                    )}

                                    {renderEngine === 'browser' && (
                                        <div className="flex flex-col gap-2 mt-auto">
                                            <button 
                                                onClick={handlePreview} 
                                                disabled={isPreviewing} 
                                                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-brand-400 rounded-sm text-[10px] font-black uppercase flex items-center justify-center gap-1.5 border border-slate-700 border-dashed"
                                            >
                                                {isPreviewing ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />} Preview
                                            </button>
                                            <button 
                                                onClick={handleTestExport} 
                                                disabled={isVideoGenerating} 
                                                className="w-full py-3 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-sm border border-emerald-500/30 font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                                            >
                                                <Zap size={14} /> Exportação Teste (1 Min)
                                            </button>
                                            <button onClick={handleFinalRender} disabled={isVideoGenerating} className="w-full py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-md font-black uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-brand-500/20 transition-all flex items-center justify-center active:scale-95">RENDERIZAR</button>
                                        </div>
                                    )}
                                </div>
                                {/* Coluna direita: preview */}
                                <div className="flex-1 flex flex-col gap-2">
                                    <div className="flex justify-end items-center min-h-[28px]">
                                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-1"><Monitor size={11} /> Amostra</label>
                                    </div>
                                    <div className={`bg-black rounded-md border border-slate-800 overflow-hidden relative shadow-inner flex-1 mx-auto w-full flex items-center justify-center ${settings.aspectRatio === '9:16' ? 'aspect-[9/16] max-w-[160px]' : 'aspect-video'}`}>
                                        {(renderEngine === 'ffmpeg' && (isVideoGenerating || videoProgress > 0)) ? (
                                            <div className="absolute inset-0 bg-black flex flex-col items-center justify-center p-4 text-center animate-in fade-in zoom-in duration-500">
                                                <div className="relative mb-3">
                                                    <Terminal className="text-brand-500 animate-pulse" size={40} />
                                                    <Cpu className="absolute -bottom-1 -right-1 text-brand-400 animate-bounce" size={16} />
                                                </div>
                                                <h3 className="text-brand-400 font-black uppercase text-[10px] tracking-[0.2em] mb-3 italic">Processamento Nativo</h3>
                                                <div className="w-full max-w-[120px] h-1 bg-slate-900 rounded-full overflow-hidden mb-3 border border-white/5">
                                                    <div className="h-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700 shadow-[0_0_10px_rgba(242,101,34,0.3)]" style={{ width: `${videoProgress}%` }}></div>
                                                </div>
                                                <p className="text-[9px] font-mono text-slate-300 uppercase tracking-widest leading-tight">{videoStatus || 'Iniciando...'}</p>
                                                <p className="text-[12px] font-black text-white mt-1">{videoProgress}%</p>
                                            </div>
                                        ) : (
                                            <>
                                                {previewVideoUrl ? (
                                                    <video key={previewVideoUrl} src={previewVideoUrl} controls autoPlay className="w-full h-full object-contain" />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center opacity-20 gap-2">
                                                        <PlayCircle size={40} />
                                                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Gerar Amostra</span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-md p-2.5 shadow-2xl relative z-40 sticky top-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                    <div className="bg-slate-950/40 px-2 py-2 rounded-md border border-slate-800/50 flex flex-col md:flex-row items-center gap-2 shadow-inner flex-1 shadow-lg">
                        <div className="flex items-center gap-3 w-full lg:w-auto">
                            <span className="text-[11px] font-bold uppercase text-brand-400 tracking-wider italic pr-2 border-r border-slate-800">Direção</span>
                            <select value={settings.aspectRatio} onChange={(e) => onUpdateGlobalSetting('aspectRatio', e.target.value as '16:9' | '9:16')} className="bg-slate-950 border border-slate-800/60 rounded-sm px-2 py-1 text-[11px] text-slate-200 font-bold uppercase outline-none cursor-pointer hover:text-white hover:border-slate-700 transition-colors">
                                <option value="16:9">16:9</option>
                                <option value="9:16">9:16</option>
                            </select>
                            <select value={selectedStyleId} onChange={(e) => onStyleChange(e.target.value)} className="bg-slate-950 border border-slate-800/60 rounded-sm px-2 py-1 text-[11px] text-slate-200 font-bold uppercase outline-none cursor-pointer hover:text-white hover:border-slate-700 transition-colors min-w-[140px]">
                                {settings.items.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                            <div className="flex bg-slate-950 p-1 rounded-sm gap-1 border border-slate-800/60">
                                {[
                                    { id: 'google-fast', label: 'FAST', color: 'from-blue-400 to-cyan-500', title: 'Imagen 4 Fast' },
                                    { id: 'google-nano', label: 'NANO', color: 'from-amber-400 to-orange-600', title: 'Nano Banana' },
                                    { id: 'google-ultra', label: 'ULTRA', color: 'from-blue-600 to-indigo-700', title: 'Imagen 3 Ultra' },
                                    { id: 'pollinations', label: 'FLUX', color: 'from-purple-500 to-pink-600', title: 'Flux Cinematic' },
                                    { id: 'pollinations-zimage', label: 'ZIMG', color: 'from-emerald-500 to-teal-600', title: 'ZImage Magic' }
                                ].map(p => (
                                    <button 
                                        key={p.id}
                                        onClick={() => setGlobalProvider(p.id as any)}
                                        title={p.title}
                                        className={`px-2 py-1 rounded-sm text-[9px] font-black uppercase tracking-tighter transition-all border ${globalProvider === p.id ? `bg-gradient-to-r ${p.color} text-white border-transparent shadow-[0_0_10px_rgba(255,100,0,0.2)]` : 'bg-transparent text-slate-500 border-transparent hover:text-slate-300'}`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 ml-auto w-full md:w-auto overflow-x-auto scrollbar-hide shrink-0 pb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-brand-400 mr-2 border-r border-slate-800 pr-4 mt-1">
                                {data.filter(i => i.imageUrl || i.importedVideoUrl || i.importedImageUrl).length} / {data.length}
                            </span>
                            <div className="flex items-center gap-1.5 h-full">
                                {/* SINTONIA oculto por ora */}
                                {/* AJUSTAR oculto por ora */}

                                <div className="flex flex-col items-center gap-1 w-[80px]">
                                    <button 
                                        onClick={handleGenerateMissing} 
                                        disabled={isGeneratingAll || data.length === 0}
                                        className={`w-full h-8 rounded-sm transition-all border flex items-center justify-center shadow-lg ${isGeneratingAll ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 animate-pulse' : 'bg-slate-900 border-slate-700 text-amber-400 hover:bg-amber-500 hover:text-white hover:border-amber-500 shadow-amber-500/5'}`}
                                    >
                                        {isGeneratingAll ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
                                    </button>
                                    <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider text-center mt-0.5">Faltas</span>
                                </div>

                                <div className="flex flex-col items-center gap-1 w-[80px]">
                                    <button 
                                        onClick={handleGenerateAll} 
                                        disabled={isGeneratingAll || data.length === 0}
                                        className={`w-full h-8 rounded-sm transition-all border flex items-center justify-center shadow-lg ${isGeneratingAll ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 animate-pulse' : 'bg-brand-500 border-brand-400 text-white hover:bg-brand-400'}`}
                                    >
                                        {isGeneratingAll ? <Ban size={16} /> : <RefreshCw size={16} />}
                                    </button>
                                    <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider text-center mt-0.5">Tudo</span>
                                </div>
                            </div>

                            <div className="h-8 w-px bg-slate-800 mx-1"></div>

                            {/* Upload + VIDEO grudados sem gap */}
                            <div className="flex items-center">
                                <button onClick={() => importInputRef.current?.click()} title="Import em Lote" className="h-8 w-10 bg-slate-900 border border-slate-700 rounded-l-xl border-r-0 text-slate-400 hover:text-white transition-all flex items-center justify-center shadow-lg"><Upload size={14} /></button>
                                <input type="file" multiple ref={importInputRef} onChange={handleBulkImportImages} className="hidden" accept="image/*,video/*" />
                                <button 
                                    onClick={() => !isSyncError && setShowVideoSettings(true)} 
                                    disabled={isSyncError}
                                    className={`h-8 flex items-center justify-center gap-1.5 px-2 rounded-r-xl border border-l-0 text-[11px] font-bold uppercase tracking-wider shadow-lg transition-all active:scale-95 ${isSyncError ? 'bg-slate-800 text-slate-500 cursor-not-allowed border-red-500/20' : 'bg-brand-500 hover:bg-brand-400 text-white border-brand-400/30'}`}
                                >
                                    VIDEO
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-800 pb-0 gap-2">
                <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    {['scenes', 'characters', 'locations', 'props', 'titles'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as TabMode)} className={`px-3 py-2 text-[12px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === tab ? 'text-brand-400 border-brand-500 bg-brand-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                            {tab === 'scenes' ? 'Story Board' : tab === 'characters' ? 'Personagens' : tab === 'locations' ? 'Cenários' : tab === 'props' ? 'Objetos' : 'CTR Ninja'}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 px-2 pb-2 lg:pb-0 overflow-x-auto scrollbar-hide">
                    <button
                        onClick={async () => {
                            if (!project) return;
                            setIsSaving(true);
                            try { await onSave({ ...project, items: data } as any); } catch (e) { }
                            finally { setIsSaving(false); }
                        }}
                        disabled={isSaving || !project}
                        className={`text-[12px] font-black uppercase px-3 py-1.5 rounded-sm border transition-all flex items-center gap-1.5 ${isSaving ? 'bg-slate-800 text-slate-500 border-slate-700' : 'bg-brand-500/10 text-brand-400 border-brand-500/30 hover:bg-brand-500 hover:text-white'}`}
                    >
                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        {isSaving ? 'SALVANDO...' : 'SALVAR'}
                    </button>
                    <button onClick={handleExportPrompts} className="text-[11px] font-bold uppercase text-slate-400 hover:text-brand-400 flex items-center gap-1.5 transition-colors pr-3 border-r border-slate-800/50 min-w-max"><FileText size={12} /> Prompts</button>
                    <button onClick={handleExportAnimationPrompts} className="text-[11px] font-bold uppercase text-slate-400 hover:text-sky-400 flex items-center gap-1.5 transition-colors pr-3 border-r border-slate-800/50 min-w-max"><Video size={12} /> Anim</button>
                    <button onClick={handleExportCSV} className="text-[11px] font-bold uppercase text-slate-400 hover:text-brand-400 flex items-center gap-1.5 transition-colors pr-3 border-r border-slate-800/50 min-w-max"><FileSpreadsheet size={12} /> CSV</button>
                    <button onClick={handleExportAllImages} className="text-[11px] font-bold uppercase text-slate-400 hover:text-brand-400 flex items-center gap-1.5 transition-colors pr-4 border-r border-slate-800/50 min-w-max"><FileArchive size={12} /> ZIP</button>
                    
                    <button
                        onClick={() => isTimelinePreviewActive ? timelineRef.current?.stopPreview() : timelineRef.current?.startPreview()}
                        disabled={!audioFile}
                        className={`text-[11px] font-bold uppercase px-3 py-1.5 rounded-sm border transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${isTimelinePreviewActive ? 'bg-red-500 text-white border-red-400 animate-pulse hover:bg-red-600' : 'bg-slate-800 text-white border-slate-700 hover:bg-brand-500 hover:border-brand-400'}`}
                    >
                        {isTimelinePreviewActive ? <Square size={12} fill="currentColor" /> : <PlayCircle size={12} />}
                        PREVIEW
                    </button>


                </div>
            </div>
        </div>

        <div className="px-3">
                <TimelineVisual ref={timelineRef} items={data} onPreviewStateChange={setIsTimelinePreviewActive} onImageClick={(idx) => {
                    const el = document.getElementById(`scene-card-${idx}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }} audioFile={audioFile} videoUrl={videoUrl} />
            </div>

            {
                activeTab === 'scenes' && (
                    <div className="space-y-8 pb-32">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {data.map((item, index) => (
                                <div key={index} className="flex flex-col gap-2">
                                    {/* Linha do topo: duração editável + CAP (Capacidade de Palavras) */}
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-950/50 rounded-full border border-slate-800/50">
                                            <input 
                                                type="number"
                                                step="0.1"
                                                min="0.1"
                                                value={item.duration.toFixed(2)}
                                                onChange={(e) => handleDurationChange(index, parseFloat(e.target.value) || 0.1)}
                                                className={`bg-transparent border-none text-[15px] font-black w-12 text-center outline-none focus:text-brand-400 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isSyncError ? 'text-red-500' : 'text-slate-200'}`}
                                            />
                                            <div className="flex items-center gap-1 ml-1 border-l border-white/10 pl-2">
                                                <span className="text-[13px] font-black text-slate-400">{(item.duration * 2.5).toFixed(2)}</span>
                                            </div>
                                            <button onClick={() => {
                                                if ((window as any).sceneAudioPlayer) {
                                                    (window as any).sceneAudioPlayer.pause();
                                                    if ((window as any).sceneAudioPlayerPlayingIndex === index) {
                                                        (window as any).sceneAudioPlayerPlayingIndex = null;
                                                        return;
                                                    }
                                                }
                                                let effectiveAudioUrl = (window as any).projectAudioUrl;
                                                if (!effectiveAudioUrl && audioFile) {
                                                    effectiveAudioUrl = URL.createObjectURL(audioFile);
                                                    (window as any).projectAudioUrl = effectiveAudioUrl;
                                                }
                                                if (!effectiveAudioUrl && project?.audioUrl) {
                                                    effectiveAudioUrl = project.audioUrl;
                                                }
                                                if (!effectiveAudioUrl) {
                                                    alert("Áudio não encontrado. Salve ou reinsira o áudio.");
                                                    return;
                                                }
                                                const audio = new Audio(effectiveAudioUrl);
                                                (window as any).sceneAudioPlayer = audio;
                                                (window as any).sceneAudioPlayerPlayingIndex = index;
                                                audio.currentTime = item.startSeconds;
                                                audio.play().catch(e => {
                                                    console.error("Audio playback error:", e);
                                                    alert("Não foi possível reproduzir o áudio.");
                                                });
                                                const checkStop = () => {
                                                    if (audio.currentTime >= item.endSeconds) { audio.pause(); (window as any).sceneAudioPlayerPlayingIndex = null; }
                                                    else if (!audio.paused) requestAnimationFrame(checkStop);
                                                };
                                                requestAnimationFrame(checkStop);
                                            }} className="text-slate-500 hover:text-brand-400 transition-colors ml-1">
                                                <Play size={11} className="fill-current" />
                                            </button>
                                        </div>
                                        {(() => {
                                            const wordCount = item.text.split(/\s+/).filter(Boolean).length;
                                            // Alinhado com instructions.md: duração real sem buffers de teste
                                            const wps = wordCount / Math.max(0.1, item.duration);
                                            if (wordCount < 10) return (
                                                <div className="flex items-center gap-1 bg-red-500/10 text-red-500 px-2 py-0.5 rounded text-[10px] font-black uppercase border border-red-500/20 animate-pulse" title={`${wordCount} palavras: MÍNIMO 10 por 5s exigido`}>
                                                    <AlertCircle size={10} /> Pouca Legenda
                                                </div>
                                            );
                                            if (wordCount < 12) return (
                                                <div className="flex items-center gap-1 bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded text-[10px] font-black uppercase border border-amber-500/20" title={`${wordCount} palavras: MÍNIMO 12 recomendadas`}>
                                                    <AlertCircle size={10} /> Cena Curta
                                                </div>
                                            );
                                            if (wps > 3.0) return (
                                                <div className="flex items-center gap-1 bg-red-500/10 text-red-500 px-2 py-0.5 rounded text-[10px] font-black uppercase border border-red-500/20 animate-pulse" title={`${wps.toFixed(1)} palavras/seg`}>
                                                    <AlertTriangle size={10} /> Atropelado
                                                </div>
                                            );
                                            return null;
                                        })()}
                                    </div>
                                    <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-2 flex flex-col gap-2 shadow-lg group hover:border-brand-500/30 transition-all">
                                        {/* Linha de metadados alinhada à largura da imagem - Otimizado para 4 colunas em 1280px */}
                                        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-brand-400">
                                            <span className="bg-brand-500/10 text-brand-400 px-2 py-1 rounded-sm whitespace-nowrap shrink-0 min-w-[2rem] text-center">{index + 1}</span>
                                            <span className="bg-slate-950 px-2 py-1 rounded-full border border-slate-800 font-mono whitespace-nowrap shrink-0 flex-1 text-center text-[11px] leading-none py-1.5">{item.startTimestamp} – {item.endTimestamp}</span>
                                            <span className="text-blue-400 whitespace-nowrap bg-slate-950 px-2 py-1 rounded-full border border-slate-700/50 shrink-0 min-w-[2.5rem] text-center text-[11px]">{item.text.split(/\s+/).filter(Boolean).length}</span>
                                        </div>
                                        <div className={`bg-black rounded-md overflow-hidden relative shadow-inner ${settings.aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'}`}>
                                            {item.imageUrl || item.importedVideoUrl ? (
                                                <>
                                                    {item.importedVideoUrl ? <video src={item.importedVideoUrl} className="w-full h-full object-cover" controls={false} muted autoPlay loop onClick={() => setViewingImageState({ imageUrl: item.importedVideoUrl!, promptData: getPromptData(index), filename: `cena_${index + 1}.mp4`, sourceIndex: index, sourceType: 'scene'})} /> : <img src={item.imageUrl} onClick={() => setViewingImageState({ imageUrl: item.imageUrl!, promptData: getPromptData(index), filename: `cena_${index + 1}.png`, sourceIndex: index, sourceType: 'scene' })} className="w-full h-full object-cover cursor-zoom-in" />}
                                                </>
                                            ) : <div className="w-full h-full flex items-center justify-center opacity-20"><ImageIcon size={48} /></div>}
                                            {(item.isGeneratingGoogle || item.isGeneratingPollinations) && <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-2"><Loader2 className="animate-spin text-brand-400" size={40} /></div>}
                                            <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleGenerateImage(index, globalProvider as any)} title="Recriar Imagem (Manter Prompt)" className="p-2.5 bg-brand-500 hover:bg-brand-400 text-white rounded-full shadow-xl transition-colors"><Zap size={14} /></button>
                                                <button onClick={() => {
                                                    const input = document.createElement('input');
                                                    input.type = 'file';
                                                    input.accept = 'image/*,video/*';
                                                    input.onchange = (e: any) => {
                                                        const file = e.target.files[0];
                                                        if (file) handleManualImageUpload(index, file);
                                                    };
                                                    input.click();
                                                }} title="Upload Manual de Imagem/Vídeo para esta cena" className="p-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-full shadow-xl transition-colors"><Upload size={14} /></button>
                                            </div>
                                        </div>

                                        {/* Assets Presentes na Cena */}
                                        <div className="flex flex-wrap gap-2">
                                            {item.characterIds?.map(charId => {
                                                const char = projectCharacters.find(c => c.id === charId);
                                                if (!char) return null;
                                                return (
                                                    <div key={charId} className="bg-fuchsia-500/10 border border-fuchsia-500/30 px-2.5 py-1 rounded-sm flex items-center gap-1.5 text-[10px] font-black text-fuchsia-400 uppercase tracking-widest">
                                                        <Users size={10} /> {char.name}
                                                    </div>
                                                );
                                            })}
                                            {item.locationIds?.map(locId => {
                                                const loc = projectLocations.find(l => l.id === locId);
                                                if (!loc) return null;
                                                return (
                                                    <div key={locId} className="bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-sm flex items-center gap-1.5 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                                                        <MapPin size={10} /> {loc.name}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="space-y-4">
                                            <textarea 
                                                value={item.text} 
                                                onChange={e => onUpdateItem(index, { text: e.target.value })}
                                                onBlur={() => onForceSave()}
                                                rows={3}
                                                className="bg-slate-950 p-2 rounded-sm border border-slate-800 text-[11px] text-slate-300 w-full resize-none focus:outline-none focus:border-brand-500/50 transition-all leading-relaxed [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800/80 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-700"
                                                placeholder="Texto da cena..."
                                            />
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between px-1">
                                                    <div className="flex items-center gap-2"><Edit3 size={10} className="text-brand-400" /><label className="text-[12px] font-black text-slate-600 uppercase tracking-widest">Editor de Prompt</label></div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                        <span className="text-[0.7rem] font-bold text-amber-500/60 uppercase px-1">Medium</span>
                                                        <input
                                                            value={item.medium || ''}
                                                            placeholder={activeStylePrompt ? activeStylePrompt.split(',')[0].trim() : "Ex: Cinematic, 3D..."}
                                                            onChange={e => onUpdateItem(index, { medium: e.target.value })}
                                                            className={`w-full bg-slate-950 border border-slate-800 rounded-sm p-2 text-[11px] outline-none focus:border-amber-500/50 transition-colors ${!item.medium && activeStylePrompt ? 'text-slate-500 italic' : 'text-slate-300'}`}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <span className="text-[0.7rem] font-bold text-purple-500/60 uppercase px-1">Camera</span>
                                                        <input value={item.camera || ''} onChange={e => onUpdateItem(index, { camera: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-sm p-2 text-[11px] text-slate-300 outline-none focus:border-purple-500/50" placeholder="Ex: Close-up, Wide..." />
                                                    </div>
                                                </div>

                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center px-1">
                                                        <span className="text-[0.7rem] font-bold text-fuchsia-500/60 uppercase">Subject</span>
                                                        {!item.subject && projectCharacters.some(c => item.characterIds?.includes(c.id)) && <span className="text-[0.55rem] text-fuchsia-500/40 italic uppercase tracking-tighter">Auto-Link Ativo</span>}
                                                    </div>
                                                    <input
                                                        value={item.subject || ''}
                                                        placeholder={(() => {
                                                            const relevantChars = projectCharacters.filter(c => item.characterIds?.includes(c.id));
                                                            return relevantChars.length > 0 ? relevantChars.map(c => c.name).join(", ") : "Personagem ou Assunto Principal...";
                                                        })()}
                                                        onChange={e => onUpdateItem(index, { subject: e.target.value })}
                                                        className={`w-full bg-slate-950 border border-slate-800 rounded-sm p-2 text-[11px] outline-none focus:border-fuchsia-500/50 transition-colors ${!item.subject && projectCharacters.some(c => item.characterIds?.includes(c.id)) ? 'text-slate-500 italic' : 'text-slate-300'}`}
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between px-1">
                                                        <span className="text-[0.7rem] font-bold text-white/40 uppercase">Action</span>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    const prompt = `Given this scene context, generate ONE new highly cinematic action description in English (max 25 words). Style: Conceptual Surrealism or Magical Realism. Be dramatic, use dynamic verbs, volumetric lighting cues, and visual symbolism. Subject: "${item.subject || 'unknown'}", Scenario: "${item.cenario || 'unknown'}", Text: "${item.text || ''}"\n\nReturn ONLY the action string, no JSON, no quotes, no prefix.`;
                                                                    const newAction = await generateText(prompt, TEXT_MODEL_NAME);
                                                                    if (newAction?.trim()) onUpdateItem(index, { action: newAction.trim() });
                                                                } catch(e) { console.warn('Falha ao regenerar action', e); }
                                                            }}
                                                            title="Regenerar Action com IA"
                                                            className="p-1 text-slate-600 hover:text-brand-400 transition-colors"
                                                        >
                                                            <RefreshCw size={11} />
                                                        </button>
                                                    </div>
                                                    <textarea value={item.action || ''} onChange={e => onUpdateItem(index, { action: e.target.value })} rows={6} className="w-full bg-slate-950 border border-slate-800 rounded-sm p-2 text-[11px] text-slate-300 outline-none focus:border-white/20 resize-none custom-scrollbar" placeholder="Ação criativa (Surrealismo, Simbolismo, Metáforas)..." />
                                                </div>

                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center px-1">
                                                        <span className="text-[0.7rem] font-bold text-emerald-500/60 uppercase">Scenario</span>
                                                        {!item.cenario && projectLocations.some(l => item.locationIds?.includes(l.id)) && <span className="text-[0.55rem] text-emerald-500/40 italic uppercase tracking-tighter">Auto-Link Ativo</span>}
                                                    </div>
                                                    <input
                                                        value={item.cenario || ''}
                                                        placeholder={(() => {
                                                            const relevantLocs = projectLocations.filter(l => item.locationIds?.includes(l.id));
                                                            return relevantLocs.length > 0 ? relevantLocs.map(l => l.name).join(", ") : "Cenário ou Ambiente...";
                                                        })()}
                                                        onChange={e => onUpdateItem(index, { cenario: e.target.value })}
                                                        className={`w-full bg-slate-950 border border-slate-800 rounded-sm p-2 text-[11px] outline-none focus:border-emerald-500/50 transition-colors ${!item.cenario && projectLocations.some(l => item.locationIds?.includes(l.id)) ? 'text-slate-500 italic' : 'text-slate-300'}`}
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <span className="text-[0.7rem] font-bold text-sky-500/60 uppercase px-1">Animation (Motion)</span>
                                                    <textarea value={item.animation || ''} onChange={e => onUpdateItem(index, { animation: e.target.value })} className="w-full h-10 bg-slate-950 border border-slate-800 rounded-sm p-2 text-[11px] text-slate-300 outline-none focus:border-sky-500/50 resize-none custom-scrollbar" placeholder="Motion prompt for Runway/Luma..." />
                                                </div>

                                                <div className="space-y-2 pt-2 border-t border-white/5">
                                                    <label className="text-[12px] font-black text-slate-600 uppercase tracking-widest px-1">Preview Visual (Cores)</label>
                                                    <ColoredPrompt promptData={getPromptData(index)} className="w-full h-auto min-h-16 bg-slate-950/50 border border-slate-800 rounded-md p-2 text-[11px] font-mono shadow-inner" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {
                (activeTab === 'characters' || activeTab === 'locations') && (
                    <div className="flex flex-col gap-3 pb-32">
                        <div className="flex justify-between items-center">
                            <h2 className="text-[11px] font-black text-white uppercase tracking-tight">
                                {activeTab === 'characters' ? 'Gerenciar Personagens' : 'Gerenciar Cenários'}
                            </h2>
                            <button 
                                onClick={() => handleAddAsset(activeTab as any)}
                                className="px-2 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-sm text-[11px] font-black uppercase flex items-center gap-2 shadow-lg transition-all active:scale-95"
                            >
                                <Plus size={16} /> Adicionar {activeTab === 'characters' ? 'Personagem' : 'Cenário'}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                        {(activeTab === 'characters' ? projectCharacters : projectLocations).map((asset, index) => (
                            <div key={asset.id} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-3 flex flex-col gap-5 shadow-lg group hover:border-brand-500/30 transition-all">
                                <div className="flex justify-between items-center text-[11px] font-black uppercase text-brand-400">
                                    <span className={`px-2 py-1 rounded text-[11px] font-black ${activeTab === 'characters' ? 'bg-fuchsia-500/10 text-fuchsia-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                        {activeTab === 'characters' ? 'PERSONAGEM' : 'CENÁRIO'} #{index + 1}
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] font-black text-slate-600 tracking-widest">{getAssetOccurrence(asset.id, activeTab === 'characters' ? 'char' : 'loc')}</span>
                                        <button 
                                            onClick={() => handleDeleteAsset(asset.id, activeTab as any)}
                                            className="text-slate-600 hover:text-red-500 transition-colors"
                                            title="Excluir"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div className="aspect-square bg-black rounded-md overflow-hidden relative shadow-inner cursor-zoom-in">
                                    {asset.imageUrl ? (
                                        <img
                                            src={asset.imageUrl}
                                            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                                            onClick={() => setViewingImageState({
                                                imageUrl: asset.imageUrl!,
                                                promptData: { characterDescription: activeTab === 'characters' ? asset.description : '', locationDescription: activeTab === 'locations' ? asset.description : '', style: `style: ${activeStylePrompt}` },
                                                filename: `${asset.name}.png`
                                            })}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center opacity-20">
                                            {activeTab === 'characters' ? <Users size={48} /> : <MapPin size={48} />}
                                        </div>
                                    )}
                                    {(asset.isGeneratingGoogle || asset.isGeneratingPollinations) && <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-2"><Loader2 className="animate-spin text-brand-400" size={40} /></div>}
                                    <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                        <button 
                                            onClick={() => handleGenerateAssetImage(asset, activeTab as any)} 
                                            className="p-2.5 bg-brand-500 text-white rounded-full shadow-xl hover:bg-brand-400 transition-all active:scale-95"
                                            title="Gerar Única (Padrão)"
                                        >
                                            <Zap size={14} />
                                        </button>
                                        <button 
                                            onClick={() => handleCompareModels(asset, activeTab as any)} 
                                            className="px-3 py-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white rounded-sm shadow-xl hover:border-brand-500 transition-all active:scale-95 flex items-center gap-2"
                                        >
                                            <Sparkles size={12} className="text-brand-400" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">MODELO</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-1 px-1">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[0.7rem] font-black text-brand-400 uppercase tracking-widest">Apelido (Vai pro Prompt)</label>
                                            <input
                                                value={asset.name}
                                                placeholder="Ex: ExplorerRafael"
                                                onChange={e => {
                                                    const list = activeTab === 'characters' ? [...projectCharacters] : [...projectLocations];
                                                    onUpdateProjectInfo(activeTab as any, list.map(a => a.id === asset.id ? { ...a, name: e.target.value } : a));
                                                }}
                                                className="bg-transparent text-[11px] font-black text-white uppercase tracking-tight italic outline-none border-b border-transparent focus:border-brand-500/30"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-0.5 mt-1">
                                            <label className="text-[0.7rem] font-black text-slate-600 uppercase tracking-widest">Nome Real (Apenas Interno)</label>
                                            <input
                                                value={asset.realName || ''}
                                                placeholder="Ex: Rafael"
                                                onChange={e => {
                                                    const list = activeTab === 'characters' ? [...projectCharacters] : [...projectLocations];
                                                    onUpdateProjectInfo(activeTab as any, list.map(a => a.id === asset.id ? { ...a, realName: e.target.value } : a));
                                                }}
                                                className="bg-transparent text-[11px] font-bold text-slate-400 uppercase tracking-widest outline-none border-b border-transparent focus:border-brand-500/30"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex flex-col gap-1 px-1">
                                            <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Token Estético (Editável)</label>
                                            <p className="text-[0.7rem] text-slate-500 italic leading-tight">
                                                {activeTab === 'characters'
                                                    ? "REGRA DE OURO: Descreva apenas matéria física (pele, cabelo, roupa). Sem nomes reais ou termos de estilo."
                                                    : "MASTER BLOCK: Estrutura, Ancoragem, Materiais e Iluminação."}
                                            </p>
                                        </div>
                                        <textarea value={asset.description} onChange={e => {
                                            const list = activeTab === 'characters' ? [...projectCharacters] : [...projectLocations];
                                            onUpdateProjectInfo(activeTab as any, list.map(a => a.id === asset.id ? { ...a, description: e.target.value } : a));
                                        }} className="w-full h-24 bg-slate-950 border border-slate-800 rounded-md p-2 text-[13px] font-mono text-slate-300 outline-none focus:border-brand-500 shadow-inner resize-none custom-scrollbar" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest px-1">Visualização do Motor</label>
                                        <div className="w-full h-24 bg-slate-950/50 border border-slate-800 rounded-md p-2 text-[13px] font-mono overflow-y-auto scrollbar-hide shadow-inner">
                                            <span className={activeTab === 'characters' ? "text-fuchsia-400 font-bold" : "text-emerald-400 font-bold"}>
                                                {asset.description}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        </div>
                    </div>
                )
            }

            {
                activeTab === 'props' && (
                    <div className="flex flex-col gap-3 pb-32">
                        <div className="flex justify-between items-center">
                            <h2 className="text-[11px] font-black text-white uppercase tracking-tight">Gerenciar Objetos (Props)</h2>
                            <button 
                                onClick={() => handleAddAsset('props')}
                                className="px-2 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-sm text-[11px] font-black uppercase flex items-center gap-2 shadow-lg transition-all active:scale-95"
                            >
                                <Plus size={16} /> Adicionar Objeto
                            </button>
                        </div>
                        {projectProps.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-32 text-slate-600 gap-3">
                                <div className="w-24 h-24 rounded-md bg-amber-500/5 border border-amber-500/20 flex items-center justify-center">
                                    <Box size={40} className="text-amber-500/30" />
                                </div>
                                <div className="text-center space-y-2">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Nenhum Objeto Detectado</p>
                                    <p className="text-[11px] text-slate-600 max-w-sm">
                                        Objetos/itens com destaque narrativo (armas, relíquias, etc.) são detectados automaticamente na próxima geração de cenas.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                {projectProps.map((prop, index) => (
                                    <div key={prop.id} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-3 flex flex-col gap-5 shadow-lg group hover:border-amber-500/30 transition-all">
                                        <div className="flex justify-between items-center text-[11px] font-black uppercase">
                                            <span className="bg-amber-500/10 text-amber-400 px-2 py-1 rounded text-[11px] font-black">
                                                OBJETO #{index + 1}
                                            </span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[11px] font-black text-slate-600 tracking-widest">{getAssetOccurrence(prop.id, 'prop')} CENAS</span>
                                                <button 
                                                    onClick={() => handleDeleteAsset(prop.id, 'props')}
                                                    className="text-slate-600 hover:text-red-500 transition-colors"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="aspect-square bg-black rounded-md overflow-hidden relative shadow-inner cursor-zoom-in">
                                            {prop.imageUrl ? (
                                                <img
                                                    src={prop.imageUrl}
                                                    className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                                                    onClick={() => setViewingImageState({
                                                        imageUrl: prop.imageUrl!,
                                                        promptData: { action: prop.description, style: `style: ${activeStylePrompt}` },
                                                        filename: `${prop.name}.png`
                                                    })}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center opacity-20">
                                                    <Box size={48} />
                                                </div>
                                            )}
                                            {(prop.isGeneratingGoogle || prop.isGeneratingPollinations) && <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-2"><Loader2 className="animate-spin text-amber-400" size={40} /></div>}
                                            <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                                <button 
                                                    onClick={() => handleGenerateAssetImage(prop, 'props')} 
                                                    className="p-2.5 bg-amber-500 text-white rounded-full shadow-xl hover:bg-amber-400 transition-all active:scale-95"
                                                    title="Gerar Única (Padrão)"
                                                >
                                                    <Zap size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleCompareModels(prop, 'props')} 
                                                    className="px-3 py-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white rounded-sm shadow-xl hover:border-amber-500 transition-all active:scale-95 flex items-center gap-2"
                                                >
                                                    <Sparkles size={12} className="text-amber-400" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">MODELO</span>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex flex-col gap-1 px-1">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[0.7rem] font-black text-amber-400 uppercase tracking-widest">Nome do Objeto</label>
                                                    <input
                                                        value={prop.name}
                                                        onChange={e => {
                                                            onUpdateProjectInfo('props', projectProps.map(p => p.id === prop.id ? { ...p, name: e.target.value } : p));
                                                        }}
                                                        className="bg-transparent text-[11px] font-black text-white uppercase tracking-tight italic outline-none border-b border-transparent focus:border-amber-500/30"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-0.5 mt-1">
                                                    <label className="text-[0.7rem] font-black text-slate-600 uppercase tracking-widest">Nome Real (Opcional)</label>
                                                    <input
                                                        value={prop.realName || ''}
                                                        placeholder="Ex: Espada"
                                                        onChange={e => {
                                                            onUpdateProjectInfo('props', projectProps.map(p => p.id === prop.id ? { ...p, realName: e.target.value } : p));
                                                        }}
                                                        className="bg-transparent text-[11px] font-bold text-slate-400 uppercase tracking-widest outline-none border-b border-transparent focus:border-amber-500/30"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex flex-col gap-1 px-1">
                                                    <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Token Físico (Editável)</label>
                                                    <p className="text-[0.7rem] text-slate-500 italic leading-tight">
                                                        7 variáveis obrigatórias: tipo, material, cor, textura, tamanho/forma, estado, detalhes únicos.
                                                    </p>
                                                </div>
                                                <textarea
                                                    value={prop.description}
                                                    onChange={e => {
                                                        onUpdateProjectInfo('props', projectProps.map(p => p.id === prop.id ? { ...p, description: e.target.value } : p));
                                                    }}
                                                    className="w-full h-28 bg-slate-950 border border-slate-800 rounded-md p-2 text-[13px] font-mono text-slate-300 outline-none focus:border-amber-500 shadow-inner resize-none custom-scrollbar"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest px-1">Visualização do Motor</label>
                                                <div className="w-full h-16 bg-slate-950/50 border border-slate-800 rounded-md p-2 text-[13px] font-mono overflow-y-auto scrollbar-hide shadow-inner">
                                                    <span className="text-amber-400 font-bold">{prop.description}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            }

            {
                activeTab === 'titles' && (
                    <div className="space-y-12 pb-32">
                        <div className="bg-slate-900/50 p-12 rounded-[3rem] border border-slate-800 text-center space-y-8 shadow-2xl relative overflow-hidden group">
                            <div className="bg-brand-500/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto border border-brand-500/20 shadow-inner"><Target className="text-brand-400" size={48} /></div>
                            <div className="space-y-4 max-w-2xl mx-auto"><h2 className="text-[11px] font-black text-white uppercase tracking-tighter">Engenharia de <span className="text-brand-400">CTR Ninja</span></h2></div>
                            <button onClick={handleGenerateTitles} disabled={isGeneratingTitles} className="bg-brand-500 hover:bg-brand-400 text-white px-12 py-5 rounded-[2rem] font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl transition-all flex items-center gap-2 mx-auto active:scale-95">{isGeneratingTitles ? <Loader2 size={24} className="animate-spin" /> : <Zap size={24} />} Gerar Títulos Magnéticos</button>
                        </div>
                        {generatedTitles.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {generatedTitles.map((item, idx) => {
                                    const isGenerating = generatingThumbnailMap[idx];
                                    const currentImageUrl = (item as any).imageUrl;

                                    return (
                                        <div key={idx} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col gap-3 hover:border-brand-500/30 transition-all shadow-xl group relative">
                                            <div className="flex justify-between items-start">
                                                <div className="bg-slate-950 px-2 py-2 rounded-sm text-brand-400 font-black text-[11px] uppercase border border-slate-800">Rank #{idx + 1}</div>
                                                <span className="text-slate-500 font-black text-[11px]">{item.viralityScore}% CTR</span>
                                            </div>
                                            <h3 className="text-[11px] font-black uppercase tracking-tight text-slate-200 whitespace-pre-line leading-tight">{item.title}</h3>

                                            {currentImageUrl && (
                                                <div className={`w-full rounded-md overflow-hidden border border-slate-800 shadow-2xl relative group-hover:border-brand-500 transition-all cursor-zoom-in ${settings.aspectRatio === '9:16' ? 'aspect-[9/16] w-1/2 mx-auto' : 'aspect-video'}`} onClick={() => setViewingImageState({ imageUrl: currentImageUrl, promptData: { action: item.thumbnailVisual, style: activeStylePrompt }, filename: `thumbnail_${idx + 1}.png` })}>
                                                    <img src={currentImageUrl} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-md p-3 text-center">
                                                        <span className="text-white font-black italic uppercase text-[11px] tracking-tight">"{item.thumbnailText}"</span>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="bg-slate-950/40 p-2 rounded-md border border-slate-800 space-y-3">
                                                <p className="text-brand-400 text-[11px] font-black uppercase tracking-widest flex items-center gap-2"><Layers size={12} /> Gatilho & Lógica</p>
                                                <p className="text-slate-500 text-[11px] italic">"{item.explanation}"</p>
                                            </div>
                                            <div className="bg-slate-950/40 p-2 rounded-md border border-slate-800 space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <p className="text-emerald-400 text-[11px] font-black uppercase tracking-widest flex items-center gap-2"><ImageIcon size={12} /> Sugestão de Thumbnail</p>
                                                    <button
                                                        onClick={() => handleGenerateThumbnail(idx)}
                                                        disabled={isGenerating}
                                                        className="bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-1.5 rounded-sm text-[11px] font-black uppercase flex items-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                                                    >
                                                        {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                                                        {currentImageUrl ? 'Regerar Thumbnail' : 'Criar Thumbnail'}
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-[11px] text-slate-500 uppercase font-black tracking-widest">Visual:</p>
                                                    <p className="text-slate-300 text-[11px]">{item.thumbnailVisual}</p>
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-[11px] text-slate-500 uppercase font-black tracking-widest">Texto na Imagem:</p>
                                                    <p className="text-emerald-300 font-black uppercase text-[11px] italic">"{item.thumbnailText}"</p>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-slate-800/50">
                                                <button onClick={() => { navigator.clipboard.writeText(item.title); alert("Copiado!"); }} className="text-brand-400 text-[11px] font-black uppercase">Copiar Título</button>
                                                {item.abWinnerReason && <span className="text-[11px] font-black text-slate-700 uppercase">A/B Winner Priority</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )
            }
            {viewingImageState && (
                <ImageViewer 
                    imageUrl={viewingImageState.imageUrl} 
                    promptData={viewingImageState.promptData} 
                    filename={viewingImageState.filename} 
                    onClose={() => setViewingImageState(null)} 
                    onNext={() => {
                        let nextIdx = viewingImageState.sourceIndex! + 1;
                        if (nextIdx >= data.length) nextIdx = 0;
                        setViewingImageState({
                            ...viewingImageState,
                            imageUrl: data[nextIdx].imageUrl || data[nextIdx].importedVideoUrl || data[nextIdx].pollinationsImageUrl || data[nextIdx].googleImageUrl || '',
                            promptData: getPromptData(nextIdx),
                            filename: `CENA_${nextIdx + 1}.${data[nextIdx].importedVideoUrl ? 'MP4' : 'PNG'}`,
                            sourceIndex: nextIdx
                        });
                    }}
                    onPrev={() => {
                        let prevIdx = viewingImageState.sourceIndex! - 1;
                        if (prevIdx < 0) prevIdx = data.length - 1;
                        setViewingImageState({
                            ...viewingImageState,
                            imageUrl: data[prevIdx].imageUrl || data[prevIdx].importedVideoUrl || data[prevIdx].pollinationsImageUrl || data[prevIdx].googleImageUrl || '',
                            promptData: getPromptData(prevIdx),
                            filename: `CENA_${prevIdx + 1}.${data[prevIdx].importedVideoUrl ? 'MP4' : 'PNG'}`,
                            sourceIndex: prevIdx
                        });
                    }}
                />
            )}

            {/* Modal de Comparação de Modelos (MODELO) */}
            {isComparing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 bg-slate-950/90 backdrop-blur-xl">
                    <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                        <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/80">
                            <div>
                                <h3 className="text-[11px] font-black text-white uppercase tracking-tighter flex items-center gap-3">
                                    <Sparkles className="text-brand-400" size={24} /> 
                                    Comparar Modelos de IA
                                </h3>
                                <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mt-1">
                                    Escolha o melhor visual para definir o padrão do projeto
                                </p>
                            </div>
                            <button 
                                onClick={() => setIsComparing(false)}
                                className="p-3 bg-slate-800 text-slate-400 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-lg"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {comparisonResults.map((res) => (
                                    <div key={res.modelId} className="group flex flex-col gap-2">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">{res.label}</span>
                                            {res.loading && <Loader2 className="animate-spin text-brand-400" size={16} />}
                                        </div>
                                        
                                        <div className="aspect-square bg-black rounded-[2rem] overflow-hidden relative border-2 border-slate-800 group-hover:border-brand-500/50 transition-all shadow-2xl">
                                            {res.imageUrl ? (
                                                <>
                                                    <img src={res.imageUrl} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                                        <button 
                                                            onClick={() => handleSelectModel(res.modelId, res.imageUrl)}
                                                            className="bg-brand-500 hover:bg-brand-400 text-white px-8 py-3 rounded-full font-black uppercase text-[11px] tracking-widest shadow-2xl transform translate-y-4 group-hover:translate-y-0 transition-all active:scale-95"
                                                        >
                                                            Escolher este Estilo
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-700">
                                                    {res.loading ? (
                                                        <>
                                                            <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                                <div className="h-full bg-brand-500 animate-[loading_2s_ease-in-out_infinite]" style={{ width: '40%' }}></div>
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">Gerando...</span>
                                                        </>
                                                    ) : (
                                                        res.error ? (
                                                            <div className="text-center p-3 space-y-2">
                                                                <Ban className="mx-auto text-red-500/50" size={32} />
                                                                <p className="text-[10px] text-red-400 font-bold uppercase leading-tight">{res.error}</p>
                                                            </div>
                                                        ) : <Monitor size={48} />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        <div className="p-8 bg-slate-950/50 border-t border-slate-800 text-center">
                            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-[0.3em]">
                                O modelo escolhido será aplicado automaticamente em todas as novas gerações de cena
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
