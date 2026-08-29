# Vizinhança — mural do bairro

Esqueleto de um PWA para os moradores do bairro. Mesma receita do controle
financeiro: HTML + CSS + JavaScript puro, sem build, sem framework, hospedado
de graça na Netlify e instalável na tela inicial do celular.

Fica em `/bairro/` do mesmo site — não mexe em nada do app financeiro.

## O que já funciona

- **Feed único** com cinco tipos de aviso: ocorrência, serviço, evento,
  achados e perdidos, doação/troca
- **Filtro por tipo** e **busca** por título, texto, rua ou pessoa
- **Publicar aviso** (título, detalhes, rua, nome e WhatsApp opcional)
- **"Também estou vendo isso"** — contador de confirmações, uma por aparelho
- **Marcar como resolvido / apagar** — só para quem publicou
- **Validade automática**: ocorrência sai do mural em 7 dias, serviço em 60,
  o resto em 30. Vencidos saem do feed e viram só uma contagem
- **Contato por WhatsApp** via `wa.me`, sem chat interno
- **Instalável (PWA)** e abre offline com o que já foi carregado
- Tema claro e escuro conforme o aparelho

## Como ver

Qualquer servidor estático na raiz do repositório:

```bash
python3 -m http.server 8899
# abra http://localhost:8899/bairro/
```

Na primeira abertura o app cria cinco avisos de exemplo para você ver o feed
cheio. Para limpar: `localStorage.clear()` no console do navegador.

## Os dois modos

| Modo | Quando | Onde ficam os avisos |
|---|---|---|
| **demonstração** (atual) | não existe backend respondendo | só no navegador daquele aparelho |
| **compartilhado** | `/api/mural` responde | Netlify Blobs — todo mundo vê o mesmo mural |

O app testa `/api/mural` ao abrir e escolhe sozinho. O rótulo no canto superior
direito diz em qual modo está.

### Ligar o mural compartilhado

A função `netlify/functions/mural.mjs` já está pronta, mas **desligada de
propósito** — sem isso o site ficaria com um endpoint aberto de escrita. Para
ligar, na Netlify em *Site settings → Environment variables*:

| Variável | Valor | Para quê |
|---|---|---|
| `MURAL_ATIVO` | `1` | liga o backend |
| `MURAL_CONVITE` | um código qualquer | opcional: só publica quem tiver o código |

> `MURAL_CONVITE` ainda não é enviado pelo app — falta a tela que pede o código
> e o guarda. Enquanto não existir, deixe a variável em branco ou trate o mural
> como público.

## O que falta antes de soltar para os vizinhos

Em ordem de importância:

1. **Moderação.** Hoje quem publicou apaga o próprio aviso, e a "posse" é o
   aparelho — trocou de celular, perdeu o controle. Falta uma senha de
   administrador que possa apagar qualquer coisa e um botão de denunciar.
2. **Controle de quem entra.** Sem isso, qualquer pessoa com o link publica.
   O caminho mais simples é o código de convite distribuído no grupo do bairro.
3. **Anti-abuso no backend.** Limite de publicações por aparelho por hora e
   uma confirmação por aparelho validada no servidor (hoje isso é só no
   navegador, dá para burlar limpando os dados).
4. **Fotos.** É o que mais falta num aviso de buraco na rua ou de pet perdido.
   Netlify Blobs guarda binário; precisa redimensionar no navegador antes de
   enviar.
5. **Aviso de novidade.** Push é trabalhoso no iPhone; um "3 avisos novos"
   ao abrir já resolve quase tudo.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.html` | casca da página e registro do service worker |
| `assets/dados.js` | tipos de aviso, prazos, CRUD, localStorage e conversa com `/api/mural` |
| `assets/ui.js` | topo, filtros, feed e ficha de publicação |
| `assets/app.css` | estilo, tema claro/escuro |
| `sw.js` | cache do esqueleto para abrir offline |
| `manifest.webmanifest` | dados da instalação na tela inicial |
| `../netlify/functions/mural.mjs` | backend opcional do mural compartilhado |
