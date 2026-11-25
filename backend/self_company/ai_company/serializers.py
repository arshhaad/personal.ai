from datetime import timedelta, timezone as dt_timezone
from django.utils import timezone as dj_timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    UserProfile,
    GoogleDriveIntegration,
    GoogleCalendarIntegration,
    GmailIntegration,
    UserAIPreferences,
    PersonalInformation,
    UploadedDocument,
    ExtractedDocumentContent,
    UserMemory,
    ApplicationSettings,
    Notification,
    Reminder,
    ReminderHistory,
    Conversation,
    Message,
)
from .reminder_service import is_valid_timezone, resolve_zoneinfo, format_relative_schedule


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            'google_id',
            'avatar_url',
            'preferred_name',
            'phone_number',
            'login_provider',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['google_id', 'login_provider', 'created_at', 'updated_at']


class GoogleDriveIntegrationSerializer(serializers.ModelSerializer):
    permission_text = serializers.CharField(default=GoogleDriveIntegration.PERMISSION_TEXT, read_only=True)

    class Meta:
        model = GoogleDriveIntegration
        fields = [
            'is_connected',
            'drive_email',
            'drive_display_name',
            'drive_folder_id',
            'drive_folder_name',
            'scope',
            'permission_text',
            'connected_at',
        ]
        read_only_fields = ['is_connected', 'drive_email', 'drive_display_name', 'drive_folder_id', 'drive_folder_name', 'scope', 'permission_text', 'connected_at']


class GoogleCalendarIntegrationSerializer(serializers.ModelSerializer):
    permission_text = serializers.CharField(default=GoogleCalendarIntegration.PERMISSION_TEXT, read_only=True)

    class Meta:
        model = GoogleCalendarIntegration
        fields = [
            'is_connected',
            'calendar_email',
            'calendar_display_name',
            'scope',
            'permission_text',
            'connected_at',
        ]
        read_only_fields = ['is_connected', 'calendar_email', 'calendar_display_name', 'scope', 'permission_text', 'connected_at']


class GmailIntegrationSerializer(serializers.ModelSerializer):
    permission_text = serializers.CharField(default=GmailIntegration.PERMISSION_TEXT, read_only=True)

    class Meta:
        model = GmailIntegration
        fields = [
            'is_connected',
            'gmail_address',
            'gmail_display_name',
            'scope',
            'permission_text',
            'connected_at',
        ]
        read_only_fields = ['is_connected', 'gmail_address', 'gmail_display_name', 'scope', 'permission_text', 'connected_at']


