from io import BytesIO
from unittest.mock import patch
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

        patch_res = self.client.patch('/api/personalization/preferences/', {
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
        self.assertEqual(patch_res.data['response_style'], 'Technical')
        self.assertEqual(patch_res.data['nickname'], 'arrsh')
        self.assertEqual(patch_res.data['occupation'], 'software engineer')
        self.assertEqual(patch_res.data['more_about_you'], 'Passionate about building knowledge-based AI systems.')
        self.assertEqual(patch_res.data['creativity'], 0.3)

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
