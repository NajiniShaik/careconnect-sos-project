"""Minimal firebase_admin stub for test imports."""

_apps = []

def get_app(name=None):
    if not _apps:
        raise ValueError("No Firebase app initialized")
    return _apps[0]

def initialize_app(cred=None, name=None):
    app = object()
    _apps.append(app)
    return app

class credentials:
    class Certificate:
        def __init__(self, path):
            self.path = path

from . import messaging
