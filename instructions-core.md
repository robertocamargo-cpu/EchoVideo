# 🎥 EchoVideo — Instruções Core do Sistema

## 1. 🔒 Princípios Globais
- Nunca usar nomes reais.
- Todo personagem deve receber um apelido fonético único, curto e estável.

- **Subject** e **Scenario** devem conter apenas descrições literais, objetivas, observáveis e físicas.
- **Subject** e **Scenario** não podem conter estilo, emoção, metáfora, clima psicológico ou narrativa.
- **Action** é o único campo criativo.
- A criatividade em **Action** deve se limitar à composição da cena, postura, interação, movimento e relação espacial entre os elementos.
- **Action** não deve usar linguagem poética, abstrata ou metafórica que reduza previsibilidade visual.
- Nunca gerar texto dentro da imagem.
- É proibido qualquer texto visível na imagem: letras, palavras, números, legendas, rótulos, logotipos legíveis, interfaces legíveis e marcas d’água.
- Campos vazios devem permanecer vazios.
- O sistema não deve inventar conteúdo para preencher campos ausentes.
- **Consistência Visual**: Em cada cena, a primeira menção de cada asset reutilizável no prompt deve conter o formato `Apelido: Descrição Completa`.
- Essa regra vale para um ou mais personagens, para cenário e para props tokenizados.
- **Referência Cruzada**: Dentro da mesma cena, após a primeira ocorrência completa do asset, usa-se apenas o apelido para referenciá-lo no restante do prompt, inclusive no campo **Action**.
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

**Regras:**
- `.mp3` é obrigatório
- `.srt` é opcional
- Nunca usar `.txt` + `.srt` juntos
- `.wav` permitido apenas em processamento interno (não persistir)

---

4. 🎬 Segmentação de Cenas
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
- Apelido fonético obrigatório.
- O apelido deve ser único, curto e estável entre cenas.
- Descrição física base única e fixa.
- A descrição base do personagem não deve mudar entre cenas, exceto quando a mudança for intencional e explícita.
- **Estrutura:** tipo e faixa etária aparente, tom de pele, porte físico, cabelo, rosto, pelos faciais, roupa cima, roupa baixo, calçado, acessórios permanentes, extras físicos marcantes.

**Uso no prompt:**
- **Primeira vez:** `Ilonmãsqui: middle-aged man, light skin, medium build, short dark hair, oval face, trimmed beard, black jacket, dark pants, black shoes, rectangular glasses`
- **Repetição:** `Ilonmãsqui`

---

### Scenario Token
- Contém apenas o ambiente fixo da cena.
- Não deve conter objetos móveis, manipuláveis ou props narrativos.
- **Estrutura:** tipo de ambiente, estrutura, ancoragem física, materiais, iluminação objetiva e paleta física dominante.

**Uso:**
- **Primeira vez** → completo no formato `Apelido: descrição completa`
- **Repetição** → apenas apelido

---

### Prop Token (Objetos)
Objeto vira token quando:
- aparece em 2+ cenas
- OU usuário marca manualmente
- OU possui papel visual central na composição da cena

**Controle do usuário:**
- a seleção na interface altera o inventário de tokens
- a seleção na interface define inclusão ou remoção do token no prompt final

---

## 6. 🧾 SRT e Sincronização
**Origem:**
- gerada automaticamente
- OU upload do usuário

**Regras:**
- Se houver SRT → serve como **Referência Mandatória** de texto e conteúdo.
- A IA mantém **autonomia de sincronização** (micro-ajustes de tempo) para garantir o encaixe perfeito entre locução e imagem.
- IA não altera o sentido textual da SRT.
- **Calibração 100% Data-Driven**: O sistema é orientado inteiramente pelos dados do banco de dados. O renderizador Desktop consome o `--presetId` e replica fielmente todos os parâmetros da interface de calibração:
  - **Tipografia**: Fonte (ex: Montserrat), Tamanho e Casing (UPPERCASE/Normal).
  - **Posicionamento**: Posição Y (%) relativa à altura do vídeo.
  - **Cromatismo**: Cor do Texto e Cor do Contorno (Stroke).
  - **Efeitos de Sombra Profissional**: Cor, Opacidade, Distância, Desfoque (Shadow Blur) e Ângulo. O motor de vídeo ajusta a dispersão das sombras empilhadas com base no valor de desfoque salvo.
  - **Composição**: Limite de palavras por linha (quebra automática).
