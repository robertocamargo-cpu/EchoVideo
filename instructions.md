# 🎥 EchoVideo — Instruções Fixas do Sistema

> **LOCKDOWN DE REGRAS**: NUNCA altere as diretrizes de nomes, apelidos ou estrutura de prompts abaixo sem autorização explícita do usuário após consulta prévia.  
> **LAYOUT ULTRA-COMPACTO (Março 2026)**: O sistema prioriza densidade de informação para fluxos de trabalho rápidos. Utilize fontes pequenas (11px-12px) e bordas sutis para manter a interface profissional e concisa.

## 💡 Objetivo Primário: Consistência Visual

O objetivo fundamental da criação de Tokens (Personagens, Cenários e Objetos) é garantir a recorrência visual absoluta.

- **Mesma Descrição = Resultados Quase Idênticos**: Personagens, cenários e objetos são descritos fisicamente uma única vez no inventário mestre. Ao utilizar exatamente a mesma descrição em diferentes cenas, o modelo de imagem garante que os elementos mantenham a identidade visual e pareçam quase iguais em todo o vídeo.
- **Independência de Ação**: A consistência visual é mantida pelas descrições físicas estáticas (Subject e Scenario). A variação narrativa, criativa e de movimento ocorre exclusivamente no campo Action.
- **Exemplo de Consistência**: Se o objeto é um "quarto", a mesma descrição de quarto será usada em todas as cenas onde ele aparecer; se é um personagem, as características físicas repetidas farão com que ele seja reconhecível como o mesmo indivíduo.

---

## 1. Regras de Cenas e Densidade de Texto

Este módulo controla a segmentação do áudio e a carga cognitiva visual para garantir a legibilidade.

- **Duração por Cena**: Mínimo de 3.0 segundos | Máximo de 10 segundos.
- **Segmentação**: O Gemini deve segmentar o áudio respeitando estes limites. Se uma cena natural ultrapassar 10s, deve ser dividida em duas ou mais cenas.
- **Sincronia de Fala (Densidade)**: Respeite o ritmo natural de fala (aprox. 3.0 palavras por segundo).
- **CRITICAL TIMING (Regra Anti-Atropelamento)**: O texto agora tem precedência sobre o tempo. A IA foi treinada para extrair blocos de 12 a 25 palavras. O limite de "Atropelado" é 3.0 WPS.

### 📊 Tabela de Referência de Palavras por Cena:

| Duração da Cena | Limite Máximo de Palavras |
| :--- | :--- |
| **5 segundos** | bem próximo a 12–13 palavras |
| **6 segundos** | bem próximo a 14-15 palavras |
| **7 segundos** | bem próximo a 16–18 palavras |
| **8 segundos** | bem próximo a 19-20 palavras |
| **9 segundos** | bem próximo a 21–23 palavras |
| **10 segundos** | bem próximo a 24-25 palavras |

> **Regra de Divisão**: Se o texto ultrapassar estes limites para a duração da cena, a cena **DEVE** ser dividida em duas ou mais partes, mesmo que a ação visual ou cenário permaneçam idênticos.

---

## 2. Legendas - Presets Fixos

### 📺 PRESET LEGENDAS HORIZONTAL (16:9)
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

### 📱 PRESET LEGENDAS VERTICAL (9:16)
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

---

## 3. Motor de Sincronia de Legendas (Strict SRT Mode)

O pipeline de injeção de SRT garante 100% de timing fiel sem perdas matemáticas (drift) durante a renderização do vídeo.

