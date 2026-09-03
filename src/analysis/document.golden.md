# cap1tal · AI-аналіз місячної картини

## Запит

Це пакет фінансових даних із застосунку cap1tal — місячна картина за період 2026-07 — 2026-09. Проаналізуй наведені дані і дай власнику практичний фінансовий огляд за цей період.

Усе потрібне є в цьому ж файлі, нижче: інструкції, як саме це зробити, контекст із визначенням кожного терміна, читабельний підсумок і самі дані. Шукати щось поза файлом не треба.

cap1tal.analysis-package · версія 1 · вид: місячна картина · період: 2026-07 — 2026-09 · станом на 2026-09-02 · 2026-09 — частковий місяць, минуло 2 з 30 днів

## Інструкції

- Ти читаєш готовий пакет чисел, які застосунок cap1tal уже обчислив із записів власника. Користуйся лише даними з цього файлу і нічим іншим.
- Не вигадуй жодного числа, жодної категорії, жодної транзакції і жодної валюти, якої немає в даних.
- Не перераховуй те, що вже пораховано: якщо число є в даних, бери його як є. Твоє власне обчислення виглядатиме так само, як число застосунку, і власник не відрізнить одне від одного.
- Ніколи не додавай, не конвертуй і не порівнюй суми різних валют — кожна валюта має власний звіт.
- Відокремлюй факти від припущень: пиши прямо, що взято з даних, а що є твоїм припущенням.
- Кожну пораду позначай як рекомендацію, а не подавай її як висновок із даних.
- Якщо місяць позначено як частковий (partial), він ще не завершився — не став його поруч із повними місяцями як рівний.
- Не роби прогнозів і не обіцяй майбутніх сум.
- Відповідай українською.
- Склади відповідь із семи частин: (1) коротко про ситуацію за період; (2) головні зміни і чому цей період відрізняється від попереднього; (3) категорії, що помітно зросли; (4) що виглядає необов’язковим; (5) наскільки стабільні відкладено та інвестовано; (6) великі або незвичні витрати; (7) три-п’ять конкретних речей, вартих уваги.
- Дивись саме на: зміни від місяця до місяця, найбільші категорії за період, зміни, що виділяються на тлі попередніх місяців, а також ліміти і цілі, якщо вони є в даних.
- Пояснюй числа, а не переказуй таблицю.

## Контекст

- Місячна картина — це шість чисел одного календарного місяця, окремо для кожної валюти.
- Витрачено — витрати місяця (разом із некатегоризованими, від’ємними коригуваннями і комісіями), за вирахуванням повернень.
- Дохід — усе, що надійшло ззовні за місяць, разом із додатними коригуваннями і відсотками.
- Інвестовано — чисті перекази на інвестиційні рахунки; гроші, що повернулися звідти, зменшують його і можуть зробити від’ємним.
- Відкладено — чисті перекази на накопичувальні рахунки.
- Позичено — чисті перекази на рахунки-борги: ці гроші не витрачені, але й недоступні, доки їх не повернуть.
- Залишилось — це дохід − витрачено − інвестовано − відкладено − позичено.
- Тотожність, яка тримає місяць: дохід = витрачено + інвестовано + відкладено + позичено + залишилось.
- Переказ між власними рахунками — не витрата: гроші лишилися власника, змінилося лише те, де вони лежать.
- Інвестиція — не витрата: це переказ на інвестиційний рахунок, і він рахується як «інвестовано».
- Повернення — не дохід: це від’ємна витрата у своїй же категорії.
- Коригування — не звичайна витрата і не звичайний дохід: це непояснені гроші. Від’ємне рахується як витрачено, додатне — як дохід.
- Ліміт — місячна стеля витрат на одну категорію, у власній валюті ліміту. Категорія перевищила ліміт того місяця, коли витрачено по ній (за вирахуванням повернень) строго більше за ліміт: рівність — не перевищення. Витрати в іншій валюті ні враховуються в ліміт, ні конвертуються до нього.
- Ціль — «відкласти стільки-то до дати». Її прогрес — це розрахунковий баланс прив’язаного рахунку, у валюті того рахунку і без жодної конвертації. Ціль досягнута, коли прогрес не менший за ціль, і прострочена, коли дата минула, а ціль не досягнута.
- Кожне число подане окремо для кожної валюти, і жодне число не поєднує валюти.
- Єдиний виняток — «приблизно в гривні» (approximateUah): він позначений як приблизний і має дату курсу, за яким його порахували.
- Частковий місяць (partial: true) ще триває; у періоді вказано, скільки днів минуло з усіх днів того місяця.
- Усі відношення — частки, ставки та зміни — подані в базисних пунктах (1/100 відсотка): 2500 означає 25,00 %.
- null означає, що числа немає: база була нульова або порівнювати не було з чим. Це не нуль.
- Кожна сума — точний десятковий текст із кодом валюти поруч, у головних одиницях: {"amount": "4125.34", "currency": "UAH"}.

