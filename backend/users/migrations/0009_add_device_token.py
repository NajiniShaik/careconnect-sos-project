from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0008_fix_empty_user_roles"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="device_token",
            field=models.CharField(blank=True, db_index=True, max_length=255, null=True),
        ),
    ]
