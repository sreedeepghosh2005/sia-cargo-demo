/* Careers page: loads the published job postings from the server (api/jobs).
   If the page is opened as a file, or the server does not answer, the job written in careers.html stays. */
(function(){
  var box = document.getElementById('jobs'), count = document.getElementById('jobCount');
  if (!box || location.protocol === 'file:') return;

  var ICON = {
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.200 7-11.500a7 7 0 10-14 0C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/></svg>',
    team: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.200"/><path d="M3 20c0-3.300 2.700-5.500 6-5.500s6 2.200 6 5.500"/><path d="M16 5.200a3.200 3.200 0 010 5.600M18 14.800c1.800.7 3 2.400 3 5.200"/></svg>',
    exp: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2.500"/><path d="M9 7V4.500h6V7M3 12.500h18"/></svg>',
    edu: '<svg viewBox="0 0 24 24"><path d="M2.500 9L12 4.500 21.500 9 12 13.500z"/><path d="M6.500 11.200V16c1.500 1.600 3.300 2.400 5.500 2.400s4-.8 5.500-2.400v-4.800"/></svg>',
    doIt: '<svg viewBox="0 0 24 24"><path d="M4 19l5.500-5.500 3.500 3.500L20 9"/><path d="M14.500 9H20v5.500"/></svg>',
    want: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.500"/><path d="M16 16l4.500 4.500"/><path d="M8.500 11l1.800 1.800 3.400-3.600"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    li: '<svg class="in" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M4.980 3.500a2.500 2.500 0 11-.020 5 2.500 2.500 0 01.020-5zM3 9.750h4V21H3zM9.500 9.750h3.800v1.540h.050c.530-1 1.830-1.840 3.650-1.840 3.900 0 4.500 2.400 4.500 5.700V21h-4v-5.200c0-1.240-.020-2.840-1.800-2.840s-2.200 1.330-2.200 2.740V21h-4z"/></svg>'
  };
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function rich(s){ return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }          /* **text** becomes bold */
  function tag(icon, value){ return value ? '<span class="tag">' + icon + esc(value) + '</span>' : ''; }
  function list(cls, items){ return '<ul class="list ' + cls + '">' + items.map(function(i){ return '<li>' + rich(i) + '</li>'; }).join('') + '</ul>'; }

  function jobHtml(j){
    var id = 'apply-' + esc(j.id);
    var safeUrl = /^(https?:\/\/|mailto:)/i.test(j.applyUrl || '') ? j.applyUrl : '';
    var onLinkedIn = /linkedin\.com/i.test(safeUrl);
    var about = (j.about || '').split(/\n\s*\n/).filter(Boolean).map(function(p){ return '<p>' + rich(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
    var cols = '';
    if (j.duties && j.duties.length) cols += '<div class="panel"><div class="ico">' + ICON.doIt + '</div><h3>What you\'ll do</h3>' + list('do', j.duties) + '</div>';
    if (j.requirements && j.requirements.length) cols += '<div class="panel"><div class="ico">' + ICON.want + '</div><h3>What we\'re looking for</h3>' + list('want', j.requirements) + '</div>';
    return '<article class="job">' +
      '<div class="job-top"><div>' +
        '<h2>' + esc(j.title) + '</h2>' +
        (j.company ? '<div class="co">' + esc(j.company) + '</div>' : '') +
        '<div class="tags">' + tag(ICON.pin, j.location) + tag(ICON.team, j.team) + tag(ICON.exp, j.experience) + tag(ICON.edu, j.education) + '</div>' +
      '</div>' + (safeUrl ? '<a class="btn btn-primary" href="#' + id + '">Apply now' + ICON.arrow + '</a>' : '') + '</div>' +
      '<div class="job-body">' +
        (about ? '<div class="intro"><h3>About the job</h3>' + about + '</div>' : '') +
        (cols ? '<div class="cols">' + cols + '</div>' : '') +
        (j.education ? '<div class="req"><div class="ico">' + ICON.edu + '</div><div><small>Requirement</small><b>' + esc(j.education) + '</b></div></div>' : '') +
        (safeUrl ? '<div class="apply" id="' + id + '"><div><h3>Ready to apply?</h3><p>' + (onLinkedIn ? 'The position is posted on our LinkedIn page. Apply there.' : 'Use the button to apply.') + '</p></div>' +
          '<a class="btn ' + (onLinkedIn ? 'btn-li' : 'btn-primary') + '" href="' + esc(safeUrl) + '" target="_blank" rel="noopener">' + (onLinkedIn ? ICON.li + 'Apply on LinkedIn' : 'Apply now' + ICON.arrow) + '</a></div>' : '') +
      '</div></article>';
  }

  fetch('api/jobs', {headers: {Accept: 'application/json'}})
    .then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(data){
      var jobs = data.jobs || [];
      count.innerHTML = '<b>' + jobs.length + '</b> Open position' + (jobs.length === 1 ? '' : 's');
      box.innerHTML = jobs.length ? jobs.map(jobHtml).join('') :
        '<div class="job"><div class="job-body"><div class="intro"><h3>No open positions right now</h3><p>Follow our LinkedIn page. We post new positions there.</p></div></div></div>';
      window.dispatchEvent(new Event('resize'));          /* page height changed: redraw the scroll route */
    })
    .catch(function(){ /* keep the built-in job */ });
})();
