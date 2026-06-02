import React, { useState } from 'react';
import { API_URL } from '../config';

function InstanceHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/instance-health`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Backend returned HTML. Is the backend running on port 3001?');
      }

      const data = await response.json();
      setHealth(data);
    } catch (err) {
      console.error('Health check error:', err);
      setHealth({ 
        status: 'error', 
        error: err.message,
        hint: 'Backend running on http://localhost:3001?'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>🏥 Instance Health</h2>
      <button onClick={checkHealth} disabled={loading}>
        {loading ? 'Checking...' : 'Check Instance Health'}
      </button>

      {health && (
        <div style={{ marginTop: '15px' }}>
          {health.status === 'healthy' ? (
            <div className="alert alert-success">
              ✅ Instance is healthy
              <br />
              Instance: {health.instance}
            </div>
          ) : (
            <div className="alert alert-error">
              ❌ Instance unavailable
              <br />
              Error: {health.error}
              {health.hint && <><br />Hint: {health.hint}</>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default InstanceHealth;