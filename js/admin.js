/* ==========================================================================
   IPJC Links — Painel de administração (admin.html)

   Como funciona:
   - Tudo o que você edita vira um RASCUNHO salvo neste navegador
     (localStorage) e aparece na prévia ao lado na hora.
   - "Publicar" grava o rascunho em data/links.json no GitHub (precisa de um
     token, configurado uma vez por aparelho em "Publicação e QR Code").
     Sem token, dá para baixar o links.json e enviar o arquivo manualmente.

   Login: usuário e resumo SHA-256 da senha em js/admin-config.js. É uma porta
   de entrada simples (site estático); a segurança real é o token do GitHub.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.IPJC_LINKS_ADMIN;
  var ico = window.IPJC_ICONE;
  var ARQUIVO = 'data/links.json';
  var CHAVE_RASCUNHO = 'ipjc-links-rascunho';
  var CHAVE_TOKEN = 'ipjc-links-github-token';
  var SESSAO = 'ipjc-links-admin-sessao';
  var CORES = [['auto', 'Automática'], ['azul', 'Azul Petróleo'], ['verde', 'Verde Litúrgico'], ['mostarda', 'Mostarda'], ['borgonha', 'Borgonha']];
  var REDES = [['instagram', 'Instagram'], ['youtube', 'YouTube'], ['spotify', 'Spotify'], ['facebook', 'Facebook'], ['whatsapp', 'WhatsApp'], ['tiktok', 'TikTok'], ['email', 'E-mail'], ['globo', 'Site']];

  var publicado = null;   // o que está no ar (data/links.json)
  var estado = null;      // rascunho em edição
  var aba = 'links';
  var editando = null;    // { secao, indice } do link aberto no diálogo (indice -1 = novo)
  var abertas = {};       // seções recolhidas no painel

  /* ------------------------------------------------------------ Utilitários */
  function $(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slug(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'item';
  }
  function idUnico(base, lista) {
    var id = base, n = 2;
    while (lista.some(function (x) { return x.id === id; })) id = base + '-' + n++;
    return id;
  }
  function todosLinks() {
    return estado.secoes.reduce(function (a, s) { return a.concat(s.links); }, []);
  }
  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dataBR(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + (+p[0] !== new Date().getFullYear() ? '/' + p[0] : '');
  }
  function normalizarUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:|mailto:|tel:|#|\/|\.\/)/i.test(u)) return u;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return 'mailto:' + u;
    return 'https://' + u.replace(/^\/+/, '');
  }
  function baixar(nome, conteudo, tipo) {
    var url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function sha256(texto) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }
  function base64(texto) {
    var bytes = new TextEncoder().encode(texto), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function toast(msg, erro) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.toggle('is-erro', !!erro);
    t.classList.add('is-visivel');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.classList.remove('is-visivel'); }, erro ? 6000 : 3000);
  }
  function lerToken() { try { return localStorage.getItem(CHAVE_TOKEN) || ''; } catch (e) { return ''; } }

  /* Garante a forma esperada dos dados (arquivos antigos ou importados) */
  function normalizar(d) {
    d = d || {};
    d.perfil = Object.assign({ nome: '', frase: '', descricao: '' }, d.perfil);
    d.redes = Array.isArray(d.redes) ? d.redes : [];
    d.aoVivo = Object.assign({ ativo: false, url: '', horarios: '' }, d.aoVivo);
    d.rodape = Object.assign({ texto: '', endereco: '' }, d.rodape);
    d.secoes = (Array.isArray(d.secoes) ? d.secoes : []).map(function (s) {
      s = Object.assign({ id: '', titulo: '', recolhida: false, cor: 'auto' }, s);
      s.links = (Array.isArray(s.links) ? s.links : []).map(function (l) {
        return Object.assign({ id: '', titulo: '', descricao: '', url: '', icone: 'link', destaque: false, ativo: true, inicio: '', fim: '' }, l);
      });
      return s;
    });
    return d;
  }

  /* ------------------------------------------------------------ Rascunho */
  function pendente() { return JSON.stringify(estado) !== JSON.stringify(publicado); }

  function salvar() {
    try {
      if (pendente()) localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(estado));
      else localStorage.removeItem(CHAVE_RASCUNHO);
    } catch (e) { toast('Não foi possível salvar o rascunho neste navegador.', true); }
    atualizarStatus();
    enviarPrevia();
  }

  function atualizarStatus() {
    var p = pendente();
    $('barra').classList.toggle('is-pendente', p);
    $('status-titulo').textContent = p ? 'Alterações não publicadas' : 'Tudo publicado';
    $('status-texto').textContent = p
      ? 'Salvas neste navegador. Clique em Publicar para colocar no ar.'
      : 'A página no ar está igual ao que você vê aqui.';
    $('btn-publicar').disabled = !p;
  }

  /* ------------------------------------------------------------ Prévia */
  var previaPronta = false;
  function enviarPrevia() {
    var f = $('previa-frame');
    if (estado && previaPronta && f.contentWindow) f.contentWindow.postMessage({ tipo: 'ipjc-links', dados: estado }, location.origin);
  }
  window.addEventListener('message', function (e) {
    if (e.origin === location.origin && e.data && e.data.tipo === 'ipjc-links-pronto') { previaPronta = true; enviarPrevia(); }
  });

  /* ------------------------------------------------------------ Abas */
  function abrirAba(id) {
    aba = id;
    document.querySelectorAll('.adm-aba').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.aba === id)); });
    document.querySelectorAll('.adm-painel').forEach(function (p) { p.hidden = p.dataset.painel !== id; });
    render();
  }
  function render() {
    if (aba === 'links') renderLinks();
    else if (aba === 'perfil') renderPerfil();
    else renderPublicar();
  }

  /* ================================================================ LINKS */
  function situacao(l) {
    var h = hojeISO();
    if (!l.ativo) return ['oculto', 'Oculto'];
    if (l.inicio && h < l.inicio) return ['agendado', 'A partir de ' + dataBR(l.inicio)];
    if (l.fim && h > l.fim) return ['expirado', 'Encerrado em ' + dataBR(l.fim)];
    if (l.fim) return ['periodo', 'Até ' + dataBR(l.fim)];
    return null;
  }

  function linkItemHTML(l, si, li, total) {
    var sit = situacao(l);
    return '<li class="adm-link' + (sit && sit[0] !== 'periodo' ? ' is-apagado' : '') + '" draggable="true" data-s="' + si + '" data-l="' + li + '">' +
      '<span class="adm-alca" title="Arraste para reordenar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>' +
      '<button type="button" class="adm-link-corpo" data-acao="editar">' +
        '<span class="adm-link-ico' + (l.destaque ? ' is-destaque' : '') + '">' + ico(l.icone) + '</span>' +
        '<span class="adm-link-texto"><strong>' + esc(l.titulo || 'Sem título') + '</strong><small>' + esc(l.url.replace(/^https?:\/\/(www\.)?/, '')) + '</small>' +
          '<span class="adm-chips">' + (l.destaque ? '<span class="adm-chip adm-chip--destaque">Destaque</span>' : '') +
          (sit ? '<span class="adm-chip adm-chip--' + sit[0] + '">' + esc(sit[1]) + '</span>' : '') + '</span>' +
        '</span>' +
      '</button>' +
      '<span class="adm-link-acoes">' +
        '<button type="button" class="adm-ico-btn" data-acao="visivel" title="' + (l.ativo ? 'Ocultar' : 'Mostrar') + '" aria-label="' + (l.ativo ? 'Ocultar link' : 'Mostrar link') + '">' + (l.ativo ? OLHO : OLHO_FECHADO) + '</button>' +
        '<button type="button" class="adm-ico-btn" data-acao="subir" title="Subir" aria-label="Subir"' + (li === 0 ? ' disabled' : '') + '>' + SETA_CIMA + '</button>' +
        '<button type="button" class="adm-ico-btn" data-acao="descer" title="Descer" aria-label="Descer"' + (li === total - 1 ? ' disabled' : '') + '>' + SETA_BAIXO + '</button>' +
      '</span>' +
    '</li>';
  }

  function renderLinks() {
    var el = $('painel-links');
    var html = '<div class="adm-cabecalho"><h1>Seções e links</h1>' +
      '<p>Clique num link para editar. Arraste pela alça <b>⋮⋮</b> (ou use as setas) para mudar a ordem — inclusive para outra seção. Seção sem título aparece no topo, sem cabeçalho.</p></div>';

    html += estado.secoes.map(function (s, si) {
      var fechada = abertas[s.id] === false;
      return '<article class="adm-secao' + (fechada ? ' is-fechada' : '') + '" data-s="' + si + '">' +
        '<header class="adm-secao-topo">' +
          '<button type="button" class="adm-ico-btn adm-secao-abrir" data-acao="abrir-secao" aria-expanded="' + !fechada + '" aria-label="Mostrar ou esconder links">' + SETA_BAIXO + '</button>' +
          '<input class="adm-secao-nome" data-campo="titulo" value="' + esc(s.titulo) + '" placeholder="Sem título (topo)" aria-label="Título da seção">' +
          '<span class="adm-secao-qtd">' + s.links.length + '</span>' +
          '<button type="button" class="adm-ico-btn" data-acao="subir-secao" title="Subir seção" aria-label="Subir seção"' + (si === 0 ? ' disabled' : '') + '>' + SETA_CIMA + '</button>' +
          '<button type="button" class="adm-ico-btn" data-acao="descer-secao" title="Descer seção" aria-label="Descer seção"' + (si === estado.secoes.length - 1 ? ' disabled' : '') + '>' + SETA_BAIXO + '</button>' +
          '<button type="button" class="adm-ico-btn adm-ico-btn--perigo" data-acao="excluir-secao" title="Excluir seção" aria-label="Excluir seção">' + LIXO + '</button>' +
        '</header>' +
        '<div class="adm-secao-opcoes">' +
          '<label class="adm-mini"><span>Cor dos ícones</span><select data-campo="cor">' +
            CORES.map(function (c) { return '<option value="' + c[0] + '"' + (s.cor === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') +
          '</select></label>' +
          '<label class="adm-chave adm-chave--p"><input type="checkbox" data-campo="recolhida"' + (s.recolhida ? ' checked' : '') + (s.titulo ? '' : ' disabled') + '><span>Começa fechada (sanfona)</span></label>' +
        '</div>' +
        '<ul class="adm-links" data-s="' + si + '">' +
          (s.links.length ? s.links.map(function (l, li) { return linkItemHTML(l, si, li, s.links.length); }).join('')
            : '<li class="adm-vazio">Nenhum link nesta seção. Arraste um link para cá ou adicione abaixo.</li>') +
        '</ul>' +
        '<button type="button" class="adm-add-link" data-acao="novo-link">' + MAIS + ' Adicionar link</button>' +
      '</article>';
    }).join('');

    html += '<button type="button" class="adm-add-secao" id="btn-nova-secao">' + MAIS + ' Nova seção</button>';
    el.innerHTML = html;
  }

  function moverItem(lista, de, para) {
    var item = lista.splice(de, 1)[0];
    lista.splice(para, 0, item);
  }

  function ligarLinks() {
    var el = $('painel-links');

    el.addEventListener('click', function (e) {
      if (e.target.closest('#btn-nova-secao')) {
        var nome = 'Nova seção';
        estado.secoes.push({ id: idUnico(slug(nome), estado.secoes), titulo: nome, recolhida: false, cor: 'auto', links: [] });
        salvar(); renderLinks();
        var inputs = el.querySelectorAll('.adm-secao-nome');
        var ultimo = inputs[inputs.length - 1];
        ultimo.focus(); ultimo.select();
        ultimo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      var btn = e.target.closest('[data-acao]');
      if (!btn) return;
      var art = btn.closest('.adm-secao');
      var si = +art.dataset.s, s = estado.secoes[si];
      var li = btn.closest('.adm-link') ? +btn.closest('.adm-link').dataset.l : -1;

      switch (btn.dataset.acao) {
        case 'abrir-secao': abertas[s.id] = abertas[s.id] === false; renderLinks(); return;
        case 'subir-secao': moverItem(estado.secoes, si, si - 1); break;
        case 'descer-secao': moverItem(estado.secoes, si, si + 1); break;
        case 'excluir-secao':
          if (!confirm('Excluir a seção "' + (s.titulo || 'sem título') + '"' + (s.links.length ? ' e os seus ' + s.links.length + ' link(s)' : '') + '?')) return;
          estado.secoes.splice(si, 1);
          toast('Seção excluída.');
          break;
        case 'novo-link': abrirDialogo(si, -1); return;
        case 'editar': abrirDialogo(si, li); return;
        case 'visivel': s.links[li].ativo = !s.links[li].ativo; break;
        case 'subir': moverItem(s.links, li, li - 1); break;
        case 'descer': moverItem(s.links, li, li + 1); break;
        default: return;
      }
      salvar(); renderLinks();
    });

    el.addEventListener('input', function (e) {
      var campo = e.target.dataset.campo;
      if (!campo) return;
      var s = estado.secoes[+e.target.closest('.adm-secao').dataset.s];
      if (campo === 'titulo') {
        s.titulo = e.target.value;
        var chk = e.target.closest('.adm-secao').querySelector('[data-campo="recolhida"]');
        chk.disabled = !s.titulo;
        if (!s.titulo) { s.recolhida = false; chk.checked = false; }
      }
      else if (campo === 'cor') s.cor = e.target.value;
      else if (campo === 'recolhida') s.recolhida = e.target.checked;
      salvar();
    });

    /* Arrastar e soltar (computador) */
    var arrastando = null;
    el.addEventListener('dragstart', function (e) {
      var item = e.target.closest && e.target.closest('.adm-link');
      if (!item) return;
      arrastando = { s: +item.dataset.s, l: +item.dataset.l };
      item.classList.add('is-arrastando');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', ''); } catch (er) { /* Firefox */ }
    });
    el.addEventListener('dragend', function () {
      arrastando = null;
      el.querySelectorAll('.is-arrastando, .is-alvo-antes, .is-alvo-depois, .is-alvo').forEach(function (n) {
        n.classList.remove('is-arrastando', 'is-alvo-antes', 'is-alvo-depois', 'is-alvo');
      });
    });
    function alvo(e) {
      var lista = e.target.closest && e.target.closest('.adm-links');
      if (!lista) return null;
      var item = e.target.closest('.adm-link');
      var depois = item ? (e.clientY - item.getBoundingClientRect().top) > item.offsetHeight / 2 : true;
      return { lista: lista, item: item, depois: depois };
    }
    el.addEventListener('dragover', function (e) {
      if (!arrastando) return;
      var a = alvo(e);
      if (!a) return;
      e.preventDefault();
      el.querySelectorAll('.is-alvo-antes, .is-alvo-depois, .is-alvo').forEach(function (n) { n.classList.remove('is-alvo-antes', 'is-alvo-depois', 'is-alvo'); });
      if (a.item) a.item.classList.add(a.depois ? 'is-alvo-depois' : 'is-alvo-antes');
      else a.lista.classList.add('is-alvo');
    });
    el.addEventListener('drop', function (e) {
      if (!arrastando) return;
      var a = alvo(e);
      if (!a) return;
      e.preventDefault();
      var destino = +a.lista.dataset.s;
      var pos = a.item ? +a.item.dataset.l + (a.depois ? 1 : 0) : estado.secoes[destino].links.length;
      var link = estado.secoes[arrastando.s].links.splice(arrastando.l, 1)[0];
      if (destino === arrastando.s && arrastando.l < pos) pos--;
      estado.secoes[destino].links.splice(pos, 0, link);
      arrastando = null;
      salvar(); renderLinks();
    });
  }

  /* ------------------------------------------------------------ Diálogo do link */
  function abrirDialogo(si, li) {
    var novo = li < 0;
    var l = novo ? { titulo: '', descricao: '', url: '', icone: 'link', destaque: false, ativo: true, inicio: '', fim: '' } : estado.secoes[si].links[li];
    var f = $('form-link');
    editando = { secao: si, indice: li };

    $('dialogo-link-titulo').textContent = novo ? 'Novo link' : 'Editar link';
    $('btn-excluir-link').hidden = novo;
    $('link-erro').textContent = '';
    f.titulo.value = l.titulo; f.descricao.value = l.descricao; f.url.value = l.url;
    f.ativo.checked = l.ativo; f.destaque.checked = l.destaque;
    f.inicio.value = l.inicio || ''; f.fim.value = l.fim || '';
    $('link-secao').innerHTML = estado.secoes.map(function (s, i) {
      return '<option value="' + i + '"' + (i === si ? ' selected' : '') + '>' + esc(s.titulo || 'Sem título (topo)') + '</option>';
    }).join('');
    marcarIcone(l.icone);
    f.querySelectorAll('.campo').forEach(function (c) { c.classList.remove('is-erro'); });
    $('dialogo-link').showModal();
    if (novo) f.titulo.focus();
  }

  function marcarIcone(nome) {
    $('seletor-icones').querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.icone === nome));
    });
  }

  function ligarDialogo() {
    var dlg = $('dialogo-link'), f = $('form-link');

    $('seletor-icones').innerHTML = Object.keys(window.IPJC_ICONES_NOMES).map(function (k) {
      return '<button type="button" role="radio" data-icone="' + k + '" title="' + esc(window.IPJC_ICONES_NOMES[k]) + '" aria-label="' + esc(window.IPJC_ICONES_NOMES[k]) + '">' + ico(k) + '</button>';
    }).join('');
    $('seletor-icones').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) marcarIcone(b.dataset.icone);
    });

    /* Sugere o ícone pelo endereço, se ainda estiver no padrão */
    f.url.addEventListener('change', function () {
      var atual = $('seletor-icones').querySelector('[aria-checked="true"]');
      if (atual && atual.dataset.icone !== 'link') return;
      var u = f.url.value.toLowerCase(), sugestao = null;
      [['youtu', 'youtube'], ['instagram', 'instagram'], ['spotify', 'spotify'], ['facebook', 'facebook'], ['wa.me', 'whatsapp'], ['whatsapp', 'whatsapp'],
        ['maps', 'pin'], ['forms', 'formulario'], ['sympla', 'calendario'], ['tiktok', 'tiktok'], ['mailto', 'email']].some(function (p) {
        if (u.indexOf(p[0]) > -1) { sugestao = p[1]; return true; }
        return false;
      });
      if (sugestao) marcarIcone(sugestao);
    });

    dlg.addEventListener('click', function (e) {
      if (e.target.closest('[data-fechar]') || e.target === dlg) dlg.close();
    });

    $('btn-excluir-link').addEventListener('click', function () {
      var s = estado.secoes[editando.secao];
      if (!confirm('Excluir o link "' + s.links[editando.indice].titulo + '"?')) return;
      s.links.splice(editando.indice, 1);
      dlg.close(); salvar(); renderLinks(); toast('Link excluído.');
    });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var titulo = f.titulo.value.trim(), url = normalizarUrl(f.url.value);
      f.titulo.closest('.campo').classList.toggle('is-erro', !titulo);
      f.url.closest('.campo').classList.toggle('is-erro', !url);
      if (!titulo || !url) { $('link-erro').textContent = 'Preencha o título e o endereço.'; return; }
      if (f.inicio.value && f.fim.value && f.fim.value < f.inicio.value) { $('link-erro').textContent = 'A data final é anterior à inicial.'; return; }

      var origem = estado.secoes[editando.secao];
      var destinoI = +f.secao.value, destino = estado.secoes[destinoI];
      var novo = editando.indice < 0;
      var l = novo ? { id: idUnico(slug(titulo), todosLinks()) } : origem.links[editando.indice];
      var marcado = $('seletor-icones').querySelector('[aria-checked="true"]');
      Object.assign(l, {
        titulo: titulo, descricao: f.descricao.value.trim(), url: url,
        icone: marcado ? marcado.dataset.icone : 'link',
        ativo: f.ativo.checked, destaque: f.destaque.checked,
        inicio: f.inicio.value, fim: f.fim.value
      });
      if (novo) destino.links.push(l);
      else if (destino !== origem) { origem.links.splice(editando.indice, 1); destino.links.push(l); }

      abertas[destino.id] = true;
      dlg.close(); salvar(); renderLinks();
      toast(novo ? 'Link adicionado.' : 'Link atualizado.');
    });
  }

  /* ================================================================ PERFIL */
  function renderPerfil() {
    var p = estado.perfil, v = estado.aoVivo, r = estado.rodape;
    $('painel-perfil').innerHTML =
      '<div class="adm-cabecalho"><h1>Perfil e redes</h1><p>O topo e o rodapé da página.</p></div>' +

      '<div class="adm-card"><h2>Topo da página</h2><div class="adm-form" data-grupo="perfil">' +
        '<label class="campo"><span>Frase (em letra manuscrita)</span><input data-campo="frase" value="' + esc(p.frase) + '" maxlength="60"></label>' +
        '<p class="adm-ajuda">Coloque entre *asteriscos* a parte que fica em verde com o traço mostarda. Ex.: <code>Com Jesus, o jardim é *mais bonito*</code></p>' +
        '<label class="campo"><span>Linha de apoio</span><input data-campo="descricao" value="' + esc(p.descricao) + '" maxlength="90"></label>' +
        '<label class="campo"><span>Nome (título da aba do navegador)</span><input data-campo="nome" value="' + esc(p.nome) + '" maxlength="80"></label>' +
      '</div></div>' +

      '<div class="adm-card"><h2>Redes sociais</h2><p class="adm-texto">Aparecem como ícones redondos abaixo da frase.</p>' +
        '<ul class="adm-redes">' + estado.redes.map(function (rd, i) {
          return '<li data-i="' + i + '"><span class="adm-link-ico">' + ico(rd.tipo) + '</span>' +
            '<select data-rede="tipo" aria-label="Rede">' + REDES.map(function (o) { return '<option value="' + o[0] + '"' + (rd.tipo === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
            '<input data-rede="url" value="' + esc(rd.url) + '" placeholder="https://..." aria-label="Endereço">' +
            '<button type="button" class="adm-ico-btn" data-rede-acao="subir" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>' + SETA_CIMA + '</button>' +
            '<button type="button" class="adm-ico-btn adm-ico-btn--perigo" data-rede-acao="excluir" aria-label="Remover">' + LIXO + '</button></li>';
        }).join('') + '</ul>' +
        '<button type="button" class="btn btn--ghost btn--p" id="btn-nova-rede">' + MAIS + ' Adicionar rede</button>' +
      '</div>' +

      '<div class="adm-card"><h2>Aviso "Ao vivo agora"</h2>' +
        '<p class="adm-texto">Nos horários abaixo, aparece no topo um botão vermelho pulsando que leva para a transmissão.</p>' +
        '<div class="adm-form" data-grupo="aoVivo">' +
          '<label class="adm-chave"><input type="checkbox" data-campo="ativo"' + (v.ativo ? ' checked' : '') + '><span>Mostrar automaticamente nos horários de culto</span></label>' +
          '<label class="campo"><span>Link da transmissão</span><input data-campo="url" value="' + esc(v.url) + '" placeholder="https://www.youtube.com/@ipbjardimcamburi/live"></label>' +
          '<label class="campo"><span>Horários (um por linha)</span><textarea data-campo="horarios" rows="3">' + esc(v.horarios) + '</textarea></label>' +
          '<p class="adm-ajuda">Formato: <code>dom 09:00-10:30</code>. Dias: dom, seg, ter, qua, qui, sex, sab.</p>' +
        '</div></div>' +

      '<div class="adm-card"><h2>Rodapé</h2><div class="adm-form" data-grupo="rodape">' +
        '<label class="campo"><span>Texto</span><input data-campo="texto" value="' + esc(r.texto) + '"></label>' +
        '<label class="campo"><span>Endereço</span><input data-campo="endereco" value="' + esc(r.endereco) + '"></label>' +
      '</div></div>';
  }

  function ligarPerfil() {
    var el = $('painel-perfil');
    el.addEventListener('input', function (e) {
      var t = e.target, grupo = t.closest('[data-grupo]');
      if (grupo && t.dataset.campo) {
        estado[grupo.dataset.grupo][t.dataset.campo] = t.type === 'checkbox' ? t.checked : t.value;
        return salvar();
      }
      if (t.dataset.rede) {
        var li = t.closest('li'), rd = estado.redes[+li.dataset.i];
        rd[t.dataset.rede] = t.dataset.rede === 'url' ? t.value.trim() : t.value;
        if (t.dataset.rede === 'tipo') li.querySelector('.adm-link-ico').innerHTML = ico(t.value);
        salvar();
      }
    });
    el.addEventListener('change', function (e) {
      if (e.target.dataset.rede === 'url') {
        var rd = estado.redes[+e.target.closest('li').dataset.i];
        rd.url = normalizarUrl(e.target.value);
        e.target.value = rd.url; salvar();
      }
    });
    el.addEventListener('click', function (e) {
      if (e.target.closest('#btn-nova-rede')) {
        estado.redes.push({ tipo: 'instagram', url: '' });
        salvar(); renderPerfil();
        var urls = el.querySelectorAll('[data-rede="url"]');
        urls[urls.length - 1].focus();
        return;
      }
      var b = e.target.closest('[data-rede-acao]');
      if (!b) return;
      var i = +b.closest('li').dataset.i;
      if (b.dataset.redeAcao === 'subir') moverItem(estado.redes, i, i - 1);
      else estado.redes.splice(i, 1);
      salvar(); renderPerfil();
    });
  }

  /* ================================================================ PUBLICAR */
  function renderPublicar() {
    var token = lerToken();
    var gh = CFG.github;
    $('painel-publicar').innerHTML =
      '<div class="adm-cabecalho"><h1>Publicação e QR Code</h1><p>Como as alterações vão para o ar, cópias de segurança e o QR Code da página.</p></div>' +

      '<div class="adm-colunas">' +
      '<div class="adm-card"><h2>Publicar no GitHub</h2>' +
        '<p class="adm-texto">O botão <b>Publicar</b> grava <code>' + esc(gh.arquivo) + '</code> no repositório <code>' + esc(gh.repo) + '</code>. A página se atualiza em cerca de 1 minuto.</p>' +
        '<div class="adm-status ' + (token ? 'is-ok' : 'is-pendente') + '">' +
          '<strong>' + (token ? 'Este aparelho pode publicar' : 'Falta configurar o acesso neste aparelho') + '</strong>' +
          '<span>' + (token ? 'O token fica guardado só neste navegador.' : 'Cole abaixo um token do GitHub (passo a passo embaixo). É feito uma única vez por aparelho.') + '</span>' +
        '</div>' +
        '<form class="adm-form adm-form--linha" id="form-token">' +
          '<label class="campo"><span>Token do GitHub</span><input type="password" name="token" autocomplete="off" placeholder="' + (token ? '•••••••• (salvo)' : 'github_pat_...') + '"></label>' +
          '<div class="adm-botoes"><button class="btn btn--p" type="submit">Salvar token</button>' +
          (token ? '<button class="btn btn--perigo btn--p" type="button" id="btn-esquecer-token">Remover deste aparelho</button>' : '') + '</div>' +
        '</form>' +
        '<details class="adm-passo-a-passo"><summary>Como criar o token</summary><ol>' +
          '<li>No GitHub, entre em <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens</b> e clique em <b>Generate new token</b>.</li>' +
          '<li>Em <b>Repository access</b>, escolha <b>Only select repositories</b> → <code>' + esc(gh.repo) + '</code>.</li>' +
          '<li>Em <b>Permissions → Repository permissions → Contents</b>, escolha <b>Read and write</b>.</li>' +
          '<li>Defina a validade (ex.: 1 ano), gere e cole o token aqui.</li>' +
        '</ol></details>' +
      '</div>' +

      '<div class="adm-card"><h2>QR Code da página</h2>' +
        '<p class="adm-texto">Para os materiais impressos e telões. Aponta para <a href="' + esc(CFG.urlPublica) + '" target="_blank" rel="noopener">' + esc(CFG.urlPublica.replace(/^https?:\/\//, '')) + '</a>.</p>' +
        '<div class="adm-qr" id="qr"><span>Gerando…</span></div>' +
        '<div class="adm-botoes"><button class="btn btn--p" type="button" id="btn-qr-png">Baixar PNG</button>' +
        '<button class="btn btn--ghost btn--p" type="button" id="btn-qr-copiar">Copiar endereço</button></div>' +
      '</div>' +
      '</div>' +

      '<div class="adm-colunas">' +
      '<div class="adm-card"><h2>Cópia de segurança</h2>' +
        '<p class="adm-texto">Baixe o rascunho atual como <code>links.json</code> (também serve para publicar manualmente: envie o arquivo para a pasta <code>data/</code> do repositório) ou restaure uma cópia.</p>' +
        '<div class="adm-botoes">' +
          '<button class="btn btn--ghost btn--p" type="button" id="btn-baixar">Baixar links.json</button>' +
          '<label class="btn btn--ghost btn--p adm-arquivo">Importar arquivo<input type="file" accept="application/json,.json" id="input-importar"></label>' +
          '<button class="btn btn--perigo btn--p" type="button" id="btn-descartar"' + (pendente() ? '' : ' disabled') + '>Descartar alterações</button>' +
        '</div>' +
      '</div>' +

      '<div class="adm-card"><h2>Trocar senha do painel</h2>' +
        '<p class="adm-texto">Gere o resumo da nova senha e cole em <code>js/admin-config.js</code> (campo <code>senhaSha256</code>).</p>' +
        '<form class="adm-form adm-form--linha" id="form-senha">' +
          '<label class="campo"><span>Nova senha</span><input type="password" name="senha" minlength="8" autocomplete="new-password"></label>' +
          '<div class="adm-botoes"><button class="btn btn--p" type="submit">Gerar</button></div>' +
        '</form>' +
        '<p class="adm-hash" id="saida-hash" hidden></p>' +
      '</div>' +
      '</div>';

    gerarQR();
  }

  /* QR Code (js/vendor/qrcode.js): módulos em azul-noite, símbolo da igreja no
     centro — o nível de correção H tolera a área coberta pelo símbolo. */
  var simbolo = new Image();
  simbolo.src = 'assets/img/ipjc-simbolo.png';

  function desenharQR(canvas, tam) {
    var qr = window.qrcode(0, 'H');
    qr.addData(CFG.urlPublica);
    qr.make();
    var n = qr.getModuleCount(), margem = Math.round(tam * .08);
    var cel = (tam - margem * 2) / n;
    canvas.width = canvas.height = tam;
    var g = canvas.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, tam, tam);
    g.fillStyle = '#0F3240';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (qr.isDark(r, c)) g.fillRect(Math.floor(margem + c * cel), Math.floor(margem + r * cel), Math.ceil(cel), Math.ceil(cel));
      }
    }
    if (simbolo.complete && simbolo.naturalWidth) {
      var lado = tam * .2, x = (tam - lado) / 2, folga = lado * .14;
      g.fillStyle = '#fff';
      g.beginPath();
      if (g.roundRect) g.roundRect(x - folga, x - folga, lado + folga * 2, lado + folga * 2, folga * 1.6); else g.rect(x - folga, x - folga, lado + folga * 2, lado + folga * 2);
      g.fill();
      var w = lado * simbolo.naturalWidth / simbolo.naturalHeight;
      g.drawImage(simbolo, x + (lado - w) / 2, x, w, lado);
    }
  }

  function gerarQR() {
    var alvo = $('qr');
    function desenhar() {
      var c = document.createElement('canvas');
      desenharQR(c, 440);
      alvo.innerHTML = ''; alvo.appendChild(c);
    }
    if (simbolo.complete) desenhar(); else { simbolo.onload = simbolo.onerror = desenhar; }
  }

  function baixarQR() {
    var c = document.createElement('canvas');
    desenharQR(c, 1200);
    c.toBlob(function (b) {
      var url = URL.createObjectURL(b), a = document.createElement('a');
      a.href = url; a.download = 'qrcode-links-ipjc.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  function ligarPublicar() {
    var el = $('painel-publicar');
    el.addEventListener('submit', function (e) {
      e.preventDefault();
      if (e.target.id === 'form-token') {
        var t = e.target.token.value.trim();
        if (!t) return;
        try { localStorage.setItem(CHAVE_TOKEN, t); } catch (er) { /* ok */ }
        toast('Token salvo neste aparelho.');
        renderPublicar();
      }
      if (e.target.id === 'form-senha') {
        var senha = e.target.senha.value;
        if (senha.length < 8) return toast('Use pelo menos 8 caracteres.', true);
        sha256(senha).then(function (h) {
          var p = $('saida-hash');
          p.hidden = false;
          p.innerHTML = 'senhaSha256: <code>' + h + '</code>';
        });
      }
    });
    el.addEventListener('click', function (e) {
      var id = e.target.id;
      if (id === 'btn-esquecer-token') {
        try { localStorage.removeItem(CHAVE_TOKEN); } catch (er) { /* ok */ }
        toast('Token removido deste aparelho.'); renderPublicar();
      } else if (id === 'btn-baixar') {
        baixar('links.json', JSON.stringify(estado, null, 2) + '\n', 'application/json');
      } else if (id === 'btn-descartar') {
        if (!confirm('Descartar todas as alterações e voltar ao que está publicado?')) return;
        estado = clone(publicado); salvar(); renderPublicar(); toast('Alterações descartadas.');
      } else if (id === 'btn-qr-png') {
        baixarQR();
      } else if (id === 'btn-qr-copiar') {
        navigator.clipboard.writeText(CFG.urlPublica).then(function () { toast('Endereço copiado.'); });
      }
    });
    el.addEventListener('change', function (e) {
      if (e.target.id !== 'input-importar' || !e.target.files[0]) return;
      e.target.files[0].text().then(function (txt) {
        var d = JSON.parse(txt);
        if (!d || !Array.isArray(d.secoes)) throw new Error('formato');
        estado = normalizar(d); salvar(); toast('Arquivo importado. Confira e publique.');
      }).catch(function () { toast('Arquivo inválido: escolha um links.json.', true); });
      e.target.value = '';
    });
  }

  /* ------------------------------------------------------------ Publicar (GitHub) */
  function publicar() {
    var token = lerToken();
    if (!token) {
      abrirAba('publicar');
      return toast('Configure o token do GitHub para publicar deste aparelho.', true);
    }
    var gh = CFG.github;
    var api = 'https://api.github.com/repos/' + gh.repo + '/contents/' + gh.arquivo;
    var cab = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    var btn = $('btn-publicar');
    btn.disabled = true; btn.textContent = 'Publicando…';

    var conteudo = JSON.stringify(estado, null, 2) + '\n';
    fetch(api + '?ref=' + encodeURIComponent(gh.branch), { headers: cab, cache: 'no-store' })
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw r;
        return r.json();
      })
      .then(function (atual) {
        return fetch(api, {
          method: 'PUT', headers: cab,
          body: JSON.stringify({
            message: 'Atualiza links publicados (painel)',
            content: base64(conteudo), branch: gh.branch,
            sha: atual ? atual.sha : undefined
          })
        });
      })
      .then(function (r) { if (!r.ok) throw r; })
      .then(function () {
        publicado = clone(estado); salvar();
        toast('Publicado! A página se atualiza em cerca de 1 minuto.');
      })
      .catch(function (r) {
        var st = r && r.status;
        toast(st === 401 ? 'Token inválido ou vencido. Gere outro em "Publicação e QR Code".'
          : st === 403 || st === 404 ? 'O token não tem permissão de escrita neste repositório.'
          : st === 409 ? 'O arquivo mudou no GitHub enquanto você editava. Tente de novo.'
          : 'Não foi possível publicar agora. Verifique a internet e tente de novo.', true);
      })
      .then(function () { btn.textContent = 'Publicar'; atualizarStatus(); if (aba === 'publicar') renderPublicar(); });
  }

  /* ------------------------------------------------------------ Ícones de interface */
  function svg(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var SETA_CIMA = svg('<path d="m18 15-6-6-6 6"/>');
  var SETA_BAIXO = svg('<path d="m6 9 6 6 6-6"/>');
  var LIXO = svg('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>');
  var MAIS = svg('<path d="M12 5v14M5 12h14"/>');
  var OLHO = svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>');
  var OLHO_FECHADO = svg('<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/>');

  /* ------------------------------------------------------------ Login e início */
  function iniciarApp() {
    $('tela-login').hidden = true;
    $('tela-app').hidden = false;
    fetch(ARQUIVO, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { return { secoes: [] }; })
      .then(function (d) {
        publicado = normalizar(d);
        var rascunho = null;
        try { rascunho = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO)); } catch (e) { /* sem rascunho */ }
        estado = rascunho ? normalizar(rascunho) : clone(publicado);
        ligarLinks(); ligarDialogo(); ligarPerfil(); ligarPublicar();
        document.querySelectorAll('.adm-aba').forEach(function (b) { b.addEventListener('click', function () { abrirAba(b.dataset.aba); }); });
        $('btn-publicar').addEventListener('click', publicar);
        $('btn-previa-mobile').addEventListener('click', function () { document.body.classList.add('previa-aberta'); });
        $('btn-previa-fechar').addEventListener('click', function () { document.body.classList.remove('previa-aberta'); });
        abrirAba('links');
        atualizarStatus();
        enviarPrevia();
        if (rascunho && pendente()) toast('Você tem alterações ainda não publicadas.');
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('btn-sair').addEventListener('click', function () {
      try { sessionStorage.removeItem(SESSAO); } catch (e) { /* ok */ }
      location.reload();
    });
    try { if (sessionStorage.getItem(SESSAO) === '1') return iniciarApp(); } catch (e) { /* sem sessionStorage */ }

    $('form-login').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, erro = $('login-erro');
      if (!window.crypto || !crypto.subtle) { erro.textContent = 'Abra o painel pelo endereço https:// da página.'; return; }
      sha256(form.senha.value).then(function (h) {
        if (form.usuario.value.trim() === CFG.usuario && h === CFG.senhaSha256) {
          try { sessionStorage.setItem(SESSAO, '1'); } catch (e2) { /* ok */ }
          iniciarApp();
        } else {
          erro.textContent = 'Usuário ou senha incorretos.';
          form.senha.select();
        }
      });
    });
  });
})();
