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
  cli_listar: 'cli', cli_salvar: 'cli', cli_excluir: 'cli', cli_ficha: 'cli', cli_completar: 'ana', importar_contas: 'cli', importar_status: 'cli', prog_situacao: 'ana', cobrancas: 'ana', cob_cliente: 'ana', cob_marcar: 'ana', ctl_marcar: 'ana', cob_portal_gerar: 'ana', cob_portal_ajustar: 'ana', rat_dados: 'rat', rat_salvar: 'rat', rat_enviado: 'rat', rat_importar: 'rat', fat_salvar: 'rat', fat_pdf: 'rat', fat_pdf_organizar: 'rat', fat_pasta_listar: 'rat', fat_nl: 'rat', uc_tipos: 'cli', fat_pasta_baixar: 'rat', fat_pdf_ler: 'ana', rat_usina: 'rat', rat_titular: 'rat', uc_ozz: 'ger' };
const NOME_AREA_ = { ger: 'Geradores', pos: 'Pós-venda', ana: 'Análise', cli: 'Clientes', rat: 'Rateio' };

/* Cadastro de clientes do portal (aba "Clientes" desta planilha; não é a aba CLIENTES da planilha de controle) */
const ABA_CADASTRO = 'Clientes';
const COLS_CADASTRO = ['ID', 'Cadastrado em', 'Cadastrado por', 'Nome', 'CPF/CNPJ', 'Telefone', 'E-mail', 'Endereço', 'Cidade', 'UF', 'CEP',
  'UC', 'Distribuidora', 'Plano', 'Vendedor', 'Atualizado em', 'Atualizado por'];
const CAMPOS_CADASTRO = ['nome', 'doc', 'telefone', 'email', 'endereco', 'cidade', 'uf', 'cep', 'uc', 'distribuidora', 'plano', 'vendedor'];   // colunas D a O
/* A partir da versão 36 o cadastro do portal é o cadastro único do cliente: as Cobranças, o cálculo da cobrança e o Rateio
   usam estes dados primeiro (e só depois a planilha de controle). Colunas R em diante. */
const COLS_CADASTRO_EXTRA = ['UC antiga', 'UC geradora (usina)', 'Usina / investidor', 'Status', 'Entrada no rateio', 'Responsável',
  'Consumo médio (kWh)', 'Tipo de fornecimento', 'Desconto %', 'Desconto sobre', 'R$/kWh investidor', 'Origem'];
const CAMPOS_CADASTRO_EXTRA = ['ucAntiga', 'ug', 'usina', 'status', 'entrada', 'responsavel', 'consumo', 'fornecimento', 'descPct', 'descSobre', 'vlKwh', 'origem'];
COLS_CADASTRO.push.apply(COLS_CADASTRO, COLS_CADASTRO_EXTRA);
const CAD_X_ = 17;   // índice (base 0) da primeira coluna extra
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
  configVisitas_(cfg);
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

