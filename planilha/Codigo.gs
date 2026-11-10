/**
 * OZZ Energia – registro de propostas e termos (Google Apps Script)
 *
 * Cole este código em Extensões → Apps Script da planilha, salve, recarregue a
 * planilha e use o menu OZZ Gerador → Configurar planilha. Implante como App da Web
 * (Executar como: Eu · Quem pode acessar: Qualquer pessoa).
 *
 * Acesso:
 *  - Com o login com Google ligado (Client ID na aba Config, célula B3), só grava quem
 *    entrou com Google e está ativo na aba Usuários. O Google confirma a identidade.
 *  - Antes disso, vale o código de sincronização (OZZ-XXXX-XXXX-XXXX), colado em
 *    "configurar numeração" no portal.
 *
 * Segurança: o script só GRAVA linhas e devolve o próximo número.
 * Ele nunca devolve CPF, endereço ou outros dados de clientes.
 */

// O código de sincronização NÃO fica no código: ele é gerado pela planilha
// (menu OZZ Gerador) e guardado nas propriedades do script.

const ABA_PROPOSTAS = 'Propostas';
const ABA_TERMOS = 'Termos';
const ABA_CONFIG = 'Config';
const ABA_USUARIOS = 'Usuários';
const COLS_USUARIOS = ['E-mail', 'Nome', 'Perfil', 'Ativo'];

const COLS_PROPOSTAS = ['Data/hora', 'Nº proposta', 'Consultor', 'Cliente', 'CPF', 'CNPJ', 'UC', 'Distribuidora',
  'Endereço', 'CEP', 'Cidade', 'UF', 'Tensão', 'Consumo médio (kWh)', 'Plano', 'Desconto (%)',
  'Custo mensal', 'Custo anual', 'Economia mensal', 'Economia anual', 'Modelo'];
const COLS_TERMOS = ['Data/hora', 'Nº proposta', 'Consultor', 'Titular', 'CPF/CNPJ', 'UC', 'Distribuidora',
  'Classe', 'Endereço', 'Cidade/UF', 'Consumo médio (kWh)', 'Modalidade', 'Data de assinatura', 'Representante',
  'Celular', 'E-mail'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('OZZ Gerador')
    .addItem('Configurar planilha', 'configurar')
    .addItem('Mostrar código de sincronização', 'mostrarCodigo')
    .addItem('Gerar novo código (bloqueia o antigo)', 'novoCodigo')
    .addToUi();
}

