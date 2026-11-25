import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { chatService } from '../services/chatService';
import { personalizationService } from '../services/personalizationService';
import { reminderService } from '../services/reminderService';
import Sidebar from '../components/chat/Sidebar';
import ChatMessage from '../components/chat/ChatMessage';
import ChatInput from '../components/chat/ChatInput';
import ChatEmptyState from '../components/chat/ChatEmptyState';
import NotificationBell from '../components/notifications/NotificationBell';
import { triggerDesktopNotification } from '../utils/desktopNotification';
import { playNotificationChord } from '../utils/notificationSound';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { Menu, Plus, Loader2, Brain, Sun, Moon, PanelLeft } from 'lucide-react';
import { useTheme } from '../context/useTheme';
import { useToast } from '../context/useToast';

export default function ChatPage() {
  const { user, appName } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const { conversationId } = useParams();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [docCount, setDocCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);
  const [integrationPrefs, setIntegrationPrefs] = useState({
    voice_enabled: true,
    voice_auto_speak: false,
    voice_rate: 1.0,
    notifications_enabled: true,
  });

  const {
    ttsSupported,
    isSpeaking,
    speakingId,
    speak,
  } = useVoiceAssistant({
    onError: (msg) => showToast(msg, 'error', 3000),
  });

  const messagesEndRef = useRef(null);
  const isSendingRef = useRef(false);
  const activeConvIdRef = useRef(activeConversation?.id);

  useEffect(() => {
    activeConvIdRef.current = activeConversation?.id;
  }, [activeConversation?.id]);

  // Deduplicated messages for clean UI rendering
  const rawMessages = activeConversation?.messages;
  const displayMessages = useMemo(() => {
    if (!rawMessages) return [];
    const seenIds = new Set();
    const unique = [];

    // Identify user messages that are already confirmed/persisted by backend
    const persistedUserContents = new Set(
      rawMessages
        .filter((m) => m && !String(m.id).startsWith('temp-') && m.role === 'user')
        .map((m) => m.content.trim())
    );

    for (const msg of rawMessages) {
      if (!msg) continue;
      // Skip optimistic temporary message if a confirmed message with the same content is already present
      if (String(msg.id).startsWith('temp-') && persistedUserContents.has(msg.content.trim())) {
        continue;
      }
      const key = String(msg.id || `${msg.role}-${msg.content}`);
      if (!seenIds.has(key)) {
        seenIds.add(key);
        unique.push(msg);
      }
    }
    return unique;
  }, [rawMessages]);

  // Auto-scroll to bottom when messages change
  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [activeConversation?.messages, sending]);

  // Load document count for knowledge base
  const refreshDocCount = () => {
    personalizationService.getDocuments()
      .then((docs) => {
        if (Array.isArray(docs)) {
          setDocCount(docs.length);
        }
      })
      .catch((err) => {
        console.error('Failed to load document count:', err);
      });
  };

  useEffect(() => {
    let isMounted = true;
    personalizationService.getDocuments()
      .then((docs) => {
        if (isMounted && Array.isArray(docs)) {
          setDocCount(docs.length);
        }
      })
      .catch((err) => {
        console.error('Failed to load document count:', err);
      });

    personalizationService.getSettings()
      .then((settings) => {
        if (isMounted && settings) {
          setIntegrationPrefs({
            voice_enabled: settings.voice_enabled ?? true,
            voice_auto_speak: settings.voice_auto_speak ?? false,
            voice_rate: settings.voice_rate ?? 1.0,
            notifications_enabled: settings.notifications_enabled ?? true,
          });
        }
      })
      .catch(() => {
        // fallback to defaults
      });

    const loadReminderCount = () => {
      reminderService.getReminders()
        .then((data) => {
          if (isMounted && typeof data?.upcoming_count === 'number') {
            setReminderCount(data.upcoming_count);
          }
        })
        .catch(() => {});
    };

    loadReminderCount();
    window.addEventListener('reminders-updated', loadReminderCount);

    return () => {
      isMounted = false;
      window.removeEventListener('reminders-updated', loadReminderCount);
    };
  }, []);

  // Load user conversations list
  const refreshConversations = async () => {
    try {
      const data = await chatService.getConversations();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      showToast('Could not load conversations. Please try again.', 'error', 3000);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    chatService.getConversations()
      .then((data) => {
        if (isMounted) {
          setConversations(data);
          setLoadingList(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load conversations:', err);
          showToast('Could not load conversations. Please try again.', 'error', 3000);
          setLoadingList(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [showToast]);

  // Load active conversation messages when URL param changes
  useEffect(() => {
    if (!conversationId) {
      return;
    }

    // Avoid redundant fetch if the active conversation matches the target ID
    if (activeConvIdRef.current && String(activeConvIdRef.current) === String(conversationId)) {
      return;
    }

    const abortController = new AbortController();
    chatService.getConversation(conversationId)
      .then((data) => {
        if (!abortController.signal.aborted) {
          setActiveConversation(data);
          setLoadingMessages(false);
        }
      })
      .catch((err) => {
        if (!abortController.signal.aborted) {
          console.error('Failed to load conversation details:', err);
          showToast('Failed to load conversation messages.', 'error', 3000);
          setActiveConversation(null);
          setLoadingMessages(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [conversationId, showToast]);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const handleSelectConversation = (id) => {
    setLoadingMessages(true);
    navigate(`/chat/${id}`);
  };

  const handleNewChat = () => {
    setActiveConversation(null);
    navigate('/chat');
  };

  const handleRegenerateResponse = () => {
    if (!activeConversation?.messages || sending) return;
    const msgs = activeConversation.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        handleSendMessage(msgs[i].content);
        break;
      }
    }
  };

  const handleRenameConversation = async (id, newTitle) => {
    try {
      const updated = await chatService.renameConversation(id, newTitle);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
      );
      if (activeConversation && activeConversation.id === id) {
        setActiveConversation((prev) => ({ ...prev, title: updated.title }));
      }
    } catch (err) {
      console.error('Failed to rename conversation:', err);
      showToast('Failed to rename chat.', 'error', 3000);
    }
  };

  const handleDeleteConversation = async (id) => {
    try {
      await chatService.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversation && activeConversation.id === id) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      showToast('Failed to delete chat.', 'error', 3000);
    }
  };

  const handleSendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || sending || isSendingRef.current) return;

    isSendingRef.current = true;
    setSending(true);

    // Optimistic user message preview
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    try {
      let targetConvId = activeConversation?.id;

      // If in draft/empty state, create conversation on backend first
      if (!targetConvId) {
        const newConv = await chatService.createConversation('New Chat');
        targetConvId = newConv.id;
        activeConvIdRef.current = newConv.id;
        setActiveConversation({
          id: newConv.id,
          title: newConv.title,
          messages: [tempUserMsg],
        });
        navigate(`/chat/${newConv.id}`, { replace: true });
      } else {
        setActiveConversation((prev) => {
          if (!prev) return prev;
          const existing = prev.messages || [];
          return {
            ...prev,
            messages: [...existing, tempUserMsg],
          };
        });
      }

      // Send to backend and get AI response
      const result = await chatService.sendMessage(targetConvId, trimmed);

      // Update active conversation with real persisted messages (strictly deduplicated)
      setActiveConversation((prev) => {
        if (!prev) return prev;
        const seenIds = new Set();
        const nextMessages = [];

        for (const m of prev.messages || []) {
          // Discard all temporary optimistic messages
          if (String(m.id).startsWith('temp-') || m.id === tempUserMsg.id) continue;
          if (String(m.id) === String(result.user_message.id)) continue;
          if (result.assistant_message && String(m.id) === String(result.assistant_message.id)) continue;
          const mKey = String(m.id);
          if (!seenIds.has(mKey)) {
            seenIds.add(mKey);
            nextMessages.push(m);
          }
        }

        const userKey = String(result.user_message.id);
        if (!seenIds.has(userKey)) {
          seenIds.add(userKey);
          nextMessages.push(result.user_message);
        }

        if (result.assistant_message) {
          const asstKey = String(result.assistant_message.id);
          if (!seenIds.has(asstKey)) {
            seenIds.add(asstKey);
            nextMessages.push(result.assistant_message);
          }
        }

        return {
          ...prev,
          title: result.conversation_title || prev.title,
          messages: nextMessages,
        };
      });

      const willAutoSpeak = Boolean(
        result.assistant_message &&
          integrationPrefs.voice_enabled &&
          integrationPrefs.voice_auto_speak &&
          ttsSupported
      );

      if (willAutoSpeak) {
        speak(result.assistant_message.content, result.assistant_message.id, {
          rate: integrationPrefs.voice_rate,
        });
      }

      if (result.assistant_message && integrationPrefs.notifications_enabled) {
        if (document.visibilityState === 'hidden') {
          triggerDesktopNotification(
            `${appName || 'Personal AI'} replied`,
            result.assistant_message.content.slice(0, 120),
            { url: targetConvId ? `/chat/${targetConvId}` : '/chat' }
          );
        } else if (!willAutoSpeak) {
          playNotificationChord();
        }
      }

      // Refresh sidebar conversations list to update title & timestamp order
      await refreshConversations();
    } catch (err) {
      console.error('Failed to send message:', err);
      showToast('Failed to send message. Please check your connection.', 'error', 3000);
    } finally {
      setSending(false);
      isSendingRef.current = false;
    }
  };

  const handleEditMessage = async (messageId, newContent) => {
    const targetConvId = activeConversation?.id;
    const trimmed = newContent.trim();
    if (!targetConvId || !trimmed || sending || isSendingRef.current) return;

    isSendingRef.current = true;
    setSending(true);
    try {
      const result = await chatService.editMessage(targetConvId, messageId, trimmed);
      if (result.conversation) {
        setActiveConversation(result.conversation);
      }
      const willAutoSpeak = Boolean(
        result.assistant_message &&
          integrationPrefs.voice_enabled &&
          integrationPrefs.voice_auto_speak &&
          ttsSupported
      );
      if (willAutoSpeak) {
        speak(result.assistant_message.content, result.assistant_message.id, {
          rate: integrationPrefs.voice_rate,
        });
      }
      if (result.assistant_message && integrationPrefs.notifications_enabled) {
        if (document.visibilityState === 'hidden') {
          triggerDesktopNotification(
            `${appName || 'Personal AI'} replied`,
            result.assistant_message.content.slice(0, 120),
            { url: `/chat/${targetConvId}` }
          );
        } else if (!willAutoSpeak) {
          playNotificationChord();
        }
      }
      await refreshConversations();
    } catch (err) {
      console.error('Failed to edit message:', err);
      showToast(err.response?.data?.content?.[0] || 'Failed to update message.', 'error', 3000);
      throw err;
    } finally {
      setSending(false);
      isSendingRef.current = false;
    }
  };

  const userAvatar = user?.avatar_url || user?.profile?.avatar_url;
  const userName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username;

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversation?.id}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        loading={loadingList}
        docCount={docCount}
        reminderCount={reminderCount}
      />

      {/* Main Chat Area */}
      <main className="chat-main">
        {/* Clean, Non-redundant Top Bar */}
        <header className="chat-topbar">
          <div className="topbar-left">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="btn-mobile-menu"
              title="Open Menu"
            >
              <Menu size={20} />
            </button>

            {sidebarCollapsed && (
              <button
                type="button"
                onClick={handleToggleSidebar}
                className="btn-topbar-sidebar-toggle"
                title="Open sidebar"
              >
                <PanelLeft size={18} />
              </button>
            )}

            <div className="topbar-model-pill">
              <Brain size={14} className="sparkle-active" />
              <span className="model-name">{appName || 'Personal AI'}</span>
            </div>

            {activeConversation?.title && (
              <span className="topbar-chat-title">{activeConversation.title}</span>
            )}
          </div>

          <div className="topbar-right">
            {sidebarCollapsed && (
              <button
                type="button"
                onClick={handleNewChat}
                className="btn-topbar-new"
                title="New Chat"
              >
                <Plus size={16} />
                <span>New Chat</span>
              </button>
            )}

            <NotificationBell />

            <button
              type="button"
              onClick={toggleTheme}
              className="btn-topbar-icon"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <div
              className="topbar-user-avatar-box"
              onClick={() => navigate('/profile')}
              title={`Logged in as ${userName}. Click for Profile`}
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="topbar-avatar-img"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="topbar-avatar-fallback">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Messages or Empty State Viewport */}
        <div className="chat-viewport">
          {loadingMessages ? (
            <div className="chat-loading-state">
              <Loader2 size={32} className="animate-spin" />
              <p>Loading conversation...</p>
            </div>
          ) : displayMessages.length === 0 ? (
            <ChatEmptyState />
          ) : (
            <div className="chat-messages-container">
              {displayMessages.map((msg, idx) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  userAvatar={userAvatar}
                  userName={userName}
                  onEdit={msg.role === 'user' ? handleEditMessage : undefined}
                  disabled={sending}
                  onRegenerate={
                    idx === displayMessages.length - 1 && msg.role === 'assistant' && !sending
                      ? handleRegenerateResponse
                      : undefined
                  }
                  onSpeak={
                    integrationPrefs.voice_enabled && ttsSupported && msg.role === 'assistant'
                      ? (textToRead, msgId) =>
                          speak(textToRead, msgId, { rate: integrationPrefs.voice_rate })
                      : undefined
                  }
                  isSpeakingThis={isSpeaking && String(speakingId) === String(msg.id)}
                />
              ))}

              {sending && (
                <div className="chat-message-row assistant-row thinking-row">
                  <div className="message-avatar">
                    <div className="chat-assistant-avatar thinking">
                      <Brain size={16} />
                    </div>
                  </div>
                  <div className="message-content-wrapper">
                    <div className="message-bubble thinking-bubble">
                      <div className="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                      <span className="thinking-text">{appName || 'Personal AI'} is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Floating Chat Input Bar */}
        <footer className="chat-footer">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={sending}
            onDocumentUploaded={refreshDocCount}
            voiceEnabled={integrationPrefs.voice_enabled}
            placeholder={
              activeConversation
                ? `Message ${appName || 'Personal AI'}...`
                : 'Ask anything...'
            }
          />
        </footer>
      </main>
    </div>
  );
}
