
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

// --- ARSENAL DE IA (ESTABILIDADE MANDATÓRIA) ---
// Regra: Não alterar essas versões sem autorização expressa do usuário.

// Text tasks - Gemini 2.5 Flash é o cérebro padrão
export const TEXT_MODEL_NAME = "gemini-2.5-flash";

// Imagen 4.0 Fast - Motor primário de alta velocidade
export const IMAGEN_FAST_MODEL_NAME = "imagen-4.0-fast-generate-001";

// Nano Banana - DEVE usar a API Gemini 2.5 Flash especificamente para multimodal
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
    
    🎨 ASSET DNA & ANATOMY (STRICT PROTOCOL):
    - CHARACTERS (SUBJECT): You must deliver a SINGLE FLUID PARAGRAPH in English following this exact sequence:
      1. Subject Type/Archetype (e.g. "A middle-aged man").
      2. REGRA PARA FIGURAS REAIS: If the prompt mentions a real historical figure or celebrity, FAITHFULLY DESCRIBE their specific facial features (nose shape, eyes, bone structure) as the absolute reference. NEVER mention their real name in the description.
      3. Hair/Beard: Color, texture, and exact cut.
      4. Face: Skin details, eye color, and neutral expression.
      5. Upper Clothing: Piece, fabric, and color.
      6. Lower Clothing: Piece, fabric, and color.
      7. Footwear: Type and color.
      8. Accessories: final details.
    - MANDATORY VARIABLES (INTERNAL THOUGHT): Use [NAME/ARCHETYPE], [GENDER/AGE], [HAIR], [UPPER CLOTHING+COLOR], [LOWER CLOTHING+COLOR], [SHOES+COLOR], [EXTRAS] as your internal guide to construct the final paragraph.
    - CRITICAL: NO LABELS ALLOWED (do NOT write "Hair: Short", just write "Short hair"). Return only the fluid descriptive text.
    - ESTRITAMENTE PROIBIDO terms about lighting, quality, or style (no "cinematic", "4k").
    - LOCATIONS/PROPS: Literal descriptions only, NO labels, NO proper names. Return a clean list of attributes.
    
    - LOCATIONS (SCENARIO): Act as a Senior Prompt Engineer. Deliver a SINGLE DENSE PARAGRAPH in English for each location. Use the "Master Universal Scenario Block" structure:
      1. Structure & Limits (Skeleton): Internal walls/ceiling/windows or External horizon/sky/ground.
      2. Fixed Anchors: 2-3 large objects with EXACT POSITIONS (e.g. "at center-left", "back-right").
      3. Materials & Textures: Dominant surface materials (concrete, wood, etc.).
      4. Lighting & Color: Main light source, temperature, and 3-color palette.
    - CRITICAL SCENARIO RULES: NO metaphors, NO emotional descriptions ("cozy"). Use clear SPATIAL PREPOSITIONS. The goal is to "freeze" the visual structure for consistency.
    
    🗣️ DEFINITIVE NAMING RULES:
    1. CHARACTERS: Use only a friendly Nickname in the 'name' field. Real identity goes ONLY in 'realName'.
    2. LOCATIONS/PROPS: Use clean Nicknames in ENGLISH (e.g. 'CyberpunkLab'). Proibido IDs técnicos.
    3. REDUNDANCY: NEVER include physical descriptions or metadata (like 'Density') in the name field.
    
    FIELD RULES:
    CHARACTER description — ONE SINGLE FLUID PARAGRAPH, NO LABELS, ENGLISH ONLY.
    LOCATION description — ONE SINGLE DENSE PARAGRAPH (Master Block), NO LABELS, ENGLISH ONLY.
    PROP description — Flat list of attributes, NO LABELS, ENGLISH ONLY.
    
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

    const realTextEndTime = globalSrtSegments.length > 0 ? globalSrtSegments[globalSrtSegments.length - 1].end : totalDuration;
    console.log(`[Gemini] v6.4.0: Real speech ends at ${realTextEndTime.toFixed(2)}s. Total audio duration: ${totalDuration.toFixed(2)}s.`);

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
    
    🎨 SEGMENTAÇÃO E RITMO:
    - Duração Mínima: 5.0 seconds.
    - Duração Máxima: 10.0 seconds.
    - Sweet Spot: 8.0 seconds per scene.
    - Alvo de Densidade: 2.5 palavras por segundo (WPS).
    
    📊 TABELA DE REFERÊNCIA (SEGMENTAÇÃO):
    5s → 12–13 palavras | 6s → 14–15 palavras | 7s → 16–18 palavras
    8s → 19–20 palavras | 9s → 21–23 palavras | 10s → 24–25 palavras
    - HEURISTIC FOR SEGMENTATION (The Director's Rule):
      1. PRIMARY ANCHOR: Always try to end a scene at a full stop (.), exclamation (!), or question mark (?) between 6s and 10s.
      2. SECONDARY ANCHOR: If no full stop exists by 7s, split at the nearest comma (,) or natural breath between 5s and 10s.
      3. EMERGENCY CUT: If no punctuation exists by 8.0s, YOU MUST force a cut exactly at 8.0s. Change the ACTION/CAMERA entirely to maintain visual energy.
      4. NEVER exceed 10.0s. It is better to have a dry cut do que uma cena arrastada.
    
    ${previousContextStr}
    🗣️ FIELD RULES (STRICT, 'text', 'subject', 'action', 'cenario', 'props', and 'animation'):
    - text: MANDATORY FIELD! You MUST write the EXACT 100% VERBATIM transcription of the audio segment.
    - action: The ONLY creative field. Use Conceptual Surrealism or Magical Realism as the absolute core aesthetic. 
    CRITICAL RULE ON NAMES: NEVER USE IDs (char01, prop01, etc.) OR PARENTHESES. ALWAYS use ONLY the asset's NICKNAME.
    CRITICAL RULE ON PHYSICAL DESCRIPTIONS: DO NOT repeat physical descriptions in the ACTION field (e.g. do NOT write "The character with blonde hair..."). Use ONLY the nickname. The physical description belongs in the Subject field only.
    CRITICAL: NO METADATA! Never output density numbers, scene counts, or technical tags (like "(Density 2)") inside the fields.
    - subject: Mention ONLY asset NICKNAMES (English ONLY).
    - cenario: Mention ONLY location/prop NICKNAMES (English ONLY). PHYSICAL ANCHORING ONLY.
    - camera: [Wide shot, Close-up, Low angle, Eye level, Bird's eye view, Dutch angle, Extreme Close-up, High Angle]. VARY WILDLY!
    - animation: UNIQUE cinematic motion idea. How the visual evolves. "Camera spirals down...", "Objects levitate...". NO REPETITION.
    - animationRationale: Briefly explain WHY this animation concept enhances the scene's narrative and emotional impact.
    - SYNC: O início e fim devem bater EXATAMENTE com os timestamps do áudio e SRT fornecidos. A IA NÃO TEM AUTONOMIA para alterar tempos.
    - MUSIC/SILENCE: Use "(🎵)" apenas se não houver NENHUMA VOZ narrada num trecho superior a 5 segundos. MAS SE HOUVER LOCUÇÃO, a transcrição é absoluta.
    - NO TRANSLATION: NEVER translate the transcription. Use strictly the input language provided in the SRT reference.
    - HARD WORD STOP (v6.5.0): If the speech ends in a chunk, DO NOT create any scenes for the following silence. Stop immediately after the last verbatim word.
    
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
                      required: ["startSeconds", "endSeconds", "text", "subject", "action", "cenario", "camera", "animation"]
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

          // NO ARTIFICIAL LAG: Let the timestamps flow naturally from AI/SRT. 
          // Overlaps will be surgically fixed in POST-PROCESS 7 using the accurate audio markers.
          if (allItems.length > 0) {
            if (gEnd <= gStart) {
              gEnd = gStart + Math.max((item.text?.split(' ').length || 0) / 2.5, 5.0);
            }
          } else {
            const gap = gStart - start;
            if (gap > 0 && gap < 1.0) gStart = start;
          }

          const wordCount = item.text ? item.text.split(' ').length : 0;
          const textMinDuration = Math.max(4.0, wordCount / 2.8); // 2.8 wps is a comfortable ceiling

          if (gEnd <= gStart + 0.5) gEnd = gStart + textMinDuration;

          // Limit to chunk boundaries but allow trail
          gStart = Math.max(start, Math.min(gStart, start + chunkDuration + 2.0));
          gEnd = Math.max(gStart + 0.5, Math.min(gEnd, start + chunkDuration + 10.0)); 
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
                return `${c.name}: ${c.description}`; // Nickname: Full Desc first time
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
              detailedCenarioForVp = `${foundLoc.name}: ${foundLoc.description}`;
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
                return `${p.name}: ${p.description}`;
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
            `pure image only, no text, no letters, no numbers, no captions, no labels, no logos, no watermarks, all surfaces blank and clean.`
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
        // 1. If last scene is too short in duration (< 4.0s)
        // 2. BUT ONLY if merging won't exceed the strict max duration (10s) 
        // 3. AND ONLY if it doesn't create severe "atropelamento" (> 3.0 wps)
        const isTooShort = last.duration < 4.0;
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

    // POST-PROCESS 2: FORCE-MERGE SCENES TOO SHORT TO RENDER (< 4s)
    // Se o WPS protection impediu um merge normal, forçamos aqui — cena impossível é pior que atropelada.
    let i = 0;
    while (i < finalMergedItems.length) {
      const current = finalMergedItems[i];
      if (current.duration < 4.0 && finalMergedItems.length > 1) {
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
    // v6.3.0: Última cena tem tolerância de 18.0s para evitar gaps finais.
    const ultimateItems: any[] = [];
    for (let i = 0; i < finalMergedItems.length; i++) {
        const item = finalMergedItems[i];
        const limit = 10.0;
        const words = item.text ? item.text.split(' ').filter((w: string) => w.length > 0) : [];
        const wordCount = words.length;

        // v6.7.0: Se ultrapassar 10s OU 25 palavras, deve dividir.
        if (item.duration > limit || wordCount > 25) {
            // Se for por palavras, calculamos partes baseadas em blocos de ~18 palavras para segurança
            const numPartsByTime = Math.ceil(item.duration / 10.0);
            const numPartsByWords = Math.ceil(wordCount / 22.0); // Alvo seguro
            const numParts = Math.max(numPartsByTime, numPartsByWords);
            
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

                const cameras = ["Wide shot", "Close-up", "Low angle", "Eye level", "Dutch angle", "Extreme Close-up"];
                const randomCam = cameras[Math.floor(Math.random() * cameras.length)];

                ultimateItems.push({
                    ...item,
                    startSeconds: pStart,
                    endSeconds: pEnd,
                    duration: pEnd - pStart,
                    startTimestamp: formatTimeLocal(pStart),
                    endTimestamp: formatTimeLocal(pEnd),
                    camera: p === 0 ? item.camera : randomCam, // Variação mandatória na v6.7.0
                    action: item.action + (numParts > 1 ? ` (Sequência ${p+1}/${numParts})` : ""),
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
      
      // REGRA DE OURO v5.0.7: 2.5 Palavras por Segundo (WPS)
      // Conforme telemetria da interface: 5.9s = 14.75 palavras max.
      const MAX_WPS = 2.5;
      const maxAllowed = Math.floor(duration * MAX_WPS);

      // Divisão ativada se ultrapassar o limite de cadência cinemática (2.5 wps)
      if (words.length > maxAllowed && words.length > 2) { 
        const numParts = Math.ceil(words.length / maxAllowed); 
        const partDuration = duration / numParts;
        const wordsPerPart = Math.ceil(words.length / numParts);
        
        for (let p = 0; p < numParts; p++) {
          const pStart = item.startSeconds + (p * partDuration);
          const pEnd = (p === numParts - 1) ? item.endSeconds : item.startSeconds + ((p + 1) * partDuration);
          
          const partText = words.slice(p * wordsPerPart, (p + 1) * wordsPerPart).join(' ');

          const formatTimeLocal = (secs: number) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.floor(Math.round((secs % 1) * 100));
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
          };

          strictDensityItems.push({
            ...item,
            startSeconds: pStart,
            endSeconds: pEnd,
            duration: pEnd - pStart,
            startTimestamp: formatTimeLocal(pStart),
            endTimestamp: formatTimeLocal(pEnd),
            action: item.action,
            text: partText || "(continua)",
            // Reset image/video state for sub-scenes to avoid visual glitches
            imageUrl: p === 0 ? item.imageUrl : '',
            videoUrl: p === 0 ? item.videoUrl : '',
            status: p === 0 ? (item.status === 'completed' ? 'completed' : 'idle') : 'idle'
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
                       animation: "Slow atmospheric drift through empty space, camera floating weightlessly as shadows stretch and contract"
                   });
               }
            }
        }
        gapFilledItems.push(currentItem);
        expectedStart = currentItem.endSeconds;
    }

    /* DESATIVADO v6.1.0: Impedir criação de cenas extras (Outro) no final do áudio
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
                 animation: "Gradual pullback revealing the vast emptiness, light fading as the world expands into silence"
             });
        }
    }
    */
    console.log(`[Gemini] v6.1.0: Pulando preenchimento de silêncio final (${(totalDuration - expectedStart).toFixed(2)}s restantes).`);

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
          
          // DELAY ZERO RULE (instructions-core.md §6.110): 
          // The scene MUST start exactly when the audio starts.
          const exactStart = Math.max(0, firstSrt.start - 0.05); // 50ms buffer for play trigger

          // If the speak starts BEFORE our current scene boundary, we must snap to it
          // OR if it starts AFTER (lag), we must pull it back to the sound moment.
          item.startSeconds = exactStart;

          if (i > 0) {
            const prev = gapFilledItems[i - 1];
            // RETROACTIVE SHORTENING: If I start sooner, I cut my predecessor.
            // If I start later, my predecessor fills the gap.
            // This guarantees zero overlap and zero lag.
            // TRAVA DE COLISÃO (v5.1.1): Impedir duração negativa se o início da cena atual 
            // for menor que o início da anterior devido a snap agressivo do SRT.
            prev.endSeconds = Math.max(prev.startSeconds + 0.5, item.startSeconds);
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
      } else if (i > 0) {
          // If a scene has no subtitles (e.g. music/filler), it still must follow its predecessor
          const prev = gapFilledItems[i - 1];
          if (item.startSeconds < prev.endSeconds) {
              item.startSeconds = prev.endSeconds;
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

    // POST-PROCESS 7.5: ABSOLUTE MINIMUM DURATION ELIMINATION (v5.1.2 - UNCONDITIONAL)
    // Regra Core Sync: Mínimo 5.0s. 
    // PRIORIDADE: Duração Mínima > Densidade de Palavras.
    let j = 0;
    
    while (j < gapFilledItems.length) {
      const current = gapFilledItems[j];
      const actualDuration = current.endSeconds - current.startSeconds;
      
      if (actualDuration < 5.0 && gapFilledItems.length > 1) {
        const hasNext = j + 1 < gapFilledItems.length;
        const targetIdx = hasNext ? j + 1 : j - 1;
        const absorbTarget = gapFilledItems[targetIdx];
        
        // UNCONDITIONAL MERGE: We always merge to reach the 5s minimum.
        // The "Atropelado" (WPS) check still exists in UI to warn the user, 
        // but here we enforce the timeline structure requested.
        const newStart = Math.min(current.startSeconds, absorbTarget.startSeconds);
        const newEnd = Math.max(current.endSeconds, absorbTarget.endSeconds);
        absorbTarget.startSeconds = newStart;
        absorbTarget.endSeconds = newEnd;
        absorbTarget.duration = newEnd - newStart;
        
        const fmtLocal = (secs: number) => {
          const m = Math.floor(secs / 60);
          const s = Math.floor(secs % 60);
          const ms = Math.floor(Math.round((secs % 1) * 100));
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
        continue; // Re-check the same position to see if the new merged block is still < 5s
      }
      j++;
    }

    // POST-PROCESS 8: FINAL GUARANTEE BOUNDARY ENFORCER 
    // v6.3.0: Última cena tem tolerância de 18.0s para evitar fatiamento desnecessário no fim.
    const strictBoundedItems: any[] = [];
    for (let i = 0; i < gapFilledItems.length; i++) {
      const item = gapFilledItems[i];
      const isLast = i === gapFilledItems.length - 1;
      const limit = isLast ? 18.0 : 10.0;

      if (item.duration > limit) {
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

    // POST-PROCESS 10: SILENT CUTOFF (v6.5.0)
    // Deleta sumariamente alucinações da IA após a última fala real do SRT.
    const hardCutoffItems = sanitizedItems.filter((item, idx) => {
        const isEndArea = item.startSeconds > realTextEndTime - 2.0;
        const hasNoSrt = !item.srtSegments || item.srtSegments.length === 0;

        // Regra 1: Margem de 0.3s absoluto.
        if (item.startSeconds > realTextEndTime + 0.3) {
            console.warn(`[Silent Cutoff] Removendo cena alucinada: Início em ${item.startSeconds.toFixed(2)}s (Fala encerrou em ${realTextEndTime.toFixed(2)}s).`);
            return false;
        }

        // Regra 2: Deletar cenas órfãs no final (Sem SRT e após a última fala legítima)
        if (isEndArea && hasNoSrt && item.startSeconds >= realTextEndTime - 0.1) {
             console.warn(`[Silent Cutoff] Removendo cena órfã sem SRT no final: ${item.text.substring(0, 30)}...`);
             return false;
        }

        return true;
    });

    // Truncar a duração da última cena legítima para não vazar silêncio fantasma
    if (hardCutoffItems.length > 0) {
        const last = hardCutoffItems[hardCutoffItems.length - 1];
        if (last.endSeconds > totalDuration) {
            last.endSeconds = totalDuration;
            last.duration = last.endSeconds - last.startSeconds;
            const formatTimeLocal = (secs: number) => {
                const m = Math.floor(secs / 60);
                const s = Math.floor(secs % 60);
                const ms = Math.floor((secs % 1) * 100);
                return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
            };
            last.endTimestamp = formatTimeLocal(last.endSeconds);
        }
    }

    // POST-PROCESS 11: ANTI-SPIKE GUARD (v6.8.0)
    // Deleta alucinações de transbordamento (cenas minúsculas com muito texto)
    const antiSpikeItems = hardCutoffItems.filter(item => {
        const words = item.text ? item.text.split(' ').filter((w: string) => w.length > 0) : [];
        const wps = words.length / (item.duration || 0.1);
        
        // Se a duração for < 0.5s e tiver mais que 5 palavras, é uma alucinação de "resto de texto".
        if (item.duration < 0.5 && words.length > 5) {
            console.error(`[Anti-Spike] Removendo alucinação de transbordamento: ${words.length} palavras em ${item.duration.toFixed(2)}s.`);
            return false;
        }

        // Se a densidade for absurda (> 10 WPS), deletamos.
        if (wps > 10 && item.duration < 1.0) {
            console.error(`[Anti-Spike] Removendo densidade impossível: ${wps.toFixed(2)} WPS.`);
            return false;
        }

        return true;
    });

    // POST-PROCESS 12: FINAL TIMELINE SANITIZATION (v5.1.1)
    // Categorically remove scenes with non-positive duration to prevent UI crashes and timeline errors.
    const finalSanitizedItems = antiSpikeItems.filter(item => {
      const isValid = (item.endSeconds - item.startSeconds) > 0;
      if (!isValid) {
        console.error(`[Timeline Sanitizer] Removing invalid scene: ID=${item.id}, Duration=${item.duration}s. This happened due to extreme SRT overlap.`);
      }
      return isValid;
    });

    return {
      items: finalSanitizedItems,
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
