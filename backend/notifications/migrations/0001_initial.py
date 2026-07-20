"""Initial migration for notifications app: DeviceToken model."""
from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='DeviceToken',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.CharField(max_length=255, db_index=True)),
                ('platform', models.CharField(choices=[('android', 'Android'), ('ios', 'iOS'), ('web', 'Web'), ('unknown', 'Unknown')], default='unknown', max_length=20)),
                ('device_id', models.CharField(blank=True, help_text='Optional device identifier', max_length=255, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='device_tokens', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'unique_together': {('user', 'device_id'), ('user', 'token')},
            },
        ),
    ]
