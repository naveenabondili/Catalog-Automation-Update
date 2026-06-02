import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';

export default function Dashboard({ artifacts }) {
  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/audit-logs`)
      .then(r => r.json())
      .then(d => setAuditLogs(d.logs || []))
      .catch(() => {});
  }, [artifacts.length]);

  // ── Compute stats ──────────────────────────────────────────────────────────
  const total = artifacts.length;

  const deployed = artifacts.filter(a => {
    const arts = parse(a.artifacts);
    return arts?.catalogItem?.status === 'created_in_sn' ||
           arts?.flow?.status === 'created_in_sn';
  }).length;

  const withFlow = artifacts.filter(a => parse(a.artifacts)?.flow).length;
  const withATF  = artifacts.filter(a => parse(a.artifacts)?.testCase).length;
  const varTotal = artifacts.reduce((sum, a) => sum + (parse(a.artifacts)?.variableSet?.variables?.length || 0), 0);

  const deployRate = total ? Math.round((deployed / total) * 100) : 0;

  // ── Type breakdown ─────────────────────────────────────────────────────────
  const typeCounts = artifacts.reduce((acc, a) => {
    const arts = parse(a.artifacts);
    if (arts?.flow?.steps?.some(s => s.type === 'approval')) acc.approval = (acc.approval || 0) + 1;
    if (arts?.businessRule) acc.br = (acc.br || 0) + 1;
    if (arts?.clientScript) acc.cs = (acc.cs || 0) + 1;
    return acc;
  }, {});

  // ── Recent activity from audit logs ───────────────────────────────────────
  const recent = auditLogs.slice(0, 8);

  const actionColor = {
    DEPLOYMENT_SUCCESS: '#27ae60', DEPLOYMENT_FAILED: '#e74c3c',
    ARTIFACT_SAVED: '#2980b9', ATF_TEST_EXECUTED: '#8e44ad',
    ARTIFACT_UPDATED: '#e67e22', DEPLOYMENT_START: '#f39c12',
  };

  return (
    <div>
      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <StatCard value={total}       label="Total Artifacts"  color="#4a90d9" icon="📦" />
        <StatCard value={deployed}    label="Deployed to SN"   color="#27ae60" icon="🚀" />
        <StatCard value={`${deployRate}%`} label="Deploy Rate" color="#e67e22" icon="📊" progress={deployRate} />
        <StatCard value={withFlow}    label="With Flows"       color="#8e44ad" icon="🔄" />
        <StatCard value={withATF}     label="ATF Tests"        color="#16a085" icon="🧪" />
        <StatCard value={varTotal}    label="Total Variables"  color="#c0392b" icon="📝" />
      </div>

      {/* ── Bottom row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Artifact breakdown */}
        <div style={panelS}>
          <h3 style={panelTitleS}>⚙️ Artifact Breakdown</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
            <Bar label="Deployed"     value={deployed}          max={total || 1} color="#27ae60" />
            <Bar label="With Flows"   value={withFlow}          max={total || 1} color="#8e44ad" />
            <Bar label="ATF Tests"    value={withATF}           max={total || 1} color="#16a085" />
            <Bar label="Bus. Rules"   value={typeCounts.br || 0} max={total || 1} color="#e67e22" />
            <Bar label="Client Scripts" value={typeCounts.cs || 0} max={total || 1} color="#2980b9" />
            <Bar label="Approvals"    value={typeCounts.approval || 0} max={total || 1} color="#c0392b" />
          </div>
        </div>

        {/* Recent activity */}
        <div style={panelS}>
          <h3 style={panelTitleS}>📋 Recent Activity</h3>
          {recent.length === 0
            ? <p style={{ color: '#aaa', fontSize: '13px', marginTop: '12px' }}>No activity yet.</p>
            : (
              <ul style={{ listStyle: 'none', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {recent.map((log, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                      background: actionColor[log.action] || '#aaa',
                    }} />
                    <span style={{ flex: 1, color: '#333' }}>{log.action.replace(/_/g, ' ')}</span>
                    <span style={{ color: '#aaa', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label, color, icon, progress }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${color}22`,
      borderTop: `3px solid ${color}`, borderRadius: '8px',
      padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: '22px', marginBottom: '4px' }}>{icon}</div>
      <div style={{ fontSize: '26px', fontWeight: '800', color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{label}</div>
      {progress !== undefined && (
        <div style={{ marginTop: '8px', height: '4px', background: '#eee', borderRadius: '4px' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.6s' }} />
        </div>
      )}
    </div>
  );
}

function Bar({ label, value, max, color }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
      <span style={{ width: '90px', color: '#555', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.5s' }} />
      </div>
      <span style={{ width: '24px', color: '#888', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

const panelS = {
  background: '#fff', border: '1px solid #eee', borderRadius: '8px',
  padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
};
const panelTitleS = { fontSize: '13px', fontWeight: '700', color: '#444' };

function parse(v) {
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return {}; }
}
