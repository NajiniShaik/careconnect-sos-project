class Message:
    def __init__(self, notification=None, token=None, data=None):
        self.notification = notification
        self.token = token
        self.data = data


class Notification:
    def __init__(self, title=None, body=None):
        self.title = title
        self.body = body


class MockMessaging:
    @staticmethod
    def send(message):
        return None


messaging = MockMessaging()


def send(message):
    return messaging.send(message)
