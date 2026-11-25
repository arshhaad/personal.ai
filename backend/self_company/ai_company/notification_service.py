import logging
from datetime import timedelta
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import Notification
from .google_workspace_service import ensure_valid_google_token, list_calendar_events

logger = logging.getLogger(__name__)


def create_notification(user, title, message, category='system', action_url='', external_ref=''):
    """
    Create an in-app notification for a user.
    If external_ref is provided, prevents duplicate notifications for the same event.
    """
    if external_ref:
        existing = Notification.objects.filter(user=user, external_ref=external_ref).first()
        if existing:
            return existing

    return Notification.objects.create(
        user=user,
        title=title[:200],
        message=message,
        category=category,
        action_url=action_url or '',
        external_ref=external_ref or '',
    )


def sync_upcoming_calendar_notifications(user):
    """
    Best-effort check of upcoming Google Calendar events within the next 60 minutes
    to generate timely reminder notifications.
    """
    integration = getattr(user, 'google_calendar', None)
    if not integration or not integration.is_connected:
        return

    try:
        token = ensure_valid_google_token(integration)
        events = list_calendar_events(token, days=1, max_results=10)
        now = timezone.now()
        window_end = now + timedelta(minutes=60)

        for ev in events:
            if ev.get('is_all_day') or not ev.get('start'):
                continue
            dt = parse_datetime(ev['start'])
            if not dt:
                continue
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt, timezone.get_current_timezone())

            if now <= dt <= window_end:
                mins_left = max(1, int((dt - now).total_seconds() // 60))
                ref = f"cal_{ev['id']}_{dt.strftime('%Y%m%d%H%M')}"
                create_notification(
                    user=user,
                    title=f"Upcoming Event: {ev['summary']}",
                    message=f"Starts in ~{mins_left} minute(s)" + (f" at {ev['location']}" if ev.get('location') else "."),
                    category='calendar',
                    action_url='/integrations',
                    external_ref=ref,
                )
    except Exception as e:
        logger.debug(f"Calendar notification sync skipped for {user.username}: {e}")
