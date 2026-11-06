/**
 * OZZ Energia – registro de propostas e termos (Google Apps Script)
 *
 * Cole este código em Extensões → Apps Script da planilha, salve, rode a
 * função "configurar" uma vez e implante como App da Web
 * (Executar como: Eu · Quem pode acessar: Qualquer pessoa).
 *
 * Segurança: o script só GRAVA linhas e devolve o próximo número.
 * Ele nunca devolve CPF, endereço ou outros dados de clientes.
 */

// Mesma senha que está no portal (index.html → SHEET_TOKEN)
const TOKEN = 'ozz-qh_LKaYLTaACOG1ZdxpQ53LQ';

const ABA_PROPOSTAS = 'Propostas';
const ABA_TERMOS = 'Termos';
const ABA_CONFIG = 'Config';

const COLS_PROPOSTAS = ['Data/hora', 'Nº proposta', 'Consultor', 'Cliente', 'CPF', 'CNPJ', 'UC', 'Distribuidora',
  'Endereço', 'CEP', 'Cidade', 'UF', 'Tensão', 'Consumo médio (kWh)', 'Plano', 'Desconto (%)',
  'Custo mensal', 'Custo anual', 'Economia mensal', 'Economia anual', 'Modelo'];
const COLS_TERMOS = ['Data/hora', 'Nº proposta', 'Consultor', 'Titular', 'CPF/CNPJ', 'UC', 'Distribuidora',
  'Classe', 'Endereço', 'Cidade/UF', 'Consumo médio (kWh)', 'Modalidade', 'Data de assinatura', 'Representante'];

/** Rode uma vez: cria as abas e os cabeçalhos. */
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
  cria(ABA_TERMOS, COLS_TERMOS);
  const cfg = ss.getSheetByName(ABA_CONFIG) || ss.insertSheet(ABA_CONFIG);
  if (cfg.getLastRow() === 0) {
    cfg.getRange('A1:B2').setValues([['Próximo número', 700001], ['Prefixo', '']]);
    cfg.getRange('A1:A2').setFontWeight('bold');
    cfg.getRange('C1').setValue('← altere aqui o próximo número da proposta');
  }
}

function doGet() {
  return json({ ok: true, app: 'OZZ Energia – registro' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, erro: 'pedido inválido' }); }
  if (req.token !== TOKEN) return json({ ok: false, erro: 'senha inválida' });
  try {
    if (req.acao === 'proposta') return json(registrarProposta(req.dados || {}));
    if (req.acao === 'termo') return json(registrarTermo(req.dados || {}));
    if (req.acao === 'buscar') return json(buscarPorUC(req.uc));
    return json({ ok: false, erro: 'ação desconhecida' });
  } catch (err) {
    return json({ ok: false, erro: String(err && err.message || err) });
  }
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
  sh.appendRow([new Date(), d.num_proposta, d.consultor, d.titular, d.documento, d.codigo_uc, d.distribuidora,
    d.classe_uc, d.endereco, d.cidade, d.consumo, d.modalidade, d.data_assinatura, d.rep_nome].map(limpa));
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
