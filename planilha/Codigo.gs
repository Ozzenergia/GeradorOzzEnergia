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

/* Perfis (coluna Perfil da aba Usuários) e as áreas do portal que cada um usa.
   ger = Geradores (propostas e termos) · pos = Pós-venda. O TI ainda pode "ver como" outro perfil no portal. */
const PERFIS_ = {
  ti:             { nome: 'TI',             areas: ['ger', 'pos', 'ana', 'cli'] },
  admin:          { nome: 'Admin',          areas: ['ger', 'pos', 'ana', 'cli'] },
  administrativo: { nome: 'Administrativo', areas: ['ger', 'cli'] },
  vendedor:       { nome: 'Vendedor',       areas: ['ger', 'pos', 'cli'] }
};
const AREA_DA_ACAO_ = { proposta: 'ger', termo: 'ger', buscar: 'ger', clientes: 'pos', programacao: 'ana', fluxo: 'ana',
  cli_listar: 'cli', cli_salvar: 'cli', cli_excluir: 'cli', cli_ficha: 'cli' };
const NOME_AREA_ = { ger: 'Geradores', pos: 'Pós-venda', ana: 'Análise', cli: 'Clientes' };

/* Cadastro de clientes do portal (aba "Clientes" desta planilha; não é a aba CLIENTES da planilha de controle) */
const ABA_CADASTRO = 'Clientes';
const COLS_CADASTRO = ['ID', 'Cadastrado em', 'Cadastrado por', 'Nome', 'CPF/CNPJ', 'Telefone', 'E-mail', 'Endereço', 'Cidade', 'UF', 'CEP',
  'UC', 'Distribuidora', 'Plano', 'Vendedor', 'Atualizado em', 'Atualizado por'];
const CAMPOS_CADASTRO = ['nome', 'doc', 'telefone', 'email', 'endereco', 'cidade', 'uf', 'cep', 'uc', 'distribuidora', 'plano', 'vendedor'];   // colunas D a O
const ABA_PROGRAMACAO_EXT = 'PROGRAMAÇÃO';   // aba de contas a pagar da planilha de controle (a mesma de Config!B4)

/** "Administrador", "T.I.", "Vendedores", "consultor"… → ti | admin | administrativo | vendedor. Vazio ou desconhecido = vendedor. */
function perfil_(p) {
  const t = String(p || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (/^ti$|^ti |^tecnologia/.test(t)) return 'ti';
  if (/^administrativ/.test(t)) return 'administrativo';
  if (/^admin/.test(t)) return 'admin';
  return 'vendedor';
}

const COLS_PROPOSTAS = ['Data/hora', 'Nº proposta', 'Consultor', 'Cliente', 'CPF', 'CNPJ', 'UC', 'Distribuidora',
  'Endereço', 'CEP', 'Cidade', 'UF', 'Tensão', 'Consumo médio (kWh)', 'Plano', 'Desconto (%)',
  'Custo mensal', 'Custo anual', 'Economia mensal', 'Economia anual', 'Modelo'];
const COLS_TERMOS = ['Data/hora', 'Nº proposta', 'Consultor', 'Titular', 'CPF/CNPJ', 'UC', 'Distribuidora',
  'Classe', 'Endereço', 'Cidade/UF', 'Consumo médio (kWh)', 'Modalidade', 'Data de assinatura', 'Representante',
  'Celular', 'E-mail'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('OZZ Gerador')
    .addItem('Configurar planilha', 'configurar')
    .addItem('Testar planilha de clientes (pós-venda)', 'testarClientes')
    .addItem('Mostrar código de sincronização', 'mostrarCodigo')
    .addItem('Gerar novo código (bloqueia o antigo)', 'novoCodigo')
    .addToUi();
}

/** Mostra quantos clientes o portal consegue ler da planilha de controle, ou o erro. */
function testarClientes() {
  let msg;
  try {
    const l = lerClientesExternos_(true);
    msg = l.length ? '✅ Li ' + l.length + ' clientes da aba ' + ABA_CLIENTES_EXT + '.\n\nExemplo: ' + l[0].titular + ' — UC ' + l[0].uc + ' — ' + (l[0].celular || 'sem telefone')
      : '⚠️ Nenhum cliente lido. Confira a célula B4 da aba Config (ID ou link da planilha com a aba ' + ABA_CLIENTES_EXT + ').';
  } catch (e) { msg = '❌ Não consegui ler a planilha de clientes:\n' + e.message + '\n\nConfira se a sua conta tem acesso a ela e se o link em Config!B4 está certo.'; }
  try { SpreadsheetApp.getUi().alert('Planilha de clientes', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(msg); }
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
  abaCadastro_();
  completaCabecalho_(cria(ABA_TERMOS, COLS_TERMOS), COLS_TERMOS);
  const us = cria(ABA_USUARIOS, COLS_USUARIOS);
  us.getRange(2, 3, Math.max(us.getMaxRows() - 1, 1), 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.keys(PERFIS_), true).setAllowInvalid(true)
    .setHelpText('ti = tudo + ver como outro perfil · admin = tudo · administrativo = só geradores · vendedor = geradores e pós-venda').build());
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
  // deixa a Análise rápida: lê a PROGRAMAÇÃO agora e de 10 em 10 minutos
  try {
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'atualizarCacheProgramacao'))
      ScriptApp.newTrigger('atualizarCacheProgramacao').timeBased().everyMinutes(10).create();
    atualizarCacheProgramacao();
  } catch (e) { Logger.log('Acionador da programação: ' + e.message); }
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

