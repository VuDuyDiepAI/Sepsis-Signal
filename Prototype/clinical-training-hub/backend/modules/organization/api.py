from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import (
    audit,
    current_user,
    departments_for,
    ensure_scope,
    has_role,
    require,
)
from backend.models.identity import Department, StaffGroup
from backend.modules.organization.schemas import OrgInput

router = APIRouter(prefix="/api")


@router.post("/admin/organization/{kind}")
def create_org(
    kind: str,
    body: OrgInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    if kind == "departments":
        raise HTTPException(
            403,
            "Quản trị cấp khoa không được tạo khoa mới hoặc tự mở rộng phạm vi. Chỉ được cập nhật khoa đã được cấp quyền.",
        )
    elif kind == "groups":
        ensure_scope(user, body.department_id, "ADMIN")
        if not db.get(Department, body.department_id):
            raise HTTPException(422, "Cần chọn khoa/phòng hợp lệ.")
        item = StaffGroup(name=body.name, department_id=body.department_id)
    else:
        raise HTTPException(404, "Không tìm thấy loại tổ chức.")
    db.add(item)
    db.flush()
    audit(db, user, "organization.create", item.id, department_id=body.department_id)
    db.commit()
    return {"id": item.id, "name": item.name}


@router.put("/admin/organization/departments/{did}")
def edit_department(
    did: str,
    body: OrgInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    ensure_scope(user, did, "ADMIN")
    d = db.get(Department, did)
    if not d:
        raise HTTPException(404, "Không tìm thấy khoa/phòng.")
    if db.scalar(
        select(Department.id).where(Department.name == body.name, Department.id != did)
    ):
        raise HTTPException(409, "Tên khoa/phòng đã tồn tại.")
    d.name = body.name
    audit(db, user, "organization.update", did, department_id=did)
    db.commit()
    return {"id": d.id, "name": d.name}


@router.put("/admin/organization/groups/{gid}")
def edit_group(
    gid: str,
    body: OrgInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    group = db.get(StaffGroup, gid)
    if not group:
        raise HTTPException(404, "Không tìm thấy nhóm.")
    ensure_scope(user, group.department_id, "ADMIN")
    if body.department_id and body.department_id != group.department_id:
        raise HTTPException(422, "Không thay khoa của nhóm đang có thành viên.")
    group.name = body.name
    audit(db, user, "organization.update", gid, department_id=group.department_id)
    db.commit()
    return {"id": group.id, "name": group.name}


@router.get("/organization")
def organization(user=Depends(current_user), db: Session = Depends(get_db)):
    return {
        "departments": [
            {
                "id": d.id,
                "name": d.name,
                "can_admin": has_role(user, "ADMIN", department_id=d.id),
                "can_manage": has_role(user, "ADMIN", department_id=d.id),
            }
            for d in db.scalars(select(Department))
            if d.id in departments_for(user)
        ],
        "groups": [
            {
                "id": g.id,
                "name": g.name,
                "department_id": g.department_id,
                "can_admin": has_role(user, "ADMIN", department_id=g.department_id),
                "can_manage": has_role(user, "ADMIN", department_id=g.department_id),
            }
            for g in db.scalars(select(StaffGroup))
            if g.department_id in departments_for(user)
        ],
    }
