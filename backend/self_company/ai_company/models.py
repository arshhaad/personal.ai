import os
from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    google_id = models.CharField(max_length=255, blank=True, null=True, unique=True)
    avatar_url = models.URLField(max_length=1000, blank=True, null=True)
    preferred_name = models.CharField(max_length=150, blank=True, null=True)
    phone_number = models.CharField(max_length=30, blank=True, null=True)
    login_provider = models.CharField(max_length=50, default='Google')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.email or self.user.username}'s Profile"


class GoogleDriveIntegration(models.Model):
    PERMISSION_TEXT = "Allow Personal Assistant AI to create and manage files that you select or create with this application."

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='google_drive')
    is_connected = models.BooleanField(default=False)
    access_token = models.TextField(blank=True, default='')
    refresh_token = models.TextField(blank=True, default='')
    token_expiry = models.DateTimeField(blank=True, null=True)
    scope = models.TextField(blank=True, default='https://www.googleapis.com/auth/drive.file')
    drive_email = models.EmailField(blank=True, default='')
    drive_display_name = models.CharField(max_length=255, blank=True, default='')
    drive_folder_id = models.CharField(max_length=255, blank=True, default='')
    drive_folder_name = models.CharField(max_length=255, blank=True, default='Personal AI Documents')
    connected_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        status = "Connected" if self.is_connected else "Disconnected"
        return f"{self.user.username}'s Google Drive ({status})"


class GoogleCalendarIntegration(models.Model):
    PERMISSION_TEXT = "Allow Personal Assistant AI to view and manage events on your Google Calendar."

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='google_calendar')
    is_connected = models.BooleanField(default=False)
    access_token = models.TextField(blank=True, default='')
    refresh_token = models.TextField(blank=True, default='')
    token_expiry = models.DateTimeField(blank=True, null=True)
    scope = models.TextField(blank=True, default='https://www.googleapis.com/auth/calendar.events')
    calendar_email = models.EmailField(blank=True, default='')
    calendar_display_name = models.CharField(max_length=255, blank=True, default='')
    connected_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        status = "Connected" if self.is_connected else "Disconnected"
        return f"{self.user.username}'s Google Calendar ({status})"


class GmailIntegration(models.Model):
    PERMISSION_TEXT = "Allow Personal Assistant AI to read your recent emails and send messages on your behalf."

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='gmail_integration')
    is_connected = models.BooleanField(default=False)
    access_token = models.TextField(blank=True, default='')
    refresh_token = models.TextField(blank=True, default='')
    token_expiry = models.DateTimeField(blank=True, null=True)
    scope = models.TextField(
        blank=True,
        default='https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    )
    gmail_address = models.EmailField(blank=True, default='')
    gmail_display_name = models.CharField(max_length=255, blank=True, default='')
    connected_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        status = "Connected" if self.is_connected else "Disconnected"
        return f"{self.user.username}'s Gmail ({status})"


class UserAIPreferences(models.Model):
    STYLE_CHOICES = (
        ('Simple', 'Simple'),
        ('Professional', 'Professional'),
        ('Friendly', 'Friendly'),
        ('Technical', 'Technical'),
    )
    LENGTH_CHOICES = (
        ('Short', 'Short'),
        ('Medium', 'Medium'),
        ('Detailed', 'Detailed'),
    )
    LEVEL_CHOICES = (
        ('Beginner', 'Beginner'),
        ('Intermediate', 'Intermediate'),
        ('Advanced', 'Advanced'),
    )
    FORMAT_CHOICES = (
        ('Paragraphs', 'Paragraphs'),
        ('Bullet Points', 'Bullet Points'),
        ('Step-by-Step', 'Step-by-Step'),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='ai_preferences')
    preferred_language = models.CharField(max_length=50, default='English')
    response_style = models.CharField(max_length=30, choices=STYLE_CHOICES, default='Friendly')
    response_length = models.CharField(max_length=30, choices=LENGTH_CHOICES, default='Medium')
    explanation_level = models.CharField(max_length=30, choices=LEVEL_CHOICES, default='Intermediate')
    answer_format = models.CharField(max_length=30, choices=FORMAT_CHOICES, default='Paragraphs')
    custom_instructions = models.TextField(blank=True, default='')
    custom_app_name = models.CharField(max_length=150, blank=True, default='')
    nickname = models.CharField(max_length=150, blank=True, default='')
    occupation = models.CharField(max_length=150, blank=True, default='')
    more_about_you = models.TextField(blank=True, default='')
    creativity = models.FloatField(default=0.7)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s AI Preferences"


class PersonalInformation(models.Model):
    CATEGORY_CHOICES = (
        ('about_me', 'About Me'),
        ('education', 'Education'),
        ('profession', 'Profession'),
        ('technical_skills', 'Technical Skills'),
        ('interests', 'Interests'),
        ('personal_goals', 'Personal Goals'),
        ('projects', 'Projects'),
        ('additional_notes', 'Additional Notes'),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='personal_information')
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='about_me')
    title = models.CharField(max_length=200)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', '-updated_at']

    def __str__(self):
        return f"[{self.get_category_display()}] {self.title} ({self.user.username})"


def user_document_upload_path(instance, filename):
    # Store documents securely in user-isolated directories
    return f"user_documents/user_{instance.user.id}/{filename}"


