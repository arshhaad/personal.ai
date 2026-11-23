import json
import logging
from datetime import timedelta
import requests
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
PERMISSION_DESCRIPTION = 'Allow Personal Assistant AI to create and manage files that you select or create with this application.'


def exchange_drive_code(code, redirect_uri='postmessage'):
    """
    Exchange Google authorization code for Google Drive access and refresh tokens.
    """
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        'code': code,
        'client_id': settings.GOOGLE_CLIENT_ID,
        'client_secret': settings.GOOGLE_CLIENT_SECRET,
        'redirect_uri': redirect_uri or 'postmessage',
        'grant_type': 'authorization_code',
    }
    response = requests.post(token_url, data=data, timeout=12)
    if not response.ok:
        logger.error(f"Google Drive code exchange failed: {response.text}")
        raise ValueError(f"Failed to exchange Google Drive authorization code: {response.text}")
    return response.json()


def refresh_drive_access_token(refresh_token):
    """
    Refresh Google Drive access token using the stored refresh token.
    """
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        'client_id': settings.GOOGLE_CLIENT_ID,
        'client_secret': settings.GOOGLE_CLIENT_SECRET,
        'refresh_token': refresh_token,
        'grant_type': 'refresh_token',
    }
    response = requests.post(token_url, data=data, timeout=12)
    if not response.ok:
        logger.error(f"Google Drive token refresh failed: {response.text}")
        raise ValueError("Failed to refresh Google Drive session. Reconnection required.")
    return response.json()


def ensure_valid_drive_token(integration):
    """
    Checks if Google Drive integration has a valid access token.
    Refreshes it automatically if expired or expiring within 60 seconds.
    """
    if not integration.is_connected:
        raise ValueError("Google Drive is not connected for this user.")

    now = timezone.now()
    # Check if expired or about to expire in next 60 seconds
    if integration.token_expiry and integration.token_expiry <= now + timedelta(seconds=60):
        if not integration.refresh_token:
            raise ValueError("No refresh token available to renew Google Drive session.")

        refreshed = refresh_drive_access_token(integration.refresh_token)
        integration.access_token = refreshed.get('access_token', integration.access_token)
        expires_in = refreshed.get('expires_in', 3600)
        integration.token_expiry = now + timedelta(seconds=expires_in)
        integration.save()

    return integration.access_token


def fetch_drive_user_info(access_token):
    """
    Fetch connected Google Drive account profile details.
    """
    about_url = "https://www.googleapis.com/drive/v3/about?fields=user"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(about_url, headers=headers, timeout=10)
    if response.ok:
        data = response.json()
        user_info = data.get('user', {})
        return {
            'email': user_info.get('emailAddress', ''),
            'display_name': user_info.get('displayName', ''),
            'photo_link': user_info.get('photoLink', ''),
        }
    return {}


def list_user_drive_files(access_token, page_size=30):
    """
    Lists files accessible with the drive.file scope or owned by user.
    """
    files_url = "https://www.googleapis.com/drive/v3/files"
    headers = {"Authorization": f"Bearer {access_token}"}
    params = {
        'pageSize': page_size,
        'fields': 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink)',
        'q': "trashed = false",
        'orderBy': 'modifiedTime desc',
    }
    response = requests.get(files_url, headers=headers, params=params, timeout=12)
    if not response.ok:
        logger.error(f"Failed to list Google Drive files: {response.text}")
        raise ValueError(f"Failed to fetch files from Google Drive: {response.text}")
    return response.json().get('files', [])


