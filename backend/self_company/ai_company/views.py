import logging
import os
from datetime import timedelta
from django.conf import settings as django_settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.files.base import ContentFile
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

logger = logging.getLogger(__name__)

from .models import (
    UserProfile,
    GoogleAccount,
    Document,
    GoogleDriveIntegration,
    GoogleCalendarIntegration,
    GmailIntegration,
    UserAIPreferences,
    PersonalInformation,
    UploadedDocument,
    UserMemory,
    ApplicationSettings,
    Notification,
    Reminder,
    ReminderHistory,
    Conversation,
    Message,
)
from .serializers import (
    GoogleAuthSerializer,
    GoogleDriveIntegrationSerializer,
    GoogleDriveConnectSerializer,
    GoogleDriveImportSerializer,
    GoogleCalendarIntegrationSerializer,
    GmailIntegrationSerializer,
    CalendarEventCreateSerializer,
    GmailSendSerializer,
    WebSearchRequestSerializer,
    NotificationSerializer,
    ReminderSerializer,
    ReminderCreateUpdateSerializer,
    ReminderSnoozeSerializer,
    ReminderHistorySerializer,
    UserSerializer,
    UserProfileUpdateSerializer,
    UserAIPreferencesSerializer,
    PersonalInformationSerializer,
    UploadedDocumentSerializer,
    UserMemorySerializer,
    ApplicationSettingsSerializer,
    ConversationListSerializer,
    ConversationDetailSerializer,
    MessageSerializer,
    MessageCreateSerializer,
    ConversationUpdateSerializer,
)
from .services import (
    generate_google_auth_url,
    verify_and_extract_google_user,
    authenticate_google_user,
)
from .google_drive_service import (
    exchange_drive_code,
    ensure_valid_drive_token,
    fetch_drive_user_info,
    list_user_drive_files,
    download_drive_file_content,
    revoke_drive_token,
    get_or_create_app_folder,
    upload_file_to_drive,
    delete_drive_file,
    GoogleDriveAPIError,
    GOOGLE_DRIVE_SCOPE,
    PERMISSION_DESCRIPTION,
)
from .google_workspace_service import (
    GOOGLE_CALENDAR_SCOPE,
    GMAIL_SCOPE,
    exchange_google_code,
    ensure_valid_google_token,
    revoke_google_token,
    fetch_google_account_profile,
    list_calendar_events,
    create_calendar_event,
    delete_calendar_event,
    fetch_gmail_profile,
    list_gmail_messages,
    send_gmail_message,
)
from .web_search_service import perform_web_search
from .notification_service import create_notification, sync_upcoming_calendar_notifications
from .reminder_service import sync_due_reminders, compute_next_occurrence
from .ai_service import generate_ai_response
from .document_service import validate_document_file, process_document


# ============================================================================
# Google Authentication Views
# ============================================================================

