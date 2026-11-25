import base64
import logging
import re
from datetime import datetime, timedelta
from email.mime.text import MIMEText
import requests
from django.utils import timezone

from .google_drive_service import (
    GoogleDriveAPIError,
    exchange_drive_code as exchange_google_code,
    ensure_valid_drive_token as ensure_valid_google_token,
    revoke_drive_token as revoke_google_token,
)

logger = logging.getLogger(__name__)

GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send'


def parse_google_workspace_error(response, service_label="Google Workspace", api_slug="", default_msg="Google API request failed."):
    """
    Parse Google Workspace (Calendar / Gmail) API errors into clean, actionable GoogleDriveAPIError objects,
    extracting SERVICE_DISABLED enablement links when applicable.
    """
    try:
        data = response.json()
        error_info = data.get('error', {})
        msg = error_info.get('message', '') if isinstance(error_info, dict) else str(error_info)
        details = error_info.get('details', []) if isinstance(error_info, dict) else []
        errors_list = error_info.get('errors', []) if isinstance(error_info, dict) else []

        is_disabled = False
        project_id = None

        for item in details:
            if item.get('reason') == 'SERVICE_DISABLED':
                is_disabled = True
                consumer = item.get('metadata', {}).get('consumer', '')
                if 'projects/' in consumer:
                    project_id = consumer.split('projects/')[-1]
                break

        for err in errors_list:
            if err.get('reason') == 'accessNotConfigured':
                is_disabled = True
                break

        if 'has not been used in project' in msg or 'it is disabled' in msg or is_disabled:
            match = re.search(r'(https://console\.developers\.google\.com/apis/api/[^\s]+)', msg)
            if match:
                enable_url = match.group(1).rstrip('.,)"\'')
            elif project_id and api_slug:
                enable_url = f"https://console.developers.google.com/apis/api/{api_slug}/overview?project={project_id}"
            elif api_slug:
                enable_url = f"https://console.developers.google.com/apis/library/{api_slug}"
            else:
                enable_url = "https://console.developers.google.com/apis/library"

            clean_msg = (
                f"{service_label} API is not enabled in your Google Cloud Console project. "
                f"Please enable it in Google Cloud Console."
            )
            return GoogleDriveAPIError(
                clean_msg,
                is_api_disabled=True,
                enable_url=enable_url,
                project_id=project_id,
                status_code=403,
            )

        if msg:
            return GoogleDriveAPIError(msg, status_code=response.status_code)
    except Exception:
        pass

    return GoogleDriveAPIError(default_msg, status_code=response.status_code)


def fetch_google_account_profile(access_token):
    """Fetch basic Google account email & display name from OAuth2 userinfo endpoint."""
    try:
        resp = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if resp.ok:
            data = resp.json()
            return {
                'email': data.get('email', ''),
                'display_name': data.get('name', ''),
            }
    except Exception as e:
        logger.warning(f"Failed to fetch Google userinfo: {e}")
    return {}


# ============================================================================
# Google Calendar API Operations
# ============================================================================

def list_calendar_events(access_token, days=14, max_results=25):
    """List upcoming events from the user's primary Google Calendar."""
    now = timezone.now()
    time_min = now.isoformat()
    time_max = (now + timedelta(days=days)).isoformat()

    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    headers = {"Authorization": f"Bearer {access_token}"}
    params = {
        'timeMin': time_min,
        'timeMax': time_max,
        'maxResults': max_results,
        'singleEvents': 'true',
        'orderBy': 'startTime',
    }
    resp = requests.get(url, headers=headers, params=params, timeout=12)
    if not resp.ok:
        logger.error(f"Google Calendar list error: {resp.text}")
        raise parse_google_workspace_error(
            resp,
            service_label="Google Calendar",
            api_slug="calendar-json.googleapis.com",
            default_msg="Failed to fetch Google Calendar events.",
        )

    items = resp.json().get('items', [])
    events = []
    for item in items:
        start_obj = item.get('start', {})
        end_obj = item.get('end', {})
        events.append({
            'id': item.get('id', ''),
            'summary': item.get('summary') or '(No title)',
            'description': item.get('description', ''),
            'location': item.get('location', ''),
            'start': start_obj.get('dateTime') or start_obj.get('date', ''),
            'end': end_obj.get('dateTime') or end_obj.get('date', ''),
            'is_all_day': 'date' in start_obj and 'dateTime' not in start_obj,
            'html_link': item.get('htmlLink', ''),
            'status': item.get('status', 'confirmed'),
        })
    return events


