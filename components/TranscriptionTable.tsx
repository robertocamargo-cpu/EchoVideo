
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Clapperboard, Download, Edit3, FileArchive, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, MapPin, Monitor, Play, PlayCircle, Sparkles, Type, Upload, Users, Video, X, Zap, Ban, Activity, Wallet, Target, Layers, Video as VideoIcon, HelpCircle, Box } from 'lucide-react';
import { TranscriptionItem, AppSettings, TransitionType, ViralTitle, MasterAsset, MotionEffect } from '../types';
import { generateImage, generateViralTitles, getApiInfrastructure, generateText, TEXT_MODEL_NAME, IMAGEN_MODEL_NAME, IMAGE_MODEL_NAME } from '../services/geminiService';
import { generatePollinationsImage } from '../services/pollinationsService';
import { logApiCost } from '../services/usageService';
import { generateTimelineVideo, generatePreviewVideo, generatePresetSRT } from '../services/videoService';
import { getMotionEffects, uploadProjectFile } from '../services/storageService';
import { TimelineVisual } from './TimelineVisual';
import { ImageViewer } from './ImageViewer';
import { ColoredPrompt } from './ColoredPrompt';
import JSZip from 'jszip';

interface TranscriptionTableProps {
    data: TranscriptionItem[];
    onUpdateItem: (index: number, item: Partial<TranscriptionItem>) => void;
    audioFile: File | null;
    audioDuration: number;
    onAudioAttached: (file: File) => void;
    settings: AppSettings;
    onSave: (project: any) => void;
    context: string;
    projectCharacters: MasterAsset[];
    projectLocations: MasterAsset[];
    activeStylePrompt: string;
    onUpdateProjectInfo: (field: 'characters' | 'locations' | 'props', value: MasterAsset[]) => void;
    onUpdateGlobalSetting: (field: keyof AppSettings, value: any) => void;
    projectName?: string;
    projectId?: string;
    projectProps: MasterAsset[];
    selectedStyleId: string;
    onStyleChange: (id: string) => void;
    onForceSave?: () => void;
    project?: any; // Adicionado para persistência correta
}

type TabMode = 'scenes' | 'characters' | 'locations' | 'props' | 'titles';