/** Cria as abas, os cabeçalhos e o código de sincronização (pode rodar de novo sem perder nada). */
function configurar() {
  const ss = SpreadsheetApp.getActive();
  const cria = (nome, cols) => {
    const sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    if (sh.getLastRow() === 0) {
      sh.appendRow(cols);
      sh.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#3a0a8c').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
    return sh;
  };
  cria(ABA_PROPOSTAS, COLS_PROPOSTAS);
  completaCabecalho_(cria(ABA_TERMOS, COLS_TERMOS), COLS_TERMOS);
  const us = cria(ABA_USUARIOS, COLS_USUARIOS);
  if (us.getLastRow() === 1) {
    let dono = '';
    try { dono = Session.getEffectiveUser().getEmail(); } catch (e) {}
    if (dono) us.appendRow([dono, 'Administrador', 'admin', 'SIM']);
  }
  const cfg = ss.getSheetByName(ABA_CONFIG) || ss.insertSheet(ABA_CONFIG);
  if (cfg.getLastRow() === 0) {
    cfg.getRange('A1:B2').setValues([['Próximo número', 700001], ['Prefixo', '']]);
    cfg.getRange('A1:A2').setFontWeight('bold');
    cfg.getRange('C1').setValue('← altere aqui o próximo número da proposta');
  }
  if (!String(cfg.getRange('A3').getValue())) {
    cfg.getRange('A3').setValue('Google Client ID').setFontWeight('bold');
    cfg.getRange('C3').setValue('← cole aqui o Client ID para ligar o login com Google');
  }
  if (!String(cfg.getRange('A4').getValue())) {
    cfg.getRange('A4').setValue('Planilha de clientes').setFontWeight('bold');
    cfg.getRange('B4').setValue(PLANILHA_CLIENTES_PADRAO);
    cfg.getRange('C4').setValue('← ID ou link da planilha com a aba CLIENTES (busca do pós-venda). Vazio = não usa');
  }
  try { lerClientesExternos_(true); } catch (e) { Logger.log('Planilha de clientes: ' + e.message); } // pede a autorização de leitura já agora
  if (!codigo_()) gerarCodigo_();
  try {
    SpreadsheetApp.getUi().alert('Planilha configurada',
      'Código de sincronização: ' + codigo_() + '\n\n' +
      'Cole este código no portal, em "configurar numeração → Código de sincronização", ' +
      'em cada computador que vai gerar propostas e termos.', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { Logger.log('Código de sincronização: ' + codigo_()); } // rodando pelo editor
}

function mostrarCodigo() {
  SpreadsheetApp.getUi().alert('Código de sincronização', codigo_() || "Ainda não gerado. Use 'Configurar planilha'.", SpreadsheetApp.getUi().ButtonSet.OK);
}

function novoCodigo() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert('Gerar novo código?', 'Os computadores com o código antigo deixam de registrar até receberem o novo código.', ui.ButtonSet.OK_CANCEL);
  if (r !== ui.Button.OK) return;
  gerarCodigo_();
  ui.alert('Novo código de sincronização', codigo_(), ui.ButtonSet.OK);
}

function codigo_() { return PropertiesService.getScriptProperties().getProperty('CODIGO') || ''; }

function gerarCodigo_() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', partes = [];
  for (let p = 0; p < 3; p++) { let s = ''; for (let i = 0; i < 4; i++) s += letras.charAt(Math.floor(Math.random() * letras.length)); partes.push(s); }
  PropertiesService.getScriptProperties().setProperty('CODIGO', 'OZZ-' + partes.join('-'));
}

const VERSAO_SCRIPT = '5 (clientes da planilha de programação)';
// Planilha de controle (PROGRAMAÇÃO / CLIENTES): o pós-venda busca os clientes na aba CLIENTES dela. Pode trocar em Config!B4.
const PLANILHA_CLIENTES_PADRAO = '1aASwKbuJxs09pq3mh6pTDBq-O5usmIv-G3ZqMC5YfUQ';
const ABA_CLIENTES_EXT = 'CLIENTES';

/** Abrir o endereço /exec no navegador mostra a versão publicada — serve para conferir a implantação. */
function doGet() {
  let login = false;
  try { login = !!clientId_(); } catch (e) {}
  return json({ ok: true, app: 'OZZ Energia – registro', versao: VERSAO_SCRIPT, loginGoogleLigado: login });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, erro: 'pedido inválido' }); }
  let usuario;
  try { usuario = autenticar_(req); } catch (err) { return json({ ok: false, erro: String(err.message || err), auth: true }); }
  try {
    if (req.acao === 'ping') return json({ ok: true, planilha: SpreadsheetApp.getActive().getName() });
    if (req.acao === 'eu') return json({ ok: true, email: usuario.email, nome: usuario.nome, perfil: usuario.perfil });
    if (usuario.nome && req.dados) req.dados.consultor = usuario.nome; // o nome vem do login, não do navegador
    if (req.acao === 'proposta') return json(registrarProposta(req.dados || {}));
    if (req.acao === 'termo') return json(registrarTermo(req.dados || {}));
    if (req.acao === 'buscar') return json(buscarPorUC(req.uc));
    if (req.acao === 'clientes') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para buscar clientes', auth: true });
      return json(buscarClientes(req.q));
    }
    return json({ ok: false, erro: 'ação desconhecida' });
  } catch (err) {
    return json({ ok: false, erro: String(err && err.message || err) });
  }
}

/** Acrescenta no fim do cabeçalho as colunas novas que ainda não existem (não mexe nas antigas). */
function completaCabecalho_(sh, cols) {
  const atual = sh.getLastColumn();
  if (atual < cols.length) {
    sh.getRange(1, atual + 1, 1, cols.length - atual).setValues([cols.slice(atual)])
      .setFontWeight('bold').setBackground('#3a0a8c').setFontColor('#ffffff');
  }
}

