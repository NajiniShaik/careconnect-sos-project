from django.conf import settings
import os

firebase_app = None

def initialize_firebase():
    """Initialize and return the shared Firebase app instance."""
    global firebase_app

    try:
        import firebase_admin
        from firebase_admin import credentials
    except Exception as exc:
        raise RuntimeError("Firebase Admin SDK is not available") from exc

    if firebase_admin._apps:
        firebase_app = firebase_admin.get_app()
        return firebase_app

    cred_path = os.path.join(settings.BASE_DIR, "firebase", "firebase-adminsdk.json")
    cred = credentials.Certificate(cred_path)
    firebase_app = firebase_admin.initialize_app(cred)
    return firebase_app