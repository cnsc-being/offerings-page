(async function () {
  const data = await fetch('data.json').then(r => r.json());
  const names = Object.keys(data);

  const track = document.getElementById('name-track');
  const damruBtn = document.getElementById('damru-btn');
  const sound = document.getElementById('damru-sound');
  const phases = {
    damru: document.getElementById('phase-damru'),
    recog: document.getElementById('phase-recognition'),
    journey: document.getElementById('phase-journey'),
    prasadam: document.getElementById('phase-prasadam'),
  };

  // ── Name Wheel ──
  const ITEM_H = 52;
  let pool = [];
  let scrollY = 0;
  const speed = 1.6;
  let running = true;

  function buildTrack() {
    const reps = Math.ceil(36 / names.length) + 2;
    for (let r = 0; r < reps; r++) {
      names.forEach(n => {
        const el = document.createElement('div');
        el.className = 'name-item';
        el.textContent = n;
        el.dataset.name = n;
        track.appendChild(el);
        pool.push(el);
      });
    }
  }
  buildTrack();

  const wheelEl = document.getElementById('name-wheel');
  const centerY = wheelEl.clientHeight / 2;

  function tickWheel() {
    if (!running) return;
    scrollY += speed;
    if (scrollY >= names.length * ITEM_H) scrollY -= names.length * ITEM_H;
    track.style.transform = `translateY(${-scrollY + centerY - ITEM_H / 2}px)`;

    const wCenter = wheelEl.getBoundingClientRect().top + centerY;
    pool.forEach(el => {
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - wCenter);
      el.classList.toggle('center', dist < ITEM_H * 0.5);
      el.classList.toggle('near', dist >= ITEM_H * 0.5 && dist < ITEM_H * 1.8);
    });
    requestAnimationFrame(tickWheel);
  }
  requestAnimationFrame(tickWheel);

  function getCenterName() {
    const wCenter = wheelEl.getBoundingClientRect().top + centerY;
    for (const el of pool) {
      const rect = el.getBoundingClientRect();
      if (Math.abs(rect.top + rect.height / 2 - wCenter) < ITEM_H * 0.5) return el.dataset.name;
    }
    return names[0];
  }

  function showPhase(key) {
    Object.values(phases).forEach(p => p.classList.remove('active'));
    phases[key].classList.add('active');
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ── Bus path helpers ──
  function getSvgScale() {
    const svg = document.getElementById('route-svg');
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return { sx: r.width / vb.width, sy: r.height / vb.height };
  }

  // Get angle at a point on the path
  function getAngleAt(path, len, totalLen) {
    const d = 2;
    const a = path.getPointAtLength(Math.max(len - d, 0));
    const b = path.getPointAtLength(Math.min(len + d, totalLen));
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  // Get curvature (rate of angle change) — used for skew/bend
  function getCurvatureAt(path, len, totalLen) {
    const step = 6;
    const a1 = getAngleAt(path, Math.max(len - step, 0), totalLen);
    const a2 = getAngleAt(path, Math.min(len + step, totalLen), totalLen);
    return (a2 - a1); // radians change over 2*step px
  }

  // Smoothstep for blending
  function smoothstep(a, b, t) {
    const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
  }

  function placeBus(bus, path, fraction, scale, glowT) {
    const totalLen = path.getTotalLength();
    // Stop at 88% of path so bus parks before adiyogi
    const endFrac = 0.88;
    const clampedFrac = fraction * endFrac;
    const len = clampedFrac * totalLen;
    const pt = path.getPointAtLength(len);
    const rawAngle = getAngleAt(path, len, totalLen) * (180 / Math.PI);
    const curvature = getCurvatureAt(path, len, totalLen);

    // Blend: start horizontal (0°), ease into path angle, ease back to 0° at end
    const blendIn = smoothstep(0, 0.15, fraction);   // 0→1 over first 15%
    const blendOut = 1 - smoothstep(0.8, 1, fraction); // 1→0 over last 20%
    const blend = blendIn * blendOut;
    const angle = rawAngle * blend;

    const skewRaw = curvature * (180 / Math.PI) * 3;
    const skew = Math.max(-18, Math.min(18, skewRaw)) * blend;

    const x = pt.x * scale.sx - 35;
    const y = pt.y * scale.sy - 21;

    bus.style.left = x + 'px';
    bus.style.top = y + 'px';
    bus.style.transform = `rotate(${angle}deg) skewY(${skew}deg)`;

    if (glowT !== undefined) {
      bus.style.filter = `drop-shadow(0 0 ${10 + glowT * 16}px rgba(255,215,0,${0.4 + glowT * 0.3}))`;
    }
  }

  function animateBus(durationMs) {
    return new Promise(resolve => {
      const path = document.getElementById('route-path');
      const bus = document.getElementById('bus');
      const scale = getSvgScale();
      const start = performance.now();

      function tick(now) {
        const t = Math.min((now - start) / durationMs, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        placeBus(bus, path, ease, scale, t);

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }

  // ── Damru tap ──
  let tapped = false;
  damruBtn.addEventListener('click', async () => {
    if (tapped) return;
    tapped = true;
    running = false;

    const selected = getCenterName();
    const link = data[selected] || '#';

    sound.currentTime = 0;
    sound.play().catch(() => {});

    damruBtn.classList.add('shake');
    await wait(500);
    damruBtn.classList.remove('shake');
    damruBtn.classList.add('glow');
    await wait(800);

    // Phase 2: Recognition
    document.getElementById('recog-greeting').textContent = `Namaskaram, ${selected}.`;
    showPhase('recog');
    await wait(4300);

    // Phase 3: Journey
    // BEFORE showing the phase, position bus at path start so it never flashes at 0,0
    const bus = document.getElementById('bus');
    const path = document.getElementById('route-path');

    // Temporarily make journey phase visible but fully transparent to get layout
    phases.journey.style.opacity = '0';
    phases.journey.style.pointerEvents = 'none';
    phases.journey.style.display = 'flex';
    phases.journey.classList.add('active');

    // Force layout recalc
    void phases.journey.offsetHeight;

    const scale = getSvgScale();
    placeBus(bus, path, 0, scale);

    // Now do the real phase transition — bus is already in position
    Object.values(phases).forEach(p => p.classList.remove('active'));
    phases.journey.style.opacity = '';
    phases.journey.style.pointerEvents = '';
    phases.journey.style.display = '';

    // Small delay then show phase (bus is at start, still opacity 0)
    await wait(50);
    showPhase('journey');

    // Wait for phase fade-in (0.8s) then reveal bus
    await wait(900);
    bus.style.opacity = '1';
    bus.style.transition = 'opacity 0.4s ease';
    await wait(500);

    // Passengers fill in
    bus.classList.add('filling', 'passengers-in');
    await wait(1400);

    // Bus moves along path with rotation + bend
    bus.classList.remove('filling');
    bus.style.transition = '';
    await animateBus(5000);

    // Adiyogi glows on arrival
    document.getElementById('adiyogi').classList.add('glow');
    await wait(1800);

    // Phase 4: Prasadam
    document.getElementById('prasadam-btn').href = link;
    showPhase('prasadam');
  });
})();
