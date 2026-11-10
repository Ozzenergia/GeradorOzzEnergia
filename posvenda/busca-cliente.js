/* Busca de cliente na planilha do Portal OZZ (propostas e termos já registrados) para preencher a visita.
   Só funciona com o login Google do portal: dentro do portal usa a conexão dele; aberto sozinho, usa o login desta aba. */
(function(){
  "use strict";
  var SHEET_URL_PADRAO="https://script.google.com/macros/s/AKfycbwSfuQBkFawC_2i4lE23ULZCdzj5Wgk1236MlTxYvnAMPH-2kbsj0jqne_xpWiOaIlD/exec";
  var $=function(s){return document.querySelector(s)};
  var caixa=$("#bc_q"),lista=$("#bc_lista"),msg=$("#bc_msg");
  if(!caixa)return;

  function portal(){try{if(window.parent!==window&&typeof window.parent.sheetApi==="function")return window.parent}catch(e){}return null}
  function tokenDaAba(){try{var x=JSON.parse(sessionStorage.getItem("ozz_idtok")||"null");if(x&&x.exp*1000>Date.now()+60000)return x.t}catch(e){}return null}
  function urlPlanilha(){try{var c=JSON.parse(localStorage.getItem("ozz_cfg")||"{}");if(c.sheetUrl)return String(c.sheetUrl).trim()}catch(e){}return SHEET_URL_PADRAO}

  function buscar(q){
    var p=portal();
    if(p)return p.sheetApi("clientes",{q:q});
    var t=tokenDaAba();
    if(!t)return Promise.resolve({ok:false,relogin:true,erro:"para buscar clientes, abra o pós-venda pelo Portal (o login desta aba expirou)"});
    var ctl=new AbortController(),to=setTimeout(function(){ctl.abort()},20000);
    return fetch(urlPlanilha(),{method:"POST",body:JSON.stringify({acao:"clientes",q:q,idToken:t}),signal:ctl.signal})
      .then(function(r){return r.json()})
      .catch(function(e){return {ok:false,erro:e.name==="AbortError"?"a planilha demorou para responder":"sem conexão com a planilha"}})
      .finally(function(){clearTimeout(to)});
  }

  var semAcento=function(s){return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim()};
  // os nomes da planilha nem sempre batem com as opções do formulário
  function opcao(sel,valor,regras){
    if(!valor)return;var v=semAcento(valor);
    for(var i=0;i<regras.length;i++)if(regras[i][0].test(v)){valor=regras[i][1];v=semAcento(valor);break}
    var ops=sel.options;
    for(var j=0;j<ops.length;j++)if(ops[j].value&&semAcento(ops[j].value)===v){sel.value=ops[j].value;return}
  }
  var PLANOS=[[/^standa?r[dt]/,"Standard"],[/^pro\b/,"Pro"],[/^basico/,"Básico"],[/^essencial/,"Essencial"],[/^prime/,"Prime"]];
  var DISTS=[[/rge|cpfl/,"RGE/CPFL"],[/celesc/,"CELESC"]];
  function poe(id,v){var el=$(id);if(el&&v){el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}))}}
  function nomeProprio(s){return String(s||"").toLowerCase().replace(/(^|\s)(\S)/g,function(m,a,b){return a+b.toUpperCase()}).replace(/\s(D[aeo]s?|E)\s/g,function(m){return m.toLowerCase()})}

  function preencher(c){
    poe("#c_nome",nomeProprio(c.titular));
    poe("#c_uc",c.uc);
    poe("#c_cidade",c.cidade?(nomeProprio(c.cidade)+(c.uf?" / "+String(c.uf).toUpperCase():"")):"");
    poe("#c_tel",c.celular);
    opcao($("#c_plano"),c.plano,PLANOS);
    opcao($("#c_dist"),c.distribuidora,DISTS);
    poe("#c_consultor",nomeProprio(c.consultor));
    lista.innerHTML="";caixa.value="";
    msg.className="bc-msg ok";
    msg.textContent="✓ Dados de "+nomeProprio(c.titular)+" preenchidos"+(c.celular?"":" (sem telefone na planilha: pergunte ao cliente)")+". Confira antes de seguir.";
    var v=$("#c_visitante");if(v&&!v.value)v.focus();
  }

  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
  var vez=0,timer=null;
  function pesquisar(){
    var q=caixa.value.trim(),dig=q.replace(/\D/g,"");
    lista.innerHTML="";
    if(q.length<3&&dig.length<4){msg.className="bc-msg";msg.textContent="";return}
    if(!navigator.onLine){msg.className="bc-msg warn";msg.textContent="Sem internet: preencha os dados à mão.";return}
    var minha=++vez;msg.className="bc-msg";msg.textContent="Buscando…";
    buscar(q).then(function(r){
      if(minha!==vez)return;
      if(!r||!r.ok){
        msg.className="bc-msg warn";
        var e=(r&&r.erro)||"não foi possível buscar";
        if(/ação desconhecida/.test(e))e="a planilha ainda está com o script antigo (atualize o Apps Script para a versão 4)";
        msg.innerHTML="⚠️ "+esc(e)+"."+(r&&r.relogin?' <a href="../?volta=posvenda#pos/visitas">Entrar de novo</a>':"");
        return}
      var cs=r.clientes||[];
      if(!cs.length){
        if(r.aviso){msg.className="bc-msg warn";msg.textContent="⚠️ "+r.aviso+". Avise o administrador do portal.";return}
        msg.className="bc-msg";msg.textContent="Nenhum cliente encontrado com “"+q+"”. Preencha à mão.";return}
      if(r.aviso)console.warn("Busca de clientes:",r.aviso);
      msg.className="bc-msg";msg.textContent=cs.length+(cs.length>1?" clientes encontrados — toque para preencher:":" cliente encontrado — toque para preencher:");
      lista.innerHTML=cs.map(function(c,i){
        var linha=[c.fantasia&&semAcento(c.fantasia)!==semAcento(c.titular)?nomeProprio(c.fantasia):"",c.responsavel?"Resp.: "+nomeProprio(c.responsavel):"",c.uc?"UC "+c.uc:"",c.uc_antiga?"antiga "+c.uc_antiga:"",c.cidade?nomeProprio(c.cidade)+(c.uf?"/"+String(c.uf).toUpperCase():""):"",c.plano||"",c.origem&&c.numero?c.origem+" "+c.numero:"",c.data||""].filter(Boolean).join(" · ");
        return '<button type="button" data-i="'+i+'"><b>'+esc(nomeProprio(c.titular))+'</b><small>'+esc(linha)+'</small></button>'}).join("");
      lista.querySelectorAll("button").forEach(function(b){b.onclick=function(){preencher(cs[+b.dataset.i])}});
    });
  }
  caixa.addEventListener("input",function(){clearTimeout(timer);timer=setTimeout(pesquisar,450)});
  caixa.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();clearTimeout(timer);pesquisar()}});
})();
