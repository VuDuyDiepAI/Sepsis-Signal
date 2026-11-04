from backend.core.security import has_role
from backend.models.documents import Document, DocumentVersion
from backend.models.identity import User


def job_departments(db, j):
    if j.kind == "INGEST":
        v = db.get(DocumentVersion, j.target_id)
        if v:
            return {db.get(Document, v.document_id).department_id}
    deps = {
        db.get(Document, db.get(DocumentVersion, vid).document_id).department_id
        for vid in j.result.get("version_ids", [])
        if db.get(DocumentVersion, vid)
    }
    owner = db.get(User, j.user_id)
    return deps or ({owner.department_id} if owner else set())


def job_access(db, user, j):
    deps = job_departments(db, j)
    return bool(deps) and all((has_role(user, "ADMIN", department_id=d) for d in deps))
