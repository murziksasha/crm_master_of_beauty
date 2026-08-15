# Master of Beauty — CRM салону краси

Повноцінна CRM-система для салону краси українською мовою:

- клієнти, майстри, послуги (перукарські, фарбування, нігті, масаж, косметологія, брови, макіяж)
- календар записів і онлайн-бронювання
- каса, склад, лояльність, звіти
- Docker Compose (PostgreSQL, Redis, NestJS API, Next.js, Nginx)

## Стек

| Шар | Технологія |
|-----|------------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS 4, TanStack Query |
| Backend | NestJS, Prisma, JWT, Swagger |
| DB / Cache | PostgreSQL 16, Redis 7 |
| Proxy | Nginx |

## Швидкий старт

### Вимоги

- Docker Desktop (Windows/macOS/Linux)
- або Node.js 22+ для локальної розробки без Docker

### Запуск у Docker

```bash
cp .env.example .env
docker compose up --build
```

Відкрийте:

- **UI:** http://localhost
- **API docs (Swagger):** http://localhost/api/docs
- **Health:** http://localhost/api/health

### Демо-облікові записи

| Роль | Email | Пароль |
|------|-------|--------|
| Власник | `admin@masterofbeauty.ua` | `Admin123!` |
| Рецепція | `reception@masterofbeauty.ua` | `Reception123!` |
| Майстер | `maria@masterofbeauty.ua` | `Master123!` |

## Можливості

### CRM (персонал)
- Дашборд KPI на день
- Клієнти: картка, редагування, нотатки, алергії, історія, бонуси
- Послуги за категоріями
- Майстри: створення/редагування, спеціалізації, графік, прив’язка послуг
- Записи: календар по майстрах, **вільні слоти**, статуси, оплата візиту
- Каса: чеки, **друк чека**, виручка дня, продаж товарів
- Склад: залишки, рухи, low-stock
- Лояльність: бали, абонементи, сертифікати
- Звіти: виручка, топ послуг, CSV
- Налаштування салону
- Сповіщення (mock SMS/email у логах API) при створенні/зміні запису
- Адаптивне меню (мобільний sidebar)

### Публічно
- Лендінг `/`
- Онлайн-запис wizard `/book` (вибір філії)

### Мережа / інтеграції
- **Multi-branch**: перемикач філії в CRM, привʼязка майстрів/записів/каси
- **Waitlist**: лист очікування + SMS-нотифікація
- **Повторювані записи**: серії weekly / biweekly / monthly
- **SMS**: MOCK / TurboSMS / AlphaSMS (env + налаштування)
- **LiqPay**: checkout + server callback + сторінка платежів

#### SMS env
```
SMS_PROVIDER=MOCK|TURBOSMS|ALPHASMS
TURBOSMS_TOKEN=...
ALPHASMS_API_KEY=...
SMS_SENDER=BeautyCRM
```

#### LiqPay env
```
LIQPAY_ENABLED=true
LIQPAY_PUBLIC_KEY=...
LIQPAY_PRIVATE_KEY=...
PUBLIC_BASE_URL=https://your-domain.ua
```

#### SMTP email
```
SMTP_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@masterofbeauty.ua
```

### Операційні фічі (v2+)
- Waitlist → **Записати** (слоти + створення appointment)
- Публічний waitlist з `/book`, якщо немає слотів
- Подарунковий сертифікат у касі / оплаті візиту
- Time-off майстрів у картці
- Звіти та дашборд з KPI листа очікування
- Email (SMTP) + mock fallback
- **Календар: день / тиждень**
- **Ролі RBAC у UI + API** (MASTER бачить лише свій розклад)

### Глибокі поліпшення (v3)
- **Анти double-book**: `pg_advisory_xact_lock` у транзакції створення/зміни запису
- **Redis**: кеш/ліміт логіну, pub/sub подій календаря (опційно)
- **Refresh token rotation** + revoke store у PostgreSQL
- **Audit log** (`/api/v1/audit`) для критичних дій
- **Нагадування −24h/−2h** (cron кожні 5 хв) + expiry waitlist
- **Waitlist auto-offer** при CANCELLED / NO_SHOW
- **Касова зміна**: open / close + Z-різниця
- **Сторно чеків** з відкотом складу та бонусів
- **Комісії майстрів** `/reports/commissions`
- **Win-back сегмент** `/reports/inactive-clients`
- **Client 360** `/clients/:id/timeline` (LTV, timeline)
- **Smart suggest** `/appointments/suggest` + upsell hints
- **Insights** `/insights/revenue-brief`
- **CI** (GitHub Actions) + unit smoke tests
- **packages/shared** — спільні типи

