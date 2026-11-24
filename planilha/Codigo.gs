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
  ti:             { nome: 'TI',             areas: ['ger', 'pos', 'ana', 'cli', 'rat'] },   // rat = Rateio e Leitor de faturas (TI e Admin)
  admin:          { nome: 'Admin',          areas: ['ger', 'pos', 'ana', 'cli', 'rat'] },
  administrativo: { nome: 'Administrativo', areas: ['ger', 'cli'] },
  vendedor:       { nome: 'Vendedor',       areas: ['ger', 'pos', 'cli'] }
};
function temRat_(u) { const p = PERFIS_[u && u.perfil]; return !!(p && p.areas.indexOf('rat') >= 0); }
const AREA_DA_ACAO_ = { proposta: 'ger', termo: 'ger', buscar: 'ger', clientes: 'pos', programacao: 'ana', fluxo: 'ana',
  cli_listar: 'cli', cli_salvar: 'cli', cli_excluir: 'cli', cli_ficha: 'cli', importar_contas: 'cli', importar_status: 'cli', prog_situacao: 'ana', cobrancas: 'ana', rat_dados: 'rat', rat_salvar: 'rat', rat_importar: 'rat', fat_salvar: 'rat', rat_usina: 'rat', uc_ozz: 'ger' };
const NOME_AREA_ = { ger: 'Geradores', pos: 'Pós-venda', ana: 'Análise', cli: 'Clientes', rat: 'Rateio' };

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
  'Custo mensal', 'Custo anual', 'Economia mensal', 'Economia anual', 'Modelo',
  // a partir da versão 16: o que mais a fatura trouxe (o histórico também vai para a aba Rateio Consumo)
  'Classe', 'Bairro', 'E-mail', 'Celular', 'Tarifa (R$/kWh)', 'Mês da fatura', 'Consumo TE do mês (kWh)', 'Injeção TE (kWh)', 'Histórico 12 meses (kWh)'];
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
  if (!String(cfg.getRange('A5').getValue())) {
    cfg.getRange('A5:A6').setValues([['Importador: endereço'], ['Importador: chave']]).setFontWeight('bold');
    cfg.getRange('C5').setValue('← URL do App da Web da planilha de controle (arquivo PortalImportar)');
    cfg.getRange('C6').setValue('← chave que a função configurarPortal mostrou na planilha de controle');
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

const VERSAO_SCRIPT = '30 (Cobranças em segundo plano)';
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
    if (req.acao === 'prog_situacao') return json(programacaoSituacao(req, usuario));
    if (req.acao === 'uc_ozz') return json(ucDaOzz(req.uc));
    if (req.acao === 'rat_usina') {
      if (!usuario.email || !temRat_(usuario)) return json({ ok: false, erro: 'o rateio é só para TI e Admin', perfil: true });
      return json(ratUsinaSalvar(req.usina || {}, usuario));
    }
    if (req.acao === 'fat_salvar') {
      if (!usuario.email || !temRat_(usuario)) return json({ ok: false, erro: 'o leitor de faturas é só para TI e Admin', perfil: true });
      return json(faturasSalvar(req.faturas, usuario));
    }
    if (req.acao === 'rat_dados' || req.acao === 'rat_salvar' || req.acao === 'rat_importar') {
      if (!usuario.email || !temRat_(usuario)) return json({ ok: false, erro: 'o rateio é só para TI e Admin', perfil: true });
      if (req.acao === 'rat_importar') return json(ratImportarControle(usuario, req.etapa));
      return json(req.acao === 'rat_dados' ? ratDados() : ratSalvar(req, usuario));
    }
    if (req.acao === 'importar_contas' || req.acao === 'importar_status') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para importar as contas', auth: true });
      return json(importador_(req.acao === 'importar_contas' ? 'importar' : 'status', usuario));
    }
    if (req.acao === 'fluxo') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para ver a análise', auth: true });
      return json(fluxoComCache_(!!req.forcar));
    }
    if (req.acao === 'cobrancas') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para ver as cobranças', auth: true });
      return json(cobrancasComCache_(!!req.forcar));
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
    completaCabecalho_(sh, COLS_PROPOSTAS);
    const hist = historicoValido_(d.historico);
    const mesFat = hist.length ? hist[hist.length - 1].mes : '';
    const histTxt = hist.map(h => String(h.mes).slice(4) + '/' + String(h.mes).slice(0, 4) + ': ' + h.kwh).join(' · ');
    sh.appendRow([new Date(), numero, d.consultor, d.titular, d.cpf, d.cnpj, d.codigo_uc, d.distribuidora,
      d.endereco, d.cep, d.cidade, d.uf, d.tensao, d.consumo, d.plano, d.desconto,
      d.custo_mensal, d.custo_anual, d.economia_mensal, d.economia_anual, d.modelo,
      d.classe_uc, d.bairro, d.email, d.celular, d.tarifa, mesFat ? String(mesFat).slice(4) + '/' + String(mesFat).slice(0, 4) : '',
      d.consumo_te, d.inj_te, histTxt].map(limpa));
    SpreadsheetApp.flush();
    let consumo = null;
    try { consumo = consumoDaProposta_(d.codigo_uc, hist, numero); } catch (e) { console.error('Consumo da proposta: ' + e.message); }
    return { ok: true, numero: numero, consumo: consumo };
  } finally {
    lock.releaseLock();
  }
}

/** Histórico mandado pelo site: [{mes: AAAAMM, kwh}] — só meses e valores que fazem sentido, em ordem. */
function historicoValido_(h) {
  if (!Array.isArray(h)) return [];
  const vistos = {};
  return h.map(x => ({ mes: Number(x && x.mes) || 0, kwh: Number(x && x.kwh) }))
    .filter(x => x.mes > 200001 && x.mes < 210001 && x.mes % 100 >= 1 && x.mes % 100 <= 12 && isFinite(x.kwh) && x.kwh >= 0 && x.kwh < 10000000)
    .filter(x => vistos[x.mes] ? false : (vistos[x.mes] = true))
    .sort((a, b) => a.mes - b.mes);
}

/**
 * Leva o histórico da fatura usada na proposta para a aba "Rateio Consumo" (uma linha por UC e mês),
 * para o rateio usar depois. Só ACRESCENTA meses que ainda não estão lá: não muda o que já foi lançado.
 */
function consumoDaProposta_(uc, hist, numero) {
  const u = String(uc || '').replace(/\D/g, '');
  if (u.length < 7 || !hist.length) return { novos: 0, existentes: 0 };
  const sh = ratAba_('consumo');
  const ja = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
    if (String(r[0]).replace(/\D/g, '') !== u) return;
    const m = r[1] instanceof Date ? Number(Utilities.formatDate(r[1], 'America/Sao_Paulo', 'yyyyMM')) : Number(String(r[1]).replace(/\D/g, ''));
    ja[m] = true;
  });
  const largura = RAT_ABAS_.consumo.cols.length;
  const novos = hist.filter(h => !ja[h.mes]).map(h => {
    const r = Array(largura).fill('');
    r[0] = String(uc).trim(); r[1] = h.mes; r[2] = h.kwh; r[largura - 1] = 'Proposta ' + numero;
    return r;
  });
  if (novos.length) sh.getRange(sh.getLastRow() + 1, 1, novos.length, largura).setValues(novos);
  return { novos: novos.length, existentes: hist.length - novos.length };
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
 * COBRANÇAS — só LÊ a planilha de controle (não escreve nada nela)
 *   Junta numa lista só as cobranças de todas as abas dos meses (JANEIRO…DEZEMBRO): uma linha por
 *   UC e aba, com FATURA, COBRANÇA, VENCIMENTO RGE, STATUS, REF*, RGE, CONF, PGTO e OBSERVAÇÕES.
 *   Cada aba é lida até a linha TOTAL (o resumo que vem embaixo não entra).
 *   Da CLIENTES vêm o investidor, o vendedor, o contato, o STATUS do cliente e a data do ANEXO G
 *   (quando o cliente entrou no rateio). Da PROGRAMAÇÃO vem a última conta da RGE de cada UC,
 *   para saber se a RGE já emitiu a conta que falta cobrar.
 *   Não devolve CPF/CNPJ.
 * ========================================================= */
const CACHE_COB_ = 'cob_v1';

/* Ler as abas dos meses da planilha de controle leva 1–2 min (passa do tempo que o site espera e dá "sem conexão").
   Por isso a leitura roda em segundo plano: o acionador de 10 em 10 min (atualizarCacheProgramacao) deixa o cache pronto,
   e quando falta cache ou alguém clica em Atualizar, um acionador de uma vez (cobrancasPreparar) lê e o site vai perguntando. */
