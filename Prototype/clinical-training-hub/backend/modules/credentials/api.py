from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import has_role, require
from backend.models.credentials import StaffCredential
from backend.models.identity import User
from backend.modules.credentials.schemas import CredentialInput
from backend.modules.credentials.services import credential_dict, save_credential

router = APIRouter(prefix="/api")


@router.get("/credentials")
def credentials(user=Depends(require("ADMIN", "STAFF")), db: Session = Depends(get_db)):
    return [
        credential_dict(db, c)
        for c in db.scalars(
            select(StaffCredential).order_by(StaffCredential.expiry_date)
        )
        if has_role(user, "ADMIN", department_id=db.get(User, c.user_id).department_id)
        or c.user_id == user.id
    ]


@router.post("/credentials")
def create_credential(
    body: CredentialInput, user=Depends(require("ADMIN")), db: Session = Depends(get_db)
):
    return save_credential(db, body, user)


@router.put("/credentials/{cid}")
def edit_credential(
    cid: str,
    body: CredentialInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    c = db.get(StaffCredential, cid)
    if not c:
        raise HTTPException(404, "Không tìm thấy chứng chỉ.")
    return save_credential(db, body, user, c)
