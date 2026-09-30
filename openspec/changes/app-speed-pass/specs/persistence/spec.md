## ADDED Requirements

### Requirement: A read repeated between writes is answered without reading storage again

Storage SHALL answer a read repeated with nothing written in between from the answer it gave
before, without reading the stored rows again. Such reads include the whole stored history, every
рахунок's розрахунковий баланс, the months holding at least one транзакція, the «Без категорії»
count, the статок reads and the зведення прогресу. It SHALL reuse an answer only when no write can
have been committed since that answer was read. A
write through any repository, through a restore, or through another opening of the same storage
(such as the фоновий прогін or the Drive бекап) SHALL make the next answer reflect it. That holds
even when the write commits while the earlier answer was being read. A read taken while a write is
still in progress on the app's own opening SHALL NOT be remembered for later. So no answer SHALL
ever be older than the last committed write, or contain a write that was rolled back. Nothing
about an answer SHALL be stored: it lives only as long as the app's process, and a caller SHALL
NOT be able to change an answer another caller will receive. The app's own журнал, which records
every screen opened, holds nothing any of these answers is made from. A журнал entry written in the
app SHALL therefore not cause any of them to be read again.

#### Scenario: A second read with nothing written in between reads nothing again

- **WHEN** the whole history is read, nothing is written, and it is read again
- **THEN** the second answer equals the first and no stored транзакція is read to produce it

#### Scenario: A транзакція saved in between is in the next answer

- **WHEN** the whole history is read, a витрата is saved, and the history is read again
- **THEN** the second answer contains that витрата and its рахунок's розрахунковий баланс is lower by
  its amount

#### Scenario: A removal, a recategorisation and a restore are all seen

- **WHEN** after a read a транзакція is removed, another gets a different категорія, two рахунки
  are merged, or a бекап is restored
- **THEN** the next read reflects each of them exactly as a fresh read of storage would

#### Scenario: A write committed by the background opening is seen on the next read

- **WHEN** the history is read in the app, and another opening of the same storage commits a
  транзакція, as a фоновий прогін does
- **THEN** the app's next read contains that транзакція

#### Scenario: A write committed by the background opening during a read is seen on the next read

- **WHEN** another opening of the same storage commits a транзакція after the app has started a read
  but before that read has finished
- **THEN** the app's next read contains that транзакція

#### Scenario: A write that was rolled back changes nothing

- **WHEN** after a read a write starts and is rolled back
- **THEN** the next read equals the previous one

#### Scenario: A read taken inside a write that is then rolled back is not remembered

- **WHEN** a read is taken while a write on the app's own opening is in progress, and that write is
  rolled back
- **THEN** the next read does not contain what was rolled back

#### Scenario: The «Без категорії» count and the статок reads follow a write

- **WHEN** the «Без категорії» count and the статок are read, a транзакція is recategorised out of
  «Без категорії», and both are read again
- **THEN** the count is one lower and the статок equals a fresh read

#### Scenario: A журнал entry between two reads does not cause a re-read

- **WHEN** the whole history is read, the owner opens another screen (the журнал records it), and the
  history is read again
- **THEN** the second answer equals the first and no stored транзакція is read to produce it

#### Scenario: One caller cannot change another caller's answer

- **WHEN** a caller tries to change the list, a balance or a транзакція in an answer it received
- **THEN** the change is refused and the next caller receives the answer as storage gave it

### Requirement: Balances read between writes equal balances from the whole history

The розрахунковий баланс served for each рахунок SHALL equal, in minor units and currency, the
opening balance plus every stored транзакція's effect on that рахунок. A переказ counts on both of
its legs, each in its own currency, and once on a рахунок it both leaves and reaches. Balances
SHALL never be summed across currencies. A balance that is not a safe integer SHALL be refused,
exactly as a fresh computation would refuse it. The refusal SHALL reach only a reader that asked
for balances, not a reader that asked only for the history or the months.

#### Scenario: Served balances agree with a fresh computation over any history

- **WHEN** any generated set of рахунки is stored (including an archived рахунок and a рахунок-борг)
  with транзакції: витрати, доходи, перекази across currencies and onto the same рахунок,
  повернення, коригування, інвестиції, комісії
- **THEN** every рахунок's served розрахунковий баланс equals the one computed from its opening
  balance and the whole history

#### Scenario: A переказ between currencies moves each leg in its own currency

- **WHEN** a переказ leaves 4 000.00 UAH from a картка and arrives as 100.00 USD on a USD рахунок
- **THEN** the картка's served balance falls by 400000 UAH minor units and the USD рахунок's rises
  by 10000 USD minor units

#### Scenario: A balance beyond the safe range is refused only to readers of balances

- **WHEN** stored транзакції would take one рахунок's balance beyond the safe-integer range
- **THEN** asking for balances is refused as a fresh computation would be, and asking for the whole
  history or its months still succeeds

### Requirement: Category lookups and the newest-first order are served by an index

Storage SHALL keep an index over the транзакції's категорія and an index over the newest-first
order (date, then recording moment, then identity). The «Без категорії» count and any listing in
the newest-first order SHALL therefore be answered without scanning or sorting the whole table.
Both indexes SHALL arrive by a new append-only migration that keeps every stored row.

#### Scenario: The «Без категорії» count uses the категорія index

- **WHEN** storage is asked how many транзакції are «Без категорії»
- **THEN** the query plan searches the категорія index rather than scanning every транзакція

#### Scenario: The latest транзакції are listed without a sort pass

- **WHEN** storage lists the latest транзакції newest first
- **THEN** the query plan walks the order index and builds no temporary sort

#### Scenario: The migration keeps every stored транзакція

- **WHEN** a database holding транзакції at the previous migration is brought to the current one
- **THEN** every транзакція reads back unchanged and both indexes exist

### Requirement: The whole history can be read whatever the number of перекази

Reading the whole stored history SHALL succeed and mark every переказ that awaits its зустрічний
дохід, however many перекази are stored. The count of перекази SHALL never be bounded by how many
values a single storage query can carry.

#### Scenario: More перекази than one query can name are still read

- **WHEN** more перекази are stored than a single storage query can carry as values, and one of
  them awaits its зустрічний дохід
- **THEN** the whole history reads back complete and exactly that переказ is marked as awaiting
