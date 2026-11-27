from io import BytesIO
from datetime import datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
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
    GoogleCalendarIntegration,
    GmailIntegration,
    Notification,
    Reminder,
    ReminderHistory,
)


class GoogleOAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_missing_payload_fails(self):
        response = self.client.post('/api/auth/google/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_google_auth_init_url(self):
        response = self.client.get('/api/auth/google/url/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('url', response.data)
        self.assertIn('state', response.data)
        self.assertIn('accounts.google.com', response.data['url'])
        self.assertIn('client_id=', response.data['url'])

    @patch('ai_company.services.id_token.verify_oauth2_token')
    def test_google_id_token_success(self, mock_verify):
        mock_verify.return_value = {
            'sub': 'google_1234567890',
            'email': 'developer@personalai.app',
            'given_name': 'Alex',
            'family_name': 'Doe',
            'picture': 'https://lh3.googleusercontent.com/test-avatar.jpg',
            'email_verified': True,
        }

        response = self.client.post('/api/auth/google/', {
            'credential': 'fake_google_jwt_token'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['email'], 'developer@personalai.app')
        self.assertEqual(response.data['user']['first_name'], 'Alex')
        self.assertEqual(response.data['user']['last_name'], 'Doe')

        # Check DB records
        user = User.objects.get(email='developer@personalai.app')
        self.assertEqual(user.first_name, 'Alex')
        self.assertTrue(hasattr(user, 'profile'))
        self.assertEqual(user.profile.google_id, 'google_1234567890')
        self.assertEqual(user.profile.avatar_url, 'https://lh3.googleusercontent.com/test-avatar.jpg')

    @patch('ai_company.services.exchange_code_for_tokens')
    @patch('ai_company.services.fetch_user_info_via_access_token')
    def test_google_callback_endpoint_success(self, mock_fetch_user, mock_exchange):
        mock_exchange.return_value = {
            'access_token': 'fake_access_token',
        }
        mock_fetch_user.return_value = {
            'sub': 'google_callback_112233',
            'email': 'callbackuser@personalai.app',
            'name': 'Taylor Swift',
            'picture': 'https://lh3.googleusercontent.com/taylor.jpg',
        }

        response = self.client.post('/api/auth/google/callback/', {
            'code': 'valid_callback_code',
            'redirect_uri': 'http://localhost:5173/auth/callback'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertEqual(response.data['user']['email'], 'callbackuser@personalai.app')
        self.assertEqual(response.data['user']['first_name'], 'Taylor')
        self.assertEqual(response.data['user']['last_name'], 'Swift')

    def test_unauthenticated_me_endpoint_rejected(self):
        response = self.client.get('/api/users/me/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_refresh(self):
        user = User.objects.create_user(
            username='refreshuser',
            email='refresh@personalai.app'
        )
        refresh = RefreshToken.for_user(user)

        response = self.client.post('/api/auth/token/refresh/', {
            'refresh': str(refresh)
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)


class ProfileAndPersonalizationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='jane_dev',
            email='jane@personalai.app',
            first_name='Jane',
            last_name='Dev'
        )
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')

    def test_profile_get_and_patch(self):
        # GET profile
        get_res = self.client.get('/api/users/me/')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data['email'], 'jane@personalai.app')
        self.assertEqual(get_res.data['profile']['login_provider'], 'Google')

        # PATCH profile
        patch_res = self.client.patch('/api/users/me/', {
            'preferred_name': 'Janey',
            'phone_number': '+1-555-0199',
            'first_name': 'Jane Elizabeth',
        }, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['first_name'], 'Jane Elizabeth')
        self.assertEqual(patch_res.data['profile']['preferred_name'], 'Janey')
        self.assertEqual(patch_res.data['profile']['phone_number'], '+1-555-0199')

    def test_ai_preferences_get_and_patch(self):
        get_res = self.client.get('/api/personalization/preferences/')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data['response_style'], 'Friendly')
        self.assertEqual(get_res.data.get('custom_app_name'), '')

        # Me endpoint returns default app_name
        me_res = self.client.get('/api/auth/me/')
        self.assertEqual(me_res.data.get('app_name'), 'Personal AI')

        patch_res = self.client.patch('/api/personalization/preferences/', {
            'custom_app_name': "Arsh's AI",
            'response_style': 'Technical',
            'response_length': 'Detailed',
            'explanation_level': 'Advanced',
            'answer_format': 'Step-by-Step',
            'custom_instructions': 'I am a backend specialist.',
            'nickname': 'arrsh',
            'occupation': 'software engineer',
            'more_about_you': 'Passionate about building knowledge-based AI systems.',
            'creativity': 0.3
        }, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['custom_app_name'], "Arsh's AI")
        self.assertEqual(patch_res.data['response_style'], 'Technical')
        self.assertEqual(patch_res.data['nickname'], 'arrsh')
        self.assertEqual(patch_res.data['occupation'], 'software engineer')
        self.assertEqual(patch_res.data['more_about_you'], 'Passionate about building knowledge-based AI systems.')
        self.assertEqual(patch_res.data['creativity'], 0.3)

        # Me endpoint now reflects the customized app name
        me_after_res = self.client.get('/api/auth/me/')
        self.assertEqual(me_after_res.data.get('app_name'), "Arsh's AI")

    def test_personal_information_crud(self):
        # Create
        create_res = self.client.post('/api/personalization/information/', {
            'category': 'technical_skills',
            'title': 'Core Languages',
            'content': 'Python, JavaScript, SQL, TypeScript'
        }, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        item_id = create_res.data['id']

        # List
        list_res = self.client.get('/api/personalization/information/')
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_res.data), 1)

        # Update
        patch_res = self.client.patch(f'/api/personalization/information/{item_id}/', {
            'title': 'Programming Languages & Frameworks'
        }, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['title'], 'Programming Languages & Frameworks')

        # Delete
        del_res = self.client.delete(f'/api/personalization/information/{item_id}/')
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertEqual(PersonalInformation.objects.filter(id=item_id).count(), 0)

    def test_document_upload_and_text_extraction(self):
        # Upload a sample TXT document
        sample_content = b"Personal AI Knowledge Base: Machine learning systems require high quality training data."
        uploaded_file = SimpleUploadedFile(
            "knowledge_notes.txt",
            sample_content,
            content_type="text/plain"
        )

        upload_res = self.client.post('/api/personalization/documents/upload/', {
            'files': [uploaded_file]
        }, format='multipart')

        self.assertEqual(upload_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(upload_res.data['success_count'], 1)
        doc_id = upload_res.data['documents'][0]['id']
        self.assertEqual(upload_res.data['documents'][0]['status'], 'completed')

        # Verify extracted content
        doc = UploadedDocument.objects.get(id=doc_id)
        self.assertTrue(hasattr(doc, 'extracted_content'))
        self.assertIn("Personal AI Knowledge Base", doc.extracted_content.text_content)
        self.assertGreater(doc.extracted_content.word_count, 5)

        # Retrieve document detail
        detail_res = self.client.get(f'/api/personalization/documents/{doc_id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_res.data['extracted_content']['word_count'], doc.extracted_content.word_count)

        # Delete document
        del_res = self.client.delete(f'/api/personalization/documents/{doc_id}/')
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertFalse(UploadedDocument.objects.filter(id=doc_id).exists())

    def test_user_document_isolation_by_user_id(self):
        other_user = User.objects.create_user(username='doc_other', email='other_doc@test.com')
        doc = UploadedDocument.objects.create(
            user=self.user,
            file='test.txt',
            original_name='confidential.txt',
            file_type='txt',
            file_size=120,
            status='completed'
        )
        self.assertEqual(doc.user_id, self.user.id)

        # Other user client
        other_client = APIClient()
        refresh = RefreshToken.for_user(other_user)
        other_client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')

        # Other user cannot see this user's documents
        list_res = other_client.get('/api/personalization/documents/')
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        doc_ids = [d['id'] for d in list_res.data]
        self.assertNotIn(doc.id, doc_ids)

        # Other user cannot access document detail
        detail_res = other_client.get(f'/api/personalization/documents/{doc.id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_404_NOT_FOUND)

        # Other user cannot delete document
        del_res = other_client.delete(f'/api/personalization/documents/{doc.id}/')
        self.assertEqual(del_res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(UploadedDocument.objects.filter(id=doc.id).exists())

    def test_user_memory_crud(self):
        # Create
        create_res = self.client.post('/api/personalization/memories/', {
            'content': 'Prefers dark mode and concise summaries',
            'source': 'Manual Entry',
            'is_active': True
        }, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        mem_id = create_res.data['id']

        # Update
        patch_res = self.client.patch(f'/api/personalization/memories/{mem_id}/', {
            'is_active': False
        }, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertFalse(patch_res.data['is_active'])

        # Delete
        del_res = self.client.delete(f'/api/personalization/memories/{mem_id}/')
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertFalse(UserMemory.objects.filter(id=mem_id).exists())

    def test_settings_and_data_export(self):
        # Get settings
        get_res = self.client.get('/api/settings/')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data['theme'], 'system')

        # Patch settings
        patch_res = self.client.patch('/api/settings/', {
            'theme': 'dark',
            'enter_to_send': False
        }, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['theme'], 'dark')
        self.assertFalse(patch_res.data['enter_to_send'])

        # Export data
        export_res = self.client.get('/api/settings/export/')
        self.assertEqual(export_res.status_code, status.HTTP_200_OK)
        self.assertIn('user', export_res.data)
        self.assertIn('ai_preferences', export_res.data)
        self.assertIn('application_settings', export_res.data)
        self.assertEqual(export_res.data['user']['email'], 'jane@personalai.app')


class ConversationAndChatTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='chatuser',
            email='chat@personalai.app',
            first_name='Chat',
            last_name='Tester'
        )
        self.other_user = User.objects.create_user(
            username='otheruser',
            email='other@personalai.app'
        )
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')

    def test_list_and_create_conversation(self):
        response = self.client.get('/api/conversations/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

        post_res = self.client.post('/api/conversations/', {'title': 'My Project Chat'}, format='json')
        self.assertEqual(post_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(post_res.data['title'], 'My Project Chat')
        conv_id = post_res.data['id']

        list_res = self.client.get('/api/conversations/')
        self.assertEqual(len(list_res.data), 1)
        self.assertEqual(list_res.data[0]['id'], conv_id)

    def test_conversation_authorization_isolation(self):
        other_conv = Conversation.objects.create(
            user=self.other_user,
            title="Secret other user chat"
        )

        list_res = self.client.get('/api/conversations/')
        self.assertEqual(len(list_res.data), 0)

        detail_res = self.client.get(f'/api/conversations/{other_conv.id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_404_NOT_FOUND)

        delete_res = self.client.delete(f'/api/conversations/{other_conv.id}/')
        self.assertEqual(delete_res.status_code, status.HTTP_404_NOT_FOUND)

    def test_rename_and_delete_conversation(self):
        conv = Conversation.objects.create(user=self.user, title="Old Title")

        patch_res = self.client.patch(
            f'/api/conversations/{conv.id}/',
            {'title': 'Updated Title'},
            format='json'
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['title'], 'Updated Title')
        conv.refresh_from_db()
        self.assertEqual(conv.title, 'Updated Title')

        del_res = self.client.delete(f'/api/conversations/{conv.id}/')
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertFalse(Conversation.objects.filter(id=conv.id).exists())

    def test_send_message_and_auto_title_generation(self):
        conv = Conversation.objects.create(user=self.user, title="New Chat")

        msg_res = self.client.post(
            f'/api/conversations/{conv.id}/messages/',
            {'content': 'Explain quantum computing in simple terms'},
            format='json'
        )
        self.assertEqual(msg_res.status_code, status.HTTP_201_CREATED)
        self.assertIn('user_message', msg_res.data)
        self.assertIn('assistant_message', msg_res.data)
        self.assertEqual(msg_res.data['user_message']['role'], 'user')
        self.assertEqual(msg_res.data['assistant_message']['role'], 'assistant')

        conv.refresh_from_db()
        self.assertNotEqual(conv.title, 'New Chat')
        self.assertTrue('quantum computing' in conv.title.lower())
        self.assertEqual(conv.messages.count(), 2)

    def test_unrelated_topic_response_when_no_documents(self):
        conv = Conversation.objects.create(user=self.user, title="New Chat")
        msg_res = self.client.post(
            f'/api/conversations/{conv.id}/messages/',
            {'content': 'What is the capital of France?'},
            format='json'
        )
        self.assertEqual(msg_res.status_code, status.HTTP_201_CREATED)
        reply = msg_res.data['assistant_message']['content']
        self.assertTrue("Sorry, I can't provide this" in reply or "Sorry, I can'nt provide this" in reply)
        self.assertIn("You didn't mention any information about this", reply)

    def test_unrelated_topic_response_with_document_knowledge_base(self):
        from .models import UploadedDocument, ExtractedDocumentContent
        doc = UploadedDocument.objects.create(
            user=self.user,
            file='test.txt',
            original_name='resume.txt',
            file_type='txt',
            file_size=200,
            status='completed'
        )
        ExtractedDocumentContent.objects.create(
            document=doc,
            text_content='Arshad is a full stack developer skilled in Django and React.',
            word_count=10,
            char_count=60
        )

        conv = Conversation.objects.create(user=self.user, title="New Chat")

        # Related query
        rel_res = self.client.post(
            f'/api/conversations/{conv.id}/messages/',
            {'content': 'What are my skills in Django?'},
            format='json'
        )
        self.assertEqual(rel_res.status_code, status.HTTP_201_CREATED)
        self.assertIn("Django", rel_res.data['assistant_message']['content'])

        # Unrelated query
        unrel_res = self.client.post(
            f'/api/conversations/{conv.id}/messages/',
            {'content': 'Explain black holes'},
            format='json'
        )
        self.assertEqual(unrel_res.status_code, status.HTTP_201_CREATED)
        unrel_reply = unrel_res.data['assistant_message']['content']
        self.assertTrue("Sorry, I can't provide this" in unrel_reply)
        self.assertIn("You didn't mention any information about this", unrel_reply)


class GoogleDriveIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testdriver',
            email='driver@example.com',
            password='testpassword123'
        )
        refresh = RefreshToken.for_user(self.user)
        self.token = str(refresh.access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')

    def test_drive_status_initial(self):
        response = self.client.get('/api/drive/status/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_connected'])
        self.assertIn("Allow Personal Assistant AI to create and manage files", response.data['permission_text'])

    def test_drive_connect_with_token(self):
        response = self.client.post('/api/drive/connect/', {
            'access_token': 'mock_access_token_12345',
            'refresh_token': 'mock_refresh_token_abcde',
        })
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['data']['is_connected'])
        self.assertEqual(response.data['data']['drive_email'], 'driver@example.com')

        # Verify status endpoint reflects connection
        status_res = self.client.get('/api/drive/status/')
        self.assertTrue(status_res.data['is_connected'])

    def test_drive_disconnect(self):
        # Connect first
        self.client.post('/api/drive/connect/', {'access_token': 'mock_token'})
        # Disconnect
        response = self.client.post('/api/drive/disconnect/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['data']['is_connected'])

    def test_user_profile_includes_google_drive(self):
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('google_drive', response.data)
        self.assertFalse(response.data['google_drive']['is_connected'])

    @patch('ai_company.views.get_or_create_app_folder')
    @patch('ai_company.views.upload_file_to_drive')
    def test_document_upload_stores_in_drive_folder(self, mock_upload, mock_folder):
        mock_folder.return_value = 'folder_12345'
        mock_upload.return_value = {
            'id': 'drive_file_999',
            'name': 'test_drive_doc.txt',
            'webViewLink': 'https://drive.google.com/file/d/drive_file_999/view'
        }

        # Connect user's Google Drive
        self.client.post('/api/drive/connect/', {'access_token': 'mock_token_abc'})

        test_file = SimpleUploadedFile(
            "test_drive_doc.txt",
            b"My notes to be saved in Google Drive folder.",
            content_type="text/plain"
        )
        res = self.client.post(
            '/api/personalization/documents/upload/',
            {'files': [test_file]},
            format='multipart'
        )
        self.assertEqual(res.status_code, 201)

        # Verify Google Drive folder and file storage were invoked
        mock_folder.assert_called_once()
        mock_upload.assert_called_once()

        # Check document in database
        doc = UploadedDocument.objects.get(user=self.user, original_name='test_drive_doc.txt')
        self.assertEqual(doc.drive_file_id, 'drive_file_999')
        self.assertTrue('https://drive.google.com' in doc.drive_web_link)
        self.assertTrue(doc.uploaded_via_app)

        # Check App Uploaded Documents endpoint in Settings
        app_docs_res = self.client.get('/api/settings/app-documents/')
        self.assertEqual(app_docs_res.status_code, 200)
        self.assertEqual(app_docs_res.data['total_count'], 1)
        self.assertEqual(app_docs_res.data['synced_drive_count'], 1)
        self.assertEqual(app_docs_res.data['documents'][0]['drive_file_id'], 'drive_file_999')

    @patch('ai_company.google_drive_service.delete_drive_file')
    def test_app_uploaded_document_delete(self, mock_delete):
        mock_delete.return_value = True

        doc = UploadedDocument.objects.create(
            user=self.user,
            file=SimpleUploadedFile("delete_me.txt", b"temporary notes"),
            original_name="delete_me.txt",
            file_type="txt",
            file_size=15,
            status='completed',
            drive_file_id='drive_to_delete_01',
            uploaded_via_app=True,
        )

        # Delete via settings app documents endpoint
        del_res = self.client.delete(f'/api/settings/app-documents/{doc.id}/')
        self.assertEqual(del_res.status_code, 200)
        self.assertFalse(UploadedDocument.objects.filter(pk=doc.id).exists())

    def test_app_clear_uploaded_documents(self):
        UploadedDocument.objects.create(
            user=self.user,
            file=SimpleUploadedFile("doc1.txt", b"notes 1"),
            original_name="doc1.txt",
            file_type="txt",
            file_size=7,
            status='completed',
            uploaded_via_app=True,
        )
        UploadedDocument.objects.create(
            user=self.user,
            file=SimpleUploadedFile("doc2.txt", b"notes 2"),
            original_name="doc2.txt",
            file_type="txt",
            file_size=7,
            status='completed',
            uploaded_via_app=True,
        )

        self.assertEqual(UploadedDocument.objects.filter(user=self.user, uploaded_via_app=True).count(), 2)
        clear_res = self.client.post('/api/settings/app-documents/clear/')
        self.assertEqual(clear_res.status_code, 200)
        self.assertEqual(clear_res.data['deleted_count'], 2)
        self.assertEqual(UploadedDocument.objects.filter(user=self.user, uploaded_via_app=True).count(), 0)

    @patch('ai_company.views.list_user_drive_files')
    def test_drive_api_disabled_error_handling(self, mock_list):
        from ai_company.google_drive_service import GoogleDriveAPIError
        mock_list.side_effect = GoogleDriveAPIError(
            "Google Drive API is not enabled in your Google Cloud Console project.",
            is_api_disabled=True,
            enable_url="https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=285108715643",
            project_id="285108715643"
        )

        self.client.post('/api/drive/connect/', {'access_token': 'mock_token_abc'})
        res = self.client.get('/api/drive/files/')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(res.data['is_api_disabled'])
        self.assertEqual(res.data['project_id'], '285108715643')
        self.assertIn('console.developers.google.com', res.data['enable_url'])


class AdvancedIntegrationsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="integrations_user",
            email="integrations@example.com",
            password="testpassword123",
            first_name="Alex",
        )
        self.client.force_authenticate(user=self.user)

    def test_calendar_status_and_validation(self):
        status_res = self.client.get('/api/integrations/calendar/status/')
        self.assertEqual(status_res.status_code, status.HTTP_200_OK)
        self.assertFalse(status_res.data['is_connected'])

        # Creating event when disconnected returns 400
        res_disconnected = self.client.post('/api/integrations/calendar/events/', {
            'summary': 'Team Sync',
            'start_time': '2026-12-01T10:00:00Z',
            'end_time': '2026-12-01T11:00:00Z',
        }, format='json')
        self.assertEqual(res_disconnected.status_code, status.HTTP_400_BAD_REQUEST)

        # Connect calendar directly via access_token
        with patch('ai_company.views.fetch_google_account_profile', return_value={'email': 'cal@example.com', 'display_name': 'Alex'}):
            connect_res = self.client.post('/api/integrations/calendar/connect/', {
                'access_token': 'mock_cal_token',
            }, format='json')
        self.assertEqual(connect_res.status_code, status.HTTP_200_OK)
        self.assertTrue(connect_res.data['data']['is_connected'])

        # Validation: end_time before start_time must fail with 400
        bad_event_res = self.client.post('/api/integrations/calendar/events/', {
            'summary': 'Invalid Window',
            'start_time': '2026-12-01T12:00:00Z',
            'end_time': '2026-12-01T11:00:00Z',
        }, format='json')
        self.assertEqual(bad_event_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('end_time', bad_event_res.data)

    @patch('ai_company.views.create_calendar_event')
    def test_calendar_event_creation_creates_notification(self, mock_create):
        cal, _ = GoogleCalendarIntegration.objects.get_or_create(user=self.user)
        cal.is_connected = True
        cal.access_token = 'valid_token'
        cal.calendar_email = 'cal@example.com'
        cal.save()

        mock_create.return_value = {
            'id': 'evt_123',
            'summary': 'Sprint Planning',
            'start': '2026-12-01T10:00:00Z',
            'end': '2026-12-01T11:00:00Z',
            'location': 'Meet',
            'html_link': 'https://calendar.google.com/event?eid=123',
        }

        res = self.client.post('/api/integrations/calendar/events/', {
            'summary': 'Sprint Planning',
            'start_time': '2026-12-01T10:00:00Z',
            'end_time': '2026-12-01T11:00:00Z',
            'location': 'Meet',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['event']['id'], 'evt_123')
        self.assertTrue(Notification.objects.filter(user=self.user, category='calendar').exists())

    def test_gmail_send_validation_and_success(self):
        gmail, _ = GmailIntegration.objects.get_or_create(user=self.user)
        gmail.is_connected = True
        gmail.access_token = 'valid_gmail_token'
        gmail.gmail_address = 'alex@example.com'
        gmail.save()

        # Invalid recipient email fails validation
        bad_email = self.client.post('/api/integrations/gmail/send/', {
            'to': 'not-an-email',
            'subject': 'Hello',
            'body': 'Body content',
        }, format='json')
        self.assertEqual(bad_email.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('to', bad_email.data)

        # Blank subject fails validation
        blank_subject = self.client.post('/api/integrations/gmail/send/', {
            'to': 'friend@example.com',
            'subject': '   ',
            'body': 'Body content',
        }, format='json')
        self.assertEqual(blank_subject.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('subject', blank_subject.data)

        with patch('ai_company.views.send_gmail_message', return_value={
            'id': 'msg_99',
            'to': 'friend@example.com',
            'subject': 'Hello World',
        }):
            ok_res = self.client.post('/api/integrations/gmail/send/', {
                'to': 'friend@example.com',
                'subject': 'Hello World',
                'body': 'Testing integrated send.',
            }, format='json')
        self.assertEqual(ok_res.status_code, status.HTTP_200_OK)
        self.assertEqual(ok_res.data['sent']['id'], 'msg_99')
        self.assertTrue(Notification.objects.filter(user=self.user, category='email').exists())

    def test_workspace_connect_same_account_and_mismatch_rejection(self):
        # Mismatched Google account email must be rejected
        with patch('ai_company.views.fetch_google_account_profile', return_value={'email': 'other@example.com', 'display_name': 'Other'}), \
             patch('ai_company.views.fetch_gmail_profile', return_value='other@example.com'):
            mismatch_res = self.client.post('/api/integrations/workspace/connect/', {
                'access_token': 'mock_token',
            }, format='json')
        self.assertEqual(mismatch_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('integrations@example.com', mismatch_res.data['error'])

        # Same signed-in account connects both Calendar and Gmail together
        with patch('ai_company.views.fetch_google_account_profile', return_value={'email': 'integrations@example.com', 'display_name': 'Alex'}), \
             patch('ai_company.views.fetch_gmail_profile', return_value='integrations@example.com'):
            ok_res = self.client.post('/api/integrations/workspace/connect/', {
                'access_token': 'mock_same_acct_token',
            }, format='json')
        self.assertEqual(ok_res.status_code, status.HTTP_200_OK)
        self.assertTrue(ok_res.data['calendar']['is_connected'])
        self.assertEqual(ok_res.data['calendar']['calendar_email'], 'integrations@example.com')
        self.assertTrue(ok_res.data['gmail']['is_connected'])
        self.assertEqual(ok_res.data['gmail']['gmail_address'], 'integrations@example.com')

    @patch('ai_company.services.exchange_code_for_tokens')
    @patch('ai_company.services.fetch_user_info_via_access_token')
    def test_google_login_auto_connects_calendar_and_gmail(self, mock_fetch_user, mock_exchange):
        mock_exchange.return_value = {
            'access_token': 'login_ws_access',
            'refresh_token': 'login_ws_refresh',
            'expires_in': 3600,
            'scope': (
                'openid email profile '
                'https://www.googleapis.com/auth/drive.file '
                'https://www.googleapis.com/auth/calendar.events '
                'https://www.googleapis.com/auth/gmail.readonly'
            ),
        }
        mock_fetch_user.return_value = {
            'sub': 'google_ws_123',
            'email': 'singleacct@personalai.app',
            'name': 'Sam User',
        }

        unauth_client = APIClient()
        res = unauth_client.post('/api/auth/google/', {'code': 'auth_code_with_ws'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ws_user = User.objects.get(email='singleacct@personalai.app')
        self.assertTrue(ws_user.google_drive.is_connected)
        self.assertEqual(ws_user.google_drive.drive_email, 'singleacct@personalai.app')
        self.assertTrue(ws_user.google_calendar.is_connected)
        self.assertEqual(ws_user.google_calendar.calendar_email, 'singleacct@personalai.app')
        self.assertTrue(ws_user.gmail_integration.is_connected)
        self.assertEqual(ws_user.gmail_integration.gmail_address, 'singleacct@personalai.app')

    def test_web_search_validation_and_chat_grounding(self):
        # Query < 2 chars fails validation
        bad_search = self.client.post('/api/integrations/web-search/', {'query': 'a'}, format='json')
        self.assertEqual(bad_search.status_code, status.HTTP_400_BAD_REQUEST)

        # Disabled web search blocks endpoint with 403
        settings_obj, _ = ApplicationSettings.objects.get_or_create(user=self.user)
        settings_obj.web_search_enabled = False
        settings_obj.save()

        disabled_res = self.client.post('/api/integrations/web-search/', {'query': 'Django REST'}, format='json')
        self.assertEqual(disabled_res.status_code, status.HTTP_403_FORBIDDEN)

        # Re-enable and test mocked search + chat grounding
        settings_obj.web_search_enabled = True
        settings_obj.save()

        mocked_results = [
            {
                'title': 'Django Official Docs',
                'url': 'https://www.djangoproject.com/',
                'snippet': 'Django makes it easier to build better web apps.',
            }
        ]
        with patch('ai_company.views.perform_web_search', return_value=mocked_results):
            search_res = self.client.post('/api/integrations/web-search/', {'query': 'Django framework', 'max_results': 3}, format='json')
        self.assertEqual(search_res.status_code, status.HTTP_200_OK)
        self.assertEqual(search_res.data['count'], 1)
        self.assertEqual(search_res.data['results'][0]['title'], 'Django Official Docs')

        conv = Conversation.objects.create(user=self.user, title='Web Search Chat')
        with patch('ai_company.ai_service.perform_web_search', return_value=mocked_results), \
             patch('ai_company.ai_service.call_groq_llm', return_value='Based on live search, [Django Official Docs](https://www.djangoproject.com/).'):
            msg_res = self.client.post(f'/api/conversations/{conv.id}/messages/', {
                'content': 'What is Django?',
                'use_web_search': True,
            }, format='json')
        self.assertEqual(msg_res.status_code, status.HTTP_201_CREATED)
        self.assertIn('Django Official Docs', msg_res.data['assistant_message']['content'])

    def test_voice_settings_validation_and_notifications_lifecycle(self):
        # Voice rate outside 0.5..2.0 fails validation
        bad_voice = self.client.patch('/api/settings/', {'voice_rate': 3.5}, format='json')
        self.assertEqual(bad_voice.status_code, status.HTTP_400_BAD_REQUEST)

        good_voice = self.client.patch('/api/settings/', {
            'voice_enabled': True,
            'voice_auto_speak': True,
            'voice_rate': 1.4,
        }, format='json')
        self.assertEqual(good_voice.status_code, status.HTTP_200_OK)
        self.assertTrue(good_voice.data['voice_auto_speak'])
        self.assertAlmostEqual(good_voice.data['voice_rate'], 1.4, places=2)

        n1 = Notification.objects.create(user=self.user, title='Doc Ready', message='PDF ready', category='document')
        n2 = Notification.objects.create(user=self.user, title='Meeting Soon', message='Standup in 10m', category='calendar')

        list_res = self.client.get('/api/notifications/')
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(list_res.data['unread_count'], 2)

        read_one = self.client.post(f'/api/notifications/{n1.id}/read/')
        self.assertEqual(read_one.status_code, status.HTTP_200_OK)
        self.assertTrue(read_one.data['is_read'])

        read_all = self.client.post('/api/notifications/read-all/')
        self.assertEqual(read_all.status_code, status.HTTP_200_OK)
        self.assertEqual(read_all.data['updated_count'], 1)

        del_one = self.client.delete(f'/api/notifications/{n2.id}/')
        self.assertEqual(del_one.status_code, status.HTTP_200_OK)

        clear_res = self.client.post('/api/notifications/clear/')
        self.assertEqual(clear_res.status_code, status.HTTP_200_OK)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 0)


class ReminderSystemTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="reminder_user",
            email="reminder@example.com",
            password="testpassword123",
            first_name="Maya",
        )
        self.client.force_authenticate(user=self.user)

    def test_create_reminder_validation_and_timezone_scheduling(self):
        # Blank title rejected
        res_blank = self.client.post('/api/reminders/', {
            'title': '   ',
            'scheduled_at': (timezone.now() + timedelta(hours=2)).isoformat(),
            'timezone_name': 'Asia/Kolkata',
        }, format='json')
        self.assertEqual(res_blank.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('title', res_blank.data)

        # Invalid timezone rejected
        res_bad_tz = self.client.post('/api/reminders/', {
            'title': 'Check Timezone',
            'scheduled_at': (timezone.now() + timedelta(hours=2)).isoformat(),
            'timezone_name': 'Invalid/Nowhere',
        }, format='json')
        self.assertEqual(res_bad_tz.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('timezone_name', res_bad_tz.data)

        # Past date rejected
        res_past = self.client.post('/api/reminders/', {
            'title': 'Yesterday task',
            'scheduled_at': (timezone.now() - timedelta(hours=2)).isoformat(),
            'timezone_name': 'UTC',
        }, format='json')
        self.assertEqual(res_past.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('scheduled_at', res_past.data)

        # Valid local wall-clock scheduling with IANA timezone
        from zoneinfo import ZoneInfo
        local_future = (timezone.now().astimezone(ZoneInfo('Asia/Kolkata')) + timedelta(hours=3)).replace(second=0, microsecond=0)
        res_ok = self.client.post('/api/reminders/', {
            'title': 'Attend project meeting',
            'message': 'Bring sprint demo slides',
            'scheduled_at': local_future.strftime('%Y-%m-%dT%H:%M'),
            'timezone_name': 'Asia/Kolkata',
            'recurrence': 'daily',
        }, format='json')
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ok.data['title'], 'Attend project meeting')
        self.assertEqual(res_ok.data['timezone_name'], 'Asia/Kolkata')
        self.assertEqual(res_ok.data['recurrence'], 'daily')
        self.assertEqual(res_ok.data['status'], 'pending')

    def test_due_reminder_creates_notification_and_history_without_duplicates(self):
        due_time = timezone.now() - timedelta(seconds=30)
        rem = Reminder.objects.create(
            user=self.user,
            title='Study Python',
            message='Review async/await decorators',
            scheduled_at=due_time,
            timezone_name='UTC',
            recurrence='none',
            status='pending',
        )

        # First poll triggers notification & triggered history log
        first_poll = self.client.get('/api/notifications/')
        self.assertEqual(first_poll.status_code, status.HTTP_200_OK)
        self.assertEqual(len(first_poll.data['newly_triggered_reminders']), 1)
        self.assertEqual(Notification.objects.filter(user=self.user, category='reminder').count(), 1)
        self.assertEqual(ReminderHistory.objects.filter(user=self.user, reminder=rem, event_type='triggered').count(), 1)

        # Second poll must NOT duplicate notification or triggered history
        second_poll = self.client.get('/api/notifications/')
        self.assertEqual(second_poll.status_code, status.HTTP_200_OK)
        self.assertEqual(len(second_poll.data['newly_triggered_reminders']), 0)
        self.assertEqual(Notification.objects.filter(user=self.user, category='reminder').count(), 1)

    def test_snooze_validation_and_rescheduling(self):
        rem = Reminder.objects.create(
            user=self.user,
            title='Standup Call',
            scheduled_at=timezone.now() - timedelta(minutes=1),
            notified_for_at=timezone.now() - timedelta(minutes=1),
            timezone_name='UTC',
        )

        # Only 5, 10, 30 allowed
        bad_snooze = self.client.post(f'/api/reminders/{rem.id}/snooze/', {'minutes': 15}, format='json')
        self.assertEqual(bad_snooze.status_code, status.HTTP_400_BAD_REQUEST)

        before = timezone.now()
        ok_snooze = self.client.post(f'/api/reminders/{rem.id}/snooze/', {'minutes': 10}, format='json')
        self.assertEqual(ok_snooze.status_code, status.HTTP_200_OK)
        rem.refresh_from_db()
        self.assertIsNone(rem.notified_for_at)
        self.assertGreaterEqual(rem.scheduled_at, before + timedelta(minutes=9))
        self.assertTrue(ReminderHistory.objects.filter(reminder=rem, event_type='snoozed').exists())

    def test_mark_done_one_time_and_recurring_monthly(self):
        from ai_company.reminder_service import compute_next_occurrence

        # Month-end clamping: Jan 31 -> Feb 28 in non-leap year 2026
        jan_31 = datetime(2026, 1, 31, 9, 0, tzinfo=dt_timezone.utc)
        next_feb = compute_next_occurrence(jan_31, 'monthly', 'UTC', reference_now=jan_31)
        self.assertEqual((next_feb.year, next_feb.month, next_feb.day, next_feb.hour), (2026, 2, 28, 9))

        # Recurring weekly reminder advances cleanly on complete
        future_dt = timezone.now() + timedelta(hours=1)
        rec_rem = Reminder.objects.create(
            user=self.user,
            title='Weekly Sync',
            scheduled_at=future_dt,
            timezone_name='UTC',
            recurrence='weekly',
        )
        res_rec = self.client.post(f'/api/reminders/{rec_rem.id}/complete/')
        self.assertEqual(res_rec.status_code, status.HTTP_200_OK)
        self.assertTrue(res_rec.data['rescheduled'])
        rec_rem.refresh_from_db()
        self.assertEqual(rec_rem.status, 'pending')
        self.assertGreaterEqual(rec_rem.scheduled_at, future_dt + timedelta(days=6))

        # One-time reminder marks completed
        one_rem = Reminder.objects.create(
            user=self.user,
            title='Submit report',
            scheduled_at=future_dt,
            timezone_name='UTC',
            recurrence='none',
        )
        res_one = self.client.post(f'/api/reminders/{one_rem.id}/complete/')
        self.assertEqual(res_one.status_code, status.HTTP_200_OK)
        self.assertFalse(res_one.data['rescheduled'])
        one_rem.refresh_from_db()
        self.assertEqual(one_rem.status, 'completed')
        self.assertEqual(ReminderHistory.objects.filter(user=self.user, event_type='completed').count(), 2)

        # Delete & clear history
        del_res = self.client.delete(f'/api/reminders/{one_rem.id}/')
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        clear_res = self.client.post('/api/reminders/history/clear/')
        self.assertEqual(clear_res.status_code, status.HTTP_200_OK)
        self.assertEqual(ReminderHistory.objects.filter(user=self.user).count(), 0)


class MessageEditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="edit_user",
            email="edit@example.com",
            password="testpassword123",
        )
        self.other_user = User.objects.create_user(
            username="other_edit_user",
            email="other@example.com",
            password="testpassword123",
        )
        self.client.force_authenticate(user=self.user)

    @patch('ai_company.views.generate_ai_response', return_value='Updated reply from AI')
    def test_edit_user_message_prunes_stale_replies_and_regenerates(self, mock_ai):
        conv = Conversation.objects.create(user=self.user, title='Original prompt')
        u1 = Message.objects.create(conversation=conv, role='user', content='Original question')
        a1 = Message.objects.create(conversation=conv, role='assistant', content='Old AI reply')
        u2 = Message.objects.create(conversation=conv, role='user', content='Follow up')
        a2 = Message.objects.create(conversation=conv, role='assistant', content='Old follow-up reply')

        # Blank edit fails validation
        bad_res = self.client.patch(f'/api/conversations/{conv.id}/messages/{u1.id}/', {'content': '   '}, format='json')
        self.assertEqual(bad_res.status_code, status.HTTP_400_BAD_REQUEST)

        # Cannot edit assistant messages
        asst_res = self.client.patch(f'/api/conversations/{conv.id}/messages/{a1.id}/', {'content': 'Hacked'}, format='json')
        self.assertEqual(asst_res.status_code, status.HTTP_404_NOT_FOUND)

        # Valid edit updates u1, deletes a1/u2/a2, and appends fresh AI reply
        res = self.client.patch(f'/api/conversations/{conv.id}/messages/{u1.id}/', {'content': 'Edited question'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        u1.refresh_from_db()
        self.assertEqual(u1.content, 'Edited question')
        self.assertEqual(res.data['assistant_message']['content'], 'Updated reply from AI')
        self.assertFalse(Message.objects.filter(pk__in=[a1.id, u2.id, a2.id]).exists())
        self.assertEqual(conv.messages.count(), 2)
        mock_ai.assert_called_once()

        # Other user cannot edit
        self.client.force_authenticate(user=self.other_user)
        forbidden = self.client.patch(f'/api/conversations/{conv.id}/messages/{u1.id}/', {'content': 'Steal'}, format='json')
        self.assertEqual(forbidden.status_code, status.HTTP_404_NOT_FOUND)
