import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { useToast } from '../context/ToastContext';

const REQUEST_TIMEOUT_MS = 45000;

function RequirementForm({
  onSubmitted,
  token,
  prefill,
  showUpdateControls = true,
  updateOptions,
  onUpdateOptionsChange,
}) {
  const { addToast } = useToast();
  const [text, setText] = useState('');
  const [useAI, setUseAI] = useState(true);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [inputMode, setInputMode] = useState('text');
  const [localExistingRequirementId, setLocalExistingRequirementId] = useState('');
  const [localTargetCatalogItemName, setLocalTargetCatalogItemName] = useState('');
  const [localTargetCatalogItemSysId, setLocalTargetCatalogItemSysId] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);

  const currentUpdateOptions = updateOptions || {
    existingRequirementId: localExistingRequirementId,
    targetCatalogItemName: localTargetCatalogItemName,
    targetCatalogItemSysId: localTargetCatalogItemSysId,
  };

  const existingRequirementId = currentUpdateOptions.existingRequirementId || '';
  const targetCatalogItemName = currentUpdateOptions.targetCatalogItemName || '';
  const targetCatalogItemSysId = currentUpdateOptions.targetCatalogItemSysId || '';

  const setUpdateField = (field, value) => {
    if (onUpdateOptionsChange) {
      onUpdateOptionsChange({ ...currentUpdateOptions, [field]: value });
      return;
    }

    if (field === 'existingRequirementId') setLocalExistingRequirementId(value);
    if (field === 'targetCatalogItemName') setLocalTargetCatalogItemName(value);
    if (field === 'targetCatalogItemSysId') setLocalTargetCatalogItemSysId(value);
  };

  // When a template is chosen, prefill text and switch to text mode
  useEffect(() => {
    if (prefill) {
      setText(prefill);
      setInputMode('text');
      setValidationErrors([]);
    }
  }, [prefill]);

  const validate = () => {
    const errors = [];
    if (inputMode === 'text') {
      if (!text.trim()) errors.push('Requirement text is required.');
      else if (text.trim().length < 10) errors.push('Minimum 10 characters.');
      else if (text.trim().length > 5000) errors.push('Maximum 5000 characters.');
    } else {
      if (!file) errors.push('Please select a file.');
      else {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!['.pdf', '.txt', '.csv', '.xlsx', '.xls'].includes(ext))
          errors.push('Unsupported file type. Allowed: PDF, TXT, CSV, XLSX.');
        if (file.size > 10 * 1024 * 1024) errors.push('File exceeds 10 MB limit.');
      }
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length > 0) return;
    setLoading(true);
    let timeoutId;

    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      let response;
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      if (inputMode === 'file') {
        const formData = new FormData();
        formData.append('file', file);
        response = await fetch(`${API_URL}/requirements/upload`, {
          method: 'POST',
          headers,
          body: formData,
          signal: controller.signal,
        });
      } else {
        headers['Content-Type'] = 'application/json';
        response = await fetch(`${API_URL}/requirements`, {
          method: 'POST', headers,
          body: JSON.stringify({
            text: text.trim(),
            useAI,
            requirementId: existingRequirementId.trim() || undefined,
            targetCatalogItemName: targetCatalogItemName.trim() || undefined,
            targetCatalogItemSysId: targetCatalogItemSysId.trim() || undefined,
          }),
          signal: controller.signal,
        });
      }

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        addToast(
          data.updated
            ? `✅ Artifact updated! ID: ${data.requirementId?.slice(0, 8)}…`
            : `✅ Artifact created! ID: ${data.requirementId?.slice(0, 8)}…`,
          'success'
        );
        setText('');
        setFile(null);
        setValidationErrors([]);
        onSubmitted();
      } else {
        addToast(`❌ ${data.error}`, 'error');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        addToast('❌ Request timed out while generating artifacts. Please retry.', 'error');
      } else {
        addToast(`❌ Connection error: ${err.message}`, 'error');
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const charPct = Math.min((text.length / 5000) * 100, 100);
  const charColor = text.length > 4500 ? '#e74c3c' : text.length > 4000 ? '#e67e22' : '#27ae60';
  const isUpdateMode = inputMode === 'text' && !!existingRequirementId.trim();
  const isTargetMode = inputMode === 'text' && (!!targetCatalogItemName.trim() || !!targetCatalogItemSysId.trim());

  return (
    <div className="card">
      <h2>📝 Submit Requirement</h2>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        {[['text', '✍️ Text'], ['file', '📎 File Upload']].map(([mode, label]) => (
          <button key={mode} type="button"
            onClick={() => { setInputMode(mode); setValidationErrors([]); }}
            style={{
              padding: '6px 14px', fontSize: '12px', borderRadius: '20px', cursor: 'pointer',
              border: `2px solid ${inputMode === mode ? '#667eea' : '#ddd'}`,
              background: inputMode === mode ? '#667eea' : '#fff',
              color: inputMode === mode ? '#fff' : '#555', fontWeight: '600',
            }}>{label}</button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {inputMode === 'text' ? (
          <>
            <div className="form-group">
              <label htmlFor="req-text">Describe your requirement:</label>
              <textarea
                id="req-text"
                value={text}
                onChange={e => { setText(e.target.value); setValidationErrors([]); }}
                placeholder="e.g. Create a laptop request catalog item with manager approval…"
                rows={6}
              />
              {/* Character bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <div style={{ flex: 1, height: '3px', background: '#eee', borderRadius: '2px' }}>
                  <div style={{ width: `${charPct}%`, height: '100%', background: charColor, borderRadius: '2px', transition: 'width 0.2s' }} />
                </div>
                <small style={{ color: charColor, fontSize: '11px', whiteSpace: 'nowrap' }}>{text.length}/5000</small>
              </div>
            </div>

            <div className="checkbox-group" style={{ marginBottom: '12px' }}>
              <input type="checkbox" id="useAI" checked={useAI} onChange={e => setUseAI(e.target.checked)} />
              <label htmlFor="useAI" style={{ marginBottom: 0, fontWeight: 'normal', fontSize: '13px' }}>
                🧠 Use AI interpretation (OpenRouter LLaMA)
              </label>
            </div>

            {showUpdateControls && (
              <>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="existing-id">Update existing requirement (optional):</label>
                  <input
                    id="existing-id"
                    type="text"
                    value={existingRequirementId}
                    onChange={e => setUpdateField('existingRequirementId', e.target.value)}
                    placeholder="Paste existing requirement ID to update in place"
                  />
                  <small style={{ color: '#777' }}>
                    Leave blank to create a new artifact.
                  </small>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="target-item-name">Target existing ServiceNow item by name (optional):</label>
                  <input
                    id="target-item-name"
                    type="text"
                    value={targetCatalogItemName}
                    onChange={e => setUpdateField('targetCatalogItemName', e.target.value)}
                    placeholder="Exact catalog item name in ServiceNow"
                  />
                  <small style={{ color: '#777' }}>
                    Use this to update an existing item in ServiceNow even when creating a new local artifact.
                  </small>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="target-item-sysid">Target existing ServiceNow item by sys_id (optional):</label>
                  <input
                    id="target-item-sysid"
                    type="text"
                    value={targetCatalogItemSysId}
                    onChange={e => setUpdateField('targetCatalogItemSysId', e.target.value)}
                    placeholder="e.g. 7f4f9d1fdb002010a3f6c28e8c9619c4"
                  />
                  <small style={{ color: '#777' }}>
                    If both name and sys_id are provided, sys_id is used first.
                  </small>
                </div>

                {isUpdateMode && (
                  <div
                    style={{
                      marginBottom: '12px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #f1c40f',
                      background: '#fff9db',
                      color: '#7d6608',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    🔁 Update Mode Active: this submission will update requirement ID {existingRequirementId.trim()}.
                  </div>
                )}

                {isTargetMode && (
                  <div
                    style={{
                      marginBottom: '12px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #85c1e9',
                      background: '#ebf5fb',
                      color: '#1b4f72',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    🎯 Instance Target Mode Active: deploy will target existing ServiceNow catalog item
                    {targetCatalogItemSysId.trim() ? ` by sys_id ${targetCatalogItemSysId.trim()}` : ''}
                    {targetCatalogItemName.trim() ? ` by name "${targetCatalogItemName.trim()}"` : ''}.
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="form-group">
            <label htmlFor="req-file">Upload requirement document:</label>
            <input
              type="file" id="req-file"
              accept=".pdf,.txt,.csv,.xlsx,.xls"
              onChange={e => { setFile(e.target.files[0]); setValidationErrors([]); }}
              style={{ padding: '8px 0' }}
            />
            {file && (
              <small style={{ color: '#555' }}>📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)</small>
            )}
            <small style={{ display: 'block', color: '#aaa', marginTop: '4px' }}>PDF, TXT, CSV, XLSX — max 10 MB</small>
          </div>
        )}

        {validationErrors.length > 0 && (
          <div className="alert alert-error" style={{ marginBottom: '12px' }}>
            {validationErrors.map((e, i) => <div key={i}>⚠️ {e}</div>)}
          </div>
        )}

        <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px' }}>
          {loading
            ? <span>⏳ Processing…</span>
            : inputMode === 'file'
              ? '📎 Upload & Process'
              : isUpdateMode
                ? '🔁 Update Existing Artifacts'
                : isTargetMode
                  ? '🎯 Generate for Existing SN Item'
                : '✨ Generate Artifacts'}
        </button>
      </form>
    </div>
  );
}

export default RequirementForm;
