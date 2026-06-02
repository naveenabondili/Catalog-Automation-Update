import React, { useState } from 'react';
import { API_URL } from '../config';

const VAR_TYPES = [
  'string', 'choice', 'number', 'boolean',
  'date', 'datetime', 'reference', 'url', 'email', 'multiline',
];

const ATF_ACTIONS = [
  'navigate', 'set_field', 'submit', 'assert',
  'open_catalog_item', 'fill_variables', 'submit_request',
  'verify_status', 'verify_approval', 'click', 'wait',
];

const APPROVER_OPTIONS = ['manager', 'security', 'it', 'director', 'finance'];

// ─── Styles ──────────────────────────────────────────────────────────────────

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: '16px',
};

const modalBox = {
  background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '820px',
  maxHeight: '92vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};

const modalHeader = {
  padding: '18px 24px', borderBottom: '1px solid #e0e0e0',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  background: '#1a1a2e', borderRadius: '12px 12px 0 0',
};

const modalBody = { padding: '20px 24px', overflowY: 'auto', flex: 1 };

const modalFooter = {
  padding: '14px 24px', borderTop: '1px solid #e0e0e0',
  display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap',
  background: '#f9f9f9', borderRadius: '0 0 12px 12px',
};

const section = {
  marginBottom: '20px', border: '1px solid #e8e8e8',
  borderRadius: '8px', overflow: 'hidden',
};

const sectionHead = {
  padding: '10px 14px', background: '#f4f6f9',
  borderBottom: '1px solid #e8e8e8', display: 'flex',
  alignItems: 'center', justifyContent: 'space-between',
};

const inputS = {
  border: '1px solid #d0d0d0', borderRadius: '5px',
  padding: '5px 8px', fontSize: '12px', width: '100%',
  boxSizing: 'border-box',
};

const selectS = { ...inputS, cursor: 'pointer' };

const cellS = { padding: '5px 8px', verticalAlign: 'middle' };

const btnPrimary = {
  padding: '8px 20px', background: '#4a90d9', color: '#fff',
  border: 'none', borderRadius: '6px', cursor: 'pointer',
  fontSize: '13px', fontWeight: '600',
};

const btnGhost = {
  ...btnPrimary, background: 'transparent', color: '#555',
  border: '1px solid #ccc',
};

const btnSmall = {
  padding: '3px 10px', fontSize: '11px', border: '1px solid #ccc',
  borderRadius: '4px', cursor: 'pointer', background: '#fff',
};

const btnSmallRed = { ...btnSmall, color: '#e74c3c', borderColor: '#e74c3c' };
const btnSmallGreen = { ...btnSmall, color: '#27ae60', borderColor: '#27ae60' };
const labelS = { display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px', fontWeight: '600' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Build default ATF steps from the current draft (mirrors backend logic)
function buildDefaultAtfSteps(draft) {
  const vars = draft.variableSet?.variables || [];
  return [
    { order: 100, action: 'open_catalog_item', description: `Open catalog item: ${draft.catalogItem?.name || 'Item'}` },
    ...vars.map((v, i) => ({
      order: (i + 2) * 100,
      action: 'set_field',
      description: `Fill variable: ${v.label || v.name} (${v.type})`,
    })),
    { order: (vars.length + 2) * 100, action: 'submit_request', description: 'Submit the catalog request' },
    { order: (vars.length + 3) * 100, action: 'assert', description: 'Verify request created in sc_request (state=1)' },
  ];
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function DeployModal({ artifact, token, onClose, onDeployed }) {
  const raw = typeof artifact.artifacts === 'string'
    ? JSON.parse(artifact.artifacts)
    : (artifact.artifacts || {});

  // Initialise testCase — if no saved test_steps, seed from default builder
  const initDraft = () => {
    const d = deepClone(raw);
    if (!d.testCase) d.testCase = {};
    if (!d.testCase.name) {
      d.testCase.name = `ATF_${(d.catalogItem?.name || 'Item').replace(/\s+/g, '_')}_Test`;
    }
    if (!d.testCase.test_steps || d.testCase.test_steps.length === 0) {
      d.testCase.test_steps = buildDefaultAtfSteps(d);
    }
    return d;
  };

  const [draft, setDraft] = useState(initDraft);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [deployResult, setDeployResult] = useState(null);
  const [confirmMode, setConfirmMode] = useState(false);
  const [approved, setApproved] = useState(false);

  const authH = token ? { Authorization: `Bearer ${token}` } : {};

  // ── Catalog Item ──────────────────────────────────────────────────────────
  const setCatField = (field, val) =>
    setDraft(d => ({ ...d, catalogItem: { ...d.catalogItem, [field]: val } }));

  // ── Variables ─────────────────────────────────────────────────────────────
  const setVar = (i, field, val) =>
    setDraft(d => {
      const vars = [...(d.variableSet?.variables || [])];
      vars[i] = { ...vars[i], [field]: val };
      return { ...d, variableSet: { ...d.variableSet, variables: vars } };
    });

  const addVar = () =>
    setDraft(d => ({
      ...d,
      variableSet: {
        ...d.variableSet,
        variables: [
          ...(d.variableSet?.variables || []),
          { name: `var_${Date.now()}`, label: 'New Variable', type: 'string', mandatory: false, choices: [] },
        ],
      },
    }));

  const removeVar = (i) =>
    setDraft(d => {
      const vars = [...(d.variableSet?.variables || [])];
      vars.splice(i, 1);
      return { ...d, variableSet: { ...d.variableSet, variables: vars } };
    });

  const setVarChoices = (i, raw) =>
    setVar(i, 'choices', raw.split(',').map(s => s.trim()).filter(Boolean));

  // ── Approvals ─────────────────────────────────────────────────────────────
  const toggleApprover = (approver) =>
    setDraft(d => {
      const current = d.approval?.approvers || [];
      const next = current.includes(approver)
        ? current.filter(a => a !== approver)
        : [...current, approver];
      return { ...d, approval: { ...(d.approval || {}), approvers: next } };
    });

  // ── ATF Test steps ────────────────────────────────────────────────────────
  const setAtfName = (val) =>
    setDraft(d => ({ ...d, testCase: { ...d.testCase, name: val } }));

  const setAtfStep = (i, field, val) =>
    setDraft(d => {
      const steps = [...(d.testCase?.test_steps || [])];
      steps[i] = { ...steps[i], [field]: val };
      return { ...d, testCase: { ...d.testCase, test_steps: steps } };
    });

  const addAtfStep = () =>
    setDraft(d => {
      const steps = [...(d.testCase?.test_steps || [])];
      const nextOrder = steps.length > 0 ? Math.max(...steps.map(s => s.order || 0)) + 100 : 100;
      steps.push({ order: nextOrder, action: 'assert', description: 'New test step' });
      return { ...d, testCase: { ...d.testCase, test_steps: steps } };
    });

  const removeAtfStep = (i) =>
    setDraft(d => {
      const steps = [...(d.testCase?.test_steps || [])];
      steps.splice(i, 1);
      return { ...d, testCase: { ...d.testCase, test_steps: steps } };
    });

  const resetAtfSteps = () =>
    setDraft(d => ({
      ...d,
      testCase: { ...d.testCase, test_steps: buildDefaultAtfSteps(d) },
    }));

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(`${API_URL}/artifacts/${artifact.requirement_id}`, {
        method: 'PUT',
        headers: { ...authH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogItem: draft.catalogItem,
          variableSet: draft.variableSet,
          flow: draft.flow,
          approval: draft.approval,
          testCase: draft.testCase,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMsg('✅ Changes saved');
        setTimeout(() => setSaveMsg(''), 3000);
      } else {
        setSaveMsg(`❌ ${data.error}`);
      }
    } catch (err) {
      setSaveMsg(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Deploy (after approval confirmed) ─────────────────────────────────────
  const handleDeploy = async () => {
    setDeploying(true);
    setDeployResult(null);
    try {
      // Always persist latest edits before deploying
      await fetch(`${API_URL}/artifacts/${artifact.requirement_id}`, {
        method: 'PUT',
        headers: { ...authH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogItem: draft.catalogItem,
          variableSet: draft.variableSet,
          flow: draft.flow,
          approval: draft.approval,
          testCase: draft.testCase,
        }),
      });

      const res = await fetch(`${API_URL}/deploy/${artifact.requirement_id}`, {
        method: 'POST',
        headers: authH,
      });
      const data = await res.json();
      setDeployResult(data);
      setConfirmMode(false);
      if (data.success && onDeployed) onDeployed();
    } catch (err) {
      setDeployResult({ success: false, error: err.message });
      setConfirmMode(false);
    } finally {
      setDeploying(false);
    }
  };

  const vars = draft.variableSet?.variables || [];
  const approvers = draft.approval?.approvers || [];
  const atfSteps = draft.testCase?.test_steps || [];
  const atfName = draft.testCase?.name || '';

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalBox}>

        {/* ── Header ── */}
        <div style={modalHeader}>
          <div>
            <div style={{ color: '#fff', fontWeight: '700', fontSize: '16px' }}>
              {confirmMode ? '🔒 Approve Creation in ServiceNow' : '📋 Review & Configure Artifacts'}
            </div>
            <div style={{ color: '#aab', fontSize: '12px', marginTop: '3px' }}>
              {confirmMode
                ? 'Review the full creation summary. Check the box below then confirm.'
                : 'Edit catalog item, variables, flow, approval rules, and ATF test steps before deploying.'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <StepDot active={!confirmMode} label="1" subtitle="Edit" />
              <div style={{ width: '24px', height: '2px', background: '#444' }} />
              <StepDot active={confirmMode} label="2" subtitle="Approve" />
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aab', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={modalBody}>

          {/* ══════════════════ STEP 1: Edit ══════════════════ */}
          {!confirmMode && (
            <>
              {/* ── Catalog Item ── */}
              <Section title="📋 Catalog Item" color="#2980b9">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '14px' }}>
                  <div>
                    <label style={labelS}>Item Name</label>
                    <input style={inputS} value={draft.catalogItem?.name || ''} onChange={e => setCatField('name', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelS}>Category</label>
                    <input style={inputS} value={draft.catalogItem?.category || ''} onChange={e => setCatField('category', e.target.value)} placeholder="e.g. IT Services" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelS}>Short Description</label>
                    <input style={inputS} value={draft.catalogItem?.short_description || ''} onChange={e => setCatField('short_description', e.target.value)} />
                  </div>
                </div>
              </Section>

              {/* ── Variables ── */}
              <Section title={`📝 Variables (${vars.length})`} color="#16a085"
                action={<button style={btnSmallGreen} onClick={addVar}>+ Add Variable</button>}>
                {vars.length === 0
                  ? <p style={{ padding: '14px', color: '#888', fontSize: '13px', margin: 0 }}>No variables. Click + Add Variable.</p>
                  : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#f4f6f9' }}>
                            {['Name', 'Label', 'Type', 'Mandatory', 'Choices / Ref Table', ''].map(h => (
                              <th key={h} style={{ ...cellS, fontWeight: '600', color: '#555', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {vars.map((v, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={cellS}><input style={{ ...inputS, width: '110px' }} value={v.name} onChange={e => setVar(i, 'name', e.target.value)} /></td>
                              <td style={cellS}><input style={{ ...inputS, width: '120px' }} value={v.label || ''} onChange={e => setVar(i, 'label', e.target.value)} /></td>
                              <td style={cellS}>
                                <select style={{ ...selectS, width: '100px' }} value={v.type} onChange={e => setVar(i, 'type', e.target.value)}>
                                  {VAR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </td>
                              <td style={{ ...cellS, textAlign: 'center' }}>
                                <input type="checkbox" checked={!!v.mandatory} onChange={e => setVar(i, 'mandatory', e.target.checked)} style={{ cursor: 'pointer' }} />
                              </td>
                              <td style={cellS}>
                                {v.type === 'choice'
                                  ? <input style={{ ...inputS, width: '160px' }} value={(v.choices || []).join(', ')} onChange={e => setVarChoices(i, e.target.value)} placeholder="opt1, opt2, opt3" />
                                  : v.type === 'reference'
                                  ? <input style={{ ...inputS, width: '130px' }} value={v.referenceTable || ''} onChange={e => setVar(i, 'referenceTable', e.target.value)} placeholder="e.g. sys_user" />
                                  : <span style={{ color: '#bbb', fontSize: '11px' }}>—</span>}
                              </td>
                              <td style={cellS}><button style={btnSmallRed} onClick={() => removeVar(i)}>✕</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </Section>

              {/* ── Approval Rules ── */}
              <Section title="✅ Approval Rules" color="#e67e22">
                <div style={{ padding: '14px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#666' }}>
                    Select who must approve this request. Active approvers shown in orange.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {APPROVER_OPTIONS.map(a => {
                      const active = approvers.includes(a);
                      return (
                        <button key={a} onClick={() => toggleApprover(a)} style={{
                          padding: '5px 14px', borderRadius: '16px', fontSize: '12px', cursor: 'pointer',
                          fontWeight: active ? '700' : 'normal',
                          background: active ? '#e67e22' : '#f0f0f0',
                          color: active ? '#fff' : '#555',
                          border: active ? '2px solid #e67e22' : '2px solid #e0e0e0',
                          transition: 'all 0.15s',
                        }}>
                          {active ? '✓ ' : ''}{a}
                        </button>
                      );
                    })}
                  </div>
                  {approvers.length === 0 && (
                    <p style={{ marginTop: '8px', fontSize: '11px', color: '#e74c3c' }}>No approvers selected — request will skip approval.</p>
                  )}
                </div>
              </Section>

              {/* ── ATF Test ── */}
              <Section
                title={`🧪 ATF Test Suite (${atfSteps.length} steps)`}
                color="#c0392b"
                action={
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={btnSmall} onClick={resetAtfSteps} title="Reset to auto-generated steps from current variables">↺ Reset</button>
                    <button style={btnSmallGreen} onClick={addAtfStep}>+ Add Step</button>
                  </div>
                }
              >
                <div style={{ padding: '14px' }}>
                  {/* Test name */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={labelS}>Test Suite Name (created in ServiceNow ATF)</label>
                    <input
                      style={{ ...inputS, maxWidth: '380px' }}
                      value={atfName}
                      onChange={e => setAtfName(e.target.value)}
                      placeholder="ATF_MyItem_Test"
                    />
                  </div>

                  {/* ATF Step table */}
                  {atfSteps.length === 0
                    ? <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>No steps. Click + Add Step or ↺ Reset to regenerate from variables.</p>
                    : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#fdf2f2' }}>
                            <th style={{ ...cellS, fontWeight: '600', color: '#555', width: '36px' }}>#</th>
                            <th style={{ ...cellS, fontWeight: '600', color: '#555', width: '130px' }}>Action</th>
                            <th style={{ ...cellS, fontWeight: '600', color: '#555' }}>Description</th>
                            <th style={{ ...cellS, width: '36px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {atfSteps.map((s, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f8e8e8' }}>
                              <td style={{ ...cellS, color: '#aaa', textAlign: 'center' }}>{i + 1}</td>
                              <td style={cellS}>
                                <select
                                  style={{ ...selectS, width: '120px' }}
                                  value={s.action || 'assert'}
                                  onChange={e => setAtfStep(i, 'action', e.target.value)}
                                >
                                  {ATF_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                              </td>
                              <td style={cellS}>
                                <input
                                  style={inputS}
                                  value={s.description || ''}
                                  onChange={e => setAtfStep(i, 'description', e.target.value)}
                                  placeholder="Describe what this step does"
                                />
                              </td>
                              <td style={cellS}>
                                <button style={btnSmallRed} onClick={() => removeAtfStep(i)}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                  <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#888' }}>
                    ↺ Reset regenerates steps from your current variable list. Steps are saved and sent to ServiceNow ATF on deploy.
                  </p>

                  {/* Prior local test result */}
                  {draft.testResult && (
                    <div style={{
                      marginTop: '10px', padding: '8px 12px', borderRadius: '6px',
                      background: draft.testResult.status === 'passed' ? '#e8f5e9' : '#fff8e1',
                      border: `1px solid ${draft.testResult.status === 'passed' ? '#81c784' : '#f9a825'}`,
                      fontSize: '11px', color: '#555',
                    }}>
                      <strong>Last local simulation:</strong>{' '}
                      <span style={{ color: draft.testResult.status === 'passed' ? '#2e7d32' : '#e65100', fontWeight: '700' }}>
                        {draft.testResult.status?.toUpperCase()}
                      </span>
                      {' '}· {draft.testResult.steps_passed ?? 0} passed · {draft.testResult.steps_failed ?? 0} failed
                      {draft.testResult.mode && <span style={{ color: '#aaa', marginLeft: '6px' }}>({draft.testResult.mode})</span>}
                    </div>
                  )}
                </div>
              </Section>

              {/* ── Deploy Result (from a prior attempt) ── */}
              {deployResult && <DeployResult result={deployResult} />}
            </>
          )}

          {/* ══════════════════ STEP 2: Approval ══════════════════ */}
          {confirmMode && (
            <ApprovalPanel
              draft={draft}
              atfSteps={atfSteps}
              approved={approved}
              onToggleApprove={() => setApproved(a => !a)}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div style={modalFooter}>
          {saveMsg && (
            <span style={{ fontSize: '12px', color: saveMsg.startsWith('✅') ? '#27ae60' : '#e74c3c', marginRight: 'auto', alignSelf: 'center' }}>
              {saveMsg}
            </span>
          )}

          {!confirmMode && (
            <>
              <button style={btnGhost} onClick={onClose}>Cancel</button>
              <button style={{ ...btnPrimary, background: '#555' }} onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
              <button
                style={{ ...btnPrimary, background: deployResult?.success ? '#27ae60' : '#c0392b', minWidth: '160px' }}
                onClick={() => { setApproved(false); setConfirmMode(true); }}
                disabled={deployResult?.success}
              >
                {deployResult?.success ? '✅ Deployed!' : '🔍 Review & Approve →'}
              </button>
            </>
          )}

          {confirmMode && (
            <>
              <button style={btnGhost} onClick={() => { setConfirmMode(false); setApproved(false); }}>
                ← Back to Edit
              </button>
              <button
                style={{
                  ...btnPrimary,
                  background: approved ? '#27ae60' : '#bbb',
                  cursor: approved ? 'pointer' : 'not-allowed',
                  minWidth: '210px',
                  opacity: deploying ? 0.7 : 1,
                }}
                onClick={handleDeploy}
                disabled={!approved || deploying}
                title={!approved ? 'Check the approval box to enable deployment' : ''}
              >
                {deploying ? '⏳ Applying in ServiceNow…' : '🚀 Confirm & Deploy to ServiceNow'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Approval Panel ───────────────────────────────────────────────────────────

function ApprovalPanel({ draft, atfSteps, approved, onToggleApprove }) {
  const vars = draft.variableSet?.variables || [];
  const approvers = draft.approval?.approvers || [];

  const summaryItems = [
    {
      icon: '📋', title: 'Catalog Item', color: '#2980b9',
      rows: [
        { label: 'Name', value: draft.catalogItem?.name || '—' },
        { label: 'Short Description', value: draft.catalogItem?.short_description || '—' },
        { label: 'Category', value: draft.catalogItem?.category || '—' },
      ],
    },
    {
      icon: '📝', title: `Variables (${vars.length})`, color: '#16a085',
      rows: vars.length === 0
        ? [{ label: 'Note', value: 'No variables — item will have no input fields' }]
        : vars.map(v => ({
            label: v.label || v.name,
            value: `${v.type}${v.mandatory ? ' · required' : ''}${v.choices?.length ? ` · [${v.choices.join(', ')}]` : ''}`,
          })),
    },
    {
      icon: '✅', title: 'Approval Rules', color: '#e67e22',
      rows: approvers.length === 0
        ? [{ label: 'Note', value: 'No approvers — requests will auto-approve' }]
        : approvers.map(a => ({ label: 'Approver', value: a })),
    },
    {
      icon: '🧪', title: `ATF Test Suite (${atfSteps.length} steps)`, color: '#c0392b',
      rows: [
        { label: 'Suite Name', value: draft.testCase?.name || '—' },
        ...atfSteps.map((s, i) => ({
          label: `Step ${i + 1} · ${s.action}`,
          value: s.description || '—',
        })),
      ],
    },
  ];

  return (
    <div>
      {/* Warning banner */}
      <div style={{
        padding: '12px 16px', marginBottom: '20px',
        background: '#fff8e1', border: '1px solid #f9a825', borderRadius: '8px',
        fontSize: '12px', color: '#555',
      }}>
        <strong style={{ color: '#e65100' }}>⚠️ You are about to create artifacts permanently in ServiceNow.</strong>
        <br />
        Review every section carefully. Click "← Back to Edit" if you need to make changes.
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
        {summaryItems.map((item, idx) => (
          <div key={idx} style={{ border: `1px solid ${item.color}30`, borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{
              padding: '8px 14px', background: `${item.color}12`,
              borderBottom: `1px solid ${item.color}20`,
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ fontSize: '14px' }}>{item.icon}</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: item.color }}>{item.title}</span>
              <span style={{
                marginLeft: 'auto', fontSize: '10px', padding: '2px 8px',
                background: '#27ae6020', color: '#27ae60', borderRadius: '10px', fontWeight: '600',
              }}>Will be created</span>
            </div>
            <div style={{ padding: '10px 14px', background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <tbody>
                  {item.rows.map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: ri < item.rows.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                      <td style={{ padding: '3px 8px 3px 0', color: '#999', whiteSpace: 'nowrap', width: '160px', verticalAlign: 'top', fontSize: '11px' }}>
                        {row.label}
                      </td>
                      <td style={{ padding: '3px 0', color: '#333', fontWeight: '500', wordBreak: 'break-word', fontSize: '12px' }}>
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Approval checkbox */}
      <div
        style={{
          padding: '14px 18px', borderRadius: '8px',
          background: approved ? '#e8f5e9' : '#f5f5f5',
          border: `2px solid ${approved ? '#27ae60' : '#ddd'}`,
          transition: 'all 0.2s', cursor: 'pointer',
        }}
        onClick={onToggleApprove}
      >
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox" checked={approved}
            onChange={onToggleApprove}
            onClick={e => e.stopPropagation()}
            style={{ marginTop: '2px', width: '16px', height: '16px', cursor: 'pointer', accentColor: '#27ae60' }}
          />
          <span style={{ fontSize: '13px', color: '#333', lineHeight: '1.5' }}>
            <strong>I have reviewed all artifacts above</strong> and approve creating them permanently
            in the connected ServiceNow instance.
          </span>
        </label>
      </div>

      {!approved && (
        <p style={{ marginTop: '8px', fontSize: '11px', color: '#e67e22', textAlign: 'center' }}>
          Check the box above to enable the "Confirm & Create" button.
        </p>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, color, children, action }) {
  return (
    <div style={section}>
      <div style={sectionHead}>
        <span style={{ fontSize: '13px', fontWeight: '700', color }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Step indicator dot ───────────────────────────────────────────────────────

function StepDot({ active, label, subtitle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <div style={{
        width: '26px', height: '26px', borderRadius: '50%',
        background: active ? '#4a90d9' : '#444',
        color: active ? '#fff' : '#888',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '12px', fontWeight: '700',
        border: active ? '2px solid #7ab8f5' : '2px solid #555',
        transition: 'all 0.2s',
      }}>
        {label}
      </div>
      <span style={{ fontSize: '9px', color: active ? '#7ab8f5' : '#666' }}>{subtitle}</span>
    </div>
  );
}

// ─── Deploy Result banner ─────────────────────────────────────────────────────

function DeployResult({ result }) {
  const ok = result.success;
  const res = result.result || result;
  const warnings = res.warnings || [];
  const deploymentMode = ok && res.deployment_mode
    ? String(res.deployment_mode).toLowerCase()
    : null;
  const modeLabel = deploymentMode === 'updated'
    ? 'UPDATED existing catalog item'
    : deploymentMode === 'created'
      ? 'CREATED new catalog item'
      : null;

  return (
    <div style={{
      border: `1px solid ${ok ? '#66bb6a' : '#ef9a9a'}`,
      borderRadius: '8px',
      background: ok ? '#e8f5e9' : '#ffebee',
      padding: '14px 16px', fontSize: '12px',
    }}>
      <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '8px', color: ok ? '#2e7d32' : '#c62828' }}>
        {ok ? '✅ Deployment Successful!' : `❌ Deployment Failed: ${res.error || result.error}`}
      </div>
      {ok && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#333' }}>
          {modeLabel && (
            <div
              style={{
                display: 'inline-block',
                width: 'fit-content',
                padding: '3px 10px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '0.2px',
                background: deploymentMode === 'updated' ? '#e3f2fd' : '#e8f5e9',
                border: deploymentMode === 'updated' ? '1px solid #90caf9' : '1px solid #a5d6a7',
                color: deploymentMode === 'updated' ? '#0d47a1' : '#1b5e20',
              }}
            >
              {deploymentMode === 'updated' ? '🔁 ' : '🆕 '}{modeLabel}
            </div>
          )}

          {res.instance_url && <a href={res.instance_url} target="_blank" rel="noreferrer" style={{ color: '#1565c0' }}>🔗 Open Catalog Item in ServiceNow →</a>}
          {res.atf_test_url && <a href={res.atf_test_url} target="_blank" rel="noreferrer" style={{ color: '#6a1b9a' }}>🧪 Open ATF Test Suite in ServiceNow →</a>}
          {res.flow_setup?.flow_designer_url && <a href={res.flow_setup.flow_designer_url} target="_blank" rel="noreferrer" style={{ color: '#1565c0' }}>🔄 Open Flow in Flow Designer →</a>}
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ marginTop: '8px', color: '#e65100' }}>
          <strong>⚠️ Warnings:</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