def download_drive_file_content(access_token, file_id, mime_type=None):
    """
    Downloads raw binary content of a file from Google Drive.
    If the file is a Google Doc or Google Sheet, exports it to PDF.
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    # If Google Workspace Doc/Sheet, use export endpoint
    if mime_type == 'application/vnd.google-apps.document':
        export_url = f"https://www.googleapis.com/drive/v3/files/{file_id}/export?mimeType=application/pdf"
        response = requests.get(export_url, headers=headers, timeout=30)
        if not response.ok:
            raise ValueError(f"Failed to export Google Document: {response.text}")
        return response.content, 'application/pdf', '.pdf'

    elif mime_type == 'application/vnd.google-apps.spreadsheet':
        export_url = f"https://www.googleapis.com/drive/v3/files/{file_id}/export?mimeType=application/pdf"
        response = requests.get(export_url, headers=headers, timeout=30)
        if not response.ok:
            raise ValueError(f"Failed to export Google Spreadsheet: {response.text}")
        return response.content, 'application/pdf', '.pdf'

    else:
        # Standard binary or text download
        download_url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
        response = requests.get(download_url, headers=headers, timeout=30)
        if not response.ok:
            raise ValueError(f"Failed to download Google Drive file: {response.text}")
        return response.content, mime_type, ''


def revoke_drive_token(token):
    """
    Revoke Google Drive access/refresh token.
    """
    if not token:
        return
    revoke_url = f"https://oauth2.googleapis.com/revoke?token={token}"
    try:
        requests.post(revoke_url, timeout=5)
    except Exception as e:
        logger.warning(f"Error revoking token with Google: {e}")


def get_or_create_app_folder(access_token, folder_name="Personal AI Documents"):
    """
    Finds or creates a dedicated folder in the user's Google Drive to store documents
    uploaded via this application.
    Restricted to application-accessible files (drive.file scope).
    """
    headers = {"Authorization": f"Bearer {access_token}"}
    files_url = "https://www.googleapis.com/drive/v3/files"

    safe_name = folder_name.replace("'", "\\'")
    query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{safe_name}' and trashed = false"
    params = {
        'q': query,
        'fields': 'files(id, name)',
        'pageSize': 1,
    }

    try:
        res = requests.get(files_url, headers=headers, params=params, timeout=12)
        if res.ok:
            files = res.json().get('files', [])
            if files:
                return files[0]['id']
    except Exception as e:
        logger.warning(f"Failed to query existing Drive folder '{folder_name}': {e}")

    # Not found or error: create the dedicated folder
    create_body = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder',
        'description': 'Dedicated storage folder for documents uploaded via this web application.',
    }
    create_res = requests.post(files_url, headers=headers, json=create_body, timeout=12)
    if not create_res.ok:
        logger.error(f"Failed to create Google Drive folder '{folder_name}': {create_res.text}")
        raise ValueError(f"Could not create Google Drive folder: {create_res.text}")

    return create_res.json().get('id')


def upload_file_to_drive(access_token, folder_id, file_name, file_bytes, mime_type=None):
    """
    Uploads a file directly into a specific folder in the user's Google Drive
    using multipart upload.
    Returns metadata dict with 'id', 'name', 'webViewLink'.
    """
    upload_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,iconLink"
    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    if not mime_type:
        mime_type = 'application/octet-stream'

    metadata = {
        'name': file_name,
    }
    if folder_id:
        metadata['parents'] = [folder_id]

    files = {
        'data': ('metadata', json.dumps(metadata), 'application/json; charset=UTF-8'),
        'file': (file_name, file_bytes, mime_type),
    }

    response = requests.post(upload_url, headers=headers, files=files, timeout=40)
    if not response.ok:
        logger.error(f"Failed to upload file '{file_name}' to Google Drive: {response.text}")
        raise ValueError(f"Google Drive upload failed: {response.text}")

    return response.json()


def delete_drive_file(access_token, file_id):
    """
    Permanently deletes a file from the user's Google Drive.
    Only deletes files uploaded/created by this app (drive.file scope).
    """
    if not file_id:
        return False
    delete_url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        response = requests.delete(delete_url, headers=headers, timeout=12)
        if response.status_code in [200, 204, 404, 410]:
            return True
        logger.warning(f"Google Drive file delete warning for {file_id}: {response.text}")
        return False
    except Exception as e:
        logger.warning(f"Failed to delete Google Drive file {file_id}: {e}")
        return False
