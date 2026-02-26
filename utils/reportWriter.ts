import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from './linkDiscovery';

export type UrlPageCheck = {
  url: string;
  status: number | null;
  finalUrl: string;
  result: 'PASS' | 'FAIL';
  reason: string;
};

export type FooterLinkCheck = {
  sourcePageUrl: string;
  linkText: string;
  href: string;
  status: number | null;
  finalUrl: string;
  result: 'PASS' | 'FAIL';
  reason: string;
};

export type MobileCheck = {
  url: string;
  status: number | null;
  finalUrl: string;
  result: 'PASS' | 'FAIL';
  reason: string;
  viewportWidth: number;
  scrollWidth: number;
  hasHorizontalScroll: boolean;
  offscreenElementsCount: number;
  menuOpened: boolean;
  screenshotPath: string;
  notes: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildFilterScript(tableId: string): string {
  return `
  <script>
    const filterSelect_${tableId} = document.getElementById('filter-${tableId}');
    const rows_${tableId} = document.querySelectorAll('#${tableId} tbody tr');
    filterSelect_${tableId}.addEventListener('change', () => {
      const selected = filterSelect_${tableId}.value;
      rows_${tableId}.forEach((row) => {
        const state = row.getAttribute('data-result');
        row.style.display = (selected === 'ALL' || state === selected) ? '' : 'none';
      });
    });
  </script>`;
}

function baseHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Segoe UI, sans-serif; margin: 20px; background: #f7f9fc; color: #1f2937; }
    h1, h2 { margin: 0 0 12px; }
    .card { background: #fff; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; position: sticky; top: 0; }
    tr[data-result='PASS'] td.result { color: #15803d; font-weight: 600; }
    tr[data-result='FAIL'] td.result { color: #b91c1c; font-weight: 700; }
    .controls { margin-bottom: 10px; }
    .summary span { display: inline-block; margin-right: 12px; font-weight: 600; }
    a { color: #1d4ed8; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export function writeUrlVerificationReport(
  htmlPath: string,
  jsonPath: string,
  payload: { pagesChecked: UrlPageCheck[]; footerLinksChecked: FooterLinkCheck[] }
): void {
  ensureDir(path.dirname(htmlPath));
  ensureDir(path.dirname(jsonPath));

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');

  const passPages = payload.pagesChecked.filter((x) => x.result === 'PASS').length;
  const failPages = payload.pagesChecked.length - passPages;
  const passFooter = payload.footerLinksChecked.filter((x) => x.result === 'PASS').length;
  const failFooter = payload.footerLinksChecked.length - passFooter;

  const pageRows = payload.pagesChecked
    .map(
      (row) => `<tr data-result="${row.result}">
      <td>${escapeHtml(row.url)}</td>
      <td>${row.status ?? 'N/A'}</td>
      <td>${escapeHtml(row.finalUrl)}</td>
      <td class="result">${row.result}</td>
      <td>${escapeHtml(row.reason)}</td>
    </tr>`
    )
    .join('\n');

  const footerRows = payload.footerLinksChecked
    .map(
      (row) => `<tr data-result="${row.result}">
      <td>${escapeHtml(row.sourcePageUrl)}</td>
      <td>${escapeHtml(row.linkText)}</td>
      <td>${escapeHtml(row.href)}</td>
      <td>${row.status ?? 'N/A'}</td>
      <td>${escapeHtml(row.finalUrl)}</td>
      <td class="result">${row.result}</td>
      <td>${escapeHtml(row.reason)}</td>
    </tr>`
    )
    .join('\n');

  const html = baseHtml(
    'Falaya URL Verification Report',
    `
    <div class="card">
      <h1>Falaya URL verification</h1>
      <div class="summary">
        <span>Total pages: ${payload.pagesChecked.length}</span>
        <span>Page PASS: ${passPages}</span>
        <span>Page FAIL: ${failPages}</span>
        <span>Total footer links: ${payload.footerLinksChecked.length}</span>
        <span>Footer PASS: ${passFooter}</span>
        <span>Footer FAIL: ${failFooter}</span>
      </div>
    </div>

    <div class="card">
      <h2>Pages Checked</h2>
      <div class="controls">
        <label>Filter:
          <select id="filter-pages">
            <option value="ALL">All</option>
            <option value="PASS">PASS only</option>
            <option value="FAIL">FAIL only</option>
          </select>
        </label>
      </div>
      <table id="pages">
        <thead>
          <tr><th>URL</th><th>Status</th><th>Final URL</th><th>Result</th><th>Reason</th></tr>
        </thead>
        <tbody>
          ${pageRows}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Footer Links Checked</h2>
      <div class="controls">
        <label>Filter:
          <select id="filter-footer">
            <option value="ALL">All</option>
            <option value="PASS">PASS only</option>
            <option value="FAIL">FAIL only</option>
          </select>
        </label>
      </div>
      <table id="footer">
        <thead>
          <tr><th>Source Page</th><th>Link Text</th><th>Href</th><th>Status</th><th>Final URL</th><th>Result</th><th>Reason</th></tr>
        </thead>
        <tbody>
          ${footerRows}
        </tbody>
      </table>
    </div>
    ${buildFilterScript('pages')}
    ${buildFilterScript('footer')}
    `
  );

  fs.writeFileSync(htmlPath, html, 'utf-8');
}

export function writeMobileResponsiveReport(
  htmlPath: string,
  jsonPath: string,
  payload: { mobileChecks: MobileCheck[] }
): void {
  ensureDir(path.dirname(htmlPath));
  ensureDir(path.dirname(jsonPath));

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');

  const pass = payload.mobileChecks.filter((x) => x.result === 'PASS').length;
  const fail = payload.mobileChecks.length - pass;

  const rows = payload.mobileChecks
    .map(
      (row) => `<tr data-result="${row.result}">
      <td>${escapeHtml(row.url)}</td>
      <td>${row.status ?? 'N/A'}</td>
      <td>${escapeHtml(row.finalUrl)}</td>
      <td class="result">${row.result}</td>
      <td>${escapeHtml(row.reason)}</td>
      <td>${row.viewportWidth}</td>
      <td>${row.scrollWidth}</td>
      <td>${String(row.hasHorizontalScroll)}</td>
      <td>${row.offscreenElementsCount}</td>
      <td>${String(row.menuOpened)}</td>
      <td>${escapeHtml(row.notes)}</td>
      <td><a href="${escapeHtml(row.screenshotPath)}">Screenshot</a></td>
    </tr>`
    )
    .join('\n');

  const html = baseHtml(
    'Falaya Mobile Responsive Report',
    `
    <div class="card">
      <h1>Falaya mobile responsive</h1>
      <div class="summary">
        <span>Total: ${payload.mobileChecks.length}</span>
        <span>PASS: ${pass}</span>
        <span>FAIL: ${fail}</span>
      </div>
    </div>

    <div class="card">
      <div class="controls">
        <label>Filter:
          <select id="filter-mobile">
            <option value="ALL">All</option>
            <option value="PASS">PASS only</option>
            <option value="FAIL">FAIL only</option>
          </select>
        </label>
      </div>
      <table id="mobile">
        <thead>
          <tr>
            <th>URL</th><th>Status</th><th>Final URL</th><th>Result</th><th>Reason</th>
            <th>Viewport</th><th>ScrollWidth</th><th>Horizontal Scroll</th><th>Offscreen Elements</th>
            <th>Menu Opened</th><th>Notes</th><th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
    ${buildFilterScript('mobile')}
    `
  );

  fs.writeFileSync(htmlPath, html, 'utf-8');
}