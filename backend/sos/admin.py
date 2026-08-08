from django.contrib import admin

from .models import ChatMessage, ResponseUpdate


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("incident", "sender", "created_at", "is_system_message")
    search_fields = ("message", "sender__username", "incident__id")
    list_filter = ("is_system_message", "created_at")


@admin.register(ResponseUpdate)
class ResponseUpdateAdmin(admin.ModelAdmin):
    list_display = ("incident", "user", "role", "update_type", "created_at")
    search_fields = ("message", "user__username", "incident__id", "role", "update_type")
    list_filter = ("role", "update_type", "created_at")
