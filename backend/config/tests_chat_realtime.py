import json

from asgiref.sync import async_to_sync
from django.test import SimpleTestCase

from .consumers import ChatConsumer


class RecordingChannelLayer:
    def __init__(self):
        self.groups = {}

    async def group_add(self, group, channel):
        self.groups.setdefault(group, set()).add(channel)

    async def group_discard(self, group, channel):
        if group in self.groups:
            self.groups[group].discard(channel)
            if not self.groups[group]:
                del self.groups[group]


class TestableChatConsumer(ChatConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.accepted = False
        self.sent_messages = []

    async def accept(self):
        self.accepted = True

    async def send(self, text_data=None, bytes_data=None):
        self.sent_messages.append({"text_data": text_data, "bytes_data": bytes_data})


class ChatConsumerRealtimeTests(SimpleTestCase):
    def test_connects_to_incident_group_and_delivers_broadcast(self):
        channel_layer = RecordingChannelLayer()
        consumer = TestableChatConsumer(
            scope={"url_route": {"kwargs": {"incident_id": "51"}}},
            receive=lambda: None,
            send=lambda *args, **kwargs: None,
        )
        consumer.scope = {"url_route": {"kwargs": {"incident_id": "51"}}}
        consumer.channel_layer = channel_layer
        consumer.channel_name = "test-channel"

        async_to_sync(consumer.connect)()

        self.assertTrue(consumer.accepted)
        self.assertIn("test-channel", channel_layer.groups["chat_51"])

        async_to_sync(consumer.chat_message)({
            "message": {"id": 101, "message": "hello from server"},
        })

        self.assertEqual(1, len(consumer.sent_messages))
        self.assertEqual(
            '{"message": {"id": 101, "message": "hello from server"}}',
            consumer.sent_messages[0]["text_data"],
        )

        async_to_sync(consumer.disconnect)(1000)
        self.assertNotIn("chat_51", channel_layer.groups)
