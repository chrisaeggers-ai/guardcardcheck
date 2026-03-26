(function() {
  var HINTS = {
    CA: { label: 'License Number', ph: '1441140 or G1234567 or FE12345' },
    FL: { label: 'License Number', ph: 'D1234567 or G7654321' },
    TX: { label: 'License Number', ph: '1234567' },
    IL: { label: 'PERC Card Number', ph: '129-012345' },
    VA: { label: 'Registration Number', ph: '123456' },
    NV: { label: 'Work Card Number', ph: 'WC123456' },
    OR: { label: 'Certificate Number', ph: '12345' },
    WA: { label: 'License Number', ph: 'SG123456789' },
    AZ: { label: 'License Number', ph: '123456789' },
    NC: { label: 'Registration Number', ph: '12345678' },
  };

  var stSel = document.getElementById('state-select');
  var licIn = document.getElementById('license-input');
  var licLbl = document.getElementById('license-label');
  var vBtn = document.getElementById('verify-btn');
  var area = document.getElementById('result-area');

  function updPh() {
    var h = HINTS[stSel.value];
    if (h) { licIn.placeholder = h.ph; licLbl.textContent = h.label; }
  }
  stSel.addEventListener('change', updPh);
  licIn.addEventListener('input', updPh);

  // Tabs
  function switchTab(t) {
    document.querySelectorAll('.search-tab').forEach(function(b, i) {
      b.classList.toggle('active', ['license','name','batch'][i] === t);
    });
    document.querySelectorAll('.search-form').forEach(function(f, i) {
      f.classList.toggle('active', ['form-license','form-name','form-batch'][i] === 'form-' + t);
    });
  }
  document.querySelectorAll('.search-tab').forEach(function(b) {
    b.addEventListener('click', function() {
      var t = ['license','name','batch'][Array.from(b.parentNode.children).indexOf(b)];
      switchTab(t);
    });
  });

  // State chips + state rows
  function selectState(code) {
    stSel.value = code; updPh();
    var ns = document.getElementById('name-state-select');
    if (ns) ns.value = code;
    licIn.focus(); switchTab('license');
    document.querySelector('.hero').scrollIntoView({ behavior: 'smooth' });
  }
  document.querySelectorAll('.state-chip, .state-row').forEach(function(el) {
    el.addEventListener('click', function() {
      var a = el.querySelector('.state-abbr');
      var code = a ? a.textContent.trim() : el.textContent.match(/^([A-Z]{2})/)?.[1];
      if (code) selectState(code);
    });
  });

  // License form
  document.getElementById('form-license').addEventListener('submit', function(e) {
    e.preventDefault();
    var sc = stSel.value, ln = licIn.value.trim();
    if (!sc || !ln) return;
    doVerify(sc, ln);
  });

  // Name form
  var nBtn = document.querySelector('#form-name .btn-verify');
  document.getElementById('form-name').addEventListener('submit', function(e) {
    e.preventDefault();
    var sc = document.getElementById('name-state-select').value;
    var fn = document.getElementById('first-name').value.trim();
    var ln = document.getElementById('last-name').value.trim();
    if (!sc || !fn || !ln) return;
    doNameSearch(sc, fn, ln);
  });

  // ── License verify ──
  async function doVerify(sc, ln) {
    vBtn.classList.add('loading');
    vBtn.querySelector('.btn-text').textContent = 'Verifying...';
    showLoading(sc, ln);
    try {
      var r = await fetch('/api/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stateCode: sc, licenseNumber: ln }),
      });
      renderResult(await r.json());
    } catch (e) {
      renderError('Network error \u2014 could not reach the server.');
    } finally {
      vBtn.classList.remove('loading');
      vBtn.querySelector('.btn-text').textContent = '\uD83D\uDD0D Verify License';
    }
  }

  // ── Name search ──
  async function doNameSearch(sc, fn, ln) {
    if (nBtn) { nBtn.classList.add('loading'); nBtn.querySelector('.btn-text').textContent = 'Searching...'; }
    var SN = {CA:'California',FL:'Florida',TX:'Texas',IL:'Illinois',VA:'Virginia',NV:'Nevada',OR:'Oregon',WA:'Washington',AZ:'Arizona',NC:'North Carolina'};
    area.innerHTML = '<div class="loading-card" style="margin-bottom:32px"><div class="loading-spinner"></div><div class="loading-state-name">Searching ' + (SN[sc]||sc) + ' for ' + esc(fn) + ' ' + esc(ln) + '</div></div>';
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      var r = await fetch('/api/search-public', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stateCode: sc, firstName: fn, lastName: ln }),
      });
      var d = await r.json();
      if (d.error) { renderError(d.error); return; }
      renderNameResults(d.results || [], fn, ln, sc);
    } catch (e) {
      renderError('Network error \u2014 could not reach the server.');
    } finally {
      if (nBtn) { nBtn.classList.remove('loading'); nBtn.querySelector('.btn-text').textContent = '\uD83D\uDD0D Search'; }
    }
  }

  function showLoading(sc, ln) {
    var SN = {CA:'California',FL:'Florida',TX:'Texas',IL:'Illinois',VA:'Virginia',NV:'Nevada',OR:'Oregon',WA:'Washington',AZ:'Arizona',NC:'North Carolina'};
    area.innerHTML = '<div class="loading-card" style="margin-bottom:32px"><div class="loading-spinner"></div><div class="loading-state-name">Querying ' + (SN[sc]||sc) + '</div><div class="loading-sub">' + esc(ln) + '</div></div>';
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderResult(d) {
    if (d && d.error && !d.status) { renderError(d.error); return; }
    if (d && d.status === 'VERIFICATION_ERROR') { renderError(d.error || 'Verification failed.'); return; }
    if (!d || d.status === 'NOT_FOUND' || d.status === 'STATE_NOT_SUPPORTED') { renderNotFound(d); return; }

    var s = d.status || 'UNKNOWN';
    var ic = {ACTIVE:'\u2713',EXPIRED:'\u2717',REVOKED:'\u2298',SUSPENDED:'\u26A0',UNKNOWN:'?'};
    var cc = {ACTIVE:'green',EXPIRED:'red',REVOKED:'red',SUSPENDED:'amber',UNKNOWN:'gray'};
    var ei = expiryInfo(d.expirationDate);

    area.innerHTML =
      '<div class="result-section"><div class="result-card">' +
      '<div class="result-header"><div class="result-title"><div class="result-icon ' + (cc[s]||'gray') + '">' + (ic[s]||'?') + '</div><div><div class="result-name">' + esc(d.holderName||'Name Not Available') + '</div><div class="result-license">' + esc(d.stateCode) + ' \u00b7 ' + esc(d.licenseNumber||'') + ' \u00b7 ' + esc(d.licenseType||'') + '</div></div></div><div><span class="status-badge ' + s + '">' + s + '</span>' + (d.isArmed ? '<span class="armed-badge" style="margin-left:8px">Armed</span>' : '') + '</div></div>' +
      '<div class="result-body"><div class="result-grid">' +
        fld('License Type', esc(d.licenseType||'\u2014')) +
        fld('State \u00b7 Agency', '<span class="state-tag">' + esc(d.stateCode) + '</span>' + (d.agencyName ? ' ' + esc(d.agencyName) : '')) +
        fld('Issue Date', d.issueDate ? fmtD(d.issueDate) : '\u2014') +
        fld('Expiration', d.expirationDate ? fmtD(d.expirationDate) : '\u2014', ei.cls) +
        fld('Verified', fmtDT(d.verifiedAt), '', 'font-size:13px') +
      '</div>' +
      (d.expirationDate ? '<div class="expiry-bar-wrapper"><div class="expiry-bar-label"><span>License Validity</span><span>' + ei.label + '</span></div><div class="expiry-bar"><div class="expiry-bar-fill ' + ei.bar + '" style="width:' + ei.pct + '%"></div></div></div>' : '') +
      alert(d) +
      '</div></div></div>';
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderNameResults(results, fn, ln, sc) {
    if (!results.length) {
      area.innerHTML = '<div class="not-found-card" style="margin-bottom:32px"><div class="not-found-icon">&#128269;</div><div class="not-found-title">No Results Found</div><div class="not-found-sub">No records matched <strong>' + esc(fn) + ' ' + esc(ln) + '</strong> in ' + esc(sc) + '.</div></div>';
      area.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    var ic = {ACTIVE:'\u2713',EXPIRED:'\u2717',REVOKED:'\u2298',SUSPENDED:'\u26A0',UNKNOWN:'?'};
    var cc = {ACTIVE:'green',EXPIRED:'red',REVOKED:'red',SUSPENDED:'amber',UNKNOWN:'gray'};
    var h = '<div style="font-size:14px;font-weight:600;color:var(--gray-600);margin-bottom:12px">Found ' + results.length + ' result' + (results.length>1?'s':'') + '</div>';
    results.forEach(function(r) {
      var s = r.status || 'UNKNOWN';
      h += '<div class="result-card" style="margin-bottom:14px"><div class="result-header"><div class="result-title"><div class="result-icon ' + (cc[s]||'gray') + '">' + (ic[s]||'?') + '</div><div><div class="result-name">' + esc(r.holderName||'Unknown') + '</div><div class="result-license">' + esc(r.stateCode||'') + ' \u00b7 #' + esc(r.licenseNumber||'') + ' \u00b7 ' + esc(r.licenseType||'') + '</div></div></div><div><span class="status-badge ' + s + '">' + s + '</span></div></div>' +
        '<div class="result-body"><div class="result-grid">' + fld('License Type', esc(r.licenseType||'\u2014')) + fld('License #', esc(r.licenseNumber||'\u2014')) + fld('Expiration', r.expirationDate ? fmtD(r.expirationDate) : '\u2014') + '</div></div></div>';
    });
    area.innerHTML = '<div class="result-section">' + h + '</div>';
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderNotFound(d) {
    area.innerHTML = '<div class="not-found-card" style="margin-bottom:32px"><div class="not-found-icon">&#128269;</div><div class="not-found-title">No License Found</div><div class="not-found-sub">No record for <strong>' + esc(d&&d.licenseNumber||'that number') + '</strong> in ' + esc(d&&d.stateCode||'') + '.</div></div>';
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderError(msg) {
    area.innerHTML = '<div class="not-found-card" style="margin-bottom:32px"><div class="not-found-icon">&#9888;&#65039;</div><div class="not-found-title">Error</div><div class="not-found-sub">' + esc(msg) + '</div></div>';
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function alert(d) {
    if (d.status === 'REVOKED') return '<div class="result-alert danger"><span class="result-alert-icon">\u26D4</span><div><strong>License Revoked</strong></div></div>';
    if (d.status === 'SUSPENDED') return '<div class="result-alert"><span class="result-alert-icon">\u26A0</span><div><strong>License Suspended</strong></div></div>';
    if (d.status === 'EXPIRED') return '<div class="result-alert danger"><span class="result-alert-icon">\u23F0</span><div><strong>License Expired</strong></div></div>';
    if (d.status === 'ACTIVE' && d.expirationDate) {
      var days = Math.ceil((new Date(d.expirationDate) - new Date()) / 86400000);
      if (days <= 60) return '<div class="result-alert"><span class="result-alert-icon">\uD83D\uDCC5</span><div>Expires in <strong>' + days + ' days</strong></div></div>';
    }
    return '';
  }

  function fld(l, v, c, s) { return '<div class="result-field"><div class="result-field-label">' + l + '</div><div class="result-field-value' + (c?' '+c:'') + '"' + (s?' style="'+s+'"':'') + '>' + v + '</div></div>'; }
  function expiryInfo(d) {
    if (!d) return {pct:0,cls:'',bar:'green',label:'Unknown'};
    var days = Math.ceil((new Date(d)-new Date())/86400000);
    if (days<0) return {pct:0,cls:'expired',bar:'red',label:'Expired'};
    if (days<=30) return {pct:Math.min(days/730*100,5),cls:'expiring',bar:'red',label:days+'d'};
    if (days<=60) return {pct:Math.min(days/730*100,15),cls:'expiring',bar:'amber',label:days+'d'};
    return {pct:Math.min(days/730*100,100),cls:'',bar:'green',label:days+'d'};
  }
  function fmtD(iso) { return iso ? new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}) : '\u2014'; }
  function fmtDT(iso) { return iso ? new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '\u2014'; }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // Auto-search from ?q=
  var p = new URLSearchParams(location.search);
  var q = (p.get('q')||'').trim();
  if (q) { stSel.value = (p.get('state')||'CA').toUpperCase(); updPh(); licIn.value = q; setTimeout(function(){ doVerify(stSel.value, q); }, 200); }
})();
