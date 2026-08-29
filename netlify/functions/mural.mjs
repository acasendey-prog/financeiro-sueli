/* ============================================================================
   /api/mural — mural do bairro + espaço da associação

   Desligado por padrão. Só responde quando a variável de ambiente MURAL_ATIVO
   estiver como "1" na Netlify — assim o esqueleto não deixa um endpoint aberto
   de escrita no ar sem você decidir. Enquanto estiver desligado, o app cai
   sozinho no modo local (cada aparelho com o seu mural).

   Variáveis:
     MURAL_ATIVO=1                 liga o backend
     MURAL_CONVITE=<código>        opcional; só publica no mural quem mandar o
                                   mesmo código no cabeçalho x-convite
     MURAL_SENHA_ASSOCIACAO=<...>  código da diretoria; sem ele, ninguém publica
                                   no espaço da associação
   ========================================================================== */
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const LOJA = 'bairro';
const CHAVE = 'mural';
const LIMITE_AVISOS = 500;
const LIMITE_OFICIAIS = 300;

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: CABECALHOS });

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

/** Só deixa passar link de verdade — nada de javascript: chegando no href. */
const linkSeguro = (v) => (/^https?:\/\//i.test(String(v || '').trim()) ? texto(v, 400) : '');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function igualSeguro(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

/* A credencial da diretoria é derivada do próprio código, então trocar
   MURAL_SENHA_ASSOCIACAO invalida na hora tudo que já foi entregue. */
const credencialDe = (senha) => sha('associacao:' + senha);

async function ler(store) {
  const reg = await store.get(CHAVE, { type: 'json' }).catch(() => null);
  return {
    avisos: Array.isArray(reg?.avisos) ? reg.avisos : [],
    oficiais: Array.isArray(reg?.oficiais) ? reg.oficiais : []
  };
}

async function gravar(store, base) {
  await store.setJSON(CHAVE, {
    avisos: base.avisos.slice(0, LIMITE_AVISOS),
    oficiais: base.oficiais.slice(0, LIMITE_OFICIAIS),
    atualizadoEm: new Date().toISOString()
  });
}

export default async (req) => {
  if (process.env.MURAL_ATIVO !== '1') {
    return json({ erro: 'backend_desligado' }, 503);
  }

  const store = getStore(LOJA);

  if (req.method === 'GET') {
    return json(await ler(store));
  }

  if (req.method !== 'POST') return json({ erro: 'metodo_nao_suportado' }, 405);

  let corpo;
  try { corpo = await req.json(); } catch { return json({ erro: 'json_invalido' }, 400); }

  const { acao, dados, aparelho } = corpo || {};
  if (!acao || !dados) return json({ erro: 'pedido_incompleto' }, 400);

  /* ------------------------------------------------------ entrar na diretoria */
  const senhaAssoc = process.env.MURAL_SENHA_ASSOCIACAO;

  if (acao === 'entrar') {
    if (!senhaAssoc) return json({ erro: 'associacao_nao_configurada' }, 503);
    if (!igualSeguro(sha(texto(dados.codigo, 200)), sha(senhaAssoc))) {
      return json({ erro: 'codigo_invalido' }, 401);
    }
    return json({ credencial: credencialDe(senhaAssoc) });
  }

  const ehDiretoria = !!senhaAssoc &&
    igualSeguro(sha(req.headers.get('x-associacao') || ''), sha(credencialDe(senhaAssoc)));

  const convite = process.env.MURAL_CONVITE;
  if (convite && !ehDiretoria && (req.headers.get('x-convite') || '').trim() !== convite) {
    return json({ erro: 'convite_invalido' }, 401);
  }

  const base = await ler(store);

  /* --------------------------------------------------- espaço da associação */
  if (acao.endsWith('-oficial')) {
    if (!ehDiretoria) return json({ erro: 'nao_autorizado' }, 403);
    const alvo = base.oficiais.find((o) => o.id === dados.id);

    if (acao === 'publicar-oficial') {
      if (!texto(dados.titulo, 140)) return json({ erro: 'titulo_vazio' }, 400);
      const especie = ['aviso', 'informe', 'documento'].includes(dados.especie) ? dados.especie : 'aviso';
      base.oficiais.unshift({
        id: texto(dados.id, 40) || crypto.randomUUID(),
        especie,
        titulo: texto(dados.titulo, 140),
        texto: texto(dados.texto, 4000),
        categoria: texto(dados.categoria, 40),
        referencia: texto(dados.referencia, 10),
        link: linkSeguro(dados.link),
        arquivo: null,
        fixado: especie === 'aviso' && !!dados.fixado,
        assinatura: texto(dados.assinatura, 60) || 'Diretoria da associação',
        criadoEm: new Date().toISOString()
      });
    } else if (acao === 'fixar-oficial') {
      if (!alvo) return json({ erro: 'nao_encontrado' }, 404);
      alvo.fixado = alvo.especie === 'aviso' && !!dados.fixado;
    } else if (acao === 'remover-oficial') {
      if (!alvo) return json({ erro: 'nao_encontrado' }, 404);
      base.oficiais.splice(base.oficiais.indexOf(alvo), 1);
    } else {
      return json({ erro: 'acao_desconhecida' }, 400);
    }

    await gravar(store, base);
    return json({ ok: true, avisos: base.avisos, oficiais: base.oficiais });
  }

  /* ------------------------------------------------------- mural dos vizinhos */
  const alvo = base.avisos.find((a) => a.id === dados.id);

  // reabrir e apagar são de quem publicou; a diretoria pode mexer em
  // qualquer aviso, que é o mínimo de moderação
  const podeMexer = ehDiretoria || (alvo && alvo.autorAparelho && alvo.autorAparelho === aparelho);

  if (acao === 'publicar') {
    if (!texto(dados.titulo, 120)) return json({ erro: 'titulo_vazio' }, 400);
    base.avisos.unshift({
      id: texto(dados.id, 40) || crypto.randomUUID(),
      tipo: texto(dados.tipo, 20) || 'ocorrencia',
      titulo: texto(dados.titulo, 120),
      texto: texto(dados.texto, 1200),
      rua: texto(dados.rua, 80),
      autor: texto(dados.autor, 60) || 'Vizinho',
      contato: texto(dados.contato, 13).replace(/\D/g, ''),
      criadoEm: new Date().toISOString(),
      resolvido: false,
      resolvidoPor: null,
      confirmacoes: 0,
      inscritos: [],
      autorAparelho: texto(aparelho, 40)
    });
  } else if (acao === 'confirmar') {
    if (!alvo) return json({ erro: 'nao_encontrado' }, 404);
    alvo.confirmacoes = (alvo.confirmacoes || 0) + 1;
  } else if (acao === 'resolver') {
    if (!alvo) return json({ erro: 'nao_encontrado' }, 404);
    // encerrar qualquer vizinho pode; reabrir, só quem publicou e a diretoria
    if (!dados.resolvido && !podeMexer) return json({ erro: 'nao_autorizado' }, 403);
    alvo.resolvido = !!dados.resolvido;
    alvo.resolvidoPor = alvo.resolvido
      ? (['autor', 'diretoria', 'vizinho'].includes(dados.resolvidoPor) ? dados.resolvidoPor : 'vizinho')
      : null;
  } else if (acao === 'inscrever') {
    if (!alvo) return json({ erro: 'nao_encontrado' }, 404);
    const ap = texto(aparelho, 40);
    if (!ap) return json({ erro: 'aparelho_ausente' }, 400);
    const lista = Array.isArray(alvo.inscritos) ? alvo.inscritos : [];
    // um aparelho, um lugar na lista — reenviar não duplica
    alvo.inscritos = lista.filter((i) => i && i.ap !== ap);
    if (dados.entrando) {
      alvo.inscritos.push({ ap, nome: texto(dados.nome, 60) || 'Vizinho' });
    }
  } else if (acao === 'remover') {
    if (!alvo) return json({ erro: 'nao_encontrado' }, 404);
    if (!podeMexer) return json({ erro: 'nao_autorizado' }, 403);
    base.avisos.splice(base.avisos.indexOf(alvo), 1);
  } else {
    return json({ erro: 'acao_desconhecida' }, 400);
  }

  await gravar(store, base);
  return json({ ok: true, avisos: base.avisos, oficiais: base.oficiais });
};

export const config = { path: '/api/mural' };
