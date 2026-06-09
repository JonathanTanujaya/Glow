if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

let streamInstance = null;
let hasScanned = false;

async function startCamera() {
  const video = document.getElementById('webcam');
  const icon = document.querySelector('.scan-icon');
  if (!video) return;

  // Stream already exists — just re-attach and resume (no permission re-prompt)
  if (streamInstance) {
    if (video.srcObject !== streamInstance) {
      video.srcObject = streamInstance;
    }
    video.play().catch(() => {});
    video.classList.add('active');
    if (icon) icon.style.opacity = '0';
    return;
  }

  try {
    const constraints = {
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    streamInstance = stream;
    video.srcObject = stream;
    video.classList.add('active');
    if (icon) icon.style.opacity = '0';
  } catch (err) {
    console.warn("Camera access failed or denied: ", err);
    if (icon) icon.style.opacity = '0.4';
    video.classList.remove('active');
  }
}

function stopCamera() {
  // Only pause + hide — keep stream alive so permission isn't re-requested
  const video = document.getElementById('webcam');
  const icon = document.querySelector('.scan-icon');
  if (video) {
    video.pause();
    video.classList.remove('active');
  }
  if (icon) icon.style.opacity = '0.4';
  // streamInstance is intentionally kept alive
}

function triggerScan() {
  const btn = document.querySelector('#screen-scan .btn-primary');
  const scanLine = document.querySelector('.scan-line');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader rotate-anim"></i> Scanning...';

  const scanTitle = document.querySelector('.scan-title');
  const scanSub = document.querySelector('.scan-sub');
  const hint = document.querySelector('.scan-hint');
  if (scanTitle) scanTitle.textContent = 'Analyzing Skin...';
  if (scanSub) scanSub.textContent = 'Please hold still';
  if (scanLine) scanLine.style.animationDuration = '0.8s';

  const overlay = document.getElementById('scan-loading-overlay');
  const progressFill = overlay.querySelector('.progress-fill');
  const pctText = document.getElementById('scan-progress-pct');
  const titleText = document.getElementById('scan-overlay-title');
  const stepText = document.getElementById('scan-overlay-step');

  overlay.classList.add('active');

  const circumference = 2 * Math.PI * 52;
  const steps = [
    { pct: 12, title: 'Analyzing your skin...', step: 'Detecting skin type' },
    { pct: 28, title: 'Analyzing your skin...', step: 'Analyzing sebum levels' },
    { pct: 45, title: 'Analyzing your skin...', step: 'Measuring hydration' },
    { pct: 62, title: 'Processing data...', step: 'Mapping pore density' },
    { pct: 78, title: 'Processing data...', step: 'Assessing sensitivity' },
    { pct: 92, title: 'Almost done...', step: 'Calculating skin score' },
    { pct: 100, title: 'Analysis complete!', step: 'Your results are ready' }
  ];

  let stepIdx = 0;
  const interval = setInterval(() => {
    if (stepIdx >= steps.length) {
      clearInterval(interval);
      setTimeout(() => {
        overlay.classList.remove('active');
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-scan"></i> Start AI Scan';
        if (scanTitle) scanTitle.textContent = 'AI Skin Scanner';
        if (scanSub) scanSub.textContent = 'Position your face within the frame';
        if (hint) hint.textContent = 'Keep still \u00b7 good lighting \u00b7 face forward';
        if (scanLine) scanLine.style.animationDuration = '2s';

        // Reset overlay for next scan
        setTimeout(() => {
          progressFill.style.strokeDashoffset = circumference;
          pctText.textContent = '0%';
          titleText.textContent = 'Analyzing your skin...';
          stepText.textContent = 'Initializing AI scanner';
        }, 400);

        hasScanned = true;
        updateResultsVisibility();
        navigate('results');
      }, 800);
      return;
    }
    const s = steps[stepIdx];
    const offset = circumference - (s.pct / 100) * circumference;
    progressFill.style.strokeDashoffset = offset;
    pctText.textContent = s.pct + '%';
    titleText.textContent = s.title;
    stepText.textContent = s.step;
    stepIdx++;
  }, 450);
}

let isResizing = false;
let startX, startY, startWidth, startHeight;
let activeCorner = null;

function updateScannerSize(val) {
  const corners = document.querySelector('.scan-corners');
  if (corners) {
    corners.style.width = val + 'px';
    corners.style.height = Math.round(val * 1.2) + 'px';
  }
  try {
    localStorage.setItem('scannerSize', val);
  } catch (e) {
    console.warn("localStorage access denied:", e);
  }
}

function startResize(e) {
  e.preventDefault();
  e.stopPropagation();
  
  isResizing = true;
  activeCorner = e.currentTarget;
  
  startX = e.clientX;
  startY = e.clientY;
  
  const container = document.querySelector('.scan-corners');
  if (container) {
    startWidth = container.offsetWidth;
    startHeight = container.offsetHeight;
    container.style.transition = 'none'; // disable animation during drag
  }
  
  activeCorner.setPointerCapture(e.pointerId);
  
  activeCorner.addEventListener('pointermove', resizeMove);
  activeCorner.addEventListener('pointerup', endResize);
  activeCorner.addEventListener('pointercancel', endResize);
  
  // Visual feedback: glow effect on the oval frame when adjusting
  const oval = document.querySelector('.scan-oval');
  if (oval) {
    oval.style.borderColor = 'var(--teal)';
    oval.style.boxShadow = '0 0 16px var(--teal), 0 0 0 9999px rgba(0, 0, 0, 0.55)';
  }
}

function resizeMove(e) {
  if (!isResizing || !activeCorner) return;
  
  const deltaX = e.clientX - startX;
  let newWidth = startWidth;
  
  // Symmetrical scaling from center
  if (activeCorner.classList.contains('sc-br') || activeCorner.classList.contains('sc-tr')) {
    newWidth = startWidth + deltaX * 2;
  } else {
    newWidth = startWidth - deltaX * 2;
  }
  
  const minWidth = 160;
  const maxWidth = 300;
  newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
  
  updateScannerSize(newWidth);
}

function endResize(e) {
  if (!isResizing) return;
  isResizing = false;
  
  if (activeCorner) {
    activeCorner.releasePointerCapture(e.pointerId);
    activeCorner.removeEventListener('pointermove', resizeMove);
    activeCorner.removeEventListener('pointerup', endResize);
    activeCorner.removeEventListener('pointercancel', endResize);
  }
  
  activeCorner = null;
  
  // Restore transition and default colors
  const container = document.querySelector('.scan-corners');
  if (container) {
    container.style.transition = 'width 0.15s cubic-bezier(0.4, 0, 0.2, 1), height 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
  }
  
  const oval = document.querySelector('.scan-oval');
  if (oval) {
    oval.style.borderColor = 'var(--green)';
    oval.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.55)';
  }
}

