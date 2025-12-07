// src/App.jsx
import './App.css';
import './index.css';

function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#050816',
        color: '#e6eef8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px',
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>
        MYCASH React + Reown AppKit (Core)
      </h1>

      {/* AppKit web component button */}
      <appkit-button label="Connect Wallet"></appkit-button>

      <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '12px' }}>
        When you click the button, the wallet list modal should open.
      </p>
    </div>
  );
}

export default App;
