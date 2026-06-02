import React, { useState } from 'react';

// LCS-based line-by-line diff algorithm
function computeDiff(leftText, rightText) {
  const left = leftText.split('\n');
  const right = rightText.split('\n');
  const m = left.length;
  const n = right.length;

  // Build LCS DP table
  const dp = [];
  for (let i = 0; i <= m; i++) dp[i] = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = left[i - 1] === right[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Traceback
  const hunks = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && left[i - 1] === right[j - 1]) {
      hunks.unshift({ type: 'equal', left: left[i - 1], right: right[j - 1], leftLine: i, rightLine: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      hunks.unshift({ type: 'insert', left: null, right: right[j - 1], leftLine: null, rightLine: j });
      j--;
    } else {
      hunks.unshift({ type: 'delete', left: left[i - 1], right: null, leftLine: i, rightLine: null });
      i--;
    }
  }
  return hunks;
}

export default function TextDiffChecker({ onClose }) {
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [diff, setDiff] = useState(null);
  const [showInputs, setShowInputs] = useState(true);

  const handleCompare = () => {
    if (!leftText.trim() && !rightText.trim()) return;
    setDiff(computeDiff(leftText, rightText));
    setShowInputs(false);
  };

  const handleReset = () => {
    setDiff(null);
    setShowInputs(true);
  };

  const handleSwap = () => {
    setLeftText(rightText);
    setRightText(leftText);
    setDiff(null);
    setShowInputs(true);
  };

  const handleClear = () => {
    setLeftText('');
    setRightText('');
    setDiff(null);
    setShowInputs(true);
  };

  const stats = diff ? {
    added: diff.filter(h => h.type === 'insert').length,
    removed: diff.filter(h => h.type === 'delete').length,
    unchanged: diff.filter(h => h.type === 'equal').length,
  } : null;

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: '20px' }}>🔀 Text Compare</h2>
            <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>
              Paste two texts and click <strong>Find Differences</strong> to see a side-by-side comparison.
            </p>
          </div>
          <button onClick={onClose} title="Close" style={{
            background: 'none', border: '1px solid #ddd', borderRadius: '6px',
            fontSize: '16px', cursor: 'pointer', color: '#888', padding: '4px 10px',
            lineHeight: 1, flexShrink: 0,
          }}>✕</button>
        </div>

        {/* ── Input panels ── */}
        {showInputs && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>

              {/* Left textarea */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={labelStyle}>Original Text</label>
                  <button onClick={() => setLeftText('')} style={clearBtnStyle} title="Clear left">Clear</button>
                </div>
                <textarea
                  value={leftText}
                  onChange={e => setLeftText(e.target.value)}
                  placeholder="Paste your original text here..."
                  spellCheck={false}
                  style={textareaStyle}
                />
                <div style={lineCountStyle}>{leftText ? leftText.split('\n').length : 0} lines</div>
              </div>

              {/* Swap button */}
              <button onClick={handleSwap} title="Swap left and right" style={{
                marginTop: '28px', background: '#f0f4f8', border: '1px solid #ddd',
                borderRadius: '6px', padding: '8px 10px', cursor: 'pointer', fontSize: '16px',
              }}>⇄</button>

              {/* Right textarea */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={labelStyle}>Modified Text</label>
                  <button onClick={() => setRightText('')} style={clearBtnStyle} title="Clear right">Clear</button>
                </div>
                <textarea
                  value={rightText}
                  onChange={e => setRightText(e.target.value)}
                  placeholder="Paste your modified text here..."
                  spellCheck={false}
                  style={textareaStyle}
                />
                <div style={lineCountStyle}>{rightText ? rightText.split('\n').length : 0} lines</div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '4px' }}>
              <button onClick={handleCompare} style={{
                padding: '9px 28px', background: '#4a90d9', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontWeight: '700', fontSize: '14px',
              }}>
                Find Differences →
              </button>
              <button onClick={handleClear} style={{
                padding: '9px 16px', background: '#f5f5f5', color: '#555',
                border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
              }}>
                Clear All
              </button>
            </div>
          </>
        )}

        {/* ── Diff results ── */}
        {diff && (
          <>
            {/* Stats bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                <span style={{ color: '#22863a', fontWeight: '700', background: '#e6ffed', padding: '3px 10px', borderRadius: '20px', border: '1px solid #a7f3d0' }}>
                  +{stats.added} added
                </span>
                <span style={{ color: '#b31d28', fontWeight: '700', background: '#ffeef0', padding: '3px 10px', borderRadius: '20px', border: '1px solid #fca5a5' }}>
                  -{stats.removed} removed
                </span>
                <span style={{ color: '#666', fontWeight: '600', background: '#f5f5f5', padding: '3px 10px', borderRadius: '20px', border: '1px solid #e0e0e0' }}>
                  {stats.unchanged} unchanged
                </span>
              </div>
              <button onClick={handleReset} style={{
                marginLeft: 'auto', padding: '6px 16px', background: '#fff',
                border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#555',
              }}>
                ← Edit Texts
              </button>
            </div>

            {/* Side-by-side diff view */}
            <div style={{ border: '1px solid #d1d5db', borderRadius: '8px', overflow: 'hidden', fontSize: '12px', fontFamily: 'monospace' }}>

              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#f8fafc', borderBottom: '2px solid #d1d5db' }}>
                <div style={{ padding: '8px 14px', fontWeight: '700', fontSize: '12px', fontFamily: 'sans-serif', borderRight: '1px solid #d1d5db', color: '#555', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Original</span>
                  <span style={{ color: '#b31d28', fontWeight: '600' }}>-{stats.removed} lines</span>
                </div>
                <div style={{ padding: '8px 14px', fontWeight: '700', fontSize: '12px', fontFamily: 'sans-serif', color: '#555', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Modified</span>
                  <span style={{ color: '#22863a', fontWeight: '600' }}>+{stats.added} lines</span>
                </div>
              </div>

              {/* Diff rows */}
              <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
                {diff.map((hunk, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #f0f0f0' }}>

                    {/* Left cell */}
                    <div style={{
                      display: 'flex', minHeight: '22px',
                      background: hunk.type === 'delete' ? '#ffeef0' : '#fff',
                      borderRight: '1px solid #e8e8e8',
                    }}>
                      <span style={{
                        minWidth: '44px', padding: '2px 8px',
                        background: hunk.type === 'delete' ? '#ffcdd2' : '#fafafa',
                        color: hunk.type === 'delete' ? '#b31d28' : '#bbb',
                        fontSize: '11px', textAlign: 'right',
                        userSelect: 'none', borderRight: '1px solid #e8e8e8',
                        flexShrink: 0, lineHeight: '18px',
                      }}>
                        {hunk.leftLine || ''}
                      </span>
                      <span style={{
                        padding: '2px 10px', flex: 1,
                        color: hunk.type === 'delete' ? '#b31d28' : '#24292f',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: '18px',
                      }}>
                        {hunk.type === 'delete' && <span style={{ opacity: 0.6, marginRight: '4px' }}>-</span>}
                        {hunk.type === 'equal' && <span style={{ opacity: 0, marginRight: '4px' }}>·</span>}
                        {hunk.left ?? ''}
                      </span>
                    </div>

                    {/* Right cell */}
                    <div style={{
                      display: 'flex', minHeight: '22px',
                      background: hunk.type === 'insert' ? '#e6ffed' : '#fff',
                    }}>
                      <span style={{
                        minWidth: '44px', padding: '2px 8px',
                        background: hunk.type === 'insert' ? '#cdffd8' : '#fafafa',
                        color: hunk.type === 'insert' ? '#22863a' : '#bbb',
                        fontSize: '11px', textAlign: 'right',
                        userSelect: 'none', borderRight: '1px solid #e8e8e8',
                        flexShrink: 0, lineHeight: '18px',
                      }}>
                        {hunk.rightLine || ''}
                      </span>
                      <span style={{
                        padding: '2px 10px', flex: 1,
                        color: hunk.type === 'insert' ? '#22863a' : '#24292f',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: '18px',
                      }}>
                        {hunk.type === 'insert' && <span style={{ opacity: 0.6, marginRight: '4px' }}>+</span>}
                        {hunk.type === 'equal' && <span style={{ opacity: 0, marginRight: '4px' }}>·</span>}
                        {hunk.right ?? ''}
                      </span>
                    </div>

                  </div>
                ))}
              </div>
            </div>

            {/* Bottom re-edit hint */}
            <p style={{ margin: '10px 0 0', fontSize: '11px', color: '#aaa', textAlign: 'right' }}>
              Click <strong>Edit Texts</strong> to modify and compare again.
            </p>
          </>
        )}

      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const overlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.65)', zIndex: 2000,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '24px 16px', overflowY: 'auto',
};

const modal = {
  background: '#fff', borderRadius: '12px', padding: '28px',
  width: '100%', maxWidth: '1200px',
  boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
};

const labelStyle = {
  fontSize: '13px', fontWeight: '700', color: '#374151',
};

const clearBtnStyle = {
  fontSize: '11px', color: '#888', background: 'none',
  border: 'none', cursor: 'pointer', padding: '0',
  textDecoration: 'underline',
};

const textareaStyle = {
  width: '100%', height: '280px',
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: '12px', padding: '10px 12px',
  border: '1px solid #d1d5db', borderRadius: '6px',
  resize: 'vertical', boxSizing: 'border-box',
  lineHeight: '1.5', color: '#24292f',
  background: '#fafafa',
  outline: 'none',
};

const lineCountStyle = {
  fontSize: '11px', color: '#aaa', marginTop: '4px', textAlign: 'right',
};
