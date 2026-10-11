# Propustky

Mini aplikace pro evidenci krátkodobého uvolnění z pracoviště. Zaměstnanec zadá
e-mail, datum a důvod. Aplikace uloží žádost do SQLite a odešle ji na
**kamil.valek@ub.cz**. Za **10 minut od úspěšného odeslání tohoto e-mailu**
automaticky odešle zaměstnanci přesně:

> OK, souhlasím/schvaluji. S pozdravem Kamil Válek

Schválení probíhá automaticky, bez ručního zásahu. Formulář zobrazuje stav
odesílání. SMTP přijetí zprávy nepotvrzuje její doručení do schránky.

## Spuštění

Python 3.12 nebo novější. Nejsou potřeba žádné externí balíčky.

```sh
cd /workspace/kamilvalek
python3 app.py
```

Server standardně poslouchá na `127.0.0.1:8000`. SMTP server `mail.ub.cz`
je dostupný pouze z firemní sítě a vyžaduje přihlášení. Aplikaci tedy provozujte
na stroji s přístupem do této sítě.

### Samostatný dokument s přihlášením

Zkopírujte `smtp.example.json` do `smtp.local.json` vedle `app.py` a vyplňte
`username` a `password`. Jde o běžný textový dokument ve formátu JSON;
upravte jej textovým editorem. `smtp.local.json` je vyloučen z Gitu a webový
server jej nezpřístupňuje. Vzor obsahuje prázdné přihlašovací údaje.

```sh
cp smtp.example.json smtp.local.json
chmod 600 smtp.local.json
```

Dokument uchovává heslo v čitelné podobě: omezte přístup k souboru na účet
aplikace, neposílejte jej do repozitáře ani chatu. JSON vyžaduje escapování
uvozovek a zpětných lomítek v hesle. Pro soubor mimo checkout nastavte
`SMTP_CONFIG_FILE=/bezpecna/cesta/smtp.json`. Konfigurace se načítá při odesílání,
změna údajů nevyžaduje restart. Při chybějícím nebo neplatném dokumentu a bez
úplné konfigurace aplikace nepřijímá nové žádosti.

Port **587 / STARTTLS** ve vzoru je výchozí návrh, nikoli ověřené nastavení
firemního serveru. Potvrďte port u správce; pro **465 / TLS** nastavte
`port` na `465` a `security` na `ssl`. Nešifrované přihlášení není podporováno.

Alternativně nastavte proměnné prostředí; každá má přednost před odpovídající
hodnotou v dokumentu:

| Proměnná | Účel |
| --- | --- |
| `SMTP_HOST` | Adresa SMTP serveru |
| `SMTP_FROM` | Adresa odesílatele povolená poskytovatelem |
| `SMTP_PORT` | Standardně 587, pro SSL 465 |
| `SMTP_SECURITY` | `starttls` (výchozí) nebo `ssl`; TLS ověřování je povinné |
| `SMTP_CONFIG_FILE` | Cesta k samostatnému JSON dokumentu |
| `SMTP_USER` | Povinné přihlašovací jméno |
| `SMTP_PASSWORD` | Heslo nebo aplikační heslo; zadávejte přes správu tajných hodnot hostitele |
| `HOST`, `PORT` | Volitelné nastavení HTTP serveru |
| `DATABASE_PATH` | Volitelná cesta k SQLite databázi; výchozí `data/requests.sqlite3` |

`.env.example` je vzor, aplikace `.env` automaticky nenačítá. Bez úplné SMTP konfigurace
je dostupný formulář, ale server nepřijímá nové žádosti. Neodesílá fiktivní e-maily.
Skutečný odesílatel je `SMTP_FROM`; podpis Kamil Válek je v těle zprávy.

## Ověření

```sh
python3 -m unittest -v
curl --fail http://127.0.0.1:8000/api/health
```

Testy ověřují obsah a adresáty e-mailů, přesnou desetiminutovou lhůtu pomocí
simulovaného času, obnovu fronty po restartu, opakování při výpadku a validaci.
Neodesílají skutečné e-maily. Pro ověření skutečné poštovní služby je po nastavení
SMTP potřeba odeslat žádost a zkontrolovat obě schránky.

## Provoz a evidence

SQLite uchovává adresu, datum, důvod a časy odeslání; zálohujte databázi a chraňte
ji jako osobní údaje. Stav konkrétní žádosti je dostupný přes náhodné UUID,
API nezpřístupňuje seznam zaměstnanců ani jejich důvody. Úplná evidence je zatím
v databázi, aplikace nemá přihlášení ani administrační přehled.

Pro zaměstnance ji provozujte za firemním přihlášením, HTTPS a omezením počtu
požadavků na reverzní proxy. Vestavěný HTTP server je určen pro malý interní provoz.
Spouštějte **jednu instanci** nad jednou databází a udržujte ji nepřetržitě běžící.
Proces i databáze musí mít trvalé umístění; server se uspáváním nezaručí desetiminutový termín.
Po výpadku aplikace odešle zpožděné zprávy po obnovení. Při chybě SMTP se opakování
provádí za 30 sekund až 15 minut. Přesnost lhůty závisí na dostupnosti serveru a SMTP.
Pád mezi přijetím zprávy SMTP serverem a zápisem do databáze může způsobit
duplicitní e-mail; SMTP neposkytuje záruku právě jednoho doručení.