function initScannerSize() {
  let savedSize = '240';
  try {
    savedSize = localStorage.getItem('scannerSize') || '240';
  } catch (e) {
    console.warn("localStorage access denied:", e);
  }
  updateScannerSize(savedSize);
  
  // Attach pointer events to corner handles
  const corners = document.querySelectorAll('.scan-corner');
  corners.forEach(corner => {
    corner.addEventListener('pointerdown', startResize);
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initScannerSize);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  initScannerSize();
}

setTimeout(() => {
  document.getElementById('splash').classList.add('hide');
  setTimeout(() => {
    document.getElementById('splash').remove();
    startCamera();
    updateGreeting();
    updateResultsVisibility();
  }, 600);
}, 1500);

function updateTime() {
  const now = new Date();
  const t = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  document.querySelectorAll('.status-time').forEach(el => el.textContent = t);
}
updateTime();
setInterval(updateTime, 10000);

const screens = ['scan','results','formula','order','profile'];
const navMap = { scan: 'nav-scan', results: 'nav-results', formula: null, order: 'nav-order', profile: 'nav-profile' };

function navigate(to) {
  screens.forEach(s => {
    document.getElementById('screen-' + s).classList.toggle('active', s === to);
  });
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (navMap[to]) {
    const navEl = document.getElementById(navMap[to]);
    if (navEl) navEl.classList.add('active');
  }

  if (to === 'scan') {
    startCamera();
  } else {
    stopCamera();
  }

  // Animate results entry
  if (to === 'results' && hasScanned) {
    setTimeout(animateResultsEntry, 400);
  }

  // Keep desktop panel in sync
  updateDesktopPanel(to);
}

function switchRecTab(tab) {
  document.querySelectorAll('.rec-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.rec-products-container').forEach(el => el.classList.remove('active'));
  
  if (tab === 'morning') {
    document.getElementById('tab-morning').classList.add('active');
    document.getElementById('rec-morning').classList.add('active');
  } else if (tab === 'night') {
    document.getElementById('tab-night').classList.add('active');
    document.getElementById('rec-night').classList.add('active');
  }
}

const productData = {
  sc01: {
    name: 'Gentle Gel Cleanser',
    brand: 'pH Balancing',
    step: 'Cleanse',
    icon: 'ti-droplet',
    use: 'Apply a small amount to damp face. Massage gently in circular motions, then rinse thoroughly with lukewarm water.',
    benefit: 'Gently cleanses excess sebum and unclogs pores without stripping your skin\'s natural moisture barrier, perfect for oily T-zones.'
  },
  sc02: {
    name: 'Hydrating Essence Toner',
    brand: 'Deep Moisture',
    step: 'Hydrate',
    icon: 'ti-droplet',
    use: 'Pour 3-4 drops onto your palms and gently press onto clean face and neck until fully absorbed.',
    benefit: 'Deeply hydrates and balances the skin pH, reducing dryness in dehydrated areas and preparing the skin for serum absorption.'
  },
  sc03: {
    name: '10% Niacinamide Serum',
    brand: 'Brightening Boost',
    step: 'Treat',
    icon: 'ti-flask',
    use: 'Apply 2-3 drops to entire face after toning. Focus on oily areas or spots. Use daily.',
    benefit: 'Effectively controls sebum production, minimizes pore appearance, and fades post-acne dark spots for an even skin tone.'
  },
  sc04: {
    name: 'Centella Soothing Moisturizer',
    brand: 'Calm & Repair',
    step: 'Moisturize',
    icon: 'ti-sparkles',
    use: 'Apply an even layer over the face and neck as the last step in your routine (before sunscreen).',
    benefit: 'Soothes redness, calms active sensitivity, and strengthens the skin barrier with a weightless, non-greasy finish.'
  },
  sc05: {
    name: 'SPF 50+ UV Defense Sunscreen',
    brand: 'Matte Finish',
    step: 'Protect',
    icon: 'ti-sun',
    use: 'Apply generously (two-finger rule) onto face and neck 15 minutes before sun exposure. Reapply every 2 hours.',
    benefit: 'High UV protection with a matte, lightweight finish. Controls shine and prevents UV-induced skin damage.'
  },
  sc06: {
    name: 'Purifying Cleansing Oil',
    brand: 'Melt Makeup & Sebum',
    step: 'Double Cleanse',
    icon: 'ti-leaf',
    use: 'Massage onto dry skin to dissolve sunscreen and makeup. Add water to emulsify, then rinse off completely.',
    benefit: 'The first step of double cleansing. Efficiently melts oil-based impurities and unclogs stubborn pores without drying.'
  },
  sc07: {
    name: '2% BHA Pore Clarifying Liquid',
    brand: 'Pore Clarifying',
    step: 'Exfoliate',
    icon: 'ti-flask',
    use: 'Apply with a cotton pad or fingers over face after cleansing. Use 2-3 times a week at night.',
    benefit: 'Exfoliates deep inside the pore lining. Targets blackheads, whiteheads, and prevents future breakouts.'
  },
  sc08: {
    name: '0.5% Bakuchiol Renewal Serum',
    brand: 'Gentle Renewal',
    step: 'Target Repair',
    icon: 'ti-activity',
    use: 'Apply 2-3 drops to face and neck after toning/exfoliating. Gently tap until absorbed.',
    benefit: 'A plant-derived, gentle alternative to retinol. Boosts skin cell turnover and refines skin texture without irritation.'
  },
  sc09: {
    name: 'Peptide Revitalizing Eye Cream',
    brand: 'Firming Care',
    step: 'Eye Care',
    icon: 'ti-sparkles',
    use: 'Dab a tiny amount around the orbital bone and gently tap with your ring finger.',
    benefit: 'Plumps fine lines, reduces under-eye puffiness, and strengthens the delicate skin barrier around the eyes.'
  },
  sc10: {
    name: 'Ceramide Night Barrier Cream',
    brand: 'Overnight Recovery',
    step: 'Nourish',
    icon: 'ti-moon',
    use: 'Smooth a generous amount over face and neck as the final step of your nighttime routine.',
    benefit: 'Rich in essential ceramides to repair and fortify the skin barrier overnight, locking in moisture for a plump morning glow.'
  }
};

function showProductDetails(id) {
  const data = productData[id];
  if (!data) return;
  
  const modal = document.getElementById('product-modal');
  const imgEl = document.getElementById('modal-product-img');
  const iconEl = document.getElementById('modal-product-icon');
  
  // Set text contents
  document.getElementById('modal-product-step').textContent = data.step;
  document.getElementById('modal-product-name').textContent = data.name;
  document.getElementById('modal-product-brand').textContent = data.brand;
  document.getElementById('modal-product-use').textContent = data.use;
  document.getElementById('modal-product-benefit').textContent = data.benefit;
  
  // Set image & icon class
  imgEl.src = id + '.png';
  imgEl.alt = data.name;
  imgEl.className = ''; // remove loaded class
  
  // Try loading image
  const tempImg = new Image();
  tempImg.src = id + '.png';
  tempImg.onload = () => {
    imgEl.classList.add('loaded');
  };
  tempImg.onerror = () => {
    imgEl.classList.remove('loaded');
  };
  
  // Set placeholder icon class
  iconEl.className = 'ti ' + data.icon + ' modal-placeholder-icon';
  
  modal.classList.add('active');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
}

/* ────────────────────────────
   DESKTOP PANEL ENGINE
──────────────────────────── */
const panelContent = {
  scan: {
    badge: 'AI Scanner',
    badgeIcon: 'ti-scan',
    title: 'AI-Powered Skin Scanner',
    desc: 'Let our AI analyze your skin in real-time. Position your face in the frame and get a complete skin health report in under 5 seconds.',
    benefits: [
      'Real-time facial scan using your front camera',
      'Detects oiliness, hydration, pores & fine lines',
      'Adjustable scan frame for a precise capture'
    ],
    ctaLabel: 'Start Scanning',
    ctaAction: "navigate('scan')"
  },
  results: {
    badge: 'Skin Report',
    badgeIcon: 'ti-chart-donut-3',
    title: 'Your Personalized Skin Report',
    desc: 'Get a comprehensive skin health score with detailed condition breakdowns. Understand exactly what your skin needs.',
    benefits: [
      'Overall skin score from 0 to 100',
      'Detailed breakdown of 5 key conditions',
      'Personalized morning & night routine recommendations'
    ],
    ctaLabel: 'View Full Results',
    ctaAction: "navigate('results')"
  },
  formula: {
    badge: 'Your Formula',
    badgeIcon: 'ti-flask',
    title: 'Custom-Blended Skincare Formula',
    desc: 'Every formula is blended specifically for your skin profile — active ingredients in precise concentrations, nothing more.',
    benefits: [
      '100% plant-based, derm-tested ingredients',
      'Concentrations matched to your scan results',
      'Refillable glass bottle — zero waste'
    ],
    ctaLabel: 'See Your Formula',
    ctaAction: "navigate('formula')"
  },
  order: {
    badge: 'Order & Subscribe',
    badgeIcon: 'ti-shopping-bag',
    title: 'Get Your Formula Delivered',
    desc: 'Choose a one-time purchase or subscribe and save 15% every month. Your formula re-adapts with each new scan.',
    benefits: [
      'Subscribe & save 15% automatically',
      'Auto-refill every 30 days — never run out',
      'Free carbon-neutral shipping'
    ],
    ctaLabel: 'Order Now',
    ctaAction: "navigate('order')"
  },
  profile: {
    badge: 'Your Profile',
    badgeIcon: 'ti-user-circle',
    title: 'Track Your Skin Journey',
    desc: 'Watch your skin score improve over time. Your full history, formula records, and loyalty rewards — all in one place.',
    benefits: [
      'Weekly skin score history chart',
      'Formula history & subscription management',
      'Loyalty rewards & eco impact tracker'
    ],
    ctaLabel: 'View Profile',
    ctaAction: "navigate('profile')"
  }
};

function updateDesktopPanel(screen) {
  const content = panelContent[screen];
  if (!content) return;

  const panel = document.getElementById('desktop-panel');
  if (!panel) return;

  // Fade out
  panel.classList.add('dp-transitioning');

  setTimeout(() => {
    document.getElementById('dp-badge-text').textContent = content.badge;
    document.querySelector('#dp-badge i').className = 'ti ' + content.badgeIcon;
    document.getElementById('dp-title').textContent = content.title;
    document.getElementById('dp-desc').textContent = content.desc;

    const ul = document.getElementById('dp-benefits');
    ul.innerHTML = content.benefits
      .map(b => `<li><i class="ti ti-check"></i> ${b}</li>`)
      .join('');

    const ctaBtn = panel.querySelector('.dp-cta-btn');
    ctaBtn.innerHTML = `<i class="ti ${content.badgeIcon}"></i> ${content.ctaLabel}`;
    ctaBtn.setAttribute('onclick', content.ctaAction);

    // Update nav buttons
    document.querySelectorAll('.dp-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === screen);
    });

    panel.classList.remove('dp-transitioning');
  }, 200);
}

