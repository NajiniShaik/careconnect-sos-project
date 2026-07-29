"""Create NotificationTemplate model and seed defaults."""
from django.db import migrations, models


def create_defaults(apps, schema_editor):
    NotificationTemplate = apps.get_model("notifications", "NotificationTemplate")
    defaults = [
        {"template_key": "sos_created", "name": "SOS Created", "channel": "PUSH", "subject": "SOS Created: {{incident_id}}", "title": "SOS Created", "body": "SOS reported by {{resident_name}}"},
        {"template_key": "sos_accepted", "name": "SOS Accepted", "channel": "PUSH", "subject": "SOS Accepted: {{incident_id}}", "title": "SOS Accepted", "body": "SOS accepted by {{volunteer_name}}"},
        {"template_key": "sos_resolved", "name": "SOS Resolved", "channel": "PUSH", "subject": "SOS Resolved: {{incident_id}}", "title": "SOS Resolved", "body": "SOS resolved for {{resident_name}}"},
        {"template_key": "escalation", "name": "Escalation", "channel": "SMS", "subject": "Escalation: {{incident_id}}", "title": "Escalation", "body": "Escalation notification: {{severity}}"},
        {"template_key": "emergency_contact_alert", "name": "Emergency Contact Alert", "channel": "SMS", "subject": "Emergency Contact Alert", "title": "Verify Contact", "body": "Please verify emergency contact for {{resident_name}}"},
        {"template_key": "community_broadcast", "name": "Community Broadcast", "channel": "EMAIL", "subject": "Community Broadcast", "title": "Community Broadcast", "body": "Community broadcast: {{category}} at {{address}}"},
    ]

    for item in defaults:
        NotificationTemplate.objects.update_or_create(template_key=item["template_key"], defaults={
            "name": item["name"],
            "channel": item.get("channel", "EMAIL"),
            "subject": item.get("subject", ""),
            "title": item.get("title", ""),
            "body": item.get("body", ""),
            "is_active": True,
        })


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0010_notificationdelivery_delivered_at_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="NotificationTemplate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200)),
                ("template_key", models.CharField(db_index=True, max_length=150, unique=True)),
                ("channel", models.CharField(choices=[("EMAIL", "Email"), ("SMS", "SMS"), ("PUSH", "Push")], default="EMAIL", max_length=20)),
                ("subject", models.CharField(blank=True, default="", max_length=250)),
                ("title", models.CharField(blank=True, default="", max_length=150)),
                ("body", models.TextField(blank=True, default="")),
                ("variables", models.JSONField(blank=True, default=list)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-updated_at", "-created_at"],
            },
        ),
        migrations.RunPython(create_defaults, migrations.RunPython.noop),
    ]
