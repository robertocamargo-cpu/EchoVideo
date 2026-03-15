# EchoVideo — Instruções Fixas do Sistema

> [!IMPORTANT]
> **LOCKDOWN DE REGRAS**: NUNCA altere as diretrizes de nomes, apelidos ou estrutura de prompts abaixo sem autorização explícita do usuário após consulta prévia.

Este arquivo contém regras permanentes que o sistema SEMPRE deve seguir durante o desenvolvimento.
Não modifique estas regras durante ajustes de programação, a menos que explicitamente solicitado.
**AJUSTE VISUAL (Março 2026)**: O tamanho base do sistema foi aumentado em 20% (`html { font-size: 21px; }`) para melhor acessibilidade. Mantenha essa proporção em novos componentes.
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

1.  **Prevenção de Race Conditions**: O carregamento de arquivos na UI bloqueia execuções paralelas. O processamento do áudio deve sempre aguardar a tabela SRT ser indexada globalmente, evitando a criação de projetos sem legenda.
2.  **Parsing Global Estrito (Sem IA)**: O arquivo SRT (ou VTT) é indexado de forma global na memória (`globalSrtSegments`). A IA não corta, não inventa nem modifica os tempos originais do arquivo.
3.  **Renderização Fiel**: Arquivos SRT detectados desativam completamente qualquer cálculo de preenchimento automático. A renderização obedece exclusivamente ao milissegundo mapeado, deixando cenas mudas corretamente sem texto.
4.  **Prevenção de Sobreposição (Overlap)**: Blocos de SRT nunca aparecem antes de serem falados. O início lógico de cada nova cena é rigorosamente amarrado ao término pontual da cena anterior.
5.  **Draw Pipeline Baseado em Áudio**: A troca da legenda no Canvas baseia-se no tempo decorrido do áudio (`AudioContext.currentTime`) em vez do framerate do loop de renderização (fps). Isso garante que o avanço cronológico não sofra atraso caso ocorram leves travamentos de performance.

---

## Efeitos de Animação

Sempre usar um **efeito pré-definido** da lista abaixo (que deve estar sincronizada com a tabela `motion_effects` no banco de dados).

1.  **Dynamic Zoom-In Drift**
    -   **Aplicação**: Esta versão intensifica a imersão. Ao aumentar a variação de escala (de 1.12 para 1.22), cria-se um "mergulho" progressivo e imersivo no assunto central. Simultaneamente, o ligeiro movimento horizontal orbital (agora de 3% para cada lado) evita que a cena pareça estática ou mecanicamente travada no centro.
    -   **Instruction for Render**: Linearly increase the image scale from 1.12 to 1.22 while shifting the horizontal axis based on the direction tag: for move:right shift from -3% to +3% or for move:left shift from +3% to -3%, keeping the vertical axis centered throughout the scene duration.

2.  **Contextual Zoom-Out Reveal**
    -   **Aplicação**: Ideal para concluir um segmento narrativo ou revelar o ambiente mais amplo, proporcionando um "respiro" visual à medida que a cena transiciona. O zoom out constante (de 1.22 para 1.12) "abre" a imagem para revelar o contexto, enquanto o movimento lateral sutil (de 3%) dá fluidez e um ar de conclusão à revelação.
    -   **Instruction for Render**: Linearly decrease the image scale from 1.22 to 1.12 while shifting the horizontal axis based on the direction tag: for move:right shift from -3% to +3% or for move:left shift from +3% to -3%, ensuring the movement remains subtle and the vertical axis stays fixed at the center.

3.  **Cinematic Dolly Slide**
    -   **Aplicação**: Simula uma câmera profissional movendo-se em um trilho físico (dolly), ideal para paisagens ou grandes grupos. Para evitar qualquer sensação de imobilidade, adicionamos uma micro variação de escala (zoom in de 1.16 para 1.20) e aumentamos a amplitude do movimento lateral (agora 12% no total), tornando o efeito de profundidade mais orgânico e menos "robótico".
    -   **Instruction for Render**: Linearly increase the image scale from 1.16 to 1.20. While maintaining a relatively tight vertical margin, perform a continuous linear horizontal shift based on the direction tag: for move:right from -6% to +6% or for move:left from +6% to -6%. The vertical axis should shift very slightly from -1% to +1% to ensure no part of the frame remains strictly static.

4.  **Elegant Diagonal Lift**
    -   **Aplicação**: Adiciona sofisticação a fotos de arquitetura, retratos ou objetos altos, explorando a imagem diagonalmente. Esta versão combina a subida vertical (agora de -3% a +3%) com uma perspectiva lateral e, crucialmente, uma leve retração (zoom out de 1.20 para 1.15). A sensação visual é que a câmera sobe e se afasta simultaneamente, ideal para revelar a imponência de grandes estruturas de forma épica.
    -   **Instruction for Render**: Linearly decrease the image scale from 1.20 to 1.15 while executing a linear diagonal shift by moving the vertical axis from -3% to +3% (upward) and simultaneously shifting the horizontal axis based on the direction tag: for move:right-up shift from -3% to +3% or for move:left-down shift from +3% to -3%.