## Підсумок

### UAH

| Місяць | Витрачено | Дохід | Інвестовано | Відкладено | Позичено | Залишилось |
| --- | --- | --- | --- | --- | --- | --- |
| Липень 2026 | 18 500,00 UAH | 50 000,00 UAH | 0,00 UAH | 10 000,00 UAH | 0,00 UAH | 21 500,00 UAH |
| Серпень 2026 | 40 900,00 UAH | 50 000,00 UAH | 8 000,00 UAH | 0,00 UAH | 0,00 UAH | 1 100,00 UAH |
| Вересень 2026 (частковий) | 15 000,00 UAH | 0,00 UAH | 0,00 UAH | 0,00 UAH | 0,00 UAH | −15 000,00 UAH |
| **За період** | 74 400,00 UAH | 100 000,00 UAH | 8 000,00 UAH | 10 000,00 UAH | 0,00 UAH | 7 600,00 UAH |

Відкладено до доходу: 10,00 % · інвестовано до доходу: 8,00 %.

**Найбільші категорії за період**

- Житло — 45 100,00 UAH (60,62 %)
- Авто — 25 000,00 UAH (33,60 %)
- Продукти — 2 600,00 UAH (3,49 %)
- Кафе — 1 500,00 UAH (2,02 %)
- Коригування — 200,00 UAH (0,27 %)

**Перевищені ліміти**

- Кафе — ліміт 800,00 UAH: Серпень 2026 на 200,00 UAH

### USD

| Місяць | Витрачено | Дохід | Інвестовано | Відкладено | Позичено | Залишилось |
| --- | --- | --- | --- | --- | --- | --- |
| Липень 2026 | 0,00 USD | 0,00 USD | 0,00 USD | 0,00 USD | 0,00 USD | 0,00 USD |
| Серпень 2026 | 120,00 USD | 0,00 USD | 0,00 USD | 0,00 USD | 0,00 USD | −120,00 USD |
| Вересень 2026 (частковий) | 0,00 USD | 0,00 USD | 0,00 USD | 0,00 USD | 0,00 USD | 0,00 USD |
| **За період** | 120,00 USD | 0,00 USD | 0,00 USD | 0,00 USD | 0,00 USD | −120,00 USD |

Відкладено до доходу: — · інвестовано до доходу: —.

**Найбільші категорії за період**

- Кафе — 120,00 USD (100,00 %)

### Приблизно в гривні

Приблизна оцінка, не сума: за курсом monobank на USD 2026-08-30.

Витрачено 79 380,00 UAH · дохід 100 000,00 UAH · залишилось 2 620,00 UAH.

### Цілі

- Авто — 17 800,00 UAH з 200 000,00 UAH, лишилось 182 200,00 UAH (до 2026-12-31), треба 45 550,00 UAH на місяць протягом 4 міс.
- Подорож — 30 000,00 UAH (до 2027-03-31), прогрес не входить у пакет (рахунки цілі в різних валютах)
- Резерв — 10 000,00 UAH з 50 000,00 UAH, лишилось 40 000,00 UAH (без дати)

## Дані

