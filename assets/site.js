/* Shared script for every page: logo, intro, header, menu, scroll route, reveals. */
(function(){
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----- logo mark: traced from the supplied logo. 20 segments between an inner and an outer circle,
     cut by gaps that fan out from one point (gx, gy). All numbers are measured from the image. ----- */
  function buildMark(svg){
    var w = 3, first = 17, html = '';
    var G = [60.95, 34.54], ci = [61.69, 36.16], co = [50, 50];
    var R = 49.46 - w / 2, r = 25.9 + w / 2, off = (2.3 + w) / 2;
    var gaps = [2.25, 20, 37.5, 55, 72.25, 89.5, 106.5, 123.75, 141.5, 160, 179, 198.25, 217.25, 235.75, 254, 272.25, 290.25, 308, 326, 343.75], N = gaps.length;
    function hit(b, d, c, rad){
      var q = [b[0] - c[0], b[1] - c[1]], qd = q[0] * d[0] + q[1] * d[1];
      var t = -qd + Math.sqrt(qd * qd - (q[0] * q[0] + q[1] * q[1]) + rad * rad);
      return (b[0] + d[0] * t).toFixed(2) + ' ' + (b[1] + d[1] * t).toFixed(2);
    }
    function edge(deg, o){
      var t = deg * Math.PI / 180, d = [Math.cos(t), Math.sin(t)], b = [G[0] - d[1] * o, G[1] + d[0] * o];
      return [hit(b, d, ci, r), hit(b, d, co, R)];
    }
    for (var j = 0; j < N; j++){
      var k = (first + j) % N, e0 = edge(gaps[k], off), e1 = edge(gaps[(k + 1) % N], -off);
      html += '<path style="--i:' + j + '" d="M' + e0[0] + 'L' + e0[1] + 'A' + R.toFixed(2) + ' ' + R.toFixed(2) + ' 0 0 1 ' + e1[1] +
              'L' + e1[0] + 'A' + r.toFixed(2) + ' ' + r.toFixed(2) + ' 0 0 0 ' + e0[0] + 'Z"/>';
    }
    svg.innerHTML = html;
  }
  document.querySelectorAll('svg.mark').forEach(buildMark);

  document.querySelectorAll('[data-split]').forEach(function(el){
    el.innerHTML = el.textContent.split('').map(function(c, i){ return '<span style="--i:' + i + '">' + c + '</span>'; }).join('');
  });

  /* ----- intro (home page only, once per browser session) ----- */
  var intro = document.getElementById('intro'), ended = false, seen = false;
  try { seen = sessionStorage.getItem('introSeen') === '1'; } catch (e) {}
  function ready(){ document.body.classList.remove('locked'); document.body.classList.add('ready'); }
  function endIntro(){
    if (ended) return; ended = true;
    intro.classList.add('done'); ready();
    try { sessionStorage.setItem('introSeen', '1'); } catch (e) {}
    setTimeout(function(){ intro.remove(); }, 900);
  }
  if (!intro) ready();
  else if (reduce || seen || /[?&]intro=0/.test(location.search)){ intro.remove(); ready(); }
  else {
    document.body.classList.add('locked'); intro.classList.add('play');
    setTimeout(endIntro, 2700); intro.addEventListener('click', endIntro); window.addEventListener('keydown', endIntro, {once:true});
  }

  /* ----- header ----- */
  var header = document.getElementById('header'), burger = document.getElementById('burger'), totop = document.getElementById('totop');
  function onScroll(){
    var y = window.scrollY;
    header.classList.toggle('scrolled', y > 12);
    totop.classList.toggle('show', y > 700);
  }
  window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
  totop.addEventListener('click', function(){ window.scrollTo({top:0, behavior: reduce ? 'auto' : 'smooth'}); });
  function setMenu(open){
    header.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('locked', open);
  }
  burger.addEventListener('click', function(){ setMenu(!header.classList.contains('menu-open')); });
  document.querySelectorAll('#nav a').forEach(function(a){ a.addEventListener('click', function(){ setMenu(false); }); });
  window.addEventListener('keydown', function(e){ if (e.key === 'Escape') setMenu(false); });

  /* ----- scroll route: a plane follows the path going down, a ship going up ----- */
  var route = document.getElementById('route'), base = route.querySelector('.base'), trail = route.querySelector('.trail'), craft = document.getElementById('craft');
  var pts = [], total = 0, cur = 0, target = 0, dir = 1, lastY = window.scrollY, raf = 0, builtW = 0, builtH = 0;
  function buildRoute(){
    var w = document.documentElement.clientWidth, docH = document.querySelector('footer').offsetTop;
    if (w === builtW && docH === builtH) return;
    builtW = w; builtH = docH;
    route.setAttribute('viewBox', '0 0 ' + w + ' ' + docH);
    route.style.height = docH + 'px';
    var g = Math.max(20, (w - 1160) / 2 + 20), xl = Math.max(11, g / 2), xr = w - xl;
    craft.classList.toggle('sm', g < 70);
    var secs = [].slice.call(document.querySelectorAll('main > *'));
    var x = xr, d = 'M' + x + ' 100';
    for (var i = 0; i < secs.length - 1; i++){
      if (secs[i].classList.contains('c-hero')) continue;   /* no crossing through the page title block */
      var c = secs[i].offsetTop + secs[i].offsetHeight - 30, nx = x === xr ? xl : xr;
      d += 'L' + x + ' ' + (c - 44) + 'C' + x + ' ' + c + ' ' + nx + ' ' + c + ' ' + nx + ' ' + (c + 44);
      x = nx;
    }
    d += 'L' + x + ' ' + (docH - 50);
    base.setAttribute('d', d); trail.setAttribute('d', d);
    total = base.getTotalLength();
    var n = Math.ceil(total / 6); pts = [];
    for (var j = 0; j <= n; j++){ var p = base.getPointAtLength(total * j / n); pts.push([p.x, p.y]); }
    trail.style.strokeDasharray = total;
    target = targetIdx(); cur = target; place();
  }
  function targetIdx(){
    var vh = window.innerHeight, max = document.documentElement.scrollHeight - vh;
    var p = max > 0 ? Math.min(1, window.scrollY / max) : 0, ty = window.scrollY + vh * (.28 + .44 * p);
    var lo = 0, hi = pts.length - 1;
    while (lo < hi){ var mid = (lo + hi) >> 1; if (pts[mid][1] < ty) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function place(){
    if (!pts.length) return;
    var last = pts.length - 1, i = Math.max(0, Math.min(last, Math.round(cur)));
    var a = pts[Math.max(0, i - 3)], b = pts[Math.min(last, i + 3)], p = pts[i];
    var ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI + 90 + (dir < 0 ? 180 : 0);
    craft.style.transform = 'translate(' + p[0].toFixed(1) + 'px,' + p[1].toFixed(1) + 'px) rotate(' + ang.toFixed(1) + 'deg)';
    trail.style.strokeDashoffset = (total * (1 - i / last)).toFixed(1);
  }
  function frame(){
    raf = 0;
    var diff = target - cur;
    if (reduce || Math.abs(diff) < .6) cur = target; else cur += diff * .13;
    place();
    if (cur !== target) raf = requestAnimationFrame(frame);
  }
  window.addEventListener('scroll', function(){
    var y = window.scrollY;
    if (Math.abs(y - lastY) > 2){ dir = y > lastY ? 1 : -1; craft.classList.toggle('up', dir < 0); lastY = y; }
    target = targetIdx();
    if (!raf) raf = requestAnimationFrame(frame);
  }, {passive:true});
  buildRoute();
  window.addEventListener('load', buildRoute);
  window.addEventListener('resize', buildRoute);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildRoute);
  if ('ResizeObserver' in window) new ResizeObserver(buildRoute).observe(document.querySelector('main'));

  /* ----- scroll reveal ----- */
  var steps = document.getElementById('steps');
  if ('IntersectionObserver' in window && !reduce){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    }, {threshold: .1, rootMargin: '0px 0px -40px 0px'});
    document.querySelectorAll('.rv').forEach(function(el){ io.observe(el); });
    if (steps) io.observe(steps);
  } else {
    document.querySelectorAll('.rv').forEach(function(el){ el.classList.add('in'); });
    if (steps) steps.classList.add('in');
  }

  /* ----- count up ----- */
  function countUp(el){
    var end = +el.dataset.count, from = end > 1000 ? end - 60 : 0, t0 = null, dur = 1400;
    function tick(t){
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (end - from) * e);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window && !reduce){
    var co = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if (e.isIntersecting){ countUp(e.target); co.unobserve(e.target); } });
    }, {threshold: .6});
    document.querySelectorAll('[data-count]').forEach(function(el){ co.observe(el); });
  }

  /* ----- demo enquiry form (contact page) ----- */
  var enq = document.getElementById('enq');
  if (enq) enq.addEventListener('submit', function(e){ e.preventDefault(); document.getElementById('sent').classList.add('show'); });

  document.getElementById('yr').textContent = new Date().getFullYear();
})();
