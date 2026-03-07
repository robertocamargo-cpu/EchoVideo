import { Loader2, AlertCircle, FileText, Save, FolderOpen, X, Layout, Scissors, Settings, BarChart3, CheckCircle2, FolderInput, Clock, History, HelpCircle, Shield, Zap, Globe, AlertTriangle, ShieldCheck, Key, RefreshCw, Cpu, Activity, Palette, Trash2, Video, Music, Type, Languages, Download, Share2, Play, MousePointer2, Image as ImageIcon, MapPin, Users, Sparkles, Wand2, Terminal, Layers, Box, Maximize2, Minimize2, MoreHorizontal, ChevronRight, ChevronLeft, Plus, Edit3, Check, Copy, ExternalLink, Info } from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { TranscriptionTable } from './components/TranscriptionTable';
import { SystemInfo } from './components/SystemInfo';
import { ImageStylesGallery } from './components/ImageStylesGallery';
import { TranscriptionItem, ProcessingStatus, Project, AppSettings, MasterAsset, MotionEffect } from './types';
import { enrichSrtWithVisuals, getApiInfrastructure, TEXT_MODEL_NAME } from './services/geminiService';
import { saveProject, getProjects, getProjectById, deleteProject, saveSettingsToDB, getSettingsFromDB, getProjectAudio, getUsageFromDB, getImageStylePrompts, getSubtitlePresets, findProjectByName, getMotionEffects, getProjectFileUrl } from './services/storageService';
import { preselectEffectsForScenes } from './services/effectSelectionService';
import { getDailyUsage, fetchRealUsage, DailyUsage } from './services/usageService';
import { getAudioDuration } from './services/audioService';
import { DEFAULT_SETTINGS, SettingsModal } from './components/SettingsModal';
import { ChangelogModal } from './components/ChangelogModal';
import React, { useState, useEffect, useRef } from 'react';

