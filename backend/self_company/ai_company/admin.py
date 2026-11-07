from django.contrib import admin
from .models import (
    UserProfile,
    UserAIPreferences,
    PersonalInformation,
    UploadedDocument,
    ExtractedDocumentContent,
    UserMemory,
    ApplicationSettings,
    Conversation,
    Message,
)

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'preferred_name', 'phone_number', 'login_provider', 'google_id', 'created_at')
    search_fields = ('user__username', 'user__email', 'preferred_name', 'google_id')


@admin.register(UserAIPreferences)
class UserAIPreferencesAdmin(admin.ModelAdmin):
    list_display = ('user', 'preferred_language', 'response_style', 'response_length', 'updated_at')
    search_fields = ('user__username', 'user__email')


@admin.register(PersonalInformation)
class PersonalInformationAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'category', 'title', 'created_at')
    list_filter = ('category', 'created_at')
    search_fields = ('title', 'content', 'user__username')


class ExtractedDocumentContentInline(admin.StackedInline):
    model = ExtractedDocumentContent
    readonly_fields = ('word_count', 'char_count', 'page_count', 'extracted_at')
    extra = 0


@admin.register(UploadedDocument)
class UploadedDocumentAdmin(admin.ModelAdmin):
    list_display = ('id', 'original_name', 'file_type', 'file_size', 'status', 'user', 'created_at')
    list_filter = ('file_type', 'status', 'created_at')
    search_fields = ('original_name', 'user__username')
    inlines = [ExtractedDocumentContentInline]


@admin.register(UserMemory)
class UserMemoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'source', 'is_active', 'created_at')
    list_filter = ('is_active', 'source', 'created_at')
    search_fields = ('content', 'user__username')


@admin.register(ApplicationSettings)
class ApplicationSettingsAdmin(admin.ModelAdmin):
    list_display = ('user', 'theme', 'enter_to_send', 'memory_enabled', 'updated_at')


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    readonly_fields = ('created_at',)


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'user', 'created_at', 'updated_at')
    search_fields = ('title', 'user__username', 'user__email')
    list_filter = ('created_at', 'updated_at')
    inlines = [MessageInline]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'conversation', 'role', 'content_preview', 'created_at')
    list_filter = ('role', 'created_at')
    search_fields = ('content', 'conversation__title')

    def content_preview(self, obj):
        return obj.content[:50]
