import { Link } from 'react-router-dom';
import { ADMIN_SECTIONS, isCurrent, type NavSection } from '../layouts/gameNav.js';

const PURPOSES: Record<string, string> = {
  'admin-operations': 'Run seasons and live systems',
  'admin-players': 'Inspect and moderate accounts',
  'admin-economy': 'Review money and markets',
  'admin-content': 'Publish player-facing content',
  'admin-monitoring': 'Watch health and audit actions',
};

/** `sections` is what the viewer's staff role may open; all of them by default. */
export function AdminWorkspace({ pathname, sections = ADMIN_SECTIONS }: { pathname: string; sections?: readonly NavSection[] }) {
  const activeSection = sections.find((section) => section.pages.some((page) => isCurrent(page, pathname)));
  const tools = sections.flatMap((section) => section.pages.map((page) => ({ section, page })));
  return (
    <nav className="se-admin-workspace" aria-label="Admin workspace">
      <div className="se-admin-workspace__intro" aria-hidden="true">
        <strong>Admin workspace</strong>
        <span>Restricted operator tools</span>
      </div>
      <div className="se-admin-workspace__rail">
        {sections.map((section) => {
          const active = section.pages.some((page) => isCurrent(page, pathname));
          const destination = section.pages[0]!;
          return (
            <Link
              key={section.id}
              to={destination.to}
              className={`se-admin-workspace__link${active ? ' se-admin-workspace__link--active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <strong>{section.title.replace('Admin · ', '')}</strong>
              <span>{PURPOSES[section.id]}</span>
            </Link>
          );
        })}
      </div>
      <details className="se-admin-workspace__tools">
        <summary>All admin tools{activeSection ? ` · ${activeSection.title.replace('Admin · ', '')}` : ''}</summary>
        <div className="se-admin-workspace__tool-list">
          {tools.map(({ section, page }) => (
            <Link key={page.key} to={page.to} className={isCurrent(page, pathname) ? 'se-admin-workspace__tool--active' : undefined}>
              <span>{page.label}</span>
              <small>{section.title.replace('Admin · ', '')}</small>
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
