from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    GoogleAuthInitView,
    GoogleCallbackView,
    GoogleAuthView,
    GoogleDriveStatusView,
    GoogleDriveAuthUrlView,
    GoogleDriveConnectView,
    GoogleDriveDisconnectView,
    GoogleDriveFilesView,
    GoogleDriveImportView,
    LogoutView,
    UserProfileView,
    AIPreferencesView,
    PersonalInformationListCreateView,
    PersonalInformationDetailView,
    DocumentListUploadView,
    DocumentDetailView,
    DocumentRetryView,
    MemoryListCreateView,
    MemoryDetailView,
    SettingsView,
    DataExportView,
    ClearHistoryView,
    ClearDocumentsView,
    AppUploadedDocumentsView,
    AppUploadedDocumentDetailView,
    AppClearUploadedDocumentsView,
    DeleteAccountView,
    ConversationListCreateView,
    ConversationDetailView,
    SendMessageView,
    MessageDetailView,
    GoogleWorkspaceConnectView,
    GoogleCalendarStatusView,
    GoogleCalendarConnectView,
    GoogleCalendarDisconnectView,
    GoogleCalendarEventsView,
    GoogleCalendarEventDetailView,
    GmailStatusView,
    GmailConnectView,
    GmailDisconnectView,
    GmailMessagesView,
    GmailSendView,
    WebSearchView,
    NotificationListView,
    NotificationDetailView,
    NotificationReadAllView,
    NotificationClearView,
    ReminderListCreateView,
    ReminderDetailView,
    ReminderSnoozeView,
    ReminderCompleteView,
    ReminderHistoryClearView,
    HealthCheckView,
)

urlpatterns = [
    # Health check endpoint for Docker & monitoring
    path('health/', HealthCheckView.as_view(), name='health_check'),

    # Google OAuth endpoints
    path('auth/google/url/', GoogleAuthInitView.as_view(), name='google_auth_init'),
    path('auth/google/callback/', GoogleCallbackView.as_view(), name='google_auth_callback'),
    path('auth/google/', GoogleAuthView.as_view(), name='google_auth'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),

    # Step 2: Google Drive Integration endpoints
    path('drive/status/', GoogleDriveStatusView.as_view(), name='google_drive_status'),
    path('drive/url/', GoogleDriveAuthUrlView.as_view(), name='google_drive_url'),
    path('drive/connect/', GoogleDriveConnectView.as_view(), name='google_drive_connect'),
    path('drive/disconnect/', GoogleDriveDisconnectView.as_view(), name='google_drive_disconnect'),
    path('drive/files/', GoogleDriveFilesView.as_view(), name='google_drive_files'),
    path('drive/import/', GoogleDriveImportView.as_view(), name='google_drive_import'),

    # User Profile endpoints
    path('users/me/', UserProfileView.as_view(), name='users_me'),
    path('auth/me/', UserProfileView.as_view(), name='auth_me'),

    # Personalization: AI Preferences
    path('personalization/preferences/', AIPreferencesView.as_view(), name='ai_preferences'),

    # Personalization: Personal Information
    path('personalization/information/', PersonalInformationListCreateView.as_view(), name='personal_info_list_create'),
    path('personalization/information/<int:pk>/', PersonalInformationDetailView.as_view(), name='personal_info_detail'),

    # Personalization: Document Upload & Knowledge Base
    path('personalization/documents/', DocumentListUploadView.as_view(), name='document_list'),
    path('personalization/documents/upload/', DocumentListUploadView.as_view(), name='document_upload'),
    path('personalization/documents/<int:pk>/', DocumentDetailView.as_view(), name='document_detail'),
    path('personalization/documents/<int:pk>/retry/', DocumentRetryView.as_view(), name='document_retry'),

    # Personalization: AI Memories
    path('personalization/memories/', MemoryListCreateView.as_view(), name='memory_list_create'),
    path('personalization/memories/<int:pk>/', MemoryDetailView.as_view(), name='memory_detail'),

    # Settings & Data Management
    path('settings/', SettingsView.as_view(), name='settings'),
    path('settings/export/', DataExportView.as_view(), name='settings_export'),
    path('settings/clear-history/', ClearHistoryView.as_view(), name='settings_clear_history'),
    path('settings/clear-documents/', ClearDocumentsView.as_view(), name='settings_clear_documents'),
    path('settings/app-documents/', AppUploadedDocumentsView.as_view(), name='app_uploaded_documents'),
    path('settings/app-documents/<int:pk>/', AppUploadedDocumentDetailView.as_view(), name='app_uploaded_document_detail'),
    path('settings/app-documents/clear/', AppClearUploadedDocumentsView.as_view(), name='app_clear_uploaded_documents'),
    path('settings/delete-account/', DeleteAccountView.as_view(), name='settings_delete_account'),

    # Conversation Management endpoints
    path('conversations/', ConversationListCreateView.as_view(), name='conversations_list_create'),
    path('conversations/<int:pk>/', ConversationDetailView.as_view(), name='conversation_detail'),
    path('conversations/<int:pk>/messages/', SendMessageView.as_view(), name='send_message'),
    path('conversations/<int:pk>/messages/<int:message_id>/', MessageDetailView.as_view(), name='message_detail'),

    # Advanced Integrations: Unified Workspace + Google Calendar
    path('integrations/workspace/connect/', GoogleWorkspaceConnectView.as_view(), name='workspace_connect'),
    path('integrations/calendar/status/', GoogleCalendarStatusView.as_view(), name='calendar_status'),
    path('integrations/calendar/connect/', GoogleCalendarConnectView.as_view(), name='calendar_connect'),
    path('integrations/calendar/disconnect/', GoogleCalendarDisconnectView.as_view(), name='calendar_disconnect'),
    path('integrations/calendar/events/', GoogleCalendarEventsView.as_view(), name='calendar_events'),
    path('integrations/calendar/events/<str:event_id>/', GoogleCalendarEventDetailView.as_view(), name='calendar_event_detail'),

    # Advanced Integrations: Gmail
    path('integrations/gmail/status/', GmailStatusView.as_view(), name='gmail_status'),
    path('integrations/gmail/connect/', GmailConnectView.as_view(), name='gmail_connect'),
    path('integrations/gmail/disconnect/', GmailDisconnectView.as_view(), name='gmail_disconnect'),
    path('integrations/gmail/messages/', GmailMessagesView.as_view(), name='gmail_messages'),
    path('integrations/gmail/send/', GmailSendView.as_view(), name='gmail_send'),

    # Advanced Integrations: Web Search
    path('integrations/web-search/', WebSearchView.as_view(), name='web_search'),

    # Notifications Center
    path('notifications/', NotificationListView.as_view(), name='notifications_list'),
    path('notifications/read-all/', NotificationReadAllView.as_view(), name='notifications_read_all'),
    path('notifications/clear/', NotificationClearView.as_view(), name='notifications_clear'),
    path('notifications/<int:pk>/read/', NotificationDetailView.as_view(), name='notification_read'),
    path('notifications/<int:pk>/', NotificationDetailView.as_view(), name='notification_detail'),

    # Reminder System
    path('reminders/', ReminderListCreateView.as_view(), name='reminders_list_create'),
    path('reminders/history/clear/', ReminderHistoryClearView.as_view(), name='reminders_history_clear'),
    path('reminders/<int:pk>/', ReminderDetailView.as_view(), name='reminder_detail'),
    path('reminders/<int:pk>/snooze/', ReminderSnoozeView.as_view(), name='reminder_snooze'),
    path('reminders/<int:pk>/complete/', ReminderCompleteView.as_view(), name='reminder_complete'),
]