/* ---------- Acesso ---------- */
function clientId_() {
  const cfg = SpreadsheetApp.getActive().getSheetByName(ABA_CONFIG);
  return cfg ? String(cfg.getRange('B3').getValue() || '').trim() : '';
}

/** Com o login ligado, exige um login Google válido de alguém ativo na aba Usuários; antes disso, o código de sincronização. */
function autenticar_(req) {
  const cid = clientId_();
  if (cid) {
    if (!req.idToken) throw new Error('faça login com Google para registrar');
    const email = verificarGoogle_(req.idToken, cid);
    const u = buscarUsuario_(email);
    if (!u) throw new Error('o e-mail ' + email + ' não tem acesso. Peça ao administrador para incluir na aba Usuários');
    return u;
  }
  const cod = codigo_();
  if (!cod) throw new Error('a planilha ainda não tem código de sincronização (menu OZZ Gerador → Configurar planilha)');
  if (String(req.token || '').trim().toUpperCase() !== cod) throw new Error('código de sincronização inválido');
  return { email: '', nome: '', perfil: '' };
}

/** Confere com o Google se o login é verdadeiro, recente e feito para este portal. */
function verificarGoogle_(idToken, cid) {
  const chave = 'tk_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  const cache = CacheService.getScriptCache();
  const emCache = cache.get(chave);
  if (emCache) return emCache;
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('login expirado ou inválido, entre novamente');
  const t = JSON.parse(r.getContentText());
  const agora = Math.floor(Date.now() / 1000);
  if (t.aud !== cid) throw new Error('login feito para outro aplicativo');
  if (t.iss !== 'accounts.google.com' && t.iss !== 'https://accounts.google.com') throw new Error('login inválido');
  if (String(t.email_verified) !== 'true') throw new Error('e-mail do Google não verificado');
  if (Number(t.exp) <= agora) throw new Error('login expirado, entre novamente');
  const email = String(t.email).toLowerCase();
  cache.put(chave, email, Math.max(1, Math.min(3000, Number(t.exp) - agora - 60)));
  return email;
}

function buscarUsuario_(email) {
  const sh = SpreadsheetApp.getActive().getSheetByName(ABA_USUARIOS);
  if (!sh || sh.getLastRow() < 2) return null;
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  for (let i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim().toLowerCase() === email && /^(sim|s|x|ativo|true)$/i.test(String(v[i][3]).trim())) {
      return { email: email, nome: String(v[i][1] || email).trim(), perfil: String(v[i][2] || 'consultor').trim() };
    }
  }
  return null;
}

/** Reserva o próximo número (sem repetir, mesmo com dois consultores ao mesmo tempo) e grava a proposta. */
function registrarProposta(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActive();
    const cfg = ss.getSheetByName(ABA_CONFIG);
    const sh = ss.getSheetByName(ABA_PROPOSTAS);
    if (!cfg || !sh) throw new Error('planilha não configurada (rode a função "configurar")');
    const prox = Number(cfg.getRange('B1').getValue()) || 1;
    const prefixo = String(cfg.getRange('B2').getValue() || '');
    const numero = prefixo + String(prox);
    cfg.getRange('B1').setValue(prox + 1);
    sh.appendRow([new Date(), numero, d.consultor, d.titular, d.cpf, d.cnpj, d.codigo_uc, d.distribuidora,
      d.endereco, d.cep, d.cidade, d.uf, d.tensao, d.consumo, d.plano, d.desconto,
      d.custo_mensal, d.custo_anual, d.economia_mensal, d.economia_anual, d.modelo].map(limpa));
    SpreadsheetApp.flush();
    return { ok: true, numero: numero };
  } finally {
    lock.releaseLock();
  }
}

function registrarTermo(d) {
  const sh = SpreadsheetApp.getActive().getSheetByName(ABA_TERMOS);
  if (!sh) throw new Error('planilha não configurada (rode a função "configurar")');
  completaCabecalho_(sh, COLS_TERMOS);
  sh.appendRow([new Date(), d.num_proposta, d.consultor, d.titular, d.documento, d.codigo_uc, d.distribuidora,
    d.classe_uc, d.endereco, d.cidade, d.consumo, d.modalidade, d.data_assinatura, d.rep_nome, d.celular, d.email].map(limpa));
  return { ok: true };
}

