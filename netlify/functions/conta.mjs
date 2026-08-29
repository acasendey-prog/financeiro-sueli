/* ============================================================================
   /api/conta — cadastro e entrada dos moradores

   Fluxo: a pessoa se cadastra → recebe um e-mail com um link → clica → a conta
   fica confirmada → entra com e-mail e senha. A sessão dura 90 dias, para o
   morador não ter que digitar senha toda semana.

   Desligado por padrão, como o resto do backend. Variáveis:
     MURAL_ATIVO=1                liga o backend
     MURAL_SEGREDO=<texto longo>  assina as sessões; obrigatório
     MURAL_EMAIL_CHAVE=<api key>  chave da Resend, para enviar o e-mail
     MURAL_EMAIL_DE=<remetente>   ex.: Vizinhança <ola@seudominio.com.br>
     MURAL_APROVACAO=1            além do e-mail, exige liberação da diretoria

   Sem MURAL_EMAIL_CHAVE o cadastro ainda funciona, mas o link de confirmação
   só aparece no log da função — quem administra o site pega lá e entrega à
   pessoa. É proposital: devolver o link na resposta deixaria qualquer um
   confirmar a própria conta, e aí a confirmação não confirmaria nada.
   ========================================================================== */
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const LOJA = 'bairro';
const CHAVE = 'contas';
const DIAS_SESSAO = 90;
const LIMITE_CONTAS = 3000;

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CABECALHOS });
const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const digitos = (v, max) => String(v == null ? '' : v).replace(/\D/g, '').slice(0, max);

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function igualSeguro(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

/* ------------------------------------------------------------------- senha */
/* scrypt é lento de propósito: se o armazenamento vazar, testar senha por
   força bruta continua caro. */
function cifrarSenha(senha, sal) {
  const s = sal || crypto.randomBytes(16).toString('hex');
  return { sal: s, hash: crypto.scryptSync(senha, s, 64).toString('hex') };
}

function senhaConfere(senha, conta) {
  if (!conta.sal || !conta.hash) return false;
  return igualSeguro(cifrarSenha(senha, conta.sal).hash, conta.hash);
}

/* ------------------------------------------------------------------ sessão */
/* id.expiraEm.assinatura — o servidor não guarda sessão nenhuma; confere a
   assinatura. Trocar MURAL_SEGREDO derruba todo mundo de uma vez. */
function assinar(dados, segredo) {
  return crypto.createHmac('sha256', segredo).update(dados).digest('base64url');
}

function criarSessao(conta, segredo) {
  const corpo = conta.id + '.' + (Date.now() + DIAS_SESSAO * 86400000);
  return corpo + '.' + assinar(corpo, segredo);
}

function lerSessao(token, segredo) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) return null;
  const [id, expira, assinatura] = partes;
  if (!igualSeguro(assinatura, assinar(id + '.' + expira, segredo))) return null;
  if (Number(expira) < Date.now()) return null;
  return id;
}

/* ---------------------------------------------------------- armazenamento */
async function ler(store) {
  const reg = await store.get(CHAVE, { type: 'json' }).catch(() => null);
  return Array.isArray(reg?.contas) ? reg.contas : [];
}

const gravar = (store, contas) =>
  store.setJSON(CHAVE, { contas: contas.slice(0, LIMITE_CONTAS), atualizadoEm: new Date().toISOString() });

/* o que o navegador pode ver de uma conta — nunca o hash da senha */
const publica = (c) => ({
  id: c.id, nome: c.nome, email: c.email, celular: c.celular,
  endereco: c.endereco, papel: c.papel || 'morador',
  confirmado: !!c.confirmado, aprovado: !!c.aprovado
});

