
import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptionItem, TranscriptionResponse, ViralTitle, MasterAsset } from "../types";
import { logApiCost } from "./usageService";
import { splitAudioFile } from "./audioService";

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
export const TEXT_MODEL_NAME = "gemini-2.5-flash";
// Gemini Nano (Anterior)
export const IMAGE_MODEL_NAME = "nano-banana-pro-preview";
// Imagen 4 Fast (Gemini) - using imagen-3.0-generate-001 motor
export const IMAGEN_MODEL_NAME = "imagen-3.0-generate-001";

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
  const WINDOW_SIZE = 30; // Reduzido para 30s. Janelas de 60s estavam causando sobreposição de timestamps pela IA.

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
    
    🎨 CREATIVE MANDATE (INVENTORY DNA):
    - Realismo Mágico & Surrealismo: Dê aos assets detalhes poéticos ou inesperados (ex: olhos cor de galáxia, móveis que flutuam levemente).
    
    🗣️ DEFINITIVE NAMING RULES:
    1. CHARACTERS: ESTRITAMENTE PROIBIDO usar nomes reais no campo 'name'. Crie um apelido (nickname) fonético em português. Ex: 'Elon Musk' -> 'Ilonmãsqui'.
    2. LOCATIONS/PROPS: O 'name' pode ser o nome real (ex: 'Quarto 12', 'Relógio de Ouro').
    3. SECURITY: Nomes reais de pessoas devem ficar APENAS no campo 'realName'.
    
    🗣️ SCRIPT ALIGNMENT (ABSOLUTE PRIORITY):
    If a script is provided, you MUST provide a 'scriptMap'. 
    Divide the ENTIRE script into segments of roughly 30 seconds (or less if natural pauses exist).
    Each segment must accurately match the timing in the audio.
    
    FIELD RULES FOR GENERATION (ENGLISH ONLY in description fields):
    CHARACTER description — one paragraph, ALL fields mandatory.
    LOCATION description — exactly 4 parts, max 60 words.
    PROP description — one paragraph, ALL fields mandatory.
    
    ${scriptText ? `ORIGINAL SCRIPT FOR REFERENCE:\n${scriptText}\n` : ''}

    Return JSON: { 
      detectedCharacters: [...], 
      detectedLocations: [...], 
      detectedProps: [...],
      scriptMap: [ { text: "segment words here", startSeconds: 0, endSeconds: 30 }, ... ]
    }`;

    let globalAssets: any;
    let invRetries = 3;
    while (invRetries > 0) {
      try {
        const inventoryResponse = await ai.models.generateContent({
          model: TEXT_MODEL_NAME,
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
        globalAssets = JSON.parse(inventoryResponse.text || '{"detectedCharacters":[], "detectedLocations":[], "detectedProps":[]}');
        if (!globalAssets.detectedProps) globalAssets.detectedProps = [];
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
    const processChunk = async (chunk: any, i: number) => {
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
      const chunkAudioPart = { inlineData: { mimeType: chunk.file.type || 'audio/wav', data: chunkAudioBase64 } };

      // Slice the script for this specific chunk based on scriptMap if available
      let relativeScriptContext = scriptText || '';
      if (globalAssets.scriptMap && globalAssets.scriptMap.length > 0) {
        const relevantParts = globalAssets.scriptMap.filter((m: any) => 
          (m.endSeconds > start && m.startSeconds < start + chunk.durationSeconds)
        );
        if (relevantParts.length > 0) {
          relativeScriptContext = relevantParts.map((p: any) => p.text).join('\n');
        }
      }

      const chunkPrompt = `MASTER PROMPT — AUDIO-TEXT SYNCHRONIZATION ENGINE
    Divide this audio into scenes (5-10s).
    
    🗣️ FIELD RULES (STRICT, 'subject', 'action', 'cenario', 'props', and 'animation' MUST be in ENGLISH ONLY):
    - action: The creative idea of the scene. You MUST use Conceptual Surrealism and Visual Symbolism to create poetic, dreamlike, or unexpected visual metaphors (English ONLY).
    - subject: Return a string mentioning ONLY character nicknames (English ONLY).
    - cenario: Return a string mentioning ONLY location/prop names (English ONLY).
    - CRITICAL TIMING & DENSITY: Max 25 words per scene. If a segment has more than 25 words, you MUST split it into two or more scenes, even if the visual background remains the same.
    - NO PLACEHOLDERS: Never use "(continua)", "(pausa)", or empty strings for the 'text' field. Each 'text' field must contain the actual spoken words.
    
    ${srtReference}
    ${relativeScriptContext ? `\nORIGINAL TEXT REFERENCE (MANDATORY TEXT CONTENT):\n${relativeScriptContext}\nRule: Use strictly the words from the provided text for the 'text' field. Synchronize the text with the audio. Do NOT skip any words.\n` : ''}

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
                        characterIds: { type: "array", items: { type: "string" } },
                        locationIds: { type: "array", items: { type: "string" } },
                        propIds: { type: "array", items: { type: "string" } }
                      },
                      required: ["startSeconds", "endSeconds", "text", "subject", "action", "cenario"]
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

    // Use a simple pool-based concurrency (3 chunks at a time)
    const allChunkResults: any[] = [];
    const queue = [...audioChunks.map((c, idx) => ({ ...c, originalIndex: idx }))];
    const poolSize = 3;
    const activeTasks: Promise<any>[] = [];

    while (queue.length > 0 || activeTasks.length > 0) {
      while (activeTasks.length < poolSize && queue.length > 0) {
        const chunk = queue.shift()!;
        const task = processChunk(chunk, chunk.originalIndex);
        activeTasks.push(task);
        task.then(res => {
          allChunkResults.push(res);
          activeTasks.splice(activeTasks.indexOf(task), 1);
        });
      }
      if (activeTasks.length > 0) {
        await Promise.race(activeTasks);
      }
    }

    // Reorder results to maintain temporal sequence
    allChunkResults.sort((a, b) => a.index - b.index);

    for (const chunkResult of allChunkResults) {
      const { items: rawItems, start, duration: chunkDuration } = chunkResult;
      try {
        let currentBoundary = start;
        if (allItems.length > 0) {
          currentBoundary = allItems[allItems.length - 1].endSeconds;
        }

        // Deduplicação e Limpeza: Remove itens com timestamps inválidos ou duplicados antes de processar
        const uniqueRawItems = (rawItems || []).filter((item: any, i: number) => {
          if (!item || item.startSeconds === undefined || item.endSeconds === undefined) return false;
          // Ignora cenas com duração zero ou negativa
          if (item.endSeconds <= item.startSeconds) return false;
          // Verifica se já existe uma cena idêntica no mesmo bloco (evita loop de Smart Split)
          const isDuplicate = rawItems.slice(0, i).some((prev: any) => 
            prev.startSeconds === item.startSeconds && prev.endSeconds === item.endSeconds
          );
          return !isDuplicate;
        });

        const items = uniqueRawItems.flatMap((item: any, idx: number) => {
          let rawStart = item.startSeconds !== undefined ? Number(item.startSeconds) : (idx * 5);
          let rawEnd = item.endSeconds !== undefined ? Number(item.endSeconds) : rawStart + 7;

          // Global sync adjustment (User reported ~0.5s lag)
          const GLOBAL_SYNC_OFFSET = -0.5;

          // Mapping relative timestamps to global ones and applying offset
          let gStart = (rawStart >= start ? rawStart : start + Math.min(rawStart, chunkDuration)) + GLOBAL_SYNC_OFFSET;
          let gEnd = (rawEnd >= start ? rawEnd : start + Math.min(rawEnd, chunkDuration)) + GLOBAL_SYNC_OFFSET;

          // Safety: don't go below zero
          gStart = Math.max(0, gStart);
          gEnd = Math.max(0.5, gEnd);

          // Fill small gaps (< 1.5s) to ensure subtitle continuity, but respect larger silences
          if (allItems.length > 0) {
            const lastEnd = allItems[allItems.length - 1].endSeconds;
            const gap = gStart - lastEnd;
            if (gap > 0 && gap < 1.5) {
              gStart = lastEnd;
            }
          } else {
            // Respect the very first scene start for the first chunk
            const gap = gStart - start;
            if (gap > 0 && gap < 1.5) {
              gStart = start;
            }
          }

          // Compute required minimum duration based on text length (approx 2.5 words per second)
          const wordCount = item.text ? item.text.split(' ').length : 0;
          const textMinDuration = Math.max(3.0, wordCount / 3.0); // Slightly more relaxed limit

          // Ensure end is always after start
          if (gEnd <= gStart + 0.5) {
            gEnd = gStart + Math.max(textMinDuration, 5.0);
          }

          // Final safety clamp: ensure end is within reasonable bounds
          gStart = Math.max(start, Math.min(gStart, start + chunkDuration - 0.5));
          gEnd = Math.max(gStart + 0.5, Math.min(gEnd, start + chunkDuration + 5.0)); // Allow slight overflow if needed

          const formatTime = (secs: number) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.floor((secs % 1) * 100);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
          };

          // CONSTRUCT IMAGE PROMPT — padrão instructions.md
          // Estrutura: Subject (desc. física) | Action | Camera | Object | Environment | Visual Integrity

          // POST-PROCESSING: Strict Field Purity & Mapping
          
          // Reconstruct SUBJECT: Nickname + Physical Description
          let uiSubject = "";
          let detailedSubjectForVp = "";
          const foundChars = (item.characterIds || []).map((id: string) => globalAssets.detectedCharacters.find((c: any) => c.id === id)).filter(Boolean);
          
          if (foundChars.length > 0) {
            uiSubject = foundChars.map((c: any) => {
              const characteristics = c.description.split(',').map((s: string) => s.trim()).filter(Boolean);
              const twoCharacteristics = characteristics.slice(0, 2).join(', ');
              return `${c.name}: ${twoCharacteristics || c.description}`;
            }).join(" | ");
            detailedSubjectForVp = foundChars.map((c: any) => c.description).join(", ");
          } else {
            uiSubject = "";
            detailedSubjectForVp = "";
          }

          // Reconstruct SCENARIO: Local Nickname + Desc + Props Nickname + Desc
          let uiCenario = "";
          let detailedCenarioForVp = "";
          const foundLoc = (item.locationIds || []).map((id: string) => globalAssets.detectedLocations.find((l: any) => l.id === id)).filter(Boolean)[0];
          const foundProps = (item.propIds || []).map((id: string) => globalAssets.detectedProps.find((p: any) => p.id === id)).filter(Boolean);

          if (foundLoc) {
            uiCenario = `${foundLoc.name}: ${foundLoc.description}`;
            detailedCenarioForVp = foundLoc.description;
          } else {
            uiCenario = item.cenario || "Unknown location";
            detailedCenarioForVp = item.cenario;
          }

          if (foundProps.length > 0) {
            const propStrings = foundProps.map((p: any) => `${p.name}: ${p.description}`);
            uiCenario += " | " + propStrings.join(" | ");
            detailedCenarioForVp += `, ${foundProps.map((p: any) => p.description).join(", ")}`;
          }

          // ACTION stays focused on movement
          const uiAction = item.action || "";

          // Final Image Prompt (sum of fields)
          const vpParts = [
            stylePrompt,
            detailedSubjectForVp,
            uiAction,
            detailedCenarioForVp,
            `Visual Integrity: "Pure image only: absolutely NO text, NO letters, NO words, NO numbers, NO signs, NO banners, NO captions written anywhere in the image."`
          ].filter(Boolean);
          const vp = vpParts.join(". ");

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
            characterIds: item.characterIds || [],
            locationIds: item.locationIds || [],
            propIds: item.propIds || [],
            imagePrompt: vp,
            selectedProvider: 'google-imagen',
            srtSegments: undefined
          };

          if (totalDuration > 11.0) {
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
          return scenesToCreate;
        });

        allItems.push(...items);
      } catch (e: any) {
        const chunkIndex = (chunkResult as any).index || 0;
        console.error(`[Gemini] Error in chunk ${chunkIndex + 1}`, e);
        throw new Error(`Ocorreu uma falha na inteligência artificial ao decupar o trecho de ${start}s até ${start + chunkDuration}s: ${e?.message || e}. Dica: o script enviado pode estar muito grande ou detalhado para ser processado de uma vez.`);
      }
    }

    // POST-PROCESS: GLOBAL MERGE SHORT SCENES (Cross-chunk capability)
    const finalMergedItems: any[] = [];
    for (const item of allItems) {
      if (finalMergedItems.length > 0) {
        const last = finalMergedItems[finalMergedItems.length - 1];
        
        const lastWords = last.text ? last.text.split(/\s+/).filter(Boolean).length : 0;
        const itemWords = item.text ? item.text.split(/\s+/).filter(Boolean).length : 0;
        const projectedDuration = last.duration + item.duration;
        const projectedWps = (lastWords + itemWords) / (projectedDuration || 1);

        // Merge if last scene is short, BUT ONLY if merging won't create a heavily "atropelada" scene.
        if (last.duration <= 4.15 && projectedDuration <= 11.0 && projectedWps <= 2.6) {
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

          // Combine metadata text simply
          const itemSym = item.symbolism || "";
          const lastSym = last.symbolism || "";
          if (itemSym && !lastSym.includes(itemSym)) last.symbolism = (lastSym + " " + itemSym).trim();

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
      if (item.duration > 11.0) {
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

    // POST-PROCESS 4: WORD DENSITY ENFORCEMENT (Regra Anti-Atropelamento)
    // Se a cena ainda tiver mais de 2.5 palavras por segundo, forçamos a divisão para garantir legibilidade.
    const strictDensityItems: any[] = [];
    for (const item of ultimateItems) {
      const words = item.text ? item.text.split(/\s+/).filter(Boolean) : [];
      const duration = item.endSeconds - item.startSeconds;
      const wps = words.length / (duration || 1);

      if (wps > 3.0 && words.length > 10) { // Tolerância de até 3.0 WPS antes de forçar split
        const numParts = Math.ceil(words.length / 15); // Almeja ~15 palavras por cena (~6s a 2.5 WPS)
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

    const sanitizedItems = strictDensityItems.map(item => {
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
