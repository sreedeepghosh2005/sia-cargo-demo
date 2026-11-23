/* Admin page: login, forced password change, and add / edit / delete of job postings. */
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var views = ['viewOffline', 'viewLogin', 'viewPw', 'viewDash'];
  var me = null, jobs = [], editingId = null;
  var DEFAULT_PASSWORD = '12345678';      /* only used to show the "not the default password" rule; the server enforces it */

  function show(view){
    views.forEach(function(v){ $(v).hidden = v !== view; });
    $('userBox').hidden = !me;
    if (me) $('who').textContent = me.email;
    $('btnPw').hidden = !me || me.mustChangePassword;
    window.scrollTo(0, 0);
  }
  function msg(id, text, cls){
    var el = $(id);
    el.textContent = text || '';
    el.className = 'msg ' + (cls || el.className.replace(/\b(msg|show)\b/g, '').trim() || 'err') + (text ? ' show' : '');
  }
  function api(method, url, body){
    return fetch('api' + url, {
      method: method, credentials: 'same-origin',
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(data){
        if (r.ok) return data;
        var e = new Error(data.error || 'Something went wrong (' + r.status + ').'); e.status = r.status; e.data = data; throw e;
      });
    });
  }
  function fail(id){
    return function(e){
      if (e.status === 401 && me){ me = null; show('viewLogin'); msg('loginMsg', 'Your session ended. Log in again.'); return; }
      if (e.data && e.data.mustChangePassword){ me.mustChangePassword = true; openPw(true); return; }
      msg(id, e.message);
    };
  }
  function busy(form, on){ form.querySelectorAll('button').forEach(function(b){ b.disabled = on; }); }

  /* ---------- start ---------- */
  if (location.protocol === 'file:'){ show('viewOffline'); return; }
  api('GET', '/me').then(function(u){ me = u; afterLogin(); })
    .catch(function(e){ if (e.status === 401) show('viewLogin'); else show('viewOffline'); });

  function afterLogin(){
    if (me.mustChangePassword) openPw(true); else loadJobs();
  }

  /* ---------- login ---------- */
  $('loginForm').addEventListener('submit', function(ev){
    ev.preventDefault();
    var f = ev.target, email = f.email.value.trim().toLowerCase(), password = f.password.value;
    if (!/@cargoservice\.in$/.test(email)) return msg('loginMsg', 'Only @cargoservice.in email addresses can log in.');
    if (!password) return msg('loginMsg', 'Enter your password.');
    busy(f, true); msg('loginMsg', '');
    api('POST', '/login', {email: email, password: password})
      .then(function(u){ me = u; f.reset(); afterLogin(); })
      .catch(function(e){ msg('loginMsg', e.message); })
      .then(function(){ busy(f, false); });
  });
  $('btnOut').addEventListener('click', function(){
    api('POST', '/logout').catch(function(){}).then(function(){ me = null; jobs = []; show('viewLogin'); });
  });

  /* ---------- change password ---------- */
  function openPw(forced){
    var f = $('pwForm'); f.reset(); msg('pwMsg', ''); checkRules();
    $('pwTitle').textContent = forced ? 'Set a new password' : 'Change password';
    $('pwSub').textContent = forced ? 'You must change the default password before you can manage job postings.' : 'Enter your current password, then the new one.';
    $('pwCancel').hidden = forced;
    show('viewPw');
  }
  function checkRules(){
    var f = $('pwForm'), n = f.next.value, ok = {len: n.length >= 8, notDefault: n.length > 0 && n !== DEFAULT_PASSWORD, match: n.length > 0 && n === f.again.value};
    $('rules').querySelectorAll('li').forEach(function(li){ li.classList.toggle('good', !!ok[li.dataset.rule]); });
    return ok.len && ok.notDefault && ok.match;
  }
  $('pwForm').addEventListener('input', checkRules);
  $('btnPw').addEventListener('click', function(){ openPw(false); });
  $('pwCancel').addEventListener('click', function(){ show('viewDash'); });
  $('pwForm').addEventListener('submit', function(ev){
    ev.preventDefault();
    var f = ev.target;
    if (!f.current.value) return msg('pwMsg', 'Enter your current password.');
    if (!checkRules()) return msg('pwMsg', 'The new password does not meet the rules below.');
    busy(f, true); msg('pwMsg', '');
    api('POST', '/change-password', {currentPassword: f.current.value, newPassword: f.next.value})
      .then(function(){ me.mustChangePassword = false; f.reset(); return loadJobs('Your password is changed.'); })
      .catch(fail('pwMsg'))
      .then(function(){ busy(f, false); });
  });

  /* ---------- jobs ---------- */
  function loadJobs(note){
    return api('GET', '/admin/jobs').then(function(d){
      jobs = d.jobs || []; closeEditor(); render(); show('viewDash'); msg('dashMsg', note || '', 'ok');
    }).catch(fail('dashMsg'));
  }
  function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function render(){
    var rows = $('rows'); rows.textContent = '';
    if (!jobs.length){ rows.appendChild(el('div', 'empty', 'No job postings yet. Use "New job posting" to add one.')); return; }
    jobs.forEach(function(j){
      var row = el('div', 'jrow'), left = el('div'), h = el('h3', '', j.title), acts = el('div', 'acts');
      h.appendChild(el('span', 'pillst ' + j.status, j.status === 'draft' ? 'Draft' : 'Published'));
      left.appendChild(h);
      var bits = [j.company, j.location].filter(Boolean);
      bits.push('Updated ' + new Date(j.updatedAt).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'}) + (j.updatedBy && j.updatedBy !== 'seed' ? ' by ' + j.updatedBy : ''));
      left.appendChild(el('div', 'meta', bits.join('  ·  ')));
      var edit = el('button', 'btn btn-ghost btn-sm', 'Edit'), del = el('button', 'btn btn-danger btn-sm', 'Delete');
      edit.type = del.type = 'button';
      edit.addEventListener('click', function(){ openEditor(j); });
      del.addEventListener('click', function(){            /* two-step delete, no browser dialog */
        acts.textContent = '';
        var yes = el('button', 'btn btn-danger btn-sm', 'Yes, delete'), no = el('button', 'btn btn-ghost btn-sm', 'Keep');
        yes.type = no.type = 'button';
        acts.appendChild(el('span', 'confirm', 'Delete this posting? This cannot be undone.'));
        acts.appendChild(yes); acts.appendChild(no);
        no.addEventListener('click', render);
        yes.addEventListener('click', function(){
          yes.disabled = no.disabled = true;
          api('DELETE', '/jobs/' + encodeURIComponent(j.id)).then(function(){ return loadJobs('"' + j.title + '" is deleted.'); }).catch(fail('dashMsg'));
        });
      });
      acts.appendChild(edit); acts.appendChild(del);
      row.appendChild(left); row.appendChild(acts); rows.appendChild(row);
    });
  }

  var FIELDS = ['title', 'company', 'location', 'team', 'experience', 'education', 'about', 'applyUrl', 'status'];
  function openEditor(job){
    var f = $('jobForm'); f.reset(); msg('jobMsg', ''); msg('dashMsg', '', 'ok');
    editingId = job ? job.id : null;
    $('jobFormTitle').textContent = job ? 'Edit job posting' : 'New job posting';
    $('jobSave').textContent = job ? 'Save changes' : 'Post job';
    if (job){
      FIELDS.forEach(function(k){ f[k].value = job[k] || (k === 'status' ? 'published' : ''); });
      f.duties.value = (job.duties || []).join('\n');
      f.requirements.value = (job.requirements || []).join('\n');
    } else {
      f.company.value = 'Cargo Services Private Limited';
    }
    $('editor').hidden = false; $('btnNew').hidden = true;
    $('editor').scrollIntoView({block: 'start'}); window.scrollBy(0, -84);
    f.title.focus({preventScroll: true});
  }
  function closeEditor(){ $('editor').hidden = true; $('btnNew').hidden = false; editingId = null; }
  $('btnNew').addEventListener('click', function(){ openEditor(null); });
  $('jobCancel').addEventListener('click', closeEditor);
  $('jobForm').addEventListener('submit', function(ev){
    ev.preventDefault();
    var f = ev.target, body = {};
    FIELDS.forEach(function(k){ body[k] = f[k].value; });
    body.duties = f.duties.value.split('\n'); body.requirements = f.requirements.value.split('\n');
    if (!body.title.trim()) return msg('jobMsg', 'The job title is required.');
    busy(f, true); msg('jobMsg', '');
    var wasEdit = !!editingId;
    api(wasEdit ? 'PUT' : 'POST', wasEdit ? '/jobs/' + encodeURIComponent(editingId) : '/jobs', body)
      .then(function(d){ return loadJobs('"' + d.job.title + '" is ' + (wasEdit ? 'updated.' : d.job.status === 'draft' ? 'saved as a draft.' : 'posted.')); })
      .catch(fail('jobMsg'))
      .then(function(){ busy(f, false); });
  });
})();
