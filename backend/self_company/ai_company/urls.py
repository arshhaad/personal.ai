from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    GoogleAuthInitView,
    GoogleCallbackView,
    GoogleAuthView,
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
    DeleteAccountView,
    ConversationListCreateView,
    ConversationDetailView,
    SendMessageView,
)

urlpatterns = [
    # Google OAuth endpoints
    path('auth/google/url/', GoogleAuthInitView.as_view(), name='google_auth_init'),
    path('auth/google/callback/', GoogleCallbackView.as_view(), name='google_auth_callback'),
    path('auth/google/', GoogleAuthView.as_view(), name='google_auth'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),

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
    path('settings/delete-account/', DeleteAccountView.as_view(), name='settings_delete_account'),

    # Conversation Management endpoints
    path('conversations/', ConversationListCreateView.as_view(), name='conversations_list_create'),
    path('conversations/<int:pk>/', ConversationDetailView.as_view(), name='conversation_detail'),
    path('conversations/<int:pk>/messages/', SendMessageView.as_view(), name='send_message'),
]
