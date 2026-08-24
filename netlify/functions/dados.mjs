/* ============================================================================
   /api/dados — guarda a base do controle financeiro
   O corpo recebido já vem cifrado pelo navegador (AES-256-GCM). O servidor
   armazena um blob opaco: nem a Netlify nem eu conseguimos ler o conteúdo.
   ========================================================================== */
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const CHAVE = 'base';
const LOJA = 'financeiro';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function igualSeguro(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

const CORS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, PUT, OPTIONS'
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: CORS });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const esperado = process.env.AUTH_TOKEN_SHA;
  if (!esperado) return json({ erro: 'servidor sem AUTH_TOKEN_SHA configurado' }, 500);

  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth || !igualSeguro(sha(auth), esperado)) {
    return json({ erro: 'nao_autorizado' }, 401);
  }

  const store = getStore(LOJA);

  if (req.method === 'GET') {
    const reg = await store.get(CHAVE, { type: 'json' }).catch(() => null);
    if (!reg) return json({ vazio: true, rev: 0 });
    return json(reg);
  }

  if (req.method === 'PUT') {
    let corpo;
    try { corpo = await req.json(); } catch { return json({ erro: 'json_invalido' }, 400); }

    const { pacote, revEsperada, dispositivo } = corpo || {};
    if (!pacote || !pacote.ct) return json({ erro: 'pacote_ausente' }, 400);

    const atual = await store.get(CHAVE, { type: 'json' }).catch(() => null);
    const revAtual = atual ? (atual.rev || 0) : 0;

    // controle otimista: só grava se ninguém publicou por cima
    if (revEsperada !== undefined && revEsperada !== null && revEsperada !== revAtual) {
      return json({ erro: 'conflito', rev: revAtual, atualizadoEm: atual?.atualizadoEm, servidor: atual }, 409);
    }

    const novo = {
      rev: revAtual + 1,
      atualizadoEm: new Date().toISOString(),
      dispositivo: String(dispositivo || '').slice(0, 60),
      pacote
    };
    await store.setJSON(CHAVE, novo);
    return json({ ok: true, rev: novo.rev, atualizadoEm: novo.atualizadoEm });
  }

  return json({ erro: 'metodo_nao_suportado' }, 405);
};

export const config = { path: '/api/dados' };
