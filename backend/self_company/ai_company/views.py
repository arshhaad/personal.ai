from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from .models import (
    UserProfile,
    UserAIPreferences,
    PersonalInformation,
    UploadedDocument,
    UserMemory,
    ApplicationSettings,
    Conversation,
    Message,
)
from .serializers import (
    GoogleAuthSerializer,
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
        redirect_uri = request.query_params.get(
            'redirect_uri',
            'http://localhost:5173/auth/callback'
        )
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
        redirect_uri = request.data.get('redirect_uri', 'http://localhost:5173/auth/callback')

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
                doc = UploadedDocument.objects.create(
                    user=request.user,
                    file=file_obj,
                    original_name=file_obj.name,
                    file_type=ext,
                    file_size=file_obj.size,
                    status='uploaded'
                )
                # Run extraction synchronously (or queue in background)
                process_document(doc)
                created_docs.append(doc)
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
        for doc in docs:
            doc.delete()
        return Response({'message': f'Successfully deleted {count} document(s).'}, status=status.HTTP_200_OK)


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
            user_message=content
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


class HealthCheckView(APIView):
    """
    Lightweight healthcheck endpoint for Docker, load balancers, and monitoring.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            'status': 'healthy',
            'service': 'personal-ai-backend',
        }, status=status.HTTP_200_OK)
