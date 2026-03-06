import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log("[Index] Script execution started");
const rootElement = document.getElementById('root');
console.log("[Index] Root element found:", !!rootElement);

if (!rootElement) {
  console.error("[Index] CRITICAL: Could not find root element!");
  throw new Error("Could not find root element to mount to");
}

console.log("[Index] Creating root...");
const root = ReactDOM.createRoot(rootElement);
console.log("[Index] Calling root.render...");
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
console.log("[Index] Render called completed.");