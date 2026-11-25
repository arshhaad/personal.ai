import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { personalizationService } from '../services/personalizationService';
import { googleDriveService } from '../services/googleDriveService';
import ConnectGoogleDriveModal from '../components/drive/ConnectGoogleDriveModal';
import GoogleDriveFilePickerModal from '../components/drive/GoogleDriveFilePickerModal';
import ConfirmModal from '../components/common/ConfirmModal';
import WorkspaceSidebarLayout from '../components/layout/WorkspaceSidebarLayout';
import {
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
  const { user, refreshUserData } = useAuth();
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [isDriveConnectModalOpen, setIsDriveConnectModalOpen] = useState(false);
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);

  // Form Fields State
  const [customAppName, setCustomAppName] = useState('Personal AI');
  const [preferredName, setPreferredName] = useState('');
  const [occupation, setOccupation] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [moreAboutYou, setMoreAboutYou] = useState('');

  // Initial State for Cancel / Dirty Checking
  const [initialData, setInitialData] = useState({
    customAppName: 'Personal AI',
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
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    type: null,
    payload: null,
    title: '',
    message: '',
    confirmText: '',
  });
  const [confirmLoading, setConfirmLoading] = useState(false);
  const { showToast: triggerToast } = useToast();

  const showToast = useCallback((message, isError = false) => {
    triggerToast(message, isError ? 'error' : 'success', 3000);
  }, [triggerToast]);

  const handleDisconnectDrive = () => {
    setConfirmState({
      isOpen: true,
      type: 'disconnect_drive',
      payload: null,
      title: 'Disconnect Google Drive',
      message: 'Are you sure you want to disconnect Google Drive? Future uploads will only be stored locally.',
      confirmText: 'Disconnect',
    });
  };

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
          const loadedAppName = prefsData.custom_app_name || 'Personal AI';
          const loadedName = prefsData.nickname || profileData.profile?.preferred_name || profileData.preferred_name || '';
          const loadedOccupation = prefsData.occupation || '';
          const loadedInstructions = prefsData.custom_instructions || '';
          const loadedMoreAboutYou = prefsData.more_about_you || '';

          setCustomAppName(loadedAppName);
          setPreferredName(loadedName);
          setOccupation(loadedOccupation);
          setCustomInstructions(loadedInstructions);
          setMoreAboutYou(loadedMoreAboutYou);

          setInitialData({
            customAppName: loadedAppName,
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
      const trimmedAppName = customAppName.trim() || 'Personal AI';
      await Promise.all([
        personalizationService.updateAIPreferences({
          custom_app_name: trimmedAppName,
          nickname: preferredName,
          occupation: occupation,
          custom_instructions: customInstructions,
          more_about_you: moreAboutYou,
        }),
        personalizationService.updateProfile({
          preferred_name: preferredName,
        }),
      ]);

      setCustomAppName(trimmedAppName);
      setInitialData({
        customAppName: trimmedAppName,
        preferredName,
        occupation,
        customInstructions,
        moreAboutYou,
      });

      if (refreshUserData) {
        await refreshUserData();
      }

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
    setCustomAppName(initialData.customAppName);
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

  const handleDeleteDocument = (id, docName) => {
    setConfirmState({
      isOpen: true,
      type: 'delete_doc',
      payload: { id, docName },
      title: 'Delete Uploaded Document',
      message: `Are you sure you want to delete "${docName}"? This will permanently remove it from your knowledge base and Google Drive folder if synced.`,
      confirmText: 'Delete Document',
    });
  };

  const handleConfirmAction = async () => {
    setConfirmLoading(true);
    try {
      if (confirmState.type === 'delete_doc' && confirmState.payload) {
        const { id } = confirmState.payload;
        await personalizationService.deleteDocument(id);
        setDocuments((prev) => prev.filter((d) => d.id !== id));
        showToast('Document deleted.');
      } else if (confirmState.type === 'disconnect_drive') {
        setDisconnectingDrive(true);
        try {
          await googleDriveService.disconnect();
          await refreshUserData();
          showToast('Google Drive disconnected.');
        } finally {
          setDisconnectingDrive(false);
        }
      } else if (confirmState.type === 'clear_instructions') {
        setCustomInstructions('');
        showToast('Custom instructions cleared.');
      } else if (confirmState.type === 'clear_bio') {
        setMoreAboutYou('');
        showToast('Personal background cleared.');
      }
      setConfirmState({ isOpen: false, type: null, payload: null, title: '', message: '', confirmText: '' });
    } catch (err) {
      console.error('Confirmed action error:', err);
      showToast('Action failed. Please try again.', true);
    } finally {
      setConfirmLoading(false);
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
    customAppName !== initialData.customAppName ||
    preferredName !== initialData.preferredName ||
    occupation !== initialData.occupation ||
    customInstructions !== initialData.customInstructions ||
    moreAboutYou !== initialData.moreAboutYou;

  const candidateName = preferredName.trim() || user?.first_name || user?.username || '';

  const topbarActions = !loading ? (
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
  ) : null;

  return (
    <WorkspaceSidebarLayout
      title="Personalization"
      docCountOverride={loading ? undefined : documents.length}
      topbarRight={topbarActions}
    >
      {loading ? (
        <div className="custom-instructions-container loading-wrapper">
          <Loader2 size={32} className="animate-spin" />
          <p>Loading personalization...</p>
        </div>
      ) : (
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

          {/* Google Drive Integration Card */}
          <div className="google-drive-integration-box">
            <div className="drive-box-left">
              <div className="drive-box-logo">
                <svg viewBox="0 0 87.3 78" width="22" height="22">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                  <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z" fill="#00ac47"/>
                  <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z" fill="#ea4335"/>
                  <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                  <path d="M59.8 53H87.3c0-1.55-.4-3.1-1.2-4.5l-25.4-44c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25z" fill="#ffba00"/>
                  <path d="M73.55 76.8c1.6 0 3.15-.45 4.5-1.2l-18.25-31.6-16.15 28 4.2 4.8z" fill="#2684fc"/>
                </svg>
              </div>
              <div className="drive-box-details">
                <div className="drive-box-title-row">
                  <span className="drive-box-heading">Google Drive Sync</span>
                  {user?.google_drive?.is_connected ? (
                    <span className="drive-status-badge connected">Connected</span>
                  ) : (
                    <span className="drive-status-badge">Step 2 Pending</span>
                  )}
                </div>
                <p className="drive-box-description">
                  {user?.google_drive?.is_connected
                    ? `Connected as ${user?.google_drive?.drive_email || user?.email}. Import your Google Drive documents directly into your knowledge base.`
                    : 'Allow Personal Assistant AI to create and manage files that you select or create with this application.'}
                </p>
              </div>
            </div>

            <div className="drive-box-actions">
              {user?.google_drive?.is_connected ? (
                <>
                  <button
                    type="button"
                    className="btn-drive-import-cta"
                    onClick={() => setIsDrivePickerOpen(true)}
                  >
                    <FolderOpen size={15} />
                    <span>Import from Drive</span>
                  </button>
                  <button
                    type="button"
                    className="btn-drive-disconnect-link"
                    onClick={handleDisconnectDrive}
                    disabled={disconnectingDrive}
                  >
                    {disconnectingDrive ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-drive-connect-cta"
                  onClick={() => setIsDriveConnectModalOpen(true)}
                >
                  <FolderOpen size={15} />
                  <span>Connect Google Drive</span>
                </button>
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
        {/* SECTION 2: ASSISTANT & APP NAME                                */}
        {/* ============================================================== */}
        <section className="personalization-section" id="section-app-name">
          <div className="section-title-wrap">
            <h2 className="section-heading">Assistant & App Name</h2>
            <p className="section-subheading">
              Customize the name of your personal AI assistant. This name will appear across the sidebar, header, and chats.
            </p>
          </div>

          <div className="app-name-preference-box">
            <div className="form-group">
              <label className="form-label">App & Assistant Name</label>
              <input
                type="text"
                value={customAppName}
                onChange={(e) => setCustomAppName(e.target.value)}
                placeholder="Personal AI"
                className="instruction-text-input"
                maxLength={50}
              />
            </div>

            <div className="app-name-presets-wrapper">
              <span className="app-name-presets-label">Quick suggestions:</span>
              <div className="app-name-presets">
                <button
                  type="button"
                  className={`btn-app-preset ${customAppName === 'Personal AI' ? 'active' : ''}`}
                  onClick={() => setCustomAppName('Personal AI')}
                >
                  Personal AI (Default)
                </button>
                {candidateName && (
                  <>
                    <button
                      type="button"
                      className={`btn-app-preset ${customAppName === `${candidateName}'s AI` ? 'active' : ''}`}
                      onClick={() => setCustomAppName(`${candidateName}'s AI`)}
                    >
                      {candidateName}&apos;s AI
                    </button>
                    <button
                      type="button"
                      className={`btn-app-preset ${customAppName === `${candidateName}'s Assistant` ? 'active' : ''}`}
                      onClick={() => setCustomAppName(`${candidateName}'s Assistant`)}
                    >
                      {candidateName}&apos;s Assistant
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* SECTION 3: WHAT SHOULD YOUR AI CALL YOU?                       */}
        {/* ============================================================== */}
        <section className="personalization-section" id="section-preferred-name">
          <div className="section-title-wrap">
            <h2 className="section-heading">What Should Your AI Call You?</h2>
            <p className="section-subheading">
              Set your preferred nickname and occupation so {customAppName || 'Personal AI'} knows how to address you.
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
                    onClick={() => setConfirmState({
                      isOpen: true,
                      type: 'clear_instructions',
                      payload: null,
                      title: 'Clear Custom Instructions',
                      message: 'Are you sure you want to clear all your custom instructions?',
                      confirmText: 'Clear Text',
                    })}
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
                    onClick={() => setConfirmState({
                      isOpen: true,
                      type: 'clear_bio',
                      payload: null,
                      title: 'Clear More About You',
                      message: 'Are you sure you want to clear your background details?',
                      confirmText: 'Clear Text',
                    })}
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
      )}

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
      {/* Google Drive Modals */}
      <ConnectGoogleDriveModal
        isOpen={isDriveConnectModalOpen}
        onClose={() => setIsDriveConnectModalOpen(false)}
      />

      <GoogleDriveFilePickerModal
        isOpen={isDrivePickerOpen}
        onClose={() => setIsDrivePickerOpen(false)}
        onFileImported={(newDoc) => {
          if (newDoc) {
            setDocuments((prev) => [newDoc, ...prev.filter((d) => d.id !== newDoc.id)]);
          }
        }}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        variant="danger"
        loading={confirmLoading}
        onConfirm={handleConfirmAction}
        onCancel={() => !confirmLoading && setConfirmState({ isOpen: false, type: null, payload: null, title: '', message: '', confirmText: '' })}
      />
    </WorkspaceSidebarLayout>
  );
}
