import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ProfileDropdown from './ProfileDropdown';
import {
  Brain,
  SquarePen,
  FileText,
  MessageSquare,
  MoreVertical,
  Edit2,
  Trash2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquarePlus,
} from 'lucide-react';

export default function Sidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onDeleteConversation,
  isCollapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  loading = false,
  docCount = 0,
}) {
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);

  const menuRef = useRef(null);

  // Close three-dot menu on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpenId(null);
      }
    }
    if (menuOpenId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpenId]);

  const startEditing = (conv, e) => {
    e.stopPropagation();
    setMenuOpenId(null);
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveRename = (convId, e) => {
    e.stopPropagation();
    const trimmed = editTitle.trim();
    if (trimmed) {
      onRenameConversation(convId, trimmed);
    }
    setEditingId(null);
  };

  const handleCancelRename = (e) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDeleteClick = (convId, e) => {
    e.stopPropagation();
    setMenuOpenId(null);
    setDeletingId(convId);
  };

  const confirmDelete = (convId, e) => {
    e.stopPropagation();
    onDeleteConversation(convId);
    setDeletingId(null);
  };

  const cancelDelete = (e) => {
    e.stopPropagation();
    setDeletingId(null);
  };

  const toggleMenu = (convId, e) => {
    e.stopPropagation();
    setMenuOpenId((prev) => (prev === convId ? null : convId));
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && <div className="sidebar-mobile-backdrop" onClick={onCloseMobile} />}

      <aside className={`chat-sidebar ${isCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Top Header & Branding */}
        <div className="sidebar-top-section">
          <div className="sidebar-branding">
            <div className="sidebar-logo-box">
              <Brain size={18} className="logo-brain-icon" />
            </div>
            {!isCollapsed && (
              <div className="sidebar-brand-text">
                <span className="brand-title">Personal AI</span>
                <span className="brand-subtitle">Your Own Knowledge AI</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleCollapse}
            className="btn-toggle-sidebar"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>

        {/* New Chat Button (Pen/Write Icon) */}
        <div className="sidebar-new-chat-wrapper">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              if (mobileOpen) onCloseMobile();
            }}
            className="btn-new-chat"
            title="New Chat"
          >
            <SquarePen size={16} />
            {!isCollapsed && <span>New Chat</span>}
          </button>
        </div>

        {/* Documents Knowledge Base Button with Count */}
        <div className="sidebar-documents-wrapper">
          <button
            type="button"
            onClick={() => {
              navigate('/personalization');
              if (mobileOpen) onCloseMobile();
            }}
            className="btn-sidebar-documents"
            title={`Knowledge Base Documents (${docCount}) - Click to upload & manage`}
          >
            <div className="sidebar-doc-btn-left">
              <div className="sidebar-doc-icon-wrap">
                <FileText size={16} />
              </div>
              {!isCollapsed && <span className="sidebar-doc-label">Documents</span>}
            </div>
            {!isCollapsed && (
              <span className="sidebar-doc-count-badge">{docCount}</span>
            )}
          </button>
        </div>

        {/* Recent Chats Section */}
        <div className="sidebar-conversations-list">
          {!isCollapsed && <div className="conversations-section-label">Recent Chats</div>}

          {loading ? (
            !isCollapsed && (
              <div className="sidebar-empty-chats">
                <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                <span>Loading conversations...</span>
              </div>
            )
          ) : conversations.length === 0 ? (
            !isCollapsed && (
              <div className="sidebar-empty-chats">
                <div className="empty-chats-icon-box">
                  <MessageSquarePlus size={20} className="empty-icon" />
                </div>
                <p>No conversations yet</p>
                <span>Start a new chat to begin</span>
              </div>
            )
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const isEditing = editingId === conv.id;
              const isDeleting = deletingId === conv.id;
              const isMenuOpen = menuOpenId === conv.id;

              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    if (!isEditing && !isDeleting) {
                      onSelectConversation(conv.id);
                      if (mobileOpen) onCloseMobile();
                    }
                  }}
                  className={`conversation-item ${isActive ? 'active' : ''}`}
                  title={conv.title}
                >
                  <MessageSquare size={15} className="conv-icon" />

                  {!isCollapsed && (
                    <>
                      {isEditing ? (
                        <div className="conv-edit-box" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(conv.id, e);
                              if (e.key === 'Escape') handleCancelRename(e);
                            }}
                            autoFocus
                            className="conv-edit-input"
                          />
                          <button
                            type="button"
                            onClick={(e) => handleSaveRename(conv.id, e)}
                            className="btn-conv-action confirm"
                            title="Save"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelRename}
                            className="btn-conv-action cancel"
                            title="Cancel"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : isDeleting ? (
                        <div className="conv-delete-confirm-box" onClick={(e) => e.stopPropagation()}>
                          <span className="delete-prompt">Delete?</span>
                          <button
                            type="button"
                            onClick={(e) => confirmDelete(conv.id, e)}
                            className="btn-conv-action danger"
                            title="Confirm delete"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={cancelDelete}
                            className="btn-conv-action cancel"
                            title="Cancel"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="conv-title-text">{conv.title}</span>

                          {/* Three-dot menu button */}
                          <div className="conv-item-menu-wrapper" ref={isMenuOpen ? menuRef : null}>
                            <button
                              type="button"
                              onClick={(e) => toggleMenu(conv.id, e)}
                              className={`btn-conv-menu-trigger ${isMenuOpen ? 'open' : ''}`}
                              title="Conversation options"
                              aria-label="Conversation options"
                            >
                              <MoreVertical size={14} />
                            </button>

                            {/* Options dropdown */}
                            {isMenuOpen && (
                              <div
                                className="conv-options-dropdown"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => startEditing(conv, e)}
                                  className="conv-dropdown-item"
                                >
                                  <Edit2 size={13} />
                                  <span>Rename</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteClick(conv.id, e)}
                                  className="conv-dropdown-item danger"
                                >
                                  <Trash2 size={13} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* User Profile Footer Section with Reusable Dropdown */}
        <div className="sidebar-footer">
          <ProfileDropdown
            isCollapsed={isCollapsed}
            onSelect={() => {
              if (mobileOpen) onCloseMobile();
            }}
          />
        </div>
      </aside>
    </>
  );
}