class GoogleAuthInitView(APIView):
    """
    Endpoint to initiate Google OAuth 2.0 flow.
    Returns the Google authorization URL and state token.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        default_cb = os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/') + '/auth/callback'
        redirect_uri = request.query_params.get('redirect_uri', default_cb)
        url, state = generate_google_auth_url(redirect_uri)
        return Response({
            'url': url,
            'state': state,
        }, status=status.HTTP_200_OK)


class GoogleCallbackView(APIView):
    """
    Endpoint to handle Google OAuth callback from standard redirect flow.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        code = request.data.get('code')
        default_cb = os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/') + '/auth/callback'
        redirect_uri = request.data.get('redirect_uri', default_cb)

        if not code:
            return Response(
                {'error': "Missing 'code' parameter in authorization callback."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            google_user_info = verify_and_extract_google_user(
                code=code,
                redirect_uri=redirect_uri
            )
            auth_data = authenticate_google_user(google_user_info)
            user_data = UserSerializer(auth_data['user']).data

            return Response({
                'message': 'Successfully authenticated with Google.',
                'access': auth_data['access'],
                'refresh': auth_data['refresh'],
                'user': user_data,
            }, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': f'Failed to process Google callback: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GoogleAuthView(APIView):
    """
    Endpoint to authenticate via Google OAuth credential (GIS ID token)
    or authorization code.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        credential = serializer.validated_data.get('credential')
        code = serializer.validated_data.get('code')
        access_token = serializer.validated_data.get('access_token')
        redirect_uri = serializer.validated_data.get('redirect_uri', 'postmessage')

        try:
            google_user_info = verify_and_extract_google_user(
                credential=credential,
                code=code,
                access_token=access_token,
                redirect_uri=redirect_uri
            )
            auth_data = authenticate_google_user(google_user_info)
            user_data = UserSerializer(auth_data['user']).data

            return Response({
                'message': 'Successfully authenticated with Google.',
                'access': auth_data['access'],
                'refresh': auth_data['refresh'],
                'user': user_data,
            }, status=status.HTTP_200_OK)

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                'error': f'An unexpected error occurred during Google authentication: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class LogoutView(APIView):
    """
    Endpoint to log out user and invalidate refresh token.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                if hasattr(token, 'blacklist'):
                    token.blacklist()
            except TokenError:
                pass
            except Exception:
                pass

        return Response({'message': 'Logged out successfully.'}, status=status.HTTP_200_OK)


# ============================================================================
# Google Drive Integration Views (Step 2: Connect Google Drive)
# ============================================================================

class GoogleDriveStatusView(APIView):
    """
    Check the current user's Google Drive connection status and permission details.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        integration, _ = GoogleDriveIntegration.objects.get_or_create(user=request.user)
        serializer = GoogleDriveIntegrationSerializer(integration)
        return Response(serializer.data, status=status.HTTP_200_OK)


class GoogleDriveAuthUrlView(APIView):
    """
    Stage B: Generate Google Drive OAuth URL with offline access and login_hint
    matching the signed-in user's Google account.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .services import generate_drive_auth_url

        default_cb = os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/') + '/settings'
        redirect_uri = request.query_params.get('redirect_uri', default_cb)
        google_account = getattr(request.user, 'google_account', None)
        login_hint = (google_account.email if google_account and google_account.email else '') or request.user.email or None

        url, state = generate_drive_auth_url(redirect_uri=redirect_uri, login_hint=login_hint)
        request.session['drive_oauth_state'] = state
        return Response({'url': url, 'state': state}, status=status.HTTP_200_OK)


class GoogleDriveConnectView(APIView):
    """
    Step 2: Connect Google Drive with the explicit scope:
    'https://www.googleapis.com/auth/drive.file'
    Permission request:
    'Allow Personal Assistant AI to create and manage files that you select or create with this application.'
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GoogleDriveConnectSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        code = serializer.validated_data.get('code')
        access_token = serializer.validated_data.get('access_token')
        refresh_token = serializer.validated_data.get('refresh_token', '')
        redirect_uri = serializer.validated_data.get('redirect_uri', 'postmessage')

        integration, _ = GoogleDriveIntegration.objects.get_or_create(user=request.user)

        try:
            if code:
                token_data = exchange_drive_code(code, redirect_uri=redirect_uri)
                access_token = token_data.get('access_token')
                refresh_token = token_data.get('refresh_token', integration.refresh_token)
                expires_in = token_data.get('expires_in', 3600)
                scope = token_data.get('scope', GOOGLE_DRIVE_SCOPE)
            else:
                expires_in = 3600
                scope = GOOGLE_DRIVE_SCOPE

            user_info = fetch_drive_user_info(access_token) if access_token else {}
            drive_sub = (user_info.get('sub') or '').strip()
            drive_email = (user_info.get('email') or '').strip()

            google_account = getattr(request.user, 'google_account', None)
            profile = getattr(request.user, 'profile', None)
            expected_sub = (
                (google_account.google_id if google_account else None)
                or (profile.google_id if profile else None)
            )
            expected_email = (
                (google_account.email if google_account else None)
                or request.user.email
            )

            if expected_sub and drive_sub and drive_sub != expected_sub:
                return Response(
                    {
                        'error': (
                            f"Google account mismatch. Please connect Google Drive using your signed-in account "
                            f"({expected_email or request.user.username})."
                        ),
                        'code': 'account_mismatch',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if (
                expected_email
                and drive_email
                and drive_email.lower() != expected_email.strip().lower()
            ):
                return Response(
                    {
                        'error': (
                            f"Please connect Google Drive using your signed-in account ({expected_email}) "
                            f"instead of {drive_email}."
                        ),
                        'code': 'account_mismatch',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            integration.is_connected = True
            integration.access_token = access_token or ''
            if refresh_token:
                integration.refresh_token = refresh_token
            integration.token_expiry = timezone.now() + timedelta(seconds=expires_in)
            integration.scope = scope
            integration.drive_email = drive_email or expected_email
            integration.drive_display_name = user_info.get('display_name') or request.user.get_full_name() or request.user.username
            integration.connected_at = timezone.now()
            integration.save()

            from .models import sync_google_account
            sync_google_account(
                request.user,
                google_id=drive_sub or expected_sub,
                email=integration.drive_email,
                refresh_token=refresh_token,
                is_connected=True,
                connected_at=integration.connected_at,
            )

            return Response({
                'message': 'Google Drive connected successfully.',
                'permission': PERMISSION_DESCRIPTION,
                'data': GoogleDriveIntegrationSerializer(integration).data
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({
                'error': f'Failed to connect Google Drive: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)


class GoogleDriveDisconnectView(APIView):
    """
    Disconnect Google Drive integration and revoke token.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        integration, _ = GoogleDriveIntegration.objects.get_or_create(user=request.user)
        if integration.access_token or integration.refresh_token:
            revoke_drive_token(integration.refresh_token or integration.access_token)

        integration.is_connected = False
        integration.access_token = ''
        integration.refresh_token = ''
        integration.token_expiry = None
        integration.connected_at = None
        integration.save()

        from .models import sync_google_account
        sync_google_account(
            request.user,
            clear_refresh_token=True,
            is_connected=False,
            clear_connected_at=True,
        )

        return Response({
            'message': 'Google Drive disconnected successfully.',
            'data': GoogleDriveIntegrationSerializer(integration).data
        }, status=status.HTTP_200_OK)


class GoogleDriveFilesView(APIView):
    """
    List files in Google Drive accessible to the user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        integration, _ = GoogleDriveIntegration.objects.get_or_create(user=request.user)
        if not integration.is_connected:
            return Response(
                {'error': 'Google Drive is not connected. Please connect Google Drive first.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            token = ensure_valid_drive_token(integration)
            files = list_user_drive_files(token)
            return Response({'files': files}, status=status.HTTP_200_OK)
        except GoogleDriveAPIError as gde:
            return Response(gde.to_dict(), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class GoogleDriveImportView(APIView):
    """
    Import a file from Google Drive into Personal AI knowledge base.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GoogleDriveImportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        file_id = serializer.validated_data['file_id']
        name = serializer.validated_data['name']
        mime_type = serializer.validated_data.get('mime_type', '')

        integration, _ = GoogleDriveIntegration.objects.get_or_create(user=request.user)
        if not integration.is_connected:
            return Response(
                {'error': 'Google Drive is not connected.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            token = ensure_valid_drive_token(integration)
            content_bytes, resolved_mime, ext = download_drive_file_content(token, file_id, mime_type)

            final_name = name
            if ext and not final_name.lower().endswith(ext):
                final_name += ext

            doc = UploadedDocument(
                user=request.user,
                original_name=final_name,
                file_size=len(content_bytes),
                file_type=ext.replace('.', '') if ext else 'txt',
                status='uploaded'
            )
            doc.file.save(final_name, ContentFile(content_bytes), save=True)
            Document.objects.create(
                user=request.user,
                google_file_id=file_id,
                file_name=final_name,
                mime_type=resolved_mime or mime_type or '',
            )

            # Process document text for AI knowledge base
            process_document(doc)

            return Response({
                'message': f"Successfully imported '{final_name}' from Google Drive.",
                'document': UploadedDocumentSerializer(doc).data
            }, status=status.HTTP_201_CREATED)

        except GoogleDriveAPIError as gde:
            return Response(gde.to_dict(), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Failed to import file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


# ============================================================================
# Profile Views
# ============================================================================

class UserProfileView(APIView):
    """
    Retrieve and update user profile information.
    Protected fields such as Google ID and email are read-only.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        serializer = UserProfileUpdateSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        validated = serializer.validated_data

        # Update User model fields
        if 'first_name' in validated:
            user.first_name = validated['first_name']
        if 'last_name' in validated:
            user.last_name = validated['last_name']
        user.save()

        # Update UserProfile fields
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if 'preferred_name' in validated:
            profile.preferred_name = validated['preferred_name']
        if 'phone_number' in validated:
            profile.phone_number = validated['phone_number']
        if 'avatar_url' in validated and validated['avatar_url']:
            profile.avatar_url = validated['avatar_url']
        profile.save()

        user.refresh_from_db()
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)

    def put(self, request):
        return self.patch(request)


# ============================================================================
# Personalization: AI Response Preferences Views
# ============================================================================

class AIPreferencesView(APIView):
    """
    Retrieve and update AI response preferences.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pref, _ = UserAIPreferences.objects.get_or_create(user=request.user)
        serializer = UserAIPreferencesSerializer(pref)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        pref, _ = UserAIPreferences.objects.get_or_create(user=request.user)
        serializer = UserAIPreferencesSerializer(pref, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        return self.patch(request)


# ============================================================================
# Personalization: Personal Information Views
# ============================================================================

class PersonalInformationListCreateView(APIView):
    """
    List and create personal information entries for the authenticated user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = PersonalInformation.objects.filter(user=request.user)
        category = request.query_params.get('category')
        if category:
            items = items.filter(category=category)
        serializer = PersonalInformationSerializer(items, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = PersonalInformationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PersonalInformationDetailView(APIView):
    """
    Update and delete a specific personal information entry.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        item = get_object_or_404(PersonalInformation, pk=pk, user=request.user)
        serializer = PersonalInformationSerializer(item, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        item = get_object_or_404(PersonalInformation, pk=pk, user=request.user)
        item.delete()
        return Response({'message': 'Personal information deleted successfully.'}, status=status.HTTP_200_OK)


# ============================================================================
# Personalization: Document Upload & Management Views
# ============================================================================

class DocumentListUploadView(APIView):
    """
    List uploaded documents and upload new documents.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        documents = UploadedDocument.objects.filter(user=request.user)
        serializer = UploadedDocumentSerializer(documents, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        files = request.FILES.getlist('files') or request.FILES.getlist('file')
        if not files:
            return Response({'error': "No files were provided for upload."}, status=status.HTTP_400_BAD_REQUEST)

        created_docs = []
        errors = []

        for file_obj in files:
            try:
                ext = validate_document_file(file_obj)

                # Cache file bytes before database persistence
                file_obj.seek(0)
                file_bytes = file_obj.read()
                file_obj.seek(0)

                doc = UploadedDocument.objects.create(
                    user=request.user,
                    file=file_obj,
                    original_name=file_obj.name,
                    file_type=ext,
                    file_size=file_obj.size,
                    status='uploaded',
                    uploaded_via_app=True,
                )

                # Store in user's own Google Drive folder if Drive integration is connected
                integration = getattr(request.user, 'google_drive', None)
                if integration and integration.is_connected:
                    try:
                        token = ensure_valid_drive_token(integration)
                        custom_app_name = ''
                        if hasattr(request.user, 'ai_preferences'):
                            custom_app_name = (request.user.ai_preferences.custom_app_name or '').strip()
                        app_name = custom_app_name or 'Personal AI'
                        folder_name = f"{app_name} Documents"

                        folder_id = get_or_create_app_folder(token, folder_name)
                        if folder_id:
                            if integration.drive_folder_id != folder_id or integration.drive_folder_name != folder_name:
                                integration.drive_folder_id = folder_id
                                integration.drive_folder_name = folder_name
                                integration.save(update_fields=['drive_folder_id', 'drive_folder_name'])

                            mime_mapping = {
                                'pdf': 'application/pdf',
                                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                'txt': 'text/plain',
                                'md': 'text/markdown',
                            }
                            upload_mime = mime_mapping.get(ext, 'application/octet-stream')

                            drive_res = upload_file_to_drive(
                                access_token=token,
                                folder_id=folder_id,
                                file_name=file_obj.name,
                                file_bytes=file_bytes,
                                mime_type=upload_mime
                            )
                            if drive_res and drive_res.get('id'):
                                doc.drive_file_id = drive_res['id']
                                doc.drive_web_link = drive_res.get('webViewLink', '')
                                doc.save(update_fields=['drive_file_id', 'drive_web_link'])
                    except Exception as drive_err:
                        logger.warning(f"Failed to sync uploaded file '{file_obj.name}' to Google Drive: {drive_err}")

                mime_mapping = {
                    'pdf': 'application/pdf',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'txt': 'text/plain',
                    'md': 'text/markdown',
                }
                Document.objects.create(
                    user=request.user,
                    google_file_id=doc.drive_file_id or '',
                    file_name=doc.original_name,
                    mime_type=getattr(file_obj, 'content_type', '') or mime_mapping.get(ext, ''),
                )

                # Run extraction synchronously (or queue in background)
                process_document(doc)
                created_docs.append(doc)
                if doc.status == 'completed':
                    create_notification(
                        user=request.user,
                        title="Document Ready",
                        message=f"'{doc.original_name}' was processed" + (" and saved to your Google Drive folder." if doc.drive_file_id else " into your knowledge base."),
                        category='document',
                        action_url='/personalization',
                    )
            except ValueError as ve:
                errors.append(f"{file_obj.name}: {str(ve)}")
            except Exception as e:
                errors.append(f"{file_obj.name}: Failed to process upload ({str(e)})")

        serializer = UploadedDocumentSerializer(created_docs, many=True)
        response_data = {
            'documents': serializer.data,
            'success_count': len(created_docs),
            'errors': errors,
        }

        if not created_docs and errors:
            return Response(response_data, status=status.HTTP_400_BAD_REQUEST)

        return Response(response_data, status=status.HTTP_201_CREATED)


class DocumentDetailView(APIView):
    """
    Retrieve document details & extracted text, or permanently delete document.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        document = get_object_or_404(UploadedDocument, pk=pk, user=request.user)
        serializer = UploadedDocumentSerializer(document)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        document = get_object_or_404(UploadedDocument, pk=pk, user=request.user)
        document.delete()
        return Response({'message': 'Document and its extracted content deleted permanently.'}, status=status.HTTP_200_OK)


class DocumentRetryView(APIView):
    """
    Retry processing for a failed document.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        document = get_object_or_404(UploadedDocument, pk=pk, user=request.user)
        process_document(document)
        serializer = UploadedDocumentSerializer(document)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ============================================================================
# Personalization: AI Memory Management Views
# ============================================================================

class MemoryListCreateView(APIView):
    """
    List and create AI memories for the user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memories = UserMemory.objects.filter(user=request.user)
        serializer = UserMemorySerializer(memories, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        content = request.data.get('content', '').strip()
        source = request.data.get('source', 'Manual Entry').strip() or 'Manual Entry'

        if not content:
            return Response({'content': 'Memory content cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

        memory = UserMemory.objects.create(
            user=request.user,
            content=content,
            source=source,
            is_active=request.data.get('is_active', True)
        )
        serializer = UserMemorySerializer(memory)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MemoryDetailView(APIView):
    """
    Update or delete a specific memory item.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        memory = get_object_or_404(UserMemory, pk=pk, user=request.user)
        serializer = UserMemorySerializer(memory, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        memory = get_object_or_404(UserMemory, pk=pk, user=request.user)
        memory.delete()
        return Response({'message': 'Memory deleted successfully.'}, status=status.HTTP_200_OK)


# ============================================================================
# Settings & Data Management Views
# ============================================================================

class SettingsView(APIView):
    """
    Retrieve and update application settings.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        settings_obj, _ = ApplicationSettings.objects.get_or_create(user=request.user)
        serializer = ApplicationSettingsSerializer(settings_obj)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        settings_obj, _ = ApplicationSettings.objects.get_or_create(user=request.user)
        serializer = ApplicationSettingsSerializer(settings_obj, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        return self.patch(request)


class DataExportView(APIView):
    """
    Export all user data (profile, preferences, personal info, memories, document metadata, chats)
    as a structured JSON document.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        profile, _ = UserProfile.objects.get_or_create(user=user)
        ai_pref, _ = UserAIPreferences.objects.get_or_create(user=user)
        app_settings, _ = ApplicationSettings.objects.get_or_create(user=user)

        personal_info = PersonalInformationSerializer(
            PersonalInformation.objects.filter(user=user), many=True
        ).data
        memories = UserMemorySerializer(
            UserMemory.objects.filter(user=user), many=True
        ).data
        documents = UploadedDocumentSerializer(
            UploadedDocument.objects.filter(user=user), many=True
        ).data
        conversations = ConversationDetailSerializer(
            Conversation.objects.filter(user=user), many=True
        ).data

        export_data = {
            'personal_ai_export_version': '1.0',
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'date_joined': user.date_joined.isoformat(),
                'preferred_name': profile.preferred_name,
                'phone_number': profile.phone_number,
                'login_provider': profile.login_provider,
            },
            'ai_preferences': UserAIPreferencesSerializer(ai_pref).data,
            'application_settings': ApplicationSettingsSerializer(app_settings).data,
            'personal_information': personal_info,
            'memories': memories,
            'documents': documents,
            'conversations': conversations,
        }
        return Response(export_data, status=status.HTTP_200_OK)


class ClearHistoryView(APIView):
    """
    Delete all conversations and chat history for the user.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        count = Conversation.objects.filter(user=request.user).count()
        Conversation.objects.filter(user=request.user).delete()
        return Response({'message': f'Successfully cleared {count} conversation(s).'}, status=status.HTTP_200_OK)


class ClearDocumentsView(APIView):
    """
    Delete all uploaded documents and extracted contents for the user.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        docs = UploadedDocument.objects.filter(user=request.user)
        count = docs.count()
        for doc in list(docs):
            doc.delete()
        return Response({'message': f'Successfully deleted {count} document(s).'}, status=status.HTTP_200_OK)


class AppUploadedDocumentsView(APIView):
    """
    List user documents uploaded via this web application.
    Shows whether each document is stored in the user's dedicated Google Drive folder.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        docs = UploadedDocument.objects.filter(user=request.user, uploaded_via_app=True)
        integration = getattr(request.user, 'google_drive', None)
        is_drive_connected = bool(integration and integration.is_connected)

        custom_app_name = ''
        if hasattr(request.user, 'ai_preferences'):
            custom_app_name = (request.user.ai_preferences.custom_app_name or '').strip()
        app_name = custom_app_name or 'Personal AI'
        folder_name = integration.drive_folder_name if (integration and integration.drive_folder_name) else f"{app_name} Documents"

        serializer = UploadedDocumentSerializer(docs, many=True)
        return Response({
            'documents': serializer.data,
            'total_count': docs.count(),
            'synced_drive_count': docs.exclude(drive_file_id='').count(),
            'is_drive_connected': is_drive_connected,
            'drive_folder_name': folder_name,
            'drive_folder_id': integration.drive_folder_id if integration else '',
            'app_name': app_name,
        }, status=status.HTTP_200_OK)


class AppUploadedDocumentDetailView(APIView):
    """
    Delete an individual document uploaded via this web application.
    Removes it from the database, disk, and the user's Google Drive folder.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        doc = get_object_or_404(UploadedDocument, pk=pk, user=request.user, uploaded_via_app=True)
        doc_name = doc.original_name
        had_drive = bool(doc.drive_file_id)
        doc.delete()  # Cleans up file on disk, database record, and Google Drive file
        return Response({
            'message': f"Deleted '{doc_name}' successfully" + (" and removed from your Google Drive folder." if had_drive else ".")
        }, status=status.HTTP_200_OK)


class AppClearUploadedDocumentsView(APIView):
    """
    Clear all documents uploaded via this web application.
    Permanently deletes all app-uploaded documents from database and user's Google Drive folder.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        docs = UploadedDocument.objects.filter(user=request.user, uploaded_via_app=True)
        count = docs.count()
        drive_deleted_count = 0

        for doc in list(docs):
            if doc.drive_file_id:
                drive_deleted_count += 1
            doc.delete()

        msg = f"Successfully cleared {count} uploaded document(s) from application."
        if drive_deleted_count > 0:
            msg += f" ({drive_deleted_count} removed from your Google Drive folder)"

        return Response({
            'message': msg,
            'deleted_count': count,
            'drive_deleted_count': drive_deleted_count,
        }, status=status.HTTP_200_OK)


class DeleteAccountView(APIView):
    """
    Permanently delete the user account and all associated data.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        # Clean up physical documents
        for doc in UploadedDocument.objects.filter(user=user):
            doc.delete()
        user.delete()
        return Response({'message': 'Your account and all associated data have been permanently deleted.'}, status=status.HTTP_200_OK)


# ============================================================================
# Conversation & Chat Views
# ============================================================================

class ConversationListCreateView(APIView):
    """
    List user conversations or create a new conversation.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        conversations = Conversation.objects.filter(user=request.user).order_by('-updated_at')
        serializer = ConversationListSerializer(conversations, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        title = request.data.get('title', '').strip() or 'New Chat'
        conversation = Conversation.objects.create(
            user=request.user,
            title=title[:255]
        )
        serializer = ConversationDetailSerializer(conversation)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ConversationDetailView(APIView):
    """
    Retrieve, update (rename), or delete a specific conversation.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        conversation = get_object_or_404(Conversation, pk=pk, user=request.user)
        serializer = ConversationDetailSerializer(conversation)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        conversation = get_object_or_404(Conversation, pk=pk, user=request.user)
        serializer = ConversationUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        conversation.title = serializer.validated_data['title']
        conversation.save(update_fields=['title', 'updated_at'])

        return Response(ConversationDetailSerializer(conversation).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        conversation = get_object_or_404(Conversation, pk=pk, user=request.user)
        conversation.delete()
        return Response({'message': 'Conversation deleted successfully.'}, status=status.HTTP_200_OK)


class SendMessageView(APIView):
    """
    Send a message within a conversation and receive an AI response.
    Automatically generates a conversation title from the first message.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        conversation = get_object_or_404(Conversation, pk=pk, user=request.user)
        serializer = MessageCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        content = serializer.validated_data['content']
        use_web_search = serializer.validated_data.get('use_web_search', False)

        # 1. Save user message
        user_message = Message.objects.create(
            conversation=conversation,
            role='user',
            content=content
        )

        # 2. Auto-generate conversation title from first user message if default
        if conversation.title in ['New Chat', ''] or conversation.messages.count() <= 2:
            snippet = content.strip().split('\n')[0]
            if len(snippet) > 36:
                snippet = snippet[:33].strip() + '...'
            if snippet:
                conversation.title = snippet

        # 3. Generate AI response via service layer
        ai_reply_content = generate_ai_response(
            conversation=conversation,
            user_message=content,
            use_web_search=use_web_search,
        )

        # 4. Save AI assistant message
        assistant_message = Message.objects.create(
            conversation=conversation,
            role='assistant',
            content=ai_reply_content
        )

        # 5. Touch conversation timestamp
        conversation.save(update_fields=['title', 'updated_at'])

        return Response({
            'user_message': MessageSerializer(user_message).data,
            'assistant_message': MessageSerializer(assistant_message).data,
            'conversation_title': conversation.title,
        }, status=status.HTTP_201_CREATED)


class MessageDetailView(APIView):
    """
    Edit a user message within a conversation and regenerate the AI response cleanly.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk, message_id):
        conversation = get_object_or_404(Conversation, pk=pk, user=request.user)
        user_message = get_object_or_404(
            Message,
            pk=message_id,
            conversation=conversation,
            role='user',
        )

        serializer = MessageCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_content = serializer.validated_data['content']
        use_web_search = serializer.validated_data.get('use_web_search', False)

        # Update user prompt and prune subsequent messages so conversation timeline stays consistent
        user_message.content = new_content
        user_message.save(update_fields=['content'])
        Message.objects.filter(conversation=conversation, id__gt=user_message.id).delete()

        # Generate refreshed AI response
        ai_reply_content = generate_ai_response(
            conversation=conversation,
            user_message=new_content,
            use_web_search=use_web_search,
        )

        assistant_message = Message.objects.create(
            conversation=conversation,
            role='assistant',
            content=ai_reply_content,
        )
        conversation.save(update_fields=['updated_at'])

        return Response({
            'user_message': MessageSerializer(user_message).data,
            'assistant_message': MessageSerializer(assistant_message).data,
            'conversation_title': conversation.title,
            'conversation': ConversationDetailSerializer(conversation).data,
        }, status=status.HTTP_200_OK)


class HealthCheckView(APIView):
    """
    Lightweight healthcheck endpoint for Docker, load balancers, and monitoring.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            'status': 'healthy',
            'service': 'personal-ai-backend',
            'google_client_id': django_settings.GOOGLE_CLIENT_ID or '',
        }, status=status.HTTP_200_OK)


# ============================================================================
# Shared Helper for Google Workspace OAuth Connection (Calendar & Gmail)
# ============================================================================

def _save_workspace_record(user, model_cls, email_field, display_field, access_token, refresh_token, expires_in, scope, resolved_email, resolved_name):
    integration, _ = model_cls.objects.get_or_create(user=user)
    integration.is_connected = True
    integration.access_token = access_token or ''
    if refresh_token:
        integration.refresh_token = refresh_token
    integration.token_expiry = timezone.now() + timedelta(seconds=expires_in)
    integration.scope = scope
    setattr(integration, email_field, resolved_email)
    setattr(integration, display_field, resolved_name)
    integration.connected_at = timezone.now()
    integration.save()
    return integration


class GoogleWorkspaceConnectView(APIView):
    """
    Connect both Google Calendar and Gmail in a single OAuth authorization
    for the user's signed-in Google account (no separate account chooser).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GoogleDriveConnectSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        code = serializer.validated_data.get('code')
        access_token = serializer.validated_data.get('access_token')
        refresh_token = serializer.validated_data.get('refresh_token', '')
        redirect_uri = serializer.validated_data.get('redirect_uri', 'postmessage')
        default_scope = f"{GOOGLE_CALENDAR_SCOPE} {GMAIL_SCOPE}"

        try:
            if code:
                token_data = exchange_google_code(code, redirect_uri=redirect_uri)
                access_token = token_data.get('access_token')
                refresh_token = token_data.get('refresh_token', '')
                expires_in = int(token_data.get('expires_in') or 3600)
                scope = token_data.get('scope') or default_scope
            else:
                expires_in = 3600
                scope = default_scope

            user_info = fetch_google_account_profile(access_token) if access_token else {}
            gmail_email = fetch_gmail_profile(access_token) if access_token else ''
            resolved_email = (gmail_email or user_info.get('email') or request.user.email or '').strip()
            resolved_name = user_info.get('display_name') or request.user.get_full_name() or request.user.username

            if (
                request.user.email
                and resolved_email
                and resolved_email.lower() != request.user.email.strip().lower()
            ):
                return Response(
                    {
                        'error': (
                            f"Please authorize using your signed-in account ({request.user.email}) "
                            f"instead of {resolved_email}."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            scope_lower = str(scope).lower()
            connect_calendar = ('calendar' in scope_lower) or (not code and 'gmail' not in scope_lower)
            connect_gmail = ('gmail' in scope_lower) or (not code and 'calendar' not in scope_lower)

            cal_obj, _ = GoogleCalendarIntegration.objects.get_or_create(user=request.user)
            gmail_obj, _ = GmailIntegration.objects.get_or_create(user=request.user)

            if connect_calendar:
                cal_obj = _save_workspace_record(
                    request.user,
                    GoogleCalendarIntegration,
                    'calendar_email',
                    'calendar_display_name',
                    access_token,
                    refresh_token or cal_obj.refresh_token,
                    expires_in,
                    scope,
                    resolved_email,
                    resolved_name,
                )

            if connect_gmail:
                gmail_obj = _save_workspace_record(
                    request.user,
                    GmailIntegration,
                    'gmail_address',
                    'gmail_display_name',
                    access_token,
                    refresh_token or gmail_obj.refresh_token,
                    expires_in,
                    scope,
                    resolved_email,
                    resolved_name,
                )

            if connect_calendar or connect_gmail:
                create_notification(
                    user=request.user,
                    title="Mail & Calendar Connected",
                    message=f"Google Calendar and Gmail are connected for {resolved_email}.",
                    category='integration',
                    action_url='/integrations',
                )

            return Response(
                {
                    'message': f'Connected Google Workspace for {resolved_email}.',
                    'calendar': GoogleCalendarIntegrationSerializer(cal_obj).data,
                    'gmail': GmailIntegrationSerializer(gmail_obj).data,
                },
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response(
                {'error': f'Failed to connect Google Mail & Calendar: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )


def _connect_google_workspace_integration(request, model_cls, serializer_cls, default_scope, email_field, display_field, label, fetch_email_fn=None):
    serializer = GoogleDriveConnectSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    code = serializer.validated_data.get('code')
    access_token = serializer.validated_data.get('access_token')
    refresh_token = serializer.validated_data.get('refresh_token', '')
    redirect_uri = serializer.validated_data.get('redirect_uri', 'postmessage')

    integration, _ = model_cls.objects.get_or_create(user=request.user)
    try:
        if code:
            token_data = exchange_google_code(code, redirect_uri=redirect_uri)
            access_token = token_data.get('access_token')
            refresh_token = token_data.get('refresh_token', integration.refresh_token)
            expires_in = token_data.get('expires_in', 3600)
            scope = token_data.get('scope', default_scope)
        else:
            expires_in = 3600
            scope = default_scope

        user_info = fetch_google_account_profile(access_token) if access_token else {}
        resolved_email = (fetch_email_fn(access_token) if (fetch_email_fn and access_token) else '') or user_info.get('email') or request.user.email
        resolved_name = user_info.get('display_name') or request.user.get_full_name() or request.user.username

        integration.is_connected = True
        integration.access_token = access_token or ''
        if refresh_token:
            integration.refresh_token = refresh_token
        integration.token_expiry = timezone.now() + timedelta(seconds=expires_in)
        integration.scope = scope
        setattr(integration, email_field, resolved_email)
        setattr(integration, display_field, resolved_name)
        integration.connected_at = timezone.now()
        integration.save()

        create_notification(
            user=request.user,
            title=f"{label} Connected",
            message=f"{label} is now connected for {resolved_email}.",
            category='integration',
            action_url='/integrations',
        )

        return Response({
            'message': f'{label} connected successfully.',
            'data': serializer_cls(integration).data,
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': f'Failed to connect {label}: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


def _disconnect_google_workspace_integration(request, model_cls, serializer_cls, label):
    integration, _ = model_cls.objects.get_or_create(user=request.user)
    if integration.access_token or integration.refresh_token:
        revoke_google_token(integration.refresh_token or integration.access_token)

    integration.is_connected = False
    integration.access_token = ''
    integration.refresh_token = ''
    integration.token_expiry = None
    integration.connected_at = None
    integration.save()

    return Response({
        'message': f'{label} disconnected successfully.',
        'data': serializer_cls(integration).data,
    }, status=status.HTTP_200_OK)


# ============================================================================
# Google Calendar Integration Views
# ============================================================================

class GoogleCalendarStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        integration, _ = GoogleCalendarIntegration.objects.get_or_create(user=request.user)
        return Response(GoogleCalendarIntegrationSerializer(integration).data, status=status.HTTP_200_OK)


class GoogleCalendarConnectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return _connect_google_workspace_integration(
            request,
            GoogleCalendarIntegration,
            GoogleCalendarIntegrationSerializer,
            GOOGLE_CALENDAR_SCOPE,
            'calendar_email',
            'calendar_display_name',
            'Google Calendar',
        )


class GoogleCalendarDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return _disconnect_google_workspace_integration(
            request,
            GoogleCalendarIntegration,
            GoogleCalendarIntegrationSerializer,
            'Google Calendar',
        )


class GoogleCalendarEventsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        integration, _ = GoogleCalendarIntegration.objects.get_or_create(user=request.user)
        if not integration.is_connected:
            return Response(
                {'error': 'Google Calendar is not connected. Please connect Google Calendar first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            days = int(request.query_params.get('days', 14))
            days = max(1, min(days, 90))
        except (TypeError, ValueError):
            days = 14

        try:
            token = ensure_valid_google_token(integration)
            events = list_calendar_events(token, days=days)
            return Response({'events': events}, status=status.HTTP_200_OK)
        except GoogleDriveAPIError as gde:
            return Response(gde.to_dict(), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request):
        integration, _ = GoogleCalendarIntegration.objects.get_or_create(user=request.user)
        if not integration.is_connected:
            return Response(
                {'error': 'Google Calendar is not connected. Please connect Google Calendar first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CalendarEventCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            token = ensure_valid_google_token(integration)
            event = create_calendar_event(
                access_token=token,
                summary=serializer.validated_data['summary'],
                start_time=serializer.validated_data['start_time'],
                end_time=serializer.validated_data['end_time'],
                description=serializer.validated_data.get('description', ''),
                location=serializer.validated_data.get('location', ''),
            )
            create_notification(
                user=request.user,
                title="Calendar Event Created",
                message=f"Scheduled '{event['summary']}' on Google Calendar.",
                category='calendar',
                action_url='/integrations',
            )
            return Response({'message': 'Calendar event created successfully.', 'event': event}, status=status.HTTP_201_CREATED)
        except GoogleDriveAPIError as gde:
            return Response(gde.to_dict(), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class GoogleCalendarEventDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, event_id):
        integration, _ = GoogleCalendarIntegration.objects.get_or_create(user=request.user)
        if not integration.is_connected:
            return Response({'error': 'Google Calendar is not connected.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token = ensure_valid_google_token(integration)
            delete_calendar_event(token, event_id)
            return Response({'message': 'Calendar event deleted.'}, status=status.HTTP_200_OK)
        except GoogleDriveAPIError as gde:
            return Response(gde.to_dict(), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ============================================================================
# Gmail Integration Views
# ============================================================================

class GmailStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        integration, _ = GmailIntegration.objects.get_or_create(user=request.user)
        return Response(GmailIntegrationSerializer(integration).data, status=status.HTTP_200_OK)


class GmailConnectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return _connect_google_workspace_integration(
            request,
            GmailIntegration,
            GmailIntegrationSerializer,
            GMAIL_SCOPE,
            'gmail_address',
            'gmail_display_name',
            'Gmail',
            fetch_email_fn=fetch_gmail_profile,
        )


class GmailDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return _disconnect_google_workspace_integration(
            request,
            GmailIntegration,
            GmailIntegrationSerializer,
            'Gmail',
        )


class GmailMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        integration, _ = GmailIntegration.objects.get_or_create(user=request.user)
        if not integration.is_connected:
            return Response(
                {'error': 'Gmail is not connected. Please connect Gmail first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        query = request.query_params.get('q', '')
        try:
            token = ensure_valid_google_token(integration)
            messages = list_gmail_messages(token, query=query, max_results=15)
            return Response({'messages': messages}, status=status.HTTP_200_OK)
        except GoogleDriveAPIError as gde:
            return Response(gde.to_dict(), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class GmailSendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        integration, _ = GmailIntegration.objects.get_or_create(user=request.user)
        if not integration.is_connected:
            return Response(
                {'error': 'Gmail is not connected. Please connect Gmail first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = GmailSendSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            token = ensure_valid_google_token(integration)
            sent = send_gmail_message(
                access_token=token,
                to_email=serializer.validated_data['to'],
                subject=serializer.validated_data['subject'],
                body=serializer.validated_data['body'],
            )
            create_notification(
                user=request.user,
                title="Email Sent via Gmail",
                message=f"Sent '{sent['subject']}' to {sent['to']}.",
                category='email',
                action_url='/integrations',
            )
            return Response({'message': 'Email sent successfully via Gmail.', 'sent': sent}, status=status.HTTP_200_OK)
        except GoogleDriveAPIError as gde:
            return Response(gde.to_dict(), status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ============================================================================
# Live Web Search Integration View
# ============================================================================

class WebSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        app_settings, _ = ApplicationSettings.objects.get_or_create(user=request.user)
        if not app_settings.web_search_enabled:
            return Response(
                {'error': 'Web Search is disabled in your settings. Enable Web Search to perform live lookups.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = WebSearchRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            results = perform_web_search(
                query=serializer.validated_data['query'],
                max_results=serializer.validated_data.get('max_results', 5),
            )
            return Response({
                'query': serializer.validated_data['query'],
                'results': results,
                'count': len(results),
            }, status=status.HTTP_200_OK)
        except ValueError as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Web search failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================================================
# Notifications Center Views
# ============================================================================

class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Opportunistically sync upcoming Google Calendar event alerts & due reminders
        sync_upcoming_calendar_notifications(request.user)
        triggered_reminders = sync_due_reminders(request.user)

        qs = Notification.objects.filter(user=request.user)
        unread_count = qs.filter(is_read=False).count()
        serializer = NotificationSerializer(qs[:40], many=True)
        return Response({
            'notifications': serializer.data,
            'unread_count': unread_count,
            'newly_triggered_reminders': ReminderSerializer(triggered_reminders, many=True).data,
        }, status=status.HTTP_200_OK)


class NotificationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        notif = get_object_or_404(Notification, pk=pk, user=request.user)
        notif.is_read = True
        notif.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notif).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        notif = get_object_or_404(Notification, pk=pk, user=request.user)
        notif.delete()
        return Response({'message': 'Notification removed.'}, status=status.HTTP_200_OK)


class NotificationReadAllView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({'message': f'Marked {updated} notification(s) as read.', 'updated_count': updated}, status=status.HTTP_200_OK)


class NotificationClearView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        deleted_count, _ = Notification.objects.filter(user=request.user).delete()
        return Response({'message': f'Cleared {deleted_count} notification(s).', 'deleted_count': deleted_count}, status=status.HTTP_200_OK)


# ============================================================================
# Reminder System Views
# ============================================================================

class ReminderListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        newly_triggered = sync_due_reminders(request.user)
        upcoming_qs = Reminder.objects.filter(user=request.user, status='pending').order_by('scheduled_at')
        history_qs = ReminderHistory.objects.filter(user=request.user).order_by('-recorded_at')[:50]

        now = timezone.now()
        due_now = upcoming_qs.filter(scheduled_at__lte=now)

        return Response({
            'upcoming': ReminderSerializer(upcoming_qs, many=True).data,
            'upcoming_count': upcoming_qs.count(),
            'due_now': ReminderSerializer(due_now, many=True).data,
            'newly_triggered': ReminderSerializer(newly_triggered, many=True).data,
            'history': ReminderHistorySerializer(history_qs, many=True).data,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = ReminderCreateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        reminder = Reminder.objects.create(
            user=request.user,
            title=data['title'],
            message=data.get('message', ''),
            scheduled_at=data['scheduled_at'],
            timezone_name=data.get('timezone_name', 'UTC'),
            recurrence=data.get('recurrence', 'none'),
            status='pending',
        )
        return Response(ReminderSerializer(reminder).data, status=status.HTTP_201_CREATED)


class ReminderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        reminder = get_object_or_404(Reminder, pk=pk, user=request.user)
        serializer = ReminderCreateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        reminder.title = data['title']
        reminder.message = data.get('message', '')
        reminder.scheduled_at = data['scheduled_at']
        reminder.timezone_name = data.get('timezone_name', reminder.timezone_name)
        reminder.recurrence = data.get('recurrence', reminder.recurrence)
        reminder.status = 'pending'
        reminder.notified_for_at = None
        reminder.snoozed_until = None
        reminder.completed_at = None
        reminder.save()
        return Response(ReminderSerializer(reminder).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        reminder = get_object_or_404(Reminder, pk=pk, user=request.user)
        reminder.delete()
        return Response({'message': 'Reminder deleted.'}, status=status.HTTP_200_OK)


class ReminderSnoozeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        reminder = get_object_or_404(Reminder, pk=pk, user=request.user)
        serializer = ReminderSnoozeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        minutes = int(serializer.validated_data['minutes'])
        now = timezone.now()
        new_time = now + timedelta(minutes=minutes)

        ReminderHistory.objects.create(
            user=request.user,
            reminder=reminder,
            title=reminder.title,
            message=reminder.message or '',
            scheduled_at=reminder.scheduled_at,
            timezone_name=reminder.timezone_name,
            recurrence=reminder.recurrence,
            event_type='snoozed',
        )

        reminder.scheduled_at = new_time
        reminder.snoozed_until = new_time
        reminder.status = 'pending'
        reminder.notified_for_at = None
        reminder.completed_at = None
        reminder.save()

        return Response({
            'message': f'Reminder snoozed for {minutes} minutes.',
            'reminder': ReminderSerializer(reminder).data,
        }, status=status.HTTP_200_OK)


class ReminderCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        reminder = get_object_or_404(Reminder, pk=pk, user=request.user)
        now = timezone.now()

        ReminderHistory.objects.create(
            user=request.user,
            reminder=reminder,
            title=reminder.title,
            message=reminder.message or '',
            scheduled_at=reminder.scheduled_at,
            timezone_name=reminder.timezone_name,
            recurrence=reminder.recurrence,
            event_type='completed',
        )

        if reminder.recurrence in ('daily', 'weekly', 'monthly'):
            next_dt = compute_next_occurrence(
                reminder.scheduled_at,
                reminder.recurrence,
                reminder.timezone_name,
                reference_now=now,
            )
            reminder.scheduled_at = next_dt
            reminder.status = 'pending'
            reminder.notified_for_at = None
            reminder.snoozed_until = None
            reminder.completed_at = now
            reminder.save()
            return Response({
                'message': f'Completed current occurrence. Next {reminder.recurrence} reminder scheduled.',
                'rescheduled': True,
                'reminder': ReminderSerializer(reminder).data,
            }, status=status.HTTP_200_OK)

        reminder.status = 'completed'
        reminder.completed_at = now
        reminder.save()
        return Response({
            'message': 'Reminder marked as done.',
            'rescheduled': False,
            'reminder': ReminderSerializer(reminder).data,
        }, status=status.HTTP_200_OK)


class ReminderHistoryClearView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        deleted_count, _ = ReminderHistory.objects.filter(user=request.user).delete()
        return Response({'message': f'Cleared {deleted_count} history item(s).', 'deleted_count': deleted_count}, status=status.HTTP_200_OK)