- **Compatibilidade de Dados (Legacy)**: O sistema deve aceitar tanto chaves `camelCase` (`characterIds`) quanto `snake_case` (`character_ids`) para garantir que dados antigos ou importados sejam exibidos corretamente.
- Sincronização direta pelos timestamps do áudio e SRT segments.
- Sem antecipação de legenda (delay zero em relação à fala).

---

## 7. 🧬 Anatomia de Ativos (Personagens)
**Regra para Figuras Reais:**
Se o nome fornecido for de uma figura histórica ou celebridade real, a IA deve descrever os traços faciais específicos dessa pessoa (formato do nariz, olhos, estrutura óssea) em vez de criar um rosto genérico. **NUNCA** citar o nome da pessoa no prompt final (`Subject`).

**Estrutura de Saída (Parágrafo Único em Inglês):**
O campo `Subject` deve ser um texto fluido consolidando:
1. **Sujeito:** (Ex: "A middle-aged man"). Se for figura real, descrever os traços característicos.
2. **Cabelo/Barba:** Cor, textura e corte exato.
3. **Rosto:** Detalhes da pele, cor dos olhos e expressão neutra.
4. **Vestuário Superior:** Peça, tecido e cor.
5. **Vestuário Inferior:** Peça, tecido e cor.
6. **Calçados:** Tipo e cor.
7. **Acessórios:** Detalhes finais.

**Variáveis Mentais Obrigatórias (para a IA):**
Para processar a descrição, a IA deve internamente mapear: `[NOME/ARQUÉTIPO]`, `[GÊNERO/IDADE]`, `[CABELO]`, `[ROUPA DE CIMA + COR]`, `[ROUPA DE BAIXO + COR]`, `[SAPATOS + COR]`, `[EXTRAS]`.

---

## 8. 🏛️ Engenharia de Cenários (Bloco Mestre Universal)
A IA deve atuar como um **Engenheiro de Prompt Sênior** especializado em consistência de ambiente para criar um **Bloco Mestre de Cenário Universal**.

**Estrutura de Saída (Parágrafo Único, Denso e em Inglês):**
1. **Estrutura e Limites (O Esqueleto):**
   - *Se Interno:* Paredes, teto, arquitetura e janelas/portas.
   - *Se Externo:* Linha do horizonte, densidade de elementos (prédios, árvores), solo e céu.
2. **Elementos de Ancoragem Fixos (O que não se move):**
   - Descrever 2 ou 3 objetos grandes e suas **POSIÇÕES EXATAS** (ex: "no centro esquerdo", "no canto direito").
3. **Materiais e Texturas Dominantes:**
   - Composição das superfícies (concreto, madeira, metal, etc.).
4. **Iluminação, Clima e Cores:**
   - Fonte de luz, temperatura e paleta de 3 cores principais.

**Regras Críticas:**
- **LITERALISMO:** Proibido o uso de metáforas ou descrições emocionais ("atmosfera convidativa", "rua perigosa").
- **ESPACIALIDADE:** Uso obrigatório de preposições espaciais claras (no centro, à esquerda, ao fundo, no primeiro plano).
- **CONGELAMENTO:** O objetivo é travar a estrutura visual para garantir consistência em múltiplas cenas.

---

## 9. 🎥 Construção da Cena
**Campos:**
- Subject
- Action
- Scenario
- Camera Angle

**Regra:**
- **Subject** e **Scenario** são descritivos e estáticos.
- **Action** é o único campo criativo da cena.
- **Action** deve descrever apenas composição visual, postura, movimento, interação e relação espacial entre personagens, cenário e props.
- **Camera Angle** define apenas enquadramento, ponto de vista e distância de câmera.
- Nenhum campo deve assumir a função do outro.
- Dentro da mesma cena, após a primeira ocorrência completa de cada asset, usar apenas o apelido nas referências seguintes.

---

## 8. 🎯 Exportação do Prompt
**Estrutura:**
`[Style]. [Subject]. [Action]. [Scenario]. [Camera Angle].`

**Visual Integrity:**
`pure image only, no text, no letters, no numbers, no captions, no labels, no logos, no watermarks, all surfaces blank and clean.`

**Regras:**
- blocos vazios devem ser omitidos da exportação final
- a ordem dos blocos deve ser fixa
- primeira ocorrência de cada asset na cena → `Apelido: descrição completa`
- repetições do mesmo asset na mesma cena → apenas apelido
- a regra acima vale para 2 ou mais personagens, cenário e props tokenizados
- proibido qualquer texto na imagem

---

## 9. 🎞️ Vídeo (pós-imagem)
**Inclui:**
- Motion Effects
- Image Effects

