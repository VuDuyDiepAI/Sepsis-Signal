import os
from sqlalchemy import select
from .models import (
    Role,
    Department,
    User,
    StaffGroup,
    GroupMembership,
    UserRole,
)
from .auth import hash_password

ROLES = {
    "ADMIN": "Quản trị viên",
    "REVIEWER": "Chuyên gia kiểm duyệt",
    "STAFF": "Nhân viên y tế",
}


def seed(db):
    for k, v in ROLES.items():
        if not db.get(Role, k):
            db.add(Role(id=k, name=v))
    for key, name in [("emergency", "Khoa Cấp cứu"), ("icu", "Hồi sức tích cực")]:
        if not db.get(Department, key):
            db.add(Department(id=key, name=name))
    db.flush()
    if db.scalar(select(User.id).limit(1)):
        db.commit()
        return
    if os.getenv("DEMO_MODE", "true").lower() != "true":
        email = os.getenv("BOOTSTRAP_ADMIN_EMAIL")
        password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD")
        if email and password and len(password) >= 12:
            admin = User(
                name="Quản trị viên",
                email=email.lower(),
                staff_code="ADMIN-001",
                role="ADMIN",
                department_id="emergency",
                title="Quản trị hệ thống",
                password_hash=hash_password(password),
            )
            db.add(admin)
            db.flush()
            db.add_all(
                UserRole(
                    user_id=admin.id,
                    role_id=r,
                    department_id=admin.department_id,
                    review_specialties=[],
                )
                for r in ("ADMIN",)
            )
            db.commit()
        else:
            db.commit()
        return
    db.add(
        StaffGroup(id="new-nurses", name="Điều dưỡng mới", department_id="emergency")
    )
    names = [
        ("admin", "Nguyễn Minh An", "ADMIN"),
        ("manager", "Trần Thu Hà", "ADMIN"),
        ("reviewer", "Lê Hoàng Minh", "REVIEWER"),
        ("staff", "Phạm Ngọc Linh", "STAFF"),
        ("staff2", "Đỗ Thanh Mai", "STAFF"),
    ]
    for i, (key, name, role) in enumerate(names):
        db.add(
            User(
                id=key,
                name=name,
                email=f"{key}@demo.local",
                staff_code=f"DEMO-{i + 1:03}",
                role=role,
                department_id="emergency",
                title={"admin":"Trưởng khoa (Bác sĩ)","manager":"Điều dưỡng trưởng","reviewer":"Bác sĩ","staff":"Điều dưỡng","staff2":"Bác sĩ"}[key],
                password_hash=hash_password(os.getenv("DEMO_PASSWORD", "Demo@2026!")),
            )
        )
    db.flush()
    db.add_all(UserRole(user_id=key,role_id=role,department_id="emergency",review_specialties=["Cấp cứu"] if role=="REVIEWER" else []) for key,_,role in names)
    db.add_all(
        [GroupMembership(user_id=k, group_id="new-nurses") for k in ("staff", "staff2")]
    )
    db.commit()
