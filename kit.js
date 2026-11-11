/* Общий движок: холст, цикл кадров, искры, показ текста. Сцена передаётся в play({init, draw, tap, sayAt, hintAt, endAt}). */
(function () {
  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d');
  var say = document.getElementById('say');
  var hint = document.getElementById('hint');
  var css = getComputedStyle(document.documentElement);
  var S = {
    t: 0, dt: 0, W: 0, H: 0, cx: 0,
    calm: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    hand: css.getPropertyValue('--font-hand').trim(),
    word: css.getPropertyValue('--font-word').trim()
  };
  var scene = null, running = false, last = 0, dpr = 1, sparks = [];

  var K = window.K = {
    clamp: function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; },
    prog: function (t, from, dur) { var p = K.clamp((t - from) / dur); return p * p * (3 - 2 * p); },
    lerp: function (a, b, p) { return a + (b - a) * p; },
    rgb: function (a, b, p, al) {
      return 'rgba(' + Math.round(a[0] + (b[0] - a[0]) * p) + ',' + Math.round(a[1] + (b[1] - a[1]) * p) + ',' +
        Math.round(a[2] + (b[2] - a[2]) * p) + ',' + (al == null ? 1 : al.toFixed(3)) + ')';
    },
    heart: function (x, y, s) {
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.9);
      ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.3, x, y - s * 0.45);
      ctx.bezierCurveTo(x + s * 0.7, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
    },
    star: function (x, y, r, rot) {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = (rot || 0) + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r;
        ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q);
      }
      ctx.closePath();
    },
    rr: function (x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },
    burst: function (x, y, n, o) {
      o = o || {};
      if (sparks.length > 600) return;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.283, v = (o.power == null ? 160 : o.power) * (0.25 + Math.random() * 0.75);
        var col = o.col || '#ffffff';
        if (typeof col !== 'string') col = col[Math.floor(Math.random() * col.length)];
        sparks.push({
          x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          g: o.grav == null ? 60 : o.grav, life: 0,
          dur: (o.dur || 1.2) * (0.6 + Math.random() * 0.6),
          r: (o.size || 2) * (0.6 + Math.random() * 0.8),
          col: col, shape: o.shape || 'dot', rot: Math.random() * 6.283
        });
      }
    }
  };

  function drawSparks() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.life += S.dt;
      if (s.life > s.dur) { sparks.splice(i, 1); continue; }
      s.vx *= 0.975; s.vy = s.vy * 0.975 + s.g * S.dt;
      s.x += s.vx * S.dt; s.y += s.vy * S.dt;
      ctx.globalAlpha = 1 - s.life / s.dur;
      ctx.fillStyle = s.col;
      if (s.shape === 'heart') { K.heart(s.x, s.y, s.r * 1.7); ctx.fill(); }
      else if (s.shape === 'star') { K.star(s.x, s.y, s.r * 2.2, s.rot + s.life * 2); ctx.fill(); }
      else if (s.shape === 'note') { ctx.font = Math.round(s.r * 7) + 'px sans-serif'; ctx.fillText('♪', s.x, s.y); }
      else { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  function size() {
    var b = canvas.getBoundingClientRect();
    S.W = b.width || window.innerWidth || 360;
    S.H = b.height || window.innerHeight || 640;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(S.W * dpr);
    canvas.height = Math.round(S.H * dpr);
    S.cx = S.W / 2;
    if (scene.init) scene.init(S);
  }

  function frame(now) {
    S.dt = Math.min((now - last) / 1000 || 0, 0.033);
    last = now; S.t += S.dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S.W, S.H);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
    ctx.save();
    scene.draw(ctx, S);
    ctx.restore();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
    drawSparks();
    if (S.t > scene.sayAt) say.classList.add('on');
    if (S.t > scene.hintAt) hint.classList.add('on');
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    if (S.calm) S.t = scene.endAt || 40;
    var skip = /^#t=(\d+(\.\d+)?)$/.exec(location.hash); // для проверки: #t=12 начинает с 12-й секунды
    if (skip) S.t = parseFloat(skip[1]);
    size();
    requestAnimationFrame(function (now) { last = now; frame(now); });
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (!running) return;
    var b = canvas.getBoundingClientRect();
    if (scene.tap) scene.tap(S, ev.clientX - b.left, ev.clientY - b.top);
    hint.classList.remove('on');
    scene.hintAt = Infinity;
  });

  var timer;
  window.addEventListener('resize', function () {
    if (!running) return;
    clearTimeout(timer);
    timer = setTimeout(size, 150);
  });

  window.play = function (sc) {
    scene = sc;
    // ждём шрифты, но не дольше полутора секунд
    var ready = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('400 16px "Marck Script"', 'Софа'), document.fonts.load('800 16px Manrope', '1')])
      : Promise.resolve();
    ready.then(start, start);
    setTimeout(start, 1500);
  };
})();
