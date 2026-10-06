## MODIFIED Requirements

### Requirement: A назва and a написання are proposed from an опис

For an опис, the system SHALL propose a назва and a написання as follows:

1. The опис is trimmed.
2. Only the longest of the bank's service words — «оплата послуг», «оплата товарів», «оплата»,
   «покупка», «списання», their Latin transliterations «oplata poslug», «oplata tovariv»,
   «oplata», «pokupka», «spysannia», «spysannya», and «payment», «purchase», «pos», compared with
   letter case folded — that the опис begins with is considered. When it is followed by whitespace
   or punctuation and then by anything else, that service word and what separates it are skipped.
   When nothing follows it, nothing is skipped. At most one service word is ever skipped.
3. When what remains then begins with the name of a payment processor — «liqpay», «wfp», «google»,
   «paypal», «fondy», «portmone», «ipay», «sumup», compared with letter case folded — followed by optional
   spaces and a «*», that name, those spaces, the «*» and any spaces after it are skipped, provided
   anything else follows.
4. When what remains begins with a letter, its leading run of letters and spaces, trimmed, is cut
   after its second word. The name is that text as the опис writes it, the spacing between its
   words included. When what remains begins with anything else, the whole of what remains is the
   name.
5. The написання is the name folded to lower case. The назва is the name as the опис writes it,
   except that every word written entirely in capitals and longer than three letters is written
   as a capital followed by lower case.

An опис made of a service word alone SHALL therefore propose that service word, since there is
nothing else to name. The написання proposed SHALL always occur in the опис it was proposed from,
beginning where a word begins. A транзакція carrying no опис SHALL be proposed nothing. The
proposal SHALL be only an offer: what is stored is what the owner accepts, validated as any
продавець is.

#### Scenario: Service words, a hyphenated suffix and a branch number fall away

- **WHEN** a продавець is proposed from the опис "Оплата послуг АТБ-Маркет 1234 Київ"
- **THEN** the proposed назва is «АТБ» and the proposed написання is "атб"

#### Scenario: A word in capitals is written as a name

- **WHEN** a продавець is proposed from the опис "СІЛЬПО 123 Київ, вул. Хрещатик"
- **THEN** the proposed назва is «Сільпо» and the proposed написання is "сільпо"

#### Scenario: Two words at most

- **WHEN** a продавець is proposed from the опис "Нова Пошта відділення 5"
- **THEN** the proposed назва is «Нова Пошта» and the proposed написання is "нова пошта"

#### Scenario: A Latin service word is skipped

- **WHEN** a продавець is proposed from the опис "PAYMENT UKLON"
- **THEN** the proposed назва is «Uklon» and the proposed написання is "uklon"

#### Scenario: A transliterated service word is skipped

- **WHEN** a продавець is proposed from the опис "Oplata poslug MEGOGO 1234"
- **THEN** the proposed назва is «Megogo» and the proposed написання is "megogo"

#### Scenario: A payment processor's prefix is skipped

- **WHEN** a продавець is proposed from the опис "LIQPAY*Blahodiyna Orha"
- **THEN** the proposed назва is «Blahodiyna Orha» and the proposed написання is "blahodiyna orha"

#### Scenario: A processor prefix written with a space before the star is skipped

- **WHEN** a продавець is proposed from the опис "GOOGLE *YouTube Premium"
- **THEN** the proposed назва is «YouTube Premium» and the proposed написання is "youtube premium"

#### Scenario: Spaces after a processor's star are skipped too

- **WHEN** a продавець is proposed from the опис "GOOGLE * YouTube Premium"
- **THEN** the proposed назва is «YouTube Premium» and the proposed написання is "youtube premium"

#### Scenario: A star after a name that is not a processor is not a prefix

- **WHEN** a продавець is proposed from the опис "Uklon *trip"
- **THEN** the proposed назва is «Uklon» and the proposed написання is "uklon"

#### Scenario: An опис that starts with no letter proposes the whole of itself

- **WHEN** a продавець is proposed from the опис "7-Eleven Kyiv"
- **THEN** the proposed назва is «7-Eleven Kyiv» and the proposed написання is "7-eleven kyiv"

#### Scenario: A service word alone proposes itself

- **WHEN** a продавець is proposed from the опис "Оплата"
- **THEN** the proposed назва is «Оплата» and the proposed написання is "оплата"

#### Scenario: A longer service word alone is not cut down to a shorter one

- **WHEN** a продавець is proposed from the опис "Оплата послуг"
- **THEN** the proposed назва is «Оплата послуг» and the proposed написання is "оплата послуг"

#### Scenario: A transliterated service word alone proposes itself too

- **WHEN** a продавець is proposed from the опис "Oplata poslug"
- **THEN** the proposed назва is «Oplata poslug» and the proposed написання is "oplata poslug"

#### Scenario: The spacing the bank wrote is kept

- **WHEN** a продавець is proposed from the опис "Нова  Пошта відділення 5", with two spaces
  between the first two words
- **THEN** the proposed написання is "нова  пошта", which occurs in that опис

#### Scenario: No опис, no proposal

- **WHEN** a продавець is proposed for a транзакція carrying no опис
- **THEN** nothing is proposed

### Requirement: An опис is recognised as at most one продавець