const VERSAO_SCRIPT = '11 (ficha do cliente)';
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
    const area = AREA_DA_ACAO_[req.acao];
    if (usuario.email && area && PERFIS_[usuario.perfil].areas.indexOf(area) < 0)
      return json({ ok: false, erro: 'o perfil ' + PERFIS_[usuario.perfil].nome + ' não tem acesso a ' + NOME_AREA_[area], perfil: true });
    if (usuario.nome && req.dados) req.dados.consultor = usuario.nome; // o nome vem do login, não do navegador
    if (req.acao === 'proposta') return json(registrarProposta(req.dados || {}));
    if (req.acao === 'termo') {
      const r = registrarTermo(req.dados || {});
      // o cliente do termo entra sozinho no cadastro (nunca impede o registro do termo)
      try { r.cadastro = cadastroDoTermo_(req.dados || {}, usuario); } catch (e) { console.error('Cadastro pelo termo: ' + e.message); r.cadastro = 'erro'; }
      return json(r);
    }
    if (req.acao === 'buscar') return json(buscarPorUC(req.uc));
    if (req.acao === 'programacao') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para ver a análise', auth: true });
      return json(programacaoComCache_(!!req.forcar));
    }
    if (/^cli_/.test(req.acao)) {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para usar o cadastro de clientes', auth: true });
      if (req.acao === 'cli_listar') return json(cadastroListar());
      if (req.acao === 'cli_salvar') return json(cadastroSalvar(req.dados || {}, usuario));
      if (req.acao === 'cli_excluir') return json(cadastroExcluir(req.id, usuario));
      if (req.acao === 'cli_ficha') return json(cadastroFicha(req.id, usuario));
    }
    if (req.acao === 'fluxo') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para ver a análise', auth: true });
      return json(fluxoComCache_(!!req.forcar));
    }
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
      return { email: email, nome: String(v[i][1] || email).trim(), perfil: perfil_(v[i][2]) };
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
      if (!bate(c.titular, c.uc) && !bate('', c.uc_antiga) && !(termo.length >= 3 && (norm(c.fantasia).indexOf(termo) >= 0 || norm(c.responsavel).indexOf(termo) >= 0))) return;
      junta(String(c.uc).replace(/\D/g, '') || norm(c.titular), c);
    });
  } catch (e) { aviso = 'não consegui ler a planilha de clientes: ' + e.message; console.error(aviso); }
  // o cadastro de clientes do próprio portal (aba Clientes)
  try {
    const shC = ss.getSheetByName(ABA_CADASTRO);
    if (shC) cadastroLinhas_(shC).forEach(r => {
      if (!String(r[0]).trim() || !bate(r[3], r[11])) return;
      junta(String(r[11]).replace(/\D/g, '') || norm(r[3]), { titular: r[3], uc: r[11], cidade: r[8], uf: r[9], distribuidora: r[12],
        consultor: r[14], celular: r[5], email: r[6], plano: r[13], origem: 'Cadastro' });
    });
  } catch (e) { console.error('Cadastro: ' + e.message); }
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
  let ref = PLANILHA_CLIENTES_PADRAO;
  if (cfg && String(cfg.getRange('A4').getValue() || '').trim()) ref = String(cfg.getRange('B4').getValue() || '').trim(); // linha criada: vale o que estiver lá
  if (!ref) return [];
  const m = ref.match(/\/d\/([a-zA-Z0-9_-]{20,})/); if (m) ref = m[1];
  const cache = CacheService.getScriptCache(), chave = 'cli_ext_' + ref;
  if (!semCache) { const c = lerCacheGrande_(chave); if (c) return c; }
  const sh = SpreadsheetApp.openById(ref).getSheetByName(ABA_CLIENTES_EXT);
  if (!sh) throw new Error('aba ' + ABA_CLIENTES_EXT + ' não encontrada');
  const ult = sh.getLastRow(), cols = sh.getLastColumn();
  if (ult < 2) return [];
  const v = sh.getRange(1, 1, ult, cols).getValues();
  const up = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const ehCliente = t => t === 'CLIENTE' || t === 'CLIENTES' || t === 'NOME' || t === 'NOME DO CLIENTE' || t === 'RAZAO SOCIAL';
  const ehUC = t => t === 'UC' || /^(N|NO|NUMERO|COD|CODIGO)( DA| DO)? (UC|INSTALACAO)$/.test(t) || /^UC /.test(t) || /^(NOVA|ANTIGA|NOVO|ANTIGO) UC$/.test(t);
  // acha a linha do cabeçalho (a que tem CLIENTE e UC) e as colunas pelo nome, para não quebrar se mudarem de lugar
  // pode haver mais de uma linha parecida com cabeçalho: fica com a que tem mais colunas conhecidas
  const CONHECIDAS = ['RESPONSAVEL', 'CONTATO', 'FANTASIA', 'CIDADE', 'VENDEDOR', 'ENDERECO'];
  let h = -1, melhor = -1;
  for (let i = 0; i < Math.min(30, v.length); i++) {
    const r = v[i].map(up);
    if (!(r.some(ehCliente) && r.some(ehUC))) continue;
    const pontos = CONHECIDAS.filter(n => r.indexOf(n) >= 0).length;
    if (pontos > melhor) { melhor = pontos; h = i; }
  }
  if (h < 0) {
    const vistos = [];
    for (let i = 0; i < Math.min(4, v.length); i++) {
      const t = v[i].map(x => String(x || '').trim()).filter(x => x && x.length <= 25 && !/\d{3}/.test(x)).slice(0, 8);
      if (t.length) vistos.push('linha ' + (i + 1) + ': ' + t.join(' | '));
    }
    throw new Error('não achei a linha com as colunas CLIENTE e UC na aba ' + ABA_CLIENTES_EXT +
      ' (' + v.length + ' linhas × ' + cols + ' colunas). ' + (vistos.length ? 'Primeiras linhas: ' + vistos.join(' ; ') : 'As primeiras linhas estão vazias.'));
  }
  const cab = v[h].map(up);
  const col = (n, f) => { let i = cab.indexOf(n); if (i < 0 && f) i = cab.findIndex(f); return i; };
  const C = { nome: col('CLIENTE', ehCliente), resp: col('RESPONSAVEL', t => /^RESPONSAVEL|^SOCIO/.test(t)), cont: col('CONTATO', t => /^(CONTATO|TELEFONE|CELULAR|FONE|WHATSAPP)/.test(t)),
    fan: col('FANTASIA', t => /FANTASIA/.test(t)), cid: col('CIDADE', t => /^CIDADE/.test(t)),
    uc: col('NOVA UC', t => /^NOV[AO] UC$/.test(t)), ucAnt: col('ANTIGA UC', t => /^ANTIG[AO] UC$/.test(t)), ucGen: col('UC', ehUC), vend: col('VENDEDOR', t => /^(VENDEDOR|CONSULTOR)/.test(t)) };
  const out = [];
  for (let i = h + 1; i < v.length; i++) {
    const r = v[i], nome = String(r[C.nome] || '').replace(/\s+/g, ' ').trim();
    if (!nome) continue;
    const txt = i => i < 0 ? '' : (typeof r[i] === 'number' ? String(Math.round(r[i])) : String(r[i] || '').trim());
    const ucNova = txt(C.uc), ucAntiga = txt(C.ucAnt);
    const uc = ucNova || ucAntiga || txt(C.ucGen);
    const cont = C.cont >= 0 ? r[C.cont] : '';
    const cidTxt = C.cid >= 0 ? String(r[C.cid] || '').trim() : '';
    const cm = cidTxt.match(/^(.*?)\s*[-–\/]\s*([A-Za-z]{2})$/);
    out.push({
      titular: nome, responsavel: C.resp >= 0 ? String(r[C.resp] || '').trim() : '', fantasia: C.fan >= 0 ? String(r[C.fan] || '').trim() : '',
      uc: uc, uc_antiga: ucAntiga && ucAntiga !== uc ? ucAntiga : '', cidade: cm ? cm[1] : cidTxt, uf: cm ? cm[2].toUpperCase() : '',
      celular: telefone_(cont), email: (String(cont).match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [''])[0],
      distribuidora: [uc, ucAntiga].some(u => /^(30|40)\d{8}$/.test(String(u).replace(/\D/g, ''))) ? 'RGE' : '', consultor: C.vend >= 0 ? String(r[C.vend] || '').trim() : '',
      origem: 'Clientes'
    });
  }
  gravarCacheGrande_(chave, out);
  return out;
}