### v3.1
- **SSE realtime** `/api/v1/realtime/stream` (+ invalidate UI)
- **Timeline calendar** з drag-and-drop переносу (15 хв)
- **POST /appointments/:id/reschedule**
- **HttpOnly cookies** (опційно `AUTH_COOKIE=true`) + JWT з cookie/query
- **Рецепти матеріалів** (BOM) `/services/:id/materials` → автосписання при оплаті
- **PWA** manifest + service worker
- **Audit UI** у налаштуваннях

### v3.2
- **Депозит online** (LiqPay % від послуги, no-show protection)
- **Кабінет клієнта** `/my` — SMS OTP, записи, скасування (−3 год)
- **Кабінети/rooms** + conflict capacity
- **Resize тривалості** у Timeline (нижній край блоку)
- Налаштування: depositEnabled / depositRequired / depositPercent

### v3.3
- **Room picker** у формі нового запису CRM
- **Депозит у касі**: `depositPaidAt` автоматично зменшує суму чека
- **Live preview** resize у Timeline
- Seed: демо-кабінети по філіях

### v3.4
- **Mock-депозит** `POST /payments/mock-deposit` (+ public) — без LiqPay (`DEPOSIT_MOCK`)
- **Room** на `/book` і зміна кабінету в CRM (select)
- **Google Calendar** + **.ics** export (CRM + після онлайн-запису)
- `GET /public/rooms`

### v3.5
- **SSE toast** у CRM (новий запис / статус / перенос)
- **Email + .ics** вкладення при створенні запису (SMTP або mock log)
- **Повернення депозиту** `POST /payments/deposit-refund` (REVERSED)

### v3.6
- **Auto-refund** депозиту при `CANCELLED` (`DEPOSIT_AUTO_REFUND_ON_CANCEL`, не при NO_SHOW)
- **Виплати CSV** `/reports/commissions.csv` + кнопка у Звітах
- **PWA browser notifications** (permission prompt + background tab)

### v3.7
- **Payroll close** `/payroll/close` + mark-paid, UI у Звітах
- **Шаблони абонементів** — створення в UI лояльності
- **Мій день (MASTER)** — check-in / complete / no-show на дашборді

### v3.8
- **Абонемент на касі**: вибір пакета → 1 сеанс free + burn
- `GET /loyalty/packages/client/:id`
- **Payroll reopen** `POST /payroll/:id/reopen` (CLOSED only)
- **MASTER earnings** `GET /reports/my-commissions` + блок на дашборді

### v3.9
- Посилений **`.gitignore`** (`**/node_modules/`, dist, .next, .env)
- **Payroll unmark-paid** `POST /payroll/:id/unmark-paid`
- Git init: `node_modules` не потрапляють у status

### v4.0
- **packageSessions** на касі: списати N сеансів за візит
- **NO_SHOW**: депозит утримано + нотатка в записі
- **MASTER KPI**: заробіток сьогодні + no-show count на дашборді

### v4.1 (фінальна хвиля ops)
- **Daily jobs 08:05 Kyiv**: staff morning digest, birthday SMS/email, low-stock alert
- Manual: `POST /jobs/run-daily` (+ birthdays / low-stock / reminders)
- **Birthdays report** `GET /reports/birthdays?days=7` + UI у Звітах
- **Абонементи** на картці клієнта
- **Payroll CSV** `GET /payroll/:id/export.csv` + audit при close
- **LiqPay return** `/book?payment=result&order=…`

## Структура

```
apps/api   — NestJS + Prisma
apps/web   — Next.js
nginx/     — reverse proxy
docker-compose.yml
```

## API

Базовий префікс: `/api/v1`

- `POST /auth/login`
- `GET /clients`, `POST /clients`
- `GET /appointments`, `POST /appointments`, `GET /appointments/slots`
- `POST /cash`
- `GET /inventory/products`
- `GET /reports/overview`
- `GET /public/services`, `POST /public/bookings`

## Локальна розробка (без Docker UI)

```bash
# Postgres + Redis через compose
docker compose up postgres redis -d

# API
cd apps/api
cp ../../.env.example .env   # DATABASE_URL -> localhost
npm install
npx prisma migrate deploy
npx prisma db seed
npm run start:dev

# Web
cd apps/web
npm install
# NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
npm run dev
```

## Змінні середовища

Див. `.env.example`.

## Ліцензія

Приватний проєкт / для внутрішнього використання салону.
