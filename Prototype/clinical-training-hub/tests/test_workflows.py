"""Regression coverage using an isolated database and private temporary uploads."""

import importlib
import os
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
PASSWORD = "Demo@2026!"


class ApplicationWorkflows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="vinmec-regression-")
        cls.addClassCleanup(cls.temporary.cleanup)
        test_url = os.environ.get("TEST_DATABASE_URL", "")
        if test_url and not test_url.rsplit("/", 1)[-1].endswith("_test"):
            raise RuntimeError(
                "TEST_DATABASE_URL must name a dedicated *_test database."
            )
        cls.environment = patch.dict(
            os.environ,
            {
                "DATA_DIR": cls.temporary.name,
                "DATABASE_URL": test_url
                or "sqlite:///" + str(Path(cls.temporary.name) / "hub.db"),
                "DEMO_MODE": "true",
                "DEMO_PASSWORD": PASSWORD,
                "AI_PROVIDER": "demo",
                "ALLOW_EXTERNAL_AI": "false",
                "SEED_CONTENT": "true",
                "COOKIE_SECURE": "false",
            },
        )
        cls.environment.start()
        cls.addClassCleanup(cls.environment.stop)
        cls.db = importlib.import_module("backend.core.database")
        cls.addClassCleanup(cls.db.engine.dispose)
        with cls.db.engine.connect() as connection:
            from sqlalchemy import inspect

            if inspect(connection).get_table_names():
                raise RuntimeError(
                    "Regression tests require an empty dedicated database."
                )
        config = Config(str(ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(ROOT / "migrations"))
        cls.expected_revision = ScriptDirectory.from_config(config).get_current_head()
        command.upgrade(config, "head")
        cls.app = importlib.import_module("backend.main").app
        cls.models = importlib.import_module("backend.models")
        # Seed from committed fixtures; tests must not rewrite source PDF/DOCX files.
        samples = (
            ROOT / "demo/ban-giao-gia-lap.pdf",
            ROOT / "demo/ban-giao-gia-lap.docx",
        )
        cls.sample_patch = patch(
            "scripts.create_samples.create_samples", return_value=samples
        )
        cls.sample_patch.start()
        cls.addClassCleanup(cls.sample_patch.stop)
        cls.client = TestClient(cls.app)
        cls.client.__enter__()
        cls.addClassCleanup(lambda: cls.client.__exit__(None, None, None))

    def login(self, account):
        self.client.cookies.clear()
        response = self.client.post(
            "/api/auth/login",
            json={
                "email": account + "@demo.local",
                "password": PASSWORD,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def request(self, method, path, expected=200, **kwargs):
        response = self.client.request(method, "/api" + path, **kwargs)
        self.assertEqual(response.status_code, expected, response.text)
        return response

    def test_01_role_boundaries_and_read_endpoints(self):
        self.client.cookies.clear()
        self.request("GET", "/auth/me", expected=401)
        for account, role, paths in [
            (
                "admin",
                "ADMIN",
                [
                    "/organization",
                    "/documents",
                    "/courses",
                    "/training/dashboard",
                    "/admin/users",
                    "/admin/audit",
                    "/admin/feedback",
                    "/ai/jobs",
                    "/admin/settings",
                    "/admin/memberships",
                ],
            ),
            (
                "reviewer",
                "REVIEWER",
                [
                    "/organization",
                    "/documents?status=PENDING_REVIEW",
                    "/courses?status=PENDING_REVIEW",
                ],
            ),
            (
                "staff",
                "STAFF",
                [
                    "/organization",
                    "/documents",
                    "/training/my-courses",
                    "/training/calendar",
                    "/credentials",
                    "/reminders",
                    "/feedback/mine",
                    "/chat/conversations",
                ],
            ),
        ]:
            with self.subTest(role=role):
                self.assertEqual(self.login(account)["roles"], [role])
                for path in paths:
                    self.request("GET", path)
                self.request(
                    "GET",
                    "/training/my-courses",
                    expected=200 if role == "STAFF" else 403,
                )
                self.request(
                    "GET",
                    "/training/dashboard",
                    expected=200 if role == "ADMIN" else 403,
                )
                self.request(
                    "GET", "/admin/users", expected=200 if role == "ADMIN" else 403
                )

    def test_02_scopes_and_private_records(self):
        self.login("admin")
        self.request(
            "POST",
            "/training/events",
            expected=403,
            json={
                "title": "Out of scope",
                "starts_at": "2030-01-01T09:00:00+07:00",
                "department_id": "icu",
            },
        )
        self.request("GET", "/training/dashboard?department_id=icu", expected=403)
        self.request(
            "POST",
            "/admin/organization/groups",
            json={
                "name": "Regression group",
                "department_id": "emergency",
            },
        )
        self.login("staff")
        assignment = self.request("GET", "/training/my-courses").json()[0]
        self.login("staff2")
        self.request(
            "GET", f"/training/assignments/{assignment['id']}/attempts", expected=404
        )
        self.login("staff")
        conversation = self.request("POST", "/chat/conversations").json()
        self.login("staff2")
        self.request("GET", "/chat/conversations/" + conversation["id"], expected=404)

    def test_03_document_review_generation_learning_and_reporting(self):
        self.login("admin")
        uploaded = self.request(
            "POST",
            "/documents/upload",
            data={
                "title": "Regression workflow document",
                "department_id": "emergency",
                "scope": "DEPARTMENT",
            },
            files={
                "file": (
                    "regression.md",
                    "# Tai lieu gia lap\n\nNhan vien chuan bi phieu ban giao gia lap. Kiem tra noi dung, doi chieu thong tin va luu bai tap sau buoi hoc. Chi su dung de kiem thu phan mem.",
                    "text/markdown",
                )
            },
        ).json()
        job = self.request("GET", "/ai/jobs/" + uploaded["job_id"]).json()
        self.assertEqual(job["status"], "COMPLETED", job)
        doc_id, version_id = uploaded["document_id"], uploaded["version"]["id"]
        self.request(
            "POST",
            f"/documents/{doc_id}/submit-review",
            json={"version_id": version_id},
        )
        self.request(
            "POST",
            f"/documents/{doc_id}/approve",
            expected=403,
            json={"version_id": version_id},
        )
        self.login("reviewer")
        self.request(
            "POST", f"/documents/{doc_id}/approve", json={"version_id": version_id}
        )
        self.login("admin")
        generated = self.request(
            "POST", "/ai/generate-course", json={"version_ids": [version_id]}
        ).json()
        job = self.request("GET", "/ai/jobs/" + generated["job_id"]).json()
        self.assertEqual(job["status"], "COMPLETED", job)
        course_id, course_version = (
            job["result"]["course_id"],
            job["result"]["version_id"],
        )
        body = {"version_id": course_version}
        self.request("POST", f"/courses/{course_id}/submit-review", json=body)
        self.request("POST", f"/courses/{course_id}/approve", expected=403, json=body)
        self.login("reviewer")
        self.request("POST", f"/courses/{course_id}/approve", json=body)
        self.login("admin")
        detail = self.request("POST", f"/courses/{course_id}/publish", json=body).json()
        answers = {q["id"]: q["correct"] for q in detail["questions"]}
        assignments = self.request(
            "POST",
            "/training/assignments",
            json={
                "course_id": course_id,
                "user_ids": ["staff"],
                "due_date": (date.today() + timedelta(days=90)).isoformat(),
            },
        ).json()
        assignment_id = assignments[0]["id"]
        self.login("staff")
        self.request("GET", "/sources/" + version_id + "/file")
        learner = self.request(
            "GET", f"/courses/{course_id}?version_id={course_version}&learner=true"
        ).json()
        self.assertTrue(all("correct" not in q for q in learner["questions"]))
        self.request(
            "POST",
            f"/training/quizzes/{learner['quiz_id']}/submit",
            expected=409,
            json={"assignment_id": assignment_id, "answers": answers},
        )
        self.request("POST", f"/training/assignments/{assignment_id}/start")
        for lesson in learner["lessons"]:
            self.request(
                "POST",
                "/training/progress",
                json={"assignment_id": assignment_id, "lesson_id": lesson["id"]},
            )
        result = self.request(
            "POST",
            f"/training/quizzes/{learner['quiz_id']}/submit",
            json={"assignment_id": assignment_id, "answers": answers},
        ).json()
        self.assertEqual(result["score"], 100)
        self.assertTrue(result["passed"])
        self.assertEqual(result["assignment"]["status"], "COMPLETED")
        self.request("GET", f"/training/assignments/{assignment_id}/attempts")
        self.login("admin")
        report = self.request(
            "GET", "/training/dashboard?course_id=" + course_id
        ).json()
        self.assertEqual(len(report["assignments"]), 1)
        self.assertEqual(report["assignments"][0]["status"], "COMPLETED")

    def test_04_chat_citations_feedback_and_notifications(self):
        self.login("staff")
        answer = self.request(
            "POST",
            "/chat/query",
            json={"question": "Chuan bi phieu ban giao gia lap nhu the nao?"},
        ).json()
        self.assertTrue(answer["citations"])
        self.request(
            "POST", f"/chat/messages/{answer['id']}/rating", json={"helpful": True}
        )
        feedback = self.request(
            "POST",
            "/feedback",
            json={"feature": "Regression", "rating": 4, "issues": "Sample feedback"},
        ).json()
        self.login("admin")
        self.request(
            "PUT", "/admin/feedback/" + feedback["id"], json={"status": "RESOLVED"}
        )
        event = self.request(
            "POST",
            "/training/events",
            json={
                "title": "Regression calendar event",
                "starts_at": "2030-01-01T09:00:00+07:00",
                "department_id": "emergency",
                "group_id": "new-nurses",
                "location": "Demo room",
            },
        ).json()
        self.login("staff")
        calendar = self.request("GET", "/training/calendar").json()
        scheduled = next(item for item in calendar if item["id"] == event["id"])
        self.assertEqual(scheduled["date"], "2030-01-01T02:00:00Z")
        self.assertTrue(self.request("GET", "/reminders").json())

    def test_05_committed_data_survives_application_restart(self):
        self.login("admin")
        event = self.request(
            "POST",
            "/training/events",
            json={
                "title": "Persisted after restart",
                "starts_at": "2030-02-01T09:00:00Z",
                "department_id": "emergency",
            },
        ).json()
        self.client.__exit__(None, None, None)
        self.db.engine.dispose()
        self.client = TestClient(self.app)
        self.client.__enter__()
        self.login("admin")
        self.assertIn(
            event["id"],
            {item["id"] for item in self.request("GET", "/training/calendar").json()},
        )
        with self.db.engine.connect() as connection:
            self.assertEqual(
                connection.scalar(text("SELECT version_num FROM alembic_version")),
                self.expected_revision,
            )
            if connection.dialect.name == "sqlite":
                self.assertEqual(
                    connection.scalar(text("PRAGMA integrity_check")), "ok"
                )
                self.assertFalse(
                    connection.execute(text("PRAGMA foreign_key_check")).fetchall()
                )


if __name__ == "__main__":
    unittest.main()
