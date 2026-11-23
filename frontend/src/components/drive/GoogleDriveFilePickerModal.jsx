import { useState, useEffect, useCallback } from 'react';
import { googleDriveService } from '../../services/googleDriveService';
import { useToast } from '../../context/useToast';
import {
  X,
  FileText,
  Search,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

export default function GoogleDriveFilePickerModal({
  isOpen,
  onClose,
  onFileImported,
}) {
  const { showToast } = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [importingId, setImportingId] = useState(null);
  const [importedIds, setImportedIds] = useState(new Set());
  const [errorMessage, setErrorMessage] = useState(null);

  const loadDriveFiles = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await googleDriveService.getFiles();
      setFiles(data.files || []);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        'Could not load Google Drive files. Please try reconnecting Google Drive.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!isOpen) return;

    googleDriveService
      .getFiles()
      .then((data) => {
        if (isMounted) {
          setFiles(data.files || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          const msg =
            err.response?.data?.error ||
            err.message ||
            'Could not load Google Drive files. Please try reconnecting Google Drive.';
          setErrorMessage(msg);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleImport = async (file) => {
    setImportingId(file.id);
    try {
      const result = await googleDriveService.importFile({
        file_id: file.id,
        name: file.name,
        mime_type: file.mimeType,
      });

      setImportedIds((prev) => new Set([...prev, file.id]));
      showToast(result.message || `Imported '${file.name}'!`, 'success', 3500);

      if (onFileImported) {
        onFileImported(result.document);
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to import file from Google Drive.';
      showToast(msg, 'error', 4000);
    } finally {
      setImportingId(null);
    }
  };

  if (!isOpen) return null;

  const filteredFiles = files.filter((f) =>
    (f.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const num = parseInt(bytes, 10);
    if (isNaN(num)) return '';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="drive-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drive-picker-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="drive-modal-header">
          <div className="drive-modal-title-wrap">
            <div className="drive-icon-pill">
              <svg viewBox="0 0 87.3 78" className="google-drive-logo" width="22" height="22">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z" fill="#00ac47"/>
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z" fill="#ea4335"/>
                <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                <path d="M59.8 53H87.3c0-1.55-.4-3.1-1.2-4.5l-25.4-44c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25z" fill="#ffba00"/>
                <path d="M73.55 76.8c1.6 0 3.15-.45 4.5-1.2l-18.25-31.6-16.15 28 4.2 4.8z" fill="#2684fc"/>
              </svg>
            </div>
            <div>
              <h2 className="drive-modal-title">Select Files from Google Drive</h2>
              <p className="drive-modal-subtitle">Import documents directly to your knowledge base</p>
            </div>
          </div>
          <button
            type="button"
            className="drive-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="drive-picker-toolbar">
          <div className="drive-search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search Google Drive files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="drive-search-input"
            />
          </div>
          <button
            type="button"
            className="btn-drive-refresh"
            onClick={loadDriveFiles}
            title="Refresh files"
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* File List */}
        <div className="drive-picker-body">
          {loading ? (
            <div className="drive-picker-loading">
              <Loader2 size={32} className="animate-spin" />
              <span>Fetching files from Google Drive...</span>
            </div>
          ) : errorMessage ? (
            <div className="drive-picker-error">
              <AlertCircle size={32} className="error-icon" />
              <p>{errorMessage}</p>
              <button type="button" className="btn-retry" onClick={loadDriveFiles}>
                Try Again
              </button>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="drive-picker-empty">
              <FileText size={40} className="empty-icon" />
              <h3>No Google Drive files found</h3>
              <p>
                {searchQuery
                  ? `No files match "${searchQuery}".`
                  : 'Files you create or select with Personal Assistant AI will appear here.'}
              </p>
            </div>
          ) : (
            <div className="drive-files-list">
              {filteredFiles.map((file) => {
                const isImported = importedIds.has(file.id);
                const isImporting = importingId === file.id;

                return (
                  <div key={file.id} className="drive-file-row">
                    <div className="drive-file-left">
                      <div className="drive-file-icon">
                        {file.iconLink ? (
                          <img src={file.iconLink} alt="icon" width="18" height="18" />
                        ) : (
                          <FileText size={18} />
                        )}
                      </div>
                      <div className="drive-file-details">
                        <span className="drive-file-name" title={file.name}>
                          {file.name}
                        </span>
                        <div className="drive-file-meta">
                          {file.size && <span>{formatFileSize(file.size)} • </span>}
                          <span>
                            Modified{' '}
                            {file.modifiedTime
                              ? new Date(file.modifiedTime).toLocaleDateString()
                              : 'recently'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="drive-file-actions">
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-drive-file-view"
                          title="Open in Google Drive"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}

                      {isImported ? (
                        <span className="badge-imported">
                          <CheckCircle2 size={13} />
                          <span>Imported</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn-drive-import-action"
                          onClick={() => handleImport(file)}
                          disabled={isImporting}
                        >
                          {isImporting ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Importing...</span>
                            </>
                          ) : (
                            <>
                              <Download size={14} />
                              <span>Import</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="drive-picker-footer">
          <span className="drive-footer-note">
            Personal Assistant AI accesses only files you select or create with this app.
          </span>
          <button type="button" className="btn-picker-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