class CalendarEventCreateSerializer(serializers.Serializer):
    summary = serializers.CharField(required=True, max_length=255)
    start_time = serializers.DateTimeField(required=True)
    end_time = serializers.DateTimeField(required=True)
    description = serializers.CharField(required=False, allow_blank=True, default='', max_length=2000)
    location = serializers.CharField(required=False, allow_blank=True, default='', max_length=255)

    def validate_summary(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Event title cannot be empty.")
        return cleaned

    def validate(self, attrs):
        if attrs['end_time'] <= attrs['start_time']:
            raise serializers.ValidationError({'end_time': "End time must be after start time."})
        return attrs


class GmailSendSerializer(serializers.Serializer):
    to = serializers.EmailField(required=True)
    subject = serializers.CharField(required=True, max_length=255)
    body = serializers.CharField(required=True, max_length=10000)

    def validate_subject(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Email subject cannot be empty.")
        return cleaned

    def validate_body(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Email body cannot be empty.")
        return cleaned


class WebSearchRequestSerializer(serializers.Serializer):
    query = serializers.CharField(required=True, min_length=2, max_length=300)
    max_results = serializers.IntegerField(required=False, min_value=1, max_value=10, default=5)

    def validate_query(self, value):
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise serializers.ValidationError("Search query must be at least 2 characters.")
        return cleaned


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id',
            'title',
            'message',
            'category',
            'is_read',
            'action_url',
            'created_at',
        ]
        read_only_fields = ['id', 'title', 'message', 'category', 'action_url', 'created_at']


class ReminderSerializer(serializers.ModelSerializer):
    display_schedule = serializers.SerializerMethodField()
    is_due = serializers.SerializerMethodField()
    recurrence_display = serializers.CharField(source='get_recurrence_display', read_only=True)

    class Meta:
        model = Reminder
        fields = [
            'id',
            'title',
            'message',
            'scheduled_at',
            'timezone_name',
            'recurrence',
            'recurrence_display',
            'status',
            'display_schedule',
            'is_due',
            'snoozed_until',
            'completed_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'status', 'display_schedule', 'is_due', 'snoozed_until', 'completed_at', 'created_at', 'updated_at']

    def get_display_schedule(self, obj):
        return format_relative_schedule(obj.scheduled_at, obj.timezone_name)

    def get_is_due(self, obj):
        return obj.status == 'pending' and obj.scheduled_at <= dj_timezone.now()


class ReminderCreateUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(required=True, max_length=200)
    message = serializers.CharField(required=False, allow_blank=True, default='', max_length=2000)
    scheduled_at = serializers.CharField(required=True)
    timezone_name = serializers.CharField(required=False, default='UTC', max_length=64)
    recurrence = serializers.ChoiceField(
        choices=['none', 'daily', 'weekly', 'monthly'],
        required=False,
        default='none',
    )

    def validate_title(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Reminder title cannot be empty.")
        return cleaned

    def validate_timezone_name(self, value):
        cleaned = (value or 'UTC').strip()
        if not is_valid_timezone(cleaned):
            raise serializers.ValidationError(f"Unsupported IANA timezone '{cleaned}'.")
        return cleaned

    def validate(self, attrs):
        raw_dt = attrs.get('scheduled_at')
        tz_name = attrs.get('timezone_name', 'UTC')
        tz = resolve_zoneinfo(tz_name)

        parsed = parse_datetime(str(raw_dt).strip())
        if parsed is None:
            raise serializers.ValidationError({'scheduled_at': "Enter a valid date and time (ISO format)."})

        if dj_timezone.is_naive(parsed):
            parsed = parsed.replace(tzinfo=tz)

        utc_dt = parsed.astimezone(dt_timezone.utc)
        if utc_dt < dj_timezone.now() - timedelta(minutes=1):
            raise serializers.ValidationError({'scheduled_at': "Reminder date & time must be in the future."})

        attrs['scheduled_at'] = utc_dt
        return attrs


class ReminderSnoozeSerializer(serializers.Serializer):
    minutes = serializers.ChoiceField(choices=[5, 10, 30], required=True)


class ReminderHistorySerializer(serializers.ModelSerializer):
    display_schedule = serializers.SerializerMethodField()

    class Meta:
        model = ReminderHistory
        fields = [
            'id',
            'reminder_id',
            'title',
            'message',
            'scheduled_at',
            'timezone_name',
            'recurrence',
            'event_type',
            'display_schedule',
            'recorded_at',
        ]

    def get_display_schedule(self, obj):
        return format_relative_schedule(obj.scheduled_at, obj.timezone_name)


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    google_drive = serializers.SerializerMethodField()
    google_calendar = serializers.SerializerMethodField()
    gmail = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    app_name = serializers.SerializerMethodField()
    date_joined = serializers.DateTimeField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'avatar_url',
            'app_name',
            'profile',
            'google_drive',
            'google_calendar',
            'gmail',
            'date_joined',
        ]
        read_only_fields = ['id', 'username', 'email', 'date_joined']

    def get_avatar_url(self, obj):
        if hasattr(obj, 'profile') and obj.profile.avatar_url:
            return obj.profile.avatar_url
        return None

    def get_app_name(self, obj):
        if hasattr(obj, 'ai_preferences') and obj.ai_preferences.custom_app_name:
            return obj.ai_preferences.custom_app_name
        return 'Personal AI'

    def get_google_drive(self, obj):
        if hasattr(obj, 'google_drive'):
            return {
                'is_connected': obj.google_drive.is_connected,
                'drive_email': obj.google_drive.drive_email,
                'drive_display_name': obj.google_drive.drive_display_name,
                'scope': obj.google_drive.scope,
                'permission_text': GoogleDriveIntegration.PERMISSION_TEXT,
                'connected_at': obj.google_drive.connected_at,
            }
        return {
            'is_connected': False,
            'drive_email': '',
            'drive_display_name': '',
            'scope': 'https://www.googleapis.com/auth/drive.file',
            'permission_text': GoogleDriveIntegration.PERMISSION_TEXT,
            'connected_at': None,
        }

    def get_google_calendar(self, obj):
        if hasattr(obj, 'google_calendar'):
            return {
                'is_connected': obj.google_calendar.is_connected,
                'calendar_email': obj.google_calendar.calendar_email,
                'connected_at': obj.google_calendar.connected_at,
            }
        return {'is_connected': False, 'calendar_email': '', 'connected_at': None}

    def get_gmail(self, obj):
        if hasattr(obj, 'gmail_integration'):
            return {
                'is_connected': obj.gmail_integration.is_connected,
                'gmail_address': obj.gmail_integration.gmail_address,
                'connected_at': obj.gmail_integration.connected_at,
            }
        return {'is_connected': False, 'gmail_address': '', 'connected_at': None}


class UserProfileUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    preferred_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    phone_number = serializers.CharField(required=False, allow_blank=True, max_length=30)
    avatar_url = serializers.URLField(required=False, allow_blank=True, max_length=1000)


class GoogleAuthSerializer(serializers.Serializer):
    credential = serializers.CharField(required=False, allow_blank=True)
    code = serializers.CharField(required=False, allow_blank=True)
    access_token = serializers.CharField(required=False, allow_blank=True)
    redirect_uri = serializers.CharField(required=False, allow_blank=True, default='postmessage')

    def validate(self, attrs):
        if not attrs.get('credential') and not attrs.get('code') and not attrs.get('access_token'):
            raise serializers.ValidationError(
                "Either 'credential' (ID token), 'code' (Auth code), or 'access_token' must be provided."
            )
        return attrs


class GoogleDriveConnectSerializer(serializers.Serializer):
    code = serializers.CharField(required=False, allow_blank=True)
    access_token = serializers.CharField(required=False, allow_blank=True)
    refresh_token = serializers.CharField(required=False, allow_blank=True)
    redirect_uri = serializers.CharField(required=False, default='postmessage')

    def validate(self, attrs):
        if not attrs.get('code') and not attrs.get('access_token'):
            raise serializers.ValidationError("Either 'code' or 'access_token' must be provided.")
        return attrs


class GoogleDriveImportSerializer(serializers.Serializer):
    file_id = serializers.CharField(required=True)
    name = serializers.CharField(required=True)
    mime_type = serializers.CharField(required=False, allow_blank=True, default='')


# --- AI Preferences ---
class UserAIPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAIPreferences
        fields = [
            'id',
            'preferred_language',
            'response_style',
            'response_length',
            'explanation_level',
            'answer_format',
            'custom_instructions',
            'custom_app_name',
            'nickname',
            'occupation',
            'more_about_you',
            'creativity',
            'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']


# --- Personal Information ---
class PersonalInformationSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = PersonalInformation
        fields = [
            'id',
            'category',
            'category_display',
            'title',
            'content',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# --- Documents ---
class ExtractedDocumentContentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExtractedDocumentContent
        fields = ['text_content', 'word_count', 'char_count', 'page_count', 'extracted_at']


class UploadedDocumentSerializer(serializers.ModelSerializer):
    extracted_content = ExtractedDocumentContentSerializer(read_only=True)
    file_url = serializers.SerializerMethodField()
    user_id = serializers.IntegerField(source='user.id', read_only=True)

    class Meta:
        model = UploadedDocument
        fields = [
            'id',
            'user_id',
            'original_name',
            'file_type',
            'file_size',
            'status',
            'error_message',
            'drive_file_id',
            'drive_web_link',
            'uploaded_via_app',
            'created_at',
            'updated_at',
            'file_url',
            'extracted_content',
        ]
        read_only_fields = [
            'id',
            'user_id',
            'file_type',
            'file_size',
            'status',
            'error_message',
            'drive_file_id',
            'drive_web_link',
            'uploaded_via_app',
            'created_at',
            'updated_at',
        ]

    def get_file_url(self, obj):
        if obj.file:
            return obj.file.url
        return None


# --- AI Memory ---
class UserMemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserMemory
        fields = ['id', 'content', 'source', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


# --- Application Settings ---
class ApplicationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationSettings
        fields = [
            'id',
            'theme',
            'enter_to_send',
            'notifications_enabled',
            'web_search_enabled',
            'voice_enabled',
            'voice_auto_speak',
            'voice_rate',
            'display_mode',
            'memory_enabled',
            'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']

    def validate_voice_rate(self, value):
        if value < 0.5 or value > 2.0:
            raise serializers.ValidationError("Voice speed rate must be between 0.5 and 2.0.")
        return round(float(value), 2)


# --- Conversations & Messages ---
class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'conversation', 'role', 'content', 'created_at']
        read_only_fields = ['id', 'conversation', 'created_at']


class ConversationListSerializer(serializers.ModelSerializer):
    message_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ['id', 'title', 'created_at', 'updated_at', 'message_count', 'last_message']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_message_count(self, obj):
        return obj.messages.count()

    def get_last_message(self, obj):
        last = obj.messages.last()
        if last:
            preview = last.content[:60]
            if len(last.content) > 60:
                preview += "..."
            return {
                'role': last.role,
                'content': preview,
                'created_at': last.created_at,
            }
        return None


class ConversationDetailSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = Conversation
        fields = ['id', 'title', 'created_at', 'updated_at', 'messages']
        read_only_fields = ['id', 'created_at', 'updated_at']


class MessageCreateSerializer(serializers.Serializer):
    content = serializers.CharField(required=True, allow_blank=False, max_length=10000)
    use_web_search = serializers.BooleanField(required=False, default=False)

    def validate_content(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Message content cannot be empty.")
        return cleaned


class ConversationUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(required=True, max_length=255)

    def validate_title(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Title cannot be empty.")
        return cleaned
