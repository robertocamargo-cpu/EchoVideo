# 📼 EchoVideo — Instruções de Renderização

## 1. 🔒 Regra de Blindagem
- Existem **8 modos** de renderização. Cada modo aprovado é **BLINDADO**.
- Antes de qualquer alteração em `render_native.ts` ou `videoService.ts`, verificar se afeta um modo blindado.
- Se afetar, **PARAR**, explicar o impacto e pedir autorização.
- Nunca alterar código de um modo blindado sem permissão explícita.

---

## 2. 📋 Os 8 Modos de Renderização

| # | Modo | Engine | Aspecto | Asset | Resolução | Arquivo |
|---|------|--------|---------|-------|-----------|---------|
| 1 | Desktop 16:9 Imagem | FFmpeg (CPU) | 16:9 | Imagem | 1920×1080 | `render_native.ts` |
| 2 | Browser 16:9 Imagem | Canvas + MediaRecorder | 16:9 | Imagem | 1280×720 | `videoService.ts` |
| 3 | Desktop 9:16 Imagem | FFmpeg (CPU) | 9:16 | Imagem | 1080×1920 | `render_native.ts` |
| 4 | Browser 9:16 Imagem | Canvas + MediaRecorder | 9:16 | Imagem | 720×1280 | `videoService.ts` |
| 5 | Desktop 16:9 Vídeo | FFmpeg (CPU) | 16:9 | MP4 | 1920×1080 | `render_native.ts` |
| 6 | Browser 16:9 Vídeo | Canvas + MediaRecorder | 16:9 | MP4 | 1280×720 | `videoService.ts` |
| 7 | Desktop 9:16 Vídeo | FFmpeg (CPU) | 9:16 | MP4 | 1080×1920 | `render_native.ts` |
| 8 | Browser 9:16 Vídeo | Canvas + MediaRecorder | 9:16 | MP4 | 720×1280 | `videoService.ts` |

---

## 3. ⚙️ Engine Desktop — `render_native.ts`

### 3.1 Parâmetros Globais

| Parâmetro | Valor | Regra |
|-----------|-------|-------|
| FFmpeg Path | `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg` | Nunca usar ffmpeg genérico do sistema |
| FPS | 25 | Fixo. Nunca alterar |
| Codec | `libx264` | Fixo para todas as cenas e master |
| Pixel Format | `yuv420p` | Obrigatório em todas as etapas |
| Preset Cenas | `ultrafast` | Velocidade máxima nas cenas intermediárias |
| CRF Cenas | `18` | Equilíbrio qualidade/velocidade |
| Preset Master | `fast` | Master final um pouco mais refinado |
| CRF Master | `18` | Consistente com cenas |
| Container Cenas | `.ts` (MPEG-TS) | Obrigatório para concat sem re-encode |
| Container Final | `.mp4` | Formato de saída final |
| Áudio | AAC 192kbps | Qualidade padrão broadcast |

### 3.2 Sincronia de Áudio (Regra Mandatória)
- Medir `audioDuration` via ffprobe **ANTES** do loop de cenas.
- Calcular `finalGap = audioDuration - totalItemsDuration`.
- Se `finalGap > 0`: esticar a **última cena** para cobrir a diferença.
- O vídeo e o áudio devem terminar **no mesmo milissegundo**.
- Flag `-shortest` no comando final como segurança adicional.

### 3.3 Pipeline de Imagem (Modos 1 e 3)
```
Filtro:
  scale=(W*1.12):(H*1.12):force_original_aspect_ratio=increase
  → crop=(W*1.12):(H*1.12)
  → zoompan(efeito dinâmico da biblioteca motion_effects)
  → setsar=1

Argumentos:
  -loop 1 -t DURAÇÃO       (input: loop de imagem)
  -i asset.png
  -vf FILTRO
  -t DURAÇÃO                (output: corte exato)
  -r 25 -pix_fmt yuv420p
  -c:v libx264 -preset ultrafast -crf 18
  scene_XXXX.ts
```

**Efeitos de Motion:**
- Fonte: coleção `motion_effects` no Firestore.
- Rodízio: aleatório, sem repetir os últimos **5** efeitos.
- Parser: `parseEffectInstruction()` extrai scale, moveX, moveY.
- Filtro: `buildZoompanFilter()` gera expressões FFmpeg.
- Margem de zoom: **12%** (1.12x) para garantir cobertura total sem bordas pretas.

### 3.4 Pipeline de Vídeo MP4 (Modos 5 e 7)
```
Filtro:
  scale=W:H:force_original_aspect_ratio=increase
  → crop=W:H
  → setpts=(PTS-STARTPTS)*SCALE
  → fps=25
  → setsar=1

Argumentos:
  -stream_loop -1           (input: loop infinito de segurança)
  -i video.mp4              (SEM -t antes do -i)
  -vf FILTRO
  -t DURAÇÃO                (output: corte exato APÓS processamento)
  -r 25 -pix_fmt yuv420p
  -c:v libx264 -preset ultrafast -crf 18
  scene_XXXX.ts
```

