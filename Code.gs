/** Webová evidence propustek. Projekt připojte k cílové Tabulce Google. */
const SHEET_NAME = 'Propustky';
const LEGACY_HEADERS = ['Čas podání', 'E-mail', 'Datum odchodu', 'Důvod', 'Stav', 'ID žádosti'];
const HEADERS = [...LEGACY_HEADERS, 'Čas odchodu Od', 'Čas odchodu Do', 'Notifikace'];
const NOTIFICATION_EMAIL = 'kami.valek@gmail.com';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Propustky · Nová žádost').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Spusťte jednou z editoru; uloží ID tabulky pro webové nasazení. */
function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Otevřete Apps Script z cílové Tabulky Google přes Rozšíření.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    prepareSheet_(spreadsheet);
    SpreadsheetApp.flush();
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
    MailApp.getRemainingDailyQuota(); // Vyžádá autorizaci pošty bez odeslání zprávy.
    if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'retryNotifications')) {
      ScriptApp.newTrigger('retryNotifications').timeBased().everyMinutes(5).create();
    }
  } finally {
    lock.releaseLock();
  }
}

function prepareSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#e5eee5');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 175);
    sheet.setColumnWidth(2, 240);
    sheet.setColumnWidth(3, 140);
    sheet.setColumnWidth(4, 360);
    sheet.setColumnWidth(6, 280);
  } else {
    const actual = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    if (LEGACY_HEADERS.every((value, index) => value === actual[index]) && actual.slice(6).every(value => !value)) {
      sheet.getRange(1, 7, 1, 3).setValues([HEADERS.slice(6)]);
    } else if (!HEADERS.every((value, index) => value === actual[index])) {
      throw new Error('List Propustky má jinou strukturu. Přejmenujte jej a spusťte setup znovu; původní data zachovejte.');
    }
  }
  return sheet;
}

function validate_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Neplatný formulář.');
  const fields = ['email', 'date', 'reason', 'id', 'timeFrom', 'timeTo'];
  if (!fields.every(key => typeof payload[key] === 'string')) throw new Error('Vyplňte všechny údaje.');
  const data = {};
  fields.forEach(key => data[key] = payload[key].trim());
  if (data.email.length > 254 || !/^[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+$/.test(data.email)) {
    throw new Error('Zadejte platný e-mail.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error('Zadejte platné datum.');
  const parsed = new Date(data.date + 'T12:00:00Z');
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== data.date) throw new Error('Zadejte platné datum.');
  const today = Utilities.formatDate(new Date(), 'Europe/Prague', 'yyyy-MM-dd');
  if (data.date < today) throw new Error('Datum odchodu nesmí být v minulosti.');
  if (![data.timeFrom, data.timeTo].every(value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value))) throw new Error('Vyplňte čas Od a Do ve formátu HH:MM.');
  if (data.timeTo <= data.timeFrom) throw new Error('Čas Do musí být pozdější než čas Od ve stejný den.');
  if (data.reason.length < 3 || data.reason.length > 2000) throw new Error('Důvod musí mít 3 až 2000 znaků.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.id)) throw new Error('Neplatné ID žádosti. Obnovte stránku.');
  return data;
}

/** Zabrání interpretaci vstupu zaměstnance jako vzorce. */
function safeText_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function submitRequest(payload) {
  let data;
  try { data = validate_(payload); }
  catch (error) { return { saved: false, error: error.message, retry: false }; }
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Správce musí nejprve spustit funkci setup.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Aplikace je právě vytížená. Zkuste odeslání znovu.');
  try {
    const sheet = prepareSheet_(SpreadsheetApp.openById(spreadsheetId));
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
      const existing = ids.findIndex(row => row[0] === data.id);
      if (existing !== -1) {
        const previous = sheet.getRange(existing + 2, 2, 1, 3).getValues()[0];
        const expected = [data.email, data.date, data.reason];
        if (!expected.every((value, index) => previous[index] === value || previous[index] === safeText_(value))) {
          throw new Error('Toto ID již patří jiné žádosti. Obnovte stránku.');
        }
        const previousTimes = sheet.getRange(existing + 2, 7, 1, 2).getValues()[0];
        if (previousTimes[0] !== data.timeFrom || previousTimes[1] !== data.timeTo) throw new Error('Toto ID již patří jiné žádosti. Obnovte stránku.');
        notifyRow_(sheet, existing + 2, spreadsheetId);
        return { id: data.id, saved: true };
      }
    }
    const timestamp = Utilities.formatDate(new Date(), 'Europe/Prague', 'yyyy-MM-dd HH:mm:ss');
    const range = sheet.getRange(lastRow + 1, 1, 1, HEADERS.length);
    range.setNumberFormat('@');
    range.setValues([[timestamp, safeText_(data.email), data.date, safeText_(data.reason), 'Nová', data.id, data.timeFrom, data.timeTo, 'Čeká']]);
    range.setWrap(true);
    SpreadsheetApp.flush();
    notifyRow_(sheet, lastRow + 1, spreadsheetId);
    return { id: data.id, saved: true };
  } catch (error) {
    // Do not expose account identifiers or Google exception details to employees.
    if (error.message === 'Toto ID již patří jiné žádosti. Obnovte stránku.') throw error;
    throw new Error('Uložení se nepodařilo potvrdit. Zkuste odeslání znovu; stejné podání se neuloží dvakrát. Pokud chyba trvá, kontaktujte správce.');
  } finally {
    lock.releaseLock();
  }
}


/** Selhání e-mailu nesmí zpochybnit úspěšně uloženou žádost. */
function notifyRow_(sheet, rowNumber, spreadsheetId) {
  const row = sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0];
  if (row[8] !== 'Čeká') return;
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    const url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit';
    MailApp.sendEmail({
      to: NOTIFICATION_EMAIL,
      subject: 'Nový požadavek na propustku — ' + row[2] + ' ' + row[6] + '–' + row[7],
      body: 'Do evidence byla vložena nová žádost o propustku.\n\n' +
        'E-mail: ' + row[1] + '\nDatum: ' + row[2] + '\nČas Od–Do: ' + row[6] + '–' + row[7] +
        '\nDůvod: ' + row[3] + '\nID žádosti: ' + row[5] + '\n\nOtevřít tabulku: ' + url,
      name: 'Evidence propustek'
    });
    sheet.getRange(rowNumber, 9, 1, 1).setValues([['Odesláno: ' + Utilities.formatDate(new Date(), 'Europe/Prague', 'yyyy-MM-dd HH:mm:ss')]]);
    SpreadsheetApp.flush();
  } catch (error) {
    console.warn('Notifikace čeká na opakování. Zkontrolujte autorizaci a kvótu MailApp.');
  }
}

function retryNotifications() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const sheet = prepareSheet_(SpreadsheetApp.openById(id));
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const states = sheet.getRange(2, 9, lastRow - 1, 1).getValues();
    for (let index = 0; index < states.length; index++) {
      if (states[index][0] === 'Čeká') notifyRow_(sheet, index + 2, id);
    }
  } finally { lock.releaseLock(); }
}
