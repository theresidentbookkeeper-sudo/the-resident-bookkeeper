/* Where an enquiry came from. Remembers the first page a visitor landed on, the site that sent them and any
   campaign tags (utm_*) on their link, and adds these to the enquiry when they send a form. Stored only in this
   browser, used only for TRB enquiries, never shared. */
(function () {
  var KEY = 'trb_first_touch', d = document, l = location;
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function clip(s, n) { return s ? String(s).slice(0, n || 300) : null; }
  var q = new URLSearchParams(l.search);
  var ref = d.referrer && d.referrer.indexOf(l.origin) !== 0 ? d.referrer : null;
  var now = {
    page: clip(l.pathname + (l.search && q.get('utm_source') ? l.search : '')),
    referrer: clip(ref),
    utm_source: clip(q.get('utm_source'), 100),
    utm_medium: clip(q.get('utm_medium'), 100),
    utm_campaign: clip(q.get('utm_campaign'), 150)
  };
  var first = read();
  // A new campaign link or outside referral replaces the stored first touch; plain internal browsing does not.
  if (!first || now.utm_source || (now.referrer && !first.referrer)) { first = now; write(first); }

  window.trbAttribution = function () {
    return {
      landing_page: clip(l.pathname),
      first_landing_page: first && first.page,
      referrer: (first && first.referrer) || null,
      utm_source: (first && first.utm_source) || null,
      utm_medium: (first && first.utm_medium) || null,
      utm_campaign: (first && first.utm_campaign) || null
    };
  };

  // Add the attribution to every website enquiry without changing each form.
  var orig = window.fetch;
  if (!orig) return;
  window.fetch = function (url, opts) {
    try {
      var u = typeof url === 'string' ? url : (url && url.url) || '';
      if (u.indexOf('/rest/v1/public_lead_intake') !== -1 && opts && typeof opts.body === 'string') {
        var body = JSON.parse(opts.body), a = window.trbAttribution();
        var add = function (row) { for (var k in a) if (a[k] && row[k] == null) row[k] = a[k]; return row; };
        body = Array.isArray(body) ? body.map(add) : add(body);
        opts = Object.assign({}, opts, { body: JSON.stringify(body) });
      }
    } catch (e) {}
    return orig.call(this, url, opts);
  };
})();