/* =========================================================
 * FLUXO DE CAIXA — só LÊ a planilha de controle (não escreve nada nela)
 *   Entradas: abas dos meses (JANEIRO…DEZEMBRO): FATURA, na data da COBRANÇA; recebida se STATUS = PAGO
 *   Contas RGE: aba PROGRAMAÇÃO (clientes e usinas), pelo vencimento; paga se SITUAÇÃO = PAGO
 *   Repasses: aba PGTO INVEST. (valor do investidor, mês do REF PGTO); pago se PGTO = PAGO
 *   Custos fixos: CUSTO OPERAÇÃO (CUSTO MÉDIO MENSAL)
 *   Contas das usinas que o próprio investidor paga ("Ele paga" etc. na FATURAS GERADOR) ficam de fora.
 *
 *   Regras da tela (o portal não mostra estes avisos; ficam registrados aqui):
 *   - "Estimado": nos meses em que a PROGRAMAÇÃO (contas) ou a PGTO INVEST. (repasses) não têm dados,
 *     o valor vem da aba do mês: repasse = coluna INVESTIDOR e conta da RGE = fatura − lucro − investidor
 *     (resultado negativo é ignorado). "sem dados" = nem fonte oficial nem estimativa.
 *   - Contas de usina pagas pelo próprio investidor não entram nas saídas.
 *   - Custos fixos: média mensal da CUSTO OPERAÇÃO (CUSTO MÉDIO MENSAL), lançada em todo mês (estimativa).
 *   - Repasses e custos fixos não têm dia definido: entram no último dia do mês.
 *   - Entradas são por data de caixa: dia da COBRANÇA; sem data válida, dia 15 do mês da aba.
 *   - Repasse sem REF PGTO fica no mês da maioria das linhas do mesmo bloco da PGTO INVEST.
 *   - Num mês em que a fonte oficial já tem algum dado, ele não é estimado (pode ficar incompleto).
 * ========================================================= */
const CACHE_FLUXO_ = 'fluxo_v1';
const MESES_ = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

function fluxoComCache_(forcar) {
  if (!forcar) { const c = lerCacheGrande_(CACHE_FLUXO_); if (c) { c.doCache = true; return c; } }
  const r = lerFluxo();
  if (r.ok) gravarCacheGrande_(CACHE_FLUXO_, r);
  return r;
}