class UploadedDocument(models.Model):
    STATUS_CHOICES = (
        ('uploaded', 'Uploaded'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='documents')
    file = models.FileField(upload_to=user_document_upload_path)
    original_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=20)  # pdf, docx, txt, md
    file_size = models.BigIntegerField()  # in bytes
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploaded')
    error_message = models.TextField(blank=True, null=True)
    drive_file_id = models.CharField(max_length=255, blank=True, default='', db_index=True)
    drive_web_link = models.URLField(max_length=1000, blank=True, default='')
    uploaded_via_app = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.original_name} ({self.status}) - {self.user.username}"

    def delete(self, *args, **kwargs):
        # Clean up Google Drive file if synced and user has active integration
        if self.drive_file_id:
            try:
                from .google_drive_service import ensure_valid_drive_token, delete_drive_file
                integration = getattr(self.user, 'google_drive', None)
                if integration and integration.is_connected:
                    token = ensure_valid_drive_token(integration)
                    delete_drive_file(token, self.drive_file_id)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Could not delete file {self.drive_file_id} from Google Drive: {e}")

        # Clean up file on disk when document record is deleted
        if self.file and os.path.isfile(self.file.path):
            try:
                os.remove(self.file.path)
            except OSError:
                pass
        super().delete(*args, **kwargs)


class ExtractedDocumentContent(models.Model):
    document = models.OneToOneField(UploadedDocument, on_delete=models.CASCADE, related_name='extracted_content')
    text_content = models.TextField()
    word_count = models.IntegerField(default=0)
    char_count = models.IntegerField(default=0)
    page_count = models.IntegerField(default=1)
    extracted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Extracted text for {self.document.original_name} ({self.word_count} words)"


class UserMemory(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='memories')
    content = models.TextField()
    source = models.CharField(max_length=150, default='Manual Entry')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Memory: {self.content[:40]}... ({self.user.username})"


class ApplicationSettings(models.Model):
    THEME_CHOICES = (
        ('light', 'Light'),
        ('dark', 'Dark'),
        ('system', 'System Default'),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='app_settings')
    theme = models.CharField(max_length=20, choices=THEME_CHOICES, default='system')
    enter_to_send = models.BooleanField(default=True)
    notifications_enabled = models.BooleanField(default=False)
    web_search_enabled = models.BooleanField(default=True)
    voice_enabled = models.BooleanField(default=True)
    voice_auto_speak = models.BooleanField(default=False)
    voice_rate = models.FloatField(default=1.0)
    display_mode = models.CharField(max_length=20, default='comfortable')
    memory_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s Application Settings"


class Notification(models.Model):
    CATEGORY_CHOICES = (
        ('document', 'Document'),
        ('calendar', 'Calendar'),
        ('email', 'Email'),
        ('reminder', 'Reminder'),
        ('integration', 'Integration'),
        ('system', 'System'),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=200)
    message = models.TextField()
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='system')
    is_read = models.BooleanField(default=False)
    action_url = models.CharField(max_length=255, blank=True, default='')
    external_ref = models.CharField(max_length=255, blank=True, default='', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.category.upper()}] {self.title} - {self.user.username}"


class Reminder(models.Model):
    RECURRENCE_CHOICES = (
        ('none', 'One-time'),
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
    )
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('completed', 'Completed'),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reminders')
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True, default='')
    scheduled_at = models.DateTimeField(db_index=True)
    timezone_name = models.CharField(max_length=64, default='UTC')
    recurrence = models.CharField(max_length=20, choices=RECURRENCE_CHOICES, default='none')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    notified_for_at = models.DateTimeField(null=True, blank=True)
    last_notified_at = models.DateTimeField(null=True, blank=True)
    snoozed_until = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['scheduled_at', '-created_at']

    def __str__(self):
        return f"Reminder: {self.title} @ {self.scheduled_at} ({self.user.username})"


class ReminderHistory(models.Model):
    EVENT_TYPE_CHOICES = (
        ('triggered', 'Triggered'),
        ('snoozed', 'Snoozed'),
        ('completed', 'Completed'),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reminder_history')
    reminder = models.ForeignKey(Reminder, null=True, blank=True, on_delete=models.SET_NULL, related_name='history_entries')
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True, default='')
    scheduled_at = models.DateTimeField()
    timezone_name = models.CharField(max_length=64, default='UTC')
    recurrence = models.CharField(max_length=20, default='none')
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES, default='completed')
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-recorded_at']

    def __str__(self):
        return f"[{self.event_type.upper()}] {self.title} ({self.user.username})"


class Conversation(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='conversations')
    title = models.CharField(max_length=255, default='New Chat')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.title} ({self.user.username})"


class Message(models.Model):
    ROLE_CHOICES = (
        ('user', 'User'),
        ('assistant', 'Assistant'),
    )
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.role.upper()}] {self.content[:30]}..."


@receiver(post_save, sender=User)
def handle_user_creation_hooks(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.get_or_create(user=instance)
        UserAIPreferences.objects.get_or_create(user=instance)
        ApplicationSettings.objects.get_or_create(user=instance)
        GoogleDriveIntegration.objects.get_or_create(user=instance)
        GoogleCalendarIntegration.objects.get_or_create(user=instance)
        GmailIntegration.objects.get_or_create(user=instance)
    else:
        if hasattr(instance, 'profile'):
            instance.profile.save()
        else:
            UserProfile.objects.get_or_create(user=instance)
        if not hasattr(instance, 'ai_preferences'):
            UserAIPreferences.objects.get_or_create(user=instance)
        if not hasattr(instance, 'app_settings'):
            ApplicationSettings.objects.get_or_create(user=instance)
        if not hasattr(instance, 'google_drive'):
            GoogleDriveIntegration.objects.get_or_create(user=instance)
        if not hasattr(instance, 'google_calendar'):
            GoogleCalendarIntegration.objects.get_or_create(user=instance)
        if not hasattr(instance, 'gmail_integration'):
            GmailIntegration.objects.get_or_create(user=instance)