```json
{"approximateUah":{"note":"approximate","period":{"income":{"amount":"100000.00","currency":"UAH"},"invested":{"amount":"8000.00","currency":"UAH"},"left":{"amount":"2620.00","currency":"UAH"},"lent":{"amount":"0.00","currency":"UAH"},"saved":{"amount":"10000.00","currency":"UAH"},"spent":{"amount":"79380.00","currency":"UAH"}},"rates":[{"currency":"USD","rateAsOf":"2026-08-30"}]},"builtOn":"2026-09-02","byCurrency":[{"baseline":{"averagePerMonth":{"income":{"amount":"0.00","currency":"UAH"},"invested":{"amount":"0.00","currency":"UAH"},"left":{"amount":"-2500.00","currency":"UAH"},"lent":{"amount":"0.00","currency":"UAH"},"saved":{"amount":"0.00","currency":"UAH"},"spent":{"amount":"2500.00","currency":"UAH"}},"monthsBefore":1},"categories":[{"archived":false,"baselineAverage":{"amount":"0.00","currency":"UAH"},"byMonth":[{"amount":{"amount":"15000.00","currency":"UAH"},"month":"2026-07","partial":false},{"amount":{"amount":"15100.00","currency":"UAH"},"month":"2026-08","partial":false},{"amount":{"amount":"15000.00","currency":"UAH"},"month":"2026-09","partial":true}],"changeVsBaseline":null,"changeVsPreviousMonth":{"change":67,"from":"2026-07","partial":false,"to":"2026-08"},"limit":null,"name":"Житло","share":6062,"total":{"amount":"45100.00","currency":"UAH"}},{"archived":false,"baselineAverage":{"amount":"0.00","currency":"UAH"},"byMonth":[{"amount":{"amount":"0.00","currency":"UAH"},"month":"2026-07","partial":false},{"amount":{"amount":"25000.00","currency":"UAH"},"month":"2026-08","partial":false},{"amount":{"amount":"0.00","currency":"UAH"},"month":"2026-09","partial":true}],"changeVsBaseline":null,"changeVsPreviousMonth":{"change":null,"from":"2026-07","partial":false,"to":"2026-08"},"limit":null,"name":"Авто","share":3360,"total":{"amount":"25000.00","currency":"UAH"}},{"archived":false,"baselineAverage":{"amount":"2500.00","currency":"UAH"},"byMonth":[{"amount":{"amount":"3000.00","currency":"UAH"},"month":"2026-07","partial":false},{"amount":{"amount":"-400.00","currency":"UAH"},"month":"2026-08","partial":false},{"amount":{"amount":"0.00","currency":"UAH"},"month":"2026-09","partial":true}],"changeVsBaseline":-6533,"changeVsPreviousMonth":{"change":-11333,"from":"2026-07","partial":false,"to":"2026-08"},"limit":null,"name":"Продукти","share":349,"total":{"amount":"2600.00","currency":"UAH"}},{"archived":false,"baselineAverage":{"amount":"0.00","currency":"UAH"},"byMonth":[{"amount":{"amount":"500.00","currency":"UAH"},"month":"2026-07","partial":false},{"amount":{"amount":"1000.00","currency":"UAH"},"month":"2026-08","partial":false},{"amount":{"amount":"0.00","currency":"UAH"},"month":"2026-09","partial":true}],"changeVsBaseline":null,"changeVsPreviousMonth":{"change":10000,"from":"2026-07","partial":false,"to":"2026-08"},"limit":{"amount":{"amount":"800.00","currency":"UAH"},"exceeded":[{"by":{"amount":"200.00","currency":"UAH"},"month":"2026-08"}]},"name":"Кафе","share":202,"total":{"amount":"1500.00","currency":"UAH"}},{"archived":false,"baselineAverage":{"amount":"0.00","currency":"UAH"},"byMonth":[{"amount":{"amount":"0.00","currency":"UAH"},"month":"2026-07","partial":false},{"amount":{"amount":"200.00","currency":"UAH"},"month":"2026-08","partial":false},{"amount":{"amount":"0.00","currency":"UAH"},"month":"2026-09","partial":true}],"changeVsBaseline":null,"changeVsPreviousMonth":{"change":null,"from":"2026-07","partial":false,"to":"2026-08"},"limit":null,"name":"Коригування","share":27,"total":{"amount":"200.00","currency":"UAH"}}],"currency":"UAH","months":[{"changeVsPreviousMonth":{"income":null,"invested":null,"left":96000,"lent":null,"saved":null,"spent":64000},"income":{"amount":"50000.00","currency":"UAH"},"invested":{"amount":"0.00","currency":"UAH"},"investmentRate":0,"left":{"amount":"21500.00","currency":"UAH"},"lent":{"amount":"0.00","currency":"UAH"},"month":"2026-07","partial":false,"saved":{"amount":"10000.00","currency":"UAH"},"savingsRate":2000,"spent":{"amount":"18500.00","currency":"UAH"}},{"changeVsPreviousMonth":{"income":0,"invested":null,"left":-9488,"lent":null,"saved":-10000,"spent":12108},"income":{"amount":"50000.00","currency":"UAH"},"invested":{"amount":"8000.00","currency":"UAH"},"investmentRate":1600,"left":{"amount":"1100.00","currency":"UAH"},"lent":{"amount":"0.00","currency":"UAH"},"month":"2026-08","partial":false,"saved":{"amount":"0.00","currency":"UAH"},"savingsRate":0,"spent":{"amount":"40900.00","currency":"UAH"}},{"changeVsPreviousMonth":{"income":-10000,"invested":-10000,"left":-146364,"lent":null,"saved":null,"spent":-6333},"income":{"amount":"0.00","currency":"UAH"},"invested":{"amount":"0.00","currency":"UAH"},"investmentRate":null,"left":{"amount":"-15000.00","currency":"UAH"},"lent":{"amount":"0.00","currency":"UAH"},"month":"2026-09","partial":true,"saved":{"amount":"0.00","currency":"UAH"},"savingsRate":null,"spent":{"amount":"15000.00","currency":"UAH"}}],"period":{"averagePerMonth":{"income":{"amount":"33333.33","currency":"UAH"},"invested":{"amount":"2666.67","currency":"UAH"},"left":{"amount":"2533.33","currency":"UAH"},"lent":{"amount":"0.00","currency":"UAH"},"saved":{"amount":"3333.33","currency":"UAH"},"spent":{"amount":"24800.00","currency":"UAH"}},"income":{"amount":"100000.00","currency":"UAH"},"invested":{"amount":"8000.00","currency":"UAH"},"investmentRate":800,"left":{"amount":"7600.00","currency":"UAH"},"lent":{"amount":"0.00","currency":"UAH"},"saved":{"amount":"10000.00","currency":"UAH"},"savingsRate":1000,"spent":{"amount":"74400.00","currency":"UAH"}},"trends":{"largestCategories":[{"name":"Житло","share":6062,"total":{"amount":"45100.00","currency":"UAH"}},{"name":"Авто","share":3360,"total":{"amount":"25000.00","currency":"UAH"}},{"name":"Продукти","share":349,"total":{"amount":"2600.00","currency":"UAH"}},{"name":"Кафе","share":202,"total":{"amount":"1500.00","currency":"UAH"}},{"name":"Коригування","share":27,"total":{"amount":"200.00","currency":"UAH"}}],"largestDecreases":[{"after":{"amount":"-400.00","currency":"UAH"},"before":{"amount":"3000.00","currency":"UAH"},"change":-11333,"from":"2026-07","name":"Продукти","partial":false,"to":"2026-08"}],"largestIncreases":[{"after":{"amount":"1000.00","currency":"UAH"},"before":{"amount":"500.00","currency":"UAH"},"change":10000,"from":"2026-07","name":"Кафе","partial":false,"to":"2026-08"},{"after":{"amount":"15100.00","currency":"UAH"},"before":{"amount":"15000.00","currency":"UAH"},"change":67,"from":"2026-07","name":"Житло","partial":false,"to":"2026-08"}],"notable":[{"amount":{"amount":"25000.00","currency":"UAH"},"category":"Авто","month":"2026-08"},{"amount":{"amount":"15100.00","currency":"UAH"},"category":"Житло","month":"2026-08"},{"amount":{"amount":"15000.00","currency":"UAH"},"category":"Житло","month":"2026-07"},{"amount":{"amount":"15000.00","currency":"UAH"},"category":"Житло","month":"2026-09"},{"amount":{"amount":"3000.00","currency":"UAH"},"category":"Продукти","month":"2026-07"}],"recurring":[{"category":"Житло","monthsHit":3,"monthsInPeriod":3,"typicalAmount":{"amount":"15000.00","currency":"UAH"}}]}},{"baseline":null,"categories":[{"archived":false,"baselineAverage":null,"byMonth":[{"amount":{"amount":"0.00","currency":"USD"},"month":"2026-07","partial":false},{"amount":{"amount":"120.00","currency":"USD"},"month":"2026-08","partial":false},{"amount":{"amount":"0.00","currency":"USD"},"month":"2026-09","partial":true}],"changeVsBaseline":null,"changeVsPreviousMonth":{"change":null,"from":"2026-07","partial":false,"to":"2026-08"},"limit":null,"name":"Кафе","share":10000,"total":{"amount":"120.00","currency":"USD"}}],"currency":"USD","months":[{"changeVsPreviousMonth":null,"income":{"amount":"0.00","currency":"USD"},"invested":{"amount":"0.00","currency":"USD"},"investmentRate":null,"left":{"amount":"0.00","currency":"USD"},"lent":{"amount":"0.00","currency":"USD"},"month":"2026-07","partial":false,"saved":{"amount":"0.00","currency":"USD"},"savingsRate":null,"spent":{"amount":"0.00","currency":"USD"}},{"changeVsPreviousMonth":null,"income":{"amount":"0.00","currency":"USD"},"invested":{"amount":"0.00","currency":"USD"},"investmentRate":null,"left":{"amount":"-120.00","currency":"USD"},"lent":{"amount":"0.00","currency":"USD"},"month":"2026-08","partial":false,"saved":{"amount":"0.00","currency":"USD"},"savingsRate":null,"spent":{"amount":"120.00","currency":"USD"}},{"changeVsPreviousMonth":{"income":null,"invested":null,"left":10000,"lent":null,"saved":null,"spent":-10000},"income":{"amount":"0.00","currency":"USD"},"invested":{"amount":"0.00","currency":"USD"},"investmentRate":null,"left":{"amount":"0.00","currency":"USD"},"lent":{"amount":"0.00","currency":"USD"},"month":"2026-09","partial":true,"saved":{"amount":"0.00","currency":"USD"},"savingsRate":null,"spent":{"amount":"0.00","currency":"USD"}}],"period":{"averagePerMonth":{"income":{"amount":"0.00","currency":"USD"},"invested":{"amount":"0.00","currency":"USD"},"left":{"amount":"-120.00","currency":"USD"},"lent":{"amount":"0.00","currency":"USD"},"saved":{"amount":"0.00","currency":"USD"},"spent":{"amount":"120.00","currency":"USD"}},"income":{"amount":"0.00","currency":"USD"},"invested":{"amount":"0.00","currency":"USD"},"investmentRate":null,"left":{"amount":"-120.00","currency":"USD"},"lent":{"amount":"0.00","currency":"USD"},"saved":{"amount":"0.00","currency":"USD"},"savingsRate":null,"spent":{"amount":"120.00","currency":"USD"}},"trends":{"largestCategories":[{"name":"Кафе","share":10000,"total":{"amount":"120.00","currency":"USD"}}],"largestDecreases":[],"largestIncreases":[],"notable":[{"amount":{"amount":"120.00","currency":"USD"},"category":"Кафе","month":"2026-08"}],"recurring":[]}}],"counts":{"accountsByKind":{"cash":1,"debt":0,"investment":1,"savings":2,"spending":1},"categories":5,"currencies":["UAH","USD"],"monthsWithData":3,"transactions":14},"goals":[{"deadline":"2026-12-31","monthsLeft":4,"name":"Авто","overdue":false,"perMonth":{"amount":"45550.00","currency":"UAH"},"progress":{"amount":"17800.00","currency":"UAH"},"reached":false,"remaining":{"amount":"182200.00","currency":"UAH"},"target":{"amount":"200000.00","currency":"UAH"}},{"deadline":"2027-03-31","name":"Подорож","progressNotInPackage":true,"target":{"amount":"30000.00","currency":"UAH"}},{"name":"Резерв","overdue":false,"progress":{"amount":"10000.00","currency":"UAH"},"reached":false,"remaining":{"amount":"40000.00","currency":"UAH"},"target":{"amount":"50000.00","currency":"UAH"}}],"history":"sufficient","included":{"descriptions":false,"transactions":false},"kind":"monthly-picture","period":{"calendar":"calendar-month","from":"2026-07","months":3,"partialMonth":{"daysElapsed":2,"daysInMonth":30,"month":"2026-09"},"to":"2026-09"},"schema":"cap1tal.analysis-package","version":1}
```
