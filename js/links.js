/* ==========================================================================
   IPJC Links — Página pública

   Lê data/links.json e monta perfil, redes, aviso "Ao vivo" e seções.
   Modo prévia (index.html?previa): usado pelo painel dentro de um iframe;
   recebe o rascunho por postMessage em vez de ler o arquivo publicado.
   ========================================================================== */
(function () {
  'use strict';

  var ARQUIVO = 'data/links.json';
  var PREVIA = /[?&]previa\b/.test(location.search);
  var ico = window.IPJC_ICONE;
  var TONS = ['azul', 'verde', 'mostarda', 'borgonha'];
  var DIAS = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, 'sáb': 6 };
  var REDES = {
    instagram: 'Instagram', youtube: 'YouTube', spotify: 'Spotify', facebook: 'Facebook',
    whatsapp: 'WhatsApp', tiktok: 'TikTok', email: 'E-mail', globo: 'Site'
  };

  function $(id) { return document.getElementById(id); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* Link aparece se estiver ativo e dentro do período (inicio/fim opcionais, AAAA-MM-DD) */
  function visivel(l) {
    if (!l || l.ativo === false || !l.url) return false;
    var h = hojeISO();
    if (l.inicio && h < l.inicio) return false;
    if (l.fim && h > l.fim) return false;
    return true;
  }

  /* "dom 09:00-10:30" por linha → está no horário agora? */
  function aoVivoAgora(cfg) {
    if (!cfg || !cfg.ativo || !cfg.url) return false;
    var agora = new Date();
    var min = agora.getHours() * 60 + agora.getMinutes();
    return String(cfg.horarios || '').split('\n').some(function (linha) {
      var m = linha.trim().toLowerCase().match(/^(\S+)\s+(\d{1,2})[:h](\d{2})\s*-\s*(\d{1,2})[:h](\d{2})$/);
      if (!m || DIAS[m[1].slice(0, 3)] !== agora.getDay()) return false;
      return min >= +m[2] * 60 + +m[3] && min < +m[4] * 60 + +m[5];
    });
  }

  function linkHTML(l) {
    var externo = /^https?:/i.test(l.url);
    return '<li><a class="lk-link' + (l.destaque ? ' lk-link--destaque' : '') + '" href="' + esc(l.url) + '"' +
      (externo ? ' target="_blank" rel="noopener"' : '') + '>' +
      '<span class="lk-link-ico">' + ico(l.icone) + '</span>' +
      '<span class="lk-link-texto"><strong>' + esc(l.titulo) + '</strong>' +
      (l.descricao ? '<small>' + esc(l.descricao) + '</small>' : '') + '</span>' +
      ico('diagonal', 'lk-link-seta') + '</a></li>';
  }

  function secaoHTML(s, i) {
    var links = (s.links || []).filter(visivel);
    if (!links.length) return '';
    var tom = s.cor && s.cor !== 'auto' ? s.cor : TONS[i % TONS.length];
    var lista = '<ul class="lk-lista">' + links.map(linkHTML).join('') + '</ul>';
    var titulo = s.titulo ? '<h2 class="lk-secao-titulo">' + esc(s.titulo) + '</h2>' : '';
    var corpo = s.titulo && s.recolhida
      ? '<details><summary>' + titulo + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>' + lista + '</details>'
      : titulo + lista;
    return '<section class="lk-secao" data-tom="' + tom + '" style="animation-delay:' + (0.08 * i + 0.1).toFixed(2) + 's">' + corpo + '</section>';
  }

  function render(d) {
    var p = d.perfil || {};
    $('lk-frase').innerHTML = esc(p.frase || '').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    $('lk-descricao').textContent = p.descricao || '';

    $('lk-redes').innerHTML = (d.redes || []).filter(function (r) { return r.url; }).map(function (r) {
      return '<li><a href="' + esc(r.url) + '" target="_blank" rel="noopener" aria-label="' + esc(REDES[r.tipo] || r.tipo) + '" title="' + esc(REDES[r.tipo] || r.tipo) + '">' + ico(r.tipo) + '</a></li>';
    }).join('');

    var vivo = $('lk-aovivo');
    vivo.hidden = !aoVivoAgora(d.aoVivo);
    if (d.aoVivo) vivo.href = d.aoVivo.url;

    var html = (d.secoes || []).map(secaoHTML).join('');
    $('lk-secoes').innerHTML = (PREVIA ? '<p class="lk-aviso-rascunho">Prévia do rascunho — ainda não publicado</p>' : '') +
      (html || '<p class="lk-erro">Nenhum link por aqui ainda.</p>');

    var r = d.rodape || {};
    $('lk-rodape-texto').textContent = r.texto || '';
    $('lk-rodape-endereco').textContent = r.endereco || '';
    if (p.nome) document.title = 'Links — ' + p.nome;
  }

  function toast(msg) {
    var t = $('lk-toast');
    t.textContent = msg; t.classList.add('is-visivel');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('is-visivel'); }, 2600);
  }

  function compartilhar() {
    var url = location.href.split(/[?#]/)[0];
    if (navigator.share) {
      navigator.share({ title: document.title, url: url }).catch(function () { /* cancelado */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { toast('Link copiado!'); });
    } else {
      prompt('Copie o link:', url);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-icone]').forEach(function (el) { el.innerHTML = ico(el.getAttribute('data-icone')); });
    $('lk-compartilhar').addEventListener('click', compartilhar);

    if (PREVIA) {
      document.body.classList.add('is-previa');
      window.addEventListener('message', function (e) {
        if (e.origin === location.origin && e.data && e.data.tipo === 'ipjc-links') render(e.data.dados);
      });
      if (window.parent !== window) window.parent.postMessage({ tipo: 'ipjc-links-pronto' }, location.origin);
      return;
    }

    fetch(ARQUIVO, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        render(d);
        /* Reavalia o "Ao vivo" a cada minuto, sem recarregar */
        setInterval(function () { $('lk-aovivo').hidden = !aoVivoAgora(d.aoVivo); }, 60000);
      })
      .catch(function () {
        $('lk-secoes').innerHTML = '<p class="lk-erro">Não foi possível carregar os links agora.<br>Acesse <a href="https://www.ipjc.org.br/">ipjc.org.br</a>.</p>';
      });
  });

  window.IPJCLinks = { visivel: visivel, aoVivoAgora: aoVivoAgora };
})();
