from django.test import TestCase, override_settings
from unittest.mock import Mock, patch

from .services import NotificationService
from .sms import send_sms


class SMSNotificationTests(TestCase):
    @override_settings(TWILIO_ACCOUNT_SID='ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', TWILIO_AUTH_TOKEN='token', TWILIO_FROM_NUMBER='+15551234567')
    def test_send_sms_notification_no_numbers(self):
        service = NotificationService()
        self.assertFalse(service.send_sms_notification([], 'Test message'))

    @override_settings(TWILIO_ACCOUNT_SID='ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', TWILIO_AUTH_TOKEN='token', TWILIO_FROM_NUMBER='+15551234567')
    def test_send_sms_notification_twilio_success(self):
        service = NotificationService()
        mock_requests = Mock()
        mock_response = Mock(status_code=201, text='Created')
        mock_requests.post.return_value = mock_response

        with patch.dict('sys.modules', {'requests': mock_requests}):
            result = service.send_sms_notification(['+15557654321'], 'Test message')

        self.assertTrue(result)
        mock_requests.post.assert_called_once()

    @override_settings(TWILIO_ACCOUNT_SID='ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', TWILIO_AUTH_TOKEN='token', TWILIO_FROM_NUMBER='+15551234567')
    def test_send_sms_notification_twilio_failure_returns_false(self):
        service = NotificationService()
        mock_requests = Mock()
        mock_response = Mock(status_code=400, text='Bad request')
        mock_requests.post.return_value = mock_response

        with patch.dict('sys.modules', {'requests': mock_requests}):
            result = service.send_sms_notification(['+15557654321'], 'Test message')

        self.assertFalse(result)
        mock_requests.post.assert_called_once()

    def test_send_sms_helper_uses_notification_service(self):
        with patch('notifications.sms.NotificationService.send_sms_notification', return_value=True) as mock_send_sms:
            result = send_sms(['+15557654321'], 'Helper message')

        self.assertTrue(result)
        mock_send_sms.assert_called_once_with(['+15557654321'], 'Helper message')
