import os
import logging
import requests
from dotenv import load_dotenv

from .models import (
    UserProfile,
    UserAIPreferences,
    PersonalInformation,
    UploadedDocument,
    UserMemory,
    Message,
)

load_dotenv()
logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv('GROQ_API_KEY')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')


def build_system_context(user) -> str:
    """
    Assemble the complete personalization context for the user:
    - User identity & nicknames
    - AI Preferences & Custom Instructions
    - Personal Information (skills, education, profession, goals)
    - Private Knowledge Base (all completed uploaded documents and extracted texts)
    - Active memories
    """
    context_sections = []

    # 1. User Identity & Preferences
    preferred_name = ""
    occupation = ""
    custom_instructions = ""
    more_about_you = ""
    response_style = "Friendly"
    answer_format = "Bullet Points"
    explanation_level = "Intermediate"
    response_length = "Medium"

    try:
        if hasattr(user, 'profile') and user.profile:
            preferred_name = user.profile.preferred_name or ""
    except Exception:
        pass

    try:
        if hasattr(user, 'ai_preferences') and user.ai_preferences:
            prefs = user.ai_preferences
            if prefs.nickname:
                preferred_name = prefs.nickname
            occupation = prefs.occupation or ""
            custom_instructions = prefs.custom_instructions or ""
            more_about_you = prefs.more_about_you or ""
            response_style = prefs.response_style or "Friendly"
            answer_format = prefs.answer_format or "Bullet Points"
            explanation_level = prefs.explanation_level or "Intermediate"
            response_length = prefs.response_length or "Medium"
    except Exception:
        pass

    user_name = preferred_name or [user.first_name, user.last_name].filter if False else ""
    if not user_name:
        full = f"{user.first_name} {user.last_name}".strip()
        user_name = full or user.username

    context_sections.append(
        f"USER IDENTITY & PROFILE:\n"
        f"- Name / Preferred Name: {user_name}\n"
        f"- Email: {user.email}\n"
        f"- Occupation: {occupation or 'Not specified'}\n"
        f"- More About User: {more_about_you or 'Not specified'}"
    )

    context_sections.append(
        f"AI RESPONSE GUIDELINES & PREFERENCES:\n"
        f"- Custom Instructions: {custom_instructions or 'Be direct, helpful, and clear.'}\n"
        f"- Response Style: {response_style}\n"
        f"- Answer Format: {answer_format}\n"
        f"- Explanation Level: {explanation_level}\n"
        f"- Response Length: {response_length}"
    )

    # 2. Personal Information entries
    try:
        info_items = PersonalInformation.objects.filter(user=user)
        if info_items.exists():
            info_lines = [f"- [{item.get_category_display()}] {item.title}: {item.content}" for item in info_items]
            context_sections.append("USER PERSONAL INFORMATION:\n" + "\n".join(info_lines))
    except Exception as e:
        logger.warning(f"Failed to fetch personal information: {e}")

    # 3. Active Memories
    try:
        memories = UserMemory.objects.filter(user=user, is_active=True)
        if memories.exists():
            mem_lines = [f"- {m.content}" for m in memories]
            context_sections.append("USER MEMORIES & STORED FACTS:\n" + "\n".join(mem_lines))
    except Exception as e:
        logger.warning(f"Failed to fetch memories: {e}")

    # 4. Uploaded Documents Knowledge Base
    try:
        docs = UploadedDocument.objects.filter(user=user, status='completed').select_related('extracted_content')
        doc_blocks = []
        for doc in docs:
            if hasattr(doc, 'extracted_content') and doc.extracted_content.text_content:
                text = doc.extracted_content.text_content.strip()
                # Limit each document to prevent hitting context limits while preserving all key information
                if len(text) > 8000:
                    text = text[:8000] + "\n...[Document excerpt truncated for length]..."
                doc_blocks.append(f"--- DOCUMENT: {doc.original_name} ---\n{text}")

        if doc_blocks:
            context_sections.append("USER PRIVATE KNOWLEDGE BASE (UPLOADED DOCUMENTS):\n" + "\n\n".join(doc_blocks))
    except Exception as e:
        logger.warning(f"Failed to fetch uploaded documents: {e}")

    system_prompt = (
        f"You are **Personal AI**, the private knowledge-based AI assistant for {user_name}.\n"
        f"You are strictly bounded to {user_name}'s uploaded documents and personal profile information provided below.\n\n"
        f"STRICT KNOWLEDGE BOUNDARY DIRECTIVES:\n"
        f"1. You must ONLY answer questions using the facts, text, and data directly mentioned in the USER PRIVATE KNOWLEDGE BASE (UPLOADED DOCUMENTS) or USER PERSONAL INFORMATION below.\n"
        f"2. UNRELATED TOPIC RESTRICTION: Whenever the user asks anything that is UNRELATED to their uploaded documents, or asks about a topic that is NOT mentioned in their documents or personal profile, you MUST NOT provide general knowledge, trivia, or external explanations. Instead, you MUST decline and generate your response using this EXACT format:\n"
        f"\"Sorry, I can't provide this {{topic}}. You didn't mention any information about this.\"\n"
        f"(Replace {{topic}} with the specific topic, concept, or subject they asked about, for example:\n"
        f"- If the user asks 'What is quantum computing?', respond: 'Sorry, I can't provide this quantum computing. You didn't mention any information about this.'\n"
        f"- If the user asks 'Who is the CEO of Apple?', respond: 'Sorry, I can't provide this topic. You didn't mention any information about this.'\n"
        f"- If the user asks 'Tell me about cars', respond: 'Sorry, I can't provide this cars. You didn't mention any information about this.')\n"
        f"3. For simple friendly greetings (e.g. 'hi', 'hello', 'hey', 'who are you'), reply briefly and remind the user to ask about their uploaded documents and personal knowledge base.\n"
        f"4. RESPONSE STRUCTURE & BULLET POINTS MANDATE:\n"
        f"   - Always structure your answers cleanly and professionally with clear formatting.\n"
        f"   - Whenever explaining concepts, detailing skills, listing experiences, summarizing documents, or presenting multiple facts, ALWAYS break them down into structured bullet points (- point) or numbered lists.\n"
        f"   - Use bold formatting for key terms, categories, titles, or numbers to make each point easy to scan and digest.\n"
        f"   - Avoid plain dense blocks of text. Provide a direct introductory sentence, followed by organized bullet points, and a brief conclusion when needed.\n"
        f"5. When the user's question IS related to facts in their uploaded documents or personal profile, provide a well-structured, accurate answer matching their custom instructions and preferred response style.\n\n"
        + "\n\n".join(context_sections)
    )

    return system_prompt


