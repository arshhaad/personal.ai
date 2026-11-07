import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/useToast';
import { personalizationService } from '../services/personalizationService';
import {
  ArrowLeft,
  UploadCloud,
  FileText,
  Trash2,
  RotateCw,
  Eye,
  Check,
  X,
  Loader2,
  FolderOpen,
} from 'lucide-react';

export default function PersonalizationPage() {
  const navigate = useNavigate();

  // Form Fields State
  const [preferredName, setPreferredName] = useState('');
  const [occupation, setOccupation] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [moreAboutYou, setMoreAboutYou] = useState('');

  // Initial State for Cancel / Dirty Checking
  const [initialData, setInitialData] = useState({
    preferredName: '',
    occupation: '',
    customInstructions: '',
    moreAboutYou: '',
  });

  // Documents State (Section 1)
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null);
  const fileInputRef = useRef(null);

  // Status & Feedback
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast: triggerToast } = useToast();

  const showToast = useCallback((message, isError = false) => {
    triggerToast(message, isError ? 'error' : 'success', 3000);
  }, [triggerToast]);

  // Load All User Data on Mount
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      try {
        const [prefsData, profileData, docsData] = await Promise.all([
          personalizationService.getAIPreferences(),
          personalizationService.getProfile(),
          personalizationService.getDocuments(),
        ]);

        if (isMounted) {
          const loadedName = prefsData.nickname || profileData.profile?.preferred_name || profileData.preferred_name || '';
          const loadedOccupation = prefsData.occupation || '';
          const loadedInstructions = prefsData.custom_instructions || '';
          const loadedMoreAboutYou = prefsData.more_about_you || '';

          setPreferredName(loadedName);
          setOccupation(loadedOccupation);
          setCustomInstructions(loadedInstructions);
          setMoreAboutYou(loadedMoreAboutYou);

          setInitialData({
            preferredName: loadedName,
            occupation: loadedOccupation,
            customInstructions: loadedInstructions,
            moreAboutYou: loadedMoreAboutYou,
          });

          setDocuments(docsData || []);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load personalization data:', err);
          showToast('Failed to load personalization settings.', true);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [showToast]);

  // Save Personalization Data (Sections 2, 3, 4)
  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await Promise.all([
        personalizationService.updateAIPreferences({
          nickname: preferredName,
          occupation: occupation,
          custom_instructions: customInstructions,
          more_about_you: moreAboutYou,
        }),
        personalizationService.updateProfile({
          preferred_name: preferredName,
        }),
      ]);

      setInitialData({
        preferredName,
        occupation,
        customInstructions,
        moreAboutYou,
      });

      showToast('Personalization preferences saved successfully!');
    } catch (err) {
      console.error('Save error:', err);
      showToast('Failed to save personalization preferences.', true);
    } finally {
      setSaving(false);
    }
  };

  // Cancel / Reset to Initial Loaded Values
  const handleCancel = () => {
    setPreferredName(initialData.preferredName);
    setOccupation(initialData.occupation);
    setCustomInstructions(initialData.customInstructions);
    setMoreAboutYou(initialData.moreAboutYou);
    showToast('Changes discarded.');
  };

  // Handle Document Upload (Section 1)
  const handleFilesUpload = async (files) => {
    if (!files || files.length === 0) return;

    const validExtensions = ['.pdf', '.docx', '.txt', '.md'];
    const validFiles = Array.from(files).filter((file) => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      return validExtensions.includes(ext) && file.size <= 10 * 1024 * 1024;
    });

    if (validFiles.length === 0) {
      showToast('Please select valid files (.pdf, .docx, .txt, .md) under 10MB.', true);
      return;
    }

    const formData = new FormData();
    validFiles.forEach((file) => {
      formData.append('files', file);
    });

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const res = await personalizationService.uploadDocuments(formData, (progress) => {
        setUploadProgress(progress);
      });

      if (res.documents) {
        setDocuments((prev) => [...res.documents, ...prev]);
      } else {
        const refreshed = await personalizationService.getDocuments();
        setDocuments(refreshed);
      }

      showToast(`Uploaded ${res.uploaded_count || validFiles.length} document(s) successfully!`);
    } catch (err) {
      console.error('Upload error:', err);
      showToast(err.response?.data?.error || 'Failed to upload document(s).', true);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  const handleDeleteDocument = async (id, docName) => {
    if (!window.confirm(`Are you sure you want to delete "${docName}"?`)) return;
    try {
      await personalizationService.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      showToast('Document deleted.');
    } catch (err) {
      console.error('Delete doc error:', err);
      showToast('Failed to delete document.', true);
    }
  };

  const handleRetryDocument = async (id) => {
    try {
      const updated = await personalizationService.retryDocument(id);
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
      showToast('Document reprocessed successfully.');
    } catch (err) {
      console.error('Retry doc error:', err);
      showToast('Reprocessing failed.', true);
    }
  };

  const handleViewDocument = async (id) => {
    try {
      const data = await personalizationService.getDocument(id);
      setViewingDoc(data);
    } catch (err) {
      console.error('Failed to load document text:', err);
      showToast('Failed to load document text.', true);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const hasUnsavedChanges =
    preferredName !== initialData.preferredName ||
    occupation !== initialData.occupation ||
    customInstructions !== initialData.customInstructions ||
    moreAboutYou !== initialData.moreAboutYou;

  if (loading) {
    return (
      <div className="custom-instructions-container loading-wrapper">
        <Loader2 size={32} className="animate-spin" />
        <p>Loading personalization...</p>
      </div>
    );
  }

  return (
    <div className="custom-instructions-page">
      {/* Top Bar Header */}
      <header className="custom-instructions-topbar">
        <button
          type="button"
          onClick={() => navigate('/chat')}
          className="btn-instruction-back"
          title="Back to chat"
        >
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>

        <div className="instruction-topbar-actions">
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving || !hasUnsavedChanges}
            className="btn-instruction-cancel"
            title="Discard changes"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`btn-instruction-save ${hasUnsavedChanges ? 'has-changes' : ''}`}
            title="Save changes"
          >
            {saving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save</span>
            )}
          </button>
        </div>
      </header>

      {/* Main Single Scrollable Content */}
      <main className="custom-instructions-content">
        <div className="personalization-page-header">
          <h1 className="instructions-title">Personal AI custom instructions</h1>
          <p className="instructions-subtitle">
            Give Personal AI extra instructions and context for all chats. Manage your private knowledge base.
          </p>
        </div>

        {/* ============================================================== */}
        {/* SECTION 1: PERSONAL KNOWLEDGE (MUST BE FIRST)                   */}
        {/* ============================================================== */}
        <section className="personalization-section" id="section-personal-knowledge">
          <div className="section-title-wrap">
            <h2 className="section-heading">Personal Knowledge</h2>
            <p className="section-subheading">
              Upload your documents (PDF, DOCX, TXT, MD up to 10MB) to build your personal knowledge base.
              Personal AI uses these documents to answer questions with your personal context.
            </p>
          </div>

          {/* Drag & Drop Upload Zone with Browse Button */}
          <div
            className={`instruction-dropzone ${dragOver ? 'drag-over' : ''} ${isUploading ? 'uploading' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              style={{ display: 'none' }}
              onChange={(e) => handleFilesUpload(e.target.files)}
            />

            <div className="dropzone-icon-box">
              <UploadCloud size={28} />
            </div>

            <div className="dropzone-text">
              {isUploading ? (
                <>
                  <p className="dropzone-main">Uploading documents...</p>
                  <div className="upload-progress-bar-container">
                    <div
                      className="upload-progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="dropzone-hint">{uploadProgress}% completed</span>
                </>
              ) : (
                <>
                  <p className="dropzone-main">
                    Drag and drop your files here, or
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="btn-browse-files"
                  >
                    <FolderOpen size={16} />
                    <span>Browse files</span>
                  </button>
                  <span className="dropzone-hint">
                    Supports PDF, DOCX, TXT, MD (Max 10MB per file)
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Uploaded Documents List in Section 1 */}
          <div className="uploaded-documents-list">
            <div className="documents-list-header">
              <span className="doc-list-title">
                Uploaded Documents ({documents.length})
              </span>
            </div>

            {documents.length === 0 ? (
              <div className="empty-documents-state">
                <FileText size={26} className="empty-doc-icon" />
                <p>No documents uploaded yet</p>
                <span>Upload files above to provide context and facts to your Personal AI.</span>
              </div>
            ) : (
              <div className="documents-cards-grid">
                {documents.map((doc) => (
                  <div key={doc.id} className="document-card-row">
                    <div className="doc-row-left">
                      <div className="doc-icon-badge">
                        <FileText size={18} />
                      </div>
                      <div className="doc-details">
                        <span className="doc-name" title={doc.original_name}>
                          {doc.original_name}
                        </span>
                        <div className="doc-meta-info">
                          <span className="doc-type">
                            {(doc.file_type || '').toUpperCase()}
                          </span>
                          <span className="doc-separator">•</span>
                          <span className="doc-size">
                            {formatFileSize(doc.file_size)}
                          </span>
                          {doc.created_at && (
                            <>
                              <span className="doc-separator">•</span>
                              <span className="doc-date">
                                {formatDate(doc.created_at)}
                              </span>
                            </>
                          )}
                          <span className="doc-separator">•</span>
                          <span className={`doc-status-badge ${doc.status}`}>
                            {doc.status === 'completed' && <Check size={11} />}
                            {doc.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="doc-row-actions">
                      {doc.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => handleViewDocument(doc.id)}
                          className="btn-doc-tool"
                          title="View extracted text"
                        >
                          <Eye size={15} />
                        </button>
                      )}

                      {doc.status === 'failed' && (
                        <button
                          type="button"
                          onClick={() => handleRetryDocument(doc.id)}
                          className="btn-doc-tool retry"
                          title="Retry processing"
                        >
                          <RotateCw size={15} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteDocument(doc.id, doc.original_name)}
                        className="btn-doc-tool delete"
                        title="Delete document"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ============================================================== */}
        {/* SECTION 2: WHAT SHOULD YOUR AI CALL YOU?                       */}
        {/* ============================================================== */}
        <section className="personalization-section" id="section-preferred-name">
          <div className="section-title-wrap">
            <h2 className="section-heading">What Should Your AI Call You?</h2>
            <p className="section-subheading">
              Set your preferred nickname and occupation so Personal AI knows how to address you.
            </p>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Nickname</label>
              <input
                type="text"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                placeholder="Enter your preferred name..."
                className="instruction-text-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Occupation</label>
              <input
                type="text"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="e.g. software engineer, student, researcher..."
                className="instruction-text-input"
              />
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* SECTION 3: CUSTOM INSTRUCTIONS                                 */}
        {/* ============================================================== */}
        <section className="personalization-section" id="section-custom-instructions">
          <div className="section-title-wrap">
            <h2 className="section-heading">Custom Instructions</h2>
            <p className="section-subheading">
              Explain how you want your AI to respond across all chats (tone, style, brevity, bullet points, or depth).
            </p>
          </div>

          <div className="textarea-container-block">
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder={`Whenever I ask about a topic, please explain it clearly and cover:
* 🧠 What is it? — Explain the concept in simple words.
* 🎯 Why use it? — Explain why it is useful and what problem it solves.
* 💼 Use cases — Explain how and why it is used in real-world situations.
* ⚙️ How does it work? — Explain how it works step by step.
* 📍 Where is it used? — Explain where this concept is commonly used.
* 🌐 Real-world examples — Give practical examples to help me understand.
* 🪜 Step-by-step explanation — Break complex topics into small, easy-to-understand steps.

Please teach me whatever I ask in a simple, beginner-friendly way.`}
              className="instructions-textarea"
              rows={8}
              spellCheck="false"
            />

            <div className="textarea-footer-toolbar">
              <span className="char-counter">
                {customInstructions.length.toLocaleString()} characters
              </span>
              <div className="textarea-toolbar-actions">
                {customInstructions && (
                  <button
                    type="button"
                    onClick={() => setCustomInstructions('')}
                    className="btn-clear-text"
                    title="Clear custom instructions"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* SECTION 4: MORE ABOUT YOU                                      */}
        {/* ============================================================== */}
        <section className="personalization-section" id="section-more-about-you">
          <div className="section-title-wrap">
            <h2 className="section-heading">More About You</h2>
            <p className="section-subheading">
              Describe your profession, education, skills, interests, goals, and projects.
              Personal AI uses this background to tailor its answers to your experience.
            </p>
          </div>

          <div className="textarea-container-block">
            <textarea
              value={moreAboutYou}
              onChange={(e) => setMoreAboutYou(e.target.value)}
              placeholder={`Share details about your background, career, and projects.

Examples:
* Profession: Full Stack Software Engineer specializing in Python, Django, React, and cloud architectures.
* Education: Degree in Computer Science.
* Current Goals: Mastering Knowledge-Based AI and RAG architectures.
* Interests: System design, developer productivity tools, and open source.`}
              className="instructions-textarea"
              rows={8}
              spellCheck="false"
            />

            <div className="textarea-footer-toolbar">
              <span className="char-counter">
                {moreAboutYou.length.toLocaleString()} characters
              </span>
              <div className="textarea-toolbar-actions">
                {moreAboutYou && (
                  <button
                    type="button"
                    onClick={() => setMoreAboutYou('')}
                    className="btn-clear-text"
                    title="Clear more about you"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Bottom Actions Bar */}
        <div className="personalization-bottom-actions">
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving || !hasUnsavedChanges}
            className="btn-instruction-cancel"
            title="Discard changes"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`btn-instruction-save btn-bottom-save ${hasUnsavedChanges ? 'has-changes' : ''}`}
            title="Save changes"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </main>

      {/* View Document Extracted Text Modal */}
      {viewingDoc && (
        <div className="modal-backdrop" onClick={() => setViewingDoc(null)}>
          <div className="instruction-modal-card doc-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-doc-info">
                <h3>{viewingDoc.original_name}</h3>
                <span className="modal-doc-meta">
                  {viewingDoc.extracted_content?.word_count || 0} words •{' '}
                  {viewingDoc.extracted_content?.page_count || 1} page(s)
                </span>
              </div>
              <button type="button" onClick={() => setViewingDoc(null)} className="btn-modal-close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body doc-extracted-preview">
              {viewingDoc.extracted_content?.text_content ? (
                <pre className="extracted-text-view">
                  {viewingDoc.extracted_content.text_content}
                </pre>
              ) : (
                <p className="empty-text-note">No extracted text content available.</p>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setViewingDoc(null)} className="btn-modal-action">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
