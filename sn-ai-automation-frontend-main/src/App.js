import React, { useState, useEffect } from 'react';
import './App.css';
import RequirementForm from './components/RequirementForm';
import ArtifactsList from './components/ArtifactsList';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import TemplateLibrary from './components/TemplateLibrary';
import { ToastProvider, useToast } from './context/ToastContext';
import { API_URL } from './config';

// Wrap everything inside ToastProvider
export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const { addToast } = useToast();
  const [artifacts, setArtifacts] = useState([]);
  const [refresh, setRefresh] = useState(0);
  const [token, setToken] = useState(() => localStorage.getItem('sn_token'));
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('sn_user');
    return u ? JSON.parse(u) : null;
  });
  const [activeTab, setActiveTab] = useState('generate');
  const [dark, setDark] = useState(() => localStorage.getItem('sn_dark') === '1');
  const [templatePrefill, setTemplatePrefill] = useState('');
  const [auditLogs, setAuditLogs] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [updateOptions, setUpdateOptions] = useState({
    existingRequirementId: '',
    targetCatalogItemName: '',
    targetCatalogItemSysId: '',
  });

  useEffect(() => {
    loadArtifacts();
  }, [refresh]);

  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('sn_dark', dark ? '1' : '0');
  }, [dark]);

  const loadArtifacts = async () => {
    try {
      const res = await fetch(`${API_URL}/artifacts`);
      const data = await res.json();
      setArtifacts(data.artifacts || []);
    } catch {}
  };

  const loadAuditLogs = async () => {
    try {
      const res = await fetch(`${API_URL}/audit-logs`);
      const data = await res.json();
      setAuditLogs(data.logs || []);
      setShowAudit(true);
    } catch {}
  };

  const handleLogin = (tok, usr) => {
    setToken(tok); setUser(usr);
    localStorage.setItem('sn_token', tok);
    localStorage.setItem('sn_user', JSON.stringify(usr));
    addToast(`👋 Welcome back, ${usr.username}!`, 'success');
  };

  const handleLogout = () => {
    setToken(null); setUser(null);
    localStorage.removeItem('sn_token');
    localStorage.removeItem('sn_user');
    addToast('👋 Signed out', 'info');
  };

  const handleUseTemplate = (text) => {
    setTemplatePrefill(text);
    setActiveTab('generate');
    addToast('📋 Template loaded — review and submit', 'info');
  };

  if (!token) {
    return (
      <div className={`App${dark ? ' dark' : ''}`}>
        <AppHeader dark={dark} onToggleDark={() => setDark(d => !d)} />
        <main className="App-main">
          <LoginForm onLogin={handleLogin} />
        </main>
      </div>
    );
  }

  const TABS = [
    { id: 'generate',  label: '✨ Generate' },
    { id: 'templates', label: '📚 Templates' },
    { id: 'artifacts', label: `📦 Artifacts (${artifacts.length})` },
    { id: 'dashboard', label: '📊 Dashboard' },
  ];

  const roleBadgeColor = { admin: '#e74c3c', developer: '#2980b9', analyst: '#27ae60', viewer: '#95a5a6' };

  return (
    <div className={`App${dark ? ' dark' : ''}`}>
      <AppHeader dark={dark} onToggleDark={() => setDark(d => !d)}>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ background: roleBadgeColor[user.role] || '#888', color: '#fff', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
              {user.role?.toUpperCase()}
            </span>
            <span style={{ fontSize: '13px' }}>👤 {user.username}</span>
            <button onClick={handleLogout} style={{ fontSize: '12px', padding: '3px 10px', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>
              Sign Out
            </button>
          </div>
        )}
      </AppHeader>

      {/* Tab nav */}
      <div className="tab-nav">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn${activeTab === t.id ? ' tab-active' : ''}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <main className="App-main">

        {activeTab === 'generate' && (
          <div className="grid">
            <RequirementForm
              onSubmitted={() => { setRefresh(r => r + 1); setActiveTab('artifacts'); }}
              token={token}
              prefill={templatePrefill}
              showUpdateControls={false}
              updateOptions={updateOptions}
              onUpdateOptionsChange={setUpdateOptions}
            />
            <UpdateConfigPanel
              updateOptions={updateOptions}
              onChange={setUpdateOptions}
            />
          </div>
        )}

        {activeTab === 'templates' && (
          <TemplateLibrary onUseTemplate={handleUseTemplate} />
        )}

        {activeTab === 'artifacts' && (
          <ArtifactsList
            artifacts={artifacts}
            onRefresh={() => setRefresh(r => r + 1)}
            token={token}
          />
        )}

        {activeTab === 'dashboard' && (
          <div className="card">
            <h2 style={{ marginBottom: '20px' }}>📊 Dashboard</h2>
            <Dashboard artifacts={artifacts} />

            {/* Audit Trail */}
            <div style={{ marginTop: '28px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#444' }}>📋 Audit Trail</h3>
                <button className="btn-small" onClick={loadAuditLogs}>{showAudit ? '🔄 Refresh' : '📋 Load Logs'}</button>
              </div>
              {showAudit && (
                <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  {auditLogs.length === 0
                    ? <p style={{ color: '#aaa', fontSize: '13px' }}>No audit logs yet.</p>
                    : (
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f0f0f0' }}>
                            {['Time', 'Action', 'Status', 'Requirement ID'].map(h => (
                              <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: '700' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {auditLogs.map((log, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '5px 10px' }}>{new Date(log.created_at || log.timestamp).toLocaleTimeString()}</td>
                              <td style={{ padding: '5px 10px' }}>{log.action}</td>
                              <td style={{ padding: '5px 10px', color: log.status === 'error' ? '#e74c3c' : '#27ae60', fontWeight: '600' }}>{log.status}</td>
                              <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: '10px', color: '#aaa' }}>{log.requirement_id?.slice(0, 8) || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function AppHeader({ dark, onToggleDark, children }) {
  return (
    <header className="App-header">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1>🚀 ServiceNow AI Automation Platform</h1>
          <p>Generate · Deploy · Manage ServiceNow artifacts with AI</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {children}
          <button onClick={onToggleDark} title="Toggle dark mode"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '16px' }}>
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  );
}

function UpdateConfigPanel({ updateOptions, onChange }) {
  const isUpdateMode = !!updateOptions.existingRequirementId?.trim();
  const isTargetMode = !!updateOptions.targetCatalogItemName?.trim() || !!updateOptions.targetCatalogItemSysId?.trim();

  const setField = (field, value) => {
    onChange({ ...updateOptions, [field]: value });
  };

  return (
    <div className="card">
      <h2>🔁 Update Config</h2>

      <div className="form-group" style={{ marginBottom: '12px' }}>
        <label htmlFor="update-existing-id">Update existing requirement (optional):</label>
        <input
          id="update-existing-id"
          type="text"
          value={updateOptions.existingRequirementId || ''}
          onChange={e => setField('existingRequirementId', e.target.value)}
          placeholder="Paste existing requirement ID"
        />
        <small style={{ color: '#777' }}>
          Leave blank to create a new local artifact.
        </small>
      </div>

      <div className="form-group" style={{ marginBottom: '12px' }}>
        <label htmlFor="update-target-name">Target existing ServiceNow item by name (optional):</label>
        <input
          id="update-target-name"
          type="text"
          value={updateOptions.targetCatalogItemName || ''}
          onChange={e => setField('targetCatalogItemName', e.target.value)}
          placeholder="Exact catalog item name in ServiceNow"
        />
      </div>

      <div className="form-group" style={{ marginBottom: '12px' }}>
        <label htmlFor="update-target-sysid">Target existing ServiceNow item by sys_id (optional):</label>
        <input
          id="update-target-sysid"
          type="text"
          value={updateOptions.targetCatalogItemSysId || ''}
          onChange={e => setField('targetCatalogItemSysId', e.target.value)}
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
          🔁 Update Mode Active: submission will update requirement ID {updateOptions.existingRequirementId.trim()}.
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
          🎯 Instance Target Mode Active
          {updateOptions.targetCatalogItemSysId?.trim() ? ` by sys_id ${updateOptions.targetCatalogItemSysId.trim()}` : ''}
          {updateOptions.targetCatalogItemName?.trim() ? ` by name "${updateOptions.targetCatalogItemName.trim()}"` : ''}.
        </div>
      )}
    </div>
  );
}
