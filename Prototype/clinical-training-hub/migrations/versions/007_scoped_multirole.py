"""Non-destructive multi-role grants, clinical scope and review submitter attribution."""

import json
from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"


def upgrade():
    op.create_table(
        "user_roles",
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True
        ),
        sa.Column(
            "role_id", sa.String(30), sa.ForeignKey("roles.id"), primary_key=True
        ),
        sa.Column(
            "department_id",
            sa.String(36),
            sa.ForeignKey("departments.id"),
            primary_key=True,
        ),
        sa.Column("review_specialties", sa.JSON(), nullable=False),
    )
    for table, column, target in [
        ("document_versions", "submitted_by", "users.id"),
        ("course_versions", "submitted_by", "users.id"),
        ("audit_logs", "department_id", "departments.id"),
        ("feedback", "department_id", "departments.id"),
    ]:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column(column, sa.String(36), nullable=True))
            batch.create_foreign_key(
                f"fk_{table}_{column}", target.split(".")[0], [column], ["id"]
            )
    op.create_index("ix_audit_logs_department_id", "audit_logs", ["department_id"])
    op.create_index("ix_feedback_department_id", "feedback", ["department_id"])
    conn = op.get_bind()
    grants = sa.table(
        "user_roles",
        sa.column("user_id", sa.String),
        sa.column("role_id", sa.String),
        sa.column("department_id", sa.String),
        sa.column("review_specialties", sa.JSON),
    )
    for u in conn.execute(
        sa.text("SELECT id, role, department_id,title FROM users")
    ).mappings():
        defaults = {"STAFF", u["role"]}
        if u["title"] in ("Trưởng khoa (Bác sĩ)", "Trưởng khoa", "Điều dưỡng trưởng"):
            defaults.update(("ADMIN", "MANAGER", "REVIEWER"))
        for role in sorted(defaults):
            specialties = []
            if role == "REVIEWER":
                specialties = list(
                    conn.execute(
                        sa.text(
                            "SELECT DISTINCT specialty FROM documents WHERE department_id=:dep"
                        ),
                        {"dep": u["department_id"]},
                    ).scalars()
                )
                if not specialties:
                    specialties = [
                        {"emergency": "Cấp cứu", "icu": "Hồi sức tích cực"}.get(
                            u["department_id"], "Chưa phân công"
                        )
                    ]
            conn.execute(
                grants.insert().values(
                    user_id=u["id"],
                    role_id=role,
                    department_id=u["department_id"],
                    review_specialties=specialties,
                )
            )
    for table in ("audit_logs", "feedback"):
        conn.execute(
            sa.text(
                f"UPDATE {table} SET department_id=(SELECT department_id FROM users WHERE users.id={table}.user_id)"
            )
        )
    conn.execute(
        sa.text(
            "UPDATE document_versions SET submitted_by=COALESCE((SELECT user_id FROM audit_logs WHERE action='document.submit-review' AND target_id=document_versions.id ORDER BY created_at DESC,id DESC LIMIT 1),uploader_id) WHERE status IN ('PENDING_REVIEW','APPROVED')"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE course_versions SET submitted_by=COALESCE((SELECT user_id FROM audit_logs WHERE action='course.submit-review' AND target_id=course_versions.id ORDER BY created_at DESC,id DESC LIMIT 1),author_id) WHERE status IN ('PENDING_REVIEW','APPROVED','PUBLISHED')"
        )
    )
    # Attribute old clinical audit records to their resource, not an actor's home department.
    conn.execute(
        sa.text(
            "UPDATE audit_logs SET department_id=(SELECT d.department_id FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE v.id=audit_logs.target_id) WHERE action LIKE 'document.%'"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE audit_logs SET department_id=(SELECT CASE WHEN COUNT(DISTINCT d.department_id)=1 THEN MIN(d.department_id) ELSE NULL END FROM course_versions cv JOIN course_sources cs ON cs.course_version_id=cv.id JOIN document_versions dv ON dv.id=cs.document_version_id JOIN documents d ON d.id=dv.document_id WHERE cv.id=audit_logs.target_id OR cv.course_id=audit_logs.target_id) WHERE action LIKE 'course.%'"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE audit_logs SET department_id=(SELECT u.department_id FROM users u WHERE u.id=audit_logs.target_id) WHERE action IN ('user.save','user.permissions')"
        )
    )


def downgrade():
    conn = op.get_bind()
    for row in conn.execute(
        sa.text(
            "SELECT ur.role_id,ur.department_id,u.role,u.department_id AS home FROM user_roles ur JOIN users u ON u.id=ur.user_id"
        )
    ).mappings():
        if (
            row["role_id"] not in ("STAFF", row["role"])
            or row["department_id"] != row["home"]
        ):
            raise RuntimeError(
                "Downgrade 007 would lose multiple or scoped permissions. Restore a verified backup instead."
            )
    op.drop_table("user_roles")
    for table, column in [
        ("feedback", "department_id"),
        ("audit_logs", "department_id"),
        ("course_versions", "submitted_by"),
        ("document_versions", "submitted_by"),
    ]:
        if column == "department_id":
            op.drop_index(f"ix_{table}_{column}", table_name=table)
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(f"fk_{table}_{column}", type_="foreignkey")
            batch.drop_column(column)