/** Devolve só o número, a data e o plano da proposta mais recente dessa UC (nenhum dado pessoal). */
function buscarPorUC(uc) {
  uc = String(uc || '').replace(/\D/g, '');
  if (uc.length < 5) return { ok: true, encontrada: false };
  const sh = SpreadsheetApp.getActive().getSheetByName(ABA_PROPOSTAS);
  if (!sh || sh.getLastRow() < 2) return { ok: true, encontrada: false };
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, 15).getValues();
  for (let i = v.length - 1; i >= 0; i--) {
    if (String(v[i][6]).replace(/\D/g, '') === uc) {
      const dt = v[i][0] instanceof Date ? Utilities.formatDate(v[i][0], 'America/Sao_Paulo', 'dd/MM/yyyy') : '';
      return { ok: true, encontrada: true, numero: String(v[i][1]), data: dt, plano: String(v[i][14]) };
    }
  }
  return { ok: true, encontrada: false };
}

/**
 * Busca clientes já registrados (termos e propostas) por nome ou UC, para preencher a visita de pós-venda.
 * Só responde a quem passou pelo login (com o login ligado) — devolve dados de contato, não CPF/CNPJ.
 */
function buscarClientes(q) {
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const termo = norm(q), dig = String(q || '').replace(/\D/g, '');
  if (termo.length < 3 && dig.length < 4) return { ok: true, clientes: [] };
  const ss = SpreadsheetApp.getActive(), porChave = {};
  const bate = (nome, uc) => (termo.length >= 3 && norm(nome).indexOf(termo) >= 0) || (dig.length >= 4 && String(uc).replace(/\D/g, '').indexOf(dig) >= 0);
  const data = v => v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'dd/MM/yyyy') : '';
  const junta = (k, o) => { const a = porChave[k] || (porChave[k] = {}); Object.keys(o).forEach(c => { if (o[c] && !a[c]) a[c] = o[c]; }); };
  // 1º a planilha de controle (aba CLIENTES): é a base oficial de clientes ativos, com telefone e vendedor
  let aviso = '';
  try {
    lerClientesExternos_().forEach(c => {
      if (!bate(c.titular, c.uc) && !(termo.length >= 3 && (norm(c.fantasia).indexOf(termo) >= 0 || norm(c.responsavel).indexOf(termo) >= 0))) return;
      junta(String(c.uc).replace(/\D/g, '') || norm(c.titular), c);
    });
  } catch (e) { aviso = 'planilha de clientes indisponível: ' + e.message; }
  // depois os termos (mais recentes no fim): têm telefone e o contrato fechado
  const st = ss.getSheetByName(ABA_TERMOS);
  if (st && st.getLastRow() > 1) {
    const v = st.getRange(2, 1, st.getLastRow() - 1, Math.max(16, st.getLastColumn())).getValues();
    for (let i = v.length - 1; i >= 0; i--) { const r = v[i];
      if (!bate(r[3], r[5])) continue;
      const cu = String(r[9] || '').split('/');
      junta(String(r[5]).replace(/\D/g, '') || norm(r[3]), { titular: r[3], uc: r[5], cidade: cu[0], uf: cu[1], distribuidora: r[6],
        consultor: r[2], celular: r[14], email: r[15], numero: String(r[1] || ''), data: data(r[0]), origem: 'Termo' }); }
  }
  const sp = ss.getSheetByName(ABA_PROPOSTAS);
  if (sp && sp.getLastRow() > 1) {
    const v = sp.getRange(2, 1, sp.getLastRow() - 1, 16).getValues();
    for (let i = v.length - 1; i >= 0; i--) { const r = v[i];
      if (!bate(r[3], r[6])) continue;
      junta(String(r[6]).replace(/\D/g, '') || norm(r[3]), { titular: r[3], uc: r[6], cidade: r[10], uf: r[11], distribuidora: r[7],
        consultor: r[2], plano: r[14], numero: String(r[1] || ''), data: data(r[0]), origem: 'Proposta' }); }
  }
  const lista = Object.keys(porChave).map(k => porChave[k]).slice(0, 8);
  if (aviso) return { ok: true, clientes: lista, aviso: aviso };
  return { ok: true, clientes: lista };
}