export const TranscriptionTable: React.FC<TranscriptionTableProps> = ({
    data, onUpdateItem, audioFile, audioDuration, settings, onSave, project, context, projectCharacters, projectLocations, projectProps, activeStylePrompt, onUpdateProjectInfo, onUpdateGlobalSetting, projectName = 'projeto-sem-nome', projectId, selectedStyleId, onStyleChange, onForceSave
}) => {
    const [activeTab, setActiveTab] = useState<TabMode>('scenes');
    const [isVideoGenerating, setIsVideoGenerating] = useState(false);
    const [videoProgress, setVideoProgress] = useState(0);
    const [videoStatus, setVideoStatus] = useState('');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [showVideoSettings, setShowVideoSettings] = useState(false);
    const [includeSubtitles, setIncludeSubtitles] = useState<boolean>(true);
    const [viewingImageState, setViewingImageState] = useState<{ imageUrl: string, promptData: any, filename: string, sourceIndex?: number, sourceType?: 'scene' | 'thumbnail' } | null>(null);
    const [globalProvider, setGlobalProvider] = useState<'google-nano' | 'google-imagen' | 'pollinations' | 'pollinations-zimage'>('google-nano');
    const [generatedTitles, setGeneratedTitles] = useState<ViralTitle[]>([]);
    const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);
    const [generatingThumbnailMap, setGeneratingThumbnailMap] = useState<Record<number, boolean>>({});
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isGeneratingAll, setIsGeneratingAll] = useState(false);
    const [motionEffects, setMotionEffects] = useState<MotionEffect[]>([]);
    const [selectedSubtitlePresetId, setSelectedSubtitlePresetId] = useState<string>('');
    const [renderElapsed, setRenderElapsed] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const renderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [apiInfo, setApiInfo] = useState<{ type: string, isPremium: boolean }>({ type: 'STANDARD', isPremium: false });

    const bulkAbortRef = useRef<boolean>(false);
    const importInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        refreshApiInfo();
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

    const getPromptData = (index: number, overrideItem?: Partial<TranscriptionItem>) => {
        const item = overrideItem ? { ...data[index], ...overrideItem } : data[index];
        const relevantChars = projectCharacters.filter(c => item.characterIds?.includes(c.id));
        const relevantLocs = projectLocations.filter(l => item.locationIds?.includes(l.id));
        const relevantProps = projectProps.filter(p => item.propIds?.includes(p.id) || (item as any).prop_ids?.includes(p.id));

        // (1) MEDIUM - Override manual > Estilo Global
        const medium = item.medium || (activeStylePrompt ? activeStylePrompt.split(',')[0].trim() : '');

        // (2) SUBJECT / PERSONAGEM & PROPS (OBJETOS)
        let subject = item.subject || '';

        // Avalia individualmente se a descrição do personagem já está no Subject gerado pelo Gemini
        if (relevantChars.length > 0) {
            relevantChars.forEach(c => {
                if (c.description && !subject.includes(c.description)) {
                    // Se não encontrar exatamente a descrição do personagem, apenda no subject.
                    subject = subject ? `${subject}, ${c.description}` : c.description;
                }
            });
        }

        // Apenda também as características dos Objetos (Props) no Subject para consistência em todas as imagens
        let propsPrompt = ''; // Mantido vazio para retrocompatibilidade no retorno
        if (relevantProps.length > 0) {
            relevantProps.forEach(p => {
                if (p.description && !subject.includes(p.description)) {
                    subject = subject ? `${subject}, Object: ${p.description}` : `Object: ${p.description}`;
                }
            });
        } else if (item.props && !subject.includes(item.props)) {
            subject = subject ? `${subject}, Objects: ${item.props}` : `Objects: ${item.props}`;
        }

        // (3) ACTION / SYMBOLISM - Clean and concise
        let action = (item.action || item.imagePrompt || '')
            .replace(/style:.*$/gi, '')
            .replace(/master cinematic.*$/gi, '')
            .trim();

        // Ensure legacy strings are removed from the action text
        const parts = action.split(/,(?:\s*)Strictly:|,(?:\s*)Visual Integrity:/i);
        action = parts[0].trim();

        // (4) CENARIO / LOCATION - Override manual > Locais Vinculados
        let cenario = item.cenario || '';
        if (!cenario && relevantLocs.length > 0) {
            // Apenas a descrição detalhada das características do cenário.
            cenario = relevantLocs.map(l => l.description).join(" ");
        }

        // Quantidade de personagens explícita (para imagem)
        const charCountPrompt = relevantChars.length > 1 ? `Quantity: ${relevantChars.length} characters` : '';

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
            finalPrompt += `Estilo de imagem: ${styleName} - ${activeStylePrompt}. `;
        } else if (stylePrompt || medium) {
            finalPrompt += `Estilo de imagem: ${styleName} - ${stylePrompt} ${medium ? `(${medium})` : ''}. `;
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

        if (subject) finalPrompt += `Subject: ${cleanText(subject)} ${charCountPrompt}. `;
        if (action) finalPrompt += `Action: ${cleanText(action)}. `;
        if (camera) finalPrompt += `Camera: ${cleanText(camera)}. `;
        if (propsPrompt) finalPrompt += `Object: ${cleanText(propsPrompt)}. `;
        if (cenario) finalPrompt += `Cenário: ${cleanText(cenario)}. `;

        finalPrompt += `Visual Integrity: "Pure image only: all surfaces are blank and free of any text or letters."`;

        const forbiddenWords = ["nude", "naked", "sex", "violence", "blood", "gore", "photorealistic", "realistic"];
        forbiddenWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            finalPrompt = finalPrompt.replace(regex, '');
        });

        // Limpeza de espaços extras
        finalPrompt = finalPrompt.replace(/\s+/g, ' ').replace(/\s*\.\s*\./g, '.').replace(/,\s*,/g, ',').replace(/, ,/g, ',').trim();

        return { medium, subject, action, cenario, propsPrompt, style: stylePrompt, camera, negative: '', finalPrompt };
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
            return item.animation || 'Nenhuma ideia de animação gerada';
        }).join('\n\n');
        const blob = new Blob([exportedContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const sanitizedName = sanitizeFilename(projectName);
        link.download = `${sanitizedName}_prompts_animacao.txt`;
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

        // 2. Ideias de Animação
        const animationContent = data.map(item => item.animation || 'Nenhuma ideia de animação gerada').join('\n\n');
        zip.file(`${sanitizeFilename(projectName)}_prompts_animacao.txt`, animationContent);

        // 3. Planilha CSV
        const headers = ["Número da Cena", "Total de Segundos", "Nome da Imagem", "Texto da Legenda"];
        const rows = data.map((item, index) => [(index + 1).toString(), item.duration.toFixed(3), item.filename, `"${item.text.replace(/"/g, '""')}"`]);
        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        zip.file(`${sanitizeFilename(projectName)}-cenas.csv`, "\ufeff" + csvContent);

        // 4. Arquivo de Áudio Original
        if (audioFile) {
            zip.file(audioFile.name || 'audio_original.wav', audioFile);
        } else if (project?.audioUrl) {
            try {
                const audioRes = await fetch(project.audioUrl);
                if (audioRes.ok) zip.file(`audio_original.wav`, await audioRes.blob());
            } catch (e) {
                console.warn("Could not fetch remote audio for zip", e);
            }
        }

        const folder = zip.folder("midias_projeto");
        if (!folder) return;
        setIsVideoGenerating(true);
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

    const handleGenerateImage = async (index: number, provider: 'google-nano' | 'google-imagen' | 'pollinations' | 'pollinations-zimage', overrideItem?: Partial<TranscriptionItem>) => {
        // Limpar a imagem anterior para feedback visual de regeneração
        onUpdateItem(index, {
            ...overrideItem,
            imageUrl: '',
            importedVideoUrl: '',
            googleImageUrl: '',
            pollinationsImageUrl: '',
            [!provider.startsWith('pollinations') ? 'isGeneratingGoogle' : 'isGeneratingPollinations']: true
        });

        try {
            const pData = getPromptData(index, overrideItem);
            const isPol = provider.startsWith('pollinations');
            const isPollinationsZ = provider === 'pollinations-zimage';
            const isGoogleImagen = provider === 'google-imagen';
            const polModel = isPollinationsZ ? 'zimage' : 'flux';
            const geminiModel = isGoogleImagen ? IMAGEN_MODEL_NAME : IMAGE_MODEL_NAME;

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
                    const filename = data[index].filename || `scene_${index + 1}.png`;
                    const publicUrl = await uploadProjectFile(projectId, blob, 'image', filename);
                    // Adiciona o cache buster ?v=timestamp para forçar a atualização visual da UI
                    if (publicUrl) finalImageUrl = `${publicUrl}?v=${Date.now()}`;
                } catch (uploadErr) {
                    console.warn('[TranscriptionTable] Falha no upload da imagem ao Storage, usando base64:', uploadErr);
                }
            }
            onUpdateItem(index, {
                [!isPol ? 'googleImageUrl' : 'pollinationsImageUrl']: result.image,
                [!isPol ? 'isGeneratingGoogle' : 'isGeneratingPollinations']: false,
                selectedProvider: provider,
                imageUrl: finalImageUrl,
                importedVideoUrl: '', // LIMPAR VÍDEO IMPORTADO AO GERAR IMAGEM
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

    const handleGenerateAssetImage = async (asset: MasterAsset, type: 'characters' | 'locations' | 'props') => {
        const provider = globalProvider;
        const updateList = (update: Partial<MasterAsset>) => {
            const list = type === 'characters' ? [...projectCharacters] : type === 'locations' ? [...projectLocations] : [...projectProps];
            const newList: MasterAsset[] = list.map(a => a.id === asset.id ? { ...a, ...update } : a);
            onUpdateProjectInfo(type, newList);
        };
        updateList({ [!provider.startsWith('pollinations') ? 'isGeneratingGoogle' : 'isGeneratingPollinations']: true });
        try {
            const assetPrompt = `${asset.description} style: ${activeStylePrompt}, Visual Integrity: "Pure image only: all surfaces are blank and free of any text or letters."`;
            const isPollinationsZ = provider === 'pollinations-zimage';
            const isGoogleImagen = provider === 'google-imagen';
            const isGoogleNano = provider === 'google-nano';

            const assetFinalProvider = (provider === 'pollinations' || provider === 'pollinations-zimage') ? 'pollinations' : 'google';
            const polModel = isPollinationsZ ? 'zimage' : 'flux';
            const geminiModel = isGoogleImagen ? IMAGEN_MODEL_NAME : IMAGE_MODEL_NAME;

            const result = assetFinalProvider === 'google'
                ? await generateImage(assetPrompt, '1:1' as any, geminiModel)
                : await generatePollinationsImage(assetPrompt, polModel, "", '16:9');

            // Se a imagem for uma URL (ex: Pollinations), adiciona cache buster para forçar a atualização visual
            const finalImageUrl = result.image.startsWith('data:') ? result.image : `${result.image}?v=${Date.now()}`;
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
            const provider = globalProvider;
            const result = provider === 'google'
                ? await generateImage(prompt, settings.aspectRatio)
                : await generatePollinationsImage(prompt, "", "", settings.aspectRatio);

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
        setVideoStatus("Sincronizando Master...");
        setRenderElapsed(0);

        // Timer de render
        const startTime = Date.now();
        if (renderTimerRef.current) clearInterval(renderTimerRef.current);
        renderTimerRef.current = setInterval(() => {
            setRenderElapsed((Date.now() - startTime) / 1000);
        }, 1000);

        const sub = includeSubtitles ? settings.subtitleStyles.find(s => s.id === (selectedSubtitlePresetId || (settings.aspectRatio === '16:9' ? 'horizontal-16-9' : 'vertical-9-16'))) : undefined;
        try {
            const blob = await generateTimelineVideo(audioFile, data, TransitionType.CUTAWAY, (p, msg) => { setVideoProgress(p); setVideoStatus(msg); }, settings.aspectRatio, sub, motionEffects);
            if (renderTimerRef.current) clearInterval(renderTimerRef.current);
            const url = URL.createObjectURL(blob);
            setVideoUrl(url);

            const sanitizedName = sanitizeFilename(projectName);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${sanitizedName}.webm`;
            link.click();
        } catch (e: any) {
            if (renderTimerRef.current) clearInterval(renderTimerRef.current);
            setVideoStatus("Erro de processamento.");
        } finally { setIsVideoGenerating(false); }
    };

    return (
        <div className="w-full max-w-[1600px] mx-auto mt-3 flex flex-col gap-3 relative">
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-3 flex items-center justify-between shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="bg-brand-500/20 p-2.5 rounded-xl border border-brand-500/20 text-brand-400"><Wallet size={20} /></div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Investimento Total do Projeto</span>
                            <div className="group relative">
                                <HelpCircle size={10} className="text-slate-600 cursor-help" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-950 border border-slate-800 rounded-lg text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl">
                                    Soma dos custos de todas as cenas geradas neste projeto específico.
                                </div>
                            </div>
                        </div>
                        <span className="text-xl font-black text-white">$ {totalInvestment.toFixed(6)}</span>
                    </div>
                </div>
                <div className="flex gap-6 pr-4">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black uppercase text-fuchsia-600/60">Perso.</span>
                        <span className="text-[12px] font-bold text-slate-300">{projectCharacters.length}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black uppercase text-emerald-600/60">Cens.</span>
                        <span className="text-[12px] font-bold text-slate-300">{projectLocations.length}</span>
                    </div>
                    <div className="flex flex-col items-end border-l border-slate-800 pl-6">
                        <span className="text-[9px] font-black uppercase text-amber-600/60">Props</span>
                        <span className="text-[12px] font-bold text-slate-300">{projectProps.length}</span>
                    </div>
                    <div className="flex flex-col items-end border-l border-slate-800 pl-6">
                        <span className="text-[9px] font-black uppercase text-slate-600 tracking-widest italic">Cenas</span>
                        <span className="text-[12px] font-bold text-slate-300">{data.filter(i => i.imageUrl || i.importedVideoUrl).length} / {data.length}</span>
                    </div>
                </div>
            </div>

            {isVideoGenerating && (
                <div className="fixed bottom-0 left-0 right-0 z-[120] bg-slate-950/95 backdrop-blur-2xl border-t border-brand-500/40 p-5 shadow-2xl">
                    <div className="max-w-5xl mx-auto flex items-center gap-8">
                        <div className="bg-brand-500/10 p-3 rounded-2xl text-brand-400 border border-brand-500/20"><Activity className="animate-pulse" size={28} /></div>
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-end">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase text-brand-400 tracking-[0.3em] mb-0.5">Renderizador Master</span>
                                    <span className="text-sm font-bold text-white uppercase">{videoStatus}</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-3xl font-black text-brand-400">{videoProgress}%</span>
                                    <span className="text-[10px] font-mono text-slate-600">
                                        {(() => {
                                            const e = Math.floor(renderElapsed);
                                            const mm = String(Math.floor(e / 60)).padStart(2, '0');
                                            const ss = String(e % 60).padStart(2, '0');
                                            // ETA: se temos progresso, calcula tempo restante
                                            if (videoProgress > 2) {
                                                const totalEst = renderElapsed / (videoProgress / 100);
                                                const remaining = Math.max(0, totalEst - renderElapsed);
                                                const rm = String(Math.floor(remaining / 60)).padStart(2, '0');
                                                const rs = String(Math.floor(remaining % 60)).padStart(2, '0');
                                                return `${mm}:${ss} dec. · ~${rm}:${rs} rest.`;
                                            }
                                            return `${mm}:${ss} decorridos`;
                                        })()}
                                    </span>
                                </div>
                            </div>
                            <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700 shadow-inner">
                                <div className="bg-gradient-to-r from-brand-600 to-brand-400 h-full transition-all duration-300 rounded-full" style={{ width: `${videoProgress}%` }}></div>
                            </div>
                        </div>
                        <button onClick={() => { if (renderTimerRef.current) clearInterval(renderTimerRef.current); setIsVideoGenerating(false); }} className="bg-slate-800 hover:bg-slate-700 p-3 rounded-xl text-slate-400 hover:text-white transition-all"><X size={24} /></button>
                    </div>
                </div>
            )
            }

            {
                showVideoSettings && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 animate-in fade-in duration-300">
                        <div className="bg-slate-900 rounded-[3rem] border border-slate-800 w-full max-w-2xl h-auto max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
                            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
                                <div className="flex items-center gap-3">
                                    <Clapperboard className="text-brand-400" size={24} />
                                    <h3 className="text-xl font-black text-white uppercase tracking-tight italic">Exportação Vídeo Master</h3>
                                </div>
                                <button onClick={() => setShowVideoSettings(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-all"><X size={28} /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                                <div className="flex flex-col gap-4 bg-slate-950/40 p-6 rounded-3xl border border-slate-800">
                                    <label className="text-[10px] font-black uppercase text-brand-400 tracking-widest flex items-center gap-2"><Type size={14} /> Incluir Legendas Sincronizadas?</label>
                                    <div className="flex gap-4">
                                        <button onClick={() => setIncludeSubtitles(true)} className={`flex-1 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all border ${includeSubtitles ? 'bg-brand-500 text-white border-brand-400 shadow-lg shadow-brand-500/20' : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'}`}> Sim </button>
                                        <button onClick={() => setIncludeSubtitles(false)} className={`flex-1 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all border ${!includeSubtitles ? 'bg-red-500 text-white border-red-400 shadow-lg shadow-red-500/20' : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'}`}> Não </button>
                                    </div>
                                    {includeSubtitles && (
                                        <div className="mt-4 space-y-2">
                                            <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Preset de Legenda</label>
                                            <select
                                                value={selectedSubtitlePresetId || (settings.aspectRatio === '16:9' ? 'horizontal-16-9' : 'vertical-9-16')}
                                                onChange={(e) => setSelectedSubtitlePresetId(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-brand-500 transition-colors"
                                            >
                                                {settings.subtitleStyles.map(preset => (
                                                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2"><Monitor size={14} /> Preview de Produção (Amostra)</label>
                                        <button onClick={handlePreview} disabled={isPreviewing} className="bg-slate-800 hover:bg-slate-700 text-brand-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 border border-slate-700">{isPreviewing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Gerar Amostra</button>
                                    </div>
                                    <div className={`bg-black rounded-3xl border border-slate-800 overflow-hidden relative shadow-inner mx-auto ${settings.aspectRatio === '9:16' ? 'aspect-[9/16] w-64' : 'aspect-video w-full'}`}>
                                        {previewVideoUrl ? <video key={previewVideoUrl} src={previewVideoUrl} controls autoPlay className="w-full h-full object-contain" /> : <div className="w-full h-full flex flex-col items-center justify-center opacity-20 gap-4"><PlayCircle size={64} /><span className="text-[10px] font-black uppercase tracking-[0.2em]">Clique em Gerar Amostra</span></div>}
                                    </div>
                                </div>
                            </div>
                            <div className="p-8 border-t border-slate-800 bg-slate-950 flex flex-col gap-4">
                                <button onClick={handleFinalRender} disabled={isVideoGenerating} className="w-full py-6 bg-brand-500 hover:bg-brand-400 text-white rounded-2xl font-black uppercase text-sm tracking-[0.2em] shadow-xl shadow-brand-500/20 transition-all flex items-center justify-center gap-3"><Download size={20} /> Renderizar e Baixar Master (.webm)</button>
                            </div>
                        </div>
                    </div>
                )
            }

            <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl p-2.5 shadow-2xl relative z-40 sticky top-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="bg-slate-950/40 px-4 py-2 rounded-2xl border border-slate-800/50 flex flex-col md:flex-row items-center gap-4 shadow-inner flex-1 shadow-lg">
                        <div className="flex items-center gap-3 w-full lg:w-auto">
                            <span className="text-[9px] font-black uppercase text-brand-400 tracking-[0.2em] italic pr-2 border-r border-slate-800">Direção</span>
                            <select value={settings.aspectRatio} onChange={(e) => onUpdateGlobalSetting('aspectRatio', e.target.value as '16:9' | '9:16')} className="bg-transparent border-none text-[10px] text-slate-200 font-bold uppercase outline-none cursor-pointer hover:text-white">
                                <option value="16:9">16:9</option>
                                <option value="9:16">9:16</option>
                            </select>
                            <select value={selectedStyleId} onChange={(e) => onStyleChange(e.target.value)} className="bg-transparent border-none text-[10px] text-slate-200 font-bold uppercase outline-none cursor-pointer max-w-[120px] truncate hover:text-white">
                                {settings.items.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                            <select value={globalProvider} onChange={e => setGlobalProvider(e.target.value as any)} className="bg-transparent border-none text-[10px] text-slate-200 font-bold uppercase outline-none cursor-pointer max-w-[120px] truncate hover:text-white">
                                <option value="google-nano">GEMINI NANO</option>
                                <option value="google-imagen">IMAGEN 4</option>
                                <option value="pollinations">POLLINATIONS FLUX</option>
                                <option value="pollinations-zimage">POLLINATIONS ZIMAGE</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2 ml-auto w-full md:w-auto">
                            <button onClick={handleGenerateMissing} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${isGeneratingAll ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:border-brand-500'}`}>{isGeneratingAll ? <Ban size={10} /> : <Sparkles className="inline text-brand-400 opacity-50 mr-1" size={10} />} Faltantes</button>
                            <button onClick={handleGenerateAll} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${isGeneratingAll ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-brand-500 border-brand-400 text-white hover:bg-brand-400'}`}>{isGeneratingAll ? <Ban size={10} /> : <Sparkles className="inline text-white mr-1" size={10} />} {isGeneratingAll ? "Parar" : "Tudo"}</button>
                            <button onClick={() => importInputRef.current?.click()} className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"><Upload size={14} /></button>
                            <input type="file" multiple ref={importInputRef} onChange={handleBulkImportImages} className="hidden" accept="image/*,video/*" />
                        </div>
                    </div>
                    <div className="flex items-center min-w-[140px]">
                        <button onClick={() => setShowVideoSettings(true)} className="w-full flex items-center justify-center gap-2 px-6 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 group"><VideoIcon size={16} className="group-hover:rotate-12 transition-transform" /> RENDERIZAR</button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-800 pb-0 gap-2">
                <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    {['scenes', 'characters', 'locations', 'props', 'titles'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as TabMode)} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === tab ? 'text-brand-400 border-brand-500 bg-brand-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                            {tab === 'scenes' ? 'Story Board' : tab === 'characters' ? 'Personagens' : tab === 'locations' ? 'Cenários' : tab === 'props' ? 'Objetos' : 'CTR Ninja'}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-4 px-4 pb-2 lg:pb-0 overflow-x-auto scrollbar-hide">
                    <button
                        onClick={async () => {
                            if (!project) return;
                            setIsSaving(true);
                            try { await onSave({ ...project, items: data } as any); } catch (e) { }
                            finally { setIsSaving(false); }
                        }}
                        disabled={isSaving || !project}
                        className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${isSaving ? 'bg-slate-800 text-slate-500 border-slate-700' : 'bg-brand-500/10 text-brand-400 border-brand-500/30 hover:bg-brand-500 hover:text-white'}`}
                    >
                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        {isSaving ? 'SALVANDO...' : 'SALVAR'}
                    </button>
                    <button onClick={handleExportPrompts} className="text-[9px] font-bold uppercase text-slate-400 hover:text-brand-400 flex items-center gap-1.5 transition-colors pr-3 border-r border-slate-800/50 min-w-max"><FileText size={12} /> Prompts</button>
                    <button onClick={handleExportAnimationPrompts} className="text-[9px] font-bold uppercase text-slate-400 hover:text-sky-400 flex items-center gap-1.5 transition-colors pr-3 border-r border-slate-800/50 min-w-max"><Video size={12} /> Anim</button>
                    <button onClick={handleExportCSV} className="text-[9px] font-bold uppercase text-slate-400 hover:text-brand-400 flex items-center gap-1.5 transition-colors pr-3 border-r border-slate-800/50 min-w-max"><FileSpreadsheet size={12} /> CSV</button>
                    <button onClick={handleExportAllImages} className="text-[9px] font-black uppercase text-slate-400 hover:text-brand-400 flex items-center gap-1.5 transition-colors min-w-max"><FileArchive size={12} /> ZIP MASTER</button>
                </div>
            </div>

            {
                activeTab === 'scenes' && (
                    <div className="space-y-8 pb-32">
                        <TimelineVisual items={data} onImageClick={idx => setViewingImageState({ imageUrl: (data[idx].imageUrl || data[idx].importedVideoUrl || ''), promptData: getPromptData(idx), filename: `cena_${idx + 1}.png`, sourceIndex: idx, sourceType: 'scene' })} audioFile={audioFile} videoUrl={videoUrl} />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {data.map((item, index) => (
                                <div key={index} className="flex flex-col gap-2">
                                    <div className="text-center text-[11px] font-black text-slate-600 uppercase tracking-widest">{item.duration.toFixed(1)}s</div>
                                    <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 flex flex-col gap-5 shadow-lg group hover:border-brand-500/30 transition-all">
                                        <div className="flex justify-between items-center text-[11px] font-black uppercase text-brand-400">
                                            <div className="flex items-center gap-2">
                                                <span className="bg-brand-500/10 text-brand-400 px-2 py-1 rounded text-[10px] font-black">CENA {index + 1}</span>
                                                <span className="bg-slate-950 px-3 py-1.5 rounded-full border border-slate-800 font-mono"> {item.startTimestamp} - {item.endTimestamp} </span>
                                            </div>
                                        </div>
                                        <div className={`bg-black rounded-3xl overflow-hidden relative shadow-inner ${settings.aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'}`}>
                                            {item.imageUrl || item.importedVideoUrl ? (
                                                <>
                                                    {item.importedVideoUrl ? <video src={item.importedVideoUrl} className="w-full h-full object-cover" controls={false} muted autoPlay loop onClick={() => setViewingImageState({ imageUrl: item.importedVideoUrl!, promptData: getPromptData(index), filename: `cena_${index + 1}.mp4`, sourceIndex: index, sourceType: 'scene'})} /> : <img src={item.imageUrl} onClick={() => setViewingImageState({ imageUrl: item.imageUrl!, promptData: getPromptData(index), filename: `cena_${index + 1}.png`, sourceIndex: index, sourceType: 'scene' })} className="w-full h-full object-cover cursor-zoom-in" />}
                                                </>
                                            ) : <div className="w-full h-full flex items-center justify-center opacity-20"><ImageIcon size={48} /></div>}
                                            {(item.isGeneratingGoogle || item.isGeneratingPollinations) && <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-4"><Loader2 className="animate-spin text-brand-400" size={40} /></div>}
                                            <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleGenerateImage(index, globalProvider as any)} title="Recriar Imagem (Manter Prompt)" className="p-2.5 bg-brand-500 hover:bg-brand-400 text-white rounded-full shadow-xl transition-colors"><Zap size={14} /></button>
                                                <button onClick={() => handleRecreateSceneBroll(index)} title="Transformar em B-Roll Genérico" className="p-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-full shadow-xl transition-colors"><VideoIcon size={14} /></button>
                                            </div>
                                        </div>

                                        {/* Assets Presentes na Cena */}
                                        <div className="flex flex-wrap gap-2">
                                            {item.characterIds?.map(charId => {
                                                const char = projectCharacters.find(c => c.id === charId);
                                                if (!char) return null;
                                                return (
                                                    <div key={charId} className="bg-fuchsia-500/10 border border-fuchsia-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-[9px] font-black text-fuchsia-400 uppercase tracking-widest">
                                                        <Users size={10} /> {char.name}
                                                    </div>
                                                );
                                            })}
                                            {item.locationIds?.map(locId => {
                                                const loc = projectLocations.find(l => l.id === locId);
                                                if (!loc) return null;
                                                return (
                                                    <div key={locId} className="bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                                                        <MapPin size={10} /> {loc.name}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="space-y-4">
                                            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-[11px] text-slate-400 line-clamp-3 leading-relaxed">"{item.text}"</div>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between px-1">
                                                    <div className="flex items-center gap-2"><Edit3 size={10} className="text-brand-400" /><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Editor de Prompt</label></div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                        <span className="text-[8px] font-bold text-amber-500/60 uppercase px-1">Medium</span>
                                                        <input
                                                            value={item.medium || ''}
                                                            placeholder={activeStylePrompt ? activeStylePrompt.split(',')[0].trim() : "Ex: Cinematic, 3D..."}
                                                            onChange={e => onUpdateItem(index, { medium: e.target.value })}
                                                            className={`w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[9px] outline-none focus:border-amber-500/50 transition-colors ${!item.medium && activeStylePrompt ? 'text-slate-500 italic' : 'text-slate-300'}`}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <span className="text-[8px] font-bold text-purple-500/60 uppercase px-1">Camera</span>
                                                        <input value={item.camera || ''} onChange={e => onUpdateItem(index, { camera: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[9px] text-slate-300 outline-none focus:border-purple-500/50" placeholder="Ex: Close-up, Wide..." />
                                                    </div>
                                                </div>

                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center px-1">
                                                        <span className="text-[8px] font-bold text-fuchsia-500/60 uppercase">Subject</span>
                                                        {!item.subject && projectCharacters.some(c => item.characterIds?.includes(c.id)) && <span className="text-[7px] text-fuchsia-500/40 italic uppercase tracking-tighter">Auto-Link Ativo</span>}
                                                    </div>
                                                    <input
                                                        value={item.subject || ''}
                                                        placeholder={(() => {
                                                            const relevantChars = projectCharacters.filter(c => item.characterIds?.includes(c.id));
                                                            return relevantChars.length > 0 ? relevantChars.map(c => c.name).join(", ") : "Personagem ou Assunto Principal...";
                                                        })()}
                                                        onChange={e => onUpdateItem(index, { subject: e.target.value })}
                                                        className={`w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[9px] outline-none focus:border-fuchsia-500/50 transition-colors ${!item.subject && projectCharacters.some(c => item.characterIds?.includes(c.id)) ? 'text-slate-500 italic' : 'text-slate-300'}`}
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-bold text-white/40 uppercase px-1">Action</span>
                                                    <textarea value={item.action || ''} onChange={e => onUpdateItem(index, { action: e.target.value })} className="w-full h-12 bg-slate-950 border border-slate-800 rounded-lg p-2 text-[9px] text-slate-300 outline-none focus:border-white/20 resize-none custom-scrollbar" placeholder="Ação descritiva da cena..." />
                                                </div>

                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center px-1">
                                                        <span className="text-[8px] font-bold text-emerald-500/60 uppercase">Scenario</span>
                                                        {!item.cenario && projectLocations.some(l => item.locationIds?.includes(l.id)) && <span className="text-[7px] text-emerald-500/40 italic uppercase tracking-tighter">Auto-Link Ativo</span>}
                                                    </div>
                                                    <input
                                                        value={item.cenario || ''}
                                                        placeholder={(() => {
                                                            const relevantLocs = projectLocations.filter(l => item.locationIds?.includes(l.id));
                                                            return relevantLocs.length > 0 ? relevantLocs.map(l => l.name).join(", ") : "Cenário ou Ambiente...";
                                                        })()}
                                                        onChange={e => onUpdateItem(index, { cenario: e.target.value })}
                                                        className={`w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[9px] outline-none focus:border-emerald-500/50 transition-colors ${!item.cenario && projectLocations.some(l => item.locationIds?.includes(l.id)) ? 'text-slate-500 italic' : 'text-slate-300'}`}
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-bold text-sky-500/60 uppercase px-1">Animation (Motion)</span>
                                                    <textarea value={item.animation || ''} onChange={e => onUpdateItem(index, { animation: e.target.value })} className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg p-2 text-[9px] text-slate-300 outline-none focus:border-sky-500/50 resize-none custom-scrollbar" placeholder="Motion prompt for Runway/Luma..." />
                                                </div>

                                                <div className="space-y-2 pt-2 border-t border-white/5">
                                                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Preview Visual (Cores)</label>
                                                    <ColoredPrompt promptData={getPromptData(index)} className="w-full h-auto min-h-16 bg-slate-950/50 border border-slate-800 rounded-2xl p-4 text-[10px] font-mono shadow-inner" />
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pb-32">
                        {(activeTab === 'characters' ? projectCharacters : projectLocations).map((asset, index) => (
                            <div key={asset.id} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 flex flex-col gap-5 shadow-lg group hover:border-brand-500/30 transition-all">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase text-brand-400">
                                    <span className={`px-2 py-1 rounded text-[9px] font-black ${activeTab === 'characters' ? 'bg-fuchsia-500/10 text-fuchsia-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                        {activeTab === 'characters' ? 'PERSONAGEM' : 'CENÁRIO'} #{index + 1}
                                    </span>
                                    <span className="text-[9px] font-black text-slate-600 tracking-widest">Aparece em {getAssetOccurrence(asset.id, activeTab === 'characters' ? 'char' : 'loc')} cenas</span>
                                </div>
                                <div className="aspect-square bg-black rounded-3xl overflow-hidden relative shadow-inner cursor-zoom-in">
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
                                    {(asset.isGeneratingGoogle || asset.isGeneratingPollinations) && <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-4"><Loader2 className="animate-spin text-brand-400" size={40} /></div>}
                                    <button onClick={() => handleGenerateAssetImage(asset, activeTab as any)} className="absolute top-4 right-4 p-2.5 bg-brand-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-20"><Zap size={14} /></button>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-1 px-1">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[8px] font-black text-brand-400 uppercase tracking-widest">Apelido (Vai pro Prompt)</label>
                                            <input
                                                value={asset.name}
                                                placeholder="Ex: ExplorerRafael"
                                                onChange={e => {
                                                    const list = activeTab === 'characters' ? [...projectCharacters] : [...projectLocations];
                                                    onUpdateProjectInfo(activeTab as any, list.map(a => a.id === asset.id ? { ...a, name: e.target.value } : a));
                                                }}
                                                className="bg-transparent text-sm font-black text-white uppercase tracking-tight italic outline-none border-b border-transparent focus:border-brand-500/30"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-0.5 mt-1">
                                            <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Nome Real (Apenas Interno)</label>
                                            <input
                                                value={asset.realName || ''}
                                                placeholder="Ex: Rafael"
                                                onChange={e => {
                                                    const list = activeTab === 'characters' ? [...projectCharacters] : [...projectLocations];
                                                    onUpdateProjectInfo(activeTab as any, list.map(a => a.id === asset.id ? { ...a, realName: e.target.value } : a));
                                                }}
                                                className="bg-transparent text-[10px] font-bold text-slate-400 uppercase tracking-widest outline-none border-b border-transparent focus:border-brand-500/30"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex flex-col gap-1 px-1">
                                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Token Estético (Editável)</label>
                                            <p className="text-[8px] text-slate-500 italic leading-tight">
                                                {activeTab === 'characters'
                                                    ? "REGRA DE OURO: Descreva apenas matéria física (pele, cabelo, roupa). Sem nomes reais ou termos de estilo."
                                                    : "MASTER BLOCK: Estrutura, Ancoragem, Materiais e Iluminação."}
                                            </p>
                                        </div>
                                        <textarea value={asset.description} onChange={e => {
                                            const list = activeTab === 'characters' ? [...projectCharacters] : [...projectLocations];
                                            onUpdateProjectInfo(activeTab as any, list.map(a => a.id === asset.id ? { ...a, description: e.target.value } : a));
                                        }} className="w-full h-24 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-[10px] font-mono text-slate-300 outline-none focus:border-brand-500 shadow-inner resize-none custom-scrollbar" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Visualização do Motor</label>
                                        <div className="w-full h-24 bg-slate-950/50 border border-slate-800 rounded-2xl p-4 text-[10px] font-mono overflow-y-auto scrollbar-hide shadow-inner">
                                            <span className={activeTab === 'characters' ? "text-fuchsia-400 font-bold" : "text-emerald-400 font-bold"}>
                                                {asset.description}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            }

            {
                activeTab === 'props' && (
                    <div className="pb-32">
                        {projectProps.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-32 text-slate-600 gap-6">
                                <div className="w-24 h-24 rounded-3xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-center">
                                    <Box size={40} className="text-amber-500/30" />
                                </div>
                                <div className="text-center space-y-2">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Nenhum Objeto Detectado</p>
                                    <p className="text-[10px] text-slate-600 max-w-sm">
                                        Objetos/itens com destaque narrativo (armas, relíquias, etc.) são detectados automaticamente na próxima geração de cenas.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                {projectProps.map((prop, index) => (
                                    <div key={prop.id} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 flex flex-col gap-5 shadow-lg group hover:border-amber-500/30 transition-all">
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase">
                                            <span className="bg-amber-500/10 text-amber-400 px-2 py-1 rounded text-[9px] font-black">
                                                OBJETO #{index + 1}
                                            </span>
                                            <span className="text-[9px] font-black text-slate-600 tracking-widest">Aparece em {getAssetOccurrence(prop.id, 'prop')} cenas</span>
                                        </div>
                                        <div className="aspect-square bg-black rounded-3xl overflow-hidden relative shadow-inner cursor-zoom-in">
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
                                            {(prop.isGeneratingGoogle || prop.isGeneratingPollinations) && <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-4"><Loader2 className="animate-spin text-amber-400" size={40} /></div>}
                                            <button onClick={() => handleGenerateAssetImage(prop, 'props')} className="absolute top-4 right-4 p-2.5 bg-amber-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-20"><Zap size={14} /></button>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex flex-col gap-1 px-1">
                                                <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Nome do Objeto</label>
                                                <input
                                                    value={prop.name}
                                                    onChange={e => {
                                                        onUpdateProjectInfo('props', projectProps.map(p => p.id === prop.id ? { ...p, name: e.target.value } : p));
                                                    }}
                                                    className="bg-transparent text-sm font-black text-white uppercase tracking-tight italic outline-none border-b border-transparent focus:border-amber-500/30"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex flex-col gap-1 px-1">
                                                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Token Físico (Editável)</label>
                                                    <p className="text-[8px] text-slate-500 italic leading-tight">
                                                        7 variáveis obrigatórias: tipo, material, cor, textura, tamanho/forma, estado, detalhes únicos.
                                                    </p>
                                                </div>
                                                <textarea
                                                    value={prop.description}
                                                    onChange={e => {
                                                        onUpdateProjectInfo('props', projectProps.map(p => p.id === prop.id ? { ...p, description: e.target.value } : p));
                                                    }}
                                                    className="w-full h-28 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-[10px] font-mono text-slate-300 outline-none focus:border-amber-500 shadow-inner resize-none custom-scrollbar"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Visualização do Motor</label>
                                                <div className="w-full h-16 bg-slate-950/50 border border-slate-800 rounded-2xl p-4 text-[10px] font-mono overflow-y-auto scrollbar-hide shadow-inner">
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
                            <div className="space-y-4 max-w-2xl mx-auto"><h2 className="text-4xl font-black text-white uppercase tracking-tighter">Engenharia de <span className="text-brand-400">CTR Ninja</span></h2></div>
                            <button onClick={handleGenerateTitles} disabled={isGeneratingTitles} className="bg-brand-500 hover:bg-brand-400 text-white px-12 py-5 rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] shadow-2xl transition-all flex items-center gap-4 mx-auto active:scale-95">{isGeneratingTitles ? <Loader2 size={24} className="animate-spin" /> : <Zap size={24} />} Gerar Títulos Magnéticos</button>
                        </div>
                        {generatedTitles.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {generatedTitles.map((item, idx) => {
                                    const isGenerating = generatingThumbnailMap[idx];
                                    const currentImageUrl = (item as any).imageUrl;

                                    return (
                                        <div key={idx} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col gap-6 hover:border-brand-500/30 transition-all shadow-xl group relative">
                                            <div className="flex justify-between items-start">
                                                <div className="bg-slate-950 px-4 py-2 rounded-xl text-brand-400 font-black text-[10px] uppercase border border-slate-800">Rank #{idx + 1}</div>
                                                <span className="text-slate-500 font-black text-[10px]">{item.viralityScore}% CTR</span>
                                            </div>
                                            <h3 className="text-2xl leading-tight uppercase tracking-tight text-slate-200 font-medium whitespace-pre-line">{item.title}</h3>

                                            {currentImageUrl && (
                                                <div className={`w-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative group-hover:border-brand-500 transition-all cursor-zoom-in ${settings.aspectRatio === '9:16' ? 'aspect-[9/16] w-1/2 mx-auto' : 'aspect-video'}`} onClick={() => setViewingImageState({ imageUrl: currentImageUrl, promptData: { action: item.thumbnailVisual, style: activeStylePrompt }, filename: `thumbnail_${idx + 1}.png` })}>
                                                    <img src={currentImageUrl} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-md p-3 text-center">
                                                        <span className="text-white font-black italic uppercase text-[12px] tracking-tight">"{item.thumbnailText}"</span>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 space-y-3">
                                                <p className="text-brand-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Layers size={12} /> Gatilho & Lógica</p>
                                                <p className="text-slate-500 text-xs italic">"{item.explanation}"</p>
                                            </div>
                                            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <p className="text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><ImageIcon size={12} /> Sugestão de Thumbnail</p>
                                                    <button
                                                        onClick={() => handleGenerateThumbnail(idx)}
                                                        disabled={isGenerating}
                                                        className="bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase flex items-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                                                    >
                                                        {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                                                        {currentImageUrl ? 'Regerar Thumbnail' : 'Criar Thumbnail'}
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Visual:</p>
                                                    <p className="text-slate-300 text-xs">{item.thumbnailVisual}</p>
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Texto na Imagem:</p>
                                                    <p className="text-emerald-300 font-black uppercase text-sm italic">"{item.thumbnailText}"</p>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-slate-800/50">
                                                <button onClick={() => { navigator.clipboard.writeText(item.title); alert("Copiado!"); }} className="text-brand-400 text-[10px] font-black uppercase">Copiar Título</button>
                                                {item.abWinnerReason && <span className="text-[9px] font-black text-slate-700 uppercase">A/B Winner Priority</span>}
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
        </div >
    );
};