def create_calendar_event(access_token, summary, start_time, end_time, description='', location=''):
    """Create a new event on the user's primary Google Calendar."""
    if isinstance(start_time, datetime):
        start_iso = start_time.isoformat()
    else:
        start_iso = str(start_time)
    if isinstance(end_time, datetime):
        end_iso = end_time.isoformat()
    else:
        end_iso = str(end_time)

    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    payload = {
        'summary': summary,
        'description': description or '',
        'location': location or '',
        'start': {'dateTime': start_iso},
        'end': {'dateTime': end_iso},
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=12)
    if not resp.ok:
        logger.error(f"Google Calendar create error: {resp.text}")
        raise parse_google_workspace_error(
            resp,
            service_label="Google Calendar",
            api_slug="calendar-json.googleapis.com",
            default_msg="Failed to create Google Calendar event.",
        )

    item = resp.json()
    return {
        'id': item.get('id', ''),
        'summary': item.get('summary', summary),
        'description': item.get('description', ''),
        'location': item.get('location', ''),
        'start': item.get('start', {}).get('dateTime', start_iso),
        'end': item.get('end', {}).get('dateTime', end_iso),
        'html_link': item.get('htmlLink', ''),
    }


def delete_calendar_event(access_token, event_id):
    """Delete an event from the user's primary Google Calendar."""
    if not event_id:
        raise ValueError("Calendar event ID is required.")
    url = f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.delete(url, headers=headers, timeout=12)
    if resp.status_code in [200, 204, 404, 410]:
        return True
    raise parse_google_workspace_error(
        resp,
        service_label="Google Calendar",
        api_slug="calendar-json.googleapis.com",
        default_msg="Failed to delete Google Calendar event.",
    )


# ============================================================================
# Gmail API Operations
# ============================================================================

def fetch_gmail_profile(access_token):
    """Fetch the user's authenticated Gmail address."""
    url = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(url, headers=headers, timeout=10)
    if resp.ok:
        return resp.json().get('emailAddress', '')
    return ''


def list_gmail_messages(access_token, query='', max_results=15):
    """List recent emails from the user's Gmail inbox with parsed Subject, From, Date, and Snippet."""
    list_url = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    headers = {"Authorization": f"Bearer {access_token}"}
    params = {'maxResults': max_results}
    if query and query.strip():
        params['q'] = query.strip()

    resp = requests.get(list_url, headers=headers, params=params, timeout=12)
    if not resp.ok:
        logger.error(f"Gmail list error: {resp.text}")
        raise parse_google_workspace_error(
            resp,
            service_label="Gmail",
            api_slug="gmail.googleapis.com",
            default_msg="Failed to fetch Gmail messages.",
        )

    raw_msgs = resp.json().get('messages', [])
    results = []
    for item in raw_msgs[:max_results]:
        msg_id = item.get('id')
        if not msg_id:
            continue
        detail_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}"
        detail_params = [('format', 'metadata'), ('metadataHeaders', 'Subject'), ('metadataHeaders', 'From'), ('metadataHeaders', 'Date')]
        try:
            d_resp = requests.get(detail_url, headers=headers, params=detail_params, timeout=10)
            if not d_resp.ok:
                continue
            d_json = d_resp.json()
            headers_list = d_json.get('payload', {}).get('headers', [])
            header_map = {h.get('name', '').lower(): h.get('value', '') for h in headers_list}
            label_ids = d_json.get('labelIds', [])
            results.append({
                'id': msg_id,
                'thread_id': d_json.get('threadId', ''),
                'subject': header_map.get('subject') or '(No Subject)',
                'sender': header_map.get('from') or 'Unknown Sender',
                'date': header_map.get('date') or '',
                'snippet': d_json.get('snippet', ''),
                'is_unread': 'UNREAD' in label_ids,
            })
        except Exception as e:
            logger.warning(f"Skipping Gmail message {msg_id} detail error: {e}")

    return results


def send_gmail_message(access_token, to_email, subject, body):
    """Send an email via Gmail API using RFC 2822 base64url MIME encoding."""
    mime_msg = MIMEText(body, 'plain', 'utf-8')
    mime_msg['to'] = to_email
    mime_msg['subject'] = subject

    raw_bytes = mime_msg.as_bytes()
    encoded_raw = base64.urlsafe_b64encode(raw_bytes).decode('utf-8')

    send_url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    resp = requests.post(send_url, headers=headers, json={'raw': encoded_raw}, timeout=15)
    if not resp.ok:
        logger.error(f"Gmail send error: {resp.text}")
        raise parse_google_workspace_error(
            resp,
            service_label="Gmail",
            api_slug="gmail.googleapis.com",
            default_msg="Failed to send email via Gmail.",
        )

    data = resp.json()
    return {
        'id': data.get('id', ''),
        'thread_id': data.get('threadId', ''),
        'to': to_email,
        'subject': subject,
    }
