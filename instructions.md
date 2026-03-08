# EchoVideo — Instruções Fixas do Sistema

Este arquivo contém regras permanentes que o sistema SEMPRE deve seguir durante o desenvolvimento.
Não modifique estas regras durante ajustes de programação, a menos que explicitamente solicitado.

---

## Regras de Cenas

- Toda cena deve ter no **mínimo 5 segundos** e no **máximo 10 segundos** de duração.
- O Gemini deve segmentar o áudio respeitando estes limites. Se uma cena natural ultrapassar 10s, deve ser dividida. Se for menor que 5s, deve ser unida à seguinte.

---

## Legendas - Presets Fixos

### 1. PRESET LEGENDAS HORIZONTAL (16:9)
- **Estilo**: Documentário / Treinamento / Youtube Longo.
- **Técnica**:
  - **Quebra de Texto**: Nas pausas naturais da fala (vírgulas, pontos) ou frases completas.
  - **Ritmo (CPS)**: Máximo 15 caracteres por segundo.
  - **Densidade**: 4 a 8 palavras por tela.
  - **Limites**: Máximo de 42 caracteres por linha / Máximo de 2 linhas.
- **Visual**:
  - **Fonte**: Montserrat ExtraBold | **Tamanho**: 40.
  - **Cor**: Amarelo #FFD700 | **Contorno**: Preto #000000 (7%).
  - **Sombra Suave**: Preto #000000, Opacidade 60%, Distância 5-8, Desfoque 10-15, Ângulo 111º.
  - **Posição (Y)**: 75% (rodapé).

### 2. PRESET LEGENDAS VERTICAL (9:16)
- **Estilo**: Shorts / TikTok / Reels.
- **Técnica**:
  - **Quebra de Texto**: Palavra por palavra ou blocos muito curtos (2-3 palavras).
  - **Ritmo**: Troca rápida no tempo exato da fala (sync perfeito).
  - **Densidade**: 1 a 3 palavras por tela.
  - **Limites**: Máximo de 20 caracteres por linha / Máximo de 2 linhas.
- **Visual**:
  - **Fonte**: The Bold Font | **Tamanho**: 45.
  - **Contorno**: Preto #000000 (7%).
  - **Sombra Sticker (Dura)**: Preto #000000, Opacidade 100%, Distância 6, Desfoque 0, Ângulo 111º.
  - **Posição (Y)**: 60% (abaixo do centro).
  - **Paleta de Destaque**: Branco (base), Amarelo (foco/substantivos), Verde (sucesso), Ciano (tecnologia), Vermelho (alerta).

- **Regra de Sincronia**: A legenda deve estar **sincronizada com o início da cena** (startSeconds da cena).
- Cada chunk de legenda é distribuído proporcionalmente ao longo da cena, começando exatamente no `sceneStart`.

---

## Motor de Sincronia de Legendas (Strict SRT Mode)

O pipeline de injeção de SRT garante **100% de timing fiel** sem perdas matemáticas (drift) durante a renderização do vídeo.

1. **Prevenção de Race Conditions**: O carregamento de arquivos na UI bloqueia execuções paralelas. O processamento do áudio deve sempre aguardar a tabela SRT ser indexada globalmente, evitando a criação de projetos sem legenda.
2. **Parsing Global Estrito (Sem IA)**: O arquivo SRT (ou VTT) é indexado de forma global na memória (`globalSrtSegments`). A IA não corta, não inventa nem modifica os tempos originais do arquivo.
3. **Renderização Fiel**: Arquivos SRT detectados desativam completamente qualquer cálculo de preenchimento automático. A renderização obedece exclusivamente ao milissegundo mapeado, deixando cenas mudas corretamente sem texto.
4. **Prevenção de Sobreposição (Overlap)**: Blocos de SRT nunca aparecem antes de serem falados. O início lógico de cada nova cena é rigorosamente amarrado ao término pontual da cena anterior.
5. **Draw Pipeline Baseado em Áudio**: A troca da legenda no Canvas baseia-se no tempo decorrido do áudio (`AudioContext.currentTime`) em vez do framerate do loop de renderização (fps). Isso garante que o avanço cronológico não sofra atraso caso ocorram leves travamentos de performance.

---

## Efeitos de Animação

Sempre usar um **efeito pré-definido** da lista abaixo (que deve estar sincronizada com a tabela `motion_effects` no banco de dados).

1. **Dynamic Zoom-In Drift**
   - **Aplicação**: Cria um foco progressivo e imersivo no assunto central, adicionando uma leve sensação orbital que evita que a cena pareça estática ou puramente mecânica.
   - **Instruction for Render**: Linearly increase the image scale from 1.15 to 1.20 while shifting the horizontal axis based on the direction tag: for move:right shift from -2% to +2% or for move:left shift from +2% to -2%, keeping the vertical axis centered throughout the scene duration.

