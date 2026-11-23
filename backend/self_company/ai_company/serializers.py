from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    UserProfile,
    GoogleDriveIntegration,
    UserAIPreferences,
    PersonalInformation,
    UploadedDocument,
    ExtractedDocumentContent,
    UserMemory,
    ApplicationSettings,
    Conversation,
    Message,
)


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


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    google_drive = serializers.SerializerMethodField()
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
            'display_mode',
            'memory_enabled',
            'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']


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
