from backend.models.identity import User


def feedback_dict(db, f):
    return {
        **{
            k: getattr(f, k)
            for k in (
                "id",
                "feature",
                "rating",
                "positives",
                "issues",
                "suggestions",
                "status",
                "created_at",
            )
        },
        "name": db.get(User, f.user_id).name,
    }