1. **Prevenção de Race Conditions**: O carregamento de arquivos na UI bloqueia execuções paralelas. O processamento do áudio deve sempre aguardar a tabela SRT ser indexada globalmente na memória (`globalSrtSegments`), evitando a criação de projetos sem legenda.
2. **Parsing Global Estrito (Sem IA)**: O arquivo SRT (ou VTT) é indexado de forma bruta. A IA não corta, não inventa nem modifica os tempos originais do arquivo.
3. **Renderização Fiel**: Arquivos SRT detectados desativam completamente qualquer cálculo de preenchimento automático. A renderização obedece exclusivamente ao milissegundo mapeado, deixando cenas mudas corretamente sem texto.
4. **Prevenção de Sobreposição (Overlap)**: Blocos de SRT nunca aparecem antes de serem falados. O início lógico de cada nova cena é rigorosamente amarrado ao término pontual da cena anterior.
5. **Draw Pipeline Baseado em Áudio**: A troca da legenda no Canvas baseia-se no tempo decorrido do áudio (`AudioContext.currentTime`) em vez do framerate do loop de renderização (fps). Isso garante que o avanço cronológico não sofra atraso caso ocorram leves travamentos de performance.
6. **Estratégia de Alinhamento (Phase 0/1)**: O roteiro TXT deve ser mapeado globalmente na Fase 0 (Inventário) em blocos de 30s (`scriptMap`). Em seguida, cada "chunk" de áudio recebe apenas a fatia de texto correspondente. Isso garante que a IA nunca se perca em roteiros longos e mantenha a sincronia absoluta.
7. **Compensação de Lag (Offset de Antecipação)**: O offset global atual é de **0.0** segundos. A sincronia deve ser exata com o início da fala, sem antecipações artificiais.
8. **Placeholders Autorizados**: O uso do termo `(continua)` é permitido exclusivamente para marcar a continuidade de texto em cenas divididas ou trechos onde o SRT não possui transcrição imediata.
9. **Sincronia com SRT**: Havendo um arquivo `.srt`, ele tem prioridade máxima sobre o tempo e o texto do roteiro. A IA deve usar os blocos de tempo e o texto do SRT exatamente como fornecidos, focando apenas na geração dos prompts visuais.

---

## 4. Efeitos de Animação (Motion Effects)

Utilizar sempre um efeito pré-definido da lista abaixo. **Nunca** repetir o efeito da cena anterior.

1. **Dynamic Zoom-In Drift**
   - **Aplicação**: Esta versão intensifica a imersão. Ao aumentar a variação de escala (de 1.12 para 1.22), cria-se um "mergulho" progressivo e imersivo no assunto central. Simultaneamente, o ligeiro movimento horizontal orbital (agora de 3% para cada lado) evita que a cena pareça estática ou mecanicamente travada no centro.
   - **Instruction for Render**: Linearly increase the image scale from 1.12 to 1.22 while shifting the horizontal axis based on the direction tag: for move:right shift from -3% to +3% or for move:left shift from +3% to -3%, keeping the vertical axis centered throughout the scene duration.

2. **Contextual Zoom-Out Reveal**
   - **Aplicação**: Ideal para concluir um segmento narrativo ou revelar o ambiente mais amplo, proporcionando um "respiro" visual medida que a cena transiciona. O zoom out constante (de 1.22 para 1.12) "abre" a imagem para revelar o contexto, enquanto o movimento lateral sutil (de 3%) dá fluidez e um ar de conclusão à revelação.
   - **Instruction for Render**: Linearly decrease the image scale from 1.22 to 1.12 while shifting the horizontal axis based on the direction tag: for move:right shift from -3% to +3% or for move:left shift from +3% to -3%, ensuring the movement remains subtle and the vertical axis stays fixed at the center.

3. **Cinematic Dolly Slide**
   - **Aplicação**: Simula uma câmera profissional movendo-se em um trilho físico (dolly), ideal para paisagens ou grandes grupos. Para evitar qualquer sensação de imobilidade, adicionamos uma micro variação de escala (zoom in de 1.16 para 1.20) e aumentamos a amplitude do movimento lateral (agora 12% no total), tornando o efeito de profundidade mais orgânico e menos "robótico".
   - **Instruction for Render**: Linearly increase the image scale from 1.16 to 1.20. While maintaining a relatively tight vertical margin, perform a continuous linear horizontal shift based on the direction tag: for move:right from -6% to +6% or for move:left from +6% to -6%. The vertical axis should shift very slightly from -1% to +1% to ensure no part of the frame remains strictly static.

4. **Elegant Diagonal Lift**
   - **Aplicação**: Adiciona sofisticação a fotos de arquitetura, retratos ou objetos altos, explorando a imagem diagonalmente. Esta versão combina a subida vertical (agora de -3% a +3%) com uma perspectiva lateral e, crucialmente, uma leve retração (zoom out de 1.20 para 1.15). A sensação visual é que a câmera sobe e se afasta simultaneamente, ideal para revelar a imponência de grandes estruturas de forma épica.
   - **Instruction for Render**: Linearly decrease the image scale from 1.20 to 1.15 while executing a linear diagonal shift by moving the vertical axis from -3% to +3% (upward) and simultaneously shifting the horizontal axis based on the direction tag: for move:right-up shift from -3% to +3% or for move:left-down shift from +3% to -3%.

5. **Fluid Descending Sweep**
   - **Aplicação**: Cria uma sensação observacional enquanto a câmera "escaneia" a imagem de cima para baixo, guiando o olhar. O movimento de descida vertical (de +3% a -3%) é combinado com um zoom in progressivo (de 1.15 para 1.20). O efeito visual é de um "pouso" ou "inspeção", onde a câmera desce sobre o objeto de interesse enquanto ganha detalhe e proximidade através do zoom.
   - **Instruction for Render**: Linearly increase the image scale from 1.15 to 1.20 to ensure dynamic focus. Perform a linear diagonal movement by shifting the vertical axis from +3% to -3% (downward) while simultaneously moving the horizontal axis based on the direction tag: for move:right-down shift from -3% to +3% or for move:left-down shift from +3% to -3%.

---

## 5. Características de Personagens (Character Token)

**REGRA DE OURO — ANATOMIA ESTRITA E SEM ESTILO**

- ⚠️ **REGRA DE CAMPO VAZIO**: Se não houver nenhum personagem na cena, o campo `subject` **DEVE FICAR EM BRANCO**.
- 🚫 **REGRA DE BLINDAGEM (ABSOLUTA)**: NUNCA use nomes reais. Se o áudio mencionar uma pessoa real, converta IMEDIATAMENTE para sua descrição física no Inventário e use um **Apelido (Nickname)** fonético de UMA ÚNICA PALAVRA. Ex: "Elon Musk" vira "Ilonmãsqui".
- **Asset DNA (Pureza)**: NÃO inclua palavras sobre estilo artístico, iluminação, surrealismo, poética ou qualidade (nada de "4k", "cinematic", "galaxy effects").
- **Forçar Anatomia (Literal)**: O campo `subject` na etapa de criação JSON do Gemini **DEVE SEMPRE** gerar o formato físico estrito e puramente anatômico: `[Sujeito/Arquétipo], [Cabelo], [Detalhes do Rosto/Olhos], [Vestuário Cima e Baixo], [Calçados]`.
- **Conversão de Figuras Reais**: O nome real é estritamente proibido. Converta imediatamente para um Arquétipo + Anatomia Físico literal.
  - *Exemplo (Jesus)*: "Middle-aged middle-eastern man, long wavy brown hair, full beard, compassionate dark eyes, wearing a simple rough woven beige tunic with a leather belt and worn leather sandals".

### 🚫 SEPARAÇÃO E PUREZA OBRIGATÓRIA:
- **No Gemini (JSON)**: O campo `subject` deve conter apenas as IDs dos personagens ou apelidos fonéticos.
- **Na Interface (UI)**: O campo `subject` deve ser exibido como `Apelido: Descrição Física`. Se houver múltiplos personagens, use `Apelido1: Descrição | Apelido2: Descrição`.
- **Finalidade**: Isso garante que a descrição física seja IDÊNTICA em todas as cenas para o mesmo apelido, gerando consistência visual.

### Estrutura da Saída (Parágrafo único em Inglês):
1. **Sujeito**: Arquétipo físico (Ex: "A middle-aged man").
2. **Cabelo/Barba**: Cor, textura e corte exato.
3. **Rosto**: Detalhes da pele, cor dos olhos e expressão neutra.
4. **Vestuário Superior**: Peça, tecido e cor.
5. **Vestuário Inferior**: Peça, tecido e cor.
6. **Calçados**: Tipo e cor.
7. **Acessórios**: Detalhes finais.

**Variáveis Obrigatórias**:  
`[NOME/ARQUÉTIPO], [GÊNERO/IDADE], [CABELO], [ROUPA DE CIMA + COR], [ROUPA DE BAIXO + COR], [SAPATOS + COR], [EXTRAS].`

---

## 6. Características de Cenários e Objetos (Scenario Block)

- ⚠️ **REGRA DE CAMPO VAZIO**: Se não houver cenário nem objeto na cena, o campo `scenario` **DEVE FICAR EM BRANCO**.
- 📦 **OBJETOS (Props)**: Se houver um objeto relevante na cena com destaque narrativo, sua descrição física deve ser escrita dentro do campo `scenario`.

