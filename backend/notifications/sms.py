from __future__ import annotations

from typing import Iterable

from .services import NotificationService


def send_sms(to_numbers: Iterable[str], message: str) -> bool:
    """Send an SMS message using the shared NotificationService."""
    service = NotificationService()
    return service.send_sms_notification(to_numbers, message)