function cobrancasComCache_(forcar) {
  const props = PropertiesService.getScriptProperties();
  const c = lerCacheGrande_(CACHE_COB_);
  if (c && !forcar) { c.doCache = true; return c; }
  let est = {}; try { est = JSON.parse(props.getProperty('COB_ESTADO') || '{}'); } catch (e) {}
  const rodando = est.estado === 'rodando' && Date.now() - (est.desde || 0) < 7 * 60000;
  if (!rodando) {
    // terminou com erro há pouco e não há dados: mostra o erro (Atualizar tenta de novo)
    if (!forcar && !c && est.estado === 'erro' && Date.now() - (est.fim || 0) < 2 * 60000) return { ok: false, erro: est.erro };
    props.setProperty('COB_ESTADO', JSON.stringify({ estado: 'rodando', desde: Date.now() }));
    try {
      ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'cobrancasPreparar').forEach(t => ScriptApp.deleteTrigger(t));
      ScriptApp.newTrigger('cobrancasPreparar').timeBased().after(1000).create();
    } catch (e) {
      props.deleteProperty('COB_ESTADO');
      return { ok: false, erro: 'não consegui iniciar a leitura em segundo plano: ' + e.message + ' (rode a função "configurar" no editor do Apps Script uma vez para autorizar)' };
    }
    est = { desde: Date.now() };
  }
  const r = c || { ok: true };
  r.preparando = true; r.desde = est.desde;
  return r;
}

/** Roda pelo acionador de uma vez (ou no editor, para testar): lê as cobranças e guarda no cache. */
function cobrancasPreparar() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'cobrancasPreparar').forEach(t => ScriptApp.deleteTrigger(t));
  const props = PropertiesService.getScriptProperties(), t0 = Date.now();
  let est;
  try {
    const r = lerCobrancas();
    if (r.ok) { gravarCacheGrande_(CACHE_COB_, r); est = { estado: 'pronto', fim: Date.now() }; }
    else est = { estado: 'erro', erro: r.erro, fim: Date.now() };
  } catch (e) { est = { estado: 'erro', erro: String(e && e.message || e).slice(0, 300), fim: Date.now() }; }
  props.setProperty('COB_ESTADO', JSON.stringify(est));
  Logger.log('Cobranças: ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s → ' + JSON.stringify(est));
}

function lerCobrancas(ssAberta) {
  let ss = ssAberta;
  if (!ss) {
    const id = idPlanilhaControle_();
    if (!id) return { ok: false, erro: 'a planilha de controle não está configurada (Config!B4)' };
    try { ss = SpreadsheetApp.openById(id); } catch (e) { return { ok: false, erro: 'não consegui abrir a planilha de controle: ' + e.message }; }
  }
  const tz = ss.getSpreadsheetTimeZone(), agora = new Date();
  const N = x => String(x == null ? '' : x).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const dig = x => String(x == null ? '' : x).replace(/\.0+$/, '').replace(/\D/g, '');
  const ucOk = x => typeof x === 'number' ? (Number.isInteger(x) && x >= 1e6) : dig(x).length >= 7;
  const txt = x => x instanceof Date ? Utilities.formatDate(x, tz, 'dd/MM/yyyy') : String(x == null ? '' : x).trim().replace(/\.0+$/, '');
  const iso = x => x instanceof Date && !isNaN(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : '';
  const num = x => typeof x === 'number' && isFinite(x) ? Math.round(x * 100) / 100 : null;
  const am = (y, m) => y + '-' + String(m).padStart(2, '0');
  const avisos = [];
  const abas = {}; ss.getSheets().forEach(a => { abas[N(a.getName())] = a; });

  /* ---------- CLIENTES: dados do cliente e UC antiga → nova ---------- */
  const cad = {}, ucNova = {};
  const shC = abas['CLIENTES'];
  if (shC) {
    const v = shC.getDataRange().getValues();
    const CONHECIDAS = ['CLIENTE', 'NOVA UC', 'ANTIGA UC', 'INVESTIDOR', 'ANEXO G', 'STATUS', 'VENDEDOR', 'CONTATO', 'RESPONSAVEL'];
    let h = -1, melhor = 0;
    for (let i = 0; i < Math.min(10, v.length); i++) {
      const p = CONHECIDAS.filter(n => v[i].map(N).indexOf(n) >= 0).length;
      if (p > melhor && v[i].map(N).indexOf('CLIENTE') >= 0) { melhor = p; h = i; }
    }
    if (h >= 0) {
      const cab = v[h].map(N), c = n => cab.indexOf(n);
      const C = { nome: c('CLIENTE'), nova: c('NOVA UC'), ant: c('ANTIGA UC'), inv: c('INVESTIDOR'), anexo: c('ANEXO G'), st: c('STATUS'),
        vend: c('VENDEDOR'), cont: c('CONTATO'), resp: c('RESPONSAVEL'), cid: c('CIDADE') };
      for (let i = h + 1; i < v.length; i++) {
        const r = v[i], nome = String(r[C.nome] || '').trim(); if (!nome || N(nome) === 'CLIENTE') continue;
        const nova = C.nova >= 0 ? dig(r[C.nova]) : '', ant = C.ant >= 0 ? dig(r[C.ant]) : '';
        if (nova.length < 7 && ant.length < 7) continue;
        if (nova.length >= 7 && ant.length >= 7) ucNova[ant] = nova;
        const ax = C.anexo >= 0 ? r[C.anexo] : '';
        const o = { n: nome, st: C.st >= 0 ? String(r[C.st] || '').trim().toUpperCase() : '', anexo: iso(ax), anexoTxt: ax instanceof Date ? '' : txt(ax),
          inv: C.inv >= 0 ? limparNome(r[C.inv]) || String(r[C.inv] || '').trim() : '', vend: C.vend >= 0 ? String(r[C.vend] || '').trim() : '',
          tel: C.cont >= 0 ? telefone_(r[C.cont]) : '', resp: C.resp >= 0 ? String(r[C.resp] || '').trim() : '', cid: C.cid >= 0 ? String(r[C.cid] || '').trim() : '',
          ucN: C.nova >= 0 ? txt(r[C.nova]) : '', ucA: C.ant >= 0 ? txt(r[C.ant]) : '' };
        const k = nova.length >= 7 ? nova : ant;
        if (!cad[k] || (!cad[k].anexo && o.anexo)) cad[k] = o;   // UC repetida: fica a linha que tem o Anexo G
      }
    } else avisos.push('aba CLIENTES: não achei o cabeçalho');
  } else avisos.push('aba CLIENTES não encontrada');
  const chave = (nova, antiga, nome) => {
    const n = dig(nova), a = dig(antiga);
    if (n.length >= 7) return n;
    if (a.length >= 7) return ucNova[a] || a;
    return 'N:' + N(nome);
  };

  /* ---------- abas dos meses ---------- */
  const STOP = ['TOTAL', 'INVESTIDOR'];
  const cobs = [], clientes = {}, meses = [];
  const statusDe = (st, fat) => {
    const s = N(st);
    if (/^PAGO/.test(s)) return 'pago';
    if (/ATRAS|INADIMP/.test(s)) return 'atrasado';
    if (/^AGUARD/.test(s)) return 'aguardando';
    if (/ENVIAR/.test(s)) return 'enviar';
    if (/NAO EMIT|N EMIT/.test(s)) return 'nao_emitiu';
    if (!s) return fat > 0 ? 'sem_status' : 'sem_fatura';
    return 'outro';
  };
  MESES_.forEach((nomeMes, mi) => {
    const sh = abas[nomeMes]; if (!sh) return;
    const v = sh.getDataRange().getValues();
    const h = v.slice(0, 6).findIndex(r => r.map(N).indexOf('CLIENTE') >= 0);
    if (h < 0) { avisos.push('aba ' + sh.getName() + ': sem cabeçalho CLIENTE'); return; }
    const cab = v[h].map(N), c = n => cab.indexOf(n);
    const C = { cli: c('CLIENTE'), uc: c('UC'), nova: c('NOVA UC'), fat: c('FATURA'), cob: c('COBRANCA'), vr: c('VENCIMENTO RGE'), st: c('STATUS'),
      vend: c('VENDEDOR'), conf: c('CONF'), rge: c('RGE'), ref: c('REF'), pg: c('PGTO'), refPg: c('REF PGTO'), obs: c('OBSERVACOES'), inv: c('INVESTIDOR') };
    if (C.cli < 0 || (C.uc < 0 && C.nova < 0)) { avisos.push('aba ' + sh.getName() + ': sem coluna UC'); return; }
    // ano da aba: pelas datas de cobrança (a aba DEZEMBRO pode ser do ano passado)
    const votos = {};
    for (let i = h + 1; i < v.length; i++) {
      const d = C.cob >= 0 ? v[i][C.cob] : null;
      if (d instanceof Date && !isNaN(d)) { const y = d.getFullYear() + (d.getMonth() - mi > 6 ? 1 : d.getMonth() - mi < -6 ? -1 : 0); votos[y] = (votos[y] || 0) + 1; }
    }
    const anos = Object.keys(votos).sort((a, b) => votos[b] - votos[a]);
    const ano = anos.length ? Number(anos[0]) : (mi > agora.getMonth() ? agora.getFullYear() - 1 : agora.getFullYear());
    const comp = am(ano, mi + 1);
    meses.push({ aba: sh.getName(), comp: comp, temRef: C.ref >= 0 });
    for (let i = h + 1; i < v.length; i++) {
      const r = v[i], nome = String(r[C.cli] == null ? '' : r[C.cli]).replace(/\s+/g, ' ').trim();
      if (STOP.indexOf(N(nome)) >= 0) break;          // fim da lista de clientes da aba
      if (!nome) continue;
      const uc = C.uc >= 0 ? r[C.uc] : '', nova = C.nova >= 0 ? r[C.nova] : '';
      const temUc = ucOk(uc) || ucOk(nova);
      const k = chave(temUc && ucOk(nova) ? nova : '', temUc && ucOk(uc) ? uc : '', nome);
      const fat = C.fat >= 0 ? num(r[C.fat]) : null;
      const st = C.st >= 0 ? String(r[C.st] == null ? '' : r[C.st]).trim() : '';
      // REF*: mês de referência da conta da RGE (mês depois do da aba = ano anterior)
      let ref = '';
      const mr = C.ref >= 0 ? MESES_.indexOf(N(r[C.ref])) : -1;
      if (mr >= 0) ref = am(mr > mi ? ano - 1 : ano, mr + 1);
      const rgeV = C.rge >= 0 ? r[C.rge] : '';
      cobs.push({ k: k, c: comp, l: i + 1, v: fat, s: statusDe(st, fat), st: st, ref: ref, cob: C.cob >= 0 ? iso(r[C.cob]) : '', vr: C.vr >= 0 ? iso(r[C.vr]) : '',
        conf: C.conf >= 0 ? (iso(r[C.conf]) || txt(r[C.conf])) : '', rge: rgeV instanceof Date ? 'PAGO ' + txt(rgeV) : txt(rgeV).toUpperCase(),
        pg: C.pg >= 0 ? txt(r[C.pg]).toUpperCase() : '', refPg: C.refPg >= 0 ? txt(r[C.refPg]).toUpperCase() : '', obs: C.obs >= 0 ? txt(r[C.obs]) : '' });
      // dados do cliente: a aba mais nova ganha
      const cl = clientes[k] || (clientes[k] = { k: k });
      cl.n = nome;
      if (temUc) { if (ucOk(nova)) cl.ucN = txt(nova); if (ucOk(uc)) cl.ucA = txt(uc); }
      if (C.vend >= 0 && String(r[C.vend] || '').trim()) cl.vend = String(r[C.vend]).trim();
      if (C.inv >= 0 && String(r[C.inv] || '').trim()) cl.inv = limparNome(r[C.inv]) || String(r[C.inv]).trim();
    }
  });
  meses.sort((a, b) => a.comp < b.comp ? -1 : 1);

  /* ---------- clientes conectados na CLIENTES que não aparecem em nenhuma aba ---------- */
  Object.keys(cad).forEach(k => {
    const o = cad[k];
    if (!clientes[k] && /^CONECTAD/.test(N(o.st))) clientes[k] = { k: k, n: o.n, ucN: o.ucN, ucA: o.ucA, vend: o.vend, inv: o.inv, foraDasAbas: true };
  });

  /* ---------- PROGRAMAÇÃO: última conta da RGE de cada UC ---------- */
  const prog = lerProgramacao(ss), ultRge = {};
  if (!prog.ok) avisos.push(prog.erro);
  else prog.contas.forEach(ct => {
    let ref = '';
    const m = String(ct.mes || '').match(/^(\d{1,2})\/(\d{4})$/);
    if (m) ref = am(Number(m[2]), Number(m[1]));
    else if (ct.venc) { let y = Number(ct.venc.slice(0, 4)), mm = Number(ct.venc.slice(5, 7)) - 1; if (mm < 1) { mm = 12; y--; } ref = am(y, mm); }   // sem mês: o do vencimento − 1
    if (!ref) return;
    const k = chave(ct.uc, ct.ucAntiga, '');
    const o = { ref: ref, est: !m, venc: ct.venc, valor: ct.valor, sit: ct.situacao };
    const a = ultRge[k];
    if (!a || ref > a.ref || (ref === a.ref && String(ct.venc) > String(a.venc))) ultRge[k] = o;
  });

  const lista = Object.keys(clientes).map(k => {
    const cl = clientes[k], o = cad[k] || {};
    return { k: k, n: o.n || cl.n, uc: cl.ucN || o.ucN || cl.ucA || o.ucA || '', ucA: cl.ucN && cl.ucA ? cl.ucA : (o.ucN && o.ucA ? o.ucA : ''),
      inv: cl.inv || o.inv || '', vend: cl.vend || o.vend || '', tel: o.tel || '', resp: o.resp || '', cid: o.cid || '',
      stCli: o.st || '', anexo: o.anexo || '', anexoTxt: o.anexoTxt || '', rge: ultRge[k] || null, fora: !!cl.foraDasAbas, semCad: !cad[k] };
  });
  return { ok: true, hoje: Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy-MM-dd'), lidoEm: Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
    meses: meses, clientes: lista, cobrancas: cobs, avisos: avisos };
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
        .map(k => ({ linha: k.linha, nome: k.nome, mes: k.mes, venc: k.venc, valor: k.valor, situacao: k.situacao, pagoEm: k.pagoEm, usinaCod: k.usinaCod, usinaNome: k.usinaNome, link: k.link, pix: k.pix, uc: k.uc })) };
    }
  }
  return out;
}

