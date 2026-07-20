from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sos", "0008_sos_priority"),
    ]

    operations = [
        migrations.AddField(
            model_name="sosmessage",
            name="audio_file",
            field=models.FileField(blank=True, null=True, upload_to="sos_audio/%Y/%m/%d/"),
        ),
    ]