5.  **Fluid Descending Sweep**
    -   **Aplicação**: Cria uma sensação observacional enquanto a câmera "escaneia" a imagem de cima para baixo, guiando o olhar. O movimento de descida vertical (de +3% a -3%) é combinado com um zoom in progressivo (de 1.15 para 1.20). O efeito visual é de um "pouso" ou "inspeção", onde a câmera desce sobre o objeto de interesse enquanto ganha detalhe e proximidade através do zoom.
    -   **Instruction for Render**: Linearly increase the image scale from 1.15 to 1.20 to ensure dynamic focus. Perform a linear diagonal movement by shifting the vertical axis from +3% to -3% (downward) while simultaneously moving the horizontal axis based on the direction tag: for move:right-down shift from -3% to +3% or for move:left-down shift from +3% to -3%.

**Regras de Aplicação:**
- Escolher o efeito que **mais combina com a cena** (análise contextual do texto/ação da cena).
- **Nunca repetir** o efeito da cena imediatamente anterior.
- Se não encontrar match contextual claro, usar seleção aleatória entre os 5 (mas nunca repetir o anterior).

---

## Características de Personagens (Character Token)

Objetivo: criar um "Bloco de Descrição Física" em **INGLÊS** para manter consistência.

### REGRA DE OURO — ANATOMIA ESTRITA E SEM ESTILO:
1.  **Sem Estilo**: NÃO inclua palavras sobre estilo artístico, iluminação, câmera ou qualidade (nada de "4k", "cinematic", "cartoon").
2.  **Forçar Anatomia**: O campo `subject` na etapa de criação JSON do Gemini **DEVE SEMPRE** gerar o formato físico estrito: `[Sujeito/Arquétipo], [Cabelo], [Detalhes do Rosto/Olhos], [Vestuário Cima e Baixo], [Calçados]`.
3.  **🚫 REGRA DE BLINDAGEM TOTAL (ABSOLUTA)**: NUNCA use nomes reais, nomes de celebridades ou figuras públicas. Se o áudio mencionar uma pessoa real, converta IMEDIATAMENTE para sua descrição física. Ex: "Elon Musk" vira "Ilonmãsqui, a middle-aged man with short brown hair, wearing a dark business suit".
4.  **🚫 SEPARAÇÃO OBRIGATÓRIA**: `subject` contém **EXCLUSIVAMENTE** a descrição física dos personagens (aparência, roupas, traços). O que os personagens fazem, como interagem e a composição da cena pertencem ao campo `action`. NUNCA misture criação de cena em `subject`.

> **⚠️ PROGRAMAÇÃO**: Os campos `style` e `camera` gerados pelo Gemini são armazenados como dados de referência interna, mas **NUNCA entram no `imagePrompt` final** enviado à IA de imagem. O estilo artístico que entra no prompt é exclusivamente o definido pelo usuário na galeria de estilos (`image_style_prompts`).

### REGRA PARA FIGURAS REAIS (FILTRO DE IA):
Se a cena demandar uma figura histórica ou celebridade (Ex: Jesus, Albert Einstein, Donald Trump):
-   **O NOME REAL É ESTRITAMENTE PROIBIDO** na etapa de construção da varíavel subject.
-   **Substituição Obrigatória**: Você DEVE converter o nome imediatamente para um Arquétipo + Anatomia. (Ex: Em vez de "Jesus", o JSON final gerado pelo Gemini deve conter: *"Middle-aged middle-eastern man, long wavy brown hair, full beard, compassionate dark eyes, wearing a simple rough woven beige tunic with a leather belt and worn leather sandals"*).

### Estrutura da Saída (Parágrafo único em Inglês):
1.  **Sujeito**: (Ex: "A middle-aged man"). Se for figura real, descreva os traços característicos.
2.  **Cabelo/Barba**: Cor, textura e corte exato.
3.  **Rosto**: Detalhes da pele, cor dos olhos e expressão neutra.
4.  **Vestuário Superior**: Peça, tecido e cor.
5.  **Vestuário Inferior**: Peça, tecido e cor.
6.  **Calçados**: Tipo e cor.
7.  **Acessórios**: Detalhes finais.

### Variáveis Obrigatórias:
-   `[NOME/ARQUÉTIPO]`: (Ex: Jesus, Albert Einstein, Um Soldado Genérico)
-   `[GÊNERO/IDADE]`
-   `[CABELO]`
-   `[ROUPA DE CIMA + COR]`
-   `[ROUPA DE BAIXO + COR]`
-   `[SAPATOS + COR]`
-   `[EXTRAS]`: (Opcional)

### Regras de Nomes e Apelidos (VITAL)