const VERSAO_SCRIPT = '51 (Cobranças: Pendente pela próxima leitura, Enviar e Disponível upload da fatura)';
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
    if (req.acao === 'buscar') return json(buscarPorUC(req.uc, req.numero));
    if (req.acao === 'programacao') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para ver a análise', auth: true });
      const pr = programacaoComCache_(!!req.forcar);
      // faturas lidas no Leitor: Contas a pagar confere o valor e mostra o PDF
      if (pr && pr.ok) { try { pr.faturas = fatResumo_().map(f => ({ uc: f.uc, mes: f.mes, valor: f.valor, pdf: f.pdf })); } catch (e) {} }
      return json(pr);
    }
    if (/^cli_/.test(req.acao)) {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para usar o cadastro de clientes', auth: true });
      if (req.acao === 'cli_listar') return json(cadastroListar(usuario));
      if (req.acao === 'cli_completar') return json(cadastroCompletar(!!req.aplicar, usuario));
      if (req.acao === 'cli_salvar') return json(cadastroSalvar(req.dados || {}, usuario));
      if (req.acao === 'cli_excluir') return json(cadastroExcluir(req.id, usuario));
      if (req.acao === 'cli_ficha') return json(cadastroFicha(req.id, usuario));
    }
    if (req.acao === 'prog_situacao') return json(programacaoSituacao(req, usuario));
    if (req.acao === 'uc_ozz') return json(ucDaOzz(req.uc));
    if (req.acao === 'rat_titular') {
      if (!usuario.email || !temRat_(usuario)) return json({ ok: false, erro: 'o rateio é só para TI e Admin', perfil: true });
      return json(ratTitularSalvar(req.usina || {}, usuario));
    }
    if (req.acao === 'rat_usina') {
      if (!usuario.email || !temRat_(usuario)) return json({ ok: false, erro: 'o rateio é só para TI e Admin', perfil: true });
      return json(ratUsinaSalvar(req.usina || {}, usuario));
    }
    if (req.acao === 'pos_visitas') {   // ficha do cliente (Cobranças e Clientes): quem vê pós-venda, análise ou clientes
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google', auth: true });
      if (!PERFIS_[usuario.perfil].areas.some(a => a === 'pos' || a === 'ana' || a === 'cli'))
        return json({ ok: false, erro: 'o perfil ' + PERFIS_[usuario.perfil].nome + ' não vê o pós-venda', perfil: true });
      return json(visitasDoCliente(req.ucs || [], req.nome || ''));
    }
    if (req.acao === 'uc_tipos') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google', auth: true });
      return json({ ok: true, mapa: tiposUc_() });
    }
    if (req.acao === 'fat_nl') {
      if (!usuario.email || !temRat_(usuario)) return json({ ok: false, erro: 'o leitor de faturas é só para TI e Admin', perfil: true });
      return json(fatNaoLidas(req.nl || {}, usuario));
    }
    if (req.acao === 'fat_pasta_listar' || req.acao === 'fat_pasta_baixar') {
      if (!usuario.email || !temRat_(usuario)) return json({ ok: false, erro: 'o leitor de faturas é só para TI e Admin', perfil: true });
      return json(req.acao === 'fat_pasta_listar' ? fatPastaListar(req.dados || {}) : fatPastaBaixar(req.dados || {}));
    }
    if (req.acao === 'fat_pdf_organizar') {
      if (!usuario.email || !temRat_(usuario)) return json({ ok: false, erro: 'só para TI e Admin', perfil: true });
      return json(fatPdfOrganizar(usuario));
    }
    if (req.acao === 'fat_pdf') {
      if (!usuario.email || !temRat_(usuario)) return json({ ok: false, erro: 'o leitor de faturas é só para TI e Admin', perfil: true });
      return json(faturaPdfSalvar(req.pdf || {}, usuario));
    }
    if (req.acao === 'fat_pdf_ler') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para ver a fatura', auth: true });
      return json(faturaPdfLer(req.fatura || {}));
    }
    if (req.acao === 'fat_salvar') {
      if (!usuario.email || !temRat_(usuario)) return json({ ok: false, erro: 'o leitor de faturas é só para TI e Admin', perfil: true });
      return json(faturasSalvar(req.faturas, usuario));
    }
    if (req.acao === 'rat_enviado') {
      if (!usuario.email || !temRat_(usuario)) return json({ ok: false, erro: 'o rateio é só para TI e Admin', perfil: true });
      return json(ratEnviado(req.rateio || {}, usuario));
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
    if (req.acao === 'cob_portal_gerar') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google', auth: true });
      return json(cobPortalGerar(usuario));
    }
    if (req.acao === 'cob_portal_ajustar') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google', auth: true });
      return json(cobPortalAjustar(req.cobranca || {}, usuario));
    }
    if (req.acao === 'ctl_marcar') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google', auth: true });
      return json(ctlMarcar(req.ctl || {}, usuario));
    }
    if (req.acao === 'cob_marcar') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para marcar a cobrança', auth: true });
      return json(cobMarcar(req.cobranca || {}, usuario));
    }
    if (req.acao === 'cob_cliente') {
      if (!usuario.email) return json({ ok: false, erro: 'faça login com Google para salvar', auth: true });
      return json(cobSalvarCliente(req.cliente || {}, usuario));
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
/** Proposta registrada: pelo número (quando vem do PDF) ou pela UC (a mais recente). Devolve também os dados do cliente
    que a proposta guardou, para o Termo completar o que o PDF não traz. */
function buscarPorUC(uc, numero) {
  uc = String(uc || '').replace(/\D/g, '');
  numero = String(numero || '').trim();
  if (uc.length < 5 && !numero) return { ok: true, encontrada: false };
  const sh = SpreadsheetApp.getActive().getSheetByName(ABA_PROPOSTAS);
  if (!sh || sh.getLastRow() < 2) return { ok: true, encontrada: false };
  const larg = Math.min(sh.getLastColumn(), 25), v = sh.getRange(2, 1, sh.getLastRow() - 1, larg).getValues();
  const achar = f => { for (let i = v.length - 1; i >= 0; i--) if (f(v[i])) return v[i]; return null; };
  const r = (numero && achar(x => String(x[1]).trim() === numero)) || (uc.length >= 5 && achar(x => String(x[6]).replace(/\D/g, '') === uc));
  if (!r) return { ok: true, encontrada: false };
  const t = i => i < r.length && r[i] != null ? String(r[i]).trim() : '';
  const dt = r[0] instanceof Date ? Utilities.formatDate(r[0], 'America/Sao_Paulo', 'dd/MM/yyyy') : '';
  return { ok: true, encontrada: true, numero: t(1), data: dt, plano: t(14),
    dados: { titular: t(3), cpf: t(4), cnpj: t(5), codigo_uc: t(6), distribuidora: t(7), endereco: t(8), cep: t(9), cidade: t(10), uf: t(11),
      consumo: t(13), classe_uc: t(21), bairro: t(22), email: t(23), celular: t(24) } };
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

/* ---------- Pós-venda (app de visitas) na ficha do cliente ----------
 * As visitas ficam na planilha central "OZZ Visitas" (outro arquivo, com o próprio Apps Script que recebe os iPads).
 * O portal só LÊ a aba Visitas dela: o ID ou link vai em Config!B7. Nada é gravado lá. */
const ABA_VISITAS_EXT = 'Visitas';
function configVisitas_(cfg) {
  if (cfg && !String(cfg.getRange('A7').getValue())) {
    cfg.getRange('A7').setValue('Planilha de visitas (pós-venda)').setFontWeight('bold');
    cfg.getRange('C7').setValue('← ID ou link da planilha "OZZ Visitas" (a que recebe as visitas dos iPads). Vazio = a ficha não mostra o pós-venda');
  }
}

function lerVisitas_() {
  const cfg = SpreadsheetApp.getActive().getSheetByName(ABA_CONFIG);
  configVisitas_(cfg);
  let ref = cfg ? String(cfg.getRange('B7').getValue() || '').trim() : '';
  if (!ref) return { naoConfigurado: true, lista: [] };
  const m = ref.match(/\/d\/([a-zA-Z0-9_-]{20,})/); if (m) ref = m[1];
  const chave = 'visitas_' + ref.slice(-12), c = lerCacheGrande_(chave);
  if (c && c.em && Date.now() - c.em < 5 * 60 * 1000) return c;   // 5 minutos
  const sh = SpreadsheetApp.openById(ref).getSheetByName(ABA_VISITAS_EXT);
  if (!sh) throw new Error('a planilha de visitas não tem a aba ' + ABA_VISITAS_EXT);
  const ult = sh.getLastRow(), larg = sh.getLastColumn();
  if (ult < 2) return { em: Date.now(), lista: [] };
  const v = sh.getRange(1, 1, ult, larg).getValues(), cab = v[0].map(x => String(x || '').trim());
  const ci = n => cab.indexOf(n), cAss = ci('Assinatura');
  const links = cAss >= 0 ? sh.getRange(2, cAss + 1, ult - 1, 1).getRichTextValues().map(r => (r[0] && r[0].getLinkUrl()) || '') : [];
  const dt = x => x instanceof Date ? Utilities.formatDate(x, 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm') : String(x || '');
  const CAMPOS = { data: 'Data e hora', func: 'Funcionário', cliente: 'Cliente', uc: 'UC / código', nota: 'Nota', perfil: 'Perfil',
    motivo: 'Motivo da nota', economia: 'Economia vs. prometido', melhoria: 'Sugestão de melhoria', anot: 'Anotações',
    falta10: 'Falta para nota 10', problema: 'Problema relatado', tratativa: 'Tratativa', proximo: 'Próximo passo',
    indic: 'Nº de indicações', brinde: 'Brinde', brindeSt: 'Brinde status', status: 'Status', id: 'ID' };
  const idx = {}; Object.keys(CAMPOS).forEach(k => idx[k] = ci(CAMPOS[k]));
  const lista = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i], o = {};
    Object.keys(idx).forEach(k => { const j = idx[k]; o[k] = j < 0 ? '' : (k === 'data' ? dt(r[j]) : r[j] === null ? '' : r[j]); });
    if (!o.cliente && !o.uc) continue;
    o.ucDig = String(o.uc || '').replace(/\D/g, '');
    o.assinatura = links[i - 1] || '';
    lista.push(o);
  }
  const out = { em: Date.now(), lista };
  gravarCacheGrande_(chave, out);
  return out;
}

/** Visitas do pós-venda de um cliente: pela UC (nova ou antiga, só os dígitos) ou, sem UC na visita, pelo nome. Mais recentes primeiro. */
function visitasDoCliente(ucs, nome) {
  let base;
  try { base = lerVisitas_(); } catch (e) { return { ok: false, erro: 'não consegui ler a planilha de visitas: ' + e.message }; }
  if (base.naoConfigurado) return { ok: true, naoConfigurado: true, visitas: [] };
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const digs = (Array.isArray(ucs) ? ucs : [ucs]).map(u => String(u || '').replace(/\D/g, '')).filter(d => d.length >= 6);
  const nm = norm(nome);
  const visitas = base.lista.filter(o => (o.ucDig && digs.indexOf(o.ucDig) >= 0) || (nm.length >= 5 && norm(o.cliente) === nm))
    .map(o => { const x = Object.assign({}, o); delete x.ucDig; return x; })
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return { ok: true, visitas };
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
/* As cobranças ficam guardadas em duas abas DESTA planilha (a do portal), criadas sozinhas:
 *   "Cobranças"          uma linha por UC e aba de mês, copiada da planilha de controle (é reescrita a cada atualização)
 *   "Cobranças Clientes" uma linha por UC: dados do cliente + colunas do portal que NUNCA são apagadas na atualização
 *                        ("Entrada no rateio (ajuste manual)" e "Anotação")
 * Ler as abas dos meses da planilha de controle leva 1–2 min (passa do tempo que o site espera e dá "sem conexão").
 * Por isso a cópia roda em segundo plano: o acionador de 10 em 10 min (atualizarCacheProgramacao) e, quando alguém clica em
 * Atualizar, um acionador de uma vez (cobrancasPreparar). O site lê as abas daqui, que é rápido, e vai perguntando enquanto copia.
 * Cliente novo (nunca teve fatura) com entrada no rateio há até PRAZO_1A_FATURA_DIAS dias fica "Aguardando 1ª fatura",
 * fora das pendências. */
const PRAZO_1A_FATURA_DIAS = 90;
const ABA_COB = 'Cobranças';
const ABA_COB_CLI = 'Cobranças Clientes';
const COLS_COB = ['Chave', 'Mês', 'Aba', 'Linha', 'Mês ref. RGE', 'UC (chave)', 'Cliente', 'UC', 'Investidor', 'Vendedor', 'Fatura (R$)', 'Cobrança',
  'Vencimento RGE', 'STATUS (planilha)', 'Situação', 'Conta RGE', 'CONF', 'PGTO', 'REF PGTO', 'Observações', 'Lucro (planilha)', 'Investidor R$ (planilha)'];
const COLS_COB_CLI = ['UC (chave)', 'Cliente', 'UC', 'UC antiga', 'Investidor', 'Vendedor', 'Responsável', 'Telefone', 'Cidade', 'Status na CLIENTES',
  'Anexo G (planilha de controle)', 'Entrada no rateio (ajuste manual)', 'Anotação', 'Última conta RGE: ref.', 'Última conta RGE: vencimento',
  'Última conta RGE: valor', 'Última conta RGE: situação', 'Fora das abas', 'Não está na CLIENTES', 'Anotado por', 'Anotado em', 'Última conta RGE: link',
  'Desconto % (ASSINATURA)', 'Desconto sobre (ASSINATURA)', 'R$/kWh investidor (ASSINATURA)', 'Plano: mês do bloco da ASSINATURA',
  'Desconto % (ajuste manual)', 'Desconto sobre (ajuste manual)', 'R$/kWh investidor (ajuste manual)'];
const ABA_COB_AND = 'Cobranças Andamento';   // o que o portal marcou em cada cobrança (emitida, enviada, paga): nunca é apagada pela cópia
const COLS_COB_AND = ['Chave', 'UC (chave)', 'Mês', 'Cliente', 'Emitida em', 'Emitida por', 'Valor cobrado (R$)', 'Enviada em', 'Enviada por',
  'Vencimento', 'Paga em', 'Paga por', 'Atualizado em',
  // Controle do mês (versão 50): o que a equipe marcava nas colunas RGE, PGTO, CONF e OBSERVAÇÕES da aba do mês
  'RGE paga em', 'RGE paga por', 'PGTO', 'Conferido em', 'Conferido por', 'Observação do mês'];
const ABA_COB_US = 'Cobranças Usinas';   // UCs geradoras da planilha de controle (INVESTIDORES, FATURAS GERADOR, GERADORES - CONSÓRCIO)
const COLS_COB_US = ['UC', 'UC antiga', 'Usina / investidor', 'Origem'];
/* Cobrança criada pelo portal (versão 45): cada fatura da RGE lida de um cliente vira a cobrança do mês (o mesmo padrão
   que a planilha de controle usa para aquele cliente: aba do mês da referência ou do seguinte),
   com o cálculo da ASSINATURA (desconto do plano) e vencimento N dias antes do vencimento da conta da RGE (Config!B8, padrão 2).
   Os ajustes à mão ficam nas colunas "Valor ajustado", "Motivo do ajuste" e "Ajustado por" (o recálculo não apaga). */
const ABA_COB_PORTAL = 'Cobranças Portal';
const COLS_COB_PORTAL = ['Chave', 'UC (chave)', 'Mês', 'Mês ref. RGE', 'Cliente', 'UC da fatura', 'Vencimento RGE', 'Conta RGE (R$)', 'Sem a OZZ (R$)',
  'Desconto %', 'Desconto sobre', 'Desconto (R$)', 'Cobrança calculada (R$)', 'Injetada (kWh)', 'R$/kWh investidor', 'Investidor (R$)', 'Lucro (R$)',
  'Vencimento da cobrança', 'Valor ajustado (R$)', 'Motivo do ajuste', 'Ajustado por', 'Situação', 'Aviso', 'Plano de', 'Calculada em'];
const COB_NAO_REPASSA_ = /Art\.?\s*32[13]|Ajuste Saldo/i;   // parcelamento da distribuidora e ajuste de saldo não vão para o cliente (conferido com a ASSINATURA)
const SIT_COB_ = { pago: 'Pago', atrasado: 'Atrasado', vencida: 'Vencida', aguardando: 'Aguardando', enviar: 'Disponível upload da fatura', nao_emitiu: 'Não emitida',
  sem_fatura: 'Sem fatura', sem_status: 'Sem status', outro: 'Outro', aguarda_1a: 'Aguardando 1ª fatura' };

/**
 * Tipo de cada UC, numa regra só para o site inteiro (só lê abas da planilha do portal):
 *   usina       = está no Rateio Usinas ou na lista de usinas da planilha de controle (aba Cobranças Usinas)
 *   beneficiaria = está no cadastro do portal, na aba Cobranças Clientes ou no Rateio Beneficiárias (com a usina de onde recebe)
 * Usina vale mais que beneficiária. Devolve { dígitos da UC: [tipo, nome, usina] }. Fica 5 min no cache.
 */
function tiposUc_() {
  const cache = CacheService.getScriptCache();
  try { const c = cache.get('tipos_uc_v1'); if (c) return JSON.parse(c); } catch (e) {}
  const ss = SpreadsheetApp.getActive(), m = {}, dig = v => String(v == null ? '' : v).replace(/\.0+$/, '').replace(/\D/g, '');
  const t = x => String(x == null ? '' : x).trim();
  const usina = (ucs, nome) => ucs.map(dig).filter(u => u.length >= 7).forEach(u => { m[u] = ['usina', t(nome), '']; });
  const benef = (ucs, nome, us) => ucs.map(dig).filter(u => u.length >= 7).forEach(u => { if (!m[u]) m[u] = ['beneficiaria', t(nome), t(us)]; else if (m[u][0] === 'beneficiaria' && !m[u][2] && us) m[u][2] = t(us); });
  lerAbaCob_(ss.getSheetByName(ABA_COB_US)).forEach(o => usina([o['UC'], o['UC antiga']], o['Usina / investidor']));
  try { ratLer_('usinas').forEach(u => usina([u.ug], u.nome)); } catch (e) {}
  try { cadastroLinhas_(abaCadastro_()).forEach(r => { if (!t(r[0])) return; const o = cadastroObj_(r); benef([o.uc, o.ucAntiga], o.nome, o.usina); }); } catch (e) {}
  lerAbaCob_(ss.getSheetByName(ABA_COB_CLI)).forEach(o => benef([o['UC (chave)'], o['UC'], o['UC antiga']], o['Cliente'], o['Investidor']));
  try { ratLer_('benef').forEach(b => benef([b.uc], b.titular || b.favorecido, b.nomeUg)); } catch (e) {}
  try { cache.put('tipos_uc_v1', JSON.stringify(m), 300); } catch (e) {}
  return m;
}
const tipoUc_ = uc => { const d = String(uc == null ? '' : uc).replace(/\.0+$/, '').replace(/\D/g, ''); return d.length >= 7 ? (tiposUc_()[d] || null) : null; };

/** STATUS da aba do mês → código. */
function cobStatus_(st, fat) {
  const s = String(st == null ? '' : st).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^PAGO/.test(s)) return 'pago';
  if (/ATRAS|INADIMP/.test(s)) return 'atrasado';
  if (/^AGUARD/.test(s)) return 'aguardando';
  if (/ENVIAR/.test(s)) return 'enviar';
  if (/NAO EMIT|N EMIT/.test(s)) return 'nao_emitiu';
  if (!s) return fat > 0 ? 'sem_status' : 'sem_fatura';
  return 'outro';
}

/** Situação de cada linha de um cliente (as linhas dele, a data de entrada no rateio e hoje, tudo em AAAA-MM-DD). */
function cobSituacoes_(linhas, entrada, hoje) {
  const faturado = linhas.some(x => x.v > 0 && x.s !== 'nao_emitiu' && x.s !== 'sem_fatura');
  const dias = entrada ? Math.round((Date.parse(hoje + 'T12:00:00') - Date.parse(entrada + 'T12:00:00')) / 864e5) : null;
  const novoNoPrazo = !faturado && dias != null && dias >= 0 && dias <= PRAZO_1A_FATURA_DIAS;
  return linhas.map(x => {
    const a = x.and || {}, cob = a.venc || x.cob;
    let e = x.s;
    if (e === 'aguardando' && cob && cob < hoje) e = 'vencida';
    if ((e === 'nao_emitiu' || e === 'sem_fatura') && novoNoPrazo) e = 'aguarda_1a';
    // o que foi marcado no portal (emitida → enviada → paga) vale quando está mais adiantado que a planilha de controle
    if (a.paga) return 'pago';
    if (e === 'pago') return e;
    if (a.enviada) return e === 'atrasado' ? e : (cob && cob < hoje ? 'vencida' : 'aguardando');
    if (a.emitida && ['nao_emitiu', 'sem_fatura', 'aguarda_1a', 'sem_status', 'outro'].indexOf(e) >= 0) return 'enviar';
    return e;
  });
}

/** Andamento marcado no portal, por "UC|mês" (AAAA-MM-DD nas datas). */
function lerAndamento_() {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const iso = x => x instanceof Date && !isNaN(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : '';
  const t = x => String(x == null ? '' : x).trim(), m = {};
  lerAbaCob_(SpreadsheetApp.getActive().getSheetByName(ABA_COB_AND)).forEach(o => {
    const ch = t(o['Chave']); if (!ch) return;
    m[ch] = { emitida: iso(o['Emitida em']), emitidaPor: t(o['Emitida por']), valor: typeof o['Valor cobrado (R$)'] === 'number' ? o['Valor cobrado (R$)'] : null,
      enviada: iso(o['Enviada em']), enviadaPor: t(o['Enviada por']), venc: iso(o['Vencimento']), paga: iso(o['Paga em']), pagaPor: t(o['Paga por']), _linha: o._linha,
      rgePaga: iso(o['RGE paga em']), rgePor: t(o['RGE paga por']), pgto: t(o['PGTO']), conf: iso(o['Conferido em']), confPor: t(o['Conferido por']), obs: t(o['Observação do mês']) };
    const a = m[ch];
    if (!a.emitida && !a.enviada && !a.paga && !a.rgePaga && !a.pgto && !a.conf && !a.obs) delete m[ch];
  });
  return m;
}

/** Recalcula a coluna Situação das linhas de um cliente na aba Cobranças (depois de mudar a entrada no rateio ou o andamento). */
function cobRecalc_(k, entrada) {
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone(), shL = ss.getSheetByName(ABA_COB);
  if (!shL) return;
  const iso = x => x instanceof Date && !isNaN(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : '';
  if (entrada === undefined) {
    const o = lerAbaCob_(ss.getSheetByName(ABA_COB_CLI)).find(x => String(x['UC (chave)']) === k) || {};
    const cad = cadastroPorUc_(), d = v => String(v == null ? '' : v).replace(/\.0+$/, '').replace(/\D/g, '');
    const cd = cad[k] || cad[d(o['UC'])] || cad[d(o['UC antiga'])];
    entrada = (cd && cd.entrada) || iso(o['Entrada no rateio (ajuste manual)']) || iso(o['Anexo G (planilha de controle)']);
  }
  const and = lerAndamento_(), hoje = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const cabL = shL.getRange(1, 1, 1, shL.getLastColumn()).getValues()[0].map(x => String(x).trim()), cSit = cabL.indexOf('Situação') + 1;
  if (cSit < 1) return;
  const minhas = lerAbaCob_(shL).filter(x => String(x['UC (chave)']) === k).map(x => {
    const v = typeof x['Fatura (R$)'] === 'number' ? x['Fatura (R$)'] : null;
    return { _linha: x._linha, v: v, s: x['Aba'] === '(fora das abas)' ? 'sem_fatura' : cobStatus_(x['STATUS (planilha)'], v), cob: iso(x['Cobrança']),
      and: and[k + '|' + mesTxt_(x['Mês'])] };
  });
  const sit = cobSituacoes_(minhas, entrada, hoje);
  minhas.forEach((x, i) => shL.getRange(x._linha, cSit).setValue(SIT_COB_[sit[i]] || sit[i]));
}

/** O site marca uma cobrança: acao = emitida | enviada | paga | desfazer (volta o último passo).
    d = { k: UC (chave), c: mês AAAA-MM, data: AAAA-MM-DD (vencimento na "enviada", dia do pagamento na "paga"), valor } */
function cobMarcar(d, usuario) {
  const k = String(d && d.k || '').trim(), c = String(d && d.c || '').trim(), acao = String(d && d.acao || '');
  if (!k || !/^\d{4}-\d{2}$/.test(c)) return { ok: false, erro: 'cobrança não informada' };
  if (['emitida', 'enviada', 'paga', 'desfazer'].indexOf(acao) < 0) return { ok: false, erro: 'ação inválida' };
  const data = String(d.data || '').trim();
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: 'data inválida' };
  const valor = d.valor === '' || d.valor == null ? null : Number(d.valor);
  if (valor != null && !(valor >= 0)) return { ok: false, erro: 'valor inválido' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'a planilha está gravando as cobranças agora; tente de novo em 1 minuto' };
  try {
    const sh = abaCob_(ABA_COB_AND, COLS_COB_AND), tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim()), col = n => cab.indexOf(n) + 1;
    const ch = k + '|' + c, quem = usuario.nome || usuario.email || '';
    const hoje = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const dt = s2 => s2 ? new Date(Number(s2.slice(0, 4)), Number(s2.slice(5, 7)) - 1, Number(s2.slice(8, 10)), 12) : '';
    let o = lerAbaCob_(sh).find(x => String(x['Chave']).trim() === ch), linha;
    if (o) linha = o._linha;
    else {
      if (acao === 'desfazer') return { ok: false, erro: 'não há nada marcado nesta cobrança' };
      linha = Math.max(sh.getLastRow(), 1) + 1;
      const cli = lerAbaCob_(SpreadsheetApp.getActive().getSheetByName(ABA_COB_CLI)).find(x => String(x['UC (chave)']) === k) || {};
      sh.getRange(linha, col('Chave')).setValue(ch); sh.getRange(linha, col('UC (chave)')).setValue("'" + k);
      sh.getRange(linha, col('Mês')).setValue("'" + c); sh.getRange(linha, col('Cliente')).setValue(cli['Cliente'] || '');
      o = {};
    }
    const put = (n, v, fmt) => { const r = sh.getRange(linha, col(n)); r.setValue(v); if (fmt) r.setNumberFormat(fmt); };
    const tem = n => o[n] !== undefined && o[n] !== '' && o[n] !== null;
    if (acao === 'emitida') { put('Emitida em', dt(hoje), 'dd/MM/yyyy'); put('Emitida por', quem); put('Valor cobrado (R$)', valor == null ? '' : valor, '#,##0.00'); }
    if (acao === 'enviada') {
      if (!tem('Emitida em')) { put('Emitida em', dt(hoje), 'dd/MM/yyyy'); put('Emitida por', quem); }
      if (valor != null) put('Valor cobrado (R$)', valor, '#,##0.00');
      put('Enviada em', dt(hoje), 'dd/MM/yyyy'); put('Enviada por', quem); put('Vencimento', dt(data), 'dd/MM/yyyy');
    }
    if (acao === 'paga') { put('Paga em', dt(data || hoje), 'dd/MM/yyyy'); put('Paga por', quem); }
    if (acao === 'desfazer') {
      if (tem('Paga em')) { put('Paga em', ''); put('Paga por', ''); }
      else if (tem('Enviada em')) { put('Enviada em', ''); put('Enviada por', ''); put('Vencimento', ''); }
      else if (tem('Emitida em')) { put('Emitida em', ''); put('Emitida por', ''); put('Valor cobrado (R$)', ''); }
    }
    put('Atualizado em', Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') + ' · ' + quem);
    cobRecalc_(k);
    const a = lerAndamento_()[ch] || null;
    if (a) delete a._linha;
    console.log('Cobrança ' + ch + ': ' + acao + ' por ' + (usuario.email || '?'));
    return { ok: true, k: k, c: c, and: a };
  } finally { lock.releaseLock(); }
}

/** Controle do mês: marca na linha do cliente e mês (chave UC|AAAA-MM da aba Cobranças Andamento).
    d = { k, c, campo: 'rge' | 'pgto' | 'conf' | 'obs', valor, venc: AAAA-MM-DD da conta da RGE, ucs: [UCs do cliente] }.
    rge = true também marca PAGO na PROGRAMAÇÃO da planilha de controle (mesma UC e vencimento). */
const PGTO_OPCOES_ = ['REGULAR', 'ATRASO RGE', 'INADIMPLENTE', 'AGUARDANDO PGTO'];
function ctlMarcar(d, usuario) {
  const k = String(d && d.k || '').trim(), c = String(d && d.c || '').trim(), campo = String(d && d.campo || '');
  if (!k || !/^\d{4}-\d{2}$/.test(c)) return { ok: false, erro: 'cliente ou mês não informado' };
  if (['rge', 'pgto', 'conf', 'obs'].indexOf(campo) < 0) return { ok: false, erro: 'campo inválido' };
  let valor = d.valor;
  if (campo === 'pgto') { valor = String(valor || '').trim().toUpperCase(); if (valor && PGTO_OPCOES_.indexOf(valor) < 0) return { ok: false, erro: 'PGTO inválido' }; }
  if (campo === 'obs') valor = limpa(String(valor == null ? '' : valor).trim().slice(0, 500));
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'a planilha está gravando agora; tente de novo em 1 minuto' };
  let aviso = '';
  try {
    const sh = abaCob_(ABA_COB_AND, COLS_COB_AND), tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim()), col = n => cab.indexOf(n) + 1;
    const ch = k + '|' + c, quem = usuario.nome || usuario.email || '';
    let o = lerAbaCob_(sh).find(x => String(x['Chave']).trim() === ch), linha;
    if (o) linha = o._linha;
    else {
      linha = Math.max(sh.getLastRow(), 1) + 1;
      const cli = lerAbaCob_(SpreadsheetApp.getActive().getSheetByName(ABA_COB_CLI)).find(x => String(x['UC (chave)']) === k) || {};
      sh.getRange(linha, col('Chave')).setValue(ch); sh.getRange(linha, col('UC (chave)')).setValue("'" + k);
      sh.getRange(linha, col('Mês')).setValue("'" + c); sh.getRange(linha, col('Cliente')).setValue(cli['Cliente'] || String(d.nome || ''));
    }
    const put = (n, v, fmt) => { const r = sh.getRange(linha, col(n)); r.setValue(v); if (fmt) r.setNumberFormat(fmt); };
    const hoje = new Date();
    if (campo === 'rge') {
      if (valor) { put('RGE paga em', hoje, 'dd/MM/yyyy'); put('RGE paga por', quem); }
      else { put('RGE paga em', ''); put('RGE paga por', ''); }
    }
    if (campo === 'conf') {
      if (valor) { put('Conferido em', hoje, 'dd/MM/yyyy'); put('Conferido por', quem); }
      else { put('Conferido em', ''); put('Conferido por', ''); }
    }
    if (campo === 'pgto') put('PGTO', valor);
    if (campo === 'obs') put('Observação do mês', valor);
    put('Atualizado em', Utilities.formatDate(hoje, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') + ' · ' + quem);
  } finally { lock.releaseLock(); }
  // conta da RGE paga: a PROGRAMAÇÃO da planilha de controle também (fora do lock: abre outra planilha)
  if (campo === 'rge' && valor) {
    try {
      const venc = String(d.venc || ''), ucs = (Array.isArray(d.ucs) ? d.ucs : []).concat([k]).map(u => String(u || '').replace(/\D/g, '')).filter(u => u.length >= 7);
      if (/^\d{4}-\d{2}-\d{2}$/.test(venc) && ucs.length) {
        const pagos = {}; ucs.forEach(u => { pagos[u + '|' + venc] = 'Controle do mês, por ' + (usuario.nome || usuario.email || ''); });
        const n = progAplicarPagos_(pagos, 'Marcado PAGO no Controle do mês do portal');
        if (!n) aviso = 'a conta não foi achada na PROGRAMAÇÃO (UC e vencimento ' + venc.split('-').reverse().join('/') + ') ou já estava PAGO';
      } else aviso = 'sem o vencimento da conta da RGE: a PROGRAMAÇÃO não foi alterada';
    } catch (e) { aviso = 'não consegui marcar na PROGRAMAÇÃO: ' + e.message; }
  }
  const a = lerAndamento_()[k + '|' + c] || null;
  if (a) delete a._linha;
  return { ok: true, k: k, c: c, and: a, aviso: aviso };
}

function abaCob_(nome, cols) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#ede7f6');
    sh.setFrozenRows(1);
  } else completaCabecalho_(sh, cols);
  return sh;
}

/** Lê uma aba de cobranças como lista de objetos {coluna: valor}, achando as colunas pelo título. */
function lerAbaCob_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), cab = v[0].map(x => String(x).trim());
  return v.slice(1).map((r, i) => { const o = { _linha: i + 2 }; cab.forEach((c, j) => { if (c) o[c] = r[j]; }); return o; });
}

