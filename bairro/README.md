# Vizinhança — mural do bairro

Esqueleto de um PWA para os moradores do bairro. Mesma receita do controle
financeiro: HTML + CSS + JavaScript puro, sem build, sem framework, hospedado
de graça na Netlify e instalável na tela inicial do celular.

Fica em `/bairro/` do mesmo site — não mexe em nada do app financeiro.

São dois espaços, com regras de escrita diferentes:

| Aba | Quem publica | Para quê |
|---|---|---|
| **Mural** | qualquer vizinho | ocorrência, serviço, evento, achados e perdidos, doação |
| **Associação** | só a diretoria, com código | avisos, informes e documentos oficiais |

## O que já funciona

### Mural

- **Feed único** com cinco tipos de aviso: ocorrência, serviço, evento,
  achados e perdidos, doação/troca
- **Filtro por tipo** e **busca** por título, texto, rua ou pessoa
- **Publicar aviso** (título, detalhes, rua, nome e WhatsApp opcional)
- **"Também estou vendo isso"** — contador de confirmações, uma por aparelho
- **Encerrar o aviso**, com o verbo certo para cada tipo: ocorrência se
  *resolve*, serviço se *encerra*, perdido é *encontrado*, doação é *doada*.
  Qualquer vizinho pode encerrar — quem viu a água voltar sabe disso antes de
  quem publicou — e o selo diz quem encerrou. Reabrir e apagar ficam com quem
  publicou e com a diretoria
- **"Eu vou"** nos eventos, com a lista de quem vai. Num mutirão, saber
  quantos vêm muda o que o organizador leva
- **"Pedir orçamento"** nos serviços: abre o WhatsApp com o pedido já escrito
- **Validade automática**: ocorrência sai do mural em 7 dias, serviço em 60,
  o resto em 30. Vencidos saem do feed e viram só uma contagem
- **Contato por WhatsApp** via `wa.me`, sem chat interno
- **Instalável (PWA)** e abre offline com o que já foi carregado
- **Fundo claro, escuro ou automático** — botão no canto do cabeçalho, três
  estados em roda. Sem escolha, segue o aparelho; com escolha, ela vale acima
  do aparelho e sobrevive ao recarregar

### Associação

Canal só de leitura para o morador comum, marcado por um fio verde à esquerda
do item, para não se confundir com recado de vizinho.

- **Avisos** — convocação de assembleia, mudança de coleta, obra na rua
- **Informes** — texto mais longo, prestação de contas em palavras, balanço
  do semestre
- **Documentos** — ata, balancete, convenção, edital, ofício. Cada um com
  categoria, data do documento e link do arquivo. A lista ordena pela data do
  documento, não pela de publicação, e documento nunca vence
- **Fixar no mural** — um aviso marcado como fixado aparece também no topo do
  mural e conta na bolinha da aba, para quem só abre o feed não perder
- **Entrar como diretoria** — um código só, o mesmo para todos da diretoria.
  O código não fica guardado no aparelho: o que fica é a credencial devolvida
  pelo servidor, que ele sabe invalidar

## O layout

Três regras decidem tudo o que aparece na tela.

**1. Lista, não cartão.** Um feed de avisos é conteúdo uniforme que a pessoa
varre de cima a baixo. Cartão serve para descobrir coisa variada; para varrer,
ele só acrescenta borda, sombra e canto arredondado em volta de cada item.
Aqui os itens são separados por um fio de 1px e nada mais.

**2. Cada cor tem um trabalho só.** Tinta é texto e ação principal, verde é a
associação, terracota é ocorrência. O tipo do aviso é dito por escrito no
rótulo, não por cor — seis matizes competindo é o que fazia a tela virar
colcha de retalhos, e as diretrizes de acessibilidade ainda desaconselham
justamente os pares azul-laranja e vermelho-verde que estavam ali.

**3. Texto grande e contraste alto.** O bairro tem morador de 70 anos. Corpo a
16px (piso recomendado, não teto), títulos a 17,5px, e nenhuma cor de texto
abaixo de 4.5:1 sobre o fundo — verificado nos dois temas.

Tipografia: **Public Sans** (desenhada para interface de serviço público) no
texto e **IBM Plex Mono** nos rótulos, datas e categorias, onde a largura fixa
alinha os números e dá cara de registro. Sem emoji: os únicos ícones são dois
traços em SVG, a lupa da busca e o mais do botão publicar.

A ação de publicar fica no cabeçalho, não num botão flutuante — flutuante
sempre acaba tapando o texto de quem está lendo.

O fundo tem **três** estados, não dois: `auto`, `claro` e `escuro`. Só dois
seria pior do que parece — quem prefere fundo claro num celular configurado no
escuro ficaria sem saída. A escolha vai para o `localStorage` e é aplicada por
um script no `<head>`, antes da primeira pintura; sem isso, quem escolheu
escuro veria um lampejo branco a cada abertura. A cor da barra do navegador
(`theme-color`) acompanha, para o app não ficar com a moldura de um tema e o
conteúdo de outro.

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
| `MURAL_CONVITE` | um código qualquer | opcional: só publica no mural quem tiver o código |
| `MURAL_SENHA_ASSOCIACAO` | o código da diretoria | sem ela ninguém publica no espaço da associação |

No modo demonstração não existe servidor para conferir nada, então o código da
diretoria é fixo: **`associacao`**. Assim dá para ver a área por dentro sem
montar backend. Com `MURAL_ATIVO=1`, quem manda é `MURAL_SENHA_ASSOCIACAO`.

Trocar `MURAL_SENHA_ASSOCIACAO` derruba na hora todo mundo que já tinha
entrado — é assim que se tira o acesso de quem saiu da diretoria.

> `MURAL_CONVITE` ainda não é enviado pelo app — falta a tela que pede o código
> e o guarda. Enquanto não existir, deixe a variável em branco ou trate o mural
> como público.

## O que falta antes de soltar para os vizinhos

Em ordem de importância:

1. **Anexar arquivo de verdade.** Hoje documento é um link para Drive, Dropbox
   ou onde o PDF já estiver. Subir o arquivo pelo app precisa de upload
   (Netlify Blobs guarda binário) e de uma rota que devolva o arquivo.
2. **Moderação.** No servidor a diretoria já pode apagar qualquer aviso do
   mural; no app ainda não tem esse botão. Falta também um jeito de denunciar.
   Para o vizinho comum, a "posse" do aviso é o aparelho — trocou de celular,
   perdeu o controle do que publicou.
3. **Controle de quem entra.** Sem isso, qualquer pessoa com o link publica.
   O caminho mais simples é o código de convite distribuído no grupo do bairro.
4. **Anti-abuso no backend.** Limite de publicações por aparelho por hora e
   uma confirmação por aparelho validada no servidor (hoje isso é só no
   navegador, dá para burlar limpando os dados).
5. **Fotos.** É o que mais falta num aviso de buraco na rua ou de pet perdido.
   Netlify Blobs guarda binário; precisa redimensionar no navegador antes de
   enviar.
6. **Aviso de novidade.** Push é trabalhoso no iPhone; um "3 avisos novos"
   ao abrir já resolve quase tudo.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.html` | casca da página e registro do service worker |
| `assets/dados.js` | tipos de aviso, prazos, CRUD dos dois espaços, acesso da diretoria, localStorage e conversa com `/api/mural` |
| `assets/ui.js` | abas, filtros, feed, área da associação e as fichas de publicação |
| `assets/app.css` | estilo, tema claro/escuro |
| `sw.js` | cache do esqueleto para abrir offline |
| `manifest.webmanifest` | dados da instalação na tela inicial |
| `../netlify/functions/mural.mjs` | backend opcional: mural compartilhado e credencial da diretoria |
