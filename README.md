# Controle Financeiro — Sueli

Sistema web de controle financeiro pessoal, derivado da planilha
`SUELI_FINANCEIRO_2025_2027`. Roda inteiramente no navegador, sem servidor
e sem custo de hospedagem.

**Site:** https://financeiro-sueli.netlify.app (após o primeiro deploy)

É um **app instalável (PWA)** — dá para colocar o ícone na tela inicial do
celular e abrir em tela cheia, sem barra do navegador, como um app nativo.
Veja "Instalar como app no celular" mais abaixo.

Duas formas de rodar:

| Modo | Onde ficam os dados | Abre em outro aparelho? |
|---|---|---|
| **Netlify** (recomendado) | servidor + navegador | **sim** — mesmo link, mesma senha |
| GitHub Pages / arquivo local | só no navegador | não — precisa importar o backup |

---

## O que o sistema faz

| Tela | Função |
|---|---|
| **Painel** | KPIs do ano, fluxo mensal, evolução do saldo, maiores despesas e receitas |
| **Lançamentos** | Extrato diário com saldo em cascata, busca, filtros e CRUD completo |
| **Fixos & Recorrentes** | Cadastre uma vez (aluguel, plano de saúde, pensão…) e o sistema replica nos meses futuros |
| **Cartões** | Fatura, parcelado e à vista + encargos, mês a mês, por cartão |
| **Parcelamentos** | Cadastro único da compra; as parcelas aparecem numeradas em todos os meses |
| **Metas & Dívidas** | Metas de poupança e consignados com taxa implícita (RATE), parcelas antecipadas e valor justo de quitação (PV) |
| **Fluxo de Caixa** | 25 meses de saldo inicial → entradas → saídas → saldo final |
| **Relatórios** | Matriz categoria × mês, ranking, média e participação percentual |
| **Auditoria** | Verificação automática da base a cada carregamento |
| **Categorias** | Criar, renomear (propaga para os lançamentos) e excluir |
| **Dados & Backup** | Exportar/importar JSON, exportar CSV, mês de referência, reset |

## Arquitetura de dados

```
Navegador
├── IndexedDB  ......... base principal (sem limite prático de tamanho)
├── localStorage ....... espelho de segurança + histórico das operações
└── Backup JSON ........ portabilidade entre dispositivos
```

- **Gravação automática** a cada alteração (debounce de 350 ms), com indicador
  de status na barra lateral.
- **Nada é armazenado em disco fora do navegador** — sem servidor, sem
  terceiros, sem dados financeiros trafegando pela rede.
- **Migrações versionadas** (`SCHEMA`) para evoluir o formato sem perder dados.

### Modelo

```jsonc
{
  "meta": { "saldoInicial", "mesBase", "mesRef", "primeiroMes", "ultimoMes" },
  "categorias":   { "receita": [], "despesa": [] },
  "lancamentos":  [{ "id", "data", "desc", "cat", "valor", "conta", "rec?" }],
  "parcelamentos":[{ "id", "cartao", "fornecedor", "mes1", "n", "valor" }],
  "recorrentes":  [{ "id", "desc", "cat", "valor", "dia", "inicio", "fim", "ativo" }],
  "metas":        [{ "nome", "alvo", "guardado", "prazo" }],
  "emprestimos":  [{ "cod", "desc", "principal", "n", "parcela", "mes1" }]
}
```

Tudo o mais — saldos, faturas, matriz de parcelas, taxas, projeções — é
**derivado**. Não existe saldo digitado à mão: um lançamento novo recalcula os
25 meses inteiros.

## Automações

1. **Cascata de saldos** — o saldo final de um mês é o inicial do seguinte.
2. **Parcelas de cartão** — geradas a partir do cadastro, numeradas (`3 de 12`).
3. **Lançamentos recorrentes** — materializados nos meses após o mês de referência.
4. **Mês de referência** — avança sozinho conforme o calendário, separando
   realizado de projeção.