/** Copia o resultado da leitura da planilha de controle para as duas abas daqui (mantém as colunas do portal). */
function cobGravarAbas_(r) {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const hoje = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const data = iso => iso ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), 12) : '';
  const isoDe = x => x instanceof Date && !isNaN(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : '';
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw new Error('outra gravação das cobranças está em andamento');
  try {
    // ---- clientes: guarda o que o portal escreveu (entrada manual e anotação) antes de reescrever
    const shC = abaCob_(ABA_COB_CLI, COLS_COB_CLI), antes = {};
    lerAbaCob_(shC).forEach(o => { const k = String(o['UC (chave)'] || ''); if (k) antes[k] = o; });
    const ultMes = r.meses.length ? r.meses[r.meses.length - 1] : null;
    const cadUc = cadastroPorUc_(), digU = v => String(v == null ? '' : v).replace(/\.0+$/, '').replace(/\D/g, '');
    const entradaDe = {}, linhasC = r.clientes.map(c => {
      const a = antes[c.k] || {}, man = a['Entrada no rateio (ajuste manual)'];
      const cd = cadUc[c.k] || cadUc[digU(c.uc)] || cadUc[digU(c.ucA)];
      entradaDe[c.k] = (cd && cd.entrada) || isoDe(man) || c.anexo || '';
      const g = c.rge || {};
      return [c.k, c.n, c.uc, c.ucA, c.inv, c.vend, c.resp, c.tel, c.cid, c.stCli, c.anexo ? data(c.anexo) : c.anexoTxt, man || '', a['Anotação'] || '',
        g.ref || '', g.venc ? data(g.venc) : '', g.valor == null ? '' : g.valor, g.sit || '', c.fora ? 'SIM' : '', c.semCad ? 'SIM' : '',
        a['Anotado por'] || '', a['Anotado em'] || '', g.link || '',
        c.plano ? c.plano.pct : '', c.plano ? c.plano.sobre : '', c.plano && c.plano.vlKwh != null ? c.plano.vlKwh : '', c.plano ? c.plano.mes : '',
        a['Desconto % (ajuste manual)'] === undefined ? '' : a['Desconto % (ajuste manual)'], a['Desconto sobre (ajuste manual)'] || '',
        a['R$/kWh investidor (ajuste manual)'] === undefined ? '' : a['R$/kWh investidor (ajuste manual)']];
    });
    // cliente que saiu da leitura mas tem algo escrito pelo portal: a linha continua (não perde a anotação)
    Object.keys(antes).forEach(k => {
      if (r.clientes.some(c => c.k === k)) return;
      const a = antes[k];
      if (a['Entrada no rateio (ajuste manual)'] || a['Anotação'] || a['Desconto % (ajuste manual)'] !== '' && a['Desconto % (ajuste manual)'] !== undefined) linhasC.push(COLS_COB_CLI.map(c => a[c] === undefined ? '' : a[c]));
    });
    escreveAbaCob_(shC, COLS_COB_CLI, linhasC, [11, 12, 15], { 16: '#,##0.00' }, [1, 3, 4, 14]);
    // ---- cobranças: reescreve tudo
    const porCli = {}, and = lerAndamento_();
    r.cobrancas.forEach(x => { x.and = and[x.k + '|' + x.c]; (porCli[x.k] = porCli[x.k] || []).push(x); });
    r.clientes.forEach(c => { if (c.fora && ultMes) (porCli[c.k] = porCli[c.k] || []).push({ k: c.k, c: ultMes.comp, l: '', v: null, s: 'sem_fatura', st: '', ref: '', cob: '', vr: '', conf: '', rge: '', pg: '', refPg: '', obs: '', fora: true }); });
    const nomes = {}; r.clientes.forEach(c => { nomes[c.k] = c; });
    const abaDe = {}; r.meses.forEach(m => { abaDe[m.comp] = m.aba; });
    const linhas = [];
    Object.keys(porCli).forEach(k => {
      const l = porCli[k], sit = cobSituacoes_(l, entradaDe[k], hoje), c = nomes[k] || {};
      l.forEach((x, i) => linhas.push([k + '|' + x.c + '|' + (x.l || 'fora'), x.c, x.fora ? '(fora das abas)' : abaDe[x.c] || '', x.l || '', x.ref || '', k, c.n || '', c.uc || '',
        c.inv || '', c.vend || '', x.v == null ? '' : x.v, x.cob ? data(x.cob) : '', x.vr ? data(x.vr) : '', x.st || '', SIT_COB_[sit[i]] || sit[i],
        x.rge || '', /^\d{4}-\d{2}-\d{2}$/.test(x.conf) ? data(x.conf) : x.conf || '', x.pg || '', x.refPg || '', x.obs || '',
        x.lu == null ? '' : x.lu, x.iv == null ? '' : x.iv]));
    });
    linhas.sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : String(a[6]).localeCompare(String(b[6])));
    escreveAbaCob_(abaCob_(ABA_COB, COLS_COB), COLS_COB, linhas, [12, 13, 17], { 11: '#,##0.00', 21: '#,##0.00', 22: '#,##0.00' }, [1, 2, 5, 6, 8]);
    // usinas (UCs geradoras) da planilha de controle: a regra do tipo de UC usa
    const shU = abaCob_(ABA_COB_US, COLS_COB_US);
    escreveAbaCob_(shU, COLS_COB_US, (r.usinas || []).map(u => [u.uc, u.ucA, u.nome, u.origem]), [], {}, [1, 2]);
    try { CacheService.getScriptCache().remove('tipos_uc_v1'); } catch (e) {}
    const props = PropertiesService.getScriptProperties();
    props.setProperty('COB_SYNC', JSON.stringify({ em: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'), avisos: r.avisos || [] }));
  } finally { lock.releaseLock(); }
}

/** Mês AAAA-MM de uma célula: o Google Sheets transforma o texto "2026-11" em data (01/11/2026), então aceita os dois. */
function mesTxt_(x) {
  if (x instanceof Date && !isNaN(x)) return Utilities.formatDate(x, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM');
  const t = String(x == null ? '' : x).trim();
  let m = t.match(/^(\d{4})-(\d{2})/); if (m) return m[1] + '-' + m[2];
  m = t.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})/); if (m) return m[2] + '-' + String(m[1]).padStart(2, '0');
  m = t.match(/^(\d{1,2})\/(\d{4})$/); if (m) return m[2] + '-' + String(m[1]).padStart(2, '0');
  return t;
}

/** Reescreve o corpo de uma aba (cabeçalho fica), com formato de data/número nas colunas indicadas (1 = primeira). */
function escreveAbaCob_(sh, cols, linhas, colsData, colsNum, colsTexto) {
  const larg = Math.max(sh.getLastColumn(), cols.length), cab = sh.getRange(1, 1, 1, larg).getValues()[0].map(x => String(x).trim());
  // a ordem das colunas pode ter mudado à mão: escreve cada coluna no lugar do seu título
  const pos = cols.map(c => cab.indexOf(c));
  const corpo = linhas.map(l => { const row = Array(larg).fill(''); pos.forEach((p, i) => { if (p >= 0) row[p] = l[i] === undefined || l[i] === null ? '' : l[i]; }); return row; });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, larg).clearContent();
  // meses ("2026-11") e UCs como TEXTO: senão o Google Sheets transforma em data ou número
  (colsTexto || []).forEach(c => { const p = pos[c - 1]; if (p >= 0 && corpo.length) sh.getRange(2, p + 1, corpo.length, 1).setNumberFormat('@'); });
  if (corpo.length) {
    sh.getRange(2, 1, corpo.length, larg).setValues(corpo);
    colsData.forEach(c => { const p = pos[c - 1]; if (p >= 0) sh.getRange(2, p + 1, corpo.length, 1).setNumberFormat('dd/MM/yyyy'); });
    Object.keys(colsNum || {}).forEach(c => { const p = pos[Number(c) - 1]; if (p >= 0) sh.getRange(2, p + 1, corpo.length, 1).setNumberFormat(colsNum[c]); });
  }
}

/** Plano do cliente para o cálculo: o ajuste manual vale mais que o que veio da ASSINATURA (campo a campo). */
function planoDe_(o) {
  const nm = x => typeof x === 'number' && isFinite(x) ? x : null, tx = x => String(x == null ? '' : x).trim().toLowerCase();
  const p = { pct: nm(o['Desconto % (ASSINATURA)']), sobre: tx(o['Desconto sobre (ASSINATURA)']) || 'total', vlKwh: nm(o['R$/kWh investidor (ASSINATURA)']),
    mes: o['Plano: mês do bloco da ASSINATURA'] instanceof Date ? Utilities.formatDate(o['Plano: mês do bloco da ASSINATURA'], 'America/Sao_Paulo', 'yyyy-MM-dd') : String(o['Plano: mês do bloco da ASSINATURA'] || ''), manual: {} };
  if (nm(o['Desconto % (ajuste manual)']) != null) { p.pct = nm(o['Desconto % (ajuste manual)']); p.manual.pct = true; }
  if (/^(total|injetado)$/.test(tx(o['Desconto sobre (ajuste manual)']))) { p.sobre = tx(o['Desconto sobre (ajuste manual)']); p.manual.sobre = true; }
  if (nm(o['R$/kWh investidor (ajuste manual)']) != null) { p.vlKwh = nm(o['R$/kWh investidor (ajuste manual)']); p.manual.vlKwh = true; }
  if (p.pct != null && p.pct > 1) p.pct = p.pct / 100;   // digitado como 20 em vez de 0,2
  return p.pct == null && p.vlKwh == null ? null : p;
}

/** O cadastro do portal (Registrar cliente) vale mais que a planilha de controle: plano, entrada no rateio, status,
    usina, vendedor, responsável e telefone. Cliente CONECTADO que só existe no portal entra como "sem fatura" no último mês. */
function cobComCadastro_(clientes, cobs, meses, and) {
  let cad = {};
  try { cad = cadastroPorUc_(); } catch (e) { return clientes; }
  const dig = v => String(v == null ? '' : v).replace(/\.0+$/, '').replace(/\D/g, ''), usados = {};
  clientes.forEach(cl => {
    const o = cad[cl.k] || cad[dig(cl.uc)] || cad[dig(cl.ucA)];
    if (!o) return;
    usados[o.id] = true; cl.cadId = o.id;
    const pc = planoCadastro_(o);
    if (pc) {
      const p = cl.plano || { pct: null, sobre: 'total', vlKwh: null, mes: '', manual: {} };
      p.manual = p.manual || {};
      if (pc.pct != null) { p.pct = pc.pct; p.manual.pct = true; }
      if (pc.sobre) { p.sobre = pc.sobre; p.manual.sobre = true; }
      if (pc.vlKwh != null) { p.vlKwh = pc.vlKwh; p.manual.vlKwh = true; }
      p.origem = 'cadastro'; cl.plano = p;
    }
    if (o.entrada) { cl.anexo = o.entrada; cl.anexoManual = true; }
    if (o.status) cl.stCli = o.status;
    if (o.usina) cl.inv = o.usina;
    if (o.vendedor) cl.vend = o.vendedor;
    if (o.responsavel) cl.resp = o.responsavel;
    if (o.telefone) cl.tel = o.telefone;
  });
  const ult = Object.keys(meses).sort().pop(), ja = {};
  Object.keys(cad).forEach(u => {
    const o = cad[u];
    // só do portal: conectado, ou já no rateio (tem data de entrada) e não cancelado
    if (usados[o.id] || ja[o.id] || dig(o.uc).length < 7 || /CANCEL/i.test(o.status || '') || !(/CONECTAD/i.test(o.status || '') || o.entrada)) return;
    ja[o.id] = true;
    const k = dig(o.uc), pc = planoCadastro_(o);
    clientes.push({ k: k, n: o.nome, uc: o.uc, ucA: o.ucAntiga || '', inv: o.usina || '', vend: o.vendedor || '', resp: o.responsavel || '', tel: o.telefone || '',
      cid: o.cidade || '', stCli: o.status || '', anexo: o.entrada || '', anexoG: '', anexoManual: !!o.entrada, anexoTxt: '', nota: '', notaPor: '', notaEm: '',
      rge: null, fora: true, semCad: false, soPortal: true, cadId: o.id,
      plano: pc ? { pct: pc.pct, sobre: pc.sobre || 'total', vlKwh: pc.vlKwh, mes: '', origem: 'cadastro', manual: { pct: pc.pct != null, sobre: !!pc.sobre, vlKwh: pc.vlKwh != null } } : null });
    if (ult) cobs.push({ k: k, c: ult, l: 0, v: null, s: 'sem_fatura', st: '', ref: '', cob: '', vr: '', conf: '', rge: '', pg: '', refPg: '', obs: '', fora: true, and: (and || {})[k + '|' + ult] || null });
  });
  return clientes;
}

/** Ficha das Cobranças → cadastro do portal: grava a entrada no rateio e o plano (cria o cliente no cadastro se ainda não existir). */
function cobParaCadastro_(o, ent, plano, usuario) {
  const dig = v => String(v == null ? '' : v).replace(/\.0+$/, '').replace(/\D/g, '');
  const sh = abaCadastro_(), linhas = cadastroLinhas_(sh), t = x => String(x == null ? '' : x).trim();
  const ucs = [o['UC (chave)'], o['UC'], o['UC antiga']].map(dig).filter(u => u.length >= 7);
  let i = linhas.findIndex(r => String(r[0]).trim() && ucs.some(u => dig(r[11]) === u || dig(r[CAD_X_]) === u));
  const agora = new Date(), quem = usuario.nome || usuario.email || '';
  const X = n => CAD_X_ + CAMPOS_CADASTRO_EXTRA.indexOf(n);
  let linha;
  if (i < 0) {
    const row = Array(COLS_CADASTRO.length).fill('');
    row[0] = 'C' + Utilities.getUuid().replace(/-/g, '').slice(0, 9).toUpperCase(); row[1] = agora; row[2] = quem;
    row[3] = limpa(t(o['Cliente'])); row[5] = limpa(t(o['Telefone'])); row[8] = limpa(t(o['Cidade'])); row[11] = t(o['UC']) || t(o['UC (chave)']);
    row[12] = 'RGE'; row[14] = limpa(t(o['Vendedor']));
    row[X('ucAntiga')] = t(o['UC antiga']); row[X('usina')] = limpa(t(o['Investidor'])); row[X('status')] = limpa(t(o['Status na CLIENTES']));
    row[X('responsavel')] = limpa(t(o['Responsável'])); row[X('origem')] = 'Cobranças (ficha do cliente)';
    linha = sh.getLastRow() + 1;
    sh.getRange(linha, 4, 1, 12).setNumberFormat('@'); sh.getRange(linha, CAD_X_ + 1).setNumberFormat('@');
    sh.getRange(linha, 1, 1, row.length).setValues([row]);
  } else { linha = i + 2; sh.getRange(linha, 16, 1, 2).setValues([[agora, quem]]); }
  sh.getRange(linha, X('entrada') + 1).setValue(ent ? new Date(Number(ent.slice(0, 4)), Number(ent.slice(5, 7)) - 1, Number(ent.slice(8, 10)), 12) : '').setNumberFormat('dd/MM/yyyy');
  if (plano) {
    sh.getRange(linha, X('descPct') + 1).setValue(plano.pct === '' ? '' : Math.round(plano.pct * 100 * 100) / 100);
    sh.getRange(linha, X('descSobre') + 1).setValue(plano.sobre || '');
    sh.getRange(linha, X('vlKwh') + 1).setValue(plano.vlKwh === '' ? '' : plano.vlKwh);
  }
}

/** Faturas da RGE lidas pelo Leitor (aba Faturas Lidas), no formato das Cobranças: uma por UC e mês de referência. */
/* Próxima leitura da fatura (AAAA-MM-DD): a da própria conta; nas faturas lidas antes da versão 51, estimada
   pela leitura atual + os dias do ciclo (est = true). É o prazo para sair a conta do mês seguinte. */
function proxLeitura_(o, tz) {
  const d = x => {
    if (x instanceof Date && !isNaN(x)) return Utilities.formatDate(x, tz, 'yyyy-MM-dd');
    const m = String(x == null ? '' : x).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  };
  const p = d(o['Próxima Leitura']);
  if (p) return { d: p, est: false };
  const la = d(o['Leitura Atual']), dias = Number(o['Dias']) || 30;
  if (!la) return null;
  const t = new Date(la + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + (dias >= 25 && dias <= 35 ? dias : 30));
  return { d: t.toISOString().slice(0, 10), est: true };
}
function fatLidasCob_() {
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const iso = x => x instanceof Date && !isNaN(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : '';
  const t = x => x instanceof Date ? Utilities.formatDate(x, tz, 'dd/MM/yyyy') : String(x == null ? '' : x).trim();
  let tipos = {}; try { tipos = tiposUc_(); } catch (e) {}
  return lerAbaCob_(ss.getSheetByName('Faturas Lidas')).map(o => {
    const uc = String(o['UC'] == null ? '' : o['UC']).replace(/\.0+$/, '').replace(/\D/g, ''), m = String(o['Mês Ref (AAAAMM)'] || '').replace(/\D/g, '');
    if (uc.length < 7 || m.length !== 6) return null;
    const n = x => typeof x === 'number' && isFinite(x) ? x : null, vc = o['Vencimento'];
    return { uc: uc, ucTxt: t(o['UC']), ref: m.slice(0, 4) + '-' + m.slice(4), venc: vc instanceof Date ? Utilities.formatDate(vc, tz, 'yyyy-MM-dd') : String(vc || '').trim().replace(/^(\d{2})\/(\d{2})\/(\d{4}).*/, '$3-$2-$1'),
      prox: proxLeitura_(o, tz),
      tipo: /usina/i.test(t(o['Tipo da UC'])) ? 'usina' : ((tipos[uc] || [])[0] || ''), pdf: /\/d\//.test(t(o['PDF (Drive)'])), valor: n(o['Valor Total (R$)']), cons: n(o['Consumo kWh']), inj: n(o['Energia Injetada kWh']), saldo: n(o['Saldo kWh']), lido: iso(o['Lido em']), por: t(o['Lido por']),
      // linhas da conta (faturas lidas a partir da versão 34): o cálculo da cobrança usa
      itens: n(o['TUSD R$']) != null && n(o['TE R$']) != null ? { tusdTarifa: n(o['TUSD R$/kWh']), teTarifa: n(o['TE R$/kWh']), tusd: n(o['TUSD R$']), te: n(o['TE R$']),
        bandeira: n(o['Bandeira R$']) || 0, cip: n(o['Iluminação pública R$']) || 0, injKwh: n(o['Injetada (TE) kWh']) != null ? n(o['Injetada (TE) kWh']) : n(o['Energia Injetada kWh']),
        outros: t(o['Outros débitos e créditos']).split(' | ').map(x => { const m = x.match(/^(.*) = (-?[\d.]+)$/); return m ? { desc: m[1], valor: Number(m[2]) } : null; }).filter(Boolean) } : null };
  }).filter(Boolean);
}

/** O cálculo da cobrança (o mesmo da tela e da aba ASSINATURA). it = itens da fatura; plano = { pct (fração), sobre, vlKwh }. */
function cobCalc_(it, plano, contaRge) {
  const r2 = v => Math.round(v * 100) / 100;
  const tt = it.tusd + it.te, rep = (it.outros || []).filter(o => !COB_NAO_REPASSA_.test(o.desc)).reduce((a, o) => a + o.valor, 0);
  const sem = tt + (it.bandeira || 0) + (it.cip || 0) + rep;
  const base = plano.sobre === 'injetado' ? (it.injKwh || 0) * ((it.tusdTarifa || 0) + (it.teTarifa || 0)) + (it.bandeira || 0) : tt + (it.bandeira || 0);
  const desconto = plano.pct * base, cobranca = sem - desconto, investidor = plano.vlKwh != null ? (it.injKwh || 0) * plano.vlKwh : null;
  return { sem: r2(sem), desconto: r2(desconto), cobranca: r2(cobranca), investidor: investidor == null ? null : r2(investidor),
    lucro: contaRge != null ? r2(cobranca - contaRge - (investidor || 0)) : null };
}

const mesMais1_ = m => { let y = Number(m.slice(0, 4)), n = Number(m.slice(5, 7)) + 1; if (n > 12) { n = 1; y++; } return y + '-' + String(n).padStart(2, '0'); };

/** Dias antes do vencimento da RGE para vencer a cobrança (Config!B8; padrão 2). */
function cobDiasAntes_() {
  const cfg = SpreadsheetApp.getActive().getSheetByName(ABA_CONFIG);
  if (!cfg) return 2;
  if (!String(cfg.getRange('A8').getValue())) {
    cfg.getRange('A8').setValue('Cobrança: dias antes do venc. da RGE').setFontWeight('bold');
    cfg.getRange('B8').setValue(2);
    cfg.getRange('C8').setValue('← a cobrança criada pelo portal vence estes dias antes do vencimento da conta da RGE');
  }
  const v = Number(cfg.getRange('B8').getValue());
  return isFinite(v) && v >= 0 && v <= 60 ? Math.round(v) : 2;
}

/** Gera (ou recalcula) a aba Cobranças Portal a partir das faturas lidas. Chamar com o lock da planilha já pego.
    Não muda os valores de uma cobrança já emitida no portal (só avisa se o novo cálculo for diferente) e nunca apaga o ajuste à mão. */
function cobPortalGerar_() {
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const dig = v => String(v == null ? '' : v).replace(/\.0+$/, '').replace(/\D/g, '');
  const iso = x => x instanceof Date && !isNaN(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : String(x == null ? '' : x).trim();
  const data = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)), 12) : '';
  const num = x => typeof x === 'number' && isFinite(x) ? x : null;
  // clientes: aba Cobranças Clientes (planilha de controle + ASSINATURA) e o cadastro do portal (vale mais)
  const cli = {}, liga = (u, o) => { const d = dig(u); if (d.length >= 7 && !cli[d]) cli[d] = o; };
  let cad = {}; try { cad = cadastroPorUc_(); } catch (e) {}
  const doCad = (o, base) => {
    const pc = planoCadastro_(o), p = base.plano ? Object.assign({}, base.plano) : { pct: null, sobre: 'total', vlKwh: null };
    if (pc) { if (pc.pct != null) p.pct = pc.pct; if (pc.sobre) p.sobre = pc.sobre; if (pc.vlKwh != null) p.vlKwh = pc.vlKwh; base.planoDe = 'cadastro'; }
    base.plano = p.pct == null && p.vlKwh == null ? null : p;
    if (o.nome && !base.n) base.n = o.nome;
    if (o.entrada) base.entrada = o.entrada;
    return base;
  };
  lerAbaCob_(ss.getSheetByName(ABA_COB_CLI)).forEach(o => {
    const k = dig(o['UC (chave)']); if (!k) return;
    let b = { k: k, n: String(o['Cliente'] || ''), plano: planoDe_(o), planoDe: 'ASSINATURA' };
    if (b.plano && (b.plano.manual || {}).pct) b.planoDe = 'ajuste nas Cobranças';
    const cd = cad[k] || cad[dig(o['UC'])] || cad[dig(o['UC antiga'])];
    if (cd) b = doCad(cd, b);
    [k, o['UC'], o['UC antiga']].forEach(u => liga(u, b));
  });
  Object.keys(cad).forEach(u => {   // só no cadastro do portal
    if (cli[u]) return;
    const o = cad[u], b = doCad(o, { k: dig(o.uc) || u, n: o.nome, plano: null, planoDe: '' });
    [o.uc, o.ucAntiga].forEach(x => liga(x, b));
  });
  const sh = abaCob_(ABA_COB_PORTAL, COLS_COB_PORTAL), antes = {};
  lerAbaCob_(sh).forEach(o => { const ch = String(o['Chave'] || '').trim(); if (ch) antes[ch] = o; });
  const and = lerAndamento_(), dias = cobDiasAntes_(), agora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
  const res = { criadas: 0, recalculadas: 0, faltaPlano: 0, conferir: 0 }, linhas = {};
  // em que mês cobrar: cada cliente tem o seu padrão na planilha de controle (a fatura de ref. 10 vai para a aba de outubro
  // ou de novembro) e quase nunca muda. Vale o da última cobrança dele com ref.; cliente novo: o mês do vencimento da RGE.
  const nMes = m => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1, deN = n => Math.floor(n / 12) + '-' + String(n % 12 + 1).padStart(2, '0');
  const desloc = {}, ultC = {};
  lerAbaCob_(ss.getSheetByName(ABA_COB)).forEach(o => {
    const k = dig(o['UC (chave)']), c = mesTxt_(o['Mês']), r = mesTxt_(o['Mês ref. RGE']);
    if (!k || !/^\d{4}-\d{2}$/.test(c) || !/^\d{4}-\d{2}$/.test(r) || !(typeof o['Fatura (R$)'] === 'number' && o['Fatura (R$)'] > 0)) return;
    if (ultC[k] && ultC[k] > c) return;
    ultC[k] = c; desloc[k] = nMes(c) - nMes(r);
  });
  fatLidasCob_().forEach(f => {
    if (f.tipo === 'usina') return;
    const c = cli[f.uc]; if (!c) return;
    const dl = desloc[c.k] != null && desloc[c.k] >= 0 && desloc[c.k] <= 2 ? desloc[c.k] : null;
    const comp = dl != null ? deN(nMes(f.ref) + dl) : /^\d{4}-\d{2}/.test(f.venc) ? f.venc.slice(0, 7) : mesMais1_(f.ref);
    const ch = c.k + '|' + comp, a = antes[ch] || {}, an = and[ch];
    const avisos = [];
    let sit = 'Calculada', calc = null;
    if (!c.plano || c.plano.pct == null) { sit = 'Falta o plano'; res.faltaPlano++; }
    else if (!f.itens) { sit = 'Conferir'; avisos.push('a fatura foi lida antes da versão 34, sem as linhas da conta: leia o PDF de novo no Leitor'); }
    else calc = cobCalc_(f.itens, c.plano, f.valor);
    if (f.itens && !(f.itens.injKwh > 0)) { if (sit === 'Calculada') sit = 'Conferir'; avisos.push('a fatura não tem energia injetada (o cliente já recebe os créditos?)'); }
    let venc = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.venc)) { const d = data(f.venc); d.setDate(d.getDate() - dias); venc = Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }
    else avisos.push('sem o vencimento da conta da RGE');
    let L = [ch, c.k, comp, f.ref, c.n, f.ucTxt || f.uc, data(f.venc), f.valor == null ? '' : f.valor,
      calc ? calc.sem : '', c.plano && c.plano.pct != null ? c.plano.pct : '', c.plano ? c.plano.sobre || 'total' : '', calc ? calc.desconto : '', calc ? calc.cobranca : '',
      f.itens && f.itens.injKwh != null ? f.itens.injKwh : '', c.plano && c.plano.vlKwh != null ? c.plano.vlKwh : '', calc && calc.investidor != null ? calc.investidor : '',
      calc && calc.lucro != null ? calc.lucro : '', data(venc), a['Valor ajustado (R$)'] === undefined ? '' : a['Valor ajustado (R$)'], a['Motivo do ajuste'] || '',
      a['Ajustado por'] || '', '', '', c.plano ? c.planoDe : '', agora];
    const ajustada = num(a['Valor ajustado (R$)']) != null;
    if (ajustada && sit === 'Calculada') sit = 'Ajustada';
    if (an && (an.emitida || an.enviada || an.paga) && antes[ch]) {
      // já emitida: fica como estava; só avisa se a fatura nova deu outro valor
      const velho = num(a['Cobrança calculada (R$)']);
      L = COLS_COB_PORTAL.map(n => a[n] === undefined ? '' : a[n]);
      L[COLS_COB_PORTAL.indexOf('Calculada em')] = a['Calculada em'] || agora;
      if (calc && velho != null && Math.abs(calc.cobranca - velho) > 0.009) avisos.push('a fatura foi relida e o cálculo novo deu ' + calc.cobranca.toFixed(2).replace('.', ',') + ' (a cobrança já foi emitida: não mudei)');
      sit = 'Emitida';
    } else if (antes[ch]) res.recalculadas++; else res.criadas++;
    if (sit === 'Conferir') res.conferir++;
    L[COLS_COB_PORTAL.indexOf('Situação')] = sit;
    L[COLS_COB_PORTAL.indexOf('Aviso')] = avisos.join(' · ');
    linhas[ch] = L;
  });
  // cobrança que perdeu a fatura (linha apagada da Faturas Lidas) mas já foi emitida ou ajustada: continua
  Object.keys(antes).forEach(ch => {
    if (linhas[ch]) return;
    const a = antes[ch], an = and[ch];
    if ((an && (an.emitida || an.enviada || an.paga)) || num(a['Valor ajustado (R$)']) != null) linhas[ch] = COLS_COB_PORTAL.map(n => a[n] === undefined ? '' : a[n]);
  });
  const out = Object.keys(linhas).sort((x, y) => { const a = linhas[x], b = linhas[y]; return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : String(a[4]).localeCompare(String(b[4])); }).map(ch => linhas[ch]);
  out.forEach(L => [6, 17].forEach(i => { if (typeof L[i] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(L[i])) L[i] = data(L[i]); }));
  escreveAbaCob_(sh, COLS_COB_PORTAL, out, [7, 18], { 8: '#,##0.00', 9: '#,##0.00', 10: '0.00%', 12: '#,##0.00', 13: '#,##0.00', 16: '#,##0.00', 17: '#,##0.00', 19: '#,##0.00' }, [1, 2, 3, 4, 6]);
  res.total = out.length;
  return res;
}

/** Recalcula depois da cópia da planilha de controle (o plano e a ligação UC → cliente podem ter mudado). */
function cobPortalComLock_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try { cobPortalGerar_(); } catch (e) { Logger.log('Cobranças do portal: ' + e.message); } finally { lock.releaseLock(); }
}

/** Botão "Recalcular" das Cobranças (e 1ª vez, para as faturas já lidas). */
function cobPortalGerar(usuario) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, erro: 'a planilha está gravando agora; tente de novo em 1 minuto' };
  try { const r = cobPortalGerar_(); console.log('Cobranças do portal recalculadas por ' + (usuario.email || '?') + ': ' + JSON.stringify(r)); return Object.assign({ ok: true }, r); }
  finally { lock.releaseLock(); }
}

/** Ajuste à mão do valor de uma cobrança do portal (valor vazio = volta a valer o calculado). Pede o motivo. */
function cobPortalAjustar(d, usuario) {
  const ch = String(d && d.chave || '').trim(), motivo = String(d && d.motivo || '').trim().slice(0, 300);
  const valor = d && d.valor !== '' && d.valor != null ? Number(d.valor) : null;
  if (!ch) return { ok: false, erro: 'cobrança não informada' };
  if (valor != null && !(valor >= 0)) return { ok: false, erro: 'valor inválido' };
  if (valor != null && !motivo) return { ok: false, erro: 'diga o motivo do ajuste' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'a planilha está gravando agora; tente de novo em 1 minuto' };
  try {
    const sh = abaCob_(ABA_COB_PORTAL, COLS_COB_PORTAL), o = lerAbaCob_(sh).find(x => String(x['Chave']).trim() === ch);
    if (!o) return { ok: false, erro: 'não achei esta cobrança na aba ' + ABA_COB_PORTAL + ': clique em Recalcular' };
    const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim()), col = n => cab.indexOf(n) + 1;
    const quem = (usuario.nome || usuario.email || '') + ' em ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
    sh.getRange(o._linha, col('Valor ajustado (R$)')).setValue(valor == null ? '' : Math.round(valor * 100) / 100).setNumberFormat('#,##0.00');
    sh.getRange(o._linha, col('Motivo do ajuste')).setValue(valor == null ? '' : limpa(motivo));
    sh.getRange(o._linha, col('Ajustado por')).setValue(valor == null ? '' : quem);
    if (!/^(Emitida|Falta o plano|Conferir)$/.test(String(o['Situação']))) sh.getRange(o._linha, col('Situação')).setValue(valor == null ? 'Calculada' : 'Ajustada');
    return { ok: true, chave: ch, valor: valor, motivo: valor == null ? '' : motivo, por: valor == null ? '' : quem };
  } finally { lock.releaseLock(); }
}

