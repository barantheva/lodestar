import { DASHBOARD_CSS } from '../../../../shared/ui/styles.ts';
import { escapeHtml } from '../../../../shared/utils/escape-html.ts';

const BRAND_MARK_LARGE = `<svg viewBox="0 0 512 512" width="48" height="48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(256, 256)">
    <circle r="160" stroke="#38bdf8" stroke-width="8" stroke-opacity="0.2" stroke-dasharray="16 16"/>
    <circle r="95" stroke="#818cf8" stroke-width="8" stroke-opacity="0.3"/>
    <path d="M 0,-210 L 38,0 L 0,0 Z" fill="#38bdf8"/>
    <path d="M 0,-210 L -38,0 L 0,0 Z" fill="#0284c7"/>
    <path d="M 0,210 L 38,0 L 0,0 Z" fill="#818cf8"/>
    <path d="M 0,210 L -38,0 L 0,0 Z" fill="#4f46e5"/>
    <path d="M 210,0 L 0,38 L 0,0 Z" fill="#38bdf8"/>
    <path d="M 210,0 L 0,-38 L 0,0 Z" fill="#0284c7"/>
    <path d="M -210,0 L 0,38 L 0,0 Z" fill="#818cf8"/>
    <path d="M -210,0 L 0,-38 L 0,0 Z" fill="#4f46e5"/>
    <circle r="18" fill="#ffffff"/>
  </g>
</svg>`;

export interface LoginPageOptions {
  error?: string;
  returnUrl?: string;
}

export function renderLoginPage(opts: LoginPageOptions = {}): string {
  const errorHtml = opts.error
    ? `<div style="background: rgba(248, 81, 73, 0.15); border: 1px solid rgba(248, 81, 73, 0.4); color: #ffa198; padding: 10px 14px; border-radius: 6px; font-size: 12px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
        <span>⚠️</span> <span>${escapeHtml(opts.error)}</span>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In — Lodestar</title>
  <style>
    ${DASHBOARD_CSS}
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #090d13;
      margin: 0;
      padding: 20px;
    }
    .login-box {
      width: 100%;
      max-width: 400px;
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 32px 28px;
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.6);
    }
    .login-header {
      text-align: center;
      margin-bottom: 24px;
    }
    .login-header h1 {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-white);
      margin: 12px 0 4px;
    }
    .login-header p {
      font-size: 12px;
      color: var(--text-muted);
      margin: 0;
    }
    .form-group {
      margin-bottom: 18px;
    }
    .form-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-white);
      margin-bottom: 6px;
    }
    .form-control {
      width: 100%;
      box-sizing: border-box;
      background: #010409;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
      color: var(--text-white);
      outline: none;
      font-family: inherit;
      transition: border-color 0.2s;
    }
    .form-control:focus {
      border-color: #58a6ff;
      box-shadow: 0 0 0 1px #58a6ff;
    }
    .submit-btn {
      width: 100%;
      background: #238636;
      border: 1px solid rgba(240, 246, 252, 0.1);
      color: #ffffff;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 8px;
    }
    .submit-btn:hover {
      background: #2ea043;
    }
    .hint-box {
      margin-top: 20px;
      padding: 10px 12px;
      background: rgba(56, 139, 253, 0.08);
      border: 1px solid rgba(56, 139, 253, 0.2);
      border-radius: 6px;
      font-size: 11px;
      color: #79c0ff;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="login-box">
    <div class="login-header">
      <div>${BRAND_MARK_LARGE}</div>
      <h1>Lodestar Operations</h1>
      <p>Autonomous Spec-Driven Software Factory</p>
    </div>

    ${errorHtml}

    <form method="POST" action="/login">
      <input type="hidden" name="returnUrl" value="${escapeHtml(opts.returnUrl || '/stats')}">

      <div class="form-group">
        <label for="username">Username</label>
        <input class="form-control" type="text" id="username" name="username" placeholder="admin" required autofocus>
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input class="form-control" type="password" id="password" name="password" placeholder="••••••••" required>
      </div>

      <button type="submit" class="submit-btn">Sign in to Lodestar</button>
    </form>

    <div style="display: flex; gap: 8px; margin-top: 14px;">
      <button type="button" class="action-btn" style="flex: 1;" onclick="document.getElementById('username').value='admin';document.getElementById('password').value='admin';">🔑 Quick-fill admin</button>
      <button type="button" class="action-btn" style="flex: 1;" onclick="document.getElementById('username').value='developer';document.getElementById('password').value='developer';">🔑 Quick-fill developer</button>
    </div>

    <div class="hint-box">
      🔑 Initial credentials: <strong>admin</strong> / <strong>admin</strong> &middot; <strong>developer</strong> / <strong>developer</strong>
    </div>
  </div>
</body>
</html>`;
}