5. **Auditoria** — roda a cada carregamento e sinaliza lançamentos sem
   categoria, saldos negativos, faturas não lançadas, metas sem lastro etc.
6. **Parcelas antecipadas** — cada consignado tem um campo *Parcelas já
   antecipadas*: são as parcelas do fim do contrato que já foram quitadas por
   amortização extra. As parcelas regulares o sistema conta sozinho pelo
   calendário; nesse campo entram só as que você comprou adiantado. O EP 3
   (Consignado 297) já vem com **59** — as parcelas 14 a 72, antecipadas entre
   abr e ago/2026. Depois de cada nova amortização, some as parcelas
   antecipadas ali e o saldo devedor se refaz sozinho.

## Stack

HTML + CSS + JavaScript puro. Zero dependências, zero build.

```
index.html
assets/store.js    persistência
assets/engine.js   cálculos
assets/charts.js   gráficos SVG
assets/ui.js       telas e roteamento
assets/app.css     tema roxo-ametista
assets/sync.js     sincronização com o servidor
assets/cripto.js   desbloqueio por senha e cifra do que sobe
data/seed.enc.js   base inicial criptografada (AES-256-GCM)
netlify/functions/dados.mjs   API /api/dados (Netlify Blobs)
netlify.toml       build e cabeçalhos
manifest.webmanifest   metadados do app instalável (PWA)
sw.js              service worker (cache do app + funciona offline)
icons/             ícones do app (192px, 512px, maskable, Apple)
```

Paleta de dados validada para daltonismo (par divergente azul ↔ vermelho).

## Sincronização na nuvem

Na versão publicada na Netlify existe um endpoint `/api/dados` (Netlify Function
+ Netlify Blobs) que guarda a base **permanentemente no servidor**:

```
Navegador                      Netlify
  ├ cifra a base (AES-256-GCM) ──PUT──►  Blobs  (guarda um blob opaco)
  └ IndexedDB (cópia local)    ◄──GET──  Blobs
```

- O que sobe vai **cifrado com a sua senha**. O servidor guarda bytes
  embaralhados; nem a Netlify lê o conteúdo.
- O acesso exige um token derivado da senha (`AUTH_TOKEN_SHA` como variável de
  ambiente do projeto). Sem a senha certa, o endpoint responde 401.
- Cada gravação incrementa uma **revisão**. Se dois aparelhos editarem ao mesmo
  tempo, o segundo recebe `409 conflito` e a tela de Dados oferece
  *Puxar do servidor* ou *Enviar mesmo assim*.
- Sem internet, o sistema continua funcionando com a cópia local e envia
  sozinho quando a conexão volta.
- O rodapé da barra lateral mostra o estado: `☁︎ na nuvem · v12`,
  `☁︎ enviando…`, `☁︎ offline`, `☁︎ conflito`.

### Publicar na Netlify

O projeto **financeiro-sueli** já existe na Netlify, já está com a variável
`AUTH_TOKEN_SHA` configurada e com o acesso de visitante liberado — o site já
foi publicado a partir deste pacote.

Para republicar depois de mexer nos arquivos, rode dentro desta pasta:

```bash
npx -y netlify-cli deploy --prod --site financeiro-sueli
```

Ou, se preferir o fluxo por Git: suba os arquivos para um repositório no GitHub
e, em app.netlify.com → projeto **financeiro-sueli** → *Site configuration →
Build & deploy → Link repository*, escolha o repo. A partir daí cada
`git push` republica sozinho.

> Se trocar a senha, recalcule a variável:
> `AUTH_TOKEN_SHA = sha256( sha256("fin-auth::" + NOVA_SENHA) )`
> e atualize em *Site configuration → Environment variables*.

## Onde os dados ficam (e como não perdê-los)

A gravação é automática a cada alteração — 350 ms depois de qualquer mudança,
em **duas camadas ao mesmo tempo**: IndexedDB (principal) e localStorage
(espelho). Se uma falhar, a outra segura. O ponto na barra lateral fica amarelo
enquanto grava e verde com o horário quando termina.