**Regras:**
- NÃO usados na geração da imagem
- usados apenas na renderização de vídeo
- **Motion ≠ Image Effects**

---

## 10. 💾 Persistência (Firebase)
- Cada upload gera novo projeto no **Firebase Firestore** (cluster: `echovid`).
- **Banco de Dados**: Firestore armazena o projeto e a sub-coleção `transcription_items`.
- **Storage**:
  - Áudio: `project-audio/{projectId}.mp3`
  - Imagens: `project-images/{projectId}/scene_{index}.png`
- **Status de Render**: O campo `render_status` no Firestore reporta o progresso do Terminal para o Browser em tempo real.

---

## 11. 🚀 Performance — O Motor “Hércules”
**Meta**: Estabilidade total para vídeos de longa duração (20 min+).

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
- **Velocidade Adaptativa**: O vídeo deve ter sua velocidade ajustada (playbackRate/setpts) para cobrir **exatamente** a duração total da cena. O vídeo deve rodar apenas 1 vez (sem loop) esticado ou encurtado conforme o tempo da cena.

**Imagens Estáticas:**
- **Zoom Base**: Escala de **1.0 (100%)**.
- **Dinâmica**: Uso obrigatório da biblioteca `motion_effects`.
- **Rotação Dinâmica**: Um efeito **nunca** deve ser repetido em um intervalo de **5 cenas**. Se houver match contextual, o sistema tem 50% de chance de ignorá-lo em favor de uma escolha puramente aleatória para garantir variedade visual.
- **Suavidade**: Filtro `zoompan` operando em 25fps para evitar trepidação (jitter).

---

## 13. 🤖 Arsenal de IA (Modelos e APIs)

O sistema EchoVideo opera com um conjunto estrito de modelos e APIs. Nenhuma alteração de versão ou provedor deve ser feita sem autorização prévia por escrito do usuário.

### 🧠 Inteligência de Texto e Áudio
- **Gemini 2.5 Flash**: Modelo mestre único. Responsável por transcrição, decupagem, tokens e títulos.
- **ESTABILIDADE**: Proibido alterar para versões superiores (ex: Pro ou modelos experimentais) sem aviso.

### 🎨 Geração de Imagem (Artistas Prime)
O sistema consome 3 APIs distintas para 4 modelos de imagem:

| Modelo | API Provedora | Perfil Visual |
| :--- | :--- | :--- |
| **IMAGEN 4** | Google Cloud (Vertex) | Alta velocidade, fotorrealismo e fidelidade ao prompt. |
| **NANO** | Gemini 2.5 Flash API | Modelo econômico para gerações em lote e assets secundários. |
| **FLUX** | Pollinations AI | Estética de cinema, profundidade dramática e realismo orgânico. |
| **ZIMAGE** | Pollinations AI | Realismo mágico, surrealismo e composições oníricas/conceituais. |

**Protocolo de Resiliência Pollinations (v7.9.4)**:
- **Endpoints**: Priorizar `gen.pollinations.ai`. Usar `image.pollinations.ai` apenas como backup.
- **Bypass de CORS**: Toda requisição de imagem deve usar o método **Canvas Bypass** (`fetchImageViaCanvas`) para converter blobs em base64 localmente, evitando erros de rede do tipo "Failed to fetch".
- **Fallback Automático**: O modelo `zimage` deve possuir o modelo `turbo` como fallback silencioso e imediato em caso de instabilidade na API principal.

**Regra de Visibilidade**: Todas as APIs ativas devem estar visíveis no rodapé (Footer) do sistema para controle operacional.

---

## 14. 🎬 Sistema Duplo de Animação

O EchoVideo utiliza dois conceitos distintos de “animação” que não devem ser confundidos:

### 1. Efeitos de Movimento (Render)
- **O que é**: Movimentos técnicos de câmera (Ken Burns, Zoompan) aplicados durante a geração do vídeo.
- **Fonte**: Sorteados ou selecionados da coleção `motion_effects` do banco de dados (ex: “Dynamic Zoom-In Drift”).
- **Aplicação**: Processados puramente pelos motores FFmpeg (WASM e Native) para dar vida a imagens estáticas.

### 2. Conceitos Criativos (IA)
- **O que é**: Uma “ideia de diretor” gerada pelo Gemini 2.5 Flash para cada cena.
- **Fonte**: Campo `animation` gerado na decupagem, baseado no contexto da cena, personagens e cenário.
- **Aplicação**: É um guia criativo/narrativo para a composição da imagem; **não** é processado pelos motores de renderização técnica. Serve para inspirar a estética da cena produzida.