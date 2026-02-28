let SESSION_EMAIL = '';

fetch('/api/assets').then(r => r.json()).then(d => {
  if (d.logo) {
    const img = document.getElementById('hdr-logo');
    img.src = d.logo; img.style.display = 'block';
  }
}).catch(() => {});

// Write contact emails via JS so Cloudflare cannot mangle them
(function() {
  const em = ['Mary','nationalcdatraining.com'].join('@');
  const e1 = document.getElementById('contact-email-1');
  const e2 = document.getElementById('contact-email-2');
  if (e1) e1.innerHTML = '<a href="mailto:'+em+'" style="color:#1a2744;font-weight:600;text-decoration:none;">'+em+'</a>';
  if (e2) e2.innerHTML = '<a href="mailto:'+em+'" style="color:var(--gray);text-decoration:none;">'+em+'</a>';
})();

window.addEventListener('load', () => {
  const params = new URLSearchParams(location.search);
  const token  = params.get('token');
  if (token) verifyToken(token);
  ['inp-name','inp-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') requestLink(); });
  });
});

async function requestLink() {
  const name  = document.getElementById('inp-name').value.trim();
  const email = document.getElementById('inp-email').value.trim();
  if (!name || !email) {
    showAlert('login-alert', 'err', 'Please enter both your name and email address.');
    return;
  }
  if (!email.includes('@')) {
    showAlert('login-alert', 'err', 'Please enter a valid email address.');
    return;
  }
  setLoginLoading(true);
  showAlert('login-alert', 'info', '&#9203; Sending your access link&hellip;');
  try {
    const res = await fetch('/api/auth/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Server error. Please try again.');
    }
    showAlert('login-alert', 'ok',
      '&#10003; If your email is in our system, a secure link is on its way to <strong>' +
      escHtml(email) + '</strong>. Please check your inbox and spam folder. The link expires in 24 hours.');
    document.getElementById('login-btn').disabled = true;
  } catch (e) {
    showAlert('login-alert', 'err', '&#9888; ' + e.message);
  } finally {
    setLoginLoading(false);
  }
}

async function verifyToken(token) {
  document.getElementById('login-view').style.display = 'block';
  showAlert('login-alert', 'info', '&#9203; Verifying your link, please wait&hellip;');
  try {
    const res  = await fetch('/api/auth/verify/' + encodeURIComponent(token));
    const data = await res.json();
    if (!res.ok) {
      showAlert('login-alert', 'err',
        '&#9888; ' + (data.error || 'This link has expired or already been used.') +
        ' Please enter your details below to request a new one.');
      return;
    }
    history.replaceState({}, '', '/portal');
    SESSION_EMAIL = data.email;
    renderPortal(data);
  } catch (e) {
    showAlert('login-alert', 'err', '&#9888; Verification failed. Please request a new link below.');
  }
}

function renderPortal(data) {
  document.getElementById('login-view').style.display  = 'none';
  document.getElementById('portal-view').style.display = 'block';
  document.querySelector('#portal-email-line strong').textContent = data.email;

  const list = document.getElementById('records-list');
  list.innerHTML = '';

  if (!data.students || !data.students.length) {
    list.innerHTML = '<div class="card"><p class="no-packages">No training records found for this email.</p></div>';
    return;
  }

  data.students.forEach(student => {
    const block = document.createElement('div');
    block.className = 'record-block';

    const initial    = student.name.charAt(0).toUpperCase();
    const pathLabel  = student.path_label || (student.path === 'pre' ? 'Preschool CDA Training' : 'Infant & Toddler CDA Training');
    const badgeCls   = student.path === 'inf' ? 'inf' : '';
    const certCount  = (student.certificates || []).length;
    const totalHours = certCount * 3;

    let pkgsHTML = '';
    if (!student.packages || !student.packages.length) {
      pkgsHTML = '<p class="no-packages">No downloadable packages on file yet. Please contact your instructor.</p>';
    } else {
      pkgsHTML = '<ul class="pkg-list">' +
        student.packages.map(pkg => {
          const date  = new Date(pkg.generated_at).toLocaleDateString('en-US',
            { month:'short', day:'numeric', year:'numeric' });
          const dlUrl = '/api/portal/pdf/' + pkg.id + '?email=' + encodeURIComponent(SESSION_EMAIL);
          const label = pkg.filename
            ? pkg.filename.replace(/_/g,' ').replace('.pdf','')
            : 'CDA Training Package';
          return '<li class="pkg-item">' +
            '<span class="pkg-icon">&#128196;</span>' +
            '<div class="pkg-info">' +
              '<strong>' + escHtml(label) + '</strong>' +
              '<span>Generated ' + escHtml(date) + '</span>' +
            '</div>' +
            '<a class="download-btn" href="' + dlUrl + '" download="' + escAttr(pkg.filename || 'package.pdf') + '">&#11015; Download PDF</a>' +
          '</li>';
        }).join('') +
      '</ul>';
    }

    block.innerHTML =
      '<div class="record-head">' +
        '<div class="record-avatar">' + initial + '</div>' +
        '<div class="record-info">' +
          '<h3>' + escHtml(student.name) + '</h3>' +
          '<p>' + escHtml(pathLabel) + ' &nbsp;&middot;&nbsp; ' + certCount + ' courses &nbsp;&middot;&nbsp; ' + totalHours + ' hours</p>' +
        '</div>' +
        '<span class="pkg-badge ' + badgeCls + '" style="margin-left:auto">' +
          (student.path === 'pre' ? 'Preschool' : 'Infant &amp; Toddler') +
        '</span>' +
      '</div>' +
      '<div class="record-body">' +
        '<p style="font-size:.82rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--gray);margin-bottom:12px;">Certificate Packages</p>' +
        pkgsHTML +
      '</div>';

    list.appendChild(block);
  });
}

function setLoginLoading(on) {
  const btn  = document.getElementById('login-btn');
  const text = document.getElementById('login-btn-text');
  btn.disabled   = on;
  text.innerHTML = on ? '<span class="spin"></span> Sending&hellip;' : 'Send My Access Link';
}

function showAlert(id, type, msg) {
  const el  = document.getElementById(id);
  const cls = { ok:'alert-ok', err:'alert-err', info:'alert-info' }[type] || 'alert-info';
  el.className     = 'alert ' + cls;
  el.innerHTML     = msg;
  el.style.display = 'block';
}
function hideAlert(id) {
  document.getElementById(id).style.display = 'none';
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }
