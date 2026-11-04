def serialize_version(v):
    return {
        k: getattr(v, k)
        for k in (
            "id",
            "document_id",
            "number",
            "status",
            "processing",
            "filename",
            "created_at",
            "error",
            "effective_date",
            "review_date",
        )
    }


def citation(chunk, doc):
    return {
        "id": chunk.id,
        "document_id": doc.id,
        "version_id": chunk.version_id,
        "title": doc.title,
        "page": chunk.page,
        "section": chunk.section,
        "text": chunk.text,
    }
