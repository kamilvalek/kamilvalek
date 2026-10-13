const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');

function fixture() {
  const rows = [];
  const properties = {}; const notes = {};
  let released = 0, flushed = 0, failFlush = false;
  const sheet = {
    getLastRow: () => rows.length,
    getRange(row, column, height, width) {
      return {
        setValues(values) {
          values.forEach((valuesRow, i) => {
            rows[row - 1 + i] ??= [];
            valuesRow.forEach((value, j) => rows[row - 1 + i][column - 1 + j] = value);
          });
          return this;
        },
        getValues() { return Array.from({length:height}, (_, i) => (rows[row - 1 + i] || []).slice(column - 1, column - 1 + width)); },
        setNote(value) {notes[row + ':' + column] = value; return this;},
        setNumberFormat(value) { assert.equal(value, '@'); return this; },
        setFontWeight() { return this; }, setBackground() { return this; }, setWrap() { return this; }
      };
    },
    setFrozenRows() {}, setColumnWidth() {}
  };
  let created = false;
  const spreadsheet = {getId: () => 'test-sheet-id', getSheetByName: () => created ? sheet : null, insertSheet: () => { created = true; return sheet; }};
  const mails = []; let mailFails = false; const triggers = [];
  const context = vm.createContext({
    console: {warn() {}, log() {}},
    Session: {getActiveUser: () => ({getEmail: () => 'owner@example.cz'}), getEffectiveUser: () => ({getEmail: () => 'owner@example.cz'})},
    MailApp: {getRemainingDailyQuota: () => 100, sendEmail(mail) {if(mailFails) throw new Error('mail failure'); mails.push(mail);}},
    ScriptApp: {getProjectTriggers: () => triggers, newTrigger: name => ({timeBased() {return this;}, everyMinutes() {return this;}, create() {triggers.push({getHandlerFunction: () => name});}})},
    SpreadsheetApp: {getActiveSpreadsheet: () => spreadsheet, openById(id) {assert.equal(id, 'test-sheet-id'); return spreadsheet;}, flush() {flushed++; if(failFlush) throw new Error('simulated Google failure');}},
    PropertiesService: {getScriptProperties: () => ({getProperty: key => properties[key], setProperty: (key, value) => properties[key] = value})},
    LockService: {getScriptLock: () => ({waitLock() {}, tryLock: () => true, releaseLock() {released++;}})},
    Utilities: {formatDate: (date, zone, format) => format === 'yyyy-MM-dd' ? '2026-10-11' : '2026-10-11 15:00:00'},
    HtmlService: {createHtmlOutputFromFile(name) {assert.equal(name, 'Index'); return {setTitle: title => title};}}
  });
  vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), context);
  const payload = {email:'employee@example.cz', date:'2026-10-12', reason:'Návštěva lékaře', timeFrom:'09:00', timeTo:'10:30', id:'550e8400-e29b-41d4-a716-446655440000'};
  return {context, notes, mails, triggers, mailFails(value) {mailFails = value;}, rows, properties, payload, sheet, get released() {return released;}, get flushed() {return flushed;}, failFlush(value) {failFlush = value;}};
}

