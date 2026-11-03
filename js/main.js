/* ==========================================================================
   main.js — Adolfo Monti portfolio
   1. Scroll reveals        (IntersectionObserver)
   2. Follower cursor       (lerp animation loop)
   3. Sticky-reveal footer  (measure + scroll progress)
   4. Header                (hide on scroll down, mobile menu)
   5. "Let's talk" anchors  (scroll to the fixed footer)
   No dependencies. Everything degrades gracefully without JS.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ------------------------------------------------------------------------
     1. SCROLL REVEALS
     Any element with [data-reveal] starts at opacity 0 / translateY(20px)
     (see css §14). An IntersectionObserver adds .is-visible once the element
     is ~12% inside the viewport; CSS then transitions it to opacity 1 / 0px.

     - rootMargin '-6%' on the bottom means an element must rise slightly above
       the bottom edge before it fires, so reveals are actually seen.
     - We unobserve after the first hit: each element animates only once.
     - data-reveal-delay="120" staggers siblings (milliseconds).
     ------------------------------------------------------------------------ */
  var revealEls = document.querySelectorAll('[data-reveal]');

  revealEls.forEach(function (el) {
    var delay = el.getAttribute('data-reveal-delay');
    if (delay) el.style.setProperty('--reveal-delay', delay + 'ms');
  });

  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        // Also reveal anything already ABOVE the viewport (fast jumps / anchor links can skip past it).
        if (!entry.isIntersecting && entry.boundingClientRect.top > 0) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    // No IO support or reduced motion: show everything immediately.
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // Autoplaying videos: with reduced motion they stay paused and get native controls instead.
  if (reduceMotion) {
    document.querySelectorAll('video[autoplay]').forEach(function (v) {
      v.removeAttribute('autoplay');
      v.pause();
      v.controls = true;
    });
  }

  /* ------------------------------------------------------------------------
     2. FOLLOWER CURSOR (lerp)
     LERP = "linear interpolation": each frame the cursor moves a fraction of
     the remaining distance toward the target:

         current = current + (target - current) * k

     With a fixed k the speed depends on the frame rate, so we make k
     frame-rate independent using an exponential decay:

         k = 1 - e^(-dt / tau)

     dt is the time since the last frame (ms) and tau is the "lag" time
     constant. Smaller tau = snappier, larger tau = floatier.
     Position uses tau 90ms, scale uses tau 120ms.

     The same lerp animates the dot's SCALE between states:
         default → 0.25 (24px), link/button → ~0.42 (40px), project image → 1 (96px).
     The element is 96px wide and only ever scaled DOWN or left at 1, which keeps
     the circle edge sharp (scaling a small element up makes it pixelated).
     The big circle contains no text; mix-blend-mode: difference (css §13)
     inverts the picture underneath it.
     ------------------------------------------------------------------------ */
  if (finePointer) {
    var cursor = document.createElement('div');
    cursor.className = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cursor);
    root.classList.add('has-cursor');

    var SCALE_DEFAULT = 24 / 96; // 24px dot
    var SCALE_LINK = 40 / 96;    // 40px dot
    var SCALE_MEDIA = 1;         // 96px circle
    var TAU_POS = reduceMotion ? 1 : 90;    // ms
    var TAU_SCALE = reduceMotion ? 1 : 120; // ms

    var targetX = -100, targetY = -100;   // where the mouse is
    var x = -100, y = -100;               // where the dot is drawn
    var targetScale = SCALE_DEFAULT, scale = SCALE_DEFAULT;
    var lastTime = 0, rafId = null, firstMove = true;

    function frame(now) {
      var dt = Math.min(now - lastTime, 64); // clamp so a tab-switch doesn't teleport the dot
      lastTime = now;

      var kPos = 1 - Math.exp(-dt / TAU_POS);
      var kScale = 1 - Math.exp(-dt / TAU_SCALE);
      x += (targetX - x) * kPos;
      y += (targetY - y) * kPos;
      scale += (targetScale - scale) * kScale;

      // translate3d keeps this on the compositor (no layout / paint).
      // translate(-50%,-50%) centres the dot on the pointer.
      cursor.style.transform =
        'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) translate(-50%,-50%) scale(' + scale.toFixed(3) + ')';

      // Sleep the loop once everything has settled; mousemove wakes it up.
      var settled = Math.abs(targetX - x) < 0.1 && Math.abs(targetY - y) < 0.1 && Math.abs(targetScale - scale) < 0.001;
      rafId = settled ? null : requestAnimationFrame(frame);
    }

    function wake() {
      if (rafId === null) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(frame);
      }
    }

    // Track the pointer. The very first move snaps the dot to the pointer so it doesn't fly in from the corner.
    window.addEventListener('mousemove', function (e) {
      targetX = e.clientX;
      targetY = e.clientY;
      if (firstMove) {
        x = targetX; y = targetY; firstMove = false;
        cursor.classList.add('is-visible');
      }
      wake();
    }, { passive: true });

    // Hover state via event delegation (one listener, works for CMS-added content).
    //   [data-cursor="media"]      → big empty inverted circle (project images)
    //   a, button, [data-cursor="link"] → medium dot
    document.addEventListener('mouseover', function (e) {
      var t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('[data-cursor="media"]')) targetScale = SCALE_MEDIA;
      else if (t.closest('a, button, [data-cursor="link"]')) targetScale = SCALE_LINK;
      else targetScale = SCALE_DEFAULT;
      wake();
    });

    // Hide the dot when the pointer leaves the window, show it again on return.
    document.documentElement.addEventListener('mouseleave', function () { cursor.classList.remove('is-visible'); });
    document.documentElement.addEventListener('mouseenter', function () { if (!firstMove) cursor.classList.add('is-visible'); });
  }

  /* ------------------------------------------------------------------------
     3. STICKY-REVEAL FOOTER
     The footer is position: fixed behind the page (css §12). Two jobs here:
       a) measure its height → --footer-h so .page can reserve exactly that
          much bottom margin (that margin is the scroll distance that uncovers it);
       b) compute --reveal (0 → 1): how much of the footer is uncovered. The CSS
          uses it to fade the footer content in as it is uncovered.

     visible footer px = (scrollY + viewportHeight) - (documentHeight - footerHeight)
     --reveal         = visible / footerHeight, clamped to 0..1
     ------------------------------------------------------------------------ */
  var footer = document.querySelector('.site-footer');
  var footerH = 0;
  var ticking = false;

  function measureFooter() {
    if (!footer) return;
    footerH = footer.offsetHeight;
    root.style.setProperty('--footer-h', footerH + 'px');
    updateScroll();
  }

  function updateScroll() {
    ticking = false;
    var y = window.pageYOffset;

    var p = 0; // how much of the footer is uncovered (0..1)
    if (footer && footerH) {
      var docH = root.scrollHeight;
      var visible = y + window.innerHeight - (docH - footerH);
      p = Math.min(Math.max(visible / footerH, 0), 1);
      footer.style.setProperty('--reveal', p.toFixed(3));
    }

    if (header) {
      var menuOpen = document.body.classList.contains('menu-open');
      header.classList.toggle('is-stuck', y > 8);
      if (desktopMQ.matches) {
        // Desktop: hide on scroll down (after the first 120px), show on scroll up.
        var goingDown = y > lastY;
        header.classList.toggle('is-hidden', goingDown && y > 120 && !menuOpen);
      } else {
        // Phones/tablets: the bar is always visible (solid, fixed), except while the dark footer is
        // being uncovered, where a cream strip across it would look wrong.
        header.classList.toggle('is-hidden', p > 0.02 && !menuOpen);
      }
      lastY = y;
    }
  }

  function onScroll() {
    // Throttle to one update per animation frame.
    if (!ticking) { ticking = true; requestAnimationFrame(updateScroll); }
  }

  /* ------------------------------------------------------------------------
     4. HEADER + MOBILE MENU
     ------------------------------------------------------------------------ */
  var header = document.querySelector('.site-header');
  var desktopMQ = window.matchMedia('(min-width: 992px)'); // matches the CSS breakpoint where the full nav shows
  var lastY = window.pageYOffset;
  var toggle = document.querySelector('.menu-toggle');
  var mobileMenu = document.getElementById('mobile-menu');

  function setMenu(open) {
    if (!toggle || !mobileMenu) return;
    document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    // The button is a text pill: "menu" <-> "close"
    var label = toggle.querySelector('.menu-toggle__label');
    if (label) label.textContent = open ? 'close' : 'menu';
    if (open && header) header.classList.remove('is-hidden');
    // Keep the closed menu out of the tab order.
    if (open) mobileMenu.removeAttribute('inert'); else mobileMenu.setAttribute('inert', '');
  }

  if (toggle && mobileMenu) {
    mobileMenu.setAttribute('inert', '');
    toggle.addEventListener('click', function () {
      setMenu(!document.body.classList.contains('menu-open'));
    });
    mobileMenu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMenu(false);
    });
    window.matchMedia('(min-width: 992px)').addEventListener('change', function (e) {
      if (e.matches) setMenu(false);
    });
  }

  /* ------------------------------------------------------------------------
     EMAIL (anti-spam)
     The address is never written in the HTML. Links with data-email-user and
     data-email-domain get their mailto: href assembled here, so scrapers that
     read the markup find nothing. Without JS the link falls back to a <noscript> note.
     ------------------------------------------------------------------------ */
  document.querySelectorAll('[data-email-user][data-email-domain]').forEach(function (a) {
    a.setAttribute('href', 'mailto:' + a.getAttribute('data-email-user') + '@' + a.getAttribute('data-email-domain'));
  });

  /* ------------------------------------------------------------------------
     5. "LET'S TALK" ANCHORS
     The footer is fixed, so a normal #contact anchor can't scroll to it.
     Links with href="#contact" scroll to the bottom of the page instead.
     ------------------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href="#contact"]');
    if (!link) return;
    e.preventDefault();
    window.scrollTo({ top: root.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  /* ------------------------------------------------------------------------
     INIT
     ------------------------------------------------------------------------ */
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measureFooter);
  if (footer && 'ResizeObserver' in window) new ResizeObserver(measureFooter).observe(footer);
  window.addEventListener('load', measureFooter);
  measureFooter();
})();