**Regras Críticas de Vídeo:**
- Sem zoom forçado (1:1 pixel-perfect). Escala = resolução do canvas.
- `ptsScale = sceneDuration / originalDuration` (velocidade adaptativa).
- Nunca colocar `-t` **antes** do `-i` em vídeos (impede o setpts de funcionar).
- `-stream_loop -1` garante que vídeos curtos sejam repetidos em vez de gerar tela preta.

### 3.5 Composição Final (Master)
```
Inputs:
  [0] concat de cenas .ts
  [1] audio.mp3
  [2] overlay-vhs.mp4 (-stream_loop -1)
  [3] vignette_alpha_v62_WxH.png

filter_complex:
  [2:v] colorkey=0x00B140:0.3:0.1, scale=W:H, crop=W:H → [vhs]
  [0:v][vhs] overlay=0:0 → [mixed]
  [mixed][3:v] overlay=0:0, format=yuv420p, LEGENDAS, setsar=1 → [v_out]

Saída:
  -map [v_out] -map 1:a
  -c:v libx264 -preset fast -crf 18
  -c:a aac -b:a 192k
  -shortest -aspect W:H
  OUTPUT.mp4
```

### 3.6 VHS Overlay (Desktop)
- Arquivo: `public/overlay-vhs.mp4`
- Chromakey: `colorkey=0x00B140:0.3:0.1` (verde #00B140, tolerância 0.3, blend 0.1)
- Escalado para resolução do canvas (`scale=W:H`)
- Composto via `overlay=0:0`

### 3.7 Vinheta (Desktop)
- Máscara PNG pré-gerada: `vignette_alpha_v62_{W}x{H}.png`
- Se não existir, gera automaticamente via ffmpeg `geq`.
- Curva de transparência: `pow(hypot(X-W/2,Y-H/2)/hypot(W/2,H/2), 3.2)`
- Composta via `overlay=0:0`

### 3.8 Legendas Desktop (DrawText)

| Parâmetro | Horizontal (16:9) | Vertical (9:16) |
|-----------|-------------------|------------------|
| maxWordsPerLine | 4 | 2 |
| maxCharsPerLine | 42 | 25 |
| scaleFactor | 1.5x (1080/720) | 1.5x (1080/720) |
| Antecipação SRT | -500ms | -500ms |
| Casing padrão | UPPERCASE | UPPERCASE |

**Técnica de Sombra (Stacked Shadows):**
- 4 camadas de drawtext deslocadas nos 4 cantos diagonais.
- Opacidade de cada camada = `shadowOpacity / 4`.
- Dispersão baseada em `shadowBlur` e `scaleFactor`.
- Simula o `shadowBlur` nativo do Canvas (que o FFmpeg não suporta).

**Estrutura por segmento de legenda:**
1. 4× drawtext de sombra (dispersão diagonal)
2. 1× drawtext principal (fontcolor + borderw + bordercolor)

---

## 4. 🌐 Engine Browser — `videoService.ts`

### 4.1 Parâmetros Globais

| Parâmetro | Valor | Regra |
|-----------|-------|-------|
| Canvas (16:9) | 1280×720 | Resolução de preview |
| Canvas (9:16) | 720×1280 | Resolução de preview |
| Capture FPS | 30 | Via `captureStream(30)` |
| MIME | `video/webm;codecs=vp9,opus` | Prioridade. Fallback: vp8, webm, mp4 |
| Bitrate | 6 Mbps | Estabilidade e fluidez |
| Transição | 100ms crossfade | Quase corte seco |
| Relógio | Híbrido: `max(audioContext, wallClock)` | Evita congelamento por suspensão de tab |

### 4.2 Loop de Renderização (por frame)
1. `ctx.fillRect(0,0,w,h)` — fundo preto (limpeza)
2. `drawSingleSource()` — imagem/vídeo com motion effect
3. `drawSubtitle()` — legenda com sombra nativa do Canvas
4. `applyVignette()` — gradiente radial
5. `applyVHS()` — overlay com chromakey manual

### 4.3 Efeitos de Motion — Imagens (Modos 2 e 4)
- Pré-seleção via `preselectEffectsForScenes()`.
- Aplicação em `drawSingleSource()`:
  - `coverScale = max(w/sW, h/sH)`
  - `finalScale = coverScale * (scaleStart + range * progress)`
  - `offsetX/Y = w/h * (moveStart + (moveEnd - moveStart) * progress)`
- Fallback absoluto: zoom suave 1.10x → 1.25x se nenhum efeito for encontrado.
- Sem zoom fixo de 12% em vídeos (apenas imagens usam motion).

### 4.4 Vídeos MP4 no Browser (Modos 6 e 8)

**Velocidade Adaptativa:**
```
playbackRate = videoDuration / sceneDuration
```

**Sincronia Determinística:**
- Threshold de **150ms** — só faz seek se drift > 0.15s.
- Cálculo: `targetTime = (elapsed - sceneStart) * (videoDuration / sceneDuration)`
- Se `drift > 0.15` ou vídeo pausado: seek forçado + reforçar playbackRate.
- Se drift normal: apenas garantir que playbackRate está correto.

**Anti-Flash (exclusivo Browser):**
- Se `readyState < 2`: desenha imagem placeholder por baixo.
- Se `readyState >= 2`: ainda desenha placeholder, depois vídeo por cima.
- Elimina frames pretos durante seeks de entrada de cena.

### 4.5 VHS Overlay (Browser)
- Arquivo: `/overlay-vhs.mp4` (raiz pública)
- Carregamento **não-bloqueante** (não trava o render se falhar).
- Chromakey manual pixel-a-pixel:
  ```
  if (g > 50 && g > r * 1.05 && g > b * 1.05) → alpha = 0
  ```
- Opacidade: `globalAlpha = 0.85`
- Vídeo mudo, loop, autoplay, playsInline.

### 4.6 Vinheta (Browser)
- Gradiente radial com `createRadialGradient`.
- Curva: `0→0%, 0.4→10%, 0.7→50%, 1.0→95%`.
- Aplicada **fora** do bloco `if(activeIdx)` para garantir presença em todos os frames.

### 4.7 Legendas Browser

| Parâmetro | Horizontal (16:9) | Vertical (9:16) |
|-----------|-------------------|------------------|
| maxWordsPerLine | 4 | 2 |
| maxCharsPerLine | 42 | 25 |

- Função `wrapText()` — mesma lógica do Desktop (paridade).
- `drawSubtitle()` usa API nativa do Canvas:
  - `ctx.shadowBlur` — blur real (não simulado como no Desktop).
  - `ctx.shadowColor/OffsetX/OffsetY` — sombra nativa.
  - `ctx.strokeText()` — contorno.
  - `ctx.fillText()` — texto principal.
- Antecipação SRT: **-500ms** (idêntico ao Desktop).

---

## 5. 🔄 Paridade Desktop ↔ Browser

| Funcionalidade | Desktop (FFmpeg) | Browser (Canvas) | Status |
|----------------|-----------------|-------------------|--------|
| Efeitos de Motion | `zoompan` | Canvas transform/scale | ✅ Mesma lógica |
| VHS Overlay | `colorkey=0x00B140:0.3:0.1` | Chromakey manual g>50 | ✅ Equivalente |
| Vinheta | Máscara PNG overlay | Gradiente radial | ✅ Equivalente |
| Legendas: Wrap | `wrapText(words, chars)` | `wrapText(words, chars)` | ✅ Idêntico |
| Legendas: Sombra | Stacked Shadows (4 camadas) | `ctx.shadowBlur` nativo | ✅ Visual equivalente |
| Legendas: SRT Offset | -500ms | -500ms | ✅ Idêntico |
| Vídeo: Velocidade | `setpts * ptsScale` | `playbackRate` | ✅ Equivalente |
| Vídeo: Loop Safety | `-stream_loop -1` | `v.loop = true` | ✅ Equivalente |
| Vídeo: Anti-Flash | N/A (frame-perfeito) | Placeholder backup | ✅ Browser-only |
| Áudio Sync | `-shortest` + gap | Relógio Híbrido | ✅ Equivalente |

---

## 6. 📂 Arquivos de Referência

| Arquivo | Responsabilidade |
|---------|-----------------|
| `scripts/render_native.ts` | Engine Desktop. Modos 1, 3, 5, 7. |
| `services/videoService.ts` | Engine Browser. Modos 2, 4, 6, 8. |
| `services/effectSelectionService.ts` | Parser de instruções e pré-seleção de efeitos |
| `services/storageService.ts` | Persistência de presets de legendas (Firestore) |
| `types.ts` | Interfaces: `SubtitleStyleOption`, `MotionEffect` |
| `public/overlay-vhs.mp4` | Asset de overlay VHS (chromakey verde) |
| `vignette_alpha_v62_*.png` | Máscaras de vinheta por resolução |

---

## 7. 🧪 Protocolo de Testes

Antes de considerar qualquer modo como "finalizado", rodar o teste completo:

1. Verificar se o vídeo tem a resolução correta.
2. Verificar se o overlay VHS aparece.
3. Verificar se a vinheta aparece nas bordas.
4. Verificar se as legendas respeitam `maxWordsPerLine` e não vazam.
5. Verificar se o áudio e o vídeo terminam juntos.
6. Verificar se os efeitos de motion estão animando (não estático).
7. Para vídeos MP4: verificar se a velocidade está adaptada ao tempo da cena.
8. Para vídeos MP4: verificar se não há tela preta (flash).

**Comando de teste Desktop:**
```bash
rm -rf temp_render/* && npx tsx scripts/render_native.ts \
  --id=PROJECT_ID \
  --subs=true \
  --presetId=horizontal-16-9   # ou vertical-9-16
```
