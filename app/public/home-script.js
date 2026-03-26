(function() {
  var licIn = document.getElementById('licenseInput');
  var licBtn = document.getElementById('heroLicBtn');
  var fnIn = document.getElementById('heroFN');
  var lnIn = document.getElementById('heroLN');
  var nameBtn = document.getElementById('heroNameBtn');
  var resultEl = document.getElementById('demoResult');
  var statusText = document.getElementById('resultStatusText');
  var detailEl = document.getElementById('resultDetail');
  var listEl = document.getElementById('heroResultsList');

  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtD(iso) { return iso ? new Date(iso).toLocaleDateString('en-US') : ''; }

  // Tab switching
  document.querySelectorAll('.hero-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var t = tab.getAttribute('data-htab');
      document.querySelectorAll('.hero-tab').forEach(function(b) { b.classList.toggle('active', b === tab); });
      document.querySelectorAll('.hero-form').forEach(function(f) { f.classList.toggle('active', f.id === 'hero-form-' + t); });
      resultEl.classList.remove('show', 'invalid');
      listEl.innerHTML = '';
    });
  });

  function showSingle(type, status, detail) {
    resultEl.classList.remove('show', 'invalid');
    resultEl.classList.add('show');
    if (type === 'invalid') resultEl.classList.add('invalid');
    statusText.textContent = status;
    detailEl.innerHTML = detail;
    listEl.innerHTML = '';
  }

  // License verify
  async function doLic() {
    var val = licIn.value.trim();
    if (!val) { licIn.style.borderColor = '#DC2626'; licIn.focus(); setTimeout(function(){ licIn.style.borderColor=''; }, 1800); return; }
    licBtn.textContent = 'Checking\u2026'; licBtn.disabled = true;
    resultEl.classList.remove('show','invalid'); listEl.innerHTML = '';

    try {
      var r = await fetch('/api/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({stateCode:'CA',licenseNumber:val}) });
      var d = await r.json();
      if (d.error && !d.status) { showSingle('invalid','ERROR',esc(d.error)); }
      else if (d.status==='NOT_FOUND'||d.status==='VERIFICATION_ERROR') { showSingle('invalid', d.status==='NOT_FOUND'?'NOT FOUND':'ERROR', d.status==='NOT_FOUND' ? 'No record for <strong>'+esc(val)+'</strong> in CA.' : esc(d.error||'Failed.')); }
      else {
        var ok = d.status === 'ACTIVE';
        var parts = [];
        if (d.holderName) parts.push('<strong>'+esc(d.holderName)+'</strong>');
        if (d.licenseNumber) parts.push(esc(d.licenseType||'License')+' #'+esc(d.licenseNumber));
        if (d.issueDate) parts.push('Issued: '+fmtD(d.issueDate));
        if (d.expirationDate) parts.push('<strong>Expires: '+fmtD(d.expirationDate)+'</strong>');
        if (d.isArmed) parts.push('Armed: <strong>Yes</strong>');
        var detail = parts.join(' \u00b7 ');
        if (!ok) detail += '<br/><strong style="color:#DC2626">License is not currently active.</strong>';
        showSingle(ok?'valid':'invalid', d.status+(ok?' \u2014 Active License':''), detail);
      }
    } catch(e) { showSingle('invalid','NETWORK ERROR','Could not reach the server.'); }
    finally { licBtn.textContent='Verify Now \u2192'; licBtn.disabled=false; }
  }

  // Name search
  async function doName() {
    var fn = fnIn.value.trim(), ln = lnIn.value.trim();
    if (!fn||!ln) { (fn?lnIn:fnIn).focus(); return; }
    nameBtn.textContent = 'Searching\u2026'; nameBtn.disabled = true;
    resultEl.classList.remove('show','invalid');
    listEl.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--gray-400);font-size:14px">Searching BSIS for '+esc(fn)+' '+esc(ln)+'\u2026</div>';

    try {
      var r = await fetch('/api/search-public', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({stateCode:'CA',firstName:fn,lastName:ln}) });
      var d = await r.json();
      if (d.error) { listEl.innerHTML = '<div style="text-align:center;padding:16px;color:#DC2626;font-size:14px;font-weight:600">'+esc(d.error)+'</div>'; return; }
      var res = d.results || [];
      if (!res.length) {
        listEl.innerHTML = '<div style="text-align:center;padding:20px 0"><div style="font-size:32px;margin-bottom:8px">\uD83D\uDD0D</div><div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:4px">No BSIS Records Found</div><div style="font-size:13px;color:var(--gray-400)">No guard registrations matched <strong>'+esc(fn)+' '+esc(ln)+'</strong>.</div></div>';
        return;
      }
      var h = '<div style="font-size:12px;font-weight:600;color:var(--gray-400);margin-bottom:6px;text-align:left">'+res.length+' result'+(res.length>1?'s':'')+' found</div>';
      res.forEach(function(r) {
        var s = r.status||'UNKNOWN';
        var meta = [];
        if (r.licenseType) meta.push(esc(r.licenseType));
        if (r.licenseNumber) meta.push('#'+esc(r.licenseNumber));
        if (r.expirationDate) meta.push('Exp: '+fmtD(r.expirationDate));
        h += '<div class="hero-result-card"><div><div class="hr-name">'+esc(r.holderName||'Unknown')+'</div><div class="hr-meta">'+meta.join(' \u00b7 ')+'</div></div><span class="hr-badge '+s+'">'+s+'</span></div>';
      });
      listEl.innerHTML = h;
    } catch(e) { listEl.innerHTML = '<div style="text-align:center;padding:16px;color:#DC2626;font-size:14px">Network error.</div>'; }
    finally { nameBtn.textContent='Search by Name \u2192'; nameBtn.disabled=false; }
  }

  if (licBtn) licBtn.addEventListener('click', doLic);
  if (licIn) licIn.addEventListener('keydown', function(e) { if (e.key==='Enter') doLic(); });
  if (nameBtn) nameBtn.addEventListener('click', doName);
  if (lnIn) lnIn.addEventListener('keydown', function(e) { if (e.key==='Enter') doName(); });
  if (fnIn) fnIn.addEventListener('keydown', function(e) { if (e.key==='Enter') { if (lnIn.value.trim()) doName(); else lnIn.focus(); }});

  var token = localStorage.getItem('gcc_token');
  if (token) { var c = document.querySelector('.nav-cta'); if (c) { c.textContent='Dashboard'; c.href='/dashboard'; } }
})();
