"""Evidence propustek s trvalou frontou e-mailů. Python 3.12+, bez závislostí."""
import json
import os
import re
import smtplib
import sqlite3
import ssl
import threading
import time
import uuid
from datetime import date
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('DATABASE_PATH', str(ROOT / 'data' / 'requests.sqlite3')))
MANAGER = 'kamil.valek@ub.cz'
APPROVAL = 'OK, souhlasím/schvaluji. S pozdravem Kamil Válek'
DELAY = 600


def connect():
    con = sqlite3.connect(DB, timeout=30)
    con.row_factory = sqlite3.Row
    return con


def initialize():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS requests (
          id TEXT PRIMARY KEY, email TEXT NOT NULL, leave_date TEXT NOT NULL,
          reason TEXT NOT NULL, created_at REAL NOT NULL,
          notified_at REAL, approved_at REAL
        );
        CREATE TABLE IF NOT EXISTS jobs (
          id INTEGER PRIMARY KEY, request_id TEXT NOT NULL,
          kind TEXT NOT NULL, due_at REAL NOT NULL, sent_at REAL,
          attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
          UNIQUE(request_id, kind)
        );
        ''')


def smtp_config():
    path = Path(os.environ.get('SMTP_CONFIG_FILE', str(ROOT / 'smtp.local.json')))
    config = {}
    try:
        if path.exists():
            config = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(config, dict):
                raise ValueError()
        elif 'SMTP_CONFIG_FILE' in os.environ:
            raise ValueError()
    except (OSError, ValueError):
        raise RuntimeError('Konfigurační soubor SMTP chybí, není čitelný nebo nemá platný JSON.') from None
    fields = {'host': 'SMTP_HOST', 'port': 'SMTP_PORT', 'security': 'SMTP_SECURITY',
              'from': 'SMTP_FROM', 'username': 'SMTP_USER', 'password': 'SMTP_PASSWORD'}
    for key, variable in fields.items():
        if variable in os.environ:
            config[key] = os.environ[variable]
    config.setdefault('security', 'starttls')
    config.setdefault('port', 465 if config['security'] == 'ssl' else 587)
    return config


def mail_ready():
    try:
        config = smtp_config()
        return (all(isinstance(config.get(k), str) and bool(config[k])
                    for k in ('host', 'from', 'username', 'password'))
                and config['security'] in ('starttls', 'ssl')
                and 1 <= int(config['port']) <= 65535)
    except (RuntimeError, ValueError, TypeError):
        return False


def send_mail(recipient, subject, body):
    if not mail_ready():
        raise RuntimeError('Doplňte konfiguraci SMTP včetně přihlašovacího jména a hesla.')
    config = smtp_config()
    msg = EmailMessage()
    msg['From'] = config['from']
    msg['To'] = recipient
    msg['Subject'] = subject
    msg.set_content(body)
    mode = config['security']
    if mode not in ('starttls', 'ssl'):
        raise RuntimeError('SMTP_SECURITY musí být starttls nebo ssl.')
    port = int(config['port'])
    context = ssl.create_default_context()
    client = (smtplib.SMTP_SSL(config['host'], port, timeout=30, context=context)
              if mode == 'ssl' else smtplib.SMTP(config['host'], port, timeout=30))
    with client as smtp:
        if mode == 'starttls':
            smtp.starttls(context=context)
        smtp.login(config['username'], config['password'])
        smtp.send_message(msg)


def submit(payload, now=None):
    if not mail_ready():
        raise RuntimeError('Odesílání e-mailů není nakonfigurováno. Kontaktujte správce aplikace.')
    if not isinstance(payload, dict):
        raise ValueError('Neplatný formulář.')
    email = payload.get('email', '')
    leave_date = payload.get('date', '')
    reason = payload.get('reason', '')
    if not all(isinstance(v, str) for v in (email, leave_date, reason)):
        raise ValueError('Vyplňte všechny údaje jako text.')
    email, leave_date, reason = email.strip(), leave_date.strip(), reason.strip()
    if len(email) > 254 or not re.fullmatch(r'[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+', email):
        raise ValueError('Zadejte platný e-mail.')
    try:
        parsed_date = date.fromisoformat(leave_date)
    except ValueError:
        raise ValueError('Zadejte platné datum.') from None
    if parsed_date < date.today():
        raise ValueError('Datum odchodu nesmí být v minulosti.')
    if not 3 <= len(reason) <= 2000:
        raise ValueError('Důvod musí mít 3 až 2000 znaků.')
    now = time.time() if now is None else now
    request_id = str(uuid.uuid4())
    with connect() as con:
        con.execute('INSERT INTO requests(id,email,leave_date,reason,created_at) VALUES(?,?,?,?,?)',
                    (request_id, email, leave_date, reason, now))
        con.execute('INSERT INTO jobs(request_id,kind,due_at) VALUES(?,?,?)', (request_id, 'notify', now))
    return request_id


def process_jobs(now=None, sender=send_mail):
    fixed_time = now is not None
    now = time.time() if now is None else now
    with connect() as con:
        jobs = con.execute('''SELECT j.id AS job_id,j.kind,j.attempts,r.* FROM jobs j
          JOIN requests r ON r.id=j.request_id
          WHERE j.sent_at IS NULL AND j.due_at<=? ORDER BY j.due_at LIMIT 50''', (now,)).fetchall()
    for job in jobs:
        try:
            if job['kind'] == 'notify':
                sender(MANAGER, 'Žádost o propustku',
                       f"Zaměstnanec: {job['email']}\nDatum: {job['leave_date']}\n"
                       f"Důvod: {job['reason']}\n\nČíslo žádosti: {job['id']}\n"
                       'Za 10 minut od úspěšného odeslání této zprávy bude automaticky odeslán souhlas zaměstnanci.')
            else:
                sender(job['email'], 'Schválení propustky', APPROVAL)
            completed = now if fixed_time else time.time()
            with connect() as con:
                con.execute('UPDATE jobs SET sent_at=?,last_error=NULL WHERE id=?', (completed, job['job_id']))
                if job['kind'] == 'notify':
                    con.execute('UPDATE requests SET notified_at=? WHERE id=?', (completed, job['id']))
                    con.execute('INSERT OR IGNORE INTO jobs(request_id,kind,due_at) VALUES(?,?,?)',
                                (job['id'], 'approve', completed + DELAY))
                else:
                    con.execute('UPDATE requests SET approved_at=? WHERE id=?', (completed, job['id']))
        except Exception as error:
            # Store only the exception type; SMTP errors may contain addresses or server details.
            with connect() as con:
                retry = min(900, 30 * 2 ** min(job['attempts'], 5))
                con.execute('UPDATE jobs SET attempts=attempts+1,last_error=?,due_at=? WHERE id=?',
                            (type(error).__name__, now + retry, job['job_id']))
            print(f"Odesílání selhalo ({type(error).__name__}); úloha {job['job_id']} bude zopakována.", flush=True)


def worker(stop):
    while not stop.is_set():
        try:
            process_jobs()
        except Exception as error:
            print(f'Chyba fronty: {type(error).__name__}', flush=True)
        stop.wait(1)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Avoid logging personal data and request identifiers.

    def respond(self, code, body, content_type='application/json; charset=utf-8'):
        data = body.encode() if isinstance(body, str) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/':
            self.respond(200, (ROOT / 'index.html').read_text(), 'text/html; charset=utf-8')
        elif self.path == '/api/health':
            self.respond(200, {'ok': True, 'mailConfigured': mail_ready(), 'delayMinutes': 10})
        elif self.path.startswith('/api/requests/'):
            request_id = self.path.removeprefix('/api/requests/')
            with connect() as con:
                row = con.execute('SELECT * FROM requests WHERE id=?', (request_id,)).fetchone()
                job = con.execute("SELECT due_at FROM jobs WHERE request_id=? AND kind='approve'", (request_id,)).fetchone()
            if row is None:
                self.respond(404, {'error': 'Žádost nenalezena.'})
                return
            self.respond(200, {'id': row['id'], 'status': 'approved' if row['approved_at'] else 'waiting' if row['notified_at'] else 'queued',
                               'approvalAt': job['due_at'] if job else None})
        else:
            self.respond(404, {'error': 'Stránka nenalezena.'})

    def do_POST(self):
        if self.path != '/api/requests':
            self.respond(404, {'error': 'Stránka nenalezena.'})
            return
        if not self.headers.get('Content-Type', '').startswith('application/json'):
            self.respond(415, {'error': 'Požadován formát JSON.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 1 or length > 12000:
                self.respond(413, {'error': 'Neplatná velikost formuláře.'})
                return
            payload = json.loads(self.rfile.read(length))
            request_id = submit(payload)
            self.respond(201, {'id': request_id})
        except (ValueError, UnicodeDecodeError) as error:
            self.respond(400, {'error': str(error) if not isinstance(error, json.JSONDecodeError) else 'Neplatný formulář.'})
        except RuntimeError as error:
            self.respond(503, {'error': str(error)})


def main():
    initialize()
    stop = threading.Event()
    thread = threading.Thread(target=worker, args=(stop,), daemon=True)
    thread.start()
    server = ThreadingHTTPServer((os.environ.get('HOST', '127.0.0.1'), int(os.environ.get('PORT', '8000'))), Handler)
    print('Propustky spuštěny na portu ' + str(server.server_port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        stop.set()
        thread.join(timeout=35)


if __name__ == '__main__':
    main()
