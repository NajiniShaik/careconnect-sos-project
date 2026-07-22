from config.firebase import initialize_firebase


def send_push_notification(token, title, body, data=None):
    initialize_firebase()
    try:
        from firebase_admin import messaging
    except Exception as exc:
        raise RuntimeError("Firebase Admin SDK is not available") from exc

    message = messaging.Message(
        notification=messaging.Notification(
            title=title,
            body=body,
        ),
        token=token,
        data=data or {},
    )

    response = messaging.send(message)
    return response