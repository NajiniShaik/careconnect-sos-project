from django.test import TestCase, override_settings
from django.core import mail
from unittest.mock import patch

from .email import send_email


class EmailHelperTests(TestCase):
    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_send_email_success(self):
        result = send_email(['test@example.com'], 'Test Subject', 'Hello world')
        self.assertTrue(result)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, 'Test Subject')

    def test_send_email_missing_recipient(self):
        result = send_email([], 'No Recipients', 'Body')
        self.assertFalse(result)

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_send_email_smtp_failure(self):
        # patch EmailMultiAlternatives.send to raise an exception
        with patch('django.core.mail.EmailMultiAlternatives.send', side_effect=Exception('SMTP failure')):
            result = send_email(['a@b.com'], 'Subject', 'Body')
            self.assertFalse(result)