An опис SHALL be recognised as the продавець holding the longest написання that occurs in it,
once the опис is folded to lower case, **beginning where a word begins**: at the start of the опис
or right after a character that is neither a letter nor a digit. A написання that occurs only
inside a word SHALL NOT recognise the опис. A написання that itself starts with a character that is
neither a letter nor a digit («*megogo», «-маркет») SHALL recognise the опис wherever it occurs: its
own first character is the boundary. Letter case SHALL be the only thing
folded. A написання in one script SHALL NOT recognise an опис written in another, because the owner
writes a написання by looking at the описи their bank actually sends. So a продавець the bank
spells in both scripts carries both. When two написання of equal length occur, the one added most
recently SHALL decide. An опис in which no написання occurs SHALL be recognised as no продавець,
and a транзакція carrying no опис SHALL have no продавець.

Recognition SHALL read the опис of a транзакція of any type, and SHALL give one answer to one опис
everywhere in the app.

#### Scenario: A spelling with a branch number and a city is recognised

- **WHEN** «АТБ» holds the написання "атб" and a витрата carries the опис "Оплата послуг АТБ-Маркет
  1234 Київ"
- **THEN** that витрата's продавець is «АТБ»

#### Scenario: A написання inside another word recognises nothing

- **WHEN** «Коло» holds the написання "коло" and a витрата carries the опис "НАВКОЛО маркет"
- **THEN** that витрата has no продавець

#### Scenario: A написання after punctuation begins a word

- **WHEN** «Megogo» holds the написання "megogo" and a витрата carries the опис "WFP*MEGOGO.NET"
- **THEN** that витрата's продавець is «Megogo»

#### Scenario: A написання that starts with punctuation is recognised wherever it occurs

- **WHEN** «Megogo» holds the написання "*megogo" and a витрата carries the опис "WFP*MEGOGO.NET"
- **THEN** that витрата's продавець is «Megogo» — the написання's own «*» is where its word begins

#### Scenario: Both scripts are recognised when both are written

- **WHEN** «АТБ» holds the написання "атб" and "atb", and two витрати carry the описи "АТБ 12" and
  "ATB MARKET"
- **THEN** both витрати have the продавець «АТБ»

#### Scenario: No transliteration between scripts

- **WHEN** «АТБ» holds only the написання "атб" and a витрата carries the опис "ATB MARKET"
- **THEN** that витрата has no продавець

#### Scenario: The longest написання wins

- **WHEN** «Bolt» holds "bolt", «Bolt Food» holds "bolt food", and a витрата carries the опис "BOLT
  FOOD 3411"
- **THEN** that витрата's продавець is «Bolt Food»

#### Scenario: A tie goes to the newest написання

- **WHEN** «Кава» holds the написання "кава", «Зерно» is named later with the написання "зерн" of
  the same length, and a витрата carries the опис "КАВА ЗЕРНО" in which both occur
- **THEN** that витрата's продавець is «Зерно»

#### Scenario: A транзакція without an опис has no продавець

- **WHEN** a витрата recorded by hand carries no опис
- **THEN** it has no продавець

#### Scenario: A повернення and a дохід are recognised too

- **WHEN** «Rozetka» holds "rozetka", a повернення carries the опис "ROZETKA повернення" and a дохід
  carries the опис "Rozetka кешбек"
- **THEN** both have the продавець «Rozetka», the повернення is still a повернення in its
  категорія and the дохід is still a дохід with its джерело

### Requirement: A продавець is named from an опис no продавець recognises

Naming a продавець from an опис SHALL be possible only for an опис recognised as no продавець. It
SHALL either store a new продавець with a назва and one написання, or add one написання to a
продавець that already exists. In both cases the написання SHALL occur in that опис once both are
folded to lower case, **beginning where a word begins** exactly as recognition reads it. A
написання that does not occur in it that way SHALL be refused, because naming exists to make that
опис recognised. Once naming is stored, that опис SHALL be recognised as the продавець it named.

#### Scenario: A new продавець from an опис

- **WHEN** the опис "ЗЕРНО 12" is recognised as no продавець and the owner names it «Зерно»
  with the написання "зерно"
- **THEN** «Зерно» exists with the написання "зерно", and that опис is recognised as «Зерно»

#### Scenario: A spelling added to an existing продавець

- **WHEN** «АТБ» holds "атб", the опис "ATB MARKET 23" is recognised as no продавець, and the owner
  adds the написання "atb market" from it to «АТБ»
- **THEN** «АТБ» holds "атб" and "atb market", and that опис is recognised as «АТБ»

#### Scenario: A написання that is not in the опис is refused

- **WHEN** the owner names the опис "ATB MARKET 23" with the написання "атб"
- **THEN** it is refused and nothing is stored

#### Scenario: A написання inside a word of the опис is refused

- **WHEN** the owner names the опис "ZOOMAGAZIN" with the написання "magazin"
- **THEN** it is refused and nothing is stored, because that опис would still be recognised as no
  продавець

#### Scenario: A написання that starts with punctuation is accepted

- **WHEN** the owner names the опис "WFP*MEGOGO.NET" «Megogo» with the написання "*megogo"
- **THEN** «Megogo» exists with the написання "*megogo", and that опис is recognised as «Megogo»
