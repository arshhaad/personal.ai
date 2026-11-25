import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../chat/Sidebar';
import { chatService } from '../../services/chatService';
import { personalizationService } from '../../services/personalizationService';
import { reminderService } from '../../services/reminderService';
import { useToast } from '../../context/useToast';
import NotificationBell from '../notifications/NotificationBell';
import { Menu, PanelLeft } from 'lucide-react';

export default function WorkspaceSidebarLayout({
  title,
  docCountOverride,
  reminderCountOverride,
  topbarRight = null,
  children,
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [docCount, setDocCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    chatService.getConversations()
      .then((data) => {
        if (isMounted) setConversations(data);
      })
      .catch((err) => {
        if (isMounted) console.error('Failed to load conversations:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingList(false);
      });

    if (docCountOverride === undefined) {
      personalizationService.getDocuments()
        .then((docs) => {
          if (isMounted && Array.isArray(docs)) {
            setDocCount(docs.length);
          }
        })
        .catch(() => {});
    }

    const fetchReminderCount = () => {
      if (reminderCountOverride !== undefined) return;
      reminderService.getReminders()
        .then((data) => {
          if (isMounted && typeof data?.upcoming_count === 'number') {
            setReminderCount(data.upcoming_count);
          }
        })
        .catch(() => {});
    };

    fetchReminderCount();
    window.addEventListener('reminders-updated', fetchReminderCount);

    return () => {
      isMounted = false;
      window.removeEventListener('reminders-updated', fetchReminderCount);
    };
  }, [docCountOverride, reminderCountOverride]);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const handleSelectConversation = (id) => {
    navigate(`/chat/${id}`);
  };

  const handleNewChat = () => {
    navigate('/chat');
  };

  const handleRenameConversation = async (id, newTitle) => {
    try {
      const updated = await chatService.renameConversation(id, newTitle);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
      );
      showToast('Chat renamed.', 'success', 2000);
    } catch (err) {
      console.error('Failed to rename chat:', err);
      showToast('Failed to rename chat.', 'error', 3000);
    }
  };

  const handleDeleteConversation = async (id) => {
    try {
      await chatService.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      showToast('Conversation deleted.', 'success', 2000);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      showToast('Failed to delete chat.', 'error', 3000);
    }
  };

  const effectiveDocCount = docCountOverride !== undefined ? docCountOverride : docCount;
  const effectiveReminderCount = reminderCountOverride !== undefined ? reminderCountOverride : reminderCount;

  return (
    <div className="chat-layout">
      <Sidebar
        conversations={conversations}
        activeConversationId={null}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        loading={loadingList}
        docCount={effectiveDocCount}
        reminderCount={effectiveReminderCount}
      />

      <main className="chat-main workspace-main-area">
        <header className="chat-topbar workspace-topbar">
          <div className="topbar-left">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="btn-mobile-menu"
              title="Open menu"
              aria-label="Open menu"
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

            {title && <span className="workspace-topbar-title">{title}</span>}
          </div>

          <div className="topbar-right">
            <NotificationBell />
            {topbarRight}
          </div>
        </header>

        <div className="workspace-scroll-content">
          {children}
        </div>
      </main>
    </div>
  );
}