/* ------------------------------------------------------------------ e-mail */
async function enviarConfirmacao(conta, link) {
  const chave = process.env.MURAL_EMAIL_CHAVE;
  if (!chave) {
    // sem provedor configurado o link vai para o log da função, que só quem
    // administra o site lê
    console.log('[conta] confirmação de ' + conta.email + ': ' + link);
    return false;
  }

  const corpo =
    '<p>Oi, ' + conta.nome + '.</p>' +
    '<p>Alguém pediu uma conta no app do bairro com este e-mail. Para confirmar, ' +
    'clique no link abaixo:</p>' +
    '<p><a href="' + link + '">Confirmar meu cadastro</a></p>' +
    '<p>Se não foi você, é só ignorar — sem clicar, a conta não vale.</p>';

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MURAL_EMAIL_DE || 'Vizinhança <onboarding@resend.dev>',
      to: [conta.email],
      subject: 'Confirme seu cadastro no app do bairro',
      html: corpo
    })
  }).catch(() => null);

  if (!r || !r.ok) {
    console.log('[conta] envio falhou para ' + conta.email + '; link: ' + link);
    return false;
  }
  return true;
}

const paginaHtml = (titulo, msg, voltar) => new Response(
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>' + titulo + '</title><style>' +
  'body{font:16px/1.6 system-ui,sans-serif;background:#f6f6f4;color:#16181a;margin:0;' +
  'display:grid;place-items:center;min-height:100vh;padding:24px}' +
  '@media(prefers-color-scheme:dark){body{background:#131416;color:#ecedeb}}' +
  '.c{max-width:24rem;text-align:center}h1{font-size:20px;margin:0 0 10px}' +
  'a{display:inline-block;margin-top:18px;padding:12px 20px;border-radius:99px;' +
  'background:#16181a;color:#f6f6f4;text-decoration:none;font-weight:600}' +
  '@media(prefers-color-scheme:dark){a{background:#ecedeb;color:#131416}}' +
  '</style></head><body><div class="c"><h1>' + titulo + '</h1><p>' + msg + '</p>' +
  '<a href="' + voltar + '">Abrir o app do bairro</a></div></body></html>',
  { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
);

/* -------------------------------------------------------------------------- */
export default async (req) => {
  if (process.env.MURAL_ATIVO !== '1') return json({ erro: 'backend_desligado' }, 503);

  const segredo = process.env.MURAL_SEGREDO;
  if (!segredo || segredo.length < 16) {
    return json({ erro: 'servidor_sem_segredo' }, 500);
  }

  const store = getStore(LOJA);
  const url = new URL(req.url);
  const base = url.origin + '/bairro/';

  /* confirmação pelo link do e-mail — é um GET, porque vem de um clique */
  if (req.method === 'GET') {
    const token = url.searchParams.get('confirmar');
    if (!token) return json({ erro: 'sem_token' }, 400);

    const contas = await ler(store);
    const conta = contas.find((c) => c.tokenConfirmacao && igualSeguro(c.tokenConfirmacao, token));
    if (!conta) {
      return paginaHtml('Link inválido',
        'Este link já foi usado ou expirou. Peça um novo cadastro no app.', base);
    }

    conta.confirmado = true;
    conta.confirmadoEm = new Date().toISOString();
    conta.tokenConfirmacao = null;          // um link, um uso
    await gravar(store, contas);

    return conta.aprovado
      ? paginaHtml('E-mail confirmado', 'Pronto. Agora é só entrar com seu e-mail e sua senha.', base)
      : paginaHtml('E-mail confirmado',
          'Falta a diretoria da associação liberar seu acesso. Você será avisado.', base);
  }

  if (req.method !== 'POST') return json({ erro: 'metodo_nao_suportado' }, 405);

  let corpo;
  try { corpo = await req.json(); } catch { return json({ erro: 'json_invalido' }, 400); }
  const { acao, dados } = corpo || {};

  const contas = await ler(store);
  const acharPorEmail = (email) => contas.find((c) => c.email === email);

  /* -------------------------------------------------------------- cadastrar */
  if (acao === 'cadastrar') {
    const d = dados || {};
    const nome = texto(d.nome, 60);
    const email = texto(d.email, 120).toLowerCase();
    const celular = digitos(d.celular, 11);
    const rua = texto(d.rua, 100);
    const numero = texto(d.numero, 12);
    const senha = String(d.senha || '');

    if (nome.length < 2) return json({ erro: 'nome_curto' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ erro: 'email_invalido' }, 400);
    if (celular.length < 10) return json({ erro: 'celular_invalido' }, 400);
    if (!rua || !numero) return json({ erro: 'endereco_incompleto' }, 400);
    if (senha.length < 8) return json({ erro: 'senha_curta' }, 400);
    if (!d.consentimento) return json({ erro: 'sem_consentimento' }, 400);

    // não conta quem já existe: dizer "este e-mail já tem conta" revelaria
    // quem mora no bairro para qualquer um que ficasse chutando endereços
    const existente = acharPorEmail(email);
    if (existente) {
      if (!existente.confirmado) {
        existente.tokenConfirmacao = b64url(crypto.randomBytes(32));
        await gravar(store, contas);
        await enviarConfirmacao(existente, url.origin + '/api/conta?confirmar=' + existente.tokenConfirmacao);
      }
      return json({ ok: true, precisaConfirmar: true });
    }

    const { sal, hash } = cifrarSenha(senha);
    const conta = {
      id: crypto.randomUUID(),
      nome, email, celular,
      endereco: { rua, numero, complemento: texto(d.complemento, 60) },
      sal, hash,
      confirmado: false,
      aprovado: process.env.MURAL_APROVACAO !== '1',
      papel: 'morador',
      tokenConfirmacao: b64url(crypto.randomBytes(32)),
      criadoEm: new Date().toISOString()
    };
    contas.unshift(conta);
    await gravar(store, contas);

    const enviado = await enviarConfirmacao(conta, url.origin + '/api/conta?confirmar=' + conta.tokenConfirmacao);
    return json({ ok: true, precisaConfirmar: true, emailEnviado: enviado });
  }

  /* ------------------------------------------------------------------ entrar */
  if (acao === 'entrar') {
    const email = texto((dados || {}).email, 120).toLowerCase();
    const conta = acharPorEmail(email);
    const senha = String((dados || {}).senha || '');

    // mesma resposta para e-mail inexistente e senha errada
    if (!conta || !senhaConfere(senha, conta)) return json({ erro: 'credencial_invalida' }, 401);
    if (!conta.confirmado) return json({ erro: 'nao_confirmado' }, 403);
    if (!conta.aprovado) return json({ erro: 'nao_aprovado' }, 403);

    return json({ sessao: criarSessao(conta, segredo), perfil: publica(conta) });
  }

  /* --------------------------------------------------------------------- eu */
  if (acao === 'eu') {
    const id = lerSessao(req.headers.get('x-sessao'), segredo);
    const conta = id && contas.find((c) => c.id === id);
    if (!conta || !conta.confirmado || !conta.aprovado) return json({ erro: 'sessao_invalida' }, 401);
    return json({ perfil: publica(conta) });
  }

  /* ------------------------------------------- diretoria: liberar e listar */
  if (acao === 'pendentes' || acao === 'aprovar') {
    const senhaAssoc = process.env.MURAL_SENHA_ASSOCIACAO;
    const credencial = crypto.createHash('sha256').update('associacao:' + senhaAssoc).digest('hex');
    const ehDiretoria = !!senhaAssoc &&
      igualSeguro(req.headers.get('x-associacao') || '', credencial);
    if (!ehDiretoria) return json({ erro: 'nao_autorizado' }, 403);

    if (acao === 'pendentes') {
      return json({ contas: contas.filter((c) => c.confirmado && !c.aprovado).map(publica) });
    }

    const alvo = contas.find((c) => c.id === texto((dados || {}).id, 40));
    if (!alvo) return json({ erro: 'nao_encontrado' }, 404);
    alvo.aprovado = !!(dados || {}).aprovado;
    await gravar(store, contas);
    return json({ ok: true, perfil: publica(alvo) });
  }

  return json({ erro: 'acao_desconhecida' }, 400);
};

export const config = { path: '/api/conta' };

/* Exportadas para teste. A criptografia é a parte que não dá para conferir
   clicando na tela, então precisa ser exercitável de fora. */
export const _interno = { cifrarSenha, senhaConfere, criarSessao, lerSessao, assinar };
