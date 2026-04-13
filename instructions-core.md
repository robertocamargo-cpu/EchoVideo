# 🎥 EchoVideo — Instruções Core do Sistema

## 1. 🔒 Princípios Globais
- Nunca usar nomes reais (usar apelido fonético)
- Subject e Scenario são exclusivamente físicos (sem estilo, sem emoção)
- Action é o único campo criativo
- Nunca gerar texto dentro da imagem
- Campos vazios devem permanecer vazios
- **Consistência Visual**: Em cada cena, a primeira menção de um personagem ou cenário no prompt deve conter o `Apelido: Descrição Completa`.
- **Refência Cruzada**: Dentro da mesma cena (no campo Action), usa-se apenas o apelido para referenciar o asset já descrito no Subject/Scenario.
- Proibido qualquer texto na imagem.

---

## 2. 🔺 Hierarquia de Prioridade
1. Input do usuário  
2. SRT (se existir)  
3. Inventário de Tokens  
4. Regras de segmentação  
5. Presets visuais  
6. Defaults do sistema  

---

## 3. 📥 Entrada de Dados
- Opção A: `.mp3` + `.txt`
- Opção B: `.mp3` + `.srt`

Regras:
- `.mp3` é obrigatório
- `.srt` é opcional
- Nunca usar `.txt` + `.srt` juntos
- `.wav` permitido apenas em processamento interno (não persistir)

---

## 4. 🎬 Segmentação de Cenas
- Mínimo: 4s | Máximo: 10s.
- **Sweet Spot**: 8.0 segundos.
- **A Regra do Diretor (Hierarquia de Âncoras)**:
  1. **Âncora Primária**: Buscar ponto final (. ! ?) entre 6s e 10s.
  2. **Âncora Secundária**: Se sem ponto, buscar vírgula ou respiração entre 5s e 10s.
  3. **Corte de Emergência**: Se sem pontuação, forçar corte exatamente aos 8.0s para manter energia visual.
- Action obrigatoriamente deve ser diferente em cada corte.

---

## 5. 🧩 Sistema de Tokens

### Character Token
- Apelido fonético obrigatório
- Descrição física única e fixa
- Estrutura:
  tipo, cabelo, rosto, roupa cima, roupa baixo, calçado, extras

Uso no prompt:
- Primeira vez:
  Ilonmãsqui, middle-aged man, short dark hair...
- Repetição:
  Ilonmãsqui is walking...

---

### Scenario Token
- Contém ambiente + objetos
- Estrutura:
  estrutura, ancoragem, materiais, iluminação e cores

Uso:
- Primeira vez → completo
- Repetição → apenas apelido

---

### Prop Token (Objetos)
Objeto vira token quando:
- aparece em 2+ cenas
OU
- usuário marca manualmente

Controle do usuário:
- seleção na interface altera inventário e prompt final

---

## 6. 🧾 SRT e Sincronização
Origem:
- gerada automaticamente
OU
- upload do usuário

Regras:
- Se houver SRT → domina tempo e texto.
- IA não altera SRT.
- **Sincronização Absoluta (Desktop)**: Uso obrigatório de arquivo **.ass (Substation Alpha)** global.
- As legendas são aplicadas no passo final da renderização nativa, sincronizadas diretamente pelo timestamp do áudio master.
- **Sincronia de Estilos**: O renderizador Desktop deve aceitar o parâmetro `--presetId` para carregar exatamente o mesmo preset (cores, fontes, posições) selecionado pelo usuário no Browser via Firestore.
- Sem antecipação de legenda (delay zero em relação à fala).

---

## 7. 🎥 Construção da Cena
Campos:
- Subject
- Action
- Scenario
- Camera Angle

Regra:
- Action é o único campo criativo
- Subject e Scenario são estáticos

---

## 8. 🎯 Exportação do Prompt
Estrutura:
[Style]. [Subject]. [Action]. [Scenario]. [Camera Angle].  
Visual Integrity: Pure image only, no text, no letters, no numbers.

Regras:
- primeira ocorrência → descrição completa
- repetições → apenas apelido
- proibido qualquer texto na imagem

---

## 9. 🎞️ Vídeo (pós-imagem)
Inclui:
- Motion Effects
- Image Effects

Regras:
- NÃO usados na geração da imagem
- usados apenas na renderização de vídeo
- Motion ≠ Image Effects

