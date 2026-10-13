# Propustky → Tabulky Google

Formulář uloží e-mail zaměstnance, datum, čas Od–Do a důvod odchodu do tabulky na vašem
Google Disku. Každá žádost má čas podání (Europe/Prague), stav **Nová** a vlastní ID.
Potvrzení se zobrazí až po úspěšném zápisu. Správce může stav upravovat přímo v tabulce.
Po každém novém podání odešle notifikaci na **kami.valek@gmail.com** pomocí Google MailApp.
Žádosti automaticky neschvaluje. Běží přímo v Googlu, nepotřebuje Python,
SMTP server ani zapnutý pracovní počítač.

## První nastavení krok za krokem

### 1. Vytvořte tabulku

1. Přihlaste se do Google účtu, na jehož Disk chcete evidenci ukládat.
2. Otevřete https://sheets.google.com a klikněte na **Prázdná tabulka**.
3. Klikněte na název vlevo nahoře a pojmenujte tabulku **Evidence propustek**.
4. Sloupce ručně nevytvářejte. Aplikace připraví vlastní list **Propustky**.
   Výchozí prázdný list můžete ponechat.

### 2. Vložte aplikaci

1. Stáhněte aktuální soubory z https://github.com/kamilvalek/kamilvalek:
   **Code → Download ZIP** a archiv rozbalte.
2. V nové tabulce otevřete **Rozšíření → Apps Script**.
3. Projekt pojmenujte **Propustky**.
4. V editoru otevřete výchozí soubor `Kód.gs` / `Code.gs`, smažte pouze jeho
   výchozí ukázkový obsah a vložte **celý obsah souboru Code.gs z repozitáře**.
   Soubor si můžete otevřít v Poznámkovém bloku; případně na GitHubu klikněte
   na Code.gs a tlačítko pro kopírování obsahu.
5. Vedle sekce **Soubory** klikněte na **+ → HTML**. Zadejte název **Index**
   (bez přípony). Editor vytvoří `Index.html`.
6. Nahraďte jeho ukázkový obsah **celým obsahem Index.html z repozitáře**.
7. Uložte projekt pomocí **Ctrl+S** nebo tlačítka pro uložení.

### 3. Propojte projekt s tabulkou

1. V horním seznamu funkcí vyberte **setup** a klikněte na **Spustit**.
2. Google požádá o autorizaci. Vyberte svůj účet a povolte projektu přístup
   k tabulkám, odesílání e-mailů a vytváření časových spouštěčů. Povolujte pouze projekt, který jste právě vytvořili z těchto souborů.
   Pokud firemní politika autorizaci blokuje, obraťte se na správce Google Workspace.
3. Počkejte na dokončení bez chyby. V tabulce se objeví list **Propustky** s hlavičkou:

   | Čas podání | E-mail | Datum odchodu | Důvod | Stav | ID žádosti | Čas odchodu Od | Čas odchodu Do | Notifikace |
   | --- | --- | --- | --- | --- | --- | --- | --- | --- |

4. Tabulka zůstává na vašem Google Disku. `setup` lze opakovat; nevymaže již uložené
   žádosti. Pokud máte list Propustky s jinou strukturou, přejmenujte ho, aby aplikace
   mohla vytvořit svůj vlastní. Hlavičku aplikačního listu neměňte.

### 4. Zpřístupněte formulář zaměstnancům

1. V Apps Scriptu klikněte na **Nasadit → Nové nasazení**.
2. U výběru typu (ikona ozubeného kola) vyberte **Webová aplikace**.
3. Popis může být například **Evidence propustek — první verze**.
4. **Spustit jako / Execute as:** vyberte **Já**, tedy vlastníka tabulky.
   Zaměstnanci pak nepotřebují právo zapisovat do tabulky.
5. **Kdo má přístup:** ve firemním Google Workspace zvolte pouze uživatele vaší
   organizace, pokud je tato možnost dostupná. U osobního účtu bývá dostupná volba
   přihlášených uživatelů Google. Ta však umožňuje podání každému přihlášenému,
   kdo zná odkaz; neomezuje přístup na zaměstnance. Pro skutečnou firemní evidenci
   nejprve zajistěte vhodné omezení přístupu s IT. Formulář nezveřejňujte anonymně.
6. Klikněte na **Nasadit**, případně dokončete požadovanou autorizaci.
7. Zkopírujte adresu **Webové aplikace**, která končí `/exec`.
   To je adresa formuláře. Zaměstnancům neposílejte odkaz editoru Apps Scriptu ani
   soukromé tabulky. HTML soubor otevřený samostatně na počítači nebude ukládat data.

### 5. Ověřte skutečný zápis

1. Otevřete získanou adresu `/exec` a případně se přihlaste do Google účtu.
2. Zadejte svůj e-mail, dnešní nebo budoucí datum, čas Od–Do (například 09:00–10:30) a důvod **Test aplikace**.
3. Klikněte na **Uložit žádost**. Počkejte na potvrzení a číslo žádosti.
4. Vraťte se do tabulky, otevřete list **Propustky** a ověřte nový řádek se všemi údaji.
5. Zkontrolujte doručení oznámení do **kami.valek@gmail.com**, včetně nevyžádané pošty.
6. Vyzkoušejte formulář i z účtu zaměstnance, abyste ověřili přístupová práva.
7. Testovací řádek můžete potom smazat.

