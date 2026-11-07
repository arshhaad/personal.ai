import logging
import secrets
import urllib.parse
import requests
from django.conf import settings
from django.contrib.auth.models import User
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from rest_framework_simplejwt.tokens import RefreshToken
from .models import UserProfile

logger = logging.getLogger(__name__)


def generate_google_auth_url(redirect_uri, state=None):
    """
    Generate Google OAuth 2.0 authorization URL and state.
    """
    if not state:
        state = secrets.token_urlsafe(32)

    params = {
        'client_id': settings.GOOGLE_CLIENT_ID,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': 'openid email profile',
        'access_type': 'offline',
        'prompt': 'select_account',
        'state': state,
    }
    base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    url = f"{base_url}?{urllib.parse.urlencode(params)}"
    return url, state


def exchange_code_for_tokens(code, redirect_uri='postmessage'):
    """
    Exchange Google authorization code for access and ID tokens.
    """
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        'code': code,
        'client_id': settings.GOOGLE_CLIENT_ID,
        'client_secret': settings.GOOGLE_CLIENT_SECRET,
        'redirect_uri': redirect_uri or 'postmessage',
        'grant_type': 'authorization_code',
    }
    response = requests.post(token_url, data=data, timeout=10)
    if not response.ok:
        logger.error(f"Google code exchange failed: {response.text}")
        raise ValueError(f"Failed to exchange authorization code: {response.text}")
    return response.json()


def fetch_user_info_via_access_token(access_token):
    """
    Fetch user info from Google's UserInfo API using an OAuth access token.
    """
    userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(userinfo_url, headers=headers, timeout=10)
    if not response.ok:
        logger.error(f"Failed to fetch userinfo: {response.text}")
        raise ValueError("Failed to fetch user details from Google.")
    return response.json()


def verify_and_extract_google_user(credential=None, code=None, access_token=None, redirect_uri='postmessage'):
    """
    Verifies the Google credentials supplied via credential (ID token),
    authorization code, or access token, and returns user details.
    """
    user_info = None

    if credential:
        try:
            user_info = id_token.verify_oauth2_token(
                credential,
                google_requests.Request(),
                settings.GOOGLE_CLIENT_ID,
                clock_skew_in_seconds=10
            )
        except Exception as e:
            logger.error(f"ID token verification failed: {e}")
            raise ValueError(f"Invalid Google ID token: {str(e)}")

    elif code:
        tokens = exchange_code_for_tokens(code, redirect_uri=redirect_uri)
        id_token_str = tokens.get('id_token')
        acc_tok = tokens.get('access_token')

        if id_token_str:
            try:
                user_info = id_token.verify_oauth2_token(
                    id_token_str,
                    google_requests.Request(),
                    settings.GOOGLE_CLIENT_ID,
                    clock_skew_in_seconds=10
                )
            except Exception:
                if acc_tok:
                    user_info = fetch_user_info_via_access_token(acc_tok)
        elif acc_tok:
            user_info = fetch_user_info_via_access_token(acc_tok)

    elif access_token:
        user_info = fetch_user_info_via_access_token(access_token)

    if not user_info or not user_info.get('email'):
        raise ValueError("Could not extract verified user email from Google.")

    return user_info


def authenticate_google_user(google_user_info):
    """
    Finds or creates a Django User & UserProfile from Google user info,
    and returns JWT tokens and serialized user data.
    """
    email = google_user_info.get('email', '').strip().lower()
    google_id = google_user_info.get('sub', '')
    first_name = google_user_info.get('given_name', '')
    last_name = google_user_info.get('family_name', '')
    picture = google_user_info.get('picture', '')

    if not first_name and not last_name:
        name = google_user_info.get('name', '').strip()
        if name:
            parts = name.split(' ', 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else ''

    user = User.objects.filter(email__iexact=email).first()

    if not user:
        base_username = email.split('@')[0]
        username = base_username
        counter = 1
        while User.objects.filter(username__iexact=username).exists():
            username = f"{base_username}_{counter}"
            counter += 1

        user = User.objects.create_user(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
        )
        user.set_unusable_password()
        user.save()
    else:
        # Update names if not set
        updated = False
        if not user.first_name and first_name:
            user.first_name = first_name
            updated = True
        if not user.last_name and last_name:
            user.last_name = last_name
            updated = True
        if updated:
            user.save()

    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile_updated = False
    if google_id and profile.google_id != google_id:
        profile.google_id = google_id
        profile_updated = True
    if picture and profile.avatar_url != picture:
        profile.avatar_url = picture
        profile_updated = True
    if profile_updated:
        profile.save()

    refresh = RefreshToken.for_user(user)

    return {
        'user': user,
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }
