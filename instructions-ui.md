# 🎨 EchoVideo — Padrão de Interface (UI)

## 1. 🎯 Objetivo
- Reduzir carga cognitiva
- Aumentar velocidade de uso
- Garantir consistência visual

---

## 2. 📐 Layout
- Interface ultra-compacta
- Alta densidade de informação
- Estrutura em blocos
- Evitar espaços desnecessários

---

## 3. 🔤 Tipografia
- Fonte padrão limpa (sistema)
- Tamanho:
  - 11px padrão (conteúdo, prompts, labels comuns)
  - 12px destaque (títulos de bloco, seções principais)
- Evitar múltiplos tamanhos adicionais

---

## 4. 📦 Componentes
- Bordas sutis
- Baixo contraste em containers
- Destaque apenas no essencial

---

## 5. 🧩 Tokens na Interface

Subject:
Ilonmãsqui: middle-aged man, short dark hair...

Scenario:
Quarto12: modern bedroom... | RelogioOuro: golden wristwatch...

---

## 6. 🎛️ Interações
- Usuário pode selecionar:
  - personagens
  - cenários
  - objetos

- Alterações impactam:
  - inventário
  - prompts finais

---

## 7. 🚫 Restrições
- Não usar excesso de cores
- Não usar fontes grandes
- Não quebrar padrão de densidade
- Não duplicar informação visual

---

## 8. ✅ Consistência
- Mesmo padrão em todas as telas
- Mesma lógica de leitura
- Mesma estrutura de tokens

---

## 9. 🚀 Exportação Master (Monitoramento)
Diretrizes para o Modal de Exportação Final:

**Monitor Visual (Square Amostra):**
- **Estado Ativo**: Quando o motor "Desktop" é selecionado, a área de amostra deve se transformar em um monitor de status.
- **Dinamismo**: Exibir ícones (Terminal/CPU), barra de progresso (%) e mensagens de status (ex: "Renderizando Cena X/Y").
- **Real-time**: Os dados devem ser lidos instantaneamente do documento do projeto via Firebase `onSnapshot`.

**Controle de Comando:**
- **Reatividade**: O botão de "Copiar Comando" deve reagir aos toggles de UI (ex: incluir ou remover legendas via flag `--subs`).
- **Limpeza**: O comando sugerido deve sempre incluir a limpeza de cache `rm -rf temp_render/*` para garantir integridade.

**Feedback de Ambiente:**
- A UI deve refletir o estado real da conexão com o **Firebase** no rodapé, indicando se o sistema está pronto para sincronizar o progresso do terminal.