// Called from desktop panel nav buttons
function dpNav(screen) {
  navigate(screen);
  updateDesktopPanel(screen);
}

/* ────────────────────────────
   GREETING
──────────────────────────── */
function updateGreeting() {
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 17) greeting = 'Good evening';
  const el = document.getElementById('scan-greeting');
  if (el) el.textContent = greeting + ', Dania ✨';
}

/* ────────────────────────────
   EMPTY STATE MANAGEMENT
──────────────────────────── */
function updateResultsVisibility() {
  const screen = document.getElementById('screen-results');
  if (screen) screen.classList.toggle('has-results', hasScanned);
}

/* ────────────────────────────
   RESULTS ENTRY ANIMATION
──────────────────────────── */
function animateResultsEntry() {
  // Stagger insight cards
  const cards = document.querySelectorAll('.insight-card');
  cards.forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px) scale(0.96)';
    setTimeout(() => {
      card.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0) scale(1)';
    }, 80 + i * 100);
  });

  // Animate bar fills
  const bars = document.querySelectorAll('#screen-results .bar-fill');
  bars.forEach((bar, i) => {
    const target = bar.getAttribute('data-width') || bar.style.width;
    if (!bar.getAttribute('data-width')) {
      bar.setAttribute('data-width', bar.style.width);
    }
    bar.style.transition = 'none';
    bar.style.width = '0%';
    setTimeout(() => {
      bar.style.transition = 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
      bar.style.width = target;
    }, 300 + i * 120);
  });

  // Animate score ring
  const ring = document.querySelector('#screen-results .score-ring');
  if (ring) {
    ring.style.animation = 'none';
    ring.offsetHeight; // force reflow
    ring.style.animation = 'ringPop 0.6s 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both';
  }
}

/* ────────────────────────────
   RIPPLE EFFECT
──────────────────────────── */
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.btn-primary');
  if (!btn) return;
  const ripple = document.createElement('span');
  ripple.classList.add('ripple');
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
});