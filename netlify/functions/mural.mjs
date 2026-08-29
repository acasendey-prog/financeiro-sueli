/* ============================================================================
   /api/mural — mural compartilhado do bairro

   Desligado por padrão. Só responde quando a variável de ambiente MURAL_ATIVO
   estiver como "1" na Netlify — assim o esqueleto não deixa um endpoint aberto
   de escrita no ar sem você decidir. Enquanto estiver desligado, o app cai
   sozinho no modo local (cada aparelho com o seu mural).

   Variáveis:
     MURAL_ATIVO=1              liga o backend
     MURAL_CONVITE=<código>     opcional; se definido, só publica quem mandar
                                o mesmo código no cabeçalho x-convite
   ========================================================================== */
import { getStore } from '@netlify/blobs';

const LOJA = 'bairro';
const CHAVE = 'mural';
const LIMITE_AVISOS = 500;

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: CABECALHOS });

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

async function ler(store) {
  const reg = await store.get(CHAVE, { type: 'json' }).catch(() => null);
  return Array.isArray(reg?.avisos) ? reg.avisos : [];
}

async function gravar(store, avisos) {
  await store.setJSON(CHAVE, { avisos: avisos.slice(0, LIMITE_AVISOS), atualizadoEm: new Date().toISOString() });
}

export default async (req) => {
  if (process.env.MURAL_ATIVO !== '1') {
    return json({ erro: 'backend_desligado' }, 503);
  }

  const store = getStore(LOJA);

  if (req.method === 'GET') {
    return json({ avisos: await ler(store) });
  }

  if (req.method !== 'POST') return json({ erro: 'metodo_nao_suportado' }, 405);

  const convite = process.env.MURAL_CONVITE;
  if (convite && (req.headers.get('x-convite') || '').trim() !== convite) {
    return json({ erro: 'convite_invalido' }, 401);
  }

  let corpo;
  try { corpo = await req.json(); } catch { return json({ erro: 'json_invalido' }, 400); }

  const { acao, dados, aparelho } = corpo || {};
  if (!acao || !dados) return json({ erro: 'pedido_incompleto' }, 400);

  const avisos = await ler(store);
  const alvo = avisos.find((a) => a.id === dados.id);

  // só quem publicou (mesmo aparelho) pode resolver ou apagar
  const dono = alvo && alvo.autorAparelho && alvo.autorAparelho === aparelho;

  if (acao === 'publicar') {
    if (!texto(dados.titulo, 120)) return json({ erro: 'titulo_vazio' }, 400);
    avisos.unshift({
      id: texto(dados.id, 40) || crypto.randomUUID(),
      tipo: texto(dados.tipo, 20) || 'ocorrencia',
      titulo: texto(dados.titulo, 120),
      texto: texto(dados.texto, 1200),
      rua: texto(dados.rua, 80),
      autor: texto(dados.autor, 60) || 'Vizinho',
      contato: texto(dados.contato, 13).replace(/\D/g, ''),
      criadoEm: new Date().toISOString(),
      resolvido: false,
      confirmacoes: 0,
      autorAparelho: texto(aparelho, 40)
    });
  } else if (acao === 'confirmar') {
    if (!alvo) return json({ erro: 'nao_encontrado' }, 404);
    alvo.confirmacoes = (alvo.confirmacoes || 0) + 1;
  } else if (acao === 'resolver') {
    if (!alvo) return json({ erro: 'nao_encontrado' }, 404);
    if (!dono) return json({ erro: 'nao_autorizado' }, 403);
    alvo.resolvido = !!dados.resolvido;
  } else if (acao === 'remover') {
    if (!alvo) return json({ erro: 'nao_encontrado' }, 404);
    if (!dono) return json({ erro: 'nao_autorizado' }, 403);
    avisos.splice(avisos.indexOf(alvo), 1);
  } else {
    return json({ erro: 'acao_desconhecida' }, 400);
  }

  await gravar(store, avisos);
  return json({ ok: true, avisos });
};

export const config = { path: '/api/mural' };
