import json
from importlib import import_module
from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.apps import apps


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.incident_id = self.scope.get("url_route", {}).get("kwargs", {}).get("incident_id")
        if not self.incident_id:
            await self.close(code=4000)
            return

        user = await self._authenticate_user_from_query()
        if not getattr(user, "is_authenticated", False):
            await self.close(code=4001)
            return

        self.scope["user"] = user

        SOS = apps.get_model("sos", "SOS")
        try:
            sos = await sync_to_async(SOS.objects.get)(pk=self.incident_id)
        except SOS.DoesNotExist:
            await self.close(code=4004)
            return

        sos_views = import_module("sos.views")
        _can_view_sos_messages = getattr(sos_views, "_can_view_sos_messages")
        if not await sync_to_async(_can_view_sos_messages)(sos, user):
            await self.close(code=4001)
            return

        self.group_name = f"chat_{self.incident_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if getattr(self, "group_name", None):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        pass

    async def chat_message(self, event):
        message_payload = event.get("message")
        if message_payload is None:
            return

        await self.send(text_data=json.dumps({"message": message_payload}))

    async def _authenticate_user_from_query(self):
        query_string = self.scope.get("query_string", b"")
        if isinstance(query_string, bytes):
            query_string = query_string.decode("utf-8", errors="ignore")

        token = parse_qs(query_string).get("token", [None])[0]
        if not token:
            return apps.get_model("auth", "AnonymousUser")()

        try:
            jwt_module = import_module("rest_framework_simplejwt.authentication")
            JWTAuthentication = getattr(jwt_module, "JWTAuthentication")
            jwt_auth = JWTAuthentication()
            validated_token = jwt_auth.get_validated_token(token)
            user = await sync_to_async(jwt_auth.get_user)(validated_token)
            return user
        except Exception:
            return apps.get_model("auth", "AnonymousUser")()
