
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
    Analyze the audio. Extract recurring characters, locations, and important/highlighted objects or items (props).
    
    🎨 CREATIVE MANDATE (INVENTORY DNA):
    - Surrealismo Conceitual: dê aos assets características inesperadas e justapostas.
    - Realismo Mágico: inclua detalhes impossíveis ou poéticos em personagens e cenários.
    
    🗣️ DEFINITIVE NAMING RULES (LOCKDOWN - NEVER CHANGE):
    1. CHARACTERS: ESTRITAMENTE PROIBIDO use real names in 'name'. Invent a one-word fictional nickname based on Portuguese PHONETICS (word sounds). Ex: 'Elon Musk' -> 'Ilonmãsqui', 'Hot Dog' -> 'Rótidógui'.
    2. LOCATIONS & PROPS: The 'name' (nickname) can be the REAL NAME (ex: 'Starbucks', 'Central Park', 'iPhone 15'). Use the real name as the default nickname.
    3. SECURITY: Real names of PEOPLE must ONLY exist in 'realName' field and NEVER in 'name' or prompts.
    4. NO TEXT: Nicknames MUST NEVER appear as written text in the generated images.

    SCENARIO RULES: Concise literal English description. 4-part structure: 1. [Structure], 2. [Anchor objects], 3. [Textures], 4. [Lighting]. Max 60 words.
    
    CHARACTER RULES: Physical English description ONLY. NO style words. Use exactly: [ARCHETYPE], [GENDER/AGE], [HAIR], [FACE/EYES DETAILS], [TOP CLOTHING + COLOR], [BOTTOM CLOTHING + COLOR], [SHOES + COLOR], [EXTRAS].
    
    DIVERSITY & CONSISTENCY MANDATE: Characteristics must be UNIQUE, DIVERSE and PERMANENT. Lock ethnicity, facial features and distinctive traits (scars/glasses). 
    
    PROP/OBJECT RULES: Describe in English: [TYPE], [MATERIAL], [COLOR], [TEXTURE], [SIZE], [CONDITION], [DETAILS]. Max 30 words.
    
    JSON Schema: { detectedCharacters: [...], detectedLocations: [...], detectedProps: [...] }`;

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
              type: Type.OBJECT,
              properties: {
                detectedCharacters: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, realName: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["id", "name", "description"] } },
                detectedLocations: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, realName: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["id", "name", "description"] } },
                detectedProps: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["id", "name", "description"] } }
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

      const chunkPrompt = `MASTER PROMPT — AUDIO-TEXT SYNCHRONIZATION ENGINE
    ROLE: Surrealist Visionary & Visual Poet
    OBJECTIVE: Analyze the audio clip. Produce frame-accurate scene segmentation with high artistic depth.
    
    🎨 CREATIVE MANDATE: Elevate every scene using these three visual principles:
    - Surrealismo Conceitual: elementos inesperados justapostos (ex: relógio derretendo num deserto gelado)
    - Realismo Mágico: detalhes impossíveis em cenas cotidianas (ex: flores brotando de pegadas na neve)
    - Simbolismo Visual: objetos/cores representando emoções (ex: uma maçã dourada para ganância)
    
    ⚠️ CRITICAL TIMING RULES:
    1. SCENE DURATION: Every scene MUST be between 5.0 and 10.0 seconds. MAXIMUM 10.0 SECONDS.
    2. NO LONG SCENES: If a speaker talks for 20s, you MUST split it into two or three scenes. 
    3. VISUAL VARIETY (CRITICAL): NEVER repeat the same visual prompt or subject action in consecutive scenes. Use different angles and symbolic elements.
    4. TEXT PACING: A person speaks about 2.5 words per second. The duration of the scene MUST be long enough for the character to speak the entire text naturally.
    5. NO GAPS & NO OVERLAPS: The end of one scene must be the start of the next. Produce a STRICT SEQUENTIAL LIST of scenes covering exactly 0 to ${chunk.durationSeconds} seconds.
    
    🗣️ DEFINITIVE NAMING RECALL (LOCKDOWN):
    1. CHARACTERS: Only use the phonetic nicknames (e.g., 'Ilonmãsqui'). REAL NAMES OF PEOPLE ARE FORBIDDEN in the prompts.
    2. LOCATIONS & PROPS: Use their actual names (e.g., 'Starbucks', 'Central Park', 'iPhone 15') as identifying nicknames.
    3. NO TEXT IN IMAGE: Regardless of the nickname used, NEVER render any text, names, or characters visually on the image surfaces.
    
    ${srtReference}

    Context: ${context}
    VISUAL STYLE: ${stylePrompt}
    
    ASSETS:
    Characters: ${JSON.stringify(globalAssets.detectedCharacters)}
    Locations: ${JSON.stringify(globalAssets.detectedLocations)}
    Props: ${JSON.stringify(globalAssets.detectedProps)}
    Return JSON: { items: [...] } following the TranscriptionSchema.`;

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
                type: Type.OBJECT,
                properties: {
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        startSeconds: { type: Type.NUMBER },
                        endSeconds: { type: Type.NUMBER },
                        text: { type: Type.STRING },
                        medium: { type: Type.STRING },
                        subject: { type: Type.STRING },
                        action: { type: Type.STRING },
                        cenario: { type: Type.STRING },
                        props: { type: Type.STRING },
                        symbolism: { type: Type.STRING },
                        style: { type: Type.STRING },
                        camera: { type: Type.STRING },
                        animation: { type: Type.STRING },
                        characterIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                        locationIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                        propIds: { type: Type.ARRAY, items: { type: Type.STRING } }
                      },
                      required: ["startSeconds", "endSeconds", "text", "medium", "subject", "cenario", "props"]
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

          let gStart = currentBoundary;
          let gEnd = rawEnd >= start ? rawEnd : start + Math.min(rawEnd, chunkDuration);

          // Se a IA sugerir uma duração antes do nosso gStart (por conta da sincronia), empurramos ela pra frente
          if (gEnd <= gStart + 0.5) {
            gEnd = gStart + Math.max(5.0, (item.endSeconds - item.startSeconds) || 7.0);
          }

          // Compute required minimum duration based on text length (approx 2.5 words per second)
          const wordCount = item.text ? item.text.split(' ').length : 0;
          const textMinDuration = Math.max(5.0, wordCount / 2.5);

          // Force the end of the scene if the duration is too short to fit the spoken text
          if (gEnd - gStart < textMinDuration) {
            gEnd = Math.min(gStart + textMinDuration, start + chunkDuration);
          }

          // Force the end of the scene for the LAST scene of ANY chunk to match the chunk boundary exactly.
          // This prevents orphaned subtitles that fall between the last scene's end and the next chunk's start.
          if (idx === rawItems.length - 1) {
            gEnd = start + chunkDuration;
          }

          // Final safety clamp: ensure end is after start within current chunk context
          if (gEnd <= gStart) gEnd = gStart + 5.0;

          // Failsafe bounds mapping - DO NOT allow overflow beyond chunkDuration otherwise SRT tracking breaks!
          gStart = Math.max(start, Math.min(gStart, start + chunkDuration - 0.5));
          gEnd = Math.max(gStart + 0.5, Math.min(gEnd, start + chunkDuration));

          currentBoundary = gEnd;

          const formatTime = (secs: number) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.floor((secs % 1) * 100);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
          };

          // CONSTRUCT IMAGE PROMPT — padrão instructions.md
          // Estrutura: Subject (desc. física) | Action | Camera | Object | Environment | Visual Integrity

          // Resolve descrição física real dos personagens a partir dos globalAssets (nunca confiar só no item.subject)
          let resolvedSubject = "";
          if (item.characterIds && item.characterIds.length > 0 && globalAssets.detectedCharacters?.length > 0) {
            const charDescs = item.characterIds
              .map((id: string) => globalAssets.detectedCharacters.find((c: any) => c.id === id))
              .filter(Boolean)
              .map((c: any) => c.description)
              .filter(Boolean);
            if (charDescs.length > 0) resolvedSubject = charDescs.join(" AND ");
          }
          // Fallback: usa o subject gerado pela IA se não houver characterIds
          if (!resolvedSubject && item.subject) resolvedSubject = item.subject;

          let vp = "";
          if (resolvedSubject) vp += `Subject: ${resolvedSubject}. `;
          if (item.characterIds?.length > 0) vp += `Quantity: ${item.characterIds.length} character${item.characterIds.length > 1 ? 's' : ''}. `;
          if (item.action) vp += `${item.action}. `;
          if (item.camera) vp += `Camera: ${item.camera}. `;
          if (item.props) vp += `Props: ${item.props}. `;
          if (item.cenario) vp += `${item.cenario}. `;
          if (item.symbolism) vp += `Symbolic detail: ${item.symbolism}. `;

          vp = vp.trim();
          // REGRA ANTI-TEXTO: nunca pedir texto escrito na imagem
          vp += " Pure image only: absolutely NO text, NO letters, NO words, NO numbers, NO signs, NO banners, NO captions written anywhere in the image.";

          const totalDuration = gEnd - gStart;
          const scenesToCreate: any[] = [];

          if (totalDuration > 10.5) {
            // Safety "Smart Split": If AI fails to segment, we force it but append visual variations
            const numParts = Math.ceil(totalDuration / 10);
            const partDuration = totalDuration / numParts;
            const cameraVariations = [
              " (alternative angle)",
              " (closer perspective)",
              " (POV shift)",
              " (slight focus change)",
              " (different visual depth)"
            ];

            for (let p = 0; p < numParts; p++) {
              const pStart = gStart + (p * partDuration);
              const pEnd = (p === numParts - 1) ? gEnd : gStart + ((p + 1) * partDuration);

              const srtSegments = globalSrtSegments.filter(seg =>
                seg.end > pStart && seg.start < pEnd
              );

              // Use the actual subtitle segments spoken in this part to avoid duplicating the huge original text
              let partText = "";
              if (srtSegments.length > 0) {
                partText = srtSegments.map(s => s.text).join(' ').trim();
              } else {
                // If srt is missing for this exact half, split the text mathematically by words
                const words = item.text.split(' ');
                const wordsPerPart = Math.ceil(words.length / numParts);
                partText = words.slice(p * wordsPerPart, (p + 1) * wordsPerPart).join(' ');
                if (!partText) partText = "(scene continues)";
              }

              // Forçar variação extrema no CLONE (Smart Split) para IAs não gerarem a mesma imagem
              let partCamera = item.camera || "";
              let partAction = item.action || "";

              if (numParts > 1) {
                if (p % 2 === 0) {
                  partCamera = "Extreme Wide Shot, establishing the whole environment from a distance";
                  partAction = `From afar: ${item.action}`;
                } else {
                  partCamera = "Extreme Close-Up macro shot of the face, distinct alternate angle";
                  partAction = `Close-up perspective: ${item.action}`;
                }
              }

              // Resolve descrição física dos personagens para o partVp
              let resolvedSubjectPart = "";
              if (item.characterIds && item.characterIds.length > 0 && globalAssets.detectedCharacters?.length > 0) {
                const charDescs = item.characterIds
                  .map((id: string) => globalAssets.detectedCharacters.find((c: any) => c.id === id))
                  .filter(Boolean)
                  .map((c: any) => c.description)
                  .filter(Boolean);
                if (charDescs.length > 0) resolvedSubjectPart = charDescs.join(" AND ");
              }
              if (!resolvedSubjectPart && item.subject) resolvedSubjectPart = item.subject;

              let partVp = "";
              if (resolvedSubjectPart) partVp += `Subject: ${resolvedSubjectPart}. `;
              if (item.characterIds?.length > 0) partVp += `Quantity: ${item.characterIds.length} character${item.characterIds.length > 1 ? 's' : ''}. `;
              partVp += `${partAction}. `;
              partVp += `Camera: ${partCamera}. `;
              if (item.props) partVp += `Props: ${item.props}. `;
              if (item.cenario) partVp += `${item.cenario}. `;
              if (item.symbolism) partVp += `Symbolic detail: ${item.symbolism}. `;
              // REGRA ANTI-TEXTO: nunca pedir texto escrito na imagem
              partVp += "Pure image only: absolutely NO text, NO letters, NO words, NO numbers, NO signs, NO banners, NO captions written anywhere in the image.";

              scenesToCreate.push({
                filename: audioFile.name,
                startTimestamp: formatTime(pStart),
                endTimestamp: formatTime(pEnd),
                startSeconds: pStart,
                endSeconds: pEnd,
                duration: pEnd - pStart,
                text: partText,
                medium: item.medium || "",
                subject: item.subject || "",
                action: partAction,
                cenario: item.cenario || "",
                style: item.style || "",
                camera: partCamera,
                animation: item.animation || "",
                characterIds: item.characterIds || (item as any).character_ids || [],
                locationIds: item.locationIds || (item as any).location_ids || [],
                propIds: item.propIds || (item as any).prop_ids || [],
                imagePrompt: partVp.trim(),
                selectedProvider: 'google-imagen',
                srtSegments: srtSegments.length > 0 ? srtSegments : undefined
              });
            }
          } else {
            const srtSegments = globalSrtSegments.filter(seg =>
              seg.end > gStart && seg.start < gEnd
            );

            scenesToCreate.push({
              filename: audioFile.name,
              startTimestamp: formatTime(gStart),
              endTimestamp: formatTime(gEnd),
              startSeconds: gStart,
              endSeconds: gEnd,
              duration: totalDuration,
              text: item.text,
              medium: item.medium || "",
              subject: item.subject || "",
              action: item.action || "",
              cenario: item.cenario || "",
              style: item.style || "",
              camera: item.camera || "",
              animation: item.animation || "",
              characterIds: item.characterIds || (item as any).character_ids || [],
              locationIds: item.locationIds || (item as any).location_ids || [],
              propIds: item.propIds || (item as any).prop_ids || [],
              imagePrompt: vp,
              selectedProvider: 'google-imagen',
              srtSegments: srtSegments.length > 0 ? srtSegments : undefined
            });
          }
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
        // Merge if last scene is < 4.0s (bumped slightly to catch short chunk cutoffs)
        if (last.duration <= 4.15 && (last.duration + item.duration) <= 10.5) {
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

    // FINAL SANITIZATION: Systematic removal of Real Names if leaked
    const allAssets = [
      ...(globalAssets.detectedCharacters || []),
      ...(globalAssets.detectedLocations || []),
      ...(globalAssets.detectedProps || [])
    ];

    const sanitizedItems = finalMergedItems.map(item => {
      let subject = item.subject || "";
      let action = item.action || "";
      let vp = item.imagePrompt || "";

      allAssets.forEach((asset: any) => {
        if (asset.realName && asset.name) {
          // Case insensitive global replacement
          const realNameRegex = new RegExp(`\\b${asset.realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
          subject = subject.replace(realNameRegex, asset.name);
          action = action.replace(realNameRegex, asset.name);
          vp = vp.replace(realNameRegex, asset.name);
        }
      });

      return { ...item, subject, action, imagePrompt: vp };
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