Potvrzení **Žádost je uložena** znamená zápis do tabulky, nikoli schválení odchodu.
Zaměstnanec nevidí ostatní žádosti. E-mail z formuláře je zadaná kontaktní adresa,
nikoli ověřená identita přihlášeného uživatele. Schválení evidujte úpravou sloupce
**Stav** například na **Schváleno** nebo **Zamítnuto**; tato úprava neodesílá upozornění.

## Aktualizace existující verze na čas Od–Do a notifikace

1. V původním Apps Script projektu nahraďte obsahy `Code.gs` a `Index.html` aktuálními soubory.
2. Uložte a spusťte **setup**. Povolte nově požadované odesílání e-mailů a spouštěče.
3. Funkce doplní tři sloupce za původních šest. Staré řádky i ruční stavy zachová;
   u starých žádostí budou časy prázdné a neodešlou se zpětné notifikace.
4. Vytvoří se jeden spouštěč `retryNotifications` každých přibližně 5 minut.
   Opakované spuštění setup nevytváří další stejné spouštěče.
5. Aktualizujte nasazení postupem níže. Nestačí pouze změnit soubory v editoru.
6. Odešlete nový test a ověřte časové údaje i skutečné doručení e-mailu.

## Notifikace a plánování

Notifikaci odesílá Google účet vlastníka aplikace (nikoli původní SMTP server).
Příjemce je `kami.valek@gmail.com`, nastavený v konstantě `NOTIFICATION_EMAIL` v Code.gs.
Zpráva obsahuje datum, časy, e-mail zaměstnance, důvod, ID žádosti a odkaz na tabulku.
Její příjemce musí mít právo tabulku otevřít; aplikace sama sdílení nemění.
Google MailApp podléhá denním kvótám účtu a pravidlům organizace.

Sloupec **Notifikace** obsahuje **Čeká** nebo **Odesláno: čas**. Odesláno znamená,
že Google přijal požadavek na odeslání, ne potvrzení doručení do schránky.
Při chybě zůstane žádost uložená a časový spouštěč zkusí odeslání znovu.
Při vyčerpání denní kvóty čeká do její obnovy. Stejné úspěšné podání se při opakování
běžně neoznamuje znovu. Vzácný pád mezi odesláním e-mailu a zápisem stavu může způsobit
opakovanou notifikaci; MailApp neposkytuje záruku právě jednoho odeslání.

Časy jsou povinné a vztahují se ke stejnému dni. Interval přes půlnoc zatím není
podporován. Formulář zobrazuje délku plánované nepřítomnosti. Zobrazení pro mobil
má větší ovládací prvky a písmo, jedno hlavní sloupcové rozložení a dvě časová pole
vedle sebe. Apps Script nastavuje viewport i pro svůj mobilní obal.

Další možná vylepšení: týdenní přehled nepřítomností, filtrování podle oddělení,
upozornění na souběh více nepřítomností, nabídka stavů Schváleno/Zamítnuto a
ověřená identita zaměstnance místo ručně zadávaného e-mailu.

## Aktualizace již nasazené aplikace

Po změně souborů v editoru je nestačí uložit. Otevřete **Nasadit → Spravovat nasazení**,
vyberte webovou aplikaci, klikněte na úpravu (tužka), vyberte **Nová verze** a znovu
nasaďte. Adresa stávajícího nasazení se zachová.

## Pokud se zápis nedaří

- „Správce musí nejprve spustit funkci setup“: spusťte setup v projektu připojeném
  ke správné tabulce a dokončete autorizaci.
- Formulář hlásí, že je potřeba adresa webové aplikace: otevřeli jste soubor HTML
  přímo. Použijte adresu `/exec` z nasazení.
- Přístup odepřen: zkontrolujte Google účet, nastavení přístupu při nasazení a
  omezení firemního Google Workspace.
- „Uložení se nepodařilo potvrdit“: zkuste stejnou žádost znovu. Stejné ID aplikace
  neuloží dvakrát. Správce zkontroluje přístup k tabulce, její existenci a hlavičku.
- Při chybě spojení neměňte obsah rozpracované žádosti před opakováním. Pokud stránku
  obnovíte, před novým podáním zkontrolujte tabulku; předchozí zápis už mohl proběhnout.

## Technické ověření

```sh
node --test test_google.cjs
```

Testy používají simulované služby Google: ověřují obsah řádků, validaci, opakování
bez duplicit, obnovu po ztraceném potvrzení, zámek souběžných zápisů a ochranu před
vložením vzorce. Nové testy také ověřují notifikace, opakování při chybě pošty a zachování původních řádků.
Neověřují skutečné doručení e-mailu, autorizaci ani zápis do vašeho Disku. Ten je nutné
ověřit krokem 5 po nasazení pod vaším účtem.

## Původní data a soukromé soubory

Původní `smtp.local.json` a `data/requests.sqlite3` nová verze nepoužívá ani nemaže.
Existující žádosti se do Googlu automaticky nepřenesou. Novou verzi rozbalte do nové
složky, původní databázi zachovejte jako zálohu. SMTP heslo není pro tuto verzi potřeba.
Tabulku s důvody odchodů sdílejte pouze s oprávněnými správci.
