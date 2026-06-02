import React, { useState } from 'react';

const TEMPLATES = [
  {
    id: 'laptop',
    icon: '💻',
    title: 'Laptop Request',
    category: 'Hardware',
    description: 'Employee laptop procurement with manager approval',
    text: 'Create a laptop request catalog item. Fields: laptop model (choice: Dell XPS, HP EliteBook, Lenovo ThinkPad, MacBook Pro), RAM size (choice: 8GB, 16GB, 32GB), storage (choice: 256GB SSD, 512GB SSD, 1TB SSD), operating system (choice: Windows 11, macOS, Linux), business justification (multiline, mandatory), urgency (choice: Low, Medium, High). Requires manager and IT approval. SLA: 3 business days.',
  },
  {
    id: 'access',
    icon: '🔐',
    title: 'Access Request',
    category: 'Access Management',
    description: 'System / application access provisioning',
    text: 'Create an access request catalog item. Fields: system or application name (string, mandatory), access level (choice: Read Only, Read Write, Admin, Super Admin), access duration (choice: 30 Days, 90 Days, 6 Months, Permanent), business justification (multiline, mandatory), manager email (email, mandatory). Requires manager and security team approval. Include conditional approval for Admin and Super Admin roles.',
  },
  {
    id: 'software',
    icon: '📦',
    title: 'Software License',
    category: 'Software',
    description: 'Software installation and license request',
    text: 'Create a software license request catalog item. Fields: software name (string, mandatory), version (string), number of licenses (number, mandatory), cost per license (number), total cost (number), business justification (multiline, mandatory), department (string). Requires manager approval. If total cost exceeds 500, also require director approval.',
  },
  {
    id: 'onboarding',
    icon: '👤',
    title: 'Employee Onboarding',
    category: 'HR',
    description: 'New employee IT setup and access provisioning',
    text: 'Create an employee onboarding catalog item. Fields: employee full name (string, mandatory), employee ID (string, mandatory), department (string, mandatory), start date (date, mandatory), job title (string, mandatory), laptop required (boolean), phone required (boolean), VPN access (boolean), email setup (boolean), active directory setup (boolean). Requires HR and IT approval. SLA: 2 business days before start date.',
  },
  {
    id: 'vpn',
    icon: '🌐',
    title: 'VPN Access',
    category: 'Network',
    description: 'Remote VPN access request',
    text: 'Create a VPN access request catalog item. Fields: reason for VPN access (multiline, mandatory), access type (choice: Full Tunnel, Split Tunnel), access duration (choice: Temporary, Permanent), remote work location (string), device type (choice: Company Laptop, Personal Device), device serial number (string). Requires manager and security approval.',
  },
  {
    id: 'password',
    icon: '🔑',
    title: 'Password Reset',
    category: 'Access Management',
    description: 'Self-service password reset request',
    text: 'Create a password reset catalog item. Fields: system (choice: Active Directory, Email, VPN, SAP, Salesforce, Database), username (string, mandatory), employee ID (string, mandatory), contact phone (string). No manager approval required. Auto-fulfilled by IT helpdesk. SLA: 2 hours.',
  },
];

export default function TemplateLibrary({ onUseTemplate }) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = TEMPLATES.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set(TEMPLATES.map(t => t.category))];

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>📚 Template Library</h2>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search templates…"
          style={{ width: '200px', padding: '6px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px' }}
        />
      </div>

      <p style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>
        Start from a pre-built template — click any card, review the requirement text, then click Use Template.
      </p>

      {/* Category groups */}
      {categories.map(cat => {
        const inCat = filtered.filter(t => t.category === cat);
        if (!inCat.length) return null;
        return (
          <div key={cat} style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
              {cat}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {inCat.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  selected={selected?.id === t.id}
                  onClick={() => setSelected(selected?.id === t.id ? null : t)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <p style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>No templates match "{search}"</p>
      )}

      {/* Preview panel */}
      {selected && (
        <div style={{
          marginTop: '16px', border: '1px solid #4a90d9', borderRadius: '8px',
          background: '#f0f6ff', padding: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <div>
              <span style={{ fontSize: '20px' }}>{selected.icon}</span>
              <strong style={{ fontSize: '14px', marginLeft: '8px' }}>{selected.title}</strong>
              <span style={{ marginLeft: '8px', fontSize: '11px', background: '#4a90d9', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>{selected.category}</span>
            </div>
            <button
              onClick={() => { onUseTemplate(selected.text); setSelected(null); }}
              style={{
                background: '#4a90d9', color: '#fff', border: 'none', borderRadius: '6px',
                padding: '8px 18px', fontWeight: '700', cursor: 'pointer', fontSize: '13px',
              }}
            >
              ✨ Use Template →
            </button>
          </div>
          <p style={{ fontSize: '12px', color: '#444', lineHeight: 1.6, fontFamily: 'inherit', margin: 0 }}>
            {selected.text}
          </p>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? '#e8f0fe' : '#fafafa',
        border: `2px solid ${selected ? '#4a90d9' : '#e8e8e8'}`,
        borderRadius: '8px', padding: '14px', cursor: 'pointer',
        textAlign: 'left', transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: '24px', marginBottom: '6px' }}>{template.icon}</div>
      <div style={{ fontSize: '13px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>{template.title}</div>
      <div style={{ fontSize: '11px', color: '#888' }}>{template.description}</div>
    </button>
  );
}