#### 1. Personagens (Seres Humanos/Entidades Nomeadas)
- **Nome Real (`realName`)**: Extraído do áudio/legenda. **ESTRITAMENTE PROIBIDO** aparecer em qualquer campo de prompt de imagem.
- **Apelido (`name`)**: Deve ser uma única palavra fictícia baseada na fonética portuguesa (ex: 'Rótidógui', 'Ilonmãsqui'). Escreva como se fala.
- **Uso no Prompt**: Utilize sempre o **Apelido** + **Características Físicas Detalhadas**. O apelido nunca deve aparecer escrito visualmente na imagem.

#### 2. Cenários (Locais) e Objetos (Props)
- **Nomes Reais**: Podem ser mantidos exatamente como são (ex: 'Starbucks', 'Central Park', 'iPhone 15').
- **Apelido (`name`)**: Deve ser preenchido inicialmente com o próprio nome real.
- **Uso no Prompt**: Utilize o **Apelido**. Se houver bloqueio de criação, o usuário alterará o apelido manualmente para algo genérico.
- **Segurança**: Mesmo usando nomes reais no apelido, eles nunca devem ser renderizados como texto na imagem.

### Regra de Recorrência:
Se aparecerem em **2 ou mais cenas** → criar prompt base (token).
Prompts são editáveis e reutilizados automaticamente nas cenas relacionadas.

---

## Características de Cenários (Scenario Block)

Objetivo: criar um "Bloco Mestre de Cenário Universal" em **INGLÊS** para manter consistência.

### Estrutura Universal (Anatomia Estrita):
O campo `cenario` na etapa de criação JSON do Gemini **DEVE SEMPRE** gerar o formato físico estrito: `[Estrutura/Limites], [2-3 Objetos Fixos de Ancoragem], [Materiais/Texturas], [Iluminação/Cores]`. Use inglês.

> **🚫 SEPARAÇÃO OBRIGATÓRIA**: `cenario` contém **EXCLUSIVAMENTE** a descrição estática do ambiente (paredes, móveis, iluminação, materiais). O que acontece dentro do cenário (ações, interações, movimento) pertence ao campo `action`. NUNCA inclua criação de cena ou ação em `cenario`.

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

Formato Base (SEM LABELS DE ESTILO, AÇÃO E CENÁRIO):
`[NOME DO ESTILO GLOBAL] - [PROMPT TÉCNICO DO ESTILO]. Subject: [DESCRIÇÃO ANATÔMICA DOS PERSONAGENS USANDO APELIDOS] Quantity: X characters. [AÇÃO DA CENA]. Props: [LISTA DE PROPS]. Camera: [ANGULO]. [DESCRIÇÃO DO LOCAL]. Visual Integrity: "Pure image only: all surfaces are blank and free of any text or letters."`

### Regras de Ouro do Prompt:
1. **Exportação**: O prompt de imagem exportado deve conter puramente a string gerada (um prompt completo de blocos por linha), sem prefixos de cena (ex: Scene 1:), metadata adicional, com uma linha em branco separando os prompts, para importação otimizada em lote (MidJourney/Pollinations). **NUNCA utilize as palavras "Estilo de imagem:", "Action:" ou "Cenário:" no prompt final.**
2. **[NOME DO ESTILO GLOBAL]**: Definido na UI. Se a cena tiver um estilo ativo customizado, o estilo sugerido pela IA Transcription é totalmente descartado para não haver conflitos (ex. Disney Pixar misturado com Cinematic).
3. **Subject**: Descrição 100% inglesa sem nomes próprios (USE APELIDOS FONÉTICOS), focada **somente na anatomia física** do personagem (ex: "a young adult male, short black hair, grey t-shirt..."). Se houver qualquer resquício de nome real, o sistema de limpeza deve converter para a `description` física do asset. **NUNCA inclua ações, poses ou composição de cena aqui.**
4. **Action**: Descreve o que acontece na cena — postura, interação entre personagens, movimento, composição visual. Regras estritas sem nome de personagens (USE APELIDOS). No recarregamento por 'B-Roll' todo o Subject é apagado e substituído pela descrição da ação de forma genérica. **NUNCA use nomes reais aqui.**
5. **Cenário**: Descreve **somente** o ambiente físico estático (arquitetura, objetos, iluminação, materiais). A dinâmica e eventos da cena pertencem ao `action`. **NUNCA use nomes reais aqui.**
5. Não preencha descrições qualitativas redundantes ("high quality, 4k") artificialmente fora do bloco Estilo.
6. **🚫 REGRA ANTI-TEXTO (ABSOLUTA)**: **NUNCA** peça para escrever texto, palavras, frases, letras, números, placas, cartazes, banners ou legendas NA imagem gerada. A IA de imagem não deve renderizar nenhum caractere visível na cena. Todo prompt deve terminar com: `"Pure image only: absolutely NO text, NO letters, NO words, NO numbers, NO signs, NO banners, NO captions written anywhere in the image."`
7. **🚫 BLINDAGEM DE EXPORTAÇÃO**: Ao exportar prompts, o sistema garante que nenhum nome real inserido pelo usuário (em realName) esteja presente. Se detectado, é forçada a substituição pela descrição física.
