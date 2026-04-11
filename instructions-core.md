# 🎥 EchoVideo — Instruções Core do Sistema

## 1. 🔒 Princípios Globais
- Nunca usar nomes reais (usar apelido fonético)
- Subject e Scenario são exclusivamente físicos (sem estilo, sem emoção)
- Action é o único campo criativo
- Nunca gerar texto dentro da imagem
- Campos vazios devem permanecer vazios
- Consistência visual vem da repetição exata das descrições físicas
- Primeira menção no prompt: apelido + descrição completa
- Repetições no mesmo prompt: apenas apelido

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
Duração:
- Mínimo: 5s  
- Máximo: 10s  

Ritmo:
- Alvo: 2,5 palavras por segundo  
- Limite máximo: 3,0 WPS  

Tabela de referência:
- 5s → 12–13 palavras  
- 6s → 14–15 palavras  
- 7s → 16–18 palavras  
- 8s → 19–20 palavras  
- 9s → 21–23 palavras  
- 10s → 24–25 palavras  

Regra de divisão:
- Se ultrapassar limite → dividir cena
- Pode repetir cenário/personagens/objetos
- Action obrigatoriamente deve ser diferente

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
- Se houver SRT → domina tempo e texto
- IA não altera SRT
- Render usa tempo do áudio (AudioContext)
- Sem antecipação de legenda

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
- Porta Padrão: **3005** (Vite configurado para ignorar `temp_render`).
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

**Imagens Estáticas:**
- **Zoom Base**: Escala de **1.0 (100%)**.
- **Dinâmica**: Uso obrigatório da biblioteca `motion_effects`.
- **Rodízio Proibitivo**: Um efeito **nunca** deve ser repetido em cenas consecutivas. O sistema deve sortear um novo movimento aleatório se não houver seleção manual do usuário.
- **Suavidade**: Filtro `zoompan` operando em 25fps para evitar trepidação (jitter).