Na primeira abertura o sistema pede ao navegador **armazenamento persistente**
(`navigator.storage.persist()`), que impede o descarte automático por falta de
espaço. O estado aparece em *Dados & Backup → Situação da base*.

**O que apaga os dados:**

(Vale para a instalação **sem servidor**. Com a Netlify ligada, o servidor é a
fonte da verdade e nada disso apaga os dados.)

| Situação | Perde? |
|---|---|
| Fechar o navegador, desligar o computador, ficar offline | não |
| Atualizar o site (novo deploy) | não |
| Limpar histórico/cookies/dados do site | **sim** |
| Janela anônima | **sim**, ao fechar |
| Outro navegador ou outro aparelho | base separada, começa do zero |
| iPhone/iPad: ficar ~7 dias sem abrir o site no Safari | **sim** (política da Apple) |
| Botão "Bloquear este navegador" | sim, de propósito |

Por isso o Painel exibe um lembrete quando passam **7 dias sem backup**. O
arquivo JSON é o seguro contra tudo isso — e é também como se leva a base para
outro aparelho.

> No iPhone, adicionar o site à Tela de Início (Compartilhar → Adicionar à Tela
> de Início) evita o descarte de 7 dias do Safari.

## Segurança

O arquivo publicado guarda os dados **criptografados** — AES-256-GCM com chave
derivada da senha por PBKDF2-SHA256 (250.000 iterações). Quem baixar
`data/seed.enc.js` da internet vê apenas texto embaralhado.

- A senha é pedida na primeira abertura de cada aparelho e nunca sai dele.
- Depois de aberta, a base fica no IndexedDB **daquele navegador**.
- `Dados & Backup → Bloquear este navegador` apaga a cópia local e volta a
  exigir a senha (útil em computador compartilhado).
- `Dados & Backup → Gerar pacote com nova senha` produz um `seed.enc.js` novo,
  com a base atual e outra senha. Substitua o arquivo no repositório para
  atualizar o site.

> Não há recuperação de senha. Perdeu a senha, perdeu o pacote — guarde também
> o backup JSON em local seguro.

## Instalar como app no celular

O site tem um `manifest.webmanifest` e um `sw.js` (service worker) que o
transformam num **app instalável**, sem passar pela Play Store/App Store.

**Android (Chrome):**
1. Abra https://financeiro-sueli.netlify.app no Chrome.
2. Toque no menu **⋮** (três pontinhos) → **"Instalar aplicativo"** (ou
   **"Adicionar à tela inicial"**).
3. Confirme. O ícone "SF" aparece na tela inicial e abre em tela cheia.

**iPhone/iPad (Safari):**
1. Abra o link no **Safari** (tem que ser o Safari — outros navegadores no
   iPhone não conseguem instalar apps).
2. Toque no ícone de **Compartilhar** (quadrado com seta para cima).
3. Toque em **"Adicionar à Tela de Início"** → **Adicionar**.
4. O ícone aparece na tela inicial e abre sem a barra do Safari.

Depois de instalado, o app abre exatamente como o site — mesma senha, mesmos
dados, mesma sincronização com o servidor. O `sw.js` guarda os arquivos do
sistema em cache, então o app abre rápido mesmo com internet fraca (os dados
em si continuam precisando de conexão para sincronizar).

## Publicar no GitHub Pages

1. Crie um repositório chamado `financeiro-sueli` (público ou privado).
2. Envie todos os arquivos deste pacote para a raiz do repositório.
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.**
4. Em 1–2 minutos o site fica no ar em
   `https://<seu-usuario>.github.io/financeiro-sueli/`.

O arquivo `.nojekyll` já está incluído — não remova.

## Uso local

```bash
git clone https://github.com/acasendey-prog/financeiro-sueli.git
cd financeiro-sueli
python3 -m http.server 8000
# abra http://localhost:8000
```

Também funciona abrindo `index.html` direto do disco.