/** As cobranças do portal, no formato da tela. */
function cobPortalLer_() {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const iso = x => x instanceof Date && !isNaN(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : '';
  const n = x => typeof x === 'number' && isFinite(x) ? x : null, t = x => String(x == null ? '' : x).trim();
  return lerAbaCob_(SpreadsheetApp.getActive().getSheetByName(ABA_COB_PORTAL)).filter(o => t(o['Chave'])).map(o => ({
    ch: t(o['Chave']), k: t(o['UC (chave)']).replace(/\D/g, ''), c: mesTxt_(o['Mês']), ref: mesTxt_(o['Mês ref. RGE']), n: t(o['Cliente']), uc: t(o['UC da fatura']),
    vr: iso(o['Vencimento RGE']), conta: n(o['Conta RGE (R$)']), sem: n(o['Sem a OZZ (R$)']), pct: n(o['Desconto %']), sobre: t(o['Desconto sobre']),
    desc: n(o['Desconto (R$)']), calc: n(o['Cobrança calculada (R$)']), inj: n(o['Injetada (kWh)']), vlKwh: n(o['R$/kWh investidor']), inv: n(o['Investidor (R$)']),
    lucro: n(o['Lucro (R$)']), venc: iso(o['Vencimento da cobrança']), aj: n(o['Valor ajustado (R$)']), motivo: t(o['Motivo do ajuste']), ajPor: t(o['Ajustado por']),
    sit: t(o['Situação']), aviso: t(o['Aviso']), planoDe: t(o['Plano de']), em: t(o['Calculada em']) }));
}

/** Lê as duas abas daqui e devolve no formato que a tela usa. null = ainda não foram preenchidas. */
function cobDados_() {
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const shC = ss.getSheetByName(ABA_COB_CLI), shL = ss.getSheetByName(ABA_COB);
  if (!shL || shL.getLastRow() < 2) return null;
  const iso = x => x instanceof Date && !isNaN(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : '';
  const t = x => x instanceof Date ? Utilities.formatDate(x, tz, 'dd/MM/yyyy') : String(x == null ? '' : x).trim();
  const clientes = lerAbaCob_(shC).filter(o => o['UC (chave)']).map(o => {
    const man = iso(o['Entrada no rateio (ajuste manual)']), anexo = iso(o['Anexo G (planilha de controle)']);
    const ref = mesTxt_(o['Última conta RGE: ref.']);
    return { k: t(o['UC (chave)']), n: t(o['Cliente']), uc: t(o['UC']), ucA: t(o['UC antiga']), inv: t(o['Investidor']), vend: t(o['Vendedor']),
      resp: t(o['Responsável']), tel: t(o['Telefone']), cid: t(o['Cidade']), stCli: t(o['Status na CLIENTES']),
      anexo: man || anexo, anexoG: anexo, anexoManual: !!man, anexoTxt: anexo ? '' : t(o['Anexo G (planilha de controle)']),
      nota: t(o['Anotação']), notaPor: t(o['Anotado por']), notaEm: t(o['Anotado em']),
      rge: ref ? { ref: ref, venc: iso(o['Última conta RGE: vencimento']), valor: typeof o['Última conta RGE: valor'] === 'number' ? o['Última conta RGE: valor'] : null, sit: t(o['Última conta RGE: situação']), link: /^https:\/\//i.test(t(o['Última conta RGE: link'])) ? t(o['Última conta RGE: link']) : '' } : null,
      fora: t(o['Fora das abas']) === 'SIM', semCad: t(o['Não está na CLIENTES']) === 'SIM', plano: planoDe_(o) };
  });
  const and = lerAndamento_();
  Object.keys(and).forEach(ch => { delete and[ch]._linha; });
  const meses = {}, cobs = lerAbaCob_(shL).filter(o => o['UC (chave)'] && o['Mês']).map(o => {
    const fora = t(o['Aba']) === '(fora das abas)', c = mesTxt_(o['Mês']), v = typeof o['Fatura (R$)'] === 'number' ? o['Fatura (R$)'] : null, st = t(o['STATUS (planilha)']);
    if (!fora) meses[c] = t(o['Aba']);
    return { k: t(o['UC (chave)']), c: c, l: Number(o['Linha']) || 0, v: v, s: fora ? 'sem_fatura' : cobStatus_(st, v), st: st, ref: mesTxt_(o['Mês ref. RGE']),
      cob: iso(o['Cobrança']), vr: iso(o['Vencimento RGE']), conf: iso(o['CONF']) || t(o['CONF']), rge: t(o['Conta RGE']), pg: t(o['PGTO']), refPg: t(o['REF PGTO']),
      obs: t(o['Observações']), fora: fora, and: and[t(o['UC (chave)']) + '|' + c] || null,
      lu: typeof o['Lucro (planilha)'] === 'number' ? o['Lucro (planilha)'] : null, iv: typeof o['Investidor R$ (planilha)'] === 'number' ? o['Investidor R$ (planilha)'] : null };
  });
  let sync = {}; try { sync = JSON.parse(PropertiesService.getScriptProperties().getProperty('COB_SYNC') || '{}'); } catch (e) {}
  const agora = new Date();
  // faturas da RGE lidas pelo Leitor (aba Faturas Lidas): uma por UC e mês de referência
  const faturas = fatLidasCob_();
  let portal = []; try { portal = cobPortalLer_(); portal.forEach(p => { p.and = and[p.k + '|' + p.c] || null; }); } catch (e) { console.error('Cobranças do portal: ' + e.message); }
  return { ok: true, hoje: Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy-MM-dd'), lidoEm: sync.em || '', avisos: sync.avisos || [],
    prazoDias: PRAZO_1A_FATURA_DIAS, meses: Object.keys(meses).sort().map(c => ({ comp: c, aba: meses[c] })), clientes: cobComCadastro_(clientes, cobs, meses, and), cobrancas: cobs, faturas: faturas, portal: portal, diasAntes: cobDiasAntes_() };
}

/** Pedido do site. Sem forcar: devolve o que está nas abas (e começa a primeira cópia se estiverem vazias).
    Com forcar: começa uma cópia nova em segundo plano e devolve o que já existe, com preparando = true. */
function cobrancasComCache_(forcar) {
  const props = PropertiesService.getScriptProperties();
  const d = cobDados_();
  let est = {}; try { est = JSON.parse(props.getProperty('COB_ESTADO') || '{}'); } catch (e) {}
  const rodando = est.estado === 'rodando' && Date.now() - (est.desde || 0) < 7 * 60000;
  if (d && !forcar && !rodando) return d;
  if (!rodando) {
    // terminou com erro há pouco: mostra o erro (Atualizar tenta de novo)
    if (!forcar && est.estado === 'erro' && Date.now() - (est.fim || 0) < 2 * 60000) {
      if (d) { d.avisos = (d.avisos || []).concat('a última cópia da planilha de controle deu erro: ' + est.erro); return d; }
      return { ok: false, erro: est.erro };
    }
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
  const r = d || { ok: true };
  r.preparando = true; r.desde = est.desde;
  return r;
}

/** Roda pelo acionador de uma vez (ou no editor, para testar): lê a planilha de controle e grava as abas de cobranças. */
function cobrancasPreparar() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'cobrancasPreparar').forEach(t => ScriptApp.deleteTrigger(t));
  const props = PropertiesService.getScriptProperties(), t0 = Date.now();
  let est;
  try {
    const r = lerCobrancas();
    if (r.ok) { cobGravarAbas_(r); cobPortalComLock_(); est = { estado: 'pronto', fim: Date.now() }; }
    else est = { estado: 'erro', erro: r.erro, fim: Date.now() };
  } catch (e) { est = { estado: 'erro', erro: String(e && e.message || e).slice(0, 300), fim: Date.now() }; }
  props.setProperty('COB_ESTADO', JSON.stringify(est));
  Logger.log('Cobranças: ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s → ' + JSON.stringify(est));
}

/** O site salva a entrada no rateio (ajuste manual; vazio = volta a valer o Anexo G) e a anotação de um cliente,
    e recalcula a Situação das linhas dele na aba Cobranças. */
function cobSalvarCliente(d, usuario) {
  const k = String(d && d.k || '').trim();
  if (!k) return { ok: false, erro: 'cliente não informado' };
  const ent = String(d.entrada || '').trim();
  if (ent && !/^\d{4}-\d{2}-\d{2}$/.test(ent)) return { ok: false, erro: 'data inválida' };
  const nota = String(d.nota == null ? '' : d.nota).trim().slice(0, 2000);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'a planilha está gravando as cobranças agora; tente de novo em 1 minuto' };
  try {
    const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
    const shC = ss.getSheetByName(ABA_COB_CLI), shL = ss.getSheetByName(ABA_COB);
    if (!shC || !shL) return { ok: false, erro: 'as abas de cobranças ainda não existem: clique em Atualizar' };
    const cab = shC.getRange(1, 1, 1, shC.getLastColumn()).getValues()[0].map(x => String(x).trim()), c = n => cab.indexOf(n) + 1;
    const o = lerAbaCob_(shC).find(x => String(x['UC (chave)']) === k);
    if (!o) return { ok: false, erro: 'não achei este cliente na aba ' + ABA_COB_CLI + ': clique em Atualizar' };
    const quando = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
    const dt = ent ? new Date(Number(ent.slice(0, 4)), Number(ent.slice(5, 7)) - 1, Number(ent.slice(8, 10)), 12) : '';
    shC.getRange(o._linha, c('Entrada no rateio (ajuste manual)')).setValue(dt).setNumberFormat('dd/MM/yyyy');
    shC.getRange(o._linha, c('Anotação')).setValue(nota ? limpa(nota) : '');
    shC.getRange(o._linha, c('Anotado por')).setValue(usuario.nome || usuario.email || '');
    shC.getRange(o._linha, c('Anotado em')).setValue(quando);
    if (d.plano) {   // ajuste manual do plano (vazio = volta a valer a ASSINATURA)
      const pp = d.plano, num = x => x === '' || x == null ? '' : Number(String(x).replace(',', '.'));
      const pct = num(pp.pct), vl = num(pp.vlKwh), sob = /^(total|injetado)$/.test(String(pp.sobre || '')) ? pp.sobre : '';
      if ((pct !== '' && !(pct >= 0 && pct <= 100)) || (vl !== '' && !(vl >= 0 && vl < 10))) return { ok: false, erro: 'plano inválido' };
      if (c('Desconto % (ajuste manual)') > 0) {
        shC.getRange(o._linha, c('Desconto % (ajuste manual)')).setValue(pct === '' ? '' : (pct > 1 ? pct / 100 : pct));
        shC.getRange(o._linha, c('Desconto sobre (ajuste manual)')).setValue(sob);
        shC.getRange(o._linha, c('R$/kWh investidor (ajuste manual)')).setValue(vl);
      }
    }
    // o cadastro do portal é o cadastro único: a entrada no rateio e o plano ficam lá também
    try {
      let pl = null;
      if (d.plano) {
        const num = x => x === '' || x == null ? '' : Number(String(x).replace(',', '.'));
        const p0 = num(d.plano.pct);
        pl = { pct: p0 === '' ? '' : (p0 > 1 ? p0 / 100 : p0), sobre: /^(total|injetado)$/.test(String(d.plano.sobre || '')) ? d.plano.sobre : '', vlKwh: num(d.plano.vlKwh) };
      }
      cobParaCadastro_(o, ent, pl, usuario);
    } catch (e) { console.error('Cobranças → cadastro: ' + e.message); }
    // recalcula a Situação das linhas deste cliente
    const iso = x => x instanceof Date && !isNaN(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : '';
    cobRecalc_(k, ent || iso(o['Anexo G (planilha de controle)']));
    if (d.plano) { try { cobPortalGerar_(); } catch (e) { console.error('Cobranças do portal: ' + e.message); } }   // o plano mudou: recalcula
    return { ok: true, k: k, entrada: ent, nota: nota, notaPor: usuario.nome || usuario.email || '', notaEm: quando };
  } finally { lock.releaseLock(); }
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
      vend: c('VENDEDOR'), conf: c('CONF'), rge: c('RGE'), ref: c('REF'), pg: c('PGTO'), refPg: c('REF PGTO'), obs: c('OBSERVACOES'), inv: c('INVESTIDOR'),
      lu: c('LUCRO'), ivR: cab.lastIndexOf('INVESTIDOR') };   // a 2ª coluna INVESTIDOR (depois de INJETADO) é o valor em R$
    if (C.ivR === C.inv) C.ivR = -1;
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
        pg: C.pg >= 0 ? txt(r[C.pg]).toUpperCase() : '', refPg: C.refPg >= 0 ? txt(r[C.refPg]).toUpperCase() : '', obs: C.obs >= 0 ? txt(r[C.obs]) : '',
        lu: C.lu >= 0 ? num(r[C.lu]) : null, iv: C.ivR >= 0 ? num(r[C.ivR]) : null });
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

  /* ---------- ASSINATURA: plano de cada cliente (o último bloco de cálculo dele) ----------
     Cada cliente, em cada mês, tem um bloco que começa na linha "Mes/Ref". Do bloco mais novo saem:
     % de desconto ("desconto aplicado"/"DESCONTO", ou o número escrito na fórmula do desconto), a base do desconto
     (sobre o total ou sobre o injetado: fórmula que aponta para "DESCONTO SOBRE O INJETADO" ou que multiplica o injetado)
     e o R$/kWh do investidor. Só lê o fim da aba (os meses mais recentes). */
  const planos = {};
  const shA = abas['ASSINATURA'];
  if (shA && shA.getLastRow() > 20) {
    const ult = shA.getLastRow(), ini = Math.max(1, ult - 8000), nl = ult - ini + 1;
    const v = shA.getRange(ini, 1, nl, 18).getValues(), fP = shA.getRange(ini, 16, nl, 1).getFormulas();
    const lb = x => N(x).toLowerCase();
    for (let i = 0; i < nl; i++) {
      if (lb(v[i][1]) !== 'mes ref') continue;
      const uc = v[i + 1] ? v[i + 1] : [];
      if (lb(uc[1]) !== 'uc') continue;
      const k = chave(uc[4], uc[2], '');
      if (k.indexOf('N:') === 0) continue;
      let pct = null, vl = null, sobre = 'total', fDesc = '';
      for (let j = i + 2; j < Math.min(nl, i + 24); j++) {
        if (lb(v[j][1]) === 'mes ref') break;
        const o = lb(v[j][14]), val = v[j][15], f = String(fP[j][0] || '');
        if ((o === 'desconto aplicado' || o === 'desconto') && typeof val === 'number' && val > 0 && val < 1 && !/\//.test(f)) pct = val;
        if (o === 'desconto' && typeof val === 'number' && val >= 1 && f) fDesc = f;
        if (o === 'investidor' && typeof val === 'number' && val > 0 && val < 3 && vl == null) vl = val;
      }
      if (fDesc) {
        const lit = fDesc.match(/(?:^=|[*(])\s*(0[.,]\d+)\s*\*/) || fDesc.match(/\*\s*(0[.,]\d+)\s*$/);
        if (pct == null && lit) pct = Number(lit[1].replace(',', '.'));
        const ref = fDesc.match(/^=\s*R(\d+)\s*$/);
        if (ref) { const r0 = Number(ref[1]) - ini; if (r0 >= 1 && /INJETADO/.test(N(v[r0 - 1][17]))) sobre = 'injetado'; }
        else if (/C\d+\s*\*\s*\(\s*L\d+/.test(fDesc)) sobre = 'injetado';
      }
      if (pct != null) planos[k] = { pct: Math.round(pct * 10000) / 10000, sobre: sobre, vlKwh: vl, mes: v[i][2] instanceof Date ? Utilities.formatDate(v[i][2], tz, 'yyyy-MM-dd') : '' };
    }
  } else avisos.push('aba ASSINATURA não encontrada (o plano de cada cliente não foi lido)');

  /* ---------- usinas (UCs geradoras): INVESTIDORES, FATURAS GERADOR e GERADORES - CONSÓRCIO ---------- */
  const usinasCtl = [], vistaU = {};
  const ucsDoTexto = x => (String(x == null ? '' : x).match(/\d{1,3}(?:\.\d{3}){1,2}\.00\d-\d{2}|\b(?:30|40)\d{8}\b/g) || []);   // UC nova termina em .001-XX (763.071.001-39, 1.597.422.001-78)
  [['INVESTIDORES', ['NOVA UC GERADORA', 'UC GERADORA']], ['FATURAS GERADOR', ['NOVA UC', 'UC']], ['GERADORES CONSORCIO', ['UC GERADORA']]].forEach(([aba, cols]) => {
    const sh = abas[aba]; if (!sh) return;
    const v = sh.getDataRange().getValues();
    const h = v.slice(0, 8).findIndex(r => r.map(N).indexOf('INVESTIDOR') >= 0 && cols.some(cn => r.map(N).indexOf(cn) >= 0));
    if (h < 0) return;
    const cab = v[h].map(N), ci = cab.indexOf('INVESTIDOR'), cc = cols.map(cn => cab.indexOf(cn)).filter(i => i >= 0);
    for (let i = h + 1; i < v.length; i++) {
      const nome = String(v[i][ci] || '').trim(); if (!nome || /^TOTAL/.test(N(nome))) continue;
      const ucs = [];
      cc.forEach(c => { const x = v[i][c]; if (typeof x === 'number' && Number.isInteger(x) && x > 1e9) ucs.push(String(x)); else ucsDoTexto(x).forEach(u => ucs.push(u)); });
      const nova = ucs.find(u => /\./.test(u)) || '', ant = ucs.find(u => !/\./.test(u)) || '';
      const k = dig(nova) || dig(ant); if (!k || vistaU[k + '|' + aba]) continue;
      vistaU[k + '|' + aba] = true;
      usinasCtl.push({ uc: nova, ucA: ant, nome: limparNome(nome) || nome, origem: sh.getName() });
    }
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
    const o = { ref: ref, est: !m, venc: ct.venc, valor: ct.valor, sit: ct.situacao, link: ct.link || '' };
    const a = ultRge[k];
    if (!a || ref > a.ref || (ref === a.ref && String(ct.venc) > String(a.venc))) ultRge[k] = o;
  });

  const lista = Object.keys(clientes).map(k => {
    const cl = clientes[k], o = cad[k] || {};
    return { k: k, n: o.n || cl.n, uc: cl.ucN || o.ucN || cl.ucA || o.ucA || '', ucA: cl.ucN && cl.ucA ? cl.ucA : (o.ucN && o.ucA ? o.ucA : ''),
      inv: cl.inv || o.inv || '', vend: cl.vend || o.vend || '', tel: o.tel || '', resp: o.resp || '', cid: o.cid || '',
      stCli: o.st || '', anexo: o.anexo || '', anexoTxt: o.anexoTxt || '', rge: ultRge[k] || null, fora: !!cl.foraDasAbas, semCad: !cad[k], plano: planos[k] || null };
  });
  return { ok: true, hoje: Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy-MM-dd'), lidoEm: Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
    meses: meses, clientes: lista, cobrancas: cobs, usinas: usinasCtl, avisos: avisos };
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
  // o plano e o % de desconto vêm da proposta (pelo número dela; sem número, a proposta mais nova da mesma UC)
  let plano = '', descPct = '';
  try {
    const np = txt(d.num_proposta), sp = SpreadsheetApp.getActive().getSheetByName(ABA_PROPOSTAS), nuc = dig(d.codigo_uc);
    if (sp && sp.getLastRow() > 1) {
      const v = sp.getRange(2, 1, sp.getLastRow() - 1, 16).getValues();
      let achou = -1;
      for (let i = v.length - 1; i >= 0 && achou < 0; i--) if (np && String(v[i][1]).trim() === np) achou = i;
      for (let i = v.length - 1; i >= 0 && achou < 0; i--) if (nuc.length >= 7 && dig(v[i][6]) === nuc) achou = i;
      if (achou >= 0) {
        plano = txt(v[achou][14]);
        const ds = v[achou][15], n = typeof ds === 'number' ? ds : Number(String(ds == null ? '' : ds).replace('%', '').replace(',', '.').trim());
        if (String(ds == null ? '' : ds).trim() !== '' && isFinite(n) && n > 0) descPct = n <= 1 ? Math.round(n * 10000) / 100 : Math.round(n * 100) / 100;
      }
    }
  } catch (e) {}
  const consumo = Number(String(d.consumo == null ? '' : d.consumo).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  // contrato e rateio no cadastro (só o que estiver vazio): desconto da proposta (sobre o total, como nos planos) e consumo médio
  const extrasDoTermo = { descPct: descPct, descSobre: descPct !== '' ? 'total' : '', consumo: consumo > 0 ? Math.round(consumo) : '', status: 'CONTRATO ASSINADO' };
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
      const extra = CAMPOS_CADASTRO_EXTRA.map(c => c === 'origem' ? 'Termo de adesão' : (extrasDoTermo[c] === undefined ? '' : extrasDoTermo[c]));
      sh.getRange(linha, 1, 1, COLS_CADASTRO.length).setValues([[novoId, agora, quem].concat(CAMPOS_CADASTRO.map(c => limpa(novo[c]))).concat(['', '']).concat(extra)]);
      return 'criado';
    }
    const atual = linhas[i];
    let mudou = false;
    const valores = CAMPOS_CADASTRO.map((c, k) => {
      const v = atual[3 + k];
      if (String(v == null ? '' : v).trim() === '' && novo[c]) { mudou = true; return limpa(novo[c]); }
      return v;
    });
    // desconto e consumo da proposta: só onde está vazio (o status "CONTRATO ASSINADO" não passa por cima de um que já existe)
    let mudouX = false;
    const vx = CAMPOS_CADASTRO_EXTRA.map((c, k) => {
      const v = atual[CAD_X_ + k];
      if (String(v == null ? '' : v).trim() === '' && extrasDoTermo[c] !== undefined && extrasDoTermo[c] !== '') { mudouX = true; return extrasDoTermo[c]; }
      return v === undefined ? '' : v;
    });
    if (!mudou && !mudouX) return 'igual';
    if (mudouX) sh.getRange(i + 2, CAD_X_ + 1, 1, vx.length).setValues([vx]);
    if (!mudou) { sh.getRange(i + 2, 16, 1, 2).setValues([[agora, quem]]); return 'completado'; }
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
  } else completaCabecalho_(sh, COLS_CADASTRO);
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
  CAMPOS_CADASTRO_EXTRA.forEach((c, i) => {
    const v = r[CAD_X_ + i];
    o[c] = v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd') : (typeof v === 'number' ? String(v) : String(v == null ? '' : v).trim());
  });
  return o;
}

/** Cadastro do portal por UC (a nova e a antiga, só os dígitos). */
function cadastroPorUc_() {
  const m = {}, dig = v => String(v == null ? '' : v).replace(/\.0+$/, '').replace(/\D/g, '');
  const sh = SpreadsheetApp.getActive().getSheetByName(ABA_CADASTRO);
  if (!sh || sh.getLastRow() < 2) return m;
  cadastroLinhas_(abaCadastro_()).forEach(r => {
    if (!String(r[0]).trim()) return;
    const o = cadastroObj_(r);
    [o.uc, o.ucAntiga].forEach(u => { if (dig(u).length >= 7 && !m[dig(u)]) m[dig(u)] = o; });
  });
  return m;
}

/** Plano do cliente no cadastro (null = não preenchido). Desconto em fração (20% → 0,2). */
function planoCadastro_(o) {
  if (!o) return null;
  const n = x => { const v = Number(String(x == null ? '' : x).replace(',', '.')); return String(x == null ? '' : x).trim() !== '' && isFinite(v) ? v : null; };
  const pct = n(o.descPct), vl = n(o.vlKwh), sob = /^(total|injetado)$/i.test(o.descSobre) ? o.descSobre.toLowerCase() : '';
  if (pct == null && vl == null && !sob) return null;
  return { pct: pct == null ? null : (pct > 1 ? pct / 100 : pct), sobre: sob, vlKwh: vl };
}

/** Rateio: cliente conectado com usina vira (ou completa) uma linha da aba Rateio Beneficiárias. Não apaga nada. */
function cadastroParaRateio_(c, cache) {
  const dig = v => String(v == null ? '' : v).replace(/\D/g, '');
  if (!c || dig(c.uc).length < 7 || dig(c.ug).length < 7 || /CANCEL/i.test(c.status || '')) return '';
  const sh = cache && cache.sh || ratAba_('benef'), larg = RAT_ABAS_.benef.cols.length;
  const v = cache && cache.v || (sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, larg).getValues() : []);
  if (cache) { cache.sh = sh; cache.v = v; }
  const inicio = /^\d{4}-\d{2}/.test(c.entrada || '') ? Number(c.entrada.slice(0, 4) + c.entrada.slice(5, 7)) : '';
  const i = v.findIndex(r => [c.uc, c.ucAntiga].some(u => dig(u).length >= 7 && dig(r[0]) === dig(u)) && dig(r[3]) === dig(c.ug));
  if (i >= 0) {   // já existe: só completa o que está vazio
    const r = v[i], antes = r.join('|');
    if (r[1] === '' && c.doc) r[1] = c.doc;
    if (r[4] === '' && c.usina) r[4] = c.usina;
    if (r[5] === '' && c.nome) r[5] = c.nome;
    if (r[6] === '' && c.fornecimento) r[6] = c.fornecimento;
    if (r[7] === '' && c.consumo) r[7] = Number(c.consumo) || '';
    if (r[10] === '' && inicio) r[10] = inicio;
    if (r.join('|') !== antes) { sh.getRange(i + 2, 1, 1, larg).setValues([r]); return 'atualizada'; }
    return '';
  }
  const nova = [c.uc, c.doc || '', 'CONSÓRCIO', c.ug, c.usina || '', c.nome, c.fornecimento || '', Number(c.consumo) || '', '', '', inicio, '', 'Cadastro do portal', ''].map(limpa);
  sh.getRange(v.length + 2, 1, 1, larg).setValues([nova]);
  v.push(nova);
  return 'criada';
}

