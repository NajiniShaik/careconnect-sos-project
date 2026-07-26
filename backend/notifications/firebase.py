import logging

from django.contrib.auth import get_user_model

from config.firebase import initialize_firebase

logger = logging.getLogger(__name__)


def _mask_token(token):
    token_text = str(token or "")
    if not token_text:
        return ""
    if len(token_text) <= 8:
        return token_text
    return f"{token_text[:8]}...{token_text[-4:]}"


def _deactivate_invalid_token(token):
    if not token:
        return False

    try:
        from .models import DeviceToken

        DeviceToken.objects.filter(token=token).delete()
    except Exception:
        return False

    try:
        user_model = get_user_model()
        for user in user_model.objects.filter(device_token=token):
            user.device_token = ""
            user.save(update_fields=["device_token"])
    except Exception:
        return False

    return True


def send_push_notification(token, title, body, data=None):
    initialize_firebase()
    if not token:
        logger.warning("[FCM] No device token supplied for push send")
        return None

    if data:
        data = {str(k): str(v) for k, v in data.items()}
    else:
        data = {}

    from firebase_admin import messaging

    message = messaging.Message(
        notification=messaging.Notification(
            title=title,
            body=body,
        ),
        token=token,
        data=data,
    )

    try:
        response = messaging.send(message)
        logger.info("[FCM] Send succeeded for token=%s response=%s", _mask_token(token), response)
        return response
    except Exception as exc:
        error_text = str(exc).lower()
        if "notregistered" in error_text or "unregistered" in error_text or "registration-token-not-registered" in error_text:
            _deactivate_invalid_token(token)
            logger.info("[FCM] Deactivated invalid token=%s", _mask_token(token))
            return None
        logger.exception("[FCM] Send failed for token=%s payload=%s error=%s", _mask_token(token), {"title": title, "body": body, "data": data or {}}, exc)
        raise