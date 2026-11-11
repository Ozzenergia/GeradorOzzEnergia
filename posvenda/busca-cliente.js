/* Busca de cliente na planilha do Portal OZZ (propostas e termos já registrados) para preencher a visita.
   Só funciona com o login Google do portal: dentro do portal usa a conexão dele; aberto sozinho, usa o login desta aba. */
(function(){
  "use strict";
  var SHEET_URL_PADRAO="https://script.google.com/macros/s/AKfycbwSfuQBkFawC_2i4lE23ULZCdzj5Wgk1236MlTxYvnAMPH-2kbsj0jqne_xpWiOaIlD/exec";
  var $=function(s){return document.querySelector(s)};
  var caixa=$("#bc_q"),lista=$("#bc_lista"),msg=$("#bc_msg"),painel=$("#bc_salvos");
  if(!caixa)return;

  function portal(){try{if(window.parent!==window&&typeof window.parent.sheetApi==="function")return window.parent}catch(e){}return null}
  function tokenDaAba(){try{var x=JSON.parse(sessionStorage.getItem("ozz_idtok")||"null");if(x&&x.exp*1000>Date.now()+60000)return x.t}catch(e){}return null}
  function urlPlanilha(){try{var c=JSON.parse(localStorage.getItem("ozz_cfg")||"{}");if(c.sheetUrl&&String(c.sheetUrl).indexOf("AKfycbxvWor5qxhAuoRinvKDT5picANh9fmn3vCCTfC0XAdberp1OxpWSGMNg7YYZ6FWo0_F")<0)return String(c.sheetUrl).trim()}catch(e){}return SHEET_URL_PADRAO}

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

  /* ---- Clientes salvos neste aparelho (para visitar sem internet) ---- */
  var CHAVE_SALVOS="ozz_pv_salvos",MAX_SALVOS=30;
  var chaveCli=function(c){return String(c.uc||"").replace(/\D/g,"")||semAcento(c.titular)};
  function salvos(){try{var l=JSON.parse(localStorage.getItem(CHAVE_SALVOS)||"[]");return Array.isArray(l)?l:[]}catch(e){return []}}
  function gravar(l){try{localStorage.setItem(CHAVE_SALVOS,JSON.stringify(l));return true}catch(e){return false}}
  function estaSalvo(c){var k=chaveCli(c);return salvos().some(function(x){return chaveCli(x)===k})}
  function alternar(c){
    var l=salvos(),k=chaveCli(c),i=-1;
    l.forEach(function(x,j){if(chaveCli(x)===k)i=j});
    if(i>=0)l.splice(i,1);
    else{if(l.length>=MAX_SALVOS){alert("Dá para salvar até "+MAX_SALVOS+" clientes. Tire algum da lista antes.");return false}
      var o={};["titular","responsavel","fantasia","uc","uc_antiga","cidade","uf","celular","email","plano","distribuidora","consultor","origem","numero"].forEach(function(f){if(c[f])o[f]=c[f]});
      o.salvoEm=Date.now();l.unshift(o)}
    gravar(l);renderSalvos();return i<0;
  }
  function linhaDe(c){return [c.fantasia&&semAcento(c.fantasia)!==semAcento(c.titular)?nomeProprio(c.fantasia):"",c.responsavel?"Resp.: "+nomeProprio(c.responsavel):"",c.uc?"UC "+c.uc:"",c.uc_antiga?"antiga "+c.uc_antiga:"",c.cidade?nomeProprio(c.cidade)+(c.uf?"/"+String(c.uf).toUpperCase():""):"",c.plano||"",c.origem&&c.numero?c.origem+" "+c.numero:"",c.data||""].filter(Boolean).join(" · ")}
  function itemHtml(c,i,lado){
    return '<div class="bc-item"><button type="button" class="bc-usar" data-i="'+i+'"><b>'+esc(nomeProprio(c.titular))+'</b><small>'+esc(linhaDe(c))+'</small></button>'+lado+'</div>'}
  function renderSalvos(){
    if(!painel)return;var l=salvos();
    if(!l.length){painel.innerHTML="";return}
    painel.innerHTML='<div class="bc-salvos-top"><b>📌 Salvos neste aparelho ('+l.length+')</b><span>funcionam sem internet</span><button type="button" class="bc-limpar">Limpar todos</button></div>'+
      '<div class="bc-lista">'+l.map(function(c,i){return itemHtml(c,i,'<button type="button" class="bc-tirar" data-i="'+i+'" title="Tirar da lista" aria-label="Tirar '+esc(nomeProprio(c.titular))+' da lista">✕</button>')}).join("")+'</div>';
    painel.querySelectorAll(".bc-usar").forEach(function(b){b.onclick=function(){preencher(l[+b.dataset.i])}});
    painel.querySelectorAll(".bc-tirar").forEach(function(b){b.onclick=function(){alternar(l[+b.dataset.i]);marcarPins()}});
    painel.querySelector(".bc-limpar").onclick=function(){if(confirm("Tirar todos os clientes salvos deste aparelho?")){gravar([]);renderSalvos();marcarPins()}};
  }
  var ultimos=[];
  function marcarPins(){lista.querySelectorAll(".bc-pin").forEach(function(b){var on=estaSalvo(ultimos[+b.dataset.i]);b.classList.toggle("on",on);b.setAttribute("aria-pressed",on);b.innerHTML=(on?"📌 Salvo":"📌 Salvar")+"<small>(modo offline)</small>";b.title=on?"Tirar dos salvos":"Guardar no aparelho para usar sem internet"})}
  function mostrar(cs,texto){
    ultimos=cs;msg.className="bc-msg";msg.textContent=texto;
    lista.innerHTML=cs.map(function(c,i){return itemHtml(c,i,'<button type="button" class="bc-pin" data-i="'+i+'" aria-pressed="false"></button>')}).join("");
    lista.querySelectorAll(".bc-usar").forEach(function(b){b.onclick=function(){preencher(cs[+b.dataset.i])}});
    lista.querySelectorAll(".bc-pin").forEach(function(b){b.onclick=function(){alternar(cs[+b.dataset.i]);marcarPins()}});
    marcarPins();
  }
  function buscarSalvos(q){
    var t=semAcento(q),dig=q.replace(/\D/g,"");
    return salvos().filter(function(c){return (t.length>=3&&[c.titular,c.fantasia,c.responsavel].some(function(x){return semAcento(x).indexOf(t)>=0}))||(dig.length>=4&&[c.uc,c.uc_antiga].some(function(u){return String(u||"").replace(/\D/g,"").indexOf(dig)>=0}))});
  }

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
    if(!navigator.onLine){
      var ls=buscarSalvos(q);
      if(ls.length){mostrar(ls,"Sem internet — achei nos clientes salvos:");return}
      msg.className="bc-msg warn";msg.textContent=salvos().length?"Sem internet e esse cliente não está entre os salvos: preencha à mão.":"Sem internet: preencha os dados à mão. (Dica: com internet, salve com 📌 os clientes que vai visitar.)";return}
    var minha=++vez;msg.className="bc-msg";msg.textContent="Buscando…";
    buscar(q).then(function(r){
      if(minha!==vez)return;
      if(!r||!r.ok){
        msg.className="bc-msg warn";
        var e=(r&&r.erro)||"não foi possível buscar";
        if(/ação desconhecida/.test(e))e="a planilha ainda está com o script antigo (atualize o Apps Script para a versão 4)";
        var ls=buscarSalvos(q);
        if(ls.length&&!r.perfil){mostrar(ls,"A planilha não respondeu — achei nos clientes salvos:");return}
        msg.innerHTML="⚠️ "+esc(e)+"."+(r&&r.relogin?' <a href="../?volta=posvenda#pos/visitas">Entrar de novo</a>':"");
        return}
      var cs=r.clientes||[];
      if(!cs.length){
        if(r.aviso){msg.className="bc-msg warn";msg.textContent="⚠️ "+r.aviso+". Avise o administrador do portal.";return}
        msg.className="bc-msg";msg.textContent="Nenhum cliente encontrado com “"+q+"”. Preencha à mão.";return}
      if(r.aviso)console.warn("Busca de clientes:",r.aviso);
      mostrar(cs,cs.length+(cs.length>1?" clientes encontrados — toque para preencher ou 📌 para guardar:":" cliente encontrado — toque para preencher ou 📌 para guardar:"));
    });
  }
  renderSalvos();
  window.addEventListener("storage",function(e){if(e.key===CHAVE_SALVOS)renderSalvos()});
  caixa.addEventListener("input",function(){clearTimeout(timer);timer=setTimeout(pesquisar,450)});
  caixa.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();clearTimeout(timer);pesquisar()}});
})();