function cadastroListar(usuario) {
  const linhas = cadastroLinhas_(abaCadastro_()).filter(r => String(r[0]).trim() && String(r[3]).trim());
  const contrato = !!(usuario && PERFIS_[usuario.perfil] && PERFIS_[usuario.perfil].areas.indexOf('ana') >= 0);
  // R$/kWh do investidor é valor da empresa: só TI e Admin
  const clientes = linhas.map(cadastroObj_).map(c => { if (!contrato) delete c.vlKwh; return c; });
  let usinas = [];
  try { usinas = ratLer_('usinas').filter(u => String(u.ug || '').trim() && !String(u.inativa || '').trim()).map(u => ({ ug: String(u.ug).trim(), nome: String(u.nome || '').trim() })); } catch (e) {}
  return { ok: true, clientes: clientes, usinas: usinas, contrato: contrato };
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
  // campos do cadastro único (versão 36)
  const ex = {};
  CAMPOS_CADASTRO_EXTRA.forEach(c => { ex[c] = txt(d[c], 200); });
  const numOk = (x, min, max) => x === '' || (isFinite(Number(x.replace(',', '.'))) && Number(x.replace(',', '.')) >= min && Number(x.replace(',', '.')) <= max);
  if (ex.entrada && !/^\d{4}-\d{2}-\d{2}$/.test(ex.entrada)) return { ok: false, erro: 'a data de entrada no rateio está inválida' };
  if (!numOk(ex.descPct, 0, 100)) return { ok: false, erro: 'o desconto precisa ser um número de 0 a 100' };
  if (!numOk(ex.vlKwh, 0, 10)) return { ok: false, erro: 'o R$/kWh do investidor parece errado' };
  if (!numOk(ex.consumo, 0, 10000000)) return { ok: false, erro: 'o consumo médio precisa ser um número' };
  if (ex.descSobre && !/^(total|injetado)$/.test(ex.descSobre)) ex.descSobre = '';
  const contrato = PERFIS_[usuario.perfil] && PERFIS_[usuario.perfil].areas.indexOf('ana') >= 0;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = abaCadastro_(), linhas = cadastroLinhas_(sh), id = txt(d.id, 40);
    const iAtual = id ? linhas.findIndex(r => String(r[0]) === id) : -1;
    if (id && iAtual < 0) return { ok: false, erro: 'esse cliente não existe mais (alguém pode ter excluído). Atualize a lista.' };
    // repetido: mesma UC; ou, sem UC, mesmo documento e mesmo nome
    const nu = dig(novo.uc), nomeN = novo.nome.toUpperCase();
    const na = dig(ex.ucAntiga);
    const rep = linhas.find((r, i) => i !== iAtual && String(r[0]).trim() && (
      (nu.length >= 7 && (dig(r[11]) === nu || dig(r[CAD_X_]) === nu)) || (na.length >= 7 && (dig(r[11]) === na || dig(r[CAD_X_]) === na)) || (nu.length < 7 && nd && dig(r[4]) === nd && dig(r[11]).length < 7 && String(r[3]).trim().toUpperCase() === nomeN)));
    if (rep) return { ok: false, erro: (nu.length >= 7 ? 'essa UC já está cadastrada para ' : 'esse cliente já está cadastrado: ') + String(rep[3]), duplicado: String(rep[0]) };

    const agora = new Date(), quem = usuario.nome || usuario.email;
    const valores = CAMPOS_CADASTRO.map(c => limpa(novo[c]));
    // R$/kWh do investidor: quem não é TI/Admin não vê o campo, então o valor gravado continua
    if (!contrato) ex.vlKwh = iAtual >= 0 ? String(linhas[iAtual][CAD_X_ + CAMPOS_CADASTRO_EXTRA.indexOf('vlKwh')]) : '';
    if (iAtual >= 0 && !ex.origem) ex.origem = String(linhas[iAtual][CAD_X_ + CAMPOS_CADASTRO_EXTRA.indexOf('origem')] || '');
    if (iAtual < 0 && !ex.origem) ex.origem = 'Portal';
    const extras = CAMPOS_CADASTRO_EXTRA.map(c => {
      const v = ex[c];
      if (c === 'entrada') return v ? new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)), 12) : '';
      if ((c === 'descPct' || c === 'vlKwh' || c === 'consumo') && v !== '') return Number(String(v).replace(',', '.'));
      return limpa(v);
    });
    let linha, saida;
    if (iAtual >= 0) {
      linha = iAtual + 2;
      sh.getRange(linha, 4, 1, 12).setNumberFormat('@').setValues([valores]);
      sh.getRange(linha, 16, 1, 2).setValues([[agora, quem]]);
      sh.getRange(linha, CAD_X_ + 1, 1, 1).setNumberFormat('@');
      sh.getRange(linha, CAD_X_ + 1, 1, extras.length).setValues([extras]);
      sh.getRange(linha, CAD_X_ + 1 + CAMPOS_CADASTRO_EXTRA.indexOf('entrada')).setNumberFormat('dd/MM/yyyy');
    } else {
      linha = sh.getLastRow() + 1;
      const novoId = 'C' + Utilities.getUuid().replace(/-/g, '').slice(0, 9).toUpperCase();
      sh.getRange(linha, 4, 1, 12).setNumberFormat('@');
      sh.getRange(linha, CAD_X_ + 1, 1, 1).setNumberFormat('@');
      sh.getRange(linha, 1, 1, COLS_CADASTRO.length).setValues([[novoId, agora, quem].concat(valores).concat(['', '']).concat(extras)]);
      sh.getRange(linha, CAD_X_ + 1 + CAMPOS_CADASTRO_EXTRA.indexOf('entrada')).setNumberFormat('dd/MM/yyyy');
    }
    saida = cadastroObj_(sh.getRange(linha, 1, 1, COLS_CADASTRO.length).getValues()[0]);
    let rateio = '';
    try { rateio = cadastroParaRateio_(saida); } catch (e) { console.error('Cadastro → rateio: ' + e.message); }
    if (!contrato) delete saida.vlKwh;
    return { ok: true, cliente: saida, criado: iAtual < 0, rateio: rateio };
  } finally { lock.releaseLock(); }
}

/**
 * "Completar pela planilha de controle": usa a aba Cobranças Clientes (a cópia da planilha de controle que as Cobranças já fazem,
 * por isso é rápido) para completar os campos VAZIOS do cadastro e cadastrar os clientes que ainda não estão no portal
 * (menos os em cancelamento). Nunca apaga nem troca o que já está preenchido. aplicar = false só conta (prévia).
 * A usina vira UC geradora pelo nome do investidor (aba Rateio Usinas); o tipo de fornecimento vem da última fatura lida.
 */
function cadastroCompletar(aplicar, usuario) {
  const ss = SpreadsheetApp.getActive(), dig = v => String(v == null ? '' : v).replace(/\.0+$/, '').replace(/\D/g, '');
  const t = x => x instanceof Date ? x : String(x == null ? '' : x).trim();
  const N = x => String(x == null ? '' : x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const fonte = lerAbaCob_(ss.getSheetByName(ABA_COB_CLI)).filter(o => dig(o['UC']).length >= 7 || dig(o['UC (chave)']).length >= 7);
  if (!fonte.length) return { ok: false, erro: 'a cópia da planilha de controle ainda não foi feita: abra Clientes → Cobranças e espere carregar (ou clique em Atualizar lá)' };
  // usinas pelo nome do investidor
  const usinas = {}; try { ratLer_('usinas').forEach(u => { if (String(u.ug || '').trim()) usinas[N(limparNome(u.nome) || u.nome)] = { ug: String(u.ug).trim(), nome: String(u.nome).trim() }; }); } catch (e) {}
  const usinaDe = nome => { const k = N(limparNome(nome) || nome); if (!k) return null; if (usinas[k]) return usinas[k];
    const ks = Object.keys(usinas).filter(n => n.indexOf(k) === 0 || k.indexOf(n) === 0); return ks.length === 1 ? usinas[ks[0]] : null; };
  // tipo de fornecimento: última fatura lida de cada UC
  const forn = {};
  lerAbaCob_(ss.getSheetByName('Faturas Lidas')).forEach(f => { if (String(f['Tipo Fornecimento'] || '').trim()) forn[dig(f['UC'])] = String(f['Tipo Fornecimento']).trim(); });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, erro: 'a planilha está gravando outra coisa agora; tente de novo em 1 minuto' };
  try {
    const sh = abaCadastro_(), linhas = cadastroLinhas_(sh), larg = COLS_CADASTRO.length;
    const X = n => CAD_X_ + CAMPOS_CADASTRO_EXTRA.indexOf(n);
    const COL = { nome: 3, telefone: 5, cidade: 8, uc: 11, distribuidora: 12, vendedor: 14, ucAntiga: X('ucAntiga'), ug: X('ug'), usina: X('usina'),
      status: X('status'), entrada: X('entrada'), responsavel: X('responsavel'), fornecimento: X('fornecimento'), descPct: X('descPct'),
      descSobre: X('descSobre'), vlKwh: X('vlKwh') };
    const idx = {};
    linhas.forEach((r, i) => { if (String(r[0]).trim()) [r[11], r[CAD_X_]].forEach(u => { if (dig(u).length >= 7 && idx[dig(u)] == null) idx[dig(u)] = i; }); });
    const res = { ok: true, aplicado: !!aplicar, completados: 0, campos: 0, novos: 0, cancelados: 0, exemplosNovos: [] }, mudou = {}, novas = [];
    const agora = new Date(), quem = 'Planilha de controle (por ' + (usuario.nome || usuario.email || '?') + ')';
    fonte.forEach(o => {
      const uc = t(o['UC']) || t(o['UC (chave)']), ucA = t(o['UC antiga']);
      const n = x => typeof x === 'number' && isFinite(x) ? x : null;
      const pct = n(o['Desconto % (ajuste manual)']) != null ? n(o['Desconto % (ajuste manual)']) : n(o['Desconto % (ASSINATURA)']);
      const sob = t(o['Desconto sobre (ajuste manual)']) || t(o['Desconto sobre (ASSINATURA)']);
      const vl = n(o['R$/kWh investidor (ajuste manual)']) != null ? n(o['R$/kWh investidor (ajuste manual)']) : n(o['R$/kWh investidor (ASSINATURA)']);
      const ent = o['Entrada no rateio (ajuste manual)'] instanceof Date ? o['Entrada no rateio (ajuste manual)'] : (o['Anexo G (planilha de controle)'] instanceof Date ? o['Anexo G (planilha de controle)'] : '');
      const us = usinaDe(o['Investidor']);
      const val = { nome: t(o['Cliente']), telefone: t(o['Telefone']), cidade: t(o['Cidade']), uc: uc, distribuidora: 'RGE', vendedor: t(o['Vendedor']),
        ucAntiga: ucA, ug: us ? us.ug : '', usina: t(o['Investidor']), status: t(o['Status na CLIENTES']), entrada: ent, responsavel: t(o['Responsável']),
        fornecimento: forn[dig(uc)] || forn[dig(ucA)] || '', descPct: pct == null ? '' : Math.round((pct > 1 ? pct : pct * 100) * 100) / 100,
        descSobre: /^(total|injetado)$/.test(sob) ? sob : '', vlKwh: vl == null ? '' : vl };
      const i = [uc, ucA, o['UC (chave)']].map(dig).filter(u => u.length >= 7).map(u => idx[u]).find(x => x != null);
      if (i === -1) return;   // a mesma UC já vai ser cadastrada nesta rodada
      if (i != null) {
        const r = linhas[i]; let c = 0;
        Object.keys(COL).forEach(f => { if ((r[COL[f]] === '' || r[COL[f]] == null) && val[f] !== '' && val[f] != null) { r[COL[f]] = val[f] instanceof Date ? val[f] : limpa(val[f]); c++; } });
        if (c) { res.completados++; res.campos += c; mudou[i] = true; }
        return;
      }
      if (/CANCEL/i.test(val.status)) { res.cancelados++; return; }
      const row = Array(larg).fill('');
      row[0] = 'C' + Utilities.getUuid().replace(/-/g, '').slice(0, 9).toUpperCase(); row[1] = agora; row[2] = quem;
      Object.keys(COL).forEach(f => { if (val[f] !== '' && val[f] != null) row[COL[f]] = val[f] instanceof Date ? val[f] : limpa(val[f]); });
      row[X('origem')] = 'Planilha de controle';
      novas.push(row); res.novos++; if (res.exemplosNovos.length < 6) res.exemplosNovos.push(val.nome);
      [uc, ucA].map(dig).filter(u => u.length >= 7).forEach(u => { idx[u] = -1; });
    });
    if (aplicar) {
      const ii = Object.keys(mudou).map(Number);
      if (ii.length) {
        sh.getRange(2, CAD_X_ + 1, linhas.length, 1).setNumberFormat('@');
        ii.forEach(i => sh.getRange(i + 2, 1, 1, larg).setValues([linhas[i]]));
      }
      if (novas.length) {
        const l0 = sh.getLastRow() + 1;
        sh.getRange(l0, 4, novas.length, 12).setNumberFormat('@'); sh.getRange(l0, CAD_X_ + 1, novas.length, 1).setNumberFormat('@');
        sh.getRange(l0, 1, novas.length, larg).setValues(novas);
      }
      sh.getRange(2, X('entrada') + 1, Math.max(1, sh.getLastRow() - 1), 1).setNumberFormat('dd/MM/yyyy');
      // clientes conectados com usina também vão para o Rateio
      let rat = 0;
      try { const cache = {}; cadastroLinhas_(sh).forEach(r => { if (String(r[0]).trim() && cadastroParaRateio_(cadastroObj_(r), cache)) rat++; }); } catch (e) { console.error('Completar → rateio: ' + e.message); }
      res.rateio = rat;
      console.log('Cadastro completado pela planilha de controle por ' + (usuario.email || '?') + ': ' + JSON.stringify(res));
    }
    return res;
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
  // as abas dos meses primeiro: o PAGO da coluna RGE vai para a PROGRAMAÇÃO antes de ela ser lida
  try {
    const c = lerCobrancas();
    if (c.ok) {
      cobGravarAbas_(c); cobPortalComLock_();
      try { const n = progSincronizarPagos_(c); if (n) Logger.log('PROGRAMAÇÃO: ' + n + ' conta(s) marcada(s) PAGO pelas abas dos meses'); } catch (e) { Logger.log('PROGRAMAÇÃO (PAGO): ' + e.message); }
    } else Logger.log('Cobranças: ' + c.erro);
  } catch (e) { Logger.log('Cobranças: ' + e.message); }
  const r = lerProgramacao();
  if (r.ok) gravarCacheGrande_(CACHE_PROG_, r); else Logger.log('Programação: ' + r.erro);
  try { const f = lerFluxo(); if (f.ok) gravarCacheGrande_(CACHE_FLUXO_, f); else Logger.log('Fluxo: ' + f.erro); } catch (e) { Logger.log('Fluxo: ' + e.message); }
}

/** A equipe marca o pagamento da conta da RGE na coluna RGE das abas dos meses (PAGO), mas a PROGRAMAÇÃO ficava para trás.
    Aqui a conta da PROGRAMAÇÃO com a mesma UC (nova ou antiga) e a mesma DATA DE VENCIMENTO vira PAGO, com uma nota na célula.
    Só marca PAGO: nunca desfaz nem mexe em outra situação. Desliga com NÃO em Config!B9. c = resultado de lerCobrancas(). */
function progSincronizarPagos_(c) {
  const cfg = SpreadsheetApp.getActive().getSheetByName(ABA_CONFIG);
  if (cfg) {
    if (!String(cfg.getRange('A9').getValue())) {
      cfg.getRange('A9').setValue('PROGRAMAÇÃO: PAGO pelas abas').setFontWeight('bold');
      cfg.getRange('B9').setValue('SIM');
      cfg.getRange('C9').setValue('← SIM: a cada 10 min, a conta da RGE marcada PAGO na coluna RGE da aba do mês também fica PAGO na PROGRAMAÇÃO (mesma UC e vencimento). NÃO desliga');
    }
    if (/^N/i.test(String(cfg.getRange('B9').getValue()).trim())) return 0;
  }
  const dig = x => String(x == null ? '' : x).replace(/\.0+$/, '').replace(/\D/g, '');
  const ucsDe = {}; (c.clientes || []).forEach(cl => { ucsDe[cl.k] = [cl.k, cl.uc, cl.ucA].map(dig).filter(u => u.length >= 7); });
  const abaDe = {}; (c.meses || []).forEach(m => { abaDe[m.comp] = m.aba; });
  const pagos = {};
  (c.cobrancas || []).forEach(x => {
    if (!/^PAGO/i.test(String(x.rge || '').trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.vr || ''))) return;
    (ucsDe[x.k] || [dig(x.k)]).forEach(u => { pagos[u + '|' + x.vr] = abaDe[x.c] || x.c; });
  });
  if (!Object.keys(pagos).length) return 0;
  return progAplicarPagos_(pagos, 'Marcado PAGO pelo portal', true);
}

