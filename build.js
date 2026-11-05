#!/usr/bin/env node
'use strict';
/*
 * Сборка статического сайта для GitHub Pages: src/ → docs/
 *   node build.js
 * Адрес базы и сайта — в cloud.config.json (ключ publishable — публичный, права ограничены функциями sv_* в базе).
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'docs');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'cloud.config.json'), 'utf8'));
const site = cfg.siteUrl.replace(/\/?$/, '/');
const TEAMS = cfg.teams || ['A', 'B'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });

function page(tpl, out, boot) {
  const depth = out.split('/').length - 1;
  const rootRel = depth ? '../'.repeat(depth) : './';
  let html = fs.readFileSync(path.join(SRC, tpl), 'utf8');
  html = html.split('{{ROOT}}').join(rootRel);
  html = html.replace('<!--BOOT-->', (boot ? '<script>window.BOOT=' + JSON.stringify(boot) + ';</script>\n' : '') +
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ctext y=%22.9em%22 font-size=%2290%22%3E🗳%3C/text%3E%3C/svg%3E">');
  const file = path.join(OUT, out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

page('index.html', 'index.html');
page('admin.html', 'admin/index.html');
page('compare.html', 'compare/index.html');
page('print.html', 'print/index.html');
TEAMS.forEach((t) => {
  page('screen.html', `screen/${t}/index.html`, { team: t });
  page('vote.html', `v/${t}/index.html`, { team: t });
});

['qrcode.js', 'api.js', 'live.js'].forEach((f) => fs.copyFileSync(path.join(SRC, 'assets', f), path.join(OUT, 'assets', f)));
fs.writeFileSync(path.join(OUT, 'assets', 'config.js'),
  '/* сгенерировано build.js */\nwindow.SV_CFG = ' + JSON.stringify({ url: cfg.supabaseUrl, key: cfg.supabaseKey, site }, null, 2) + ';\n');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, '404.html'),
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Не найдено</title>' +
  '<body style="font-family:system-ui;background:#0b1133;color:#fff;text-align:center;padding:60px 20px">' +
  '<h1>Страница не найдена</h1><p style="opacity:.8">Отсканируйте QR-код ещё раз или откройте <a style="color:#5ee7ff" href="' + site + '">главную</a>.</p></body>');

console.log('Готово: docs/ → ' + site);