### 🚫 SEPARAÇÃO E PUREZA OBRIGATÓRIA:
- **Na Interface (UI)**: O campo `cenario` deve conter o `Apelido do Local: Descrição` seguido de todos os `Apelidos dos Objetos: Descrições`.
- **Formato**: `Quarto 12: [Descrição do quarto] | Relógio de Ouro: [Descrição do relógio]`.

### Estrutura Universal do Cenário (Anatomia Estrita):
1. **Estrutura e Limites (O Esqueleto)**: Se Interno: paredes, teto, arquitetura e janelas/portas. Se Externo: prédios, horizonte, solo e céu.
2. **Ancoragem Fixa**: 2 ou 3 objetos grandes com POSIÇÕES EXATAS (Ex: "um balcão de recepção em L no centro esquerdo").
3. **Materiais**: Superfícies principais (Ex: concreto brutalista, madeira envelhecida, asfalto molhado).
4. **Iluminação, Clima e Cores**: Fonte de luz principal, temperatura da luz e as 3 cores principais da paleta.

### Estrutura do Objeto (Prop Token):
Incluir apenas objetos que aparecem em +2 cenas ou têm alta importância narrativa (Ex: armas, relíquias, livros mágicos).
1. Tipo do Objeto | 2. Material | 3. Cor Principal | 4. Textura | 5. Tamanho/Forma | 6. Estado/Condição (novo, envelhecido, enferrujado) | 7. Marcações/Símbolos.

---

## 7. Ângulo de Câmera (Camera Angle)

Define a perspectiva da câmara para cada cena para aumentar a coerência visual e técnica.  
**Exemplos**: `Wide shot, Close-up, Low angle, Eye level, Bird's eye view, Dutch angle, Extreme long shot`.

---

## 8. Projetos e Persistência

- **Unicidade**: 1 projeto por áudio. Auto-save periódico com debounce de 2s.
- **Storage de Áudio**: Salvo obrigatoriamente como `.mp3` no bucket `project-audio` como `{projectId}.mp3`. O formato `.wav` está estritamente bloqueado.
- **Storage de Imagens**: Salvas no bucket `project-images` vinculadas ao `projectId`. URLs públicas no banco de dados.

---

## 9. Formato Final do Prompt (Exportação)

O prompt final é a concatenação técnica dos blocos delimitados por pontos. Campos vazios convertem-se em strings nulas (sem espaços extras).

> ⚠️ **REGRA CRÍTICA DE CRIAÇÃO**:  
> **NUNCA** crie nenhuma ideia de cena, ação ou conceito fora do campo `Action`.  
> - **Subject / Scenario**: Exclusivos para descrições físicas e anatômicas estáticas.  
> - **Action**: Único campo permitido para a criação da ideia da cena, incluindo surrealismo, simbolismo, movimentos e metáforas.

- **Regra de Referência**: Dentro da `Action`, refira-se ao personagem pelo seu Apelido (Ex: `"Ilonmãsqui is walking..."`). O apelido deve ser mantido no prompt final para que a IA de imagem correlacione a ação descrição física presente no Subject.

### Estrutura do imagePrompt (Backend):
`${Estilo}. ${Subject}. ${Action}. ${Scenario}. ${Angulo}. Visual Integrity: "Pure image only: absolutely NO text, NO letters, NO words, NO numbers, NO signs, NO banners, NO captions written anywhere in the image."`

- 🚫 **REGRA ANTI-TEXTO**: NUNCA peça para escrever palavras, números ou legendas NA imagem gerada.
- 🚫 **BLINDAGEM DE EXPORTAÇÃO**: Nomes reais são estritamente proibidos no envio final para a IA.

---

## 10. Entrada de Dados e Upload

O pipeline de entrada exige estritamente UM destes dois pares abaixo para evitar conflitos:

- **Opção A**: Áudio (`.mp3`) + Roteiro (`.txt`).
- **Opção B**: Áudio (`.mp3`) + Legenda (`.srt`).

> ⚠️ **PROIBIÇÃO**: Nunca subir `.srt` + `.txt` juntos. O `.mp3` é mandatório para otimização de espaço e armazenamento no servidor.