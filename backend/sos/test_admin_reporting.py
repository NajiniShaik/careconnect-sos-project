from datetime import timedelta

from django.utils import timezone
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from django.contrib.auth import get_user_model
from society.models import Society
from users.models import ResidentProfile
from .models import SOS


class AdminReportingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.admin_user = self.user_model.objects.create_user(
            username="admin_report",
            email="admin_report@example.com",
            password="testpass123",
            role="ADMIN",
        )
        self.security_user = self.user_model.objects.create_user(
            username="security_report",
            email="security_report@example.com",
            password="testpass123",
            role="SECURITY",
        )
        self.resident_user = self.user_model.objects.create_user(
            username="resident_report",
            email="resident_report@example.com",
            password="testpass123",
            role="RESIDENT",
        )

        # societies
        self.soc_a = Society.objects.create(name="ReportSocA")
        self.soc_b = Society.objects.create(name="ReportSocB")

        # link resident profiles
        ResidentProfile.objects.create(user=self.resident_user, society=self.soc_a, block=None, flat=None)

        # create additional resident for soc_b
        self.resident_b = self.user_model.objects.create_user(
            username="resident_b",
            email="resident_b@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        ResidentProfile.objects.create(user=self.resident_b, society=self.soc_b, block=None, flat=None)

        # create incidents with timelines for metrics
        now = timezone.now()

        # sos1: soc_a resolved with guardian/volunteer/security responses
        self.sos1 = SOS.objects.create(user=self.resident_user, message="Resolved A", location="LA", category="medical")
        self.sos1.created_at = now - timedelta(days=2)
        self.sos1.save(update_fields=["created_at"]) 
        self.sos1.record_status_event("TRIGGERED", occurred_at=self.sos1.created_at)
        self.sos1.record_status_event("GUARDIAN_RESPONDED", occurred_at=self.sos1.created_at + timedelta(seconds=60))
        self.sos1.record_status_event("VOLUNTEER_ACCEPTED", occurred_at=self.sos1.created_at + timedelta(seconds=120))
        self.sos1.record_status_event("SECURITY_RESPONDED", occurred_at=self.sos1.created_at + timedelta(seconds=180))
        self.sos1.record_status_event("INCIDENT_CLOSED", occurred_at=self.sos1.created_at + timedelta(seconds=3600))

        # sos2: soc_a active (volunteer accepted)
        self.sos2 = SOS.objects.create(user=self.resident_user, message="Active A", location="LA2", category="fire")
        self.sos2.created_at = now - timedelta(days=1)
        self.sos2.save(update_fields=["created_at"]) 
        self.sos2.record_status_event("TRIGGERED", occurred_at=self.sos2.created_at)
        self.sos2.record_status_event("VOLUNTEER_ACCEPTED", occurred_at=self.sos2.created_at + timedelta(minutes=5))

        # sos3: soc_b active (security responded)
        self.sos3 = SOS.objects.create(user=self.resident_b, message="Active B", location="LB", category="medical")
        self.sos3.record_status_event("TRIGGERED")
        self.sos3.record_status_event("SECURITY_RESPONDED")

        # sos4: soc_b open (no responses)
        self.sos4 = SOS.objects.create(user=self.resident_b, message="Open B", location="LB2", category="other")
        self.sos4.record_status_event("TRIGGERED")

    def test_admin_authorization(self):
        # admin can access
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get("/api/sos/reporting/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # non-admins denied
        for user in [self.security_user, self.resident_user]:
            self.client.force_authenticate(user=user)
            resp2 = self.client.get("/api/sos/reporting/")
            self.assertEqual(resp2.status_code, status.HTTP_403_FORBIDDEN)

    def test_basic_reporting_counts_and_category_society_counts(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get("/api/sos/reporting/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data
        self.assertEqual(data["total_incidents"], 4)
        self.assertEqual(data["resolved_incidents"], 1)
        # active = total - resolved
        self.assertEqual(data["active_incidents"], 3)
        # category counts
        self.assertIn("medical", data["category_counts"]) 
        # society counts keys exist
        self.assertIn(self.soc_a.name, data["society_counts"]) 
        self.assertIn(self.soc_b.name, data["society_counts"]) 

    def test_date_filtering_and_empty_result(self):
        self.client.force_authenticate(user=self.admin_user)
        # filter to only items created in last 1 day -> should include sos2, sos3, sos4 (sos1 is 2 days old)
        start = (timezone.now() - timedelta(days=1)).date().isoformat()
        resp = self.client.get(f"/api/sos/reporting/?start_date={start}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["total_incidents"], 3)

        # aliases date_from/date_to
        end = (timezone.now() - timedelta(days=1)).date().isoformat()
        resp2 = self.client.get(f"/api/sos/reporting/?date_from={start}&date_to={end}")
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)

        # future date returns empty
        future = (timezone.now() + timedelta(days=10)).date().isoformat()
        resp3 = self.client.get(f"/api/sos/reporting/?start_date={future}")
        self.assertEqual(resp3.status_code, status.HTTP_200_OK)
        self.assertEqual(resp3.data["total_incidents"], 0)
        self.assertEqual(resp3.data["category_counts"], {})
        self.assertEqual(resp3.data["society_counts"], {})
        self.assertIsNone(resp3.data["response_time_summary"]["guardian_response_seconds_avg"])

    def test_society_and_category_filtering_and_aggregation(self):
        self.client.force_authenticate(user=self.admin_user)
        # filter by society id (soc_a has sos1 and sos2)
        resp = self.client.get(f"/api/sos/reporting/?society={self.soc_a.id}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["total_incidents"], 2)
        # check society_counts for soc_a totals
        sc = resp.data["society_counts"].get(self.soc_a.name)
        self.assertIsNotNone(sc)
        self.assertEqual(sc["total"], 2)

        # filter by category
        resp2 = self.client.get("/api/sos/reporting/?category=medical")
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp2.data["total_incidents"], 2)

    def test_response_time_analytics(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get("/api/sos/reporting/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        r = resp.data["response_time_summary"]
        # only sos1 had guardian/volunteer/security and resolution timings
        self.assertEqual(r["guardian_response_seconds_avg"], 60)
        # sos1 and sos2 both have volunteer response events (120 and 300 seconds)
        self.assertEqual(r["volunteer_response_seconds_avg"], 210)
        # security responded for sos1 (180s) and sos3 (~0s), average rounds to 90
        self.assertEqual(r["security_response_seconds_avg"], 90)
        self.assertEqual(r["total_resolution_seconds_avg"], 3600)
        self.assertEqual(r["counts"]["with_guardian_response"], 1)
        self.assertEqual(r["counts"]["with_security_response"], 2)

    def test_reporting_export_excel_and_pdf_endpoints(self):
        self.client.force_authenticate(user=self.admin_user)

        resp_excel = self.client.get("/api/sos/reporting/export/excel/")
        self.assertEqual(resp_excel.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_excel["Content-Type"], "application/vnd.ms-excel")
        self.assertEqual(resp_excel["Content-Disposition"], 'attachment; filename="sos_reporting.xls"')
        self.assertIn(b"<html>", resp_excel.content)
        self.assertIn(b"SOS Reporting Export", resp_excel.content)

        resp_pdf = self.client.get("/api/sos/reporting/export/pdf/")
        self.assertEqual(resp_pdf.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_pdf["Content-Type"], "application/pdf")
        self.assertEqual(resp_pdf["Content-Disposition"], 'attachment; filename="sos_reporting.pdf"')
        self.assertTrue(resp_pdf.content.startswith(b"%PDF"))

    def test_reporting_export_endpoints_require_admin(self):
        for user in [self.security_user, self.resident_user]:
            self.client.force_authenticate(user=user)
            resp_excel = self.client.get("/api/sos/reporting/export/excel/")
            resp_pdf = self.client.get("/api/sos/reporting/export/pdf/")
            self.assertEqual(resp_excel.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(resp_pdf.status_code, status.HTTP_403_FORBIDDEN)