/**
 * Botão "Importar contas do e-mail": pede à planilha de controle (arquivo PortalImportar, publicado como App da Web)
 * para rodar o importador da CPFL. A chave fica em Config!B6 e nunca vai para o navegador.
 * A importação roda em segundo plano lá; o portal só pergunta como está.
 */
function importador_(acao, usuario) {
  const cfg = SpreadsheetApp.getActive().getSheetByName(ABA_CONFIG);
  const url = cfg ? String(cfg.getRange('B5').getValue() || '').trim() : '';
  const chave = cfg ? String(cfg.getRange('B6').getValue() || '').trim() : '';
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url) || !chave)
    return { ok: false, naoConfigurado: true, erro: 'o botão ainda não foi ligado: falta o endereço (Config!B5) ou a chave (Config!B6) do importador na planilha do portal' };
  let r;
  try {
    const resp = UrlFetchApp.fetch(url, { method: 'post', contentType: 'text/plain', muteHttpExceptions: true, followRedirects: true,
      payload: JSON.stringify({ acao: acao, chave: chave, quem: usuario.nome || usuario.email }) });
    r = JSON.parse(resp.getContentText());
  } catch (e) {
    return { ok: false, erro: 'a planilha de controle não respondeu (confira se o App da Web está implantado com acesso "Qualquer pessoa")' };
  }
  if (!r || !r.ok) return { ok: false, erro: (r && r.erro) || 'resposta inválida da planilha de controle' };
  const est = r.estado || {};
  // terminou com contas novas: lê a PROGRAMAÇÃO de novo para Contas a pagar e a ficha já mostrarem
  if (est.estado === 'pronto' && est.importadas > 0) {
    const props = PropertiesService.getScriptProperties();
    if (String(props.getProperty('IMPORT_CACHE_FIM') || '') !== String(est.fimEm)) {
      props.setProperty('IMPORT_CACHE_FIM', String(est.fimEm));
      try { programacaoComCache_(true); } catch (e) { console.error('Cache após importar: ' + e.message); }
    }
  }
  if (acao === 'importar') console.log('Importação de contas pedida pelo portal por ' + (usuario.email || '?'));
  return { ok: true, estado: est, jaEmAndamento: !!r.jaEmAndamento };
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
  try { const c = lerCobrancas(); if (c.ok) gravarCacheGrande_(CACHE_COB_, c); else Logger.log('Cobranças: ' + c.erro); } catch (e) { Logger.log('Cobranças: ' + e.message); }
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
    pix: col('PIX COPIA E COLA'), sit: col('SITUACAO'), usCod: col('CODIGO USINA'), usNome: col('NOME USINA'), pago: col('DATA DE PAGAMENTO') };
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
      situacao: (txt(r, C.sit) || 'AGENDADO').toUpperCase(), usinaCod: txt(r, C.usCod).replace(/\.0+$/, ''), usinaNome: txt(r, C.usNome), pagoEm: txt(r, C.pago) });
  }
  return base;
}

/**
 * Marca uma conta da PROGRAMAÇÃO como PAGO (ou volta para AGENDADO) pelo site — é a ÚNICA escrita na planilha de controle.
 * Grava a SITUAÇÃO daquela conta (com uma nota de quem marcou e quando) e a DATA DE PAGAMENTO
 * (dia em que pagamos a RGE = dia em que marcou PAGO; desmarcar apaga). Se a coluna DATA DE PAGAMENTO
 * não existir, ela é criada no fim da aba.
 * Confere se a linha ainda é a mesma conta (alguém pode ter ordenado a aba); se não for, procura a conta pelo nome/vencimento/link/PIX.
 * A conta que implantou o script do portal precisa ter permissão de EDIÇÃO na planilha de controle.
 */
function programacaoSituacao(req, usuario) {
  const sit = String(req.situacao || '').toUpperCase();
  if (sit !== 'PAGO' && sit !== 'AGENDADO') return { ok: false, erro: 'situação inválida' };
  const k = req.conta || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'outra alteração está sendo gravada; tente de novo' };
  try {
    let ss;
    try { ss = SpreadsheetApp.openById(idPlanilhaControle_()); } catch (e) { return { ok: false, erro: 'não consegui abrir a planilha de controle' }; }
    const sh = ss.getSheetByName(ABA_PROGRAMACAO_EXT);
    if (!sh) return { ok: false, erro: 'aba ' + ABA_PROGRAMACAO_EXT + ' não encontrada' };
    const tz = ss.getSpreadsheetTimeZone();
    const up = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const larg = sh.getLastColumn();
    const cab = sh.getRange(1, 1, 1, larg).getValues()[0].map(up);
    const C = { nome: cab.indexOf('NOME DO TITULAR'), venc: cab.indexOf('DATA DE VENCIMENTO'), link: cab.indexOf('LINK DE ACESSO A CONTA'),
      pix: cab.indexOf('PIX COPIA E COLA'), sit: cab.indexOf('SITUACAO') };
    if (C.sit < 0 || C.nome < 0) return { ok: false, erro: 'não achei as colunas SITUAÇÃO e NOME DO TITULAR na PROGRAMAÇÃO' };
    const iso = x => x instanceof Date ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : String(x || '').trim().replace(/^(\d{2})\/(\d{2})\/(\d{4}).*/, '$3-$2-$1');
    const mesma = r => up(r[C.nome]) === up(k.nome) && (C.venc < 0 || iso(r[C.venc]) === String(k.venc || '')) &&
      (!k.link || C.link < 0 || String(r[C.link]).trim() === k.link) && (!k.pix || C.pix < 0 || String(r[C.pix]).trim() === k.pix);
    let linha = Number(req.linha) || 0;
    if (!(linha >= 2 && linha <= sh.getLastRow() && mesma(sh.getRange(linha, 1, 1, larg).getValues()[0]))) {
      linha = 0;
      if (sh.getLastRow() >= 2) {
        const v = sh.getRange(2, 1, sh.getLastRow() - 1, larg).getValues();
        for (let i = 0; i < v.length; i++) if (mesma(v[i])) { linha = i + 2; break; }
      }
    }
    if (!linha) return { ok: false, erro: 'não achei esta conta na PROGRAMAÇÃO (pode ter sido apagada ou alterada). Clique em Atualizar.' };
    const cel = sh.getRange(linha, C.sit + 1);
    const agora = new Date();
    const pagoEm = sit === 'PAGO' ? Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy') : '';
    try {
      cel.setValue(sit);
      const quando = Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
      cel.setNote((sit === 'PAGO' ? 'Marcado PAGO' : 'Voltou para AGENDADO') + ' pelo portal por ' + (usuario.nome || usuario.email) + ' em ' + quando);
      let cPago = cab.indexOf('DATA DE PAGAMENTO');
      if (cPago < 0) {   // primeira vez: cria a coluna no fim, sem mexer nas outras
        cPago = larg;
        sh.getRange(1, cPago + 1).setValue('DATA DE PAGAMENTO').setFontWeight('bold');
        sh.getRange(2, cPago + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('dd/MM/yyyy');
      }
      const cd = sh.getRange(linha, cPago + 1);
      if (sit === 'PAGO') cd.setValue(Utilities.parseDate(pagoEm + ' 12:00', 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm')).setNumberFormat('dd/MM/yyyy');
      else cd.clearContent();
    } catch (e) {
      return { ok: false, erro: 'sem permissão para editar a planilha de controle: compartilhe ela como Editor com a conta que implantou o script do portal' };
    }
    // atualiza a leitura guardada, sem precisar ler a planilha toda de novo
    try {
      const c = lerCacheGrande_(CACHE_PROG_);
      if (c && c.contas) {
        const it = c.contas.find(x => x.linha === linha && up(x.nome) === up(k.nome)) || c.contas.find(x => up(x.nome) === up(k.nome) && x.venc === k.venc);
        if (it) { it.situacao = sit; it.pagoEm = pagoEm; delete c.doCache; gravarCacheGrande_(CACHE_PROG_, c); }
      }
    } catch (e) {}
    console.log('Situação ' + sit + ' na linha ' + linha + ' da PROGRAMAÇÃO por ' + usuario.email);
    return { ok: true, linha: linha, situacao: sit, pagoEm: pagoEm };
  } finally { lock.releaseLock(); }
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

/* ======================================================================
 * RATEIO DE CRÉDITOS (TI e Admin)
 * Divide a geração estimada de uma usina no mês entre as UCs beneficiárias. O CÁLCULO é feito no site
 * (igual ao Excel Fluxo_Rateio.xlsx); aqui ficam só os cadastros e o histórico, em abas da planilha do portal.
 * As abas são criadas sozinhas na primeira vez que o TI abre a tela. Preencha direto nelas (uma linha por item).
 * ====================================================================== */
const RAT_ABAS_ = {
  usinas:  { nome: 'Rateio Usinas', cols: ['Unidade Geradora UC', 'Nome da UG', 'Geração Anual (kWh)', 'Concessionária', 'Início Operação (AAAAMM)', 'Inativar (X)'],
             chaves: ['ug', 'nome', 'geracaoAnual', 'concessionaria', 'inicio', 'inativa'] },
  benef:   { nome: 'Rateio Beneficiárias', cols: ['Número da UC', 'CNPJ/CPF', 'Favorecido', 'Unidade Geradora', 'Nome da UG', 'Titular da UC',
             'Tipo Fornecimento', 'Consumo Referência kWh', 'Desconto', 'Grupo Tarifário', 'Início Titularidade (AAAAMM)', 'Término Titularidade (AAAAMM)', 'Observações', 'Fator Ajuste'],
             chaves: ['uc', 'doc', 'favorecido', 'ug', 'nomeUg', 'titular', 'fornecimento', 'consumoRef', 'desconto', 'grupo', 'inicio', 'termino', 'obs', 'fator'] },
  geracao: { nome: 'Rateio Geração', cols: ['Unidade Geradora', 'Ano', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
             chaves: ['ug', 'ano', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'] },
  consumo: { nome: 'Rateio Consumo', cols: ['Número da UC', 'Mês Referência (AAAAMM)', 'Consumo kWh', 'Energia Compensada kWh', 'Saldo Acumulado kWh',
             'Custo Mínimo kWh', 'Data Leitura', 'Data Emissão', 'Data Leitura Anterior', 'Origem'],
             chaves: ['uc', 'mes', 'consumo', 'compensada', 'saldo', 'minimo', 'leitura', 'emissao', 'leituraAnt', 'origem'] },
  gerados: { nome: 'Rateios Gerados', cols: ['ID', 'Gerado em', 'Gerado por', 'Unidade Geradora', 'Nome da UG', 'Ano Mês Ref', 'Geração Estimada kWh', 'Base',
             'Número da UC', 'Titular', 'Rateio %', 'Injeção kWh', 'Rateio Manual', 'Fator Ajuste', 'Situação'],
             chaves: ['id', 'geradoEm', 'geradoPor', 'ug', 'nomeUg', 'mes', 'geracao', 'base', 'uc', 'titular', 'pct', 'kwh', 'manual', 'fator', 'situacao'] }
};

function ratAba_(k) {
  const ss = SpreadsheetApp.getActive(), def = RAT_ABAS_[k];
  let sh = ss.getSheetByName(def.nome);
  if (!sh) {
    sh = ss.insertSheet(def.nome);
    sh.getRange(1, 1, 1, def.cols.length).setValues([def.cols]).setFontWeight('bold').setBackground('#ede7f6');
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < def.cols.length) {   // aba criada numa versão anterior: acrescenta as colunas novas
    sh.getRange(1, sh.getLastColumn() + 1, 1, def.cols.length - sh.getLastColumn()).setValues([def.cols.slice(sh.getLastColumn())])
      .setFontWeight('bold').setBackground('#ede7f6');
  }
  return sh;
}

/** Lê uma aba de rateio como lista de objetos (datas viram dd/MM/aaaa; AAAAMM vira número de 6 dígitos). */
function ratLer_(k) {
  const sh = ratAba_(k), def = RAT_ABAS_[k];
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const anoMes = v => {
    if (v instanceof Date) return Number(Utilities.formatDate(v, tz, 'yyyyMM'));
    const t = String(v == null ? '' : v).trim(), m = t.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) return Number(m[2]) * 100 + Number(m[1]);
    const d = t.replace(/\D/g, '');
    return d.length === 6 ? Number(d) : (t ? t : '');
  };
  return sh.getRange(2, 1, n, def.cols.length).getValues()
    .filter(r => String(r[0]).trim() !== '')
    .map(r => {
      const o = {};
      def.chaves.forEach((c, i) => {
        let v = r[i];
        if (/^(inicio|termino|mes)$/.test(c)) v = anoMes(v);
        else if (v instanceof Date) v = Utilities.formatDate(v, tz, c === 'geradoEm' ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy');
        else if (/^(ug|uc|doc|id)$/.test(c)) v = String(v).trim().replace(/\.0+$/, '');
        o[c] = v;
      });
      return o;
    });
}

/**
 * Cadastra ou altera uma usina do rateio (abas Rateio Usinas e Rateio Geração da planilha do portal).
 * A usina é achada pela UC geradora (só os números): se já existe, a linha é atualizada; senão, entra uma nova.
 * A geração estimada vai numa linha por ano (Jan a Dez); meses deixados em branco não apagam o que já estava lá.
 */
function ratUsinaSalvar(u, usuario) {
  const dig = x => String(x == null ? '' : x).replace(/\.0+$/, '').replace(/\D/g, '');
  const ug = String(u.ug || '').trim(), nome = String(u.nome || '').trim();
  if (dig(ug).length < 7) return { ok: false, erro: 'informe a UC geradora (pelo menos 7 números)' };
  if (!nome) return { ok: false, erro: 'informe o nome da usina' };
  const ano = Number(u.ano) || 0;
  const meses = Array.isArray(u.meses) ? u.meses.slice(0, 12).map(v => v === '' || v == null || !isFinite(Number(v)) || Number(v) < 0 ? '' : Math.round(Number(v))) : [];
  const inicio = String(u.inicio || '').replace(/\D/g, '');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'outra gravação em andamento; tente de novo' };
  try {
    // usinas
    const shU = ratAba_('usinas'), lu = RAT_ABAS_.usinas.cols.length;
    const vU = shU.getLastRow() > 1 ? shU.getRange(2, 1, shU.getLastRow() - 1, lu).getValues() : [];
    let iU = vU.findIndex(r => dig(r[0]) === dig(ug));
    const criada = iU < 0;
    if (criada && u.novo === false) return { ok: false, erro: 'usina não encontrada (pode ter sido apagada da planilha)' };
    if (!criada && u.novo === true) return { ok: false, erro: 'já existe uma usina com essa UC geradora: use Editar', existe: true };
    // geração
    const shG = ratAba_('geracao'), lg = RAT_ABAS_.geracao.cols.length;
    const vG = shG.getLastRow() > 1 ? shG.getRange(2, 1, shG.getLastRow() - 1, lg).getValues() : [];
    let linhaG = null;
    if (ano > 2000 && meses.some(v => v !== '')) {
      let iG = vG.findIndex(r => dig(r[0]) === dig(ug) && Number(r[1]) === ano);
      if (iG < 0) { linhaG = [ug, ano].concat(Array(12).fill('')); vG.push(linhaG); iG = vG.length - 1; }
      else linhaG = vG[iG];
      meses.forEach((v, k) => { if (v !== '') linhaG[2 + k] = v; });
      shG.getRange(2 + iG, 1, 1, lg).setValues([linhaG]);
    }
    const somaAno = linhaG ? linhaG.slice(2).reduce((t, v) => t + (Number(v) || 0), 0) : 0;
    // "Geração Anual" = soma do ano atual (outro ano só preenche se ainda estiver vazio)
    const anoHoje = Number(Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMM').slice(0, 4));
    const anualAntes = criada ? '' : vU[iU][2];
    const anual = somaAno && (ano === anoHoje || anualAntes === '' || anualAntes == null) ? somaAno : (anualAntes !== '' && anualAntes != null ? anualAntes : (Number(u.geracaoAnual) || ''));
    const linhaU = [ug, nome, anual, String(u.concessionaria || 'RGE').trim(),
      inicio.length === 6 ? Number(inicio) : (criada ? '' : vU[iU][4]), u.inativa ? 'X' : ''];
    if (criada) shU.getRange(shU.getLastRow() + 1, 1, 1, lu).setValues([linhaU]);
    else shU.getRange(2 + iU, 1, 1, lu).setValues([linhaU]);
    console.log('Rateio: usina ' + ug + (criada ? ' cadastrada' : ' alterada') + ' por ' + usuario.email);
    return { ok: true, criada: criada, usina: { ug: ug, nome: nome, geracaoAnual: linhaU[2], concessionaria: linhaU[3], inicio: linhaU[4], inativa: linhaU[5] },
      geracao: linhaG ? { ug: ug, ano: ano, m: linhaG.slice(2) } : null };
  } finally { lock.releaseLock(); }
}

function ratDados() {
  const out = { ok: true };
  Object.keys(RAT_ABAS_).forEach(k => { out[k] = ratLer_(k); });
  out.gerados = out.gerados.slice(-3000);
  out.planilha = SpreadsheetApp.getActive().getUrl();
  return out;
}

/** Guarda um rateio calculado no site: uma linha por UC na aba Rateios Gerados. */
function ratSalvar(d, usuario) {
  const linhas = Array.isArray(d.linhas) ? d.linhas : [];
  const ug = String(d.ug || '').trim(), mes = Number(d.mes) || 0, ger = Number(d.geracao) || 0;
  if (!ug || !(mes > 200000) || !(ger > 0) || !linhas.length) return { ok: false, erro: 'rateio incompleto (usina, mês, geração e UCs)' };
  const soma = linhas.reduce((t, l) => t + (Number(l.pct) || 0), 0);
  if (Math.abs(soma - 1) > 0.00005) return { ok: false, erro: 'a soma do rateio não fecha 100% (' + (soma * 100).toFixed(2) + '%)' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'outra gravação em andamento; tente de novo' };
  try {
    const sh = ratAba_('gerados');
    const agora = new Date();
    const id = 'RAT-' + ug + '-' + mes + '-' + Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyMMddHHmmss');
    const quem = usuario.nome || usuario.email;
    const rows = linhas.map(l => [id, agora, quem, ug, String(d.nomeUg || ''), mes, ger, String(d.base || ''),
      String(l.uc || ''), String(l.titular || ''), Number(l.pct) || 0, Math.round((Number(l.kwh) || 0) * 100) / 100,
      l.manual == null || l.manual === '' ? '' : Number(l.manual), l.fator == null ? '' : Number(l.fator), 'GERADO']);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    sh.getRange(sh.getLastRow() - rows.length + 1, 11, rows.length, 1).setNumberFormat('0.00%');
    sh.getRange(sh.getLastRow() - rows.length + 1, 13, rows.length, 1).setNumberFormat('0.00%');
    console.log('Rateio ' + id + ' salvo por ' + usuario.email + ' (' + rows.length + ' UCs)');
    return { ok: true, id: id, geradoEm: Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') };
  } finally { lock.releaseLock(); }
}

/**
 * A UC já é cliente da OZZ? Usado pelo gerador quando a fatura tem energia injetada: se a UC já recebe
 * créditos da OZZ, a energia injetada é da OZZ (não é placa do cliente) e o consumo segue pela média.
 * Procura no cadastro do portal, na aba CLIENTES e na PROGRAMAÇÃO (UC nova ou antiga). Devolve só sim/não e onde.
 */
function ucDaOzz(uc) {
  const u = String(uc || '').replace(/\D/g, '');
  if (u.length < 7) return { ok: true, ozz: false };
  const d = v => String(v == null ? '' : v).replace(/\D/g, '');
  try { if (cadastroLinhas_(abaCadastro_()).some(r => d(cadastroObj_(r).uc) === u)) return { ok: true, ozz: true, onde: 'no cadastro do portal' }; } catch (e) {}
  try { if (lerClientesExternos_().some(x => d(x.uc) === u || d(x.uc_antiga) === u)) return { ok: true, ozz: true, onde: 'na aba CLIENTES' }; } catch (e) {}
  try { const p = programacaoComCache_(false); if (p.ok && p.contas.some(k => d(k.uc) === u || d(k.ucAntiga) === u)) return { ok: true, ozz: true, onde: 'na PROGRAMAÇÃO' }; } catch (e) {}
  return { ok: true, ozz: false };
}

/**
 * RATEIO · "Puxar da planilha de controle" (só LÊ a planilha de controle; escreve só nas abas de rateio do portal).
 *  - INVESTIDORES  → Rateio Usinas (UC geradora nova ou antiga) e Rateio Geração (GERAÇÃO MENSAL nos 12 meses do ano, como estimativa)
 *  - CLIENTES      → Rateio Beneficiárias (só CONECTADO / CONECTADA…; a usina vem pelo nome do INVESTIDOR; MÉDIA = consumo de referência)
 *  - abas dos meses (JUNHO…NOVEMBRO) → Rateio Consumo: INJETADO e SALDO. A aba é o mês de PAGAMENTO: a aba OUTUBRO é a fatura ref. SETEMBRO.
 *  - RATEIOS, blocos "NOVO RATEIO" (de baixo) → último rateio enviado de cada usina (Rateios Gerados, situação IMPORTADO).
 *    Usina que não está nos blocos de baixo: usa o bloco de cima só se a soma der 100%.
 * Nunca apaga nem muda o que já foi lançado: só acrescenta linhas novas e completa células vazias.
 */
/**
 * Roda o "Puxar da planilha de controle" direto aqui no editor (sem depender da conexão do site).
 * Escolha esta função na barra de cima e clique em Executar; o resultado e o tempo de cada etapa aparecem no Registro.
 */
function puxarRateioPeloEditor() {
  const quem = { email: Session.getActiveUser().getEmail() || 'editor', nome: 'Apps Script (editor)' };
  ['usinas', 'benef', 'consumo', 'rateios'].forEach(etapa => {
    const t0 = Date.now();
    const r = ratImportarControle(quem, etapa);
    Logger.log(etapa + ': ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s → ' + JSON.stringify(r).slice(0, 500));
  });
}

// etapa: 'usinas' | 'benef' | 'consumo' | 'rateios' (o site chama uma por vez: cada chamada fica curta). Sem etapa = tudo.
function ratImportarControle(usuario, etapa) {
  const faz = x => !etapa || etapa === x;
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    // quase sempre é um "Puxar" anterior que ainda está rodando (leva de 30 s a 2 min)
    const em = cache.get('RAT_IMPORTANDO');
    if (em && Date.now() - Number(em.split('|')[2] || 0) < 6 * 60000) {
      const [quando, quem] = em.split('|');
      return { ok: false, emAndamento: true, erro: 'a importação que ' + (quem || 'alguém') + ' começou às ' + quando + ' ainda está rodando. Espere 1 ou 2 minutos e clique em Atualizar: não precisa puxar de novo.' };
    }
    return { ok: false, erro: 'a planilha está gravando outra coisa agora (outra pessoa salvando). Tente de novo em 1 minuto.' };
  }
  cache.put('RAT_IMPORTANDO', Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'HH:mm') + '|' + (usuario.nome || usuario.email) + '|' + Date.now(), 400);
  try {
    let ss;
    try { ss = SpreadsheetApp.openById(idPlanilhaControle_()); } catch (e) { return { ok: false, erro: 'não consegui abrir a planilha de controle' }; }
    const tz = ss.getSpreadsheetTimeZone();
    const up = x => String(x == null ? '' : x).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const dig = x => String(x == null ? '' : x).replace(/\.0+$/, '').replace(/\D/g, '');
    const num = x => typeof x === 'number' ? x : (String(x || '').trim() && isFinite(Number(String(x).replace(/\./g, '').replace(',', '.'))) ? Number(String(x).replace(/\./g, '').replace(',', '.')) : null);
    const txt = x => x instanceof Date ? Utilities.formatDate(x, tz, 'dd/MM/yyyy') : String(x == null ? '' : x).trim().replace(/\.0+$/, '');
    const avisos = [];
    const hojeAM = Number(Utilities.formatDate(new Date(), tz, 'yyyyMM')), anoAtual = Math.floor(hojeAM / 100), mesAtual = hojeAM % 100;
    // acha a linha de cabeçalho que tem todas as colunas pedidas e devolve {linha, col(nome) -> índice}
    const tabela = (nome, precisa) => {
      const sh = ss.getSheetByName(nome);
      if (!sh || sh.getLastRow() < 2) { avisos.push('aba ' + nome + ' não encontrada'); return null; }
      const v = sh.getDataRange().getValues();
      for (let i = 0; i < Math.min(v.length, 15); i++) {
        const cab = v[i].map(up);
        if (precisa.every(n => cab.indexOf(n) >= 0)) return { v: v, i: i, col: n => cab.indexOf(n) };
      }
      avisos.push('aba ' + nome + ': não achei o cabeçalho (' + precisa.join(', ') + ')');
      return null;
    };
    const res = { usinas: 0, geracao: 0, benef: 0, consumo: 0, rateios: 0, semUsina: [], conferir: [] };

    /* ---------- usinas e geração (INVESTIDORES) ---------- */
    const invPorNome = {};
    const ti = etapa === 'consumo' ? null : tabela('INVESTIDORES', ['INVESTIDOR', 'UC GERADORA']);
    if (ti) {
      const cNova = ti.col('NOVA UC GERADORA'), cUg = ti.col('UC GERADORA'), cNome = ti.col('INVESTIDOR'), cGer = ti.col('GERACAO MENSAL'),
        cConc = ti.col('CONCESSAO'), cSt = ti.col('STATUS');
      const shU = ratAba_('usinas'), jaU = {};
      if (faz('usinas')) ratLer_('usinas').forEach(u => { jaU[dig(u.ug)] = true; });
      const shG = ratAba_('geracao'), ano = anoAtual, jaG = {};
      if (faz('usinas')) ratLer_('geracao').forEach(g => { if (Number(g.ano) === ano) jaG[dig(g.ug)] = true; });
      const novasU = [], novasG = [];
      ti.v.slice(ti.i + 1).forEach(r => {
        const nome = String(r[cNome] || '').trim(); if (!nome) return;
        const ugTxt = cNova >= 0 && r[cNova] ? txt(r[cNova]) : txt(r[cUg]), ug = dig(ugTxt); if (ug.length < 7) return;
        const ger = cGer >= 0 ? num(r[cGer]) : null;
        invPorNome[up(nome)] = { ug: ugTxt, nome: nome };   // a UC fica escrita igual em todas as abas de rateio
        if (faz('usinas') && !jaU[ug]) {
          jaU[ug] = true;
          novasU.push([ugTxt, nome, ger ? Math.round(ger * 12) : '', cConc >= 0 ? txt(r[cConc]) : '', '',
            cSt >= 0 && /CANCEL|INATIV/i.test(String(r[cSt])) ? 'X' : '']);
        }
        if (faz('usinas') && ger && !jaG[ug]) { jaG[ug] = true; novasG.push([ugTxt, ano].concat(Array(12).fill(Math.round(ger)))); }
      });
      if (novasU.length) shU.getRange(shU.getLastRow() + 1, 1, novasU.length, novasU[0].length).setValues(novasU);
      if (novasG.length) shG.getRange(shG.getLastRow() + 1, 1, novasG.length, novasG[0].length).setValues(novasG);
      res.usinas = novasU.length; res.geracao = novasG.length;
    }
    const usinaDe = nome => {
      const k = up(nome); if (!k) return null;
      if (invPorNome[k]) return invPorNome[k];
      const ks = Object.keys(invPorNome).filter(n => n.indexOf(k) === 0 || k.indexOf(n) === 0);   // "NELSON ANTONIO ARNHOLD" x "NELSON ANTONIO ARNHO…"
      return ks.length === 1 ? invPorNome[ks[0]] : null;
    };

    /* ---------- beneficiárias (CLIENTES) ---------- */
    const tc = etapa === 'usinas' ? null : tabela('CLIENTES', ['CLIENTE', 'NOVA UC', 'INVESTIDOR']);
    const ucNova = {};   // UC antiga → nova, para ligar as outras abas
    if (tc) {
      const C = { nome: tc.col('CLIENTE'), nova: tc.col('NOVA UC'), antiga: tc.col('ANTIGA UC'), doc: tc.col('CPF/CNPJ') >= 0 ? tc.col('CPF/CNPJ') : tc.col('CPF CNPJ'),
        inv: tc.col('INVESTIDOR'), media: tc.col('MEDIA'), st: tc.col('STATUS'), resp: tc.col('RESPONSAVEL') };
      const shB = ratAba_('benef'), jaB = {};
      if (faz('benef')) ratLer_('benef').forEach(b => { jaB[dig(b.uc) + '|' + dig(b.ug)] = true; });   // a mesma UC pode receber de mais de uma usina
      const novas = [];
      tc.v.slice(tc.i + 1).forEach(r => {
        const nome = String(r[C.nome] || '').trim(); if (!nome || up(nome) === 'CLIENTE') return;
        const nova = C.nova >= 0 ? txt(r[C.nova]) : '', antiga = C.antiga >= 0 ? txt(r[C.antiga]) : '';
        if (dig(antiga) && dig(nova)) ucNova[dig(antiga)] = nova;
        if (!faz('benef')) return;
        const st = C.st >= 0 ? up(r[C.st]) : '';
        if (st && st.indexOf('CONECTAD') !== 0) return;          // só quem já recebe crédito
        const uc = dig(nova) ? nova : antiga; if (dig(uc).length < 7) return;
        const us = usinaDe(r[C.inv]);
        if (!us) { if (String(r[C.inv] || '').trim()) res.semUsina.push(nome + ' (' + String(r[C.inv]).trim() + ')'); return; }
        if (jaB[dig(uc) + '|' + dig(us.ug)]) return;
        jaB[dig(uc) + '|' + dig(us.ug)] = true;
        const media = C.media >= 0 ? num(r[C.media]) : null;
        novas.push([uc, C.doc >= 0 ? txt(r[C.doc]) : '', 'CONSÓRCIO', us.ug, us.nome, nome, '', media ? Math.round(media) : '', '', '', '', '',
          'Importado da planilha de controle' + (antiga && dig(nova) ? ' · UC antiga ' + antiga : ''), '']);
      });
      if (novas.length) shB.getRange(shB.getLastRow() + 1, 1, novas.length, novas[0].length).setValues(novas);
      res.benef = novas.length;
    }
    const ucCerta = (nova, antiga) => dig(nova).length >= 7 ? txt(nova) : (ucNova[dig(antiga)] || txt(antiga));

    /* ---------- saldo e injetado (abas dos meses) ---------- */
    if (faz('consumo')) {
    const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const shC = ratAba_('consumo'), larg = RAT_ABAS_.consumo.cols.length;
    const vC = shC.getLastRow() > 1 ? shC.getRange(2, 1, shC.getLastRow() - 1, larg).getValues() : [];
    const idxC = {};
    vC.forEach((r, i) => { idxC[dig(r[0]) + '|' + dig(r[1])] = i; });
    const novasC = [];
    let mudouC = false;
    // abas de meses que já entraram antes (pela coluna Origem) e o limite dos "últimos 3 meses"
    const jaTemAba = {};
    vC.forEach(r => { const m = String(r[larg - 1] || '').match(/aba ([^)]+)\)/); if (m) jaTemAba[up(m[1])] = true; });
    const recentes = (() => { let y = anoAtual, m = mesAtual - 3; if (m < 1) { m += 12; y--; } return y * 100 + m; })();
    ss.getSheets().forEach(sh => {
      const m = MESES.indexOf(up(sh.getName())); if (m < 0) return;
      // aba = mês de pagamento; a fatura é do mês anterior. Abas de meses depois do atual são do ano passado.
      let anoPg = anoAtual; if (m + 1 > mesAtual) anoPg--;
      let mesRef = m, anoRef = anoPg; if (mesRef === 0) { mesRef = 12; anoRef--; }
      const am = anoRef * 100 + mesRef;
      // abas antigas que já foram puxadas não mudam mais: só relê os últimos 3 meses (cada leitura na planilha de controle custa caro)
      if (am < recentes && jaTemAba[up(sh.getName())]) return;
      const nl = sh.getLastRow(), nc = sh.getLastColumn(); if (nl < 2 || nc < 1) return;
      const topo = sh.getRange(1, 1, Math.min(6, nl), nc).getValues();
      let hi = -1, cab = [];
      for (let i = 0; i < topo.length; i++) { const c = topo[i].map(up); if (c.indexOf('CLIENTE') >= 0 && c.indexOf('INJETADO') >= 0) { hi = i; cab = c; break; } }
      if (hi < 0 || nl <= hi + 1) return;
      const cUc = cab.indexOf('UC'), cNova = cab.indexOf('NOVA UC'), cInj = cab.indexOf('INJETADO'), cSaldo = cab.indexOf('SALDO');
      if (cSaldo < 0) return;   // só as abas que têm SALDO servem para o rateio
      // uma leitura só, do pedaço entre a primeira e a última coluna usada
      const usadas = [cUc, cNova, cInj, cSaldo].filter(c => c >= 0), c0 = Math.min.apply(null, usadas), c1 = Math.max.apply(null, usadas);
      const bloco = sh.getRange(hi + 2, c0 + 1, nl - hi - 1, c1 - c0 + 1).getValues();
      const col = c => c < 0 ? null : bloco.map(r => [r[c - c0]]);
      const kUc = col(cUc), kNova = col(cNova), kInj = col(cInj), kSaldo = col(cSaldo);
      kInj.forEach((_, j) => {
        const uc = ucCerta(kNova ? kNova[j][0] : '', kUc ? kUc[j][0] : ''); if (dig(uc).length < 7) return;
        const inj = num(kInj[j][0]), saldo = num(kSaldo[j][0]);
        if (inj == null && saldo == null) return;
        const k = dig(uc) + '|' + am;
        if (idxC[k] != null) {   // já existe (ex.: veio da proposta): só completa o que está vazio
          const row = idxC[k] >= 0 ? vC[idxC[k]] : null; if (!row) return;
          let mexeu = false;
          if (row[3] === '' && inj != null) { row[3] = inj; mexeu = true; }
          if (row[4] === '' && saldo != null) { row[4] = saldo; mexeu = true; }
          if (mexeu) { mudouC = true; row[larg - 1] = String(row[larg - 1] || '') + (row[larg - 1] ? ' + ' : '') + 'controle (aba ' + sh.getName() + ')'; }
          return;
        }
        const n = Array(larg).fill('');
        n[0] = uc; n[1] = am; n[3] = inj == null ? '' : inj; n[4] = saldo == null ? '' : saldo; n[larg - 1] = 'Planilha de controle (aba ' + sh.getName() + ')';
        idxC[k] = -1; novasC.push(n);
      });
    });
    if (mudouC && vC.length) shC.getRange(2, 1, vC.length, larg).setValues(vC);
    if (novasC.length) shC.getRange(shC.getLastRow() + 1, 1, novasC.length, larg).setValues(novasC);
    res.consumo = novasC.length;
    }

    /* ---------- último rateio enviado (RATEIOS) ---------- */
    const sr = ss.getSheetByName('RATEIOS');
    if (faz('rateios') && sr && sr.getLastRow() > 2) {
      const v = sr.getDataRange().getValues();
      let cab = null, baixo = false;
      const grupos = { cima: {}, baixo: {} };
      v.forEach(r => {
        const c0 = up(r[1]);
        if (c0.indexOf('NOVO RATEIO') === 0) { baixo = true; return; }
        if (c0 === 'CLIENTE') { cab = r.map(up); return; }
        if (!cab || !c0) return;
        const cInv = cab.indexOf('INVESTIDOR'), cPct = baixo ? cab.indexOf('NOVO RATEIO') : cab.indexOf('RATEIO');
        const pct = num(r[cPct]); if (pct == null) return;
        const us = usinaDe(r[cInv]); if (!us) return;
        const uc = ucCerta(r[cab.indexOf('NOVA UC')], r[cab.indexOf('UC')]); if (dig(uc).length < 7) return;
        const g = grupos[baixo ? 'baixo' : 'cima'];
        (g[dig(us.ug)] = g[dig(us.ug)] || { us: us, linhas: {} }).linhas[dig(uc)] = { uc: uc, titular: String(r[1]).trim(), pct: pct };
      });
      const jaR = {};
      ratLer_('gerados').forEach(x => { jaR[dig(x.ug)] = true; });
      const shR = ratAba_('gerados'), agora = new Date(), mesImp = anoAtual * 100 + mesAtual, novasR = [];
      Object.keys(grupos.cima).concat(Object.keys(grupos.baixo)).filter((x, i, a) => a.indexOf(x) === i).forEach(ug => {
        if (jaR[ug]) return;
        let g = grupos.baixo[ug], origem = 'IMPORTADO (último enviado)';
        if (!g) {
          g = grupos.cima[ug]; origem = 'IMPORTADO (bloco de cima — conferir)';
          const soma = Object.keys(g.linhas).reduce((t, k) => t + g.linhas[k].pct, 0);
          // não fecha 100%: entra mesmo assim, marcado "A CONFERIR" (o site não usa como rateio atual e lista em "Ver problemas")
          if (Math.abs(soma - 1) > 0.02) { res.conferir.push(g.us.nome + ' (soma ' + Math.round(soma * 100) + '%)'); origem = 'A CONFERIR (soma ' + Math.round(soma * 100) + '%)'; }
        }
        const id = 'RAT-IMPORT-' + ug;
        Object.keys(g.linhas).forEach(k => {
          const l = g.linhas[k];
          novasR.push([id, agora, 'Planilha de controle', g.us.ug, g.us.nome, mesImp, '', 'importado', l.uc, l.titular, l.pct, '', '', '', origem]);
        });
      });
      if (novasR.length) {
        shR.getRange(shR.getLastRow() + 1, 1, novasR.length, novasR[0].length).setValues(novasR);
        shR.getRange(shR.getLastRow() - novasR.length + 1, 11, novasR.length, 1).setNumberFormat('0.00%');
      }
      res.rateios = novasR.length;
    }
    res.avisos = avisos;
    res.semUsina = res.semUsina.slice(0, 30);
    console.log('Rateio: importação da planilha de controle por ' + usuario.email + ' → ' + JSON.stringify(res).slice(0, 400));
    return Object.assign({ ok: true }, res);
  } finally { cache.remove('RAT_IMPORTANDO'); lock.releaseLock(); }
}

/* ======================================================================
 * LEITOR DE FATURAS (TI e Admin): o site lê os PDFs da CPFL/RGE e manda os dados para cá.
 *  - aba "Faturas Lidas": tudo o que a fatura traz (uma linha por UC e mês; ler de novo a mesma fatura atualiza a linha)
 *  - aba "Rateio Consumo": consumo, energia injetada, saldo, mínimo e datas do mês da fatura (a fatura vale mais que
 *    a planilha de controle e a proposta, então sobrescreve esses campos) + os 12 meses do histórico (só os que faltam)
 *  - aba "Rateio Beneficiárias": completa o Tipo Fornecimento quando estiver vazio
 * ====================================================================== */
const COLS_FATURAS = ['Lido em', 'Lido por', 'Arquivo', 'UC', 'Titular', 'CPF/CNPJ', 'Distribuidora', 'Classe', 'Tipo Fornecimento', 'Tensão (V)',
  'Mês Ref (AAAAMM)', 'Vencimento', 'Valor Total (R$)', 'Consumo kWh', 'Energia Injetada kWh', 'Injetada por mês', 'Saldo kWh', 'Saldo a Expirar kWh',
  'Participação na Geração %', 'Custo Mínimo kWh', 'Leitura Anterior', 'Leitura Atual', 'Dias', 'Data Emissão', 'Nota Fiscal', 'Histórico 12 meses (kWh)'];

function faturasSalvar(lista, usuario) {
  lista = Array.isArray(lista) ? lista.slice(0, 200) : [];
  if (!lista.length) return { ok: false, erro: 'nenhuma fatura para guardar' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'outra gravação em andamento; tente de novo' };
  try {
    const ss = SpreadsheetApp.getActive();
    let sh = ss.getSheetByName('Faturas Lidas');
    if (!sh) { sh = ss.insertSheet('Faturas Lidas'); sh.getRange(1, 1, 1, COLS_FATURAS.length).setValues([COLS_FATURAS]).setFontWeight('bold').setBackground('#ede7f6'); sh.setFrozenRows(1); }
    else completaCabecalho_(sh, COLS_FATURAS);
    const dig = x => String(x == null ? '' : x).replace(/\.0+$/, '').replace(/\D/g, '');
    const nv = x => (x === '' || x == null || !isFinite(Number(x))) ? '' : Number(x);
    const am = x => { const n = Number(x); return n > 200001 && n < 210001 && n % 100 >= 1 && n % 100 <= 12 ? n : 0; };
    const larg = COLS_FATURAS.length;
    const vF = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, larg).getValues() : [];
    const idxF = {};
    vF.forEach((r, i) => { idxF[dig(r[3]) + '|' + dig(r[10])] = i; });
    // Rateio Consumo (uma linha por UC e mês)
    const shC = ratAba_('consumo'), lc = RAT_ABAS_.consumo.cols.length;
    const vC = shC.getLastRow() > 1 ? shC.getRange(2, 1, shC.getLastRow() - 1, lc).getValues() : [];
    const idxC = {};
    vC.forEach((r, i) => { const m = r[1] instanceof Date ? Number(Utilities.formatDate(r[1], 'America/Sao_Paulo', 'yyyyMM')) : dig(r[1]); idxC[dig(r[0]) + '|' + m] = i; });
    const novasF = [], novasC = [], forn = {}, res = { faturas: 0, atualizadas: 0, mesesConsumo: 0, historico: 0, ignoradas: [] };
    const agora = new Date(), quem = usuario.nome || usuario.email;
    lista.forEach(f => {
      const uc = String(f.uc || '').trim(), mes = am(f.mes);
      if (dig(uc).length < 7 || !mes) { res.ignoradas.push((f.arquivo || '?') + ' (sem UC ou mês de referência)'); return; }
      const hist = historicoValido_(f.historico);
      const linha = [agora, quem, String(f.arquivo || '').slice(0, 120), uc, String(f.titular || ''), String(f.doc || ''), String(f.distribuidora || ''),
        String(f.classe || ''), String(f.fornecimento || ''), nv(f.tensao), mes, String(f.vencimento || ''), nv(f.valor), nv(f.consumo), nv(f.injetada),
        String(f.injetadaMeses || ''), nv(f.saldo), nv(f.saldoExpirar), nv(f.participacao), nv(f.minimo), String(f.leituraAnt || ''), String(f.leitura || ''),
        nv(f.dias), String(f.emissao || ''), String(f.nf || ''),
        hist.map(h => String(h.mes).slice(4) + '/' + String(h.mes).slice(0, 4) + ': ' + h.kwh).join(' · ')].map(limpa);
      const kF = dig(uc) + '|' + mes;
      if (idxF[kF] != null) { vF[idxF[kF]] = linha; res.atualizadas++; } else { idxF[kF] = -1; novasF.push(linha); res.faturas++; }
      // mês da fatura → Rateio Consumo (a fatura sobrescreve consumo, injetada, saldo, mínimo e datas)
      const dados = { 2: nv(f.consumo), 3: nv(f.injetada), 4: nv(f.saldo), 5: nv(f.minimo), 6: String(f.leitura || ''), 7: String(f.emissao || ''), 8: String(f.leituraAnt || '') };
      const origem = 'Fatura PDF (' + Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy') + ')';
      const kC = dig(uc) + '|' + mes;
      if (idxC[kC] != null && idxC[kC] >= 0) {
        const r = vC[idxC[kC]];
        Object.keys(dados).forEach(c => { if (dados[c] !== '') r[c] = dados[c]; });
        r[lc - 1] = origem;
      } else if (idxC[kC] == null) {
        const r = Array(lc).fill(''); r[0] = uc; r[1] = mes;
        Object.keys(dados).forEach(c => { r[c] = dados[c]; }); r[lc - 1] = origem;
        idxC[kC] = -1; novasC.push(r);
      }
      res.mesesConsumo++;
      // histórico: só o consumo dos meses que ainda não estão lá (ou estão sem consumo)
      hist.forEach(h => {
        if (h.mes === mes) return;
        const k = dig(uc) + '|' + h.mes;
        if (idxC[k] != null) { if (idxC[k] >= 0 && vC[idxC[k]][2] === '') { vC[idxC[k]][2] = h.kwh; res.historico++; } return; }
        const r = Array(lc).fill(''); r[0] = uc; r[1] = h.mes; r[2] = h.kwh; r[lc - 1] = 'Histórico da fatura ' + String(mes).slice(4) + '/' + String(mes).slice(0, 4);
        idxC[k] = -1; novasC.push(r); res.historico++;
      });
      if (f.fornecimento) forn[dig(uc)] = String(f.fornecimento);
    });
    if (vF.length) sh.getRange(2, 1, vF.length, larg).setValues(vF);
    if (novasF.length) sh.getRange(sh.getLastRow() + 1, 1, novasF.length, larg).setValues(novasF);
    if (vC.length) shC.getRange(2, 1, vC.length, lc).setValues(vC);
    if (novasC.length) shC.getRange(shC.getLastRow() + 1, 1, novasC.length, lc).setValues(novasC);
    // tipo de fornecimento nas beneficiárias (só onde está vazio)
    if (Object.keys(forn).length) {
      const shB = ratAba_('benef');
      if (shB.getLastRow() > 1) {
        const vB = shB.getRange(2, 1, shB.getLastRow() - 1, 7).getValues();
        let mudou = false;
        vB.forEach(r => { const f = forn[dig(r[0])]; if (f && !String(r[6]).trim()) { r[6] = f; mudou = true; res.fornecimento = (res.fornecimento || 0) + 1; } });
        if (mudou) shB.getRange(2, 7, vB.length, 1).setValues(vB.map(r => [r[6]]));
      }
    }
    console.log('Leitor de faturas: ' + lista.length + ' por ' + usuario.email + ' → ' + JSON.stringify(res).slice(0, 300));
    return Object.assign({ ok: true }, res);
  } finally { lock.releaseLock(); }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
