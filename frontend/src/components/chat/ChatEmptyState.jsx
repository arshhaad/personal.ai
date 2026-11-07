import { Brain } from 'lucide-react';

export default function ChatEmptyState() {
  return (
    <div className="chat-empty-state-container">
      {/* Centered AI brain icon */}
      <div className="empty-state-brain-box">
        <Brain size={32} className="empty-state-brain-icon" />
      </div>

      <h1 className="empty-state-title">How can I help you today?</h1>
      <p className="empty-state-subtitle">
        Your personal AI assistant, powered by your knowledge.
      </p>
    </div>
  );
}
