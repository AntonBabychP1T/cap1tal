## Why

Головний уже відповідає на щоденне питання «куди пішли гроші», але один фіксований набір і порядок блоків не підходить кожному власникові. Потрібна мала контрольована кастомізація відомих widgets: прибрати зайве й підняти важливе, не перетворюючи cap1tal на конструктор dashboard і не змінюючи жодного фінансового розрахунку.

## What Changes

- Додати в header Головного дію «Налаштувати», яка відкриває окремий екран редагування layout.
- Визначити закритий registry відомих widgets з постійними id, назвами для preview, актуальним default order і default visibility. У першій версії це «Витрачено цього місяця», «Останні 5 транзакцій», «Топ категорій», «Статок» і опційний «Прогрес»; дублікати неможливі.
- Дати власникові змінювати порядок і visible/hidden кожного відомого widget зрозумілими кнопками «Вище»/«Нижче» з доступними назвами. Це свідомо обраний механізм reorder замість нової drag-and-drop залежності; екран одразу показує майбутній порядок і стан.
- Fresh install показує стабільний default: витрачено → останні 5 транзакцій → топ категорій → статок. «Прогрес» доступний у редакторі, але прихований за замовчуванням і ніколи не піднімається над основною фінансовою інформацією default layout.
- Додати «Скинути до стандартного вигляду»: reset читає актуальний registry поточної версії, а не повертає застарілий snapshot.
- Зберігати versioned layout як локальну user preference у SQLite та включати її до ручного й Google Drive бекапу разом з іншими несекретними налаштуваннями власника.
- Нормалізувати збережений layout при читанні: перша відома поява id перемагає, дублікати відкидаються, невідомі/видалені id ігноруються, а відомий widget, якого стара конфігурація ще не знала, додається в кінець прихованим. Так оновлення не ламає й не перебудовує персоналізований dashboard; reset застосовує новий актуальний default.
- Рендерити widgets лише через наявні repositories/selectors/domain calculations. Кастомізація не створює нового балансу, місячної картини, досягнення, виклика, запиту мережі чи іншої фінансової бізнес-логіки.
- Залишити sync status, банер «Без категорії», pending чернетки й actionable failure alerts поза registry. Вони компактні, стоять біля контексту, до якого належать, і не можуть бути приховані або переставлені кастомізацією.

### Scope and non-goals

У scope: registry, version/normalization policy, редактор порядку й видимості, reset, локальне збереження, backup/restore та керований рендер відомих widgets. Перший набір не дає перейменовувати widgets, міняти їхній внутрішній вигляд, розмір чи data source.

Не в scope: універсальний no-code dashboard builder, довільні сторонні widgets, grid/resizing, умовні правила, кілька dashboard, cloud account/live sync, нові мережеві запити або фінансова логіка. Жоден пункт vision §14 не скасовується; зокрема зміна не додає overall monthly limit (§14.13), forecasts (§14.10), shared/multi-user data (§14.1) чи інший cloud service (§14.9).

## Capabilities

### New Capabilities

- `dashboard-layout`: закритий registry widgets, versioned preference, нормалізація старої/майбутньої конфігурації, visible/order editing і reset до актуального default.

### Modified Capabilities

- `main-screen`: дія редагування в header, рендер відомих widgets у вибраному порядку та незмінно видимі компактні службові alerts поза layout.
- `backup-file`: dashboard layout входить до бекапу як несекретна user preference і відновлюється атомарно разом з рештою даних.
- `progress-screen`: `home-dashboard-redesign` заборонив home widget для Прогресу без винятків; ця зміна відкриває один свідомий, прихований за замовчуванням виняток — власник може зробити widget видимим, і тоді він показує той самий тихий unseen-badge, що й запис «Прогрес» на «Звітах», нічого не оцінюючи і нічого не позначаючи переглянутим сам по собі.

## Impact

Основні точки: `src/app/(tabs)/index.tsx`, новий route під `src/app/manage/`, чистий layout registry/normalizer у новому `src/dashboard/`, dedicated repository і таблиця у `src/db/`, `src/db/repos.ts`, Drizzle schema та append-only migration, `src/backup/format.ts`, `src/db/backup-repo.ts` і їхні тести. Для опційного «Прогресу» повторно використовуються наявні progress ports/view models; для чотирьох фінансових widgets — поточні Home/monthly-picture/category/net-worth reads. `src/dashboard/` — новий корінь модулів поруч із `src/domain/`, `src/ui/` тощо; CLAUDE.md's Layout table отримує рядок для нього (task 7.1).

Зміна потребує schema migration і відповідного bump `BACKUP_SCHEMA_VERSION`; backup format змінюється сумісно через optional preference field, тому старі бекапи лишаються читабельними. Нових native modules, permissions, Expo config, зовнішніх API або npm dependencies не потрібно.