/** pagos = { 'UC|AAAA-MM-DD': origem }: as contas da PROGRAMAÇÃO (UC nova ou antiga + vencimento) que ainda não estão PAGO viram PAGO. */
function progAplicarPagos_(pagos, texto, deAba) {
  const dig = x => String(x == null ? '' : x).replace(/\.0+$/, '').replace(/\D/g, '');
  const ss = SpreadsheetApp.openById(idPlanilhaControle_()), sh = ss.getSheetByName(ABA_PROGRAMACAO_EXT);
  if (!sh || sh.getLastRow() < 2) return 0;
  const tz = ss.getSpreadsheetTimeZone();
  const up = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const larg = sh.getLastColumn(), cab = sh.getRange(1, 1, 1, larg).getValues()[0].map(up);
  const C = { uc: cab.indexOf('NUMERO DA UC'), ant: cab.indexOf('UC ANTIGA'), venc: cab.indexOf('DATA DE VENCIMENTO'), sit: cab.indexOf('SITUACAO') };
  if (C.sit < 0 || C.venc < 0 || C.uc < 0) return 0;
  const iso = x => x instanceof Date && !isNaN(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : String(x || '').trim().replace(/^(\d{2})\/(\d{2})\/(\d{4}).*/, '$3-$2-$1');
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, larg).getValues();
  const quando = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
  let n = 0;
  v.forEach((r, i) => {
    if (up(r[C.sit]) === 'PAGO') return;
    const vc = iso(r[C.venc]); if (!/^\d{4}-\d{2}-\d{2}$/.test(vc)) return;
    const aba = [r[C.uc], C.ant >= 0 ? r[C.ant] : ''].map(dig).filter(u => u.length >= 7).map(u => pagos[u + '|' + vc]).find(Boolean);
    if (!aba) return;
    const cel = sh.getRange(i + 2, C.sit + 1);
    cel.setValue('PAGO');
    cel.setNote(texto + ' em ' + quando + ': ' + (deAba ? 'a coluna RGE da aba ' + aba + ' está PAGO' : aba) + (r[C.sit] ? ' (antes: ' + r[C.sit] + ')' : ''));
    n++;
  });
  if (n) { try { CacheService.getScriptCache().remove(CACHE_PROG_ + '_n'); } catch (e) {} }
  return n;
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
  usinas:  { nome: 'Rateio Usinas', cols: ['Unidade Geradora UC', 'Nome da UG', 'Geração Anual (kWh)', 'Concessionária', 'Início Operação (AAAAMM)', 'Inativar (X)',
             'Titular da UG (Anexo G)', 'CPF/CNPJ do titular', 'E-mail do titular', 'Responsável (quando PJ)', 'CPF do responsável', 'UC âncora'],
             chaves: ['ug', 'nome', 'geracaoAnual', 'concessionaria', 'inicio', 'inativa', 'titular', 'docTitular', 'emailTitular', 'resp', 'respCpf', 'ancora'] },
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
    for (let j = 6; j < lu; j++) linhaU.push(criada ? '' : vU[iU][j]);   // dados do titular (Anexo G): ficam como estão
    if (criada) shU.getRange(shU.getLastRow() + 1, 1, 1, lu).setValues([linhaU]);
    else shU.getRange(2 + iU, 1, 1, lu).setValues([linhaU]);
    console.log('Rateio: usina ' + ug + (criada ? ' cadastrada' : ' alterada') + ' por ' + usuario.email);
    return { ok: true, criada: criada, usina: { ug: ug, nome: nome, geracaoAnual: linhaU[2], concessionaria: linhaU[3], inicio: linhaU[4], inativa: linhaU[5] },
      geracao: linhaG ? { ug: ug, ano: ano, m: linhaG.slice(2) } : null };
  } finally { lock.releaseLock(); }
}

/** Anexo G: grava os dados do titular da usina (nome, CPF/CNPJ, e-mail, responsável, UC âncora) na aba Rateio Usinas. */
function ratTitularSalvar(d, usuario) {
  const dig = x => String(x == null ? '' : x).replace(/\.0+$/, '').replace(/\D/g, '');
  const ug = dig(d && d.ug);
  if (ug.length < 7) return { ok: false, erro: 'usina não informada' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'outra gravação em andamento; tente de novo' };
  try {
    const sh = ratAba_('usinas'), lu = RAT_ABAS_.usinas.cols.length;
    const v = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, lu).getValues() : [];
    const i = v.findIndex(r => dig(r[0]) === ug);
    if (i < 0) return { ok: false, erro: 'usina não encontrada na aba Rateio Usinas' };
    const t = x => limpa(String(x == null ? '' : x).trim().slice(0, 200));
    const vals = [t(d.titular), t(d.docTitular), t(d.emailTitular), t(d.resp), t(d.respCpf), t(d.ancora)];
    sh.getRange(2 + i, 7, 1, 6).setNumberFormat('@').setValues([vals]);
    console.log('Anexo G: titular da usina ' + ug + ' salvo por ' + (usuario.email || '?'));
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/** Faturas lidas, resumidas: { uc (dígitos), mes AAAAMM, valor, gerMed (energia injetada no medidor), auto (injetada usada na própria UC), pdf, tipo } */
function fatResumo_() {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return lerAbaCob_(SpreadsheetApp.getActive().getSheetByName('Faturas Lidas')).map(o => {
    const uc = String(o['UC'] == null ? '' : o['UC']).replace(/\.0+$/, '').replace(/\D/g, ''), m = String(o['Mês Ref (AAAAMM)'] || '').replace(/\D/g, '');
    if (uc.length < 7 || m.length !== 6) return null;
    const n = x => typeof x === 'number' && isFinite(x) ? x : null;
    return { uc: uc, mes: Number(m), valor: n(o['Valor Total (R$)']), gerMed: n(o['Geração injetada kWh (medidor)']), auto: n(o['Injetada (TE) kWh']),
      pdf: /\/d\//.test(String(o['PDF (Drive)'] || '')), tipo: /usina/i.test(String(o['Tipo da UC'] || '')) ? 'usina' : '' };
  }).filter(Boolean);
}

function ratDados() {
  const out = { ok: true };
  Object.keys(RAT_ABAS_).forEach(k => { out[k] = ratLer_(k); });
  // geração real das usinas: o que o medidor da fatura registrou como energia injetada
  try {
    // a usina pode estar no Rateio pela UC antiga e a fatura pela nova (ou o contrário): a aba Cobranças Usinas liga as duas
    const par = {}, d = v => String(v == null ? '' : v).replace(/\.0+$/, '').replace(/\D/g, '');
    lerAbaCob_(SpreadsheetApp.getActive().getSheetByName(ABA_COB_US)).forEach(o => { const a = d(o['UC']), b = d(o['UC antiga']); if (a && b) { par[a] = b; par[b] = a; } });
    out.reais = fatResumo_().filter(f => f.gerMed > 0).map(f => Object.assign(f, { alt: par[f.uc] || '' }));
  } catch (e) { out.reais = []; }
  out.gerados = out.gerados.slice(-3000);
  out.planilha = SpreadsheetApp.getActive().getUrl();
  return out;
}

/** Guarda um rateio calculado no site: uma linha por UC na aba Rateios Gerados. */
/**
 * Rateio enviado à RGE (Anexo G): marca a situação do rateio salvo e grava a data como "Entrada no rateio" no cadastro
 * das UCs NOVAS (as que nunca estiveram num rateio enviado e ainda não têm data de entrada). Quem já tinha data não muda.
 * UC que não está no cadastro é cadastrada (com a usina). d = { id, data: AAAA-MM-DD, simular }
 */
function ratEnviado(d, usuario) {
  const id = String(d && d.id || '').trim(), data = String(d && d.data || '').trim();
  if (!id) return { ok: false, erro: 'rateio não informado' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: 'data do envio inválida' };
  const dig = v => String(v == null ? '' : v).replace(/\.0+$/, '').replace(/\D/g, '');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'outra gravação em andamento; tente de novo' };
  try {
    const sh = ratAba_('gerados'), larg = RAT_ABAS_.gerados.cols.length, cSit = RAT_ABAS_.gerados.chaves.indexOf('situacao');
    const v = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, larg).getValues() : [];
    const minhas = v.map((r, i) => ({ r, i })).filter(x => String(x.r[0]) === id);
    if (!minhas.length) return { ok: false, erro: 'não achei este rateio (atualize a página)' };
    // UCs que já estiveram num rateio ENVIADO (qualquer usina)
    const jaEnviadas = {};
    v.forEach(r => { if (String(r[0]) !== id && /^ENVIADO/i.test(String(r[cSit]))) jaEnviadas[dig(r[8])] = true; });
    const cad = cadastroPorUc_(), ug = String(minhas[0].r[3]), nomeUg = String(minhas[0].r[4] || '');
    const res = { ok: true, simulado: !!d.simular, novas: [], jaTinham: [], criadas: 0 };
    minhas.forEach(({ r }) => {
      const uc = String(r[8]), k = dig(uc), o = cad[k];
      if (jaEnviadas[k] || (o && o.entrada)) res.jaTinham.push(String(r[9] || uc)); else res.novas.push({ uc: uc, titular: String(r[9] || ''), cadastro: !!o });
    });
    if (d.simular) return res;
    const dataBR = data.slice(8, 10) + '/' + data.slice(5, 7) + '/' + data.slice(0, 4);
    minhas.forEach(({ i }) => sh.getRange(i + 2, cSit + 1).setValue('ENVIADO À RGE ' + dataBR + ' (' + (usuario.nome || usuario.email || '') + ')'));
    // cadastro: entrada no rateio das UCs novas (e a usina, se estiver vazia)
    const shC = abaCadastro_(), linhas = cadastroLinhas_(shC), X = n => CAD_X_ + CAMPOS_CADASTRO_EXTRA.indexOf(n);
    const dt = new Date(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10)), 12), agora = new Date(), quem = usuario.nome || usuario.email || '';
    res.novas.forEach(n => {
      const k = dig(n.uc);
      let li = linhas.findIndex(r => String(r[0]).trim() && (dig(r[11]) === k || dig(r[CAD_X_]) === k));
      if (li < 0) {
        const row = Array(COLS_CADASTRO.length).fill('');
        row[0] = 'C' + Utilities.getUuid().replace(/-/g, '').slice(0, 9).toUpperCase(); row[1] = agora; row[2] = quem;
        row[3] = limpa(n.titular || n.uc); row[11] = n.uc; row[12] = 'RGE'; row[X('origem')] = 'Rateio (Anexo G)';
        const l0 = shC.getLastRow() + 1;
        shC.getRange(l0, 4, 1, 12).setNumberFormat('@'); shC.getRange(l0, CAD_X_ + 1).setNumberFormat('@');
        shC.getRange(l0, 1, 1, row.length).setValues([row]); linhas.push(row); li = linhas.length - 1; res.criadas++;
      }
      const l = li + 2;
      shC.getRange(l, X('entrada') + 1).setValue(dt).setNumberFormat('dd/MM/yyyy');
      if (!String(linhas[li][X('ug')] || '').trim()) shC.getRange(l, X('ug') + 1).setNumberFormat('@').setValue(ug);
      if (!String(linhas[li][X('usina')] || '').trim() && nomeUg) shC.getRange(l, X('usina') + 1).setValue(limpa(nomeUg));
      shC.getRange(l, 16, 1, 2).setValues([[agora, quem]]);
    });
    try { CacheService.getScriptCache().remove('tipos_uc_v1'); } catch (e) {}
    // a Situação das cobranças dessas UCs (aguardando 1ª fatura) é recalculada
    res.novas.forEach(n => { try { cobRecalc_(dig(n.uc)); } catch (e) {} });
    console.log('Rateio ' + id + ' enviado à RGE em ' + dataBR + ' por ' + (usuario.email || '?') + ': ' + res.novas.length + ' UCs novas');
    res.situacao = 'ENVIADO À RGE ' + dataBR + ' (' + (usuario.nome || usuario.email || '') + ')';
    return res;
  } finally { lock.releaseLock(); }
}

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
  try {
    const tp = tipoUc_(u);
    if (tp && tp[0] === 'usina') return { ok: true, ozz: true, tipo: 'usina', nome: tp[1], onde: 'como USINA geradora' + (tp[1] ? ' (' + tp[1] + ')' : '') };
    if (tp) return { ok: true, ozz: true, tipo: 'beneficiaria', nome: tp[1], usina: tp[2], onde: 'como beneficiária' + (tp[2] ? ' da usina ' + tp[2] : '') };
  } catch (e) {}
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
  'Participação na Geração %', 'Custo Mínimo kWh', 'Leitura Anterior', 'Leitura Atual', 'Dias', 'Data Emissão', 'Nota Fiscal', 'Histórico 12 meses (kWh)',
  // a partir da versão 34: as linhas da conta, para o cálculo da cobrança
  'TUSD R$/kWh', 'TE R$/kWh', 'TUSD R$', 'TE R$', 'Bandeira R$', 'Crédito bandeira R$', 'Iluminação pública R$', 'Injetada (TE) kWh', 'Outros débitos e créditos',
  // a partir da versão 35: o PDF guardado no Drive de quem implantou o script
  'PDF (Drive)',
  // a partir da versão 39: usina geradora ou unidade consumidora (beneficiária)
  'Tipo da UC',
  // a partir da versão 43: o que o medidor registrou como energia injetada na rede (na usina, é a geração do mês)
  'Geração injetada kWh (medidor)',
  // a partir da versão 51: data da próxima leitura (o prazo da conta do mês seguinte, nas Cobranças)
  'Próxima Leitura'];

/* ---------- PDFs das faturas: pasta "Faturas RGE (portal OZZ)" no Drive de quem implantou o script ----------
   Uma subpasta por mês de referência (AAAA-MM); o arquivo se chama "UC - Titular.pdf". Ler a mesma fatura de novo
   substitui o arquivo (o antigo vai para a lixeira). A pasta fica privada: o portal abre o PDF pelo próprio script. */
const PASTA_FATURAS_NOME = 'Faturas RGE (portal OZZ)';
function pastaFaturas_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PASTA_FATURAS');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(PASTA_FATURAS_NOME);
  props.setProperty('PASTA_FATURAS', f.getId());
  return f;
}
/* Usinas geradoras e unidades consumidoras ficam separadas: "Faturas RGE (portal OZZ)/Usinas geradoras/AAAA-MM" e
   ".../Unidades consumidoras/AAAA-MM" (UC que o portal não reconhece vai para Unidades consumidoras). */
const PASTA_USINAS = 'Usinas geradoras', PASTA_CONSUMIDORAS = 'Unidades consumidoras';
function subpasta_(pai, nome) { const it = pai.getFoldersByName(nome); return it.hasNext() ? it.next() : pai.createFolder(nome); }
function pastaFaturaMes_(uc, mesAAAA_MM) {
  const tp = tipoUc_(uc);
  return subpasta_(subpasta_(pastaFaturas_(), tp && tp[0] === 'usina' ? PASTA_USINAS : PASTA_CONSUMIDORAS), mesAAAA_MM);
}
/** Organiza os PDFs já guardados: move os que estão nas pastas de mês antigas (ou na pasta errada) para Usinas geradoras /
    Unidades consumidoras. Mover não muda o link do arquivo. Pastas de mês que ficarem vazias vão para a lixeira. */
