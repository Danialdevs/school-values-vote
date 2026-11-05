/* Доступ к базе голосования (Supabase RPC). Ключ — публичный (publishable), права ограничены функциями sv_*. */
(function () {
  'use strict';
  var C = window.SV_CFG || {};
  var API = (window.API = {});

  function headers() {
    var h = { 'Content-Type': 'application/json', apikey: C.key };
    if (/^eyJ/.test(C.key)) h.Authorization = 'Bearer ' + C.key;
    return h;
  }

  API.rpc = function (fn, args) {
    return fetch(C.url + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: headers(), body: JSON.stringify(args || {}), cache: 'no-store',
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.message) || 'HTTP ' + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  };

  API.site = C.site;
  API.voteUrl = function (t) { return C.site + 'v/' + t + '/'; };
  API.screenUrl = function (t) { return C.site + 'screen/' + t + '/'; };

  /* Приводим ответ базы к формату, который понимают страницы. */
  API.normalize = function (raw) {
    var cfg = (raw && raw.config) || {};
    var order = cfg.order || Object.keys(cfg.teams || {}).sort();
    var teams = {};
    order.forEach(function (t) {
      var ti = (cfg.teams || {})[t] || {}, st = (raw.teams || {})[t] || {};
      teams[t] = {
        id: t, name: ti.name, letter: ti.letter || t, color: ti.color, accent: ti.accent,
        counts: st.counts || {}, voters: st.voters || 0, mode: st.mode || 'voting', voteUrl: API.voteUrl(t),
      };
    });
    return {
      boot: 'cloud', rev: raw.rev, title: cfg.title, subtitle: cfg.subtitle, question: cfg.question,
      formulaResult: cfg.formulaResult, picks: cfg.picks, values: cfg.values || [], order: order, teams: teams,
      settings: raw.settings,
    };
  };

  API.state = function () { return API.rpc('sv_public').then(API.normalize); };
  API.me = function (device) { return API.rpc('sv_me', { p_device: device }); };
  API.vote = function (team, choices, device) {
    return API.rpc('sv_vote', { p_team: team, p_choices: choices, p_device: device });
  };
  API.admin = function (pin, action, args) {
    return API.rpc('sv_admin', { p_pin: pin, p_action: action, p_args: args || {} });
  };
})();
