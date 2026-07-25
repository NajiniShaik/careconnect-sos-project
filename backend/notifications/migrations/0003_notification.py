from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_alter_devicetoken_id_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("body", models.TextField(blank=True)),
                ("kind", models.CharField(choices=[("SOS", "SOS"), ("ANNOUNCEMENT", "Announcement"), ("SOCIETY_UPDATE", "Society Update"), ("GENERAL", "General")], default="GENERAL", max_length=30)),
                ("read", models.BooleanField(default=False)),
                ("data", models.JSONField(blank=True, default=dict)),
                ("received_at", models.DateTimeField(auto_now_add=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notifications", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"],},
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["user", "read", "created_at"], name="notifications_notification_user_read_created_idx"),
        ),
    ]
