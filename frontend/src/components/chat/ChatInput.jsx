import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Plus, Loader2, FileText, Check, X, AlertCircle } from 'lucide-react';
import { personalizationService } from '../../services/personalizationService';

export default function ChatInput({ onSendMessage, disabled, placeholder, onDocumentUploaded }) {
  const [content, setContent] = useState('');
  const [attachedDoc, setAttachedDoc] = useState(null); // { name, size, status: 'uploading'|'completed'|'error', progress: 0 }
  const [uploadError, setUploadError] = useState(null);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const isSubmittingRef = useRef(false);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [content]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (isSubmittingRef.current || disabled) return;

    const trimmed = content.trim();

    // If attached doc exists but no text, prompt about the document
    let messageToSend = trimmed;
    if (!messageToSend && attachedDoc && attachedDoc.status === 'completed') {
      messageToSend = `Please summarize my document: "${attachedDoc.name}"`;
    }

    if (!messageToSend || (attachedDoc && attachedDoc.status === 'uploading')) {
      return;
    }

    isSubmittingRef.current = true;
    setTimeout(() => {
      isSubmittingRef.current = false;
    }, 400);

    onSendMessage(messageToSend);
    setContent('');
    setAttachedDoc(null);
    setUploadError(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePlusClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate extension
    const validExtensions = ['.pdf', '.docx', '.txt', '.md'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(ext)) {
      setUploadError('Only PDF, DOCX, TXT, and MD files are supported.');
      setTimeout(() => setUploadError(null), 4000);
      e.target.value = '';
      return;
    }

    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Document must be under 10MB.');
      setTimeout(() => setUploadError(null), 4000);
      e.target.value = '';
      return;
    }

    setAttachedDoc({
      name: file.name,
      size: file.size,
      status: 'uploading',
      progress: 0,
    });
    setUploadError(null);

    const formData = new FormData();
    formData.append('files', file);

    try {
      await personalizationService.uploadDocuments(formData, (progress) => {
        setAttachedDoc((prev) => (prev ? { ...prev, progress } : null));
      });

      setAttachedDoc((prev) =>
        prev ? { ...prev, status: 'completed', progress: 100 } : null
      );

      // Notify parent to increment document count badge in sidebar
      if (onDocumentUploaded) {
        onDocumentUploaded();
      }
    } catch (err) {
      console.error('Document upload error from chat input:', err);
      setAttachedDoc((prev) => (prev ? { ...prev, status: 'error' } : null));
      setUploadError(err.response?.data?.error || 'Failed to upload document.');
      setTimeout(() => setUploadError(null), 4000);
    } finally {
      e.target.value = '';
    }
  };

  const hasSubmitReady =
    content.trim().length > 0 || (attachedDoc && attachedDoc.status === 'completed');

  return (
    <div className="chat-input-wrapper">
      {/* Upload Error Banner if any */}
      {uploadError && (
        <div className="chat-input-error-banner">
          <AlertCircle size={14} />
          <span>{uploadError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="chat-input-form">
        {/* Hidden file input triggered by + icon */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />

        {/* Uploaded / Uploading Document Chip inside input */}
        {attachedDoc && (
          <div className={`chat-attached-doc-chip ${attachedDoc.status}`}>
            <div className="doc-chip-left">
              <FileText size={14} className="doc-chip-icon" />
              <span className="doc-chip-name" title={attachedDoc.name}>
                {attachedDoc.name}
              </span>
              {attachedDoc.status === 'uploading' && (
                <span className="doc-chip-status uploading">
                  <Loader2 size={12} className="animate-spin" />
                  <span>{attachedDoc.progress}%</span>
                </span>
              )}
              {attachedDoc.status === 'completed' && (
                <span className="doc-chip-status completed">
                  <Check size={12} />
                  <span>Uploaded to Knowledge</span>
                </span>
              )}
              {attachedDoc.status === 'error' && (
                <span className="doc-chip-status error">Failed</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAttachedDoc(null)}
              className="btn-doc-chip-remove"
              title="Remove attachment"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <div className="chat-input-row">
          {/* + icon button to upload document */}
          <button
            type="button"
            onClick={handlePlusClick}
            disabled={disabled || (attachedDoc && attachedDoc.status === 'uploading')}
            className="btn-chat-plus"
            title="Upload document to knowledge base (+)"
            aria-label="Upload document"
          >
            {attachedDoc && attachedDoc.status === 'uploading' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Plus size={19} />
            )}
          </button>

          {/* Expandable Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              attachedDoc && attachedDoc.status === 'completed'
                ? `Ask anything about "${attachedDoc.name}"...`
                : placeholder || 'Ask anything...'
            }
            rows={1}
            disabled={disabled}
            className="chat-textarea"
          />

          {/* Submit Arrow Button */}
          <button
            type="submit"
            disabled={!hasSubmitReady || disabled || (attachedDoc && attachedDoc.status === 'uploading')}
            className={`btn-chat-send ${hasSubmitReady ? 'has-content' : ''}`}
            title="Send message (Enter)"
            aria-label="Send message"
          >
            {disabled ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <ArrowUp size={18} />
            )}
          </button>
        </div>
      </form>

      <div className="chat-input-disclaimer">
        <span>Personal AI can make mistakes. Consider verifying important information.</span>
      </div>
    </div>
  );
}