function lerFluxo() {
  const id = idPlanilhaControle_();
  if (!id) return { ok: false, erro: 'a planilha de controle não está configurada (Config!B4)' };
  let ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) { return { ok: false, erro: 'não consegui abrir a planilha de controle: ' + e.message }; }
  const tz = ss.getSpreadsheetTimeZone(), agora = new Date();
  const N = x => String(x == null ? '' : x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const dig = x => String(x == null ? '' : x).replace(/\.0+$/, '').replace(/\D/g, '');
  const iso = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const num = x => typeof x === 'number' && isFinite(x) ? Math.round(x * 100) / 100 : null;
  const avisos = [];
  const abas = {}; ss.getSheets().forEach(a => { abas[N(a.getName())] = a; });
  const anoPara = mes => { const cm = agora.getMonth(), cy = agora.getFullYear(); return mes > cm + 1 ? cy - 1 : cy; };

  // --- usinas cujo investidor paga a própria conta (só leitura da FATURAS GERADOR)
  const ucsUsina = new Set(), ucsInvPaga = new Set();
  const fg = abas['FATURAS GERADOR'];
  if (fg) {
    const v = fg.getDataRange().getValues();
    const h = v.slice(0, 10).findIndex(r => r.map(N).indexOf('NOVA UC') >= 0);
    if (h >= 0) {
      const cab = v[h].map(N), cN = cab.indexOf('NOVA UC'), cU = cab.indexOf('UC');
      for (let i = h + 1; i < v.length; i++) {
        const ucs = [cN, cU].filter(c => c >= 0).map(c => dig(v[i][c])).filter(d => d.length >= 7);
        if (!ucs.length) continue;
        ucs.forEach(d => ucsUsina.add(d));
        const invPaga = v[i].some(x => typeof x === 'string' && (/\bPAGA\b/.test(N(x)) || /PAGO PELO INVEST/.test(N(x))));
        if (invPaga) ucsInvPaga.add(ucs[0]), ucs.forEach(d => ucsInvPaga.add(d));
      }
    }
  } else avisos.push('aba FATURAS GERADOR não encontrada');
  const bateUC = (set, ...us) => us.map(dig).some(d => d.length >= 7 && (set.has(d) || set.has(d.slice(0, -2)) || [...set].some(k => k.length === d.length + 2 && k.indexOf(d) === 0)));

  // --- entradas: abas dos meses
  const entradas = [], meses = [];
  MESES_.forEach((nomeMes, mi) => {
    const sh = abas[nomeMes];
    if (!sh) return;
    const v = sh.getDataRange().getValues();
    const h = v.slice(0, 6).findIndex(r => r.map(N).indexOf('CLIENTE') >= 0);
    if (h < 0) { avisos.push('aba ' + sh.getName() + ': sem cabeçalho CLIENTE'); return; }
    const cab = v[h].map(N), c = n => cab.indexOf(n);
    const C = { cli: c('CLIENTE'), fat: c('FATURA'), cob: c('COBRANCA'), st: c('STATUS'), uc: c('NOVA UC'), ucA: c('UC'), vend: c('VENDEDOR'),
      lucro: c('LUCRO'), rge: c('RGE') };
    // valor do investidor: a coluna INVESTIDOR que vem depois de INJETADO (a primeira INVESTIDOR é o nome)
    const invs = cab.map((x, k) => x === 'INVESTIDOR' ? k : -1).filter(k => k >= 0), inj = c('INJETADO');
    C.inv = inj >= 0 ? (invs.find(k => k > inj) !== undefined ? invs.find(k => k > inj) : -1) : (invs.length > 1 ? invs[1] : -1);
    if (C.fat < 0) { avisos.push('aba ' + sh.getName() + ': sem coluna FATURA'); return; }
    // ano da aba: pelas datas de cobrança (a aba DEZEMBRO pode ser do ano passado)
    const votos = {};
    for (let i = h + 1; i < v.length; i++) { const d = C.cob >= 0 ? v[i][C.cob] : null;
      if (d instanceof Date) { const y = d.getFullYear() + (d.getMonth() - mi > 6 ? 1 : d.getMonth() - mi < -6 ? -1 : 0); votos[y] = (votos[y] || 0) + 1; } }
    const anos = Object.keys(votos).sort((a, b) => votos[b] - votos[a]);
    const ano = anos.length ? Number(anos[0]) : anoPara(mi);
    const ini = new Date(ano, mi, 1, 12), fim = new Date(ano, mi + 1, 0, 12);
    const comp = ano + '-' + String(mi + 1).padStart(2, '0');
    meses.push(comp);
    for (let i = h + 1; i < v.length; i++) {
      const r = v[i], valor = num(r[C.fat]), cli = String(r[C.cli] || '').trim();
      if (!cli || !valor || valor <= 0 || /^(SUB ?)?TOTA/.test(N(cli))) continue;   // linha de total da aba
      let d = C.cob >= 0 ? r[C.cob] : null, estimada = false;
      if (!(d instanceof Date) || d < new Date(ini.getTime() - 20 * 864e5) || d > new Date(fim.getTime() + 45 * 864e5)) { d = new Date(ano, mi, 15, 12); estimada = true; }
      const st = N(C.st >= 0 ? r[C.st] : '');
      const inv = C.inv >= 0 ? num(r[C.inv]) : null, lucro = C.lucro >= 0 ? num(r[C.lucro]) : null;
      entradas.push({ d: iso(d), est: estimada, comp: comp, v: valor, n: cli, s: st || '', ok: st === 'PAGO', vend: C.vend >= 0 ? String(r[C.vend] || '').trim() : '',
        inv: inv, lucro: lucro, rgeOk: C.rge >= 0 && N(r[C.rge]) === 'PAGO', invNome: C.inv >= 0 && invs[0] >= 0 ? limparNome(r[invs[0]]) : '' });
    }
  });

  // --- contas RGE: PROGRAMAÇÃO
  const prog = lerProgramacao(ss), contas = [];
  if (!prog.ok) avisos.push(prog.erro);
  else prog.contas.forEach(c => {
    if (!c.venc || c.valor == null) return;
    const invPaga = N(c.situacao) === 'PAGO PELO INVESTIDOR' || bateUC(ucsInvPaga, c.uc, c.ucAntiga);
    contas.push({ d: c.venc, v: c.valor, n: c.nome, s: c.situacao, ok: N(c.situacao) === 'PAGO', usina: bateUC(ucsUsina, c.uc, c.ucAntiga),
      fora: invPaga, uc: c.uc || c.ucAntiga, us: c.usinaNome || '' });
  });

  // --- repasses: PGTO INVEST. (vários blocos, um por mês de pagamento)
  const repasses = [];
  const pg = abas['PGTO INVEST'];
  if (pg) {
    const v = pg.getDataRange().getValues();
    // cada bloco começa num cabeçalho e termina na linha TOTAL; linha sem REF PGTO fica no mês do bloco
    let C = null, bloco = [];
    const fechaBloco = () => {
      const votos = {}; bloco.forEach(b => { if (b.mi >= 0) votos[b.mi] = (votos[b.mi] || 0) + 1; });
      const dom = Object.keys(votos).sort((a, b) => votos[b] - votos[a])[0];
      bloco.forEach(b => {
        const mi = b.mi >= 0 ? b.mi : (dom !== undefined ? Number(dom) : -1);
        if (mi < 0) return;
        const ano = anoPara(mi);
        repasses.push({ d: iso(new Date(ano, mi + 1, 0, 12)), semDia: true, comp: ano + '-' + String(mi + 1).padStart(2, '0'),
          v: b.v, n: b.n, cli: b.cli, s: b.s, ok: b.s === 'PAGO', semRef: b.mi < 0 });
      });
      bloco = [];
    };
    for (let i = 0; i < v.length; i++) {
      const r = v[i], nr = r.map(N);
      if (nr.indexOf('REF PGTO') >= 0 && nr.indexOf('CLIENTE') >= 0) {   // cabeçalho de um bloco
        fechaBloco();
        const invs = nr.map((x, k) => x === 'INVESTIDOR' ? k : -1).filter(k => k >= 0), inj = nr.indexOf('INJETADO');
        C = { nome: invs[0], valor: invs.find(k => k > inj) !== undefined ? invs.find(k => k > inj) : invs[1], pg: nr.indexOf('PGTO'), ref: nr.indexOf('REF PGTO'), cli: nr.indexOf('CLIENTE') };
        continue;
      }
      if (!C) continue;
      if (N(r[C.cli]) === 'TOTAL') { fechaBloco(); C = null; continue; }   // fim do bloco (o resumo embaixo não entra)
      const valor = num(r[C.valor]), nome = String(r[C.nome] || '').trim();
      if (!valor || valor <= 0 || !nome) continue;
      bloco.push({ v: valor, mi: MESES_.indexOf(N(r[C.ref])), n: limparNome(nome) || nome, cli: String(r[C.cli] || '').trim(), s: N(r[C.pg]) });
    }
    fechaBloco();
  } else avisos.push('aba PGTO INVEST. não encontrada');

  // --- custos fixos
  let custo = null;
  const co = abas['CUSTO OPERACAO'];
  if (co) {
    const v = co.getDataRange().getValues();
    for (let i = 0; i < v.length && custo === null; i++) {
      const k = v[i].findIndex(x => /^CUSTO MEDIO MENSAL/.test(N(x)));
      if (k >= 0) { const n = v[i].slice(k + 1).find(x => typeof x === 'number'); if (n) custo = num(n); }
    }
  }

  return { ok: true, hoje: Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy-MM-dd'), lidoEm: Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
    entradas: entradas, contas: contas, repasses: repasses, custoMensal: custo, mesesAbas: meses, avisos: avisos };
}

