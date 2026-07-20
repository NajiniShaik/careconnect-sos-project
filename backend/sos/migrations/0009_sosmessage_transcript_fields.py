from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sos", "0008_sos_priority"),
    ]

    operations = [
        migrations.AddField(
            model_name="sos",
            name="transcript",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="sos",
            name="transcription_status",
            field=models.CharField(default="PENDING", max_length=20),
        ),
        migrations.AddField(
            model_name="sos",
            name="transcription_completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="sosmessage",
            name="transcript",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="sosmessage",
            name="transcription_status",
            field=models.CharField(default="PENDING", max_length=20),
        ),
        migrations.AddField(
            model_name="sosmessage",
            name="transcription_completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
