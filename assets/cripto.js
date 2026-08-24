/* ============================================================================
   cripto.js — proteção por senha da base publicada
   AES-256-GCM com chave derivada por PBKDF2-SHA256 (250.000 iterações).
   O arquivo que vai para a internet contém apenas texto cifrado.
   ========================================================================== */
(function (global) {
  'use strict';
  var ITER = 250000;

  function b64e(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function b64d(str) {
    var s = atob(str), b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  function disponivel() {
    return !!(global.crypto && global.crypto.subtle && global.isSecureContext !== false);
  }

  function derivar(senha, salt, iter) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  /** objeto -> pacote cifrado */
  function fechar(obj, senha) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return derivar(senha, salt, ITER).then(function (k) {
      var dados = new TextEncoder().encode(JSON.stringify(obj));
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, dados);
    }).then(function (ct) {
      return { v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64e(salt), iv: b64e(iv), ct: b64e(ct) };
    });
  }

  /** pacote cifrado -> objeto (rejeita se a senha estiver errada) */
  function abrir(pac, senha) {
    return derivar(senha, b64d(pac.salt), pac.iter || ITER).then(function (k) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(pac.iv) }, k, b64d(pac.ct));
    }).then(function (buf) {
      return JSON.parse(new TextDecoder().decode(buf));
    }).catch(function () {
      throw new Error('Senha incorreta.');
    });
  }

  /* ---------------------------------------------------------- sincronização
     Para que o mesmo pacote abra em qualquer aparelho, a chave de sincronismo
     usa um sal fixo do aplicativo — assim a mesma senha gera sempre a mesma
     chave. A chave fica guardada como CryptoKey NÃO EXPORTÁVEL: mesmo quem
     inspecionar o navegador não consegue extrair o material dela.
  ------------------------------------------------------------------------- */
  var SAL_APP = new Uint8Array([
    0x9d, 0x14, 0x2b, 0x7e, 0xc3, 0x58, 0xa1, 0x06,
    0x4f, 0xd2, 0x39, 0x8b, 0x71, 0xe5, 0x0c, 0xa7
  ]);

  function derivarChaveSync(senha) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: SAL_APP, iterations: ITER, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  /** token de acesso ao servidor — derivado da senha, mas não a revela */
  function tokenAuth(senha) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode('fin-auth::' + senha))
      .then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      });
  }

  function cifrarChave(key, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key,
      new TextEncoder().encode(JSON.stringify(obj))
    ).then(function (ct) {
      return { v: 1, alg: 'AES-GCM', iv: b64e(iv), ct: b64e(ct) };
    });
  }
  function decifrarChave(key, pac) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(pac.iv) }, key, b64d(pac.ct))
      .then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); })
      .catch(function () { throw new Error('Não foi possível abrir os dados do servidor (senha diferente?).'); });
  }

  global.Cripto = {
    fechar: fechar, abrir: abrir, disponivel: disponivel,
    derivarChaveSync: derivarChaveSync, tokenAuth: tokenAuth,
    cifrarChave: cifrarChave, decifrarChave: decifrarChave
  };
})(window);