2. **Contextual Zoom-Out Reveal**
   - **Aplicação**: Ideal para concluir um segmento narrativo ou revelar o ambiente mais amplo, proporcionando um "respiro" visual conforme a cena transiciona para o próximo tópico.
   - **Instruction for Render**: Linearly decrease the image scale from 1.20 to 1.15 while shifting the horizontal axis based on the direction tag: for move:right shift from -2% to +2% or for move:left shift from +2% to -2%, ensuring the movement remains subtle and the vertical axis stays fixed at the center.

3. **Cinematic Dolly Slide**
   - **Aplicação**: Simula uma câmera profissional movendo-se em um trilho físico (dolly), sendo a escolha perfeita para paisagens, fotos de grupo amplas ou infográficos horizontais.
   - **Instruction for Render**: Maintain a fixed scale of 1.18 and perform a continuous linear horizontal shift based on the direction tag: for move:right from -5% to +5% or for move:left from +5% to -5%, while keeping the vertical axis locked at zero to ensure a smooth side-to-side motion without zoom changes.

4. **Elegant Diagonal Lift**
   - **Aplicação**: Adiciona sofisticação a fotos de arquitetura, retratos ou objetos altos, combinando uma subida vertical com perspectiva lateral para explorar a imagem diagonalmente.
   - **Instruction for Render**: Maintain a fixed scale of 1.15 and execute a linear diagonal shift by moving the vertical axis from -2.5% to +2.5% (upward) while simultaneously shifting the horizontal axis based on the direction tag: for move:right-up shift from -2.5% to +2.5% or for move:left-down shift from +2.5% to -2.5%.

5. **Fluid Descending Sweep**
   - **Aplicação**: Cria uma sensação observacional enquanto a câmera "escaneia" a imagem de cima para baixo, guiando o olhar do espectador por múltiplos pontos de interesse na composição.
   - **Instruction for Render**: Maintain a fixed scale of 1.20 to ensure safe margins and perform a linear diagonal movement by shifting the vertical axis from +2.5% to -2.5% (downward) while moving the horizontal axis based on the direction tag: for move:right-down shift from -2.5% to +2.5% or for move:left-down shift from +2.5% to -2.5%.

**Regras de Aplicação:**
- Escolher o efeito que **mais combina com a cena** (análise contextual do texto/ação da cena).
- **Nunca repetir** o efeito da cena imediatamente anterior.
- Se não encontrar match contextual claro, usar seleção aleatória entre os 5 (mas nunca repetir o anterior).

---

## Características de Personagens (Character Token)

Objetivo: criar um "Bloco de Descrição Física" em **INGLÊS** para manter consistência.

### REGRA DE OURO — ANATOMIA ESTRITA E SEM ESTILO:
1. **Sem Estilo**: NÃO inclua palavras sobre estilo artístico, iluminação, câmera ou qualidade (nada de "4k", "cinematic", "cartoon").
2. **Forçar Anatomia**: O campo `subject` na etapa de criação JSON do Gemini **DEVE SEMPRE** gerar o formato físico estrito: `[Sujeito/Arquétipo], [Cabelo], [Detalhes do Rosto/Olhos], [Vestuário Cima e Baixo], [Calçados]`.

> **⚠️ PROGRAMAÇÃO**: Os campos `style` e `camera` gerados pelo Gemini são armazenados como dados de referência interna, mas **NUNCA entram no `imagePrompt` final** enviado à IA de imagem. O estilo artístico que entra no prompt é exclusivamente o definido pelo usuário na galeria de estilos (`image_style_prompts`).

### REGRA PARA FIGURAS REAIS (FILTRO DE IA):
Se a cena demandar uma figura histórica ou celebridade (Ex: Jesus, Albert Einstein, Donald Trump):
- **O NOME REAL É ESTRITAMENTE PROIBIDO** na etapa de construção da varíavel subject.
- **Substituição Obrigatória**: Você DEVE converter o nome imediatamente para um Arquétipo + Anatomia. (Ex: Em vez de "Jesus", o JSON final gerado pelo Gemini deve conter: *"Middle-aged middle-eastern man, long wavy brown hair, full beard, compassionate dark eyes, wearing a simple rough woven beige tunic with a leather belt and worn leather sandals"*).

