// TRB audit: records sign-ins, page views, file downloads/uploads and sign-outs for the Audit page.
// Usage on a portal page: trbAudit.start(sb, 'workspace'); trbAudit.log('view', 'Mail tab'); trbAudit.signOut()
window.trbAudit = (function () {
  let sb = null, page = '', timer = null;
  const call = (event, area, detail, ref, at) => {
    if (!sb) return Promise.resolve();
    return sb.rpc('trb_audit', { p_event: event, p_area: area || page, p_detail: detail || null, p_ref: ref || null, p_signed_in_at: at || null }).then(() => {}, () => {});
  };
  function device() {
    const u = navigator.userAgent;
    const os = /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iPhone/iPad' : /Windows/.test(u) ? 'Windows' : /Mac OS/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Other';
    const br = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'Browser';
    return br + ' on ' + os;
  }
  // Log file downloads and uploads made through Supabase Storage on this page.
  function watchStorage() {
    const orig = sb.storage.from.bind(sb.storage);
    sb.storage.from = (bucket) => {
      const b = orig(bucket);
      for (const [fn, ev] of [['createSignedUrl', 'download'], ['download', 'download'], ['upload', 'upload']]) {
        const f = b[fn] && b[fn].bind(b);
        if (!f) continue;
        b[fn] = async (...args) => {
          const r = await f(...args);
          // Thumbnails and previews are not downloads; only count signed links asked for as downloads.
          const isPreview = fn === 'createSignedUrl' && !(args[2] && args[2].download);
          if (!r.error && !isPreview) call(ev, bucket, String(args[0] || '').split('/').pop(), String(args[0] || ''));
          return r;
        };
      }
      return b;
    };
  }
  async function start(client, p) {
    sb = client; page = p;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    watchStorage();
    await call('login', page, device(), null, session.user.last_sign_in_at || null);
    call('view', page);
    clearInterval(timer);
    timer = setInterval(() => { if (document.visibilityState === 'visible') call('heartbeat', page); }, 120000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') call('heartbeat', page); });
  }
  async function signOut() { await call('logout', page); await sb.auth.signOut(); }
  return { start, signOut, log: (event, detail, ref, area) => call(event, area, detail, ref) };
})();