function fatPdfOrganizar(usuario) {
  const raiz = pastaFaturas_(), res = { ok: true, movidos: 0, usinas: 0, consumidoras: 0, iguais: 0 };
  const mover = (pastaMes, mesNome, deTipo) => {
    const fs = pastaMes.getFiles();
    while (fs.hasNext()) {
      const f = fs.next(), uc = f.getName().split(' - ')[0], tp = tipoUc_(uc), ehUsina = !!(tp && tp[0] === 'usina');
      if (deTipo && (deTipo === PASTA_USINAS) === ehUsina) { res.iguais++; continue; }
      const destino = pastaFaturaMes_(uc, mesNome);
      // já existe um PDF mais novo desta UC neste mês no lugar certo (é para ele que o link da planilha aponta): o antigo vai para a lixeira
      if (destino.searchFiles('title contains "' + uc.replace(/"/g, '') + ' - "').hasNext()) { f.setTrashed(true); res.duplicados = (res.duplicados || 0) + 1; continue; }
      f.moveTo(destino); res.movidos++; ehUsina ? res.usinas++ : res.consumidoras++;
    }
    if (!pastaMes.getFiles().hasNext() && !pastaMes.getFolders().hasNext() && deTipo !== undefined) pastaMes.setTrashed(true);
  };
  const ps = raiz.getFolders();
  const lista = []; while (ps.hasNext()) lista.push(ps.next());
  lista.forEach(p => {
    const n = p.getName();
    if (/^\d{4}-\d{2}$/.test(n)) mover(p, n, null);            // estrutura antiga: raiz/AAAA-MM
    else if (n === PASTA_USINAS || n === PASTA_CONSUMIDORAS) {   // já separada: confere se cada um está no lugar certo
      const ms = p.getFolders(); while (ms.hasNext()) { const pm = ms.next(); if (/^\d{4}-\d{2}$/.test(pm.getName())) mover(pm, pm.getName(), n); }
    }
  });
  // estrutura antiga: a pasta do mês ficou vazia
  const ps2 = raiz.getFolders(); while (ps2.hasNext()) { const p = ps2.next(); if (/^\d{4}-\d{2}$/.test(p.getName()) && !p.getFiles().hasNext() && !p.getFolders().hasNext()) p.setTrashed(true); }
  console.log('PDFs organizados por ' + (usuario.email || '?') + ': ' + JSON.stringify(res));
  return res;
}
function linhaFatura_(sh, uc, mes) {   // linha (1-based) da UC e mês AAAAMM na aba Faturas Lidas; 0 = não tem
  const dig = x => String(x == null ? '' : x).replace(/\.0+$/, '').replace(/\D/g, '');
  if (!sh || sh.getLastRow() < 2) return 0;
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  for (let i = v.length - 1; i >= 0; i--) if (dig(v[i][3]) === dig(uc) && dig(v[i][10]) === String(mes)) return i + 2;
  return 0;
}
/** Guarda o PDF de uma fatura já gravada pelo Leitor (d = { uc, mes: AAAAMM, titular, b64 }). */
function faturaPdfSalvar(d, usuario) {
  const uc = String(d && d.uc || '').trim(), mes = String(d && d.mes || '').replace(/\D/g, '');
  if (uc.replace(/\D/g, '').length < 7 || !/^20\d{2}(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, erro: 'fatura sem UC ou mês' };
  // veio de uma pasta do Drive (importação): copia o arquivo, sem mandar os bytes de novo
  let origem = null;
  if (d.driveId) {
    try { origem = DriveApp.getFileById(String(d.driveId)); } catch (e) { return { ok: false, erro: 'não achei o arquivo no Drive' }; }
    if (!dentroDaPasta_(origem, idDrive_(d.pasta))) return { ok: false, erro: 'o arquivo não está na pasta escolhida' };
  }
  const b64 = String(d.b64 || '');
  let bytes = null;
  if (!origem) {
    if (!b64 || b64.length > 20 * 1024 * 1024) return { ok: false, erro: 'PDF vazio ou grande demais (máx. 15 MB)' };
    try { bytes = Utilities.base64Decode(b64); } catch (e) { return { ok: false, erro: 'PDF inválido' }; }
    if (String.fromCharCode.apply(null, bytes.slice(0, 4).map(b => (b + 256) % 256)) !== '%PDF') return { ok: false, erro: 'o arquivo não é um PDF' };
  }
  const sh = SpreadsheetApp.getActive().getSheetByName('Faturas Lidas'), linha = linhaFatura_(sh, uc, mes);
  if (!linha) return { ok: false, erro: 'guarde os dados da fatura antes do PDF' };
  const nome = (uc + ' - ' + String(d.titular || '').replace(/[\\/:*?"<>|]+/g, ' ').trim()).slice(0, 120) + '.pdf';
  let url;
  // o portal manda vários PDFs ao mesmo tempo: achar/criar a pasta do mês e trocar o PDF antigo fica numa fila,
  // senão dois pedidos criam a mesma pasta "2026-10" duas vezes
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return { ok: false, ocupado: true, erro: 'a planilha está ocupada agora; tente de novo' };
  try {
    const sub = mes.slice(0, 4) + '-' + mes.slice(4), pasta = pastaFaturaMes_(uc, sub);
    // substitui o PDF anterior da mesma UC neste mês (o nome pode ter mudado se o titular mudou)
    const velhos = pasta.searchFiles('title contains "' + uc.replace(/"/g, '') + ' - "');
    while (velhos.hasNext()) velhos.next().setTrashed(true);
    const arq = origem ? origem.makeCopy(nome, pasta) : pasta.createFile(Utilities.newBlob(bytes, 'application/pdf', nome));
    if (origem) fatImportadaMarcar_(origem, d, uc, mes, usuario);
    arq.setDescription('Lido no portal por ' + (usuario.nome || usuario.email || '?') + ' em ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'));
    url = arq.getUrl();
  } catch (e) {
    return { ok: false, drive: true, erro: 'não consegui gravar no Google Drive (' + e.message + '). Rode a função "configurar" no editor do Apps Script uma vez para autorizar o Drive.' };
  } finally { lock.releaseLock(); }
  const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim()), c = cab.indexOf('PDF (Drive)') + 1;
  if (c > 0) sh.getRange(linha, c).setValue(url);
  return { ok: true, url: url, v: 48 };
}
/* ---------- Importar faturas de uma pasta do Google Drive ----------
   A pasta precisa estar acessível para a conta que implantou o script (dona ou compartilhada com ela). O portal lista os PDFs
   (com as subpastas), baixa um por um, lê no navegador com o mesmo Leitor e, ao guardar, o script COPIA o arquivo para a pasta
   "Faturas RGE (portal OZZ)". Os arquivos já importados ficam na aba "Faturas Importadas" e são pulados da próxima vez. */
const ABA_FAT_IMP = 'Faturas Importadas';
const COLS_FAT_IMP = ['ID do arquivo', 'Nome do arquivo', 'Pasta de origem', 'Importado em', 'Importado por', 'UC', 'Mês Ref (AAAAMM)'];
function idDrive_(x) {
  const t = String(x || '').trim(), m = t.match(/\/folders\/([\w-]{20,})/) || t.match(/[?&]id=([\w-]{20,})/) || t.match(/\/d\/([\w-]{20,})/) || t.match(/^([\w-]{20,})$/);
  return m ? m[1] : '';
}
function dentroDaPasta_(arq, pastaId) {   // o arquivo está na pasta ou em alguma subpasta dela (até 8 níveis)?
  if (!pastaId) return false;
  let nivel = [arq];
  for (let n = 0; n < 8 && nivel.length; n++) {
    const prox = [];
    for (const x of nivel) { const it = x.getParents(); while (it.hasNext()) { const p = it.next(); if (p.getId() === pastaId) return true; prox.push(p); } }
    nivel = prox;
  }
  return false;
}
function fatImportadas_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(ABA_FAT_IMP), m = {};
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(r => { if (r[0]) m[String(r[0])] = true; });
  return m;
}
function fatImportadaMarcar_(arq, d, uc, mes, usuario) {
  const sh = abaCob_(ABA_FAT_IMP, COLS_FAT_IMP);
  if (fatImportadas_()[arq.getId()]) return;
  sh.appendRow([arq.getId(), arq.getName(), String(d.pastaNome || ''), new Date(), usuario.nome || usuario.email || '', "'" + uc, mes]);
}
/** Lista os PDFs da pasta (e subpastas). d = { pasta: link ou ID } */
function fatPastaListar(d) {
  const id = idDrive_(d && d.pasta);
  if (!id) return { ok: false, erro: 'cole o link da pasta do Google Drive (ex.: https://drive.google.com/drive/folders/…)' };
  let raiz;
  try { raiz = DriveApp.getFolderById(id); raiz.getName(); }
  catch (e) {
    let quem = ''; try { quem = Session.getEffectiveUser().getEmail(); } catch (x) {}
    return { ok: false, erro: 'não consegui abrir a pasta. Confira o link e se ela está compartilhada com a conta do script' + (quem ? ' (' + quem + ')' : '') };
  }
  const ja = fatImportadas_(), arquivos = [], fila = [{ p: raiz, cam: '' }];
  let pastas = 0;
  while (fila.length && arquivos.length < 1500 && pastas < 200) {
    const { p, cam } = fila.shift(); pastas++;
    const fs = p.getFiles();
    while (fs.hasNext() && arquivos.length < 1500) {
      const f = fs.next();
      if (f.getMimeType() !== 'application/pdf' && !/\.pdf$/i.test(f.getName())) continue;
      arquivos.push({ id: f.getId(), nome: f.getName(), pasta: cam, tam: f.getSize(), ja: !!ja[f.getId()] });
    }
    const sub = p.getFolders();
    while (sub.hasNext()) { const s2 = sub.next(); if (s2.getName() !== PASTA_FATURAS_NOME) fila.push({ p: s2, cam: (cam ? cam + '/' : '') + s2.getName() }); }
  }
  arquivos.sort((a, b) => (a.pasta + '/' + a.nome).localeCompare(b.pasta + '/' + b.nome));
  return { ok: true, id: id, nome: raiz.getName(), arquivos: arquivos, limite: arquivos.length >= 1500 };
}
/** Um PDF da pasta, em base64, para o Leitor ler no navegador. d = { pasta, id } */
function fatPastaBaixar(d) {
  const pid = idDrive_(d && d.pasta);
  let f; try { f = DriveApp.getFileById(String(d && d.id || '')); } catch (e) { return { ok: false, erro: 'arquivo não encontrado' }; }
  if (!dentroDaPasta_(f, pid)) return { ok: false, erro: 'o arquivo não está na pasta escolhida' };
  if (f.getSize() > 15 * 1024 * 1024) return { ok: false, erro: 'arquivo grande demais (máx. 15 MB)' };
  return { ok: true, nome: f.getName(), b64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

/* ---------- Faturas não lidas: o Leitor registra aqui o que não conseguiu ler, para não se perder quando a página fecha ----------
   Chave = ID do arquivo no Drive (importação pela pasta) ou "arq:nome|tamanho" (arquivo do computador).
   Quando a fatura é lida e guardada depois, a linha ganha "Resolvida em" e sai da lista do portal. */
const ABA_FAT_NL = 'Faturas não lidas';
const COLS_FAT_NL = ['Chave', 'Arquivo', 'Origem', 'ID no Drive', 'Pasta (ID)', 'Motivo', 'Tentativas', 'Primeira vez', 'Última tentativa', 'Por', 'Resolvida em'];
function fatNaoLidas(d, usuario) {
  const op = String(d && d.op || ''), sh = abaCob_(ABA_FAT_NL, COLS_FAT_NL);
  const lin = lerAbaCob_(sh), cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim()), c = n => cab.indexOf(n) + 1;
  const t = x => String(x == null ? '' : x).trim(), quem = usuario.nome || usuario.email || '';
  const fmt = x => x instanceof Date ? Utilities.formatDate(x, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') : t(x);
  const porChave = {}; lin.forEach(o => { if (t(o['Chave'])) porChave[t(o['Chave'])] = o; });
  if (op === 'listar') {
    return { ok: true, lista: lin.filter(o => t(o['Chave']) && !t(o['Resolvida em'])).map(o => ({ chave: t(o['Chave']), arquivo: t(o['Arquivo']), origem: t(o['Origem']),
      driveId: t(o['ID no Drive']), pasta: t(o['Pasta (ID)']), motivo: t(o['Motivo']), tentativas: Number(o['Tentativas']) || 1, primeira: fmt(o['Primeira vez']), ultima: fmt(o['Última tentativa']) })) };
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'a planilha está gravando outra coisa agora; tente de novo' };
  try {
    const agora = new Date();
    if (op === 'reg') {   // registra (ou soma uma tentativa)
      const novas = [];
      (Array.isArray(d.lista) ? d.lista.slice(0, 500) : []).forEach(x => {
        const ch = t(x.chave).slice(0, 300); if (!ch) return;
        const o = porChave[ch];
        if (o) {
          sh.getRange(o._linha, c('Motivo')).setValue(limpa(t(x.motivo).slice(0, 300)));
          sh.getRange(o._linha, c('Tentativas')).setValue((Number(o['Tentativas']) || 1) + 1);
          sh.getRange(o._linha, c('Última tentativa')).setValue(agora);
          sh.getRange(o._linha, c('Por')).setValue(quem);
          sh.getRange(o._linha, c('Resolvida em')).setValue('');
        } else {
          const row = COLS_FAT_NL.map(n => ({ 'Chave': ch, 'Arquivo': limpa(t(x.arquivo).slice(0, 200)), 'Origem': limpa(t(x.origem).slice(0, 200)), 'ID no Drive': t(x.driveId),
            'Pasta (ID)': t(x.pasta), 'Motivo': limpa(t(x.motivo).slice(0, 300)), 'Tentativas': 1, 'Primeira vez': agora, 'Última tentativa': agora, 'Por': quem, 'Resolvida em': '' })[n]);
          novas.push(row); porChave[ch] = { _linha: -1 };
        }
      });
      if (novas.length) sh.getRange(sh.getLastRow() + 1, 1, novas.length, COLS_FAT_NL.length).setValues(novas);
      return { ok: true, registradas: novas.length };
    }
    if (op === 'ok' || op === 'tirar') {   // ok = foi lida e guardada; tirar = alguém tirou da lista
      let n = 0;
      (Array.isArray(d.chaves) ? d.chaves : [d.chave]).forEach(ch => {
        const o = porChave[t(ch)]; if (!o || o._linha < 0 || t(o['Resolvida em'])) return;
        sh.getRange(o._linha, c('Resolvida em')).setValue(op === 'ok' ? Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') + ' (lida e guardada)'
          : 'tirada da lista por ' + quem + ' em ' + Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'));
        n++;
      });
      return { ok: true, resolvidas: n };
    }
    return { ok: false, erro: 'operação inválida' };
  } finally { lock.releaseLock(); }
}

/** Devolve o PDF guardado de uma fatura (d = { uc, ref: AAAA-MM }) em base64, para o portal abrir sem compartilhar a pasta. */
function faturaPdfLer(d) {
  const uc = String(d && d.uc || ''), mes = String(d && d.ref || '').replace(/\D/g, '');
  const sh = SpreadsheetApp.getActive().getSheetByName('Faturas Lidas'), linha = linhaFatura_(sh, uc, mes);
  if (!linha) return { ok: false, erro: 'fatura não encontrada' };
  const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim()), c = cab.indexOf('PDF (Drive)') + 1;
  const url = c > 0 ? String(sh.getRange(linha, c).getValue() || '') : '', m = url.match(/\/d\/([\w-]{20,})/);
  if (!m) return { ok: false, erro: 'o PDF desta fatura não foi guardado (leia de novo no Leitor)' };
  try {
    const b = DriveApp.getFileById(m[1]).getBlob();
    return { ok: true, nome: b.getName(), b64: Utilities.base64Encode(b.getBytes()) };
  } catch (e) { return { ok: false, erro: 'não consegui abrir o PDF no Drive: ' + e.message }; }
}

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
        hist.map(h => String(h.mes).slice(4) + '/' + String(h.mes).slice(0, 4) + ': ' + h.kwh).join(' · '),
        nv(f.tusdTarifa), nv(f.teTarifa), nv(f.tusdValor), nv(f.teValor), nv(f.bandeira), nv(f.bandeiraCred), nv(f.cip), nv(f.injKwh), String(f.outros || '').slice(0, 1000)].map(limpa);
      const iPdf = COLS_FATURAS.indexOf('PDF (Drive)'), tp = tipoUc_(uc);
      linha.push('');   // coluna PDF (Drive): o link é gravado depois, por faturaPdfSalvar
      linha.push(tp ? (tp[0] === 'usina' ? 'Usina geradora' : 'Unidade consumidora') : '');
      linha.push(nv(f.geracaoMed));
      linha.push(String(f.proxLeitura || ''));
      const kF = dig(uc) + '|' + mes;
      if (idxF[kF] != null) { const pdfAntes = vF[idxF[kF]][iPdf]; vF[idxF[kF]] = linha; vF[idxF[kF]][iPdf] = pdfAntes; res.atualizadas++; }
      else { idxF[kF] = -1; novasF.push(linha); res.faturas++; }
      if (tp && tp[0] === 'usina') res.usinas = (res.usinas || 0) + 1;
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
    // a fatura lida vira a cobrança do mês (aba Cobranças Portal)
    try { res.cobrancas = cobPortalGerar_(); } catch (e) { console.error('Cobranças do portal: ' + e.message); res.cobrancasErro = e.message; }
    console.log('Leitor de faturas: ' + lista.length + ' por ' + usuario.email + ' → ' + JSON.stringify(res).slice(0, 300));
    return Object.assign({ ok: true }, res);
  } finally { lock.releaseLock(); }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