/* =========================================================
 * CADASTRO DE CLIENTES (aba "Clientes" desta planilha)
 * ========================================================= */

/**
 * Cliente de um termo gerado → cadastro. Procura pela UC (ou, sem UC, pelo documento + nome).
 * Já cadastrado: só completa os campos vazios (não apaga o que alguém editou). Novo: cria.
 * Devolve 'criado' | 'completado' | 'igual' | 'sem dados'.
 */
function cadastroDoTermo_(d, usuario) {
  const txt = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const dig = v => String(v == null ? '' : v).replace(/\D/g, '');
  const nome = txt(d.titular);
  if (nome.length < 3) return 'sem dados';
  let doc = txt(d.documento);
  if (/\*/.test(doc) || [11, 14].indexOf(dig(doc).length) < 0) doc = '';   // CPF escondido da fatura (******.080-**) não serve
  const cu = txt(d.cidade).split('/');
  let dist = txt(d.distribuidora).split('/')[0].trim();
  if (/^RGE/i.test(dist)) dist = 'RGE';
  const endereco = [txt(d.endereco), txt(d.bairro)].filter(Boolean).join(', ');
  // o plano vem da proposta (pelo número dela)
  let plano = '';
  try {
    const np = txt(d.num_proposta), sp = SpreadsheetApp.getActive().getSheetByName(ABA_PROPOSTAS);
    if (np && sp && sp.getLastRow() > 1) {
      const v = sp.getRange(2, 1, sp.getLastRow() - 1, 15).getValues();
      for (let i = v.length - 1; i >= 0; i--) if (String(v[i][1]).trim() === np) { plano = txt(v[i][14]); break; }
    }
  } catch (e) {}
  const novo = { nome: nome, doc: doc, telefone: txt(d.celular), email: txt(d.email).toLowerCase(), endereco: endereco,
    cidade: txt(cu[0]), uf: txt(cu[1]).toUpperCase().slice(0, 2), cep: txt(d.cep), uc: txt(d.codigo_uc), distribuidora: dist,
    plano: plano, vendedor: txt(d.consultor) };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = abaCadastro_(), linhas = cadastroLinhas_(sh), nu = dig(novo.uc), nd = dig(novo.doc);
    const i = linhas.findIndex(r => String(r[0]).trim() && (
      (nu.length >= 7 && dig(r[11]) === nu) || (nu.length < 7 && nd && dig(r[4]) === nd && String(r[3]).trim().toUpperCase() === nome.toUpperCase())));
    const quem = (usuario.nome || usuario.email || '') + ' (termo)', agora = new Date();
    if (i < 0) {
      const novoId = 'C' + Utilities.getUuid().replace(/-/g, '').slice(0, 9).toUpperCase(), linha = sh.getLastRow() + 1;
      sh.getRange(linha, 4, 1, 12).setNumberFormat('@');
      sh.getRange(linha, 1, 1, COLS_CADASTRO.length).setValues([[novoId, agora, quem].concat(CAMPOS_CADASTRO.map(c => limpa(novo[c]))).concat(['', ''])]);
      return 'criado';
    }
    const atual = linhas[i];
    let mudou = false;
    const valores = CAMPOS_CADASTRO.map((c, k) => {
      const v = atual[3 + k];
      if (String(v == null ? '' : v).trim() === '' && novo[c]) { mudou = true; return limpa(novo[c]); }
      return v;
    });
    if (!mudou) return 'igual';
    sh.getRange(i + 2, 4, 1, 12).setNumberFormat('@').setValues([valores]);
    sh.getRange(i + 2, 16, 1, 2).setValues([[agora, quem]]);
    return 'completado';
  } finally { lock.releaseLock(); }
}
function abaCadastro_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ABA_CADASTRO);
  if (!sh) sh = ss.insertSheet(ABA_CADASTRO);
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLS_CADASTRO);
    sh.getRange(1, 1, 1, COLS_CADASTRO.length).setFontWeight('bold').setBackground('#3a0a8c').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    // documento, telefone, CEP e UC como TEXTO, para não perder zeros nem virar número
    sh.getRange(2, 4, sh.getMaxRows() - 1, 12).setNumberFormat('@');
  }
  return sh;
}

