from fastapi import APIRouter

from backend.api.health import router as health_router
from backend.modules.administration.api import router as administration_router
from backend.modules.assistant.api import router as assistant_router
from backend.modules.calendar.api import router as calendar_router
from backend.modules.courses.api import router as courses_router
from backend.modules.credentials.api import router as credentials_router
from backend.modules.documents.api import router as documents_router
from backend.modules.feedback.api import router as feedback_router
from backend.modules.identity.api import router as identity_router
from backend.modules.jobs.api import router as jobs_router
from backend.modules.notifications.api import router as notifications_router
from backend.modules.organization.api import router as organization_router
from backend.modules.reports.api import router as reports_router
from backend.modules.training.api import router as training_router

router = APIRouter()
router.include_router(health_router)
router.include_router(identity_router)
router.include_router(organization_router)
router.include_router(administration_router)
router.include_router(documents_router)
router.include_router(assistant_router)
router.include_router(jobs_router)
router.include_router(courses_router)
router.include_router(training_router)
router.include_router(reports_router)
router.include_router(calendar_router)
router.include_router(credentials_router)
router.include_router(notifications_router)
router.include_router(feedback_router)