---

## 10. 💾 Persistência (Firebase)
- Cada upload gera novo projeto no **Firebase Firestore** (cluster: `echovid`).
- **Banco de Dados**: Firestore armazena o projeto e a sub-coleção `transcription_items`.
- **Storage**:
  - Áudio: `project-audio/{projectId}.mp3`
  - Imagens: `project-images/{projectId}/scene_{index}.png`
- **Status de Render**: O campo `render_status` no Firestore reporta o progresso do Terminal para o Browser em tempo real.

---

## 11. 🚀 Performance — O Motor "Hércules"
Meta: Estabilidade total para vídeos de longa duração (20 min+).

**Ambiente Operacional:**
- Porta Padrão: **3006** (Vite configurado para ignorar `temp_render`).
- FFmpeg: Obrigatório uso do **ffmpeg-full** via Homebrew no macOS.

**Estratégia de Renderização:**
- **Desktop (Preferencial)**: Script `render_native.ts` processa cenas individualmente, aplica Ken Burns dinâmico e concatena o resultado final com o áudio master.
- **Resiliência**: Processamento em blocos para evitar estouro de memória RAM e CPU.
- **Qualidade**: Todas as cenas mantêm FPS constante (25fps) e espaço de cor YUV420P.

---

## 12. 📐 Regras de Movimento e Zoom (Mandatórias)
Para garantir a paridade entre os renderizadores Browser e Desktop:

**Vídeos MP4 Importados:**
- **Zoom Fixo**: Escala de **1.12 (112%)** permanente.
- **Movimento**: Proibido aplicar filtros de Zoompan ou Ken Burns (o vídeo já possui movimento nativo).
- **Velocidade Adaptativa**: O vídeo deve ter sua velocidade ajustada (playbackRate/setpts) para cobrir **exatamente** a duração total da cena. O vídeo deve rodar apenas 1 vez (sem loop) esticado ou encurtado conforme o tempo da cena.

**Imagens Estáticas:**
- **Zoom Base**: Escala de **1.0 (100%)**.
- **Dinâmica**: Uso obrigatório da biblioteca `motion_effects`.
- **Rodízio Proibitivo**: Um efeito **nunca** deve ser repetido em cenas consecutivas. O sistema deve sortear um novo movimento aleatório se não houver seleção manual do usuário.
- **Suavidade**: Filtro `zoompan` operando em 25fps para evitar trepidação (jitter).

---

## 13. 🤖 Arsenal de IA (Modelos)

### Análise e Estrutura (Texto e Áudio)
- **Gemini 2.5 Flash**: Modelo mestre para **transcrição verbatim**, **divisão de cenas** (decupagem), inventário de tokens e geração de títulos virais. 
- **Papel**: Garantir que o áudio e o texto estejam 100% sincronizados.

### Geração de Imagem (Artistas Prime)
- **Imagen 4.0 Fast**: Motor padrão de alta velocidade para geração de cenas e assets. (Aguardando configuração)
- **Gemini 2.5 Flash Image (Nano Banana)**: Motor econômico focado em geração em lote com baixo custo.
- **Flux Cinematic (Pollinations)**: AI focada em realismo cinematográfico e composições dramáticas.
- **GPT Image (Pollinations)**: AI focada em realismo mágico, surrealismo e efeitos visuais oníricos (Substituiu ZImage).

---

## 14. 🎬 Sistema Duplo de Animação

O EchoVideo utiliza dois conceitos distintos de "animação" que não devem ser confundidos:

### 1. Efeitos de Movimento (Render)
- **O que é**: Movimentos técnicos de câmera (Ken Burns, Zoompan) aplicados durante a geração do vídeo.
- **Fonte**: Sorteados ou selecionados da coleção `motion_effects` do banco de dados (ex: "Dynamic Zoom-In Drift").
- **Aplicação**: Processados puramente pelos motores FFmpeg (WASM e Native) para dar vida a imagens estáticas.

### 2. Conceitos Criativos (IA)
- **O que é**: Uma "ideia de diretor" gerada pelo Gemini 2.5 Flash para cada cena.
- **Fonte**: Campo `animation` gerado na decupagem, baseado no contexto da cena, personagens e cenário.
- **Aplicação**: É um guia criativo/narrativo para a composição da imagem; **não** é processado pelos motores de renderização técnica. Serve para inspirar a estética da cena produzida.