function cadastroLinhas_(sh) {
  const n = sh.getLastRow() - 1;
  return n < 1 ? [] : sh.getRange(2, 1, n, COLS_CADASTRO.length).getValues();
}

function cadastroObj_(r) {
  const d = v => v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') : String(v || '');
  const o = { id: String(r[0]), criadoEm: d(r[1]), criadoPor: String(r[2] || ''), atualizadoEm: d(r[15]), atualizadoPor: String(r[16] || '') };
  CAMPOS_CADASTRO.forEach((c, i) => { o[c] = String(r[3 + i] == null ? '' : r[3 + i]).trim(); });
  return o;
}

function cadastroListar() {
  const linhas = cadastroLinhas_(abaCadastro_()).filter(r => String(r[0]).trim() && String(r[3]).trim());
  return { ok: true, clientes: linhas.map(cadastroObj_) };
}

/** Cria (sem id) ou altera (com id) um cliente. Não deixa repetir a mesma UC (ou, sem UC, o mesmo documento). */
function cadastroSalvar(d, usuario) {
  const txt = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200);
  const dig = v => String(v == null ? '' : v).replace(/\D/g, '');
  const novo = {};
  CAMPOS_CADASTRO.forEach(c => { novo[c] = txt(d[c], c === 'endereco' ? 300 : 200); });
  novo.uf = novo.uf.toUpperCase().slice(0, 2);
  novo.email = novo.email.toLowerCase();
  if (novo.nome.length < 3) return { ok: false, erro: 'informe o nome do cliente' };
  const nd = dig(novo.doc);
  if (nd && nd.length !== 11 && nd.length !== 14) return { ok: false, erro: 'o CPF precisa ter 11 dígitos e o CNPJ, 14' };
  if (novo.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novo.email)) return { ok: false, erro: 'o e-mail parece incompleto' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = abaCadastro_(), linhas = cadastroLinhas_(sh), id = txt(d.id, 40);
    const iAtual = id ? linhas.findIndex(r => String(r[0]) === id) : -1;
    if (id && iAtual < 0) return { ok: false, erro: 'esse cliente não existe mais (alguém pode ter excluído). Atualize a lista.' };
    // repetido: mesma UC; ou, sem UC, mesmo documento e mesmo nome
    const nu = dig(novo.uc), nomeN = novo.nome.toUpperCase();
    const rep = linhas.find((r, i) => i !== iAtual && String(r[0]).trim() && (
      (nu.length >= 7 && dig(r[11]) === nu) || (nu.length < 7 && nd && dig(r[4]) === nd && dig(r[11]).length < 7 && String(r[3]).trim().toUpperCase() === nomeN)));
    if (rep) return { ok: false, erro: (nu.length >= 7 ? 'essa UC já está cadastrada para ' : 'esse cliente já está cadastrado: ') + String(rep[3]), duplicado: String(rep[0]) };

    const agora = new Date(), quem = usuario.nome || usuario.email;
    const valores = CAMPOS_CADASTRO.map(c => limpa(novo[c]));
    let linha, saida;
    if (iAtual >= 0) {
      linha = iAtual + 2;
      sh.getRange(linha, 4, 1, 12).setNumberFormat('@').setValues([valores]);
      sh.getRange(linha, 16, 1, 2).setValues([[agora, quem]]);
    } else {
      linha = sh.getLastRow() + 1;
      const novoId = 'C' + Utilities.getUuid().replace(/-/g, '').slice(0, 9).toUpperCase();
      sh.getRange(linha, 4, 1, 12).setNumberFormat('@');
      sh.getRange(linha, 1, 1, COLS_CADASTRO.length).setValues([[novoId, agora, quem].concat(valores).concat(['', ''])]);
    }
    saida = cadastroObj_(sh.getRange(linha, 1, 1, COLS_CADASTRO.length).getValues()[0]);
    return { ok: true, cliente: saida, criado: iAtual < 0 };
  } finally { lock.releaseLock(); }
}

function cadastroExcluir(id, usuario) {
  id = String(id || '').trim();
  if (!id) return { ok: false, erro: 'faltou dizer qual cliente' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = abaCadastro_(), i = cadastroLinhas_(sh).findIndex(r => String(r[0]) === id);
    if (i < 0) return { ok: true, jaNaoExistia: true };
    console.log('Cliente excluído do cadastro: ' + id + ' por ' + (usuario.email || '?'));
    sh.deleteRow(i + 2);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/**
 * Ficha do cliente: o cadastro + o que a planilha de controle (aba CLIENTES) sabe dele + propostas e termos
 * gerados pelo portal + as contas da PROGRAMAÇÃO (estas só para quem tem acesso à Análise: TI e Admin).
 * Liga tudo pela UC (a nova e a antiga, que a aba CLIENTES relaciona) ou pelo CPF/CNPJ.
 */
function cadastroFicha(id, usuario) {
  id = String(id || '').trim();
  const r = cadastroLinhas_(abaCadastro_()).find(x => String(x[0]) === id);
  if (!r) return { ok: false, erro: 'cliente não encontrado (pode ter sido excluído)' };
  const c = cadastroObj_(r);
  const dig = v => String(v == null ? '' : v).replace(/\D/g, '');
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const data = v => v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'dd/MM/yyyy') : String(v || '').trim();
  const num = v => typeof v === 'number' ? v : (String(v || '').trim() ? Number(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || null : null);
  const ucs = {}; const addUc = u => { if (dig(u).length >= 7) ucs[dig(u)] = true; };
  addUc(c.uc);
  const doc = dig(c.doc), nome = norm(c.nome);
  const out = { ok: true, cliente: c, controle: null, propostas: [], termos: [], contas: null, avisos: [] };

  // planilha de controle: a aba CLIENTES liga a UC nova à antiga
  try {
    const ext = lerClientesExternos_();
    let m = ext.find(x => [x.uc, x.uc_antiga].some(u => ucs[dig(u)]));
    if (!m && !Object.keys(ucs).length && nome) m = ext.find(x => norm(x.titular) === nome);
    if (m) {
      out.controle = { titular: m.titular, responsavel: m.responsavel, fantasia: m.fantasia, celular: m.celular, email: m.email,
        vendedor: m.consultor, uc: m.uc, ucAntiga: m.uc_antiga, cidade: m.cidade, uf: m.uf };
      addUc(m.uc); addUc(m.uc_antiga);
    }
  } catch (e) { out.avisos.push('não consegui ler a aba CLIENTES da planilha de controle'); console.error('Ficha/CLIENTES: ' + e.message); }

  const temUc = Object.keys(ucs).length > 0;
  // sem UC e sem documento, só o nome exato liga as coisas
  const bate = (uc, docs, nm) => (temUc && !!ucs[dig(uc)]) || (doc.length >= 11 && docs.some(d => dig(d) === doc)) || (!temUc && doc.length < 11 && !!nome && norm(nm) === nome);

  const ss = SpreadsheetApp.getActive();
  const sp = ss.getSheetByName(ABA_PROPOSTAS);
  if (sp && sp.getLastRow() > 1) {
    sp.getRange(2, 1, sp.getLastRow() - 1, 21).getValues().forEach(x => {
      if (!String(x[1]).trim() || !bate(x[6], [x[4], x[5]], x[3])) return;
      out.propostas.push({ data: data(x[0]), numero: String(x[1]), consultor: String(x[2] || ''), plano: String(x[14] || ''),
        consumo: num(x[13]), desconto: String(x[15] || ''), economiaMensal: num(x[18]), economiaAnual: num(x[19]), uc: String(x[6] || '') });
    });
  }
  const st = ss.getSheetByName(ABA_TERMOS);
  if (st && st.getLastRow() > 1) {
    st.getRange(2, 1, st.getLastRow() - 1, 16).getValues().forEach(x => {
      if (!String(x[0]).trim() || !bate(x[5], [x[4]], x[3])) return;
      out.termos.push({ data: data(x[0]), numero: String(x[1] || ''), consultor: String(x[2] || ''), modalidade: String(x[11] || ''),
        assinatura: data(x[12]), consumo: num(x[10]), uc: String(x[5] || '') });
    });
  }
  out.propostas.reverse(); out.termos.reverse();   // mais recentes primeiro

  // contas a pagar: só para quem vê a Análise (são valores da empresa)
  const perfil = PERFIS_[usuario.perfil] || PERFIS_.vendedor;
  if (perfil.areas.indexOf('ana') >= 0) {
    if (!temUc) out.contas = { hoje: '', lista: [], semUc: true };
    else {
      const p = programacaoComCache_(false);
      if (!p.ok) out.avisos.push('não consegui ler a PROGRAMAÇÃO: ' + p.erro);
      else out.contas = { hoje: p.hoje, lidoEm: p.lidoEm, lista: p.contas.filter(k => ucs[dig(k.uc)] || ucs[dig(k.ucAntiga)])
        .sort((a, b) => (b.venc || '').localeCompare(a.venc || '')).slice(0, 36)
        .map(k => ({ mes: k.mes, venc: k.venc, valor: k.valor, situacao: k.situacao, usinaCod: k.usinaCod, usinaNome: k.usinaNome, link: k.link, pix: k.pix, uc: k.uc })) };
    }
  }
  return out;
}

/** Tira do nome os números soltos de CPF/CNPJ ("60.897.570 FLAVIO" → "FLAVIO"). */
function limparNome(nome) {
  return String(nome == null ? '' : nome).replace(/(^|\s)[\d.\/\-]*\d[\d.\/\-]*(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s\-–—:,.]+|[\s\-–—:,.]+$/g, '').trim();
}

/** ID da planilha de controle (Config!B4; sem a linha 4, a padrão). '' = não usar. */
function idPlanilhaControle_() {
  const cfg = SpreadsheetApp.getActive().getSheetByName(ABA_CONFIG);
  let ref = PLANILHA_CLIENTES_PADRAO;
  if (cfg && String(cfg.getRange('A4').getValue() || '').trim()) ref = String(cfg.getRange('B4').getValue() || '').trim();
  const m = ref.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : ref;
}

/* A planilha de controle é grande e abrir ela leva vários segundos. A leitura fica guardada (em pedaços,
   porque o cache aceita até 100 KB por item) e é renovada a cada 10 minutos por um acionador. */
const CACHE_PROG_ = 'prog_v1';

function programacaoComCache_(forcar) {
  if (!forcar) {
    const c = lerCacheGrande_(CACHE_PROG_);
    if (c) { c.doCache = true; return c; }
  }
  const r = lerProgramacao();
  if (r.ok) gravarCacheGrande_(CACHE_PROG_, r);
  return r;
}

/** Acionador de 10 em 10 minutos (criado pelo "Configurar planilha"): deixa a leitura pronta. */
function atualizarCacheProgramacao() {
  try { lerClientesExternos_(true); } catch (e) { Logger.log('Clientes: ' + e.message); }   // a busca do pós-venda também fica pronta
  const r = lerProgramacao();
  if (r.ok) gravarCacheGrande_(CACHE_PROG_, r); else Logger.log('Programação: ' + r.erro);
  try { const f = lerFluxo(); if (f.ok) gravarCacheGrande_(CACHE_FLUXO_, f); else Logger.log('Fluxo: ' + f.erro); } catch (e) { Logger.log('Fluxo: ' + e.message); }
}

/** Guarda um objeto grande no cache, em pedaços de 90 KB (25 min: sobra tempo entre uma renovação e outra). */
function gravarCacheGrande_(base, obj) {
  try {
    const txt = JSON.stringify(obj), cache = CacheService.getScriptCache(), TAM = 90000, partes = {};
    const n = Math.max(1, Math.ceil(txt.length / TAM));
    for (let i = 0; i < n; i++) partes[base + '_' + i] = txt.slice(i * TAM, (i + 1) * TAM);
    partes[base + '_n'] = String(n);
    cache.putAll(partes, 1500);
  } catch (e) { Logger.log('Cache ' + base + ': ' + e.message); }
}

function lerCacheGrande_(base) {
  try {
    const cache = CacheService.getScriptCache(), n = Number(cache.get(base + '_n') || 0);
    if (!n) return null;
    const chaves = []; for (let i = 0; i < n; i++) chaves.push(base + '_' + i);
    const got = cache.getAll(chaves);
    if (chaves.some(k => !got[k])) return null;
    return JSON.parse(chaves.map(k => got[k]).join(''));
  } catch (e) { return null; }
}

/**
 * Contas da aba PROGRAMAÇÃO da planilha de controle, para a tela Análise do portal (só TI e Admin).
 * Lê as colunas pelo nome do cabeçalho; não devolve CPF/CNPJ.
 */
function lerProgramacao(ssAberta) {
  let ss = ssAberta, sh;
  if (!ss) {
    const id = idPlanilhaControle_();
    if (!id) return { ok: false, erro: 'a planilha de controle não está configurada (Config!B4)' };
    try { ss = SpreadsheetApp.openById(id); } catch (e) { return { ok: false, erro: 'não consegui abrir a planilha de controle: ' + e.message }; }
  }
  sh = ss.getSheetByName(ABA_PROGRAMACAO_EXT);
  if (!sh) return { ok: false, erro: 'aba ' + ABA_PROGRAMACAO_EXT + ' não encontrada na planilha de controle' };
  const ult = sh.getLastRow(), cols = sh.getLastColumn();
  const tz = ss.getSpreadsheetTimeZone();
  const agora = new Date();
  const base = { ok: true, hoje: Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy-MM-dd'),
    lidoEm: Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'), contas: [] };
  if (ult < 2) return base;
  const v = sh.getRange(1, 1, ult, cols).getValues();
  const up = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const cab = v[0].map(up), col = n => cab.indexOf(n);
  const C = { nome: col('NOME DO TITULAR'), uc: col('NUMERO DA UC'), ucAnt: col('UC ANTIGA'), cidade: col('CIDADE'), mes: col('MES DE REFERENCIA'),
    venc: col('DATA DE VENCIMENTO'), valor: col('VALOR DA CONTA'), email: col('DATA DO E MAIL'), link: col('LINK DE ACESSO A CONTA'),
    pix: col('PIX COPIA E COLA'), sit: col('SITUACAO'), usCod: col('CODIGO USINA'), usNome: col('NOME USINA') };
  if (C.nome < 0 || C.venc < 0) return { ok: false, erro: 'não achei as colunas NOME DO TITULAR e DATA DE VENCIMENTO na aba ' + ABA_PROGRAMACAO_EXT };
  const txt = (r, i) => i < 0 ? '' : (r[i] instanceof Date ? Utilities.formatDate(r[i], tz, 'dd/MM/yyyy') : String(r[i] == null ? '' : r[i]).trim());
  const dataISO = x => x instanceof Date ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : (String(x || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/) ? String(x).replace(/^(\d{2})\/(\d{2})\/(\d{4}).*/, '$3-$2-$1') : '');
  for (let i = 1; i < v.length; i++) {
    const r = v[i], nome = txt(r, C.nome);
    if (!nome) continue;
    const mes = C.mes < 0 ? '' : (r[C.mes] instanceof Date ? Utilities.formatDate(r[C.mes], tz, 'MM/yyyy') : String(r[C.mes] || '').trim());
    const link = txt(r, C.link);
    base.contas.push({ linha: i + 1, nome: nome, uc: txt(r, C.uc), ucAntiga: txt(r, C.ucAnt), cidade: txt(r, C.cidade), mes: mes,
      venc: dataISO(r[C.venc]), valor: C.valor >= 0 && typeof r[C.valor] === 'number' ? r[C.valor] : null,
      link: /^https:\/\//i.test(link) ? link : '', pix: txt(r, C.pix),
      situacao: (txt(r, C.sit) || 'AGENDADO').toUpperCase(), usinaCod: txt(r, C.usCod).replace(/\.0+$/, ''), usinaNome: txt(r, C.usNome) });
  }
  return base;
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