const App: React.FC = () => {
  console.log("[App] Component initializing...");
  const [file, setFile] = useState<File | null>(null);
  const [srtText, setSrtText] = useState<string>('');
  const [scriptText, setScriptText] = useState<string>('');
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [items, setItems] = useState<TranscriptionItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<'transcription' | 'analytics' | 'styles'>('transcription');
  const [usage, setUsage] = useState<DailyUsage | null>(null);
  const [apiInfrastructure, setApiInfrastructure] = useState<any>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>('disney');
  const [context, setContext] = useState<string>('');
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [transcriptionElapsed, setTranscriptionElapsed] = useState(0);
  const [transcriptionDuration, setTranscriptionDuration] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState<string>('');
  const [supabaseStatus, setSupabaseStatus] = useState<'connecting' | 'stable' | 'error'>('connecting');
  const transcriptionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const initApp = async () => {
      console.log("[App] initApp started — carregamento sequencial para reduzir Disk I/O");
      
      const fallbackTimer = setTimeout(() => {
        console.warn("[App] Initialization timeout reached. Forcing app to load.");
        setSettingsLoaded(true);
        setSupabaseStatus('error');
      }, 10000);

      try {
        // 1. Settings (mais crítico — bloqueia a UI)
        console.log("[App] [1/5] Fetching settings...");
        const dbSettings = await getSettingsFromDB();

        // 2. Estilos de imagem
        console.log("[App] [2/5] Fetching image styles...");
        const styles = await getImageStylePrompts();

        // 3. Presets de legenda
        console.log("[App] [3/5] Fetching subtitle presets...");
        const subtitles = await getSubtitlePresets();

        const mergedSettings = {
          ...DEFAULT_SETTINGS,
          ...dbSettings,
          items: styles.length > 0 ? styles : DEFAULT_SETTINGS.items,
          subtitleStyles: subtitles.length > 0 ? subtitles : DEFAULT_SETTINGS.subtitleStyles
        };
        setSettings(mergedSettings);
        if (!dbSettings) {
          console.log("[App] No settings found, creating default...");
          await saveSettingsToDB(DEFAULT_SETTINGS);
        }

        // 4. Lista de projetos
        console.log("[App] [4/5] Fetching projects...");
        const list = await getProjects();
        setProjects(list);

        // 5. Uso e API info (não críticos — carregam por último)
        console.log("[App] [5/5] Fetching usage and API info...");
        await refreshUsage();
        await refreshApiInfo();

        setSupabaseStatus('stable');
        console.log("[App] Initialization complete");
      } catch (e) {
        console.error("[App] Initialization ERROR:", e);
        setSettings(DEFAULT_SETTINGS);
        setSupabaseStatus('error');
      } finally {
        clearTimeout(fallbackTimer);
        setSettingsLoaded(true);
      }
    };

    initApp();
  }, []);

  const refreshUsage = async () => {
    try {
      const u = await getDailyUsage();
      setUsage(u);
    } catch (e) {
      console.error("Failed to refresh usage:", e);
    }
  };

  const refreshApiInfo = async () => {
    try {
      const infra = await getApiInfrastructure();
      setApiInfrastructure(infra);
    } catch (e) {
      console.error("Failed to get API infrastructure:", e);
    }
  };

  const handleFileSelected = async (audio: File, srt?: string, script?: string) => {
    console.log("[App] File selected:", audio.name);

    // Se srt ou script não forem passados, usamos o valor atual do estado (que pode ter vindo de uploads anteriores no FileUpload)
    const effectiveSrt = srt !== undefined ? srt : srtText;
    const effectiveScript = script !== undefined ? script : scriptText;

    setFile(audio);
    if (srt !== undefined) setSrtText(srt);
    if (script !== undefined) setScriptText(script);

    setStatus(ProcessingStatus.TRANSCRIBING);
    setTranscriptionProgress(0);
    setTranscriptionElapsed(0);

    // Captura duração do áudio para o timer de progresso
    let audioDurationSec = 0;
    try {
      audioDurationSec = await getAudioDuration(audio);
    } catch { audioDurationSec = 0; }
    setTranscriptionDuration(audioDurationSec);
    setAudioDuration(audioDurationSec);

    // Timer: atualiza progresso com base no tempo decorrido vs duração do áudio
    const startTime = Date.now();
    if (transcriptionTimerRef.current) clearInterval(transcriptionTimerRef.current);
    transcriptionTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const duration = audioDurationSec || 120; // fallback 2 min
      const pct = Math.min(99, Math.round((elapsed / duration) * 100));
      setTranscriptionElapsed(elapsed);
      setTranscriptionProgress(pct);
    }, 1000);

    try {
      // Lógica para evitar projetos duplicados pelo nome do áudio
      const existingProjectSummary = await findProjectByName(audio.name);
      if (existingProjectSummary?.id) {
        console.log("[App] Projeto existente encontrado, carregando completo:", existingProjectSummary.id);
        if (transcriptionTimerRef.current) clearInterval(transcriptionTimerRef.current);
        await handleLoadProject(existingProjectSummary.id);
        return;
      }

      const activeStylePrompt = settings.items.find(s => s.id === selectedStyle)?.prompt || '';
      const result = await enrichSrtWithVisuals(audio, effectiveSrt || null, context, activeStylePrompt, effectiveScript || '');
      if (!result.items || result.items.length === 0) {
        if (transcriptionTimerRef.current) clearInterval(transcriptionTimerRef.current);
        console.warn('[App] No items generated from audio.');
        alert('Nenhuma cena gerada pela IA a partir deste áudio.');
        setStatus(ProcessingStatus.IDLE);
        return;
      }
      // Selecionar efeitos de animação para cada cena (não repetindo o anterior)
      let itemsWithEffects = result.items;
      try {
        const availableEffects = await getMotionEffects();
        if (availableEffects.length > 0) {
          const effectMap = await preselectEffectsForScenes(result.items, availableEffects);
          itemsWithEffects = result.items.map((item, idx) => ({
            ...item,
            selectedMotionEffect: effectMap.get(idx) || item.selectedMotionEffect
          }));
          console.log(`[App] Efeitos aplicados em ${effectMap.size} cenas.`);
        }
      } catch (e) {
        console.warn('[App] Falha ao pré-selecionar efeitos, continuando sem efeitos:', e);
      }

      // FILTRAGEM DE RECORRÊNCIA: Criar somente ativos que aparecem 2 ou mais vezes
      const characterCount = new Map<string, number>();
      const locationCount = new Map<string, number>();
      const propCount = new Map<string, number>();

      itemsWithEffects.forEach(item => {
        (item.characterIds || []).forEach(id => characterCount.set(id, (characterCount.get(id) || 0) + 1));
        (item.locationIds || []).forEach(id => locationCount.set(id, (locationCount.get(id) || 0) + 1));
        (item.propIds || []).forEach(id => propCount.set(id, (propCount.get(id) || 0) + 1));
        // Fallback para prop_ids caso venha do Gemini com snake_case
        ((item as any).prop_ids || []).forEach((id: string) => propCount.set(id, (propCount.get(id) || 0) + 1));
      });

      const filteredCharacters = (result.detectedCharacters || []).filter(c => (characterCount.get(c.id) || 0) >= 2);
      const filteredLocations = (result.detectedLocations || []).filter(l => (locationCount.get(l.id) || 0) >= 2);
      const filteredProps = (result.detectedProps || []).filter(p => (propCount.get(p.id) || 0) >= 2);

      const newProject: Project = {
        id: crypto.randomUUID(),
        name: audio.name,
        date: new Date().toISOString(),
        items: itemsWithEffects,
        characters: filteredCharacters,
        locations: filteredLocations,
        props: filteredProps,
        context: result.englishContext,
        projectStyle: selectedStyle,
        customStylePrompt: activeStylePrompt,
        updatedAt: new Date().toISOString()
      };

      setTranscriptionProgress(100);
      if (transcriptionTimerRef.current) clearInterval(transcriptionTimerRef.current);

      setItems(itemsWithEffects);
      setCurrentProject(newProject);
      await saveProject(newProject, audio);  // salva áudio no Storage (USAR O PARÂMETRO 'audio', NÃO O ESTADO 'file' QUE É STALE)
      setStatus(ProcessingStatus.COMPLETED);
      setSrtText(effectiveSrt || '');
      setScriptText(effectiveScript || '');

      // Update projects list
      const list = await getProjects();
      setProjects(list);
    } catch (error: any) {
      if (transcriptionTimerRef.current) clearInterval(transcriptionTimerRef.current);
      console.error("[App] Processing error:", error);
      alert("Erro ao processar áudio: " + (error?.message || error));
      setStatus(ProcessingStatus.IDLE);
    }
  };

  const handleSaveProject = async (updatedProject: Project) => {
    try {
      console.log("[App] Saving project to DB:", updatedProject.id);
      await saveProject(updatedProject, file ?? undefined);

      // Sincronizar estados locais SEM disparar novos saves
      setCurrentProject(updatedProject);
      setItems(updatedProject.items);

      // Refresh list
      const list = await getProjects();
      setProjects(list);
    } catch (e) {
      console.error("Failed to save project:", e);
    }
  };

  const handleLoadProject = async (id: string) => {
    try {
      const proj = await getProjectById(id);
      if (proj) {
        setCurrentProject(proj);
        setItems(proj.items);
        setStatus(ProcessingStatus.COMPLETED);
        setIsProjectsOpen(false);
        setViewMode('transcription');

        // Restaurar o estilo do projeto e o contexto
        if (proj.projectStyle) setSelectedStyle(proj.projectStyle);
        if (proj.context) setContext(proj.context);

        console.log(`[App] Carregando projeto "${proj.name}" — ${proj.items.length} cenas`);

        // Carregar áudio para habilitar a renderização e o preview
        console.log(`[App] Restaurando Sessão de Áudio: ${id}`);
        try {
          let audioBlob: Blob | null = null;

          // 1. Tentar Download Autenticado (Mais Seguro)
          audioBlob = await getProjectAudio(id);

          // 2. Fallback para URL Pública (Se download falhar)
          if (!audioBlob || audioBlob.size === 0) {
            const publicUrl = proj.audioUrl || await getProjectFileUrl(id, 'audio');
            if (publicUrl) {
              console.log(`[App] Tentando Restaurar via URL Pública: ${publicUrl}`);
              const response = await fetch(publicUrl);
              if (response.ok) audioBlob = await response.blob();
            }
          }

          if (audioBlob && audioBlob.size > 0) {
            console.log(`[App] Áudio Detectado: ${audioBlob.size} bytes`);
            const audioFileObj = new File([audioBlob], `${proj.name.replace(/\s+/g, '_')}_restored.wav`, { type: 'audio/wav' });
            setFile(audioFileObj);

            try {
              const actualDuration = await getAudioDuration(audioFileObj);
              setAudioDuration(actualDuration);
              setTranscriptionDuration(actualDuration);
            } catch (durErr) {
              const fallback = proj.items.length > 0 ? proj.items[proj.items.length - 1].endSeconds : 10;
              setAudioDuration(fallback);
              console.warn(`[App] Usando duração estimada: ${fallback}s`);
            }
          } else {
            console.warn(`[App] Áudio ausente ou inacessível no Storage.`);
            setFile(null);
          }
        } catch (e) {
          console.error("[App] Erro crítico no carregamento do áudio:", e);
          setFile(null);
        }
      } else {
        console.error(`[App] Projeto ${id} não encontrado no banco de dados.`);
      }
    } catch (e) {
      console.error("[App] Failed to load project:", e);
      alert("Erro ao carregar projeto. Verifique o console.");
    }
  };


  const handleDeleteProject = async (id: string) => {
    if (window.confirm("Tem certeza que deseja excluir este projeto?")) {
      try {
        await deleteProject(id);
        if (currentProject?.id === id) {
          setCurrentProject(null);
          setItems([]);
          setStatus(ProcessingStatus.IDLE);
        }
        const list = await getProjects();
        setProjects(list);
      } catch (e) {
        console.error("Failed to delete project:", e);
      }
    }
  };

  if (!settingsLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-12 h-12 text-brand-500 animate-spin" />
          <p className="text-slate-400 font-medium animate-pulse">Sincronizando com Supabase...</p>
        </div>
      </div>
    );
  }

  console.log("[App] Rendering state:", { settingsLoaded, status, viewMode });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans">
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onSave={(s) => setSettings(s)} />

      {/* Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-40">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 mr-6">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-600 to-brand-400 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Zap className="w-6 h-6 text-white fill-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white uppercase italic">echo<span className="text-brand-400">VID</span> <span className="ml-2 text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 align-middle not-italic">v1.9.89</span></h1>
          </div>

          <nav className="flex items-center bg-slate-950/50 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('transcription')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center space-x-2 ${viewMode === 'transcription' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Layout className="w-4 h-4" />
              <span>Editor</span>
            </button>
            <button
              onClick={() => setViewMode('styles')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center space-x-2 ${viewMode === 'styles' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Palette className="w-4 h-4" />
              <span>Galeria</span>
            </button>
            <button
              onClick={() => setViewMode('analytics')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center space-x-2 ${viewMode === 'analytics' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Activity className="w-4 h-4" />
              <span>Métricas</span>
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 mr-4 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800">
            <Cpu className="w-3.5 h-3.5 text-brand-400" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">{TEXT_MODEL_NAME}</span>
          </div>

          <button onClick={() => setIsProjectsOpen(true)} className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all border border-slate-700/50">
            <FolderOpen className="w-5 h-5" />
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all border border-slate-700/50">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 container mx-auto px-4 py-6 max-w-7xl">
        {viewMode === 'transcription' ? (
          status === ProcessingStatus.IDLE || status === ProcessingStatus.READING_FILE ? (
            <div className="flex-1 flex flex-col items-center justify-center -mt-12">
              <div className="w-full max-w-2xl bg-slate-900/40 border border-slate-800 rounded-3xl p-12 backdrop-blur-md shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 blur-[120px] rounded-full -mr-32 -mt-32"></div>
                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-20 h-20 bg-brand-500/10 rounded-3xl flex items-center justify-center mb-8 border border-brand-500/20 shadow-[0_0_40px_rgba(14,165,233,0.1)]">
                    <Video className="w-10 h-10 text-brand-500" />
                  </div>
                  <h2 className="text-3xl font-black text-white mb-4 text-center tracking-tight uppercase">Inicie sua produção</h2>
                  <p className="text-slate-400 text-center mb-10 max-w-md reading-relaxed">
                    Suba o áudio, a legenda (SRT) e o roteiro original para gerar visualizações premium sincronizadas.
                  </p>
                  <FileUpload
                    onFileSelected={handleFileSelected}
                    disabled={status !== ProcessingStatus.IDLE}
                    context={context}
                    onContextChange={setContext}
                    file={file}
                    settings={settings}
                    selectedStyle={selectedStyle}
                    onStyleChange={setSelectedStyle}
                  />
                </div>
              </div>
            </div>
          ) : status === ProcessingStatus.TRANSCRIBING ? (
            <div className="flex-1 flex flex-col items-center justify-center -mt-12 h-full">
              <div className="w-full max-w-2xl bg-slate-900/40 border border-brand-500/30 rounded-3xl p-12 backdrop-blur-md shadow-[0_0_50px_rgba(14,165,233,0.1)] relative overflow-hidden flex flex-col items-center text-center">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 blur-[120px] rounded-full -mr-32 -mt-32"></div>
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-brand-500 blur-2xl opacity-20 animate-pulse"></div>
                  <div className="bg-slate-950 p-6 rounded-3xl border border-brand-500/40 relative z-10 shadow-2xl">
                    <Wand2 className="w-16 h-16 text-brand-400 animate-bounce" />
                  </div>
                </div>
                <h2 className="text-4xl font-black text-white uppercase tracking-tight mb-2">A Mágica Começou</h2>
                <p className="text-slate-500 text-base mb-8">
                  IA analisando áudio, extraindo cenas de 5–10s...
                </p>

                {/* Barra de progresso principal */}
                <div className="w-full space-y-3">
                  <div className="flex justify-between items-end">
                    <div className="flex flex-col items-start">
                      <span className="text-[11px] font-black uppercase text-brand-400 tracking-[0.3em]">Progresso Estimado</span>
                      <span className="text-base font-bold text-slate-300">
                        {(() => {
                          const e = Math.floor(transcriptionElapsed);
                          const mm = String(Math.floor(e / 60)).padStart(2, '0');
                          const ss = String(e % 60).padStart(2, '0');
                          return `${mm}:${ss} decorridos`;
                        })()}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-4xl font-black text-brand-400">{transcriptionProgress}%</span>
                      <span className="text-[12px] font-mono text-slate-600">
                        {transcriptionDuration > 0 ? (() => {
                          const remaining = Math.max(0, transcriptionDuration - transcriptionElapsed);
                          const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
                          const ss = String(Math.floor(remaining % 60)).padStart(2, '0');
                          return `~${mm}:${ss} restantes`;
                        })() : 'calculando...'}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-900 border border-slate-800 h-4 rounded-full overflow-hidden shadow-inner">
                    <div
                      className="bg-gradient-to-r from-brand-600 to-brand-400 h-full rounded-full transition-all duration-1000 ease-linear relative"
                      style={{ width: `${transcriptionProgress}%` }}
                    >
                      <div className="absolute inset-0 bg-white/10 animate-pulse rounded-full"></div>
                    </div>
                  </div>
                  {transcriptionDuration > 0 && (
                    <div className="flex justify-between text-[11px] font-mono text-slate-700">
                      <span>00:00</span>
                      <span>{String(Math.floor(transcriptionDuration / 60)).padStart(2, '0')}:{String(Math.floor(transcriptionDuration % 60)).padStart(2, '0')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <TranscriptionTable
              data={items}
              project={currentProject}
              onUpdateItem={(index, update) => {
                // Update Items state first for fast UI feedback
                setItems(prevItems => {
                  const newItems = [...prevItems];
                  newItems[index] = { ...newItems[index], ...update };
                  return newItems;
                });
                // Update Project state
                setCurrentProject(prevProject => {
                  if (!prevProject) return prevProject;
                  const newItems = [...(prevProject.items || [])];
                  newItems[index] = { ...newItems[index], ...update };
                  return { ...prevProject, items: newItems };
                });
              }}
              onForceSave={() => {
                setCurrentProject(prevProject => {
                  if (prevProject) handleSaveProject(prevProject);
                  return prevProject;
                });
              }}
              audioFile={file}
              audioDuration={audioDuration}
              onAudioAttached={setFile}
              settings={settings}
              onSave={handleSaveProject}
              context={context}
              projectCharacters={currentProject?.characters || []}
              projectLocations={currentProject?.locations || []}
              projectProps={currentProject?.props || []}
              activeStylePrompt={settings.items.find(s => s.id === selectedStyle)?.prompt || ''}
              onUpdateProjectInfo={(field, value) => {
                // IMPORTANTE: Captura o estado atual, aplica a mudança e SALVA
                // Não usamos setter funcional aqui para evitar race conditions com o salvamento assíncrono
                if (currentProject) {
                  const updatedProject = { ...currentProject, [field]: value };
                  // O setItems é necessário se o campo for 'items'
                  if (field === 'items') setItems(value);
                  handleSaveProject(updatedProject);
                }
              }}
              onUpdateGlobalSetting={(field, value) => {
                setSettings({ ...settings, [field]: value });
              }}
              projectName={currentProject?.name}
              projectId={currentProject?.id}
              selectedStyleId={selectedStyle}
              onStyleChange={(newStyleId) => {
                const styleLabel = settings.items.find(s => s.id === newStyleId)?.label || 'Generic';
                setSelectedStyle(newStyleId);
                // Limpar todos os campos medium e style das cenas para que o novo Estilo Global tenha precedência
                setItems(prevItems => prevItems.map(item => ({ ...item, medium: '', style: '' })));
                setCurrentProject(prevProject => {
                  if (!prevProject) return prevProject;
                  const newItems = (prevProject.items || []).map(item => ({ ...item, medium: '', style: '' }));
                  const updatedProject = { ...prevProject, items: newItems, projectStyle: newStyleId, image_style_name: styleLabel };
                  handleSaveProject(updatedProject);
                  return updatedProject;
                });
              }}
            />
          )
        ) : viewMode === 'analytics' ? (
          <SystemInfo usage={usage} apiInfrastructure={apiInfrastructure} onRefresh={() => { refreshUsage(); refreshApiInfo(); }} />
        ) : (
          <ImageStylesGallery settings={settings} onBack={() => setViewMode('transcription')} />
        )}
      </main>

      {/* Sidebar de Projetos */}
      {isProjectsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsProjectsOpen(false)}></div>
          <div className="relative w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white uppercase tracking-wider flex items-center">
                <FolderOpen className="w-5 h-5 mr-3 text-brand-400" />
                Projetos Salvos
              </h3>
              <button onClick={() => setIsProjectsOpen(false)} className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                  <History className="w-12 h-12 mb-4 opacity-20" />
                  <p>Nenhum projeto encontrado</p>
                </div>
              ) : (
                projects.map((proj) => {
                  const isEditingName = editingProjectId === proj.id;

                  const submitRename = async (e?: React.MouseEvent | React.KeyboardEvent) => {
                      if (e) e.stopPropagation();
                      if (editingProjectName.trim() === '' || editingProjectName === proj.name) {
                          setEditingProjectId(null);
                          return;
                      }
                      try {
                          // Busca projeto completo se não for o aberto, ou usa o local se for
                          let fullProject: Project | null = null;
                          if (currentProject?.id === proj.id) {
                              fullProject = currentProject;
                          } else {
                              fullProject = await getProjectById(proj.id);
                          }
                          
                          if (fullProject) {
                              const updated = { ...fullProject, name: editingProjectName.trim() };
                              await saveProject(updated);
                              if (currentProject?.id === proj.id) setCurrentProject(updated);
                              
                              // Atualiza visualmente na lista rápida
                              setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, name: editingProjectName.trim() } : p));
                          }
                      } catch (err) {
                          console.error("Falha ao renomear:", err);
                      }
                      setEditingProjectId(null);
                  };

                  return (
                    <div key={proj.id} className="group p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 hover:border-brand-500/30 hover:bg-slate-800 transition-all cursor-pointer relative" onClick={() => !isEditingName && handleLoadProject(proj.id)}>
                      <div>
                        {isEditingName ? (
                            <div className="flex items-center gap-2 mb-1 pr-14" onClick={e => e.stopPropagation()}>
                                <input 
                                    type="text" 
                                    autoFocus
                                    value={editingProjectName} 
                                    onChange={e => setEditingProjectName(e.target.value)} 
                                    onKeyDown={e => e.key === 'Enter' && submitRename(e)}
                                    className="bg-slate-950 border border-brand-500/50 text-white text-sm px-2 py-1 rounded w-full outline-none focus:border-brand-500" 
                                />
                                <button onClick={submitRename} className="p-1.5 bg-brand-500 hover:bg-brand-400 text-white rounded"><Check size={14}/></button>
                            </div>
                        ) : (
                            <h4 className="font-bold text-slate-200 group-hover:text-brand-400 transition-colors mb-1 truncate pr-16">{proj.name}</h4>
                        )}
                        <div className="flex items-center text-xs text-slate-500 space-x-3">
                          <span className="flex items-center"><Clock className="w-3 h-3 mr-1" /> {proj.date}</span>
                          <span className="flex items-center"><Layout className="w-3 h-3 mr-1" /> {proj.itemsCount ?? proj.items.length} cenas</span>
                        </div>
                      </div>
                      
                      {!isEditingName && (
                        <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                            onClick={(e) => { e.stopPropagation(); setEditingProjectName(proj.name); setEditingProjectId(proj.id); }}
                            className="p-1.5 rounded-lg hover:bg-brand-500/20 hover:text-brand-400 text-slate-500 transition-colors"
                            >
                            <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteProject(proj.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 text-slate-500 transition-colors"
                            >
                            <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <footer className="h-10 bg-slate-900/80 border-t border-slate-800 px-6 flex items-center justify-between text-[10px] font-medium tracking-widest text-slate-500 uppercase">
        <div className="flex items-center space-x-6">
          {supabaseStatus === 'stable' && <span className="flex items-center"><ShieldCheck className="w-3 h-3 mr-1.5 text-emerald-500" /> Supabase Connected</span>}
          {supabaseStatus === 'connecting' && <span className="flex items-center"><Loader2 className="w-3 h-3 mr-1.5 text-yellow-400 animate-spin" /> Conectando ao Supabase...</span>}
          {supabaseStatus === 'error' && <span className="flex items-center"><AlertCircle className="w-3 h-3 mr-1.5 text-red-400" /> Supabase Offline</span>}
          <span className="flex items-center"><Activity className="w-3 h-3 mr-1.5 text-brand-400" /> API Latency: 42ms</span>
        </div>
        <div className="flex items-center space-x-4">
          <button onClick={() => setIsChangelogOpen(true)} className="hover:text-brand-400 transition-colors cursor-pointer">v1.9.89 Build 2026.03.07</button>
        </div>
      </footer>
    </div>
  );
};

export default App;
