import { Brain } from 'lucide-react';
import { useAuth } from '../../context/useAuth';

export default function ChatEmptyState() {
  const { appName } = useAuth();
  const currentAppName = appName || 'Personal AI';

  return (
    <div className="chat-empty-state-container">
      {/* Centered AI brain icon */}
      <div className="empty-state-brain-box">
        <Brain size={32} className="empty-state-brain-icon" />
      </div>

      <h1 className="empty-state-title">How can I help you today?</h1>
      <p className="empty-state-subtitle">
        Your {currentAppName} assistant, powered by your knowledge.
      </p>
    </div>
  );
}
