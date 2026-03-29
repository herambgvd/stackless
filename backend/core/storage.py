from __future__ import annotations

import io
import uuid
from datetime import timedelta
from typing import Optional

from minio import Minio
from minio.error import S3Error

from core.config import get_settings

_client: Optional[Minio] = None


def get_storage_client() -> Minio:
    global _client
    if _client is None:
        settings = get_settings()
        _client = Minio(
            settings.RUSTFS_ENDPOINT,
            access_key=settings.RUSTFS_ACCESS_KEY,
            secret_key=settings.RUSTFS_SECRET_KEY,
            secure=settings.RUSTFS_USE_SSL,
        )
        # Ensure bucket exists
        try:
            if not _client.bucket_exists(settings.RUSTFS_BUCKET_NAME):
                _client.make_bucket(settings.RUSTFS_BUCKET_NAME)
        except S3Error:
            pass
    return _client


async def upload_file(
    file_bytes: bytes,
    content_type: str,
    original_filename: str,
    tenant_id: str,
    app_id: str,
    model_slug: str,
) -> dict:
    """
    Upload file to S3, return metadata dict stored in the record's FILE field value.
    Object key: {tenant_id}/{app_id}/{model_slug}/{uuid}_{filename}
    """
    import asyncio
    settings = get_settings()
    client = get_storage_client()

    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else ""
    object_key = f"{tenant_id}/{app_id}/{model_slug}/{uuid.uuid4().hex}_{original_filename}"

    def _upload():
        client.put_object(
            bucket_name=settings.RUSTFS_BUCKET_NAME,
            object_name=object_key,
            data=io.BytesIO(file_bytes),
            length=len(file_bytes),
            content_type=content_type,
        )

    await asyncio.get_event_loop().run_in_executor(None, _upload)

    return {
        "key": object_key,
        "filename": original_filename,
        "content_type": content_type,
        "size": len(file_bytes),
        "bucket": settings.RUSTFS_BUCKET_NAME,
    }


async def get_presigned_url(object_key: str, expires_seconds: int = 3600) -> str:
    """Return a presigned GET URL for the given object key."""
    import asyncio
    settings = get_settings()
    client = get_storage_client()

    def _presign():
        return client.presigned_get_object(
            bucket_name=settings.RUSTFS_BUCKET_NAME,
            object_name=object_key,
            expires=timedelta(seconds=expires_seconds),
        )

    return await asyncio.get_event_loop().run_in_executor(None, _presign)


async def delete_file(object_key: str) -> None:
    """Delete an object from S3."""
    import asyncio
    settings = get_settings()
    client = get_storage_client()

    def _delete():
        try:
            client.remove_object(settings.RUSTFS_BUCKET_NAME, object_key)
        except S3Error:
            pass

    await asyncio.get_event_loop().run_in_executor(None, _delete)
