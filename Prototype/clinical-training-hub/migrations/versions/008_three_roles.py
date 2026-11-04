"""Separate Admin, Reviewer and Staff without deleting business or learning records."""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"


def tables():
    return (
        sa.table("user_roles", sa.column("user_id", sa.String), sa.column("role_id", sa.String), sa.column("department_id", sa.String), sa.column("review_specialties", sa.JSON)),
        sa.table("settings", sa.column("key", sa.String), sa.column("value", sa.JSON)),
    )


def upgrade():
    conn = op.get_bind()
    grants, settings = tables()
    users = list(conn.execute(sa.text("SELECT id,role,department_id FROM users")).mappings())
    original = [dict(g) for g in conn.execute(sa.select(grants)).mappings()]
    conn.execute(settings.insert().values(key="rbac_three_roles_008", value={"users": [dict(u) for u in users], "grants": original}))
    conn.execute(sa.text("DELETE FROM user_roles"))
    for user in users:
        rows = [g for g in original if g["user_id"] == user["id"]]
        roles = {g["role_id"] for g in rows} or {user["role"]}
        mode = "ADMIN" if roles & {"ADMIN", "MANAGER"} else "REVIEWER" if "REVIEWER" in roles else "STAFF"
        relevant = [g for g in rows if g["role_id"] in ({"ADMIN", "MANAGER"} if mode == "ADMIN" else {mode})]
        scopes = {}
        for g in relevant:
            scopes.setdefault(g["department_id"], set()).update(g["review_specialties"] or [])
        if not scopes:
            scopes[user["department_id"]] = set()
        for dep, specialties in scopes.items():
            conn.execute(grants.insert().values(user_id=user["id"],role_id=mode,department_id=dep,review_specialties=sorted(specialties) if mode=="REVIEWER" else []))
        conn.execute(sa.text("UPDATE users SET role=:role WHERE id=:id"), {"role":mode,"id":user["id"]})
    conn.execute(sa.text("DELETE FROM roles WHERE id='MANAGER'"))


def downgrade():
    conn=op.get_bind()
    grants,settings=tables()
    snapshot=conn.execute(sa.select(settings.c.value).where(settings.c.key=="rbac_three_roles_008")).scalar_one()
    if not conn.execute(sa.text("SELECT id FROM roles WHERE id='MANAGER'")).first():
        conn.execute(sa.text("INSERT INTO roles (id,name) VALUES ('MANAGER',:name)"),{"name":"Quản lý đào tạo"})
    for user in snapshot["users"]:
        if conn.execute(sa.text("SELECT id FROM users WHERE id=:id"),{"id":user["id"]}).first():
            conn.execute(grants.delete().where(grants.c.user_id==user["id"]))
            for row in snapshot["grants"]:
                if row["user_id"]==user["id"]:conn.execute(grants.insert().values(**row))
            conn.execute(sa.text("UPDATE users SET role=:role WHERE id=:id"),{"role":user["role"],"id":user["id"]})
    conn.execute(settings.delete().where(settings.c.key=="rbac_three_roles_008"))
