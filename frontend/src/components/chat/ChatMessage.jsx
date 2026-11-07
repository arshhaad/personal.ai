import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, User, Copy, Check, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';

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
}) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null); // 'up' | 'down' | null

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            <span className="assistant-name">Personal AI</span>
          </div>
        )}

        <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
          {isUser ? (
            <div className="user-message-text">
              {message.content.split('\n').map((line, idx) => (
                <p key={idx}>{line || '\u00A0'}</p>
              ))}
            </div>
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