test('setup creates headers and binds the table, repeatedly without deleting rows', () => {
  const f = fixture(); f.context.setup(); f.context.setup();
  assert.equal(f.rows.length, 1); assert.equal(f.rows[0][1], 'E-mail');
  assert.equal(f.properties.SPREADSHEET_ID, 'test-sheet-id'); assert.equal(f.released, 2);
});
test('submits actual form fields to a new row and confirms only after flush', () => {
  const f = fixture(); f.context.setup(); const result = f.context.submitRequest(f.payload);
  assert.equal(result.saved, true); assert.equal(result.id, f.payload.id);
  assert.deepEqual(f.rows[1], ['2026-10-11 15:00:00', f.payload.email, f.payload.date, f.payload.reason, 'Nová', f.payload.id, '09:00', '10:30', 'Odesláno: 2026-10-11 15:00:00']);
  assert.equal(f.flushed, 3); assert.equal(f.released, 2);
});
test('retry with same ID creates no duplicate', () => {
  const f = fixture(); f.context.setup(); f.context.submitRequest(f.payload); f.context.submitRequest(f.payload);
  assert.equal(f.rows.length, 2);
});
test('conflicting submission ID cannot silently overwrite another request', () => {
  const f = fixture(); f.context.setup(); f.context.submitRequest(f.payload);
  assert.throws(() => f.context.submitRequest({...f.payload, reason:'Jiný důvod'}), /jiné žádosti/);
  assert.equal(f.rows.length, 2);
});
test('lost confirmation can be retried without adding another row', () => {
  const f = fixture(); f.context.setup(); f.failFlush(true);
  assert.throws(() => f.context.submitRequest(f.payload), /nepodařilo potvrdit/);
  f.failFlush(false); assert.equal(f.context.submitRequest(f.payload).saved, true);
  assert.equal(f.rows.length, 2); assert.equal(f.released, 3);
});
test('formula-like input is written as text', () => {
  const f = fixture(); f.context.setup(); f.context.submitRequest({...f.payload, reason:'=IMPORTXML("https://example.com","x")'});
  assert.equal(f.rows[1][3][0], "'");
  for (const prefix of ['=', '+', '-', '@']) assert.equal(f.context.safeText_(prefix + 'abc'), "'" + prefix + 'abc');
});
test('invalid data fails validation before writing', () => {
  const f = fixture(); f.context.setup();
  for (const changes of [{email:'bad'}, {email:'a@b.cz\r\nX: y'}, {date:'2026-02-30'}, {date:'2026-10-10'}, {date:'20261012'}, {reason:'  '}, {reason:'x'.repeat(2001)}, {id:'invalid'}, {email:123}, {timeFrom:'25:00'}, {timeTo:'09:00'}, {timeTo:'08:00'}]) {
    assert.throws(() => f.context.validate_({...f.payload, ...changes}));
  }
  assert.equal(f.rows.length, 1);
});
test('setup preserves a sheet with unexpected headers', () => {
  const f = fixture(); f.context.setup(); f.rows[0][0] = 'Existing important data';
  assert.throws(() => f.context.setup(), /jinou strukturu/);
  assert.equal(f.rows[0][0], 'Existing important data');
});
test('missing setup prevents writes', () => {
  const f = fixture(); assert.throws(() => f.context.submitRequest(f.payload), /setup/); assert.equal(f.rows.length, 0);
});
test('busy lock prevents a concurrent write', () => {
  const f = fixture(); f.context.setup();
  f.context.LockService.getScriptLock = () => ({tryLock: () => false});
  assert.throws(() => f.context.submitRequest(f.payload), /vytížená/); assert.equal(f.rows.length, 1);
});
test('form has valid JavaScript and invokes the Apps Script backend', () => {
  const html = fs.readFileSync('Index.html', 'utf8');
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(js); assert.match(js, /\.submitRequest\(/); assert.match(js, /result\.saved !== true/);
  assert.doesNotMatch(html, /SMTP|automatický souhlas|mailConfigured|api\/requests/i);
});

test('validation error allows editing without claiming a successful write', () => {
  const f = fixture(); f.context.setup();
  const result = f.context.submitRequest({...f.payload, reason:'  '});
  assert.equal(result.saved, false); assert.equal(result.retry, false);
  assert.match(result.error, /Důvod/); assert.equal(f.rows.length, 1);
});

test('notification has configured recipient, times and sheet link, only once on retry', () => {
 const f=fixture(); f.context.setup(); f.context.submitRequest(f.payload); f.context.submitRequest(f.payload);
 assert.equal(f.mails.length,1); assert.equal(f.mails[0].to,'kami.valek@gmail.com');
 assert.match(f.mails[0].body,/09:00–10:30/); assert.match(f.mails[0].body,/docs.google.com/);
});
test('mail failure preserves saved request and retries by scheduled handler', () => {
 const f=fixture(); f.context.setup(); f.mailFails(true);
 assert.equal(f.context.submitRequest(f.payload).saved,true); assert.equal(f.rows[1][8],'Čeká');
 f.mailFails(false); f.context.retryNotifications(); f.context.retryNotifications();
 assert.equal(f.mails.length,1); assert.match(f.rows[1][8],/^Odesláno:/);
});
test('legacy header migration preserves original rows without sending historical notifications', () => {
 const f=fixture(); f.context.setup(); f.rows[0]=f.rows[0].slice(0,6);
 f.rows.push(['old','old@example.cz','2026-01-01','old reason','Schváleno','old-id']);
 f.context.setup(); f.context.retryNotifications();
 assert.equal(f.rows[0].length,9); assert.equal(f.rows[1][3],'old reason'); assert.equal(f.mails.length,0);
 assert.equal(f.triggers.length,1);
});

test('quota exhaustion queues notification without losing the record', () => {
 const f=fixture(); f.context.setup(); f.context.MailApp.getRemainingDailyQuota=()=>0;
 assert.equal(f.context.submitRequest(f.payload).saved,true); assert.equal(f.mails.length,0);
 assert.equal(f.rows[1][8],'Čeká'); f.context.MailApp.getRemainingDailyQuota=()=>1;
 f.context.retryNotifications(); assert.equal(f.mails.length,1);
});

test('mail failure exposes diagnostic note to table owner', () => {
 const f=fixture(); f.context.setup(); f.mailFails(true); f.context.submitRequest(f.payload);
 assert.match(f.notes['2:9'],/mail failure/); assert.equal(f.rows[1][8],'Čeká');
});
test('manual diagnostic test sends a mail without creating a request', () => {
 const f=fixture(); f.context.testNotification(); assert.equal(f.mails.length,1);
 assert.equal(f.mails[0].to,'kami.valek@gmail.com'); assert.equal(f.rows.length,0);
});
test('manual test reveals sending failures and prevents non-owner access', () => {
 const f=fixture(); f.mailFails(true); assert.throws(()=>f.context.testNotification(), /mail failure/);
 f.context.Session.getActiveUser=()=>({getEmail:()=> 'employee@example.cz'});
 assert.throws(()=>f.context.testNotification(), /vlastník/);
});
