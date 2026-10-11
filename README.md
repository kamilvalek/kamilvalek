# Propustky → Tabulky Google

Formulář uloží e-mail zaměstnance, datum a důvod odchodu do tabulky na vašem
Google Disku. Každá žádost má čas podání (Europe/Prague), stav **Nová** a vlastní ID.
Potvrzení se zobrazí až po úspěšném zápisu. Správce může stav upravovat přímo v tabulce.
Tato verze nahrazuje původní e-mailovou aplikaci; neodesílá e-maily ani automaticky
neschvaluje žádosti po 10 minutách. Běží přímo v Googlu, nepotřebuje Python,
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
   k tabulkám. Povolujte pouze projekt, který jste právě vytvořili z těchto souborů.
   Pokud firemní politika autorizaci blokuje, obraťte se na správce Google Workspace.
3. Počkejte na dokončení bez chyby. V tabulce se objeví list **Propustky** s hlavičkou:

   | Čas podání | E-mail | Datum odchodu | Důvod | Stav | ID žádosti |
   | --- | --- | --- | --- | --- | --- |

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
2. Zadejte svůj e-mail, dnešní nebo budoucí datum a důvod **Test aplikace**.
3. Klikněte na **Uložit žádost**. Počkejte na potvrzení a číslo žádosti.
4. Vraťte se do tabulky, otevřete list **Propustky** a ověřte nový řádek se všemi údaji.
5. Vyzkoušejte formulář i z účtu zaměstnance, abyste ověřili přístupová práva.
6. Testovací řádek můžete potom smazat.

Potvrzení **Žádost je uložena** znamená zápis do tabulky, nikoli schválení odchodu.
Zaměstnanec nevidí ostatní žádosti. E-mail z formuláře je zadaná kontaktní adresa,
nikoli ověřená identita přihlášeného uživatele. Schválení evidujte úpravou sloupce
**Stav** například na **Schváleno** nebo **Zamítnuto**; tato úprava neodesílá upozornění.

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
vložením vzorce. Neověřují skutečnou autorizaci ani zápis do vašeho Disku. Ten je nutné
ověřit krokem 5 po nasazení pod vaším účtem.

## Původní data a soukromé soubory

Původní `smtp.local.json` a `data/requests.sqlite3` nová verze nepoužívá ani nemaže.
Existující žádosti se do Googlu automaticky nepřenesou. Novou verzi rozbalte do nové
složky, původní databázi zachovejte jako zálohu. SMTP heslo není pro tuto verzi potřeba.
Tabulku s důvody odchodů sdílejte pouze s oprávněnými správci.
