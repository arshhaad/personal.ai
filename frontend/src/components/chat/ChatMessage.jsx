import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../context/useAuth';
import { Brain, User, Copy, Check, ThumbsUp, ThumbsDown, RotateCcw, Volume2, Square, Pencil, X } from 'lucide-react';

function CodeBlock({ language, children }) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="chat-code-block">
      <div className="code-block-header">
        <span className="code-lang">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopyCode}
          className="btn-copy-code"
          title="Copy code"
        >
          {copied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
          <span>{copied ? 'Copied' : 'Copy code'}</span>
        </button>
      </div>
      <pre className="code-block-pre">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default function ChatMessage({
  message,
  userAvatar,
  userName,
  onRegenerate,
  onEdit,
  disabled = false,
  onSpeak,
  isSpeakingThis = false,
}) {
  const { appName } = useAuth();
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null); // 'up' | 'down' | null
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const editTextareaRef = useRef(null);

  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      const el = editTextareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    }
  }, [isEditing]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canEditUserMessage = Boolean(
    isUser && onEdit && !disabled && !String(message.id).startsWith('temp-')
  );

  const handleStartEdit = () => {
    setDraftContent(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDraftContent('');
  };

  const handleSaveEdit = async () => {
    const trimmed = draftContent.trim();
    if (!trimmed || savingEdit) return;
    if (trimmed === message.content.trim()) {
      setIsEditing(false);
      return;
    }
    setSavingEdit(true);
    try {
      await onEdit(message.id, trimmed);
      setIsEditing(false);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div className={`chat-message-row ${isUser ? 'user-row' : 'assistant-row'}`}>
      {/* Assistant Avatar (Left Side, Gemini & ChatGPT style) */}
      {!isUser && (
        <div className="message-avatar assistant-avatar-col">
          <div className="chat-assistant-avatar">
            <Brain size={16} />
          </div>
        </div>
      )}

      {/* Message Content Area */}
      <div className="message-content-wrapper">
        {!isUser && (
          <div className="assistant-header-meta">
            <span className="assistant-name">{appName || 'Personal AI'}</span>
          </div>
        )}

        <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'} ${isEditing ? 'editing-bubble' : ''}`}>
          {isUser ? (
            isEditing ? (
              <div className="user-edit-box">
                <textarea
                  ref={editTextareaRef}
                  value={draftContent}
                  onChange={(e) => {
                    setDraftContent(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
                  }}
                  onKeyDown={handleEditKeyDown}
                  disabled={savingEdit}
                  rows={2}
                  className="user-edit-textarea"
                  aria-label="Edit your message"
                />
                <div className="user-edit-actions">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={savingEdit}
                    className="btn-edit-cancel"
                  >
                    <X size={13} />
                    <span>Cancel</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={savingEdit || !draftContent.trim()}
                    className="btn-edit-save"
                  >
                    <Check size={13} />
                    <span>{savingEdit ? 'Sending...' : 'Save & Send'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="user-message-text">
                {message.content.split('\n').map((line, idx) => (
                  <p key={idx}>{line || '\u00A0'}</p>
                ))}
              </div>
            )
          ) : (
            <div className="assistant-markdown-body">
              <ReactMarkdown
                components={{
                  code({ inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline ? (
                      <CodeBlock language={match ? match[1] : ''}>
                        {String(children).replace(/\n$/, '')}
                      </CodeBlock>
                    ) : (
                      <code className="inline-code" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Action Toolbar for User Messages (Copy & Edit) */}
        {isUser && !isEditing && (
          <div className="user-action-bar">
            <button
              type="button"
              onClick={handleCopy}
              className="btn-action-icon"
              title="Copy message"
              aria-label="Copy message"
            >
              {copied ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
            </button>

            {canEditUserMessage && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="btn-action-icon"
                title="Edit message"
                aria-label="Edit message"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        )}

        {/* Action Toolbar for AI Responses (ChatGPT & Gemini style) */}
        {!isUser && (
          <div className="assistant-action-bar">
            <button
              type="button"
              onClick={handleCopy}
              className="btn-action-icon"
              title="Copy response"
            >
              {copied ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
            </button>

            <button
              type="button"
              onClick={() => setFeedback((prev) => (prev === 'up' ? null : 'up'))}
              className={`btn-action-icon ${feedback === 'up' ? 'active-like' : ''}`}
              title="Good response"
            >
              <ThumbsUp size={14} />
            </button>

            <button
              type="button"
              onClick={() => setFeedback((prev) => (prev === 'down' ? null : 'down'))}
              className={`btn-action-icon ${feedback === 'down' ? 'active-dislike' : ''}`}
              title="Bad response"
            >
              <ThumbsDown size={14} />
            </button>

            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="btn-action-icon"
                title="Regenerate response"
              >
                <RotateCcw size={14} />
              </button>
            )}

            {onSpeak && (
              <button
                type="button"
                onClick={() => onSpeak(message.content, message.id)}
                className={`btn-action-icon ${isSpeakingThis ? 'active-speaking' : ''}`}
                title={isSpeakingThis ? 'Stop reading aloud' : 'Read response aloud'}
              >
                {isSpeakingThis ? <Square size={13} /> : <Volume2 size={14} />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* User Avatar (Right Side, ChatGPT & Gemini style) */}
      {isUser && (
        <div className="message-avatar user-avatar-col">
          {userAvatar ? (
            <img
              src={userAvatar}
              alt={userName || 'User'}
              className="chat-user-avatar"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="chat-avatar-fallback">
              <User size={15} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
