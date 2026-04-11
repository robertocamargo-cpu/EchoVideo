
import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptionItem, TranscriptionResponse, ViralTitle, MasterAsset } from "../types";
import { logApiCost } from "./usageService";
import { splitAudioFile } from "./audioService";
import { cleanDescription, normalizeCamera, sanitizeNickname, buildFinalVisualPrompt } from "./promptSanitizer";

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

// Text tasks - user confirmed 2.5-flash was working
export const TEXT_MODEL_NAME = "gemini-1.5-flash";
// Gemini Nano / Imagen Series - IDs EXATOS conforme solicitado pelo usuário
export const IMAGEN_ULTRA_MODEL_NAME = "imagen-3.0-generate-001";
export const IMAGEN_FAST_MODEL_NAME = "imagen-4.0-fast-generate-001";
// Nano Banana Normal - Gemini 2.5 Flash Image API
export const NANO_MODEL_NAME = "gemini-2.5-flash-image"; 
// Alias de compatibilidade
export const IMAGEN_MODEL_NAME = IMAGEN_FAST_MODEL_NAME;
export const NANO_BATCH_MODEL_NAME = NANO_MODEL_NAME;
export const IMAGE_MODEL_NAME = NANO_MODEL_NAME;


// Helper to convert File to base64 for Gemini API multimodal input
const fileToBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Checks API infrastructure status by verifying if a paid API key has been selected.
 */
export const getApiInfrastructure = async () => {
  let hasAiStudioKey = false;
  try {
    if (window.aistudio?.hasSelectedApiKey) {
      hasAiStudioKey = await Promise.race([
        window.aistudio.hasSelectedApiKey(),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2000))
      ]);
    }
  } catch (e) {
    console.warn("AI Studio info check failed:", e);
  }
  
  const hasLocalKey = process.env.API_KEY && process.env.API_KEY !== 'PLACEHOLDER_API_KEY';
  const isPremium = hasAiStudioKey || hasLocalKey;

  return {
    type: isPremium ? 'PREMIUM' : 'STANDARD',
    label: isPremium ? 'Infra Premium (Paid)' : 'Infra Standard (Free)',
    isPremium: !!isPremium
  };
};

/**
 * Generates an image using the Gemini Image generation model.
 */
export const generateImage = async (prompt: string, aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' = '1:1', modelName: string = IMAGE_MODEL_NAME) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  logApiCost('image', modelName, 0.04, { prompt, aspectRatio });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio } }
    });

    let base64Image = "";
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!base64Image) throw new Error("A IA não retornou uma imagem válida.");
    return { image: base64Image, prompt };
  } catch (error: any) {
    if (error.message?.includes('404') || error.message?.includes('not found')) {
      const msg = `ERRO 404: O modelo '${modelName}' não foi encontrado na sua conta. Verifique se o ID está disponível no Google AI Studio.`;
      console.error(`❌ [Google AI] ${msg}`);
      throw new Error(msg);
    }
    throw error;
  }
};

export const generateText = async (prompt: string, modelName: string = TEXT_MODEL_NAME): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt
  });
  return response.text || '';
};



/**
 * Generates viral titles based on a script and context.
 */
