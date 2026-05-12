import { ExternalLink } from 'lucide-react';

/** zenbuapps GitHub Organization URL — 之前在 TopNav，移到 footer（issue #7） */
const GITHUB_ORG_URL = 'https://github.com/zenbuapps';

/**
 * 全站底部 Footer
 * 內容：版權字 + GitHub Org 外連
 * 出現在 AppShell main 區段的最底端（隨內容捲動）。
 */
const Footer = () => (
  <footer className="mt-auto flex flex-col items-center justify-between gap-2 border-t border-[--color-border] bg-white px-4 py-3 text-xs text-[--color-text-muted] sm:flex-row sm:px-6">
    <span>© Zenbu Apps · Zenbu Roadmaps</span>
    <a
      href={GITHUB_ORG_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[--color-text-muted] hover:text-[--color-brand]"
      aria-label="開啟 zenbuapps GitHub Organization"
    >
      <ExternalLink size={12} strokeWidth={2} />
      github.com/zenbuapps
    </a>
  </footer>
);

export default Footer;