/**
 * Lê só as colunas necessárias da aba CLIENTES da planilha de controle (nunca CPF/CNPJ, endereço, logins ou valores).
 * Guarda 5 minutos em cache para a busca ficar rápida.
 */
function lerClientesExternos_(semCache) {
  const cfg = SpreadsheetApp.getActive().getSheetByName(ABA_CONFIG);
  let ref = cfg ? String(cfg.getRange('B4').getValue() || '').trim() : PLANILHA_CLIENTES_PADRAO;
  if (!ref) return [];
  const m = ref.match(/\/d\/([a-zA-Z0-9_-]{20,})/); if (m) ref = m[1];
  const cache = CacheService.getScriptCache(), chave = 'cli_ext_' + ref;
  if (!semCache) { const c = cache.get(chave); if (c) return JSON.parse(c); }
  const sh = SpreadsheetApp.openById(ref).getSheetByName(ABA_CLIENTES_EXT);
  if (!sh) throw new Error('aba ' + ABA_CLIENTES_EXT + ' não encontrada');
  const ult = sh.getLastRow(), cols = sh.getLastColumn();
  if (ult < 2) return [];
  const v = sh.getRange(1, 1, ult, cols).getValues();
  const up = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  // acha a linha do cabeçalho (a que tem CLIENTE e UC) e as colunas pelo nome, para não quebrar se mudarem de lugar
  let h = -1;
  for (let i = 0; i < Math.min(6, v.length); i++) { const r = v[i].map(up); if (r.indexOf('CLIENTE') >= 0 && r.indexOf('UC') >= 0) { h = i; break; } }
  if (h < 0) throw new Error('cabeçalho da aba ' + ABA_CLIENTES_EXT + ' não encontrado');
  const cab = v[h].map(up), col = n => cab.indexOf(n);
  const C = { nome: col('CLIENTE'), resp: col('RESPONSAVEL'), cont: col('CONTATO'), fan: col('FANTASIA'), cid: col('CIDADE'), uc: col('UC'), vend: col('VENDEDOR') };
  const out = [];
  for (let i = h + 1; i < v.length; i++) {
    const r = v[i], nome = String(r[C.nome] || '').replace(/\s+/g, ' ').trim();
    if (!nome) continue;
    const uc = typeof r[C.uc] === 'number' ? String(Math.round(r[C.uc])) : String(r[C.uc] || '').trim();
    const cont = C.cont >= 0 ? r[C.cont] : '';
    const cidTxt = C.cid >= 0 ? String(r[C.cid] || '').trim() : '';
    const cm = cidTxt.match(/^(.*?)\s*[-–\/]\s*([A-Za-z]{2})$/);
    out.push({
      titular: nome, responsavel: C.resp >= 0 ? String(r[C.resp] || '').trim() : '', fantasia: C.fan >= 0 ? String(r[C.fan] || '').trim() : '',
      uc: uc, cidade: cm ? cm[1] : cidTxt, uf: cm ? cm[2].toUpperCase() : '',
      celular: telefone_(cont), email: (String(cont).match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [''])[0],
      distribuidora: /^(30|40)\d{8}$/.test(uc) ? 'RGE' : '', consultor: C.vend >= 0 ? String(r[C.vend] || '').trim() : '',
      origem: 'Clientes'
    });
  }
  try { cache.put(chave, JSON.stringify(out), 300); } catch (e) {}
  return out;
}

/** Primeiro telefone de um campo de contato ("55 9116-5376 / email…", 55981440018 …) no formato (55) 98144-0018. */
function telefone_(x) {
  const t = typeof x === 'number' ? String(Math.round(x)) : String(x || '');
  const m = t.match(/\(?\d{2}\)?[\s.-]*9?\s?\d{4}[\s.-]?\d{4}/);
  if (!m) return '';
  const d = m[0].replace(/\D/g, '');
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return m[0].trim();
}

/** Evita que um texto começando com = + - @ vire fórmula na planilha. */
function limpa(x) {
  if (x === null || x === undefined) return '';
  if (x instanceof Date || typeof x === 'number') return x;
  const s = String(x);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