export const generateViralTitles = async (script: string, context: string, titlesPrompt: string): Promise<ViralTitle[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  logApiCost('text', TEXT_MODEL_NAME, 0.01, { script_length: script.length });

  const fullPrompt = `Script/Tema: ${script}\nContexto: ${context}\n\n${titlesPrompt}`;

  const response = await ai.models.generateContent({
    model: TEXT_MODEL_NAME,
    contents: fullPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            explanation: { type: Type.STRING },
            viralityScore: { type: Type.NUMBER },
            thumbnailVisual: { type: Type.STRING },
            thumbnailText: { type: Type.STRING },
            abWinnerReason: { type: Type.STRING }
          },
          required: ["title", "explanation", "viralityScore", "thumbnailVisual", "thumbnailText"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse titles JSON", e);
    return [];
  }
};

/**
 * Enriches an SRT file OR transcribes audio directly with visual descriptions and scene segmentation.
 */
export const enrichSrtWithVisuals = async (
  audioFile: File, 
  srtText: string | null, 
  context: string, 
  stylePrompt: string, 
  scriptText?: string,
  onProgress?: (progress: number, current: number, total: number) => void
): Promise<TranscriptionResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const LARGE_FILE_THRESHOLD = 15 * 1024 * 1024; // 15MB
  const WINDOW_SIZE = 30; // Reduzido de 60s para 30s para forçar fragmentação e precisão.

  logApiCost('text', TEXT_MODEL_NAME, 0.10, { audio_size: audioFile.size });

  let audioPart: any;
  let totalDuration = 0;

  console.log("[Gemini] Detecting audio duration...");
  try {
    totalDuration = await new Promise((resolve) => {
      const audio = new Audio(URL.createObjectURL(audioFile));
      audio.onloadedmetadata = () => {
        const dur = audio.duration;
        URL.revokeObjectURL(audio.src);
        resolve(dur);
      };
      audio.onerror = () => resolve(0);
      setTimeout(() => resolve(0), 5000);
    });
  } catch (e) { console.warn("[Gemini] Duration detection failed.", e); }

  let uploadedGeminiFile: any = null;

  try {
    if (audioFile.size > LARGE_FILE_THRESHOLD) {
      console.log("[Gemini] Large audio detected. Uploading via File API...");
      uploadedGeminiFile = await ai.files.upload({
        file: audioFile,
        config: { mimeType: audioFile.type || 'audio/mpeg' }
      });

      let fileInfo = await ai.files.get({ name: uploadedGeminiFile.name });
      while (fileInfo.state === 'PROCESSING') {
        console.log("[Gemini] File processing on server...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        fileInfo = await ai.files.get({ name: uploadedGeminiFile.name });
      }
      if (fileInfo.state === 'FAILED') {
        throw new Error("O servidor da IA falhou ao processar o arquivo de áudio.");
      }

      audioPart = { fileData: { fileUri: fileInfo.uri, mimeType: fileInfo.mimeType } };
    } else {
      const audioBase64 = await fileToBase64(audioFile);
      audioPart = { inlineData: { mimeType: audioFile.type || 'audio/mpeg', data: audioBase64 } };
    }
  } catch (e: any) {
    console.error("[Gemini] File preparation error:", e);
    throw new Error(`Falha ao preparar o áudio para a IA: ${e?.message || e}.`);
  }

  if (totalDuration === 0) totalDuration = 300;

  try {
    // Inventory Phase
    console.log("[Gemini] Phase 0: Assets Inventory...");
    const inventoryPrompt = `MASTER INVENTORY — CREATIVE TRANSCRIPTION ENGINE
    Analyze the audio/script. Extract recurring characters, locations, and important props.
    
    🎨 ASSET DNA (STRICT ANATOMY & NO STYLE):
    - CHARACTERS description: YOU MUST STRICTLY USE DEFINED ANATOMY ALWAYS: Type/Archetype, Hair, Face/Eyes, Upper Clothing, Lower Clothing, Shoes. 
    - CRITICAL: NO LABELS ALLOWED (e.g. do NOT write "Hair: Short", just write "Short hair"). Return a clean, comma-separated list of attributes.
    - NEVER USE PROPER NAMES IN DESCRIPTIONS (e.g. use "Middle-aged bearded man" instead of "Jerry").
    - IMPORTANT: If the character is a real-world entity (celebrity, historical figure, politician, etc.), you MUST faithfully reproduce their actual physical characteristics. Use their real identity as the absolute reference for the anatomy description.
    - Describe using natural English phrases. ESTRITAMENTE PROIBIDO terms about lighting, quality, or style (no "cinematic", "4k", "octane").
    - LOCATIONS/PROPS: Return a clean list of 4 attributes (Structure, Anchors, Materials, Lighting), max 60 words. LITERAL descriptions only, NO labels, NO proper names, NO metaphors.
    
    🗣️ DEFINITIVE NAMING RULES:
    1. CHARACTERS: ESTRITAMENTE PROIBIDO usar nomes reais ou IDs (ex: char01) no campo 'name'. Crie um apelido (nickname) amigável e fonético EM INGLÊS. Ex: 'Elon Musk' -> 'Ilonmãsqui' ou 'Elon'.
    2. LOCATIONS/PROPS: Use nicknames limpos em INGLÊS no campo 'name' (ex: 'SunnyvaleBoardroom', 'Table', 'AirConditioner'). Proibido slugs com underline ou termos em Português.
    3. SECURITY: Nomes reais de pessoas devem ficar APENAS no campo 'realName'.
    
    FIELD RULES FOR GENERATION (ENGLISH ONLY in description fields):
    CHARACTER description — one paragraph, flat list of attributes, NO LABELS.
    LOCATION description — flat list of 4 attributes, max 60 words, NO LABELS.
    PROP description — flat list of attributes, NO LABELS.
    
    ${scriptText ? `ORIGINAL SCRIPT FOR REFERENCE:\n${scriptText}\n` : ''}

    Return JSON: { 
      detectedCharacters: [...], 
      detectedLocations: [...], 
      detectedProps: [...]
    }`;

    let globalAssets: any;
    let invRetries = 3;
    while (invRetries > 0) {
      try {
        const inventoryResponse = await ai.models.generateContent({
          model: TEXT_MODEL_NAME, // Flash 2.0 handles this well and avoids 404 errors
          contents: { parts: [audioPart, { text: inventoryPrompt }] },
          config: {
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                detectedCharacters: { 
                  type: "array", 
                  items: { 
                    type: "object", 
                    properties: { 
                      id: { type: "string" }, 
                      name: { type: "string" }, 
                      realName: { type: "string" }, 
                      description: { type: "string" } 
                    }, 
                    required: ["id", "name", "description"] 
                  } 
                },
                detectedLocations: { 
                  type: "array", 
                  items: { 
                    type: "object", 
                    properties: { 
                      id: { type: "string" }, 
                      name: { type: "string" }, 
                      realName: { type: "string" }, 
                      description: { type: "string" } 
                    }, 
                    required: ["id", "name", "description"] 
                  } 
                },
                detectedProps: { 
                  type: "array", 
                  items: { 
                    type: "object", 
                    properties: { 
                      id: { type: "string" }, 
                      name: { type: "string" }, 
                      description: { type: "string" } 
                    }, 
                    required: ["id", "name", "description"] 
                  }
                }
              },
              required: ["detectedCharacters", "detectedLocations", "detectedProps"]
            }
          }
        });
        
        let rawInventory = inventoryResponse.text || '{"detectedCharacters":[], "detectedLocations":[], "detectedProps":[]}';
        rawInventory = rawInventory.replace(/```json/gi, '').replace(/```/gi, '').trim();
        rawInventory = rawInventory.replace(/\n|\r/g, " "); // Fix raw newlines causing Unterminated String
        rawInventory = rawInventory.replace(/,\s*([\]}])/g, "$1"); // Resolve trailing commas
        
        globalAssets = JSON.parse(rawInventory);
        if (!globalAssets.detectedProps) globalAssets.detectedProps = [];
        
        // POST-INVENTORY WASH: Sanitize names and descriptions immediately
        globalAssets.detectedCharacters = globalAssets.detectedCharacters.map((c: any) => ({
          ...c,
          name: sanitizeNickname(c.name),
          description: cleanDescription(c.description)
        }));
        globalAssets.detectedLocations = globalAssets.detectedLocations.map((l: any) => ({
          ...l,
          name: sanitizeNickname(l.name),
          description: cleanDescription(l.description)
        }));
        globalAssets.detectedProps = globalAssets.detectedProps.map((p: any) => ({
          ...p,
          name: sanitizeNickname(p.name),
          description: cleanDescription(p.description)
        }));
        break;
      } catch (e: any) {
        invRetries--;
        console.warn(`[Gemini] Error in Phase 0 (Inventory), retries left: ${invRetries}`, e);
        if (invRetries === 0) throw new Error(`Falha de comunicação com a IA (Fase 0): ${e?.message || e}.`);
        await new Promise(r => setTimeout(r, 4000));
      }
    }

    // Chunk Phase
    const allItems: TranscriptionItem[] = [];
    console.log("[Gemini] Slicing audio for precise chunk processing...");
    const audioChunks = await splitAudioFile(audioFile, WINDOW_SIZE);

    const globalSrtSegments: { start: number; end: number; text: string }[] = [];

    if (srtText) {
      // Parse entire SRT string once globally
      const blocks = srtText.split(/\n\s*\n/);
      for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 2) continue;

        let timeLine = "";
        let textStartIdx = 1;

        if (lines[0].includes('-->')) {
          timeLine = lines[0];
        } else if (lines[1] && lines[1].includes('-->')) {
          timeLine = lines[1];
          textStartIdx = 2;
        }

        if (timeLine) {
          const match = timeLine.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
          if (match) {
            const startH = parseInt(match[1]);
            const startM = parseInt(match[2]);
            const startS = parseInt(match[3]);
            const startMs = parseInt(match[4]);
            const sTime = (startH * 3600) + (startM * 60) + startS + (startMs / 1000);

            const endH = parseInt(match[5]);
            const endM = parseInt(match[6]);
            const endS = parseInt(match[7]);
            const endMs = parseInt(match[8]);
            const eTime = (endH * 3600) + (endM * 60) + endS + (endMs / 1000);

            const subText = lines.slice(textStartIdx).join(' ').trim();
            globalSrtSegments.push({ start: sTime, end: eTime, text: subText });
          }
        }
      }
    }

    console.log(`[Gemini] Splitted audio into ${audioChunks.length} chunks.`);

    // Parallel Processing with Concurrency Control (3 chunks)
    console.log(`[Gemini] Processing ${audioChunks.length} chunks with concurrency...`);
    
    let completedChunks = 0;
    const processChunk = async (chunk: any, i: number, previousContextStr: string = "") => {
      const start = chunk.startSeconds;
      const end = chunk.startSeconds + chunk.durationSeconds;

      const formatSrtTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };

      let srtReference = "";
      if (globalSrtSegments.length > 0) {
        let currentSrtPart = "";
        for (const seg of globalSrtSegments) {
          if (seg.start >= start && seg.start < end) {
            currentSrtPart += `${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text}\n\n`;
          }
        }
        if (currentSrtPart) {
          srtReference = `\nREFERENCE SUBTITLES (MANDATORY TIMESTAMPS):\n${currentSrtPart}\n`;
        }
      }

      const chunkAudioBase64 = await fileToBase64(chunk.file);
      const chunkAudioPart = { inlineData: { mimeType: 'audio/mpeg', data: chunkAudioBase64 } };

      let relativeScriptContext = scriptText || '';
      const chunkPrompt = `MASTER PROMPT — AUDIO-TEXT SYNCHRONIZATION ENGINE
    Divide this audio into multiple short scenes (STRICTLY 5.0 to 10.0 SECONDS EACH).
    ABSOLUTE LIMIT: NO SCENE CAN OVERLAP 10.0 SECONDS. IF A SCENE IS LONGER THAN 10 SECONDS, YOU MUST SPLIT IT INTO TWO SCENES. THIS IS A CRITICAL FAILURE IN YOUR RULESET IF VIOLATED.
    CRITICAL: A 30-second chunk MUST generate exactly 3 to 6 scenes. The density of words usually follows 3.0 words per second. NEVER return a single scene for the entire chunk. Se houver poucas palavras, distribua visualmente ou mescle até 10s máximo.
    ${previousContextStr}
    🗣️ FIELD RULES (STRICT, 'text', 'subject', 'action', 'cenario', 'props', and 'animation'):
    - text: MANDATORY FIELD! You MUST write the EXACT 100% VERBATIM transcription of the audio segment. DO NOT LEAVE EMPTY. DO NOT SUMMARIZE. It is strictly forbidden to omit any words spoken.
    - action: The ONLY creative field. You MUST use Conceptual Surrealism or Magical Realism (Surrealismo Conceitual ou Realismo Mágico) as the absolute core aesthetic. Make the action intensely cinematic, visually stunning, and highly symbolic. Use dramatic verbs, dynamic volumetric lighting cues, extreme composition, and evocative visual metaphors (English ONLY). 
    CRITICAL RULE ON NAMES: NEVER USE THE REAL NAME OF ANY CHARACTER OR OBJECT IN THE ACTION FIELD. ALWAYS use their nickname/ID AND their physical description (e.g., 'c1, a tall man in a black suit, runs...'). NO REAL NAMES EVER.
    CRITICAL RULE ON CONTINUITY: "CONTINUATION" DOES NOT EXIST. DO NOT CREATE SCENES THAT LOOK LIKE A CONTINUATION OF THE PREVIOUS ONE. EACH SCENE IS A BRAND NEW DRAMATIC CUT. ACTION MUST CHANGE ENTIRELY.
    CRITICAL: AVOID REPETITIVE FRAMING! Every scene MUST feel visually unique from the previous one. Use a mix of abstract concepts, extreme close-ups, and giant-scale landscapes. NEVER repeat the same visual setup twice in a row.
    - subject: Return a string mentioning ONLY character nicknames or IDs (English ONLY). NO CHARACTERISTICS HERE.
    - cenario: Return a string mentioning ONLY location/prop names or IDs (English ONLY). PHYSICAL ANCHORING ONLY. NO SYMBOLISM OR CREATIVITY.
    - camera: Pick a camera angle from: [Wide shot, Close-up, Low angle, Eye level, Bird's eye view, Dutch angle, Extreme Close-up, High Angle]. YOU MUST VARY THE CAMERA ANGLE WILDLY! Never repeat the same angle consecutively. Avoid boring head-on eye-level shots.
    - animation: YOU MUST strictly choose EXACTLY ONE of the following 5 predefined animation effects for this scene, passing ONLY its exact name in English (do NOT create new effects):
      1. Dynamic Zoom-In Drift
      2. Contextual Zoom-Out Reveal
      3. Cinematic Dolly Slide
      4. Elegant Diagonal Lift
      5. Fluid Descending Sweep
      NEVER repeat the same effect in consecutive scenes!
    - SYNC: O início e fim devem bater com a locução exata no áudio.
    - MUSIC/SILENCE: Use "(🎵)" apenas se não houver NENHUMA VOZ narrada num trecho superior a 5 segundos. MAS SE HOUVER LOCUÇÃO, a transcrição é absoluta.
    
    ${srtReference}
    ${relativeScriptContext ? `\nORIGINAL TEXT REFERENCE (MANDATORY VERBATIM CONTENT):\n${relativeScriptContext}\nRule: Use strictly the EXACT words from the provided text for the 'text' field. Word-for-word synchronization is mandatory. Do NOT skip any words.\n` : ''}

    MASTER ASSETS (USE IDs):
    Characters: ${globalAssets.detectedCharacters.map((c: any) => `${c.id} (${c.name})`).join(", ")}
    Locations: ${globalAssets.detectedLocations.map((l: any) => `${l.id} (${l.name})`).join(", ")}
    Props: ${globalAssets.detectedProps.map((p: any) => `${p.id} (${p.name})`).join(", ")}
    
    Return JSON following the schema. Ensure characterIds, locationIds, and propIds are populated with the IDs above.`;

      let retries = 3;
      let chunkData = { items: [] };

      while (retries > 0) {
        try {
          const chunkResponse = await ai.models.generateContent({
            model: TEXT_MODEL_NAME, 
            contents: { parts: [chunkAudioPart, { text: chunkPrompt }] },
            config: {
              maxOutputTokens: 8192,
              responseMimeType: "application/json",
              responseSchema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        startSeconds: { type: "number" },
                        endSeconds: { type: "number" },
                        text: { type: "string" },
                        subject: { type: "string" },
                        action: { type: "string" },
                        cenario: { type: "string" },
                        props: { type: "string" },
                        animation: { type: "string" },
                        animationRationale: { type: "string" },
                        camera: { type: "string" },
                        characterIds: { type: "array", items: { type: "string" } },
                        locationIds: { type: "array", items: { type: "string" } },
                        propIds: { type: "array", items: { type: "string" } }
                      },
                      required: ["startSeconds", "endSeconds", "text", "subject", "action", "cenario", "camera"]
                    }
                  }
                },
                required: ["items"]
              }
            }
          });

          let rawText = chunkResponse.text || '{"items":[]}';
          rawText = rawText.replace(/(\d+)\.(?=[,\]}\s])/g, '$1.0');
          chunkData = JSON.parse(rawText);
          break;
        } catch (err: any) {
          retries--;
          console.warn(`[Gemini] Failed chunk ${i + 1} (${start}-${end}s), retries left: ${retries}`, err);
          if (retries === 0) break;
          await new Promise(r => setTimeout(r, 4000));
        }
      }

      completedChunks++;
      if (onProgress) {
        onProgress((completedChunks / audioChunks.length) * 100, completedChunks, audioChunks.length);
      }
      return { index: i, items: chunkData.items, start, duration: chunk.durationSeconds };
    };

    // Process chunks sequentially to pass context forward and prevent repetitive scenes
    const allChunkResults: any[] = [];
    let previousChunkContext = "";

    for (let idx = 0; idx < audioChunks.length; idx++) {
      const chunk = audioChunks[idx];
      const res = await processChunk(chunk, idx, previousChunkContext);
      allChunkResults.push(res);
      
      if (res.items && res.items.length > 0) {
        const lastScene = res.items[res.items.length - 1];
        previousChunkContext = `\n[CRITICAL CONTEXT] THE FINAL SCENE OF THE PREVIOUS CHUNK HAD:\n- Action: "${lastScene.action}"\n- Camera: "${lastScene.camera || "N/A"}"\n- Animation: "${lastScene.animation}"\nYOU MUST MAKE THE FIRST SCENE OF THIS CURRENT CHUNK COMPLETELY DIFFERENT IN ACTION, CAMERA, AND ANIMATION TO AVOID REPETITIVE FRAMING!\n`;
      }
    }

    // Reorder results to maintain temporal sequence
    allChunkResults.sort((a, b) => a.index - b.index);

    // POST-PROCESS 1: Chronological sorting and Prompt Reconstruction
    // Rule: first occurrence → full description | repetitions → nickname only
    allItems.sort((a, b) => a.startSeconds - b.startSeconds);
    
    const seenAssetIds = new Set<string>();

    for (const chunkResult of allChunkResults) {
      const { items: rawItems, start, duration: chunkDuration } = chunkResult;
      try {
        let currentBoundary = start;
        if (allItems.length > 0) {
          currentBoundary = allItems[allItems.length - 1].endSeconds;
        }

        // Deduplicação e Limpeza
        const uniqueRawItems = (rawItems || []).filter((item: any, i: number) => {
          if (!item || item.startSeconds === undefined || item.endSeconds === undefined) return false;
          if (item.endSeconds <= item.startSeconds) return false;
          const isDuplicate = rawItems.slice(0, i).some((prev: any) => 
            prev.startSeconds === item.startSeconds && prev.endSeconds === item.endSeconds
          );
          return !isDuplicate;
        });

        const items = uniqueRawItems.flatMap((item: any, idx: number) => {
          let rawStart = item.startSeconds !== undefined ? Number(item.startSeconds) : (idx * 5);
          let rawEnd = item.endSeconds !== undefined ? Number(item.endSeconds) : rawStart + 7;

          const GLOBAL_SYNC_OFFSET = 0.0;
          let gStart = (rawStart >= start ? rawStart : start + Math.min(rawStart, chunkDuration)) + GLOBAL_SYNC_OFFSET;
          let gEnd = (rawEnd >= start ? rawEnd : start + Math.min(rawEnd, chunkDuration)) + GLOBAL_SYNC_OFFSET;

          gStart = Math.max(0, gStart);
          gEnd = Math.max(0.5, gEnd);

          if (allItems.length > 0) {
            const lastEnd = allItems[allItems.length - 1].endSeconds;
            const gap = gStart - lastEnd;
            if (gap > 0 && gap < 1.5) gStart = lastEnd;
          } else {
            const gap = gStart - start;
            if (gap > 0 && gap < 1.5) gStart = start;
          }

          const wordCount = item.text ? item.text.split(' ').length : 0;
          const textMinDuration = Math.max(5.0, wordCount / 3.0); 

          if (gEnd <= gStart + 0.5) gEnd = gStart + Math.max(textMinDuration, 5.0);

          gStart = Math.max(start, Math.min(gStart, start + chunkDuration - 0.5));
          gEnd = Math.max(gStart + 0.5, Math.min(gEnd, start + chunkDuration + 5.0)); 

          const formatTime = (secs: number) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.floor((secs % 1) * 100);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
          };

          // RECONSTRUCTION RULE: first occurrence → full description | repetitions → nickname only
          
          // Reconstruct SUBJECT
          let uiSubject = "";
          let detailedSubjectForVp = "";
          const foundChars = (item.characterIds || []).map((id: string) => globalAssets.detectedCharacters.find((c: any) => c.id === id)).filter(Boolean);
          
          if (foundChars.length > 0) {
            uiSubject = foundChars.map((c: any) => `${c.name}: ${c.description.split(',').slice(0, 2).join(', ')}`).join(" | ");
            
            detailedSubjectForVp = foundChars.map((c: any) => {
              if (!seenAssetIds.has(c.id)) {
                seenAssetIds.add(c.id);
                return `${c.name}, ${c.description}`; // Nickname + Full Desc first time
              }
              return c.name; // Nickname only repetition
            }).join(", ");
          }

          // Reconstruct SCENARIO
          let uiCenario = "";
          let detailedCenarioForVp = "";
          const foundLoc = (item.locationIds || []).map((id: string) => globalAssets.detectedLocations.find((l: any) => l.id === id)).filter(Boolean)[0];
          const foundProps = (item.propIds || []).map((id: string) => globalAssets.detectedProps.find((p: any) => p.id === id)).filter(Boolean);

          if (foundLoc) {
            uiCenario = `${foundLoc.name}: ${foundLoc.description}`;
            if (!seenAssetIds.has(foundLoc.id)) {
              seenAssetIds.add(foundLoc.id);
              detailedCenarioForVp = `${foundLoc.name}, ${foundLoc.description}`;
            } else {
              detailedCenarioForVp = foundLoc.name;
            }
          }

          if (foundProps.length > 0) {
            const propStrings = foundProps.map((p: any) => `${p.name}: ${p.description}`);
            uiCenario += (uiCenario ? " | " : "") + propStrings.join(" | ");
            
            const detailedProps = foundProps.map((p: any) => {
              if (!seenAssetIds.has(p.id)) {
                seenAssetIds.add(p.id);
                return `${p.name}, ${p.description}`;
              }
              return p.name;
            }).join(", ");
            
            detailedCenarioForVp += (detailedCenarioForVp ? ", " : "") + detailedProps;
          }

          const uiAction = item.action || "";

          // Final Image Prompt structure [Style]. [Subject]. [Action]. [Scenario]. [Camera Angle].
          // Using strict buildFinalVisualPrompt utility
          const vp = buildFinalVisualPrompt(
            stylePrompt,
            detailedSubjectForVp,
            uiAction,
            detailedCenarioForVp,
            item.camera || "",
            `Visual Integrity: "Pure image only: all surfaces are blank and free of any text or letters."`
          );

          const totalDuration = gEnd - gStart;
          const scenesToCreate: any[] = [];
          
          const sceneBase = {
            filename: audioFile.name,
            startSeconds: gStart,
            endSeconds: gEnd,
            duration: totalDuration,
            startTimestamp: formatTime(gStart),
            endTimestamp: formatTime(gEnd),
            text: item.text,
            subject: uiSubject,
            action: uiAction,
            cenario: uiCenario,
            animation: item.animation || "",
            animationRationale: item.animationRationale || "",
            characterIds: item.characterIds || [],
            locationIds: item.locationIds || [],
            propIds: item.propIds || [],
            imagePrompt: vp,
            selectedProvider: 'google-imagen',
            srtSegments: undefined
          };

          if (totalDuration > 10.0) {
            const numParts = Math.ceil(totalDuration / 10.0);
            const partDuration = totalDuration / numParts;
            for (let p = 0; p < numParts; p++) {
              const pStart = gStart + (p * partDuration);
              const pEnd = (p === numParts - 1) ? gEnd : gStart + ((p + 1) * partDuration);
              
              let partText = "";
              let partSrt: any[] = [];
              
              if (globalSrtSegments.length > 0) {
                partSrt = globalSrtSegments.filter(seg => seg.end > pStart && seg.start < pEnd);
                partText = partSrt.length > 0 ? partSrt.map(s => s.text).join(' ').trim() : "(continua)";
              } else {
                // Split words manually for TXT/Script reference
                const words = item.text ? item.text.split(/\s+/) : [];
                const wordsPerPart = Math.ceil(words.length / numParts);
                partText = words.slice(p * wordsPerPart, (p + 1) * wordsPerPart).join(' ');
              }

              scenesToCreate.push({
                ...sceneBase,
                startTimestamp: formatTime(pStart),
                endTimestamp: formatTime(pEnd),
                startSeconds: pStart,
                endSeconds: pEnd,
                duration: pEnd - pStart,
                text: partText || "(continua)",
                action: uiAction + (numParts > 1 ? ` (Parte ${p+1})` : ""),
                srtSegments: partSrt.length > 0 ? partSrt : undefined
              });
            }
          } else {
            const srtSegments = globalSrtSegments.filter(seg =>
              seg.end > gStart && seg.start < gEnd
            );
            scenesToCreate.push({
              ...sceneBase,
              srtSegments: srtSegments.length > 0 ? srtSegments : undefined
            });
          }
          return scenesToCreate;
        }); allItems.push(...items);
      } catch (e: any) {
        const chunkIndex = (chunkResult as any).index || 0;
        console.error(`[Gemini] Error in chunk ${chunkIndex + 1}`, e);
        throw new Error(`Ocorreu uma falha na inteligência artificial ao decupar o trecho de ${start}s até ${start + chunkDuration}s: ${e?.message || e}. Dica: o script enviado pode estar muito grande ou detalhado para ser processado de uma vez.`);
      }
    }

    // TEMPORAL SAFETY: Ensure all generated items are strictly sorted chronologically.
    // Ocasionalmente a IA retorna propriedades JSON embaraçadas (ex: cena de 56s aparecendo antes da de 31s).
    // O 'sort' absoluto blinda 100% nossa cascata de Post-Processadores para não gerar vácuos cronológicos inversos.
    allItems.sort((a, b) => a.startSeconds - b.startSeconds);

    // DIAGNOSTIC LOG — Ajuda a identificar em qual étapa um gap aparece
    console.log(`[GeminiService] ✅ Total raw items after sort: ${allItems.length}`);
    console.log(`[GeminiService] ✅ Timeline coverage: ${allItems.map(it => `${it.startSeconds.toFixed(1)}-${it.endSeconds.toFixed(1)}`).join(' | ')}`);

    const finalMergedItems: any[] = [];
    for (const item of allItems) {
      if (finalMergedItems.length > 0) {
        const last = finalMergedItems[finalMergedItems.length - 1];
        
        const lastWords = last.text ? last.text.split(/\s+/).filter(Boolean).length : 0;
        const itemWords = item.text ? item.text.split(/\s+/).filter(Boolean).length : 0;
        const projectedDuration = (item.endSeconds - last.startSeconds);
        const projectedWps = (lastWords + itemWords) / (projectedDuration || 1);

        // MERGE CRITERIA (Aligned with instructions-core.md): 
        // 1. If last scene is too short in duration (< 5.0s)
        // 2. BUT ONLY if merging won't exceed the strict max duration (10s) 
        // 3. AND ONLY if it doesn't create severe "atropelamento" (> 3.0 wps)
        const isTooShort = last.duration < 5.0;
        const canAbsorb = projectedDuration <= 10.0 && projectedWps <= 3.0;

        if (isTooShort && canAbsorb) {
          last.endSeconds = item.endSeconds;
          last.endTimestamp = item.endTimestamp;
          last.duration = last.endSeconds - last.startSeconds;
          last.text = (last.text + " " + item.text).trim();

          // Merge SRT segments if they exist
          if (item.srtSegments) {
            last.srtSegments = [...(last.srtSegments || []), ...item.srtSegments];
            const uniqueSrt = new Map();
            last.srtSegments.forEach((s: any) => uniqueSrt.set(s.start, s));
            last.srtSegments = Array.from(uniqueSrt.values()).sort((a: any, b: any) => a.start - b.start);
          }

          continue; // Successfully merged, skip pushing item
        }
      }
      finalMergedItems.push(item);
    }

    // POST-PROCESS 2: FORCE-MERGE SCENES TOO SHORT TO RENDER (< 5s)
    // Se o WPS protection impediu um merge normal, forçamos aqui — cena impossível é pior que atropelada.
    let i = 0;
    while (i < finalMergedItems.length) {
      const current = finalMergedItems[i];
      if (current.duration < 5.0 && finalMergedItems.length > 1) {
        // Prefer absorbing forward, fall back to absorbing previous
        const absorb = i + 1 < finalMergedItems.length ? finalMergedItems[i + 1] : null;
        const target = absorb ? absorb : finalMergedItems[i - 1];
        const targetIdx = absorb ? i + 1 : i - 1;

        // Merge into target: take its range as union
        const newStart = Math.min(current.startSeconds, target.startSeconds);
        const newEnd = Math.max(current.endSeconds, target.endSeconds);
        target.startSeconds = newStart;
        target.endSeconds = newEnd;
        target.duration = newEnd - newStart;
        
        const fmtLocal = (secs: number) => {
          const m = Math.floor(secs / 60);
          const s = Math.floor(secs % 60);
          const ms = Math.floor((secs % 1) * 100);
          return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
        };
        target.startTimestamp = fmtLocal(target.startSeconds);
        target.endTimestamp = fmtLocal(target.endSeconds);

        // Merge text in correct order
        if (absorb) {
          target.text = (current.text + " " + target.text).trim();
        } else {
          target.text = (target.text + " " + current.text).trim();
        }

        // Merge SRT
        if (current.srtSegments) {
          target.srtSegments = [...(target.srtSegments || []), ...(current.srtSegments || [])];
          const uniq = new Map();
          target.srtSegments.forEach((s: any) => uniq.set(s.start, s));
          target.srtSegments = Array.from(uniq.values()).sort((a: any, b: any) => a.start - b.start);
        }

        // Remove the short scene
        finalMergedItems.splice(i, 1);
        // Don't advance i — recheck from same position
      } else {
        i++;
      }
    }

    // POST-PROCESS 3: RE-SPLIT LONG SCENES (Enforcement do limite máximo)
    // Se a IA cuspir uma cena gigante sozinha, fatiamos de volta para respeitar a regra dos ~10s
    const ultimateItems: any[] = [];
    for (const item of finalMergedItems) {
      if (item.duration > 10.0) {
        const numParts = Math.ceil(item.duration / 10.0);
        const partDuration = item.duration / numParts;
        
        for (let p = 0; p < numParts; p++) {
          const pStart = item.startSeconds + (p * partDuration);
          const pEnd = (p === numParts - 1) ? item.endSeconds : item.startSeconds + ((p + 1) * partDuration);
          
          let partText = "";
          if (item.srtSegments && item.srtSegments.length > 0) {
            const partSrt = item.srtSegments.filter((seg: any) => seg.end > pStart && seg.start < pEnd);
            partText = partSrt.map((s: any) => s.text).join(' ').trim();
          } else {
            const words = item.text ? item.text.split(' ') : [];
            const wordsPerPart = Math.ceil(words.length / numParts);
            partText = words.slice(p * wordsPerPart, (p + 1) * wordsPerPart).join(' ');
          }

          const formatTimeLocal = (secs: number) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.floor((secs % 1) * 100);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
          };

          ultimateItems.push({
            ...item,
            startSeconds: pStart,
            endSeconds: pEnd,
            duration: pEnd - pStart,
            startTimestamp: formatTimeLocal(pStart),
            endTimestamp: formatTimeLocal(pEnd),
            action: item.action + (numParts > 1 ? ` (Parte ${p+1} / ${numParts})` : ""),
            text: partText || "(pausa)"
          });
        }
      } else {
        ultimateItems.push(item);
      }
    }

    // FINAL SANITIZATION: Systematic removal of Real Names if leaked
    const allAssets = [
      ...(globalAssets.detectedCharacters || []),
      ...(globalAssets.detectedLocations || []),
      ...(globalAssets.detectedProps || [])
    ];

    // POST-PROCESS 4: WORD DENSITY ENFORCEMENT (Regra Anti-Atropelamento da Tabela de Ouro)
    // Se a cena gerada violar os top rates indicados pelo usuário, dividimos para resgatar a leitura orgânica.
    const strictDensityItems: any[] = [];
    for (const item of ultimateItems) {
      const words = item.text ? item.text.split(/\s+/).filter(Boolean) : [];
      const duration = item.endSeconds - item.startSeconds;
      
      const getMaxWords = (dur: number) => {
         if (dur <= 5.5) return 13;
         if (dur <= 6.5) return 15;
         if (dur <= 7.5) return 18;
         if (dur <= 8.5) return 20;
         if (dur <= 9.5) return 23;
         return 26; // >= 10s (banda de tolerância estrita baseada no 10s=25 max)
      };

      const maxAllowed = getMaxWords(duration);

      // Divisão ativada se forçar a vista E se o texto divido for suficiente para sustentar legibilidade visual (>13)
      if (words.length > maxAllowed && words.length > 13) { 
        const numParts = Math.ceil(words.length / 13); // Fatiamento cravado mirando blocos de ~13 palavras (equivalente a 5s cravado da tabela)
        const partDuration = duration / numParts;
        
        for (let p = 0; p < numParts; p++) {
          const pStart = item.startSeconds + (p * partDuration);
          const pEnd = (p === numParts - 1) ? item.endSeconds : item.startSeconds + ((p + 1) * partDuration);
          
          const wordsPerPart = Math.ceil(words.length / numParts);
          const partText = words.slice(p * wordsPerPart, (p + 1) * wordsPerPart).join(' ');

          const formatTimeLocal = (secs: number) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.floor((secs % 1) * 100);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
          };

          strictDensityItems.push({
            ...item,
            startSeconds: pStart,
            endSeconds: pEnd,
            duration: pEnd - pStart,
            startTimestamp: formatTimeLocal(pStart),
            endTimestamp: formatTimeLocal(pEnd),
            action: item.action + (numParts > 1 ? ` (Densidade ${p+1})` : ""),
            text: partText || "(continua)"
          });
        }
      } else {
        strictDensityItems.push(item);
      }
    }

    const durationSafeItems: any[] = strictDensityItems;

    // POST-PROCESS 6: TIMELINE GAP FILLER (Music/Silence Autocomplete)
    const gapFilledItems: any[] = [];
    let expectedStart = 0;
    const formatTimeForGap = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      const ms = Math.floor((secs % 1) * 100);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    };

    for (let i = 0; i < durationSafeItems.length; i++) {
        let currentItem = durationSafeItems[i];
        if (currentItem.startSeconds > expectedStart + 0.5) { // Tolerância de 500ms
            const gapDuration = currentItem.startSeconds - expectedStart;
            if (gapDuration >= 5.0) { // Cria filler se buraco > 5s
               const slices = Math.ceil(gapDuration / 8.0);
               const sliceDur = gapDuration / slices;
               for (let j = 0; j < slices; j++) {
                   const sliceStart = expectedStart + (j * sliceDur);
                   const sliceEnd = expectedStart + ((j+1) * sliceDur);
                   gapFilledItems.push({
                       startSeconds: sliceStart,
                       endSeconds: sliceEnd,
                       duration: sliceDur,
                       startTimestamp: formatTimeForGap(sliceStart),
                       endTimestamp: formatTimeForGap(sliceEnd),
                       text: "(🎵)",
                       subject: "",
                       cenario: "",
                       characterIds: [],
                       locationIds: [],
                       propIds: [],
                       action: "Cinematic atmospheric shot. Highly dramatic lighting, surreal empty space. Wide shot.",
                       animation: "Dynamic Zoom-In Drift"
                   });
               }
            }
        }
        gapFilledItems.push(currentItem);
        expectedStart = currentItem.endSeconds;
    }

    // Tail Gap Filler for Music Outro
    if (totalDuration - expectedStart >= 5.0) {
        const tailGap = totalDuration - expectedStart;
        const slices = Math.ceil(tailGap / 8.0);
        const sliceDur = tailGap / slices;
        for (let j = 0; j < slices; j++) {
            const sliceStart = expectedStart + (j * sliceDur);
            const sliceEnd = expectedStart + ((j+1) * sliceDur);
             gapFilledItems.push({
                 startSeconds: sliceStart,
                 endSeconds: sliceEnd,
                 duration: sliceDur,
                 startTimestamp: formatTimeForGap(sliceStart),
                 endTimestamp: formatTimeForGap(sliceEnd),
                 text: "(🎵)",
                 subject: "",
                 cenario: "",
                 characterIds: [],
                 locationIds: [],
                 propIds: [],
                 isGapFiller: true,
                 action: "Cinematic trailing shot, atmospheric closing mood. Highly dramatic lighting, surreal empty space. Wide shot.",
                 animation: "Contextual Zoom-Out Reveal"
             });
        }
    }

    // POST-PROCESS 7: RIGOROUS SRT ALIGNMENT (SNAP TO TEXT BOUNDARIES)
    for (let i = 0; i < gapFilledItems.length; i++) {
      let item = gapFilledItems[i];
      if (item.srtSegments && item.srtSegments.length > 0) {
        // Resolve cross-scene duplicate SRT segments caused by AI hallucinated boundaries
        if (i > 0 && gapFilledItems[i - 1].srtSegments && gapFilledItems[i - 1].srtSegments.length > 0) {
          const prev = gapFilledItems[i - 1];
          const prevLastSrt = prev.srtSegments[prev.srtSegments.length - 1];
          const currFirstSrt = item.srtSegments[0];
          
          if (prevLastSrt.start === currFirstSrt.start) {
            // The segment leaked into both scenes. We remove it from the current scene to kill the duplicate audio.
            item.srtSegments.shift();
          }
        }
        
        if (item.srtSegments.length > 0) {
          const firstSrt = item.srtSegments[0];
          
          // Descontos temporais milimétricos (50ms) para que a primeira sílaba não seja cortada pelo botão Play
          const exactStart = Math.max(0, firstSrt.start - 0.05);

          // Force the scene to start exactly at the beginning of its first exclusive subtitle word
          item.startSeconds = exactStart;

          if (i > 0) {
            const prev = gapFilledItems[i - 1];
            // Estica a cena anterior para terminar exatamente onde esta começa (previne black screens)
            prev.endSeconds = item.startSeconds;
            prev.duration = prev.endSeconds - prev.startSeconds;
            const formatTimeLocal = (secs: number) => {
              const m = Math.floor(secs / 60);
              const s = Math.floor(secs % 60);
              const ms = Math.floor((secs % 1) * 100);
              return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
            };
            prev.endTimestamp = formatTimeLocal(prev.endSeconds);
          }
          
          item.duration = item.endSeconds - item.startSeconds;
          const formatTimeLocal = (secs: number) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.floor((secs % 1) * 100);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
          };
          item.startTimestamp = formatTimeLocal(item.startSeconds);
        }
      }
    }

    // POST-PROCESS 7.5: ABSOLUTE MINIMUM DURATION ELIMINATION
    // Any scene under 5.0s left over from SRT snagging, Word Density, or AI quirks MUST be merged.
    // If it exceeds 10s after merging, POST-PROCESS 8 will elegantly slice it back to >= 5.0s.
    let j = 0;
    while (j < gapFilledItems.length) {
      const current = gapFilledItems[j];
      const actualDuration = current.endSeconds - current.startSeconds;
      
      if (actualDuration < 5.0 && gapFilledItems.length > 1) {
        const hasNext = j + 1 < gapFilledItems.length;
        const targetIdx = hasNext ? j + 1 : j - 1;
        const absorbTarget = gapFilledItems[targetIdx];
        
        const newStart = Math.min(current.startSeconds, absorbTarget.startSeconds);
        const newEnd = Math.max(current.endSeconds, absorbTarget.endSeconds);
        absorbTarget.startSeconds = newStart;
        absorbTarget.endSeconds = newEnd;
        absorbTarget.duration = newEnd - newStart;
        
        const fmtLocal = (secs: number) => {
          const m = Math.floor(secs / 60);
          const s = Math.floor(secs % 60);
          const ms = Math.floor((secs % 1) * 100);
          return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
        };
        absorbTarget.startTimestamp = fmtLocal(absorbTarget.startSeconds);
        absorbTarget.endTimestamp = fmtLocal(absorbTarget.endSeconds);
        
        if (hasNext) {
          absorbTarget.text = (current.text + " " + absorbTarget.text).trim();
        } else {
          absorbTarget.text = (absorbTarget.text + " " + current.text).trim();
        }

        if (current.srtSegments) {
          absorbTarget.srtSegments = [...(absorbTarget.srtSegments || []), ...current.srtSegments];
          const uniq = new Map();
          absorbTarget.srtSegments.forEach((s: any) => uniq.set(s.start, s));
          absorbTarget.srtSegments = Array.from(uniq.values()).sort((a: any, b: any) => a.start - b.start);
        }

        gapFilledItems.splice(j, 1);
      } else {
        j++;
      }
    }

    // POST-PROCESS 8: FINAL GUARANTEE BOUNDARY ENFORCER 
    // To categorically prevent ANY scene from exceeding 10.0 seconds (e.g. from SRT offset snaps or gap fillers)
    const strictBoundedItems: any[] = [];
    for (const item of gapFilledItems) {
      if (item.duration > 10.0) {
        const numParts = Math.ceil(item.duration / 10.0);
        const partDur = item.duration / numParts;
        for (let p = 0; p < numParts; p++) {
          const pStart = item.startSeconds + (p * partDur);
          const pEnd = (p === numParts - 1) ? item.endSeconds : item.startSeconds + ((p + 1) * partDur);
          const formatTimeLocal = (secs: number) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.floor((secs % 1) * 100);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
          };
          
          let partText = item.text;
          // Subdivide text if it's not a gap filler
          if (!item.isGapFiller && item.text && item.text !== "(🎵)") {
            const words = item.text.split(' ');
            const wordsPerPart = Math.ceil(words.length / numParts);
            partText = words.slice(p * wordsPerPart, (p + 1) * wordsPerPart).join(' ');
          }

          strictBoundedItems.push({
            ...item,
            startSeconds: pStart,
            endSeconds: pEnd,
            duration: pEnd - pStart,
            startTimestamp: formatTimeLocal(pStart),
            endTimestamp: formatTimeLocal(pEnd),
            text: partText || "(pausa)",
            action: item.isGapFiller ? item.action : item.action + (numParts > 1 ? ` (Cut ${p+1})` : "")
          });
        }
      } else {
        strictBoundedItems.push(item);
      }
    }

    const sanitizedItems = strictBoundedItems.map(item => {
      let subject = item.subject || "";
      let action = item.action || "";
      let cenario = item.cenario || "";
      let vp = item.imagePrompt || "";

      allAssets.forEach((asset: any) => {
        if (asset.realName && asset.name) {
          // Case insensitive global replacement
          const realNameRegex = new RegExp(`\\b${asset.realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
          subject = subject.replace(realNameRegex, asset.name);
          action = action.replace(realNameRegex, asset.name);
          cenario = cenario.replace(realNameRegex, asset.name);
          vp = vp.replace(realNameRegex, asset.name);
        }
      });

      return { ...item, subject, action, cenario, imagePrompt: vp };
    });

    return {
      items: sanitizedItems,
      detectedCharacters: globalAssets.detectedCharacters,
      detectedLocations: globalAssets.detectedLocations,
      detectedProps: globalAssets.detectedProps || []
    };
  } finally {
    if (uploadedGeminiFile) {
      try {
        console.log("[Gemini] Cleaning up uploaded file:", uploadedGeminiFile.name);
        await ai.files.delete({ name: uploadedGeminiFile.name });
      } catch (e) {
        console.warn("[Gemini] Failed to delete file:", e);
      }
    }
  }
};
/**
 * Performs Magic Sync (Audio-Text Forced Alignment) using Gemini Pro Multimodal.
 */
export const syncScenesWithAudio = async (
  audioFile: File,
  scenes: { id: string | number, text: string }[]
): Promise<{ index: number, start: number, end: number }[]> => {
  console.log(`[Gemini Sync] 🚀 Iniciando Sincronia Robusta para ${scenes.length} cenas...`);
  
  try {
    // 1. Particionar áudio para evitar estoiro de payload (limite ~60s por chunk)
    const audioChunks = await splitAudioFile(audioFile, 60);
    console.log(`[Gemini Sync] Áudio particionado em ${audioChunks.length} blocos.`);

    const allSyncResults: { index: number, start: number, end: number }[] = [];

    // 2. Processar cada chunk
    for (let c = 0; c < audioChunks.length; c++) {
      const chunk = audioChunks[c];
      const chunkStart = chunk.startSeconds;
      const chunkEnd = chunkStart + chunk.durationSeconds;

      // Filtrar cenas que pertencem a este intervalo (com margem de 1s)
      const chunkScenes = scenes.filter((s, idx) => {
        // Obter timestamp estimativo da cena (se não tiver, estimamos 5s por cena)
        const sceneEstimatedStart = (s as any).startSeconds ?? (idx * 5);
        return sceneEstimatedStart >= chunkStart - 1 && sceneEstimatedStart < chunkEnd + 1;
      });

      if (chunkScenes.length === 0) continue;

      console.log(`[Gemini Sync] Sincronizando Bloco ${c + 1}/${audioChunks.length} (${chunkScenes.length} cenas)...`);

      const audioBase64 = await fileToBase64(chunk.file);
      const audioPart = { inlineData: { mimeType: 'audio/mpeg', data: audioBase64 } };

      const prompt = `ALinhamento Forçado de Áudio e Texto (Bloco ${c + 1}).
        Este áudio começa em ${chunkStart.toFixed(2)}s e termina em ${chunkEnd.toFixed(2)}s.
        Ajuste os tempos das seguintes cenas para que batam EXATAMENTE com a locução.
        
        Cenas neste bloco:
        ${chunkScenes.map((s, i) => `CENA ${i+1}: "${s.text.substring(0, 100)}${s.text.length > 100 ? '...' : ''}"`).join('\n')}
        
        REGRAS CRÍTICAS:
      1. Os valores de 'start' e 'end' devem ser ABSOLUTOS (contados desde o início do arquivo original).
      2. 'start' no início da fala, 'end' no fim da fala. Seja milimétrico.
      3. O campo 'text' deve ser 100% IDÊNTICO (Verbatim) ao que é falado.
      4. Retorne JSON: { "syncResults": [ { "index": original_index, "start": number, "end": number } ] }
      5. O 'index' deve corresponder à ordem destas cenas na lista (1, 2, 3...).
      `;

      let retries = 2;
      let success = false;

      while (retries >= 0 && !success) {
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
          const response = await ai.models.generateContent({
            model: "gemini-1.5-pro",
            contents: { parts: [audioPart, { text: prompt }] },
            config: {
              maxOutputTokens: 2048,
              responseMimeType: "application/json",
              responseSchema: {
                type: "object",
                properties: {
                  syncResults: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number" },
                        start: { type: "number" },
                        end: { type: "number" }
                      },
                      required: ["index", "start", "end"]
                    }
                  }
                },
                required: ["syncResults"]
              }
            }
          });

          const rawJson = response.text || '{"syncResults":[]}';
          const data = JSON.parse(rawJson);
          
          // Mapear resultados relativos/locais para globais e associar aos IDs originais
          (data.syncResults || []).forEach((res: any, i: number) => {
            if (chunkScenes[i]) {
                allSyncResults.push({
                    index: scenes.indexOf(chunkScenes[i]), // Índice absoluto na lista original
                    start: res.start,
                    end: res.end
                });
            }
          });
          
          success = true;
        } catch (err: any) {
          console.warn(`[Gemini Sync] Falha no bloco ${c + 1}, retentativa ${retries}...`, err);
          retries--;
          if (retries < 0) console.error(`[Gemini Sync] Bloco ${c + 1} falhou definitivamente.`);
          else await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    // Ordenar resultados e logs
    allSyncResults.sort((a, b) => a.index - b.index);
    console.log(`[Gemini Sync] ✅ Sincronia concluída. Total de cenas processadas: ${allSyncResults.length}`);
    
    logApiCost('text', "gemini-1.5-pro", 0.05, { sceneCount: scenes.length });
    return allSyncResults;

  } catch (err: any) {
    console.error("[Gemini Sync] Erro Crítico:", err);
    throw err;
  }
};
