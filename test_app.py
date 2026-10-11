import os
import tempfile
import threading
import unittest
import json
from datetime import date
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import app


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(app, 'DB', Path(self.temp.name) / 'test.sqlite3')
        self.db_patch.start()
        self.env_patch = patch.dict(os.environ, {'SMTP_HOST': 'smtp.example.cz', 'SMTP_FROM': 'sender@example.cz',
                                                'SMTP_USER': 'test-user', 'SMTP_PASSWORD': 'test-only-password'})
        self.env_patch.start()
        app.initialize()
        self.payload = {'email': 'employee@example.cz', 'date': date.today().isoformat(), 'reason': 'Návštěva lékaře'}
        self.messages = []

    def tearDown(self):
        self.env_patch.stop()
        self.db_patch.stop()
        self.temp.cleanup()

    def send(self, *message):
        self.messages.append(message)

    def test_full_workflow_and_exact_delay(self):
        request_id = app.submit(self.payload, now=1000)
        app.process_jobs(now=1000, sender=self.send)
        self.assertEqual(len(self.messages), 1)
        self.assertEqual(self.messages[0][0], 'kamil.valek@ub.cz')
        for value in self.payload.values():
            self.assertIn(value, self.messages[0][2])
        app.process_jobs(now=1599, sender=self.send)
        self.assertEqual(len(self.messages), 1)
        app.process_jobs(now=1600, sender=self.send)
        self.assertEqual(self.messages[1][0], self.payload['email'])
        self.assertEqual(self.messages[1][2], 'OK, souhlasím/schvaluji. S pozdravem Kamil Válek')
        app.process_jobs(now=2000, sender=self.send)
        self.assertEqual(len(self.messages), 2)
        with app.connect() as con:
            self.assertEqual(con.execute('SELECT approved_at FROM requests WHERE id=?', (request_id,)).fetchone()[0], 1600)

    def test_failed_notification_retries_before_approval(self):
        app.submit(self.payload, now=1000)
        def fail(*args):
            raise ConnectionError('temporary failure')
        app.process_jobs(now=1000, sender=fail)
        with app.connect() as con:
            self.assertEqual(con.execute("SELECT count(*) FROM jobs WHERE kind='approve'").fetchone()[0], 0)
        app.process_jobs(now=1029, sender=self.send)
        self.assertEqual(self.messages, [])
        app.process_jobs(now=1030, sender=self.send)
        app.process_jobs(now=1629, sender=self.send)
        self.assertEqual(len(self.messages), 1)
        app.process_jobs(now=1630, sender=self.send)
        self.assertEqual(len(self.messages), 2)

    def test_restart_preserves_pending_approval(self):
        app.submit(self.payload, now=1000)
        app.process_jobs(now=1000, sender=self.send)
        app.initialize()
        app.process_jobs(now=1600, sender=self.send)
        self.assertEqual(len(self.messages), 2)

    def test_failed_approval_is_retried(self):
        app.submit(self.payload, now=1000)
        app.process_jobs(now=1000, sender=self.send)
        app.process_jobs(now=1600, sender=lambda *args: (_ for _ in ()).throw(ConnectionError()))
        app.process_jobs(now=1630, sender=self.send)
        self.assertEqual(len(self.messages), 2)

    def test_invalid_inputs_create_no_jobs(self):
        for changes in ({'email': 'bad'}, {'email': 'x@example.cz\r\nBcc: other@example.cz'}, {'date': 'not-a-date'}, {'date': '2000-01-01'}, {'reason': ''}, {'email': 123}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                app.submit(self.payload | changes)
        with app.connect() as con:
            self.assertEqual(con.execute('SELECT count(*) FROM requests').fetchone()[0], 0)

    def test_no_smtp_does_not_accept_request(self):
        with patch.dict(os.environ, {'SMTP_HOST': ''}), self.assertRaises(RuntimeError):
            app.submit(self.payload)

    def test_separate_credentials_document(self):
        path = Path(self.temp.name) / 'smtp.json'
        document = {'host': 'mail.ub.cz', 'port': 465, 'security': 'ssl',
                    'from': 'kamil.valek@ub.cz', 'username': 'file-user', 'password': 'test-only-password'}
        path.write_text(json.dumps(document))
        with patch.dict(os.environ, {'SMTP_CONFIG_FILE': str(path)}, clear=True):
            self.assertTrue(app.mail_ready())
            with patch('app.smtplib.SMTP_SSL') as smtp:
                app.send_mail('employee@example.cz', 'Test', app.APPROVAL)
                smtp.return_value.__enter__.return_value.login.assert_called_once_with('file-user', 'test-only-password')
                self.assertEqual(smtp.call_args.args, ('mail.ub.cz', 465))
            with patch.dict(os.environ, {'SMTP_USER': 'override-user'}):
                self.assertEqual(app.smtp_config()['username'], 'override-user')

    def test_missing_invalid_or_incomplete_credentials_file(self):
        path = Path(self.temp.name) / 'smtp.json'
        with patch.dict(os.environ, {'SMTP_CONFIG_FILE': str(path)}, clear=True):
            self.assertFalse(app.mail_ready())
            for content in ('invalid JSON', '[]', '{"host":"mail.ub.cz"}'):
                path.write_text(content)
                self.assertFalse(app.mail_ready())

    def test_smtp_uses_tls_authentication_and_exact_message(self):
        settings = {'SMTP_SECURITY': 'starttls', 'SMTP_PORT': '587',
                    'SMTP_USER': 'test-user', 'SMTP_PASSWORD': 'test-only-password'}
        with patch.dict(os.environ, settings), patch('app.smtplib.SMTP') as smtp:
            app.send_mail(self.payload['email'], 'Schválení propustky', app.APPROVAL)
            smtp.assert_called_once_with('smtp.example.cz', 587, timeout=30)
            client = smtp.return_value.__enter__.return_value
            client.starttls.assert_called_once()
            self.assertTrue(client.starttls.call_args.kwargs['context'].check_hostname)
            client.login.assert_called_once_with('test-user', 'test-only-password')
            message = client.send_message.call_args.args[0]
            self.assertEqual(message['To'], self.payload['email'])
            self.assertEqual(message['From'], 'sender@example.cz')
            self.assertEqual(message.get_content().rstrip('\n'), app.APPROVAL)

    def test_http_form_submission_and_status(self):
        server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(base + '/') as response:
                self.assertIn('Nová žádost', response.read().decode())
            with urlopen(base + '/api/health') as response:
                self.assertTrue(json.load(response)['mailConfigured'])
            request = Request(base + '/api/requests', data=json.dumps(self.payload).encode(), headers={'Content-Type': 'application/json'})
            with urlopen(request) as response:
                self.assertEqual(response.status, 201)
                request_id = json.load(response)['id']
            with urlopen(base + '/api/requests/' + request_id) as response:
                self.assertEqual(json.load(response)['status'], 'queued')
            app.process_jobs(sender=self.send)
            with app.connect() as con:
                due = con.execute("SELECT due_at FROM jobs WHERE kind='approve'").fetchone()[0]
            app.process_jobs(now=due, sender=self.send)
            with urlopen(base + '/api/requests/' + request_id) as response:
                result = json.load(response)
                self.assertEqual(result['status'], 'approved')
                self.assertNotIn('email', result)
                self.assertNotIn('reason', result)
            with patch.dict(os.environ, {'SMTP_HOST': ''}), self.assertRaises(HTTPError) as error:
                urlopen(request)
            self.assertEqual(error.exception.code, 503)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
