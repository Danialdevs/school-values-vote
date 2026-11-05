/* Общие функции для экранов: живое обновление, анимация чисел, конфетти. */
(function () {
  'use strict';
  var SV = (window.SV = {});

  /* Живые данные: опрашиваем базу раз в секунду (отрисовываем только при изменениях). */
  SV.live = function (onState, onConn, every) {
    var last = Date.now(), key = '', busy = false;
    function tick() {
      if (busy) return;
      busy = true;
      API.state().then(function (s) {
        busy = false; last = Date.now();
        if (onConn) onConn(true);
        var k = String(s.rev);
        if (k === key) return;
        key = k;
        onState(s);
      }).catch(function () {
        busy = false;
        if (onConn && Date.now() - last > 8000) onConn(false);
      });
    }
    tick();
    setInterval(tick, every || 1000);
  };

  /* QR-код (SVG) прямо в браузере. */
  SV.qrSvg = function (text) {
    var qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount(), m = 2, d = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        var w = 1;
        while (c + w < n && qr.isDark(r, c + w)) w++;
        d += 'M' + (c + m) + ' ' + (r + m) + 'h' + w + 'v1h-' + w + 'z';
        c += w - 1;
      }
    }
    var s = n + m * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" shape-rendering="crispEdges">' +
      '<rect width="' + s + '" height="' + s + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  };
  SV.qrDataUrl = function (text) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SV.qrSvg(text)); };

  /* Плавно «докручивает» число в элементе. */
  SV.countTo = function (el, to, ms, onStep) {
    var from = el._v == null ? to : el._v;
    el._v = to;
    var token = (el._tk = (el._tk || 0) + 1);
    function set(n) {
      var s = String(n);
      if (el.textContent !== s) { el.textContent = s; if (onStep) onStep(n); }
    }
    if (from === to) { set(to); if (onStep) onStep(to); return; }
    var t0 = performance.now(), dur = ms || 900;
    function f(now) {
      if (el._tk !== token) return;
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      set(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  };

  SV.rgb = function (hex) {
    var h = String(hex || '#888').replace('#', '');
    if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    var n = parseInt(h, 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  };

  /* Отсортированный список: больше голосов — выше, при равенстве — исходный порядок. */
  SV.ranked = function (values, counts) {
    return values
      .map(function (v, i) { return { name: v, i: i, count: counts[v] || 0 }; })
      .sort(function (a, b) { return b.count - a.count || a.i - b.i; });
  };

  SV.plural = function (n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };

  /* Размер шрифта страницы подстраивается под экран (1rem ≈ 1% длинной стороны). */
  SV.fitRoot = function (after) {
    function fit() {
      var w = window.innerWidth, h = window.innerHeight;
      var base = Math.min(Math.max(w, h) / 100, Math.min(w, h) / 56.25);
      document.documentElement.style.fontSize = base.toFixed(2) + 'px';
      if (after) after();
    }
    window.addEventListener('resize', fit);
    fit();
  };

  /* Не даём экрану панели уснуть (работает на https/localhost). */
  SV.wakeLock = function () {
    var lock = null;
    function req() {
      if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(function (l) { lock = l; }).catch(function () {});
    }
    document.addEventListener('visibilitychange', req);
    document.addEventListener('click', req, { once: true });
    req();
  };

  SV.fullscreen = function () {
    var d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } else {
      var f = el.requestFullscreen || el.webkitRequestFullscreen;
      if (f) { var p = f.call(el); if (p && p.catch) p.catch(function () {}); }
    }
  };

  /* Конфетти на canvas. */
  SV.confetti = function (canvas, colors, ms) {
    var ctx = canvas.getContext('2d');
    var W, H, dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() { W = canvas.width = window.innerWidth * dpr; H = canvas.height = window.innerHeight * dpr; }
    size();
    var parts = [], N = 220, end = performance.now() + (ms || 5000);
    for (var i = 0; i < N; i++) {
      parts.push({
        x: Math.random() * W, y: -Math.random() * H * 0.6 - 20,
        vx: (Math.random() - 0.5) * 3 * dpr, vy: (2 + Math.random() * 4) * dpr,
        r: (5 + Math.random() * 8) * dpr, a: Math.random() * 6.28, va: (Math.random() - 0.5) * 0.3,
        c: colors[i % colors.length],
      });
    }
    canvas.style.display = 'block';
    function frame(now) {
      ctx.clearRect(0, 0, W, H);
      var alive = false, fade = Math.max(0, Math.min(1, (end - now) / 1200));
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.a += p.va; p.vy += 0.04 * dpr;
        if (p.y < H + 30) alive = true;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      });
      if (alive && now < end) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); canvas.style.display = 'none'; }
    }
    requestAnimationFrame(frame);
  };
})();