### Estrutura da Saída (Parágrafo único em Inglês):
1. **Sujeito**: (Ex: "A middle-aged man"). Se for figura real, descreva os traços característicos.
2. **Cabelo/Barba**: Cor, textura e corte exato.
3. **Rosto**: Detalhes da pele, cor dos olhos e expressão neutra.
4. **Vestuário Superior**: Peça, tecido e cor.
5. **Vestuário Inferior**: Peça, tecido e cor.
6. **Calçados**: Tipo e cor.
7. **Acessórios**: Detalhes finais.

### Variáveis Obrigatórias:
- `[NOME/ARQUÉTIPO]`: (Ex: Jesus, Albert Einstein, Um Soldado Genérico)
- `[GÊNERO/IDADE]`
- `[CABELO]`
- `[ROUPA DE CIMA + COR]`
- `[ROUPA DE BAIXO + COR]`
- `[SAPATOS + COR]`
- `[EXTRAS]`: (Opcional)

### REGRA DE NOMEAÇÃO E DIVERSIDADE (VITAL):
A IA deve evitar criar personagens genéricos e **NUNCA DEVE USAR NOMES REAIS**. As IAs de imagem bloqueiam nomes mesmo quando disfarçados levemente. Cada personagem deve ter:
- **Apelido Fictício FONÉTICO OBRIGATÓRIO**: É ESTRITAMENTE PROIBIDO usar nomes reais de pessoas (ex: Elon Musk, Carl, Roberto) na construção do prompt em inglês. Para contornar filtros de CENSURA e COPYRIGHT, você DEVE inventar um apelido baseado na **fonética bizarra ou distorcida** do nome real ou algo que soe parecido mas se escreva totalmente diferente. 
  Exemplos de como forçar a fonética:
  - "REED" vira "RIDI"
  - "MARC" vira "MARQUI"
  - "ELON" vira "ILLOU"
  - "STEVE" vira "SHTIVI"
  Jamais deixe o apelido parecer com a grafia original do nome real. Crie palavras inexistentes que geram o som. Se não quiser usar fonética, use arquétipos puros e colados (ex: `TheOldScientist`).
- **Traços Únicos**: Etnia, faixa etária específica, marcas físicas (cicatrizes, tatuagens), óculos ou acessórios marcantes.
- **Coerência Narrativa**: As roupas e aparência devem refletir o contexto do áudio (ex: se é medieval, rural, futurista).
### Regra de Recorrência:
Se aparecerem em **2 ou mais cenas** → criar prompt base (token).
Prompts são editáveis e reutilizados automaticamente nas cenas relacionadas.

---

## Características de Cenários (Scenario Block)

Objetivo: criar um "Bloco Mestre de Cenário Universal" em **INGLÊS** para manter consistência.

### Estrutura Universal (Anatomia Estrita):
O campo `cenario` na etapa de criação JSON do Gemini **DEVE SEMPRE** gerar o formato físico estrito: `[Estrutura/Limites], [2-3 Objetos Fixos de Ancoragem], [Materiais/Texturas], [Iluminação/Cores]`. Use inglês.

1. **Estrutura e Limites (O Esqueleto)**:
   - Se Interno: paredes, teto, tipo de arquitetura e janelas/portas.
   - Se Externo: limites do espaço (prédios, horizonte, árvores), tipo de solo/pavimento e céu.

2. **Elementos de Ancoragem Fixos (O que não se move)**:
   - 2 ou 3 objetos grandes com POSIÇÕES EXATAS (Ex: "um balcão de recepção em L no centro esquerdo").

3. **Materiais e Texturas Dominantes**:
   - Superfícies principais (Ex: concreto brutalista, madeira envelhecida, asfalto molhado).

4. **Iluminação, Clima e Cores**:
   - Fonte de luz principal, temperatura da luz e as 3 cores principais da paleta.

### REGRAS CRÍTICAS:
- NÃO use metáforas ou descrições emocionais (nada de "atmosfera convidativa" ou "rua perigosa").
- Seja literal: descreva o que se vê.
- Use preposições espaciais claras (no centro, à esquerda, ao fundo, no primeiro plano).
- A saída deve ser APENAS o parágrafo em inglês.

### Regra de Recorrência:
Se aparecerem em **2 ou mais cenas** → criar prompt base.
Prompts são editáveis e reutilizados automaticamente nas cenas relacionadas.

---

## Características de Objetos/Itens (Prop Token)

Objetivo: criar um "Bloco de Descrição Física" em **INGLÊS** para manter consistência visual de objetos/itens com destaque narrativo na história (ex: armas, relíquias, livros mágicos, coroas, amuletos).

### REGRA DE INCLUSÃO:
Incluir apenas objetos que:
- Aparecem em **2 ou mais cenas**, OU
- Têm **importância narrativa alta** (objeto central da história)

### REGRA DE OURO — SEM METÁFORAS:
Descreva APENAS o que se vê fisicamente. Nada de "atmosfera misteriosa" ou "objetos perigosos".

