"""Model registration shared by Alembic and application startup."""

from .administration import AuditLog, Setting
from .assistant import ChatConversation, ChatMessage
from .calendar import TrainingEvent
from .courses import (
    AnswerOption,
    Checklist,
    ChecklistItem,
    ContentApproval,
    Course,
    CourseSourceDocument,
    CourseVersion,
    Lesson,
    Quiz,
    QuizQuestion,
)
from .credentials import StaffCredential
from .documents import (
    Document,
    DocumentChunk,
    DocumentPermission,
    DocumentReview,
    DocumentVersion,
    SourceCitation,
)
from .feedback import Feedback
from .identity import (
    AuthSession,
    Department,
    GroupMembership,
    Role,
    StaffGroup,
    User,
    UserRole,
)
from .jobs import BackgroundJob
from .notifications import Reminder
from .training import CourseAssignment, LessonProgress, QuizAnswer, QuizAttempt

__all__ = [
    "Role",
    "Department",
    "StaffGroup",
    "User",
    "UserRole",
    "GroupMembership",
    "AuthSession",
    "AuditLog",
    "Setting",
    "Document",
    "DocumentPermission",
    "DocumentVersion",
    "DocumentChunk",
    "SourceCitation",
    "DocumentReview",
    "ChatConversation",
    "ChatMessage",
    "BackgroundJob",
    "Course",
    "CourseVersion",
    "CourseSourceDocument",
    "Lesson",
    "Checklist",
    "ChecklistItem",
    "Quiz",
    "QuizQuestion",
    "AnswerOption",
    "ContentApproval",
    "CourseAssignment",
    "LessonProgress",
    "QuizAttempt",
    "QuizAnswer",
    "TrainingEvent",
    "StaffCredential",
    "Reminder",
    "Feedback",
]
