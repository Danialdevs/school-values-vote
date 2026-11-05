# Голосование «Ценности школы» — онлайн-версия

Блок «Собери формулу школы»: две территории (А и Б), две тач-панели, у каждой свой QR-код.
Ребёнок сканирует QR, выбирает **ровно 5 из 15** ценностей — на панели в реальном времени растут столбики,
мелькают «+1», ценности меняются местами. По команде ведущего — итог: «формула школы» из 5 ценностей.

Работает постоянно, ноутбук не нужен: сайт — **GitHub Pages**, голоса — база **Supabase**.

## Ссылки

| Что | Адрес |
|---|---|
| Пульт ведущего (PIN у организатора) | https://danialdevs.github.io/school-values-vote/admin/ |
| Тач-панель А (слева) | https://danialdevs.github.io/school-values-vote/screen/A/ |
| Тач-панель Б (справа) | https://danialdevs.github.io/school-values-vote/screen/B/ |
| Голосование А (QR) | https://danialdevs.github.io/school-values-vote/v/A/ |
| Голосование Б (QR) | https://danialdevs.github.io/school-values-vote/v/B/ |
| Сравнение А и Б | https://danialdevs.github.io/school-values-vote/compare/ |
| Печать QR (A4) | https://danialdevs.github.io/school-values-vote/print/ |

Адреса постоянные — QR-коды можно печатать заранее.

## Во время мероприятия

1. На панелях откройте ссылки экранов, нажмите ⛶ (полный экран).
2. В пульте: «+20 тестовых голосов» для проверки → **«Сбросить всё»** перед началом.
3. Дети голосуют по QR. Итог — кнопка **«🏆 Показать итоги на обоих экранах»** (голосование закрывается).
4. Без пульта: на панели удерживайте 1,5 сек плашку «ТЕРРИТОРИЯ А/Б» — переключение голосование ⇄ итоги.

## Устройство

- `src/` — страницы (экран, телефон, пульт, сравнение, печать); `build.js` собирает их в `docs/` (GitHub Pages).
- `supabase/migrations/` — схема базы. Таблицы закрыты (RLS), браузер вызывает только функции:
  `sv_public` (состояние), `sv_vote` (голос: ровно 5 из списка, один телефон — один голос),
  `sv_me`, `sv_admin` (по PIN; блокировка после 30 неверных попыток за 10 минут).
- Бесплатный Supabase засыпает после 7 дней без запросов. Защита от этого:
  - на Mac организатора стоит агент `~/Library/LaunchAgents/kz.danialdevs.school-values-keepalive.plist`
    (раз в 12 часов один запрос к базе);
  - `.github/workflows/keepalive.yml` — то же самое через GitHub Actions (заработает, когда на аккаунте
    будет снята блокировка Actions из-за оплаты);
  - можно добавить любой бесплатный монитор (UptimeRobot, cron-job.org) на адрес
    `https://luhdhpillsgxtdzialkt.supabase.co/rest/v1/rpc/sv_public?apikey=<ключ из docs/assets/config.js>`.
  - Если база всё же уснула: supabase.com → проект `school-values-vote` → **Restore** (пара минут).
- Ключ в `docs/assets/config.js` — публичный (publishable), так и задумано.

Изменить ценности/названия: поле `config` в таблице `sv_config` (Supabase → Table Editor) и строки `sv_count`.
