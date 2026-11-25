import calendar
import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from django.utils import timezone

from .models import Reminder, ReminderHistory
from .notification_service import create_notification

logger = logging.getLogger(__name__)


def resolve_zoneinfo(tz_name):
    """Return a valid ZoneInfo object or UTC fallback."""
    if not tz_name:
        return dt_timezone.utc
    try:
        return ZoneInfo(str(tz_name).strip())
    except (ZoneInfoNotFoundError, ValueError, Exception):
        return dt_timezone.utc


def is_valid_timezone(tz_name):
    if not tz_name or not str(tz_name).strip():
        return False
    try:
        ZoneInfo(str(tz_name).strip())
        return True
    except Exception:
        return False


def _add_one_month(local_dt):
    year = local_dt.year
    month = local_dt.month + 1
    if month > 12:
        month = 1
        year += 1
    last_day = calendar.monthrange(year, month)[1]
    target_day = min(local_dt.day, last_day)
    return local_dt.replace(year=year, month=month, day=target_day)


def compute_next_occurrence(current_dt, recurrence, tz_name='UTC', reference_now=None):
    """
    Advance a recurring reminder in the user's local time zone so daily/weekly/monthly
    wall-clock times stay consistent across DST transitions and month lengths.
    """
    if recurrence not in ('daily', 'weekly', 'monthly'):
        return None

    now = reference_now or timezone.now()
    tz = resolve_zoneinfo(tz_name)
    base_aware = current_dt if timezone.is_aware(current_dt) else timezone.make_aware(current_dt, dt_timezone.utc)
    local_dt = base_aware.astimezone(tz)

    for _ in range(366):
        if recurrence == 'daily':
            local_dt = local_dt + timedelta(days=1)
        elif recurrence == 'weekly':
            local_dt = local_dt + timedelta(weeks=1)
        elif recurrence == 'monthly':
            local_dt = _add_one_month(local_dt)

        candidate_utc = local_dt.astimezone(dt_timezone.utc)
        if candidate_utc > now:
            return candidate_utc

    return local_dt.astimezone(dt_timezone.utc)


def format_relative_schedule(dt, tz_name='UTC', reference_now=None):
    """
    Format reminder schedule in user's local time zone like:
      'Today · 5:00 PM', 'Tomorrow · 8:00 AM', or 'Nov 28 · 3:30 PM'
    """
    if not dt:
        return ''
    tz = resolve_zoneinfo(tz_name)
    now_utc = reference_now or timezone.now()
    local_dt = (dt if timezone.is_aware(dt) else timezone.make_aware(dt, dt_timezone.utc)).astimezone(tz)
    local_now = now_utc.astimezone(tz)

    day_diff = (local_dt.date() - local_now.date()).days
    time_str = local_dt.strftime('%I:%M %p').lstrip('0')

    if day_diff == 0:
        day_label = 'Today'
    elif day_diff == 1:
        day_label = 'Tomorrow'
    elif day_diff == -1:
        day_label = 'Yesterday'
    elif local_dt.year == local_now.year:
        day_label = local_dt.strftime('%b %d').replace(' 0', ' ')
    else:
        day_label = local_dt.strftime('%b %d, %Y').replace(' 0', ' ')

    return f"{day_label} · {time_str}"


def sync_due_reminders(user):
    """
    Detect any pending reminders whose scheduled_at has arrived and haven't yet
    dispatched a notification for the current scheduled_at timestamp.
    Creates an in-app Notification and records a 'triggered' history log.
    Returns list of newly triggered Reminder objects.
    """
    now = timezone.now()
    due_candidates = Reminder.objects.filter(
        user=user,
        status='pending',
        scheduled_at__lte=now,
    ).order_by('scheduled_at')

    newly_triggered = []
    for rem in due_candidates:
        if rem.notified_for_at and rem.notified_for_at >= rem.scheduled_at:
            continue

        schedule_label = format_relative_schedule(rem.scheduled_at, rem.timezone_name, reference_now=now)
        msg_body = rem.message.strip() if rem.message else f"Scheduled for {schedule_label} ({rem.timezone_name})."
        ref = f"rem_{rem.id}_{int(rem.scheduled_at.timestamp())}"

        create_notification(
            user=user,
            title=f"Reminder: {rem.title}",
            message=msg_body,
            category='reminder',
            action_url='/reminders',
            external_ref=ref,
        )

        ReminderHistory.objects.create(
            user=user,
            reminder=rem,
            title=rem.title,
            message=rem.message or '',
            scheduled_at=rem.scheduled_at,
            timezone_name=rem.timezone_name,
            recurrence=rem.recurrence,
            event_type='triggered',
        )

        rem.notified_for_at = rem.scheduled_at
        rem.last_notified_at = now
        rem.save(update_fields=['notified_for_at', 'last_notified_at', 'updated_at'])
        newly_triggered.append(rem)

    return newly_triggered