### Estrutura da Saída (Parágrafo único em Inglês):
1. **Tipo de Objeto**: (Ex: "A medieval longsword")
2. **Material**: Tipo de material principal (Ex: "forged iron blade", "oak wood handle")
3. **Cor Principal**: Cor dominante do objeto
4. **Textura/Superfície**: Acabamento e aparência da superfície
5. **Tamanho/Forma**: Dimensões relativas e formato
6. **Estado/Condição**: Novo, envelhecido, danificado, polido, enferrujado, etc.
7. **Marcações/Detalhes Únicos**: Inscrições, símbolos, adornos, detalhes que o diferenciam

### Variáveis Obrigatórias:
- Tipo do Objeto
- Material Principal
- Cor Principal
- Textura/Superfície
- Tamanho/Forma
- Estado/Condição
- Detalhes Únicos/Marcações

### Regra de Recorrência:
Se aparecerem em **2 ou mais cenas** → criar prompt base (token).
Prompts são editáveis e reutilizados automaticamente nas cenas relacionadas.

---

## Projetos

- **1 projeto por áudio**: cada arquivo de áudio subido cria um projeto único.
- Ao subir um áudio com nome de projeto que já existe, reutilizar o projeto existente.
- Auto-save periódico com debounce de 2s, sempre no mesmo projeto.
- O projeto armazena: cenas, imagens/vídeos, legendas, áudio, personagens, cenários, objetos/props, prompts de exportação, estilo de imagem, formato e toda configuração.
- **Persistência de Áudio**: Áudio é salvo no Supabase Storage (`project-audio` bucket) com chave `{projectId}.wav`. Ao reabrir o projeto, o áudio é carregado automaticamente do servidor.
- **Persistência de Imagens**: Imagens das cenas são salvas no Supabase Storage (`project-images` bucket) com caminho `{projectId}/{filename}`. A URL pública é salva no banco de dados. Nunca armazenar imagens como base64 no banco.
- **Efeitos de Animação**: Ao criar um projeto, efeitos são pré-selecionados para todas as cenas usando `preselectEffectsForScenes`, garantindo variação e não repetição entre cenas consecutivas.

---

## Formato Final do Prompt (Exportação e Geração)

O prompt final é construído concatenando a descrição estruturada em blocos delimitados por pontos. **NUNCA DEVE CONTER COLCHETES [], BARRAS / OU CAMELCASE NAS VARIÁVEIS.**

Formato Base:
`Estilo de imagem: [NOME DO ESTILO GLOBAL] - [PROMPT TÉCNICO DO ESTILO]. Subject: [DESCRIÇÃO ANATÔMICA DOS PERSONAGENS] Quantity: X characters. Action: [AÇÃO DA CENA]. Camera: [ANGULO]. Object: [LISTA DE PROPS]. Cenário: [DESCRIÇÃO DO LOCAL]. Visual Integrity: "Pure image only: all surfaces are blank and free of any text or letters."`

### Regras de Ouro do Prompt:
1. **Exportação**: O prompt de imagem exportado deve conter puramente a string gerada (um prompt completo de blocos por linha), sem prefixos de cena (ex: Scene 1:), metadata adicional, com uma linha em branco separando os prompts, para importação otimizada em lote (MidJourney/Pollinations).
2. **[NOME DO ESTILO GLOBAL]**: Definido na UI. Se a cena tiver um estilo ativo customizado, o estilo sugerido pela IA Transcription é totalmente descartado para não haver conflitos (ex. Disney Pixar misturado com Cinematic).
3. **Subject**: Descrição 100% inglesa sem nomes próprios, focada em anatomia pura (ex: "a young adult male, short black hair, grey t-shirt..."). Se houver mais de um, separe por colchetes literais apenas no log interno visual, mas a String da Payload API é toda formatada em inglês fluente orgânico sem pontuações robóticas.
4. **Action e Cenário**: Regras estritas sem nome de personagens. No recarregamento por 'B-Roll' todo o Subject é apagado e substituído pela descrição da ação de forma genérica.
5. Não preencha descrições qualitativas redundantes ("high quality, 4k") artificialmente fora do bloco Estilo.
6. **🚫 REGRA ANTI-TEXTO (ABSOLUTA)**: **NUNCA** peça para escrever texto, palavras, frases, letras, números, placas, cartazes, banners ou legendas NA imagem gerada. A IA de imagem não deve renderizar nenhum caractere visível na cena. Todo prompt deve terminar com: `"Pure image only: absolutely NO text, NO letters, NO words, NO numbers, NO signs, NO banners, NO captions written anywhere in the image."`