def call_groq_llm(messages, temperature=0.7) -> str:
    """Call Groq API with fast, intelligent models."""
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not configured")

    models = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']
    headers = {
        'Authorization': f'Bearer {GROQ_API_KEY}',
        'Content-Type': 'application/json',
    }

    last_error = None
    for model in models:
        try:
            payload = {
                'model': model,
                'messages': messages,
                'temperature': temperature,
                'max_tokens': 2048,
            }
            resp = requests.post(
                'https://api.groq.com/openai/v1/chat/completions',
                headers=headers,
                json=payload,
                timeout=18,
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data['choices'][0]['message']['content'].strip()
                if content:
                    return content
            else:
                last_error = f"Groq {model} HTTP {resp.status_code}: {resp.text[:150]}"
                logger.warning(last_error)
        except Exception as e:
            last_error = str(e)
            logger.warning(f"Groq {model} request failed: {e}")

    raise RuntimeError(f"All Groq models failed. Last error: {last_error}")


def call_gemini_llm(system_instruction: str, messages: list, temperature=0.7) -> str:
    """Call Google Gemini API as secondary LLM provider."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not configured")

    models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest']
    
    # Format contents for Gemini
    contents = []
    for msg in messages:
        role = 'user' if msg['role'] == 'user' else 'model'
        contents.append({
            'role': role,
            'parts': [{'text': msg['content']}]
        })

    last_error = None
    for model in models:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
            payload = {
                'contents': contents,
                'systemInstruction': {
                    'parts': [{'text': system_instruction}]
                },
                'generationConfig': {
                    'temperature': temperature,
                    'maxOutputTokens': 2048,
                }
            }
            resp = requests.post(url, json=payload, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                parts = data.get('candidates', [{}])[0].get('content', {}).get('parts', [])
                if parts and 'text' in parts[0]:
                    return parts[0]['text'].strip()
            else:
                last_error = f"Gemini {model} HTTP {resp.status_code}: {resp.text[:150]}"
        except Exception as e:
            last_error = str(e)

    raise RuntimeError(f"All Gemini models failed. Last error: {last_error}")


def extract_topic(query: str) -> str:
    """
    Extract the key subject/topic from a user's question.
    """
    cleaned = query.strip().rstrip('?!. ')
    lower = cleaned.lower()

    prefixes = [
        "can you please tell me about ",
        "could you please tell me about ",
        "could you tell me about ",
        "can you tell me about ",
        "can you explain to me ",
        "can you please explain ",
        "can you explain ",
        "could you explain ",
        "tell me more about ",
        "tell me about ",
        "tell me ",
        "what is the definition of ",
        "what is the meaning of ",
        "what is the ",
        "what are the ",
        "what is ",
        "what are ",
        "what was ",
        "what were ",
        "explain to me ",
        "explain ",
        "who is ",
        "who was ",
        "who were ",
        "where is ",
        "where was ",
        "where are ",
        "how does ",
        "how do ",
        "how is ",
        "how are ",
        "write about ",
        "write me ",
        "give me info about ",
        "give me information about ",
        "give me ",
        "search for ",
        "describe ",
    ]
    for p in prefixes:
        if lower.startswith(p):
            cleaned = cleaned[len(p):].strip()
            break

    if not cleaned:
        cleaned = "topic"
    return cleaned


def local_rag_fallback(user, user_message: str) -> str:
    """
    Intelligent local fallback if external LLM APIs are temporarily unreachable.
    Directly extracts relevant facts from user documents and preferences.
    """
    query = user_message.lower().strip()
    topic = extract_topic(user_message)

    # Friendly greetings check
    greetings = {"hi", "hello", "hey", "good morning", "good evening", "good afternoon", "who are you", "what can you do"}
    if query in greetings or any(query.startswith(g) for g in ["hi ", "hello ", "hey "]):
        return (
            "Hello! I am your Personal AI assistant. "
            "I can answer questions based on your uploaded documents and personal profile. "
            "Ask me anything about your documents or knowledge base!"
        )

    docs = UploadedDocument.objects.filter(user=user, status='completed').select_related('extracted_content')

    # Summary of documents request
    if any(phrase in query for phrase in ["summarize my documents", "summarize documents", "what documents", "list documents", "my documents"]):
        if docs.exists():
            names = [f"- **{d.original_name}** ({d.file_type.upper()})" for d in docs]
            return (
                f"Here are the documents in your private knowledge base ({docs.count()} uploaded):\n\n"
                + "\n".join(names)
                + "\n\nYou can ask me specific questions about any of these documents!"
            )
        else:
            return f"Sorry, I can't provide this {topic}. You didn't mention any information about this."

    # Find matching documents
    matching_excerpts = []
    stopwords = {"what", "when", "where", "which", "who", "whom", "whose", "why", "how", "this", "that", "there", "their", "about", "tell", "explain", "with", "from", "have", "been", "does", "will", "your", "mine", "some"}
    keywords = [w for w in query.split() if len(w) > 2 and w not in stopwords]

    if keywords:
        for doc in docs:
            if hasattr(doc, 'extracted_content') and doc.extracted_content.text_content:
                text = doc.extracted_content.text_content
                lines = text.split('\n')
                matched_lines = []
                for line in lines:
                    clean_line = line.strip()
                    if clean_line and any(k in clean_line.lower() for k in keywords):
                        matched_lines.append(clean_line)
                        if len(matched_lines) >= 8:
                            break
                if matched_lines:
                    matching_excerpts.append(
                        f"**From `{doc.original_name}`:**\n" + "\n".join(f"- {l}" for l in matched_lines[:8])
                    )

        # Check personal info items
        info_items = PersonalInformation.objects.filter(user=user)
        matching_info = []
        for info in info_items:
            content_text = f"{info.title} {info.content}".lower()
            if any(k in content_text for k in keywords):
                matching_info.append(f"- **{info.title}**: {info.content}")

        if matching_info:
            matching_excerpts.append(
                "**From your Personal Information:**\n" + "\n".join(matching_info[:6])
            )

    if matching_excerpts:
        return (
            f"Here is what I found in your personal knowledge base regarding **\"{user_message.strip()}\"**:\n\n"
            + "\n\n".join(matching_excerpts)
            + "\n\n*Extracted directly from your private knowledge documents.*"
        )

    # Unrelated to documents / not mentioned in documents
    return f"Sorry, I can't provide this {topic}. You didn't mention any information about this."


def generate_ai_response(conversation, user_message: str, message_history=None) -> str:
    """
    Service layer for generating intelligent, knowledge-augmented AI responses.
    """
    user = conversation.user

    # Check if user has uploaded documents or personal information
    docs_exist = UploadedDocument.objects.filter(user=user, status='completed').exists()
    info_exist = PersonalInformation.objects.filter(user=user).exists()

    query_lower = user_message.lower().strip()
    greetings = {"hi", "hello", "hey", "good morning", "good evening", "good afternoon", "who are you", "what can you do"}
    is_greeting = query_lower in greetings or any(query_lower.startswith(g) for g in ["hi ", "hello ", "hey "])

    # If user has neither documents nor personal information:
    if not docs_exist and not info_exist:
        if is_greeting:
            name = user.first_name or user.username
            return (
                f"Hello {name}! I am your Personal AI assistant. "
                f"You haven't uploaded any documents or added personal information yet. "
                f"Please upload your documents in the Knowledge section so I can assist you with them!"
            )
        topic = extract_topic(user_message)
        return f"Sorry, I can't provide this {topic}. You didn't mention any information about this."

    # 1. Build system context (User identity, Custom instructions, Uploaded documents)
    system_prompt = build_system_context(user)

    # 2. Build multi-turn message history
    history_messages = []
    recent_messages = (
        Message.objects.filter(conversation=conversation)
        .exclude(role='system')
        .order_by('created_at')
    )
    # Take up to last 10 messages for conversation continuity
    message_slice = list(recent_messages)[-10:]
    for m in message_slice:
        if m.content and m.content != user_message:
            history_messages.append({
                'role': 'user' if m.role == 'user' else 'assistant',
                'content': m.content
            })

    # Add current user message
    history_messages.append({'role': 'user', 'content': user_message})

    # Get temperature from preferences
    temperature = 0.7
    try:
        if hasattr(user, 'ai_preferences') and user.ai_preferences:
            temperature = float(user.ai_preferences.creativity or 0.7)
    except Exception:
        temperature = 0.7

    # 3. Attempt Groq LLM (High speed, 200 OK verified)
    if GROQ_API_KEY:
        try:
            groq_messages = [{'role': 'system', 'content': system_prompt}] + history_messages
            response = call_groq_llm(groq_messages, temperature=temperature)
            if response:
                return response
        except Exception as e:
            logger.error(f"Groq API call error: {e}")

    # 4. Attempt Gemini LLM
    if GEMINI_API_KEY:
        try:
            response = call_gemini_llm(
                system_instruction=system_prompt,
                messages=history_messages,
                temperature=temperature
            )
            if response:
                return response
        except Exception as e:
            logger.error(f"Gemini API call error: {e}")

    # 5. Local Knowledge-Based RAG Fallback
    return local_rag_fallback(user, user_message)
