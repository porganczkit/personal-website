import { useEffect, useState } from 'react';

const navLinks = [
  { label: 'Bio', href: '#bio' },
  { label: 'Timeline', href: '#timeline' },
  { label: 'Projects', href: '#projects' },
  { label: "Let's Talk", href: 'mailto:ptibor@cantab.net', external: true },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Highlight the nav link for whichever section is at the viewport center.
  useEffect(() => {
    const sections = ['bio', 'timeline', 'projects']
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!sections.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveId(e.target.id);
        });
      },
      { rootMargin: '-50% 0px -50% 0px' }
    );
    sections.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    external?: boolean
  ) => {
    if (external) return;
    e.preventDefault();
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-400 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-md shadow-sm'
          : 'bg-white/80 backdrop-blur-sm'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo — intentionally empty; keeps layout balance */}
        <div />

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => {
            const isActive = !link.external && link.href === `#${activeId}`;
            if (link.label === "Let's Talk") {
              return (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href, link.external)}
                  className="text-sm font-light tracking-wide text-gray-700 transition-colors border border-gray-300 px-4 py-1.5 hover:border-gray-700 hover:bg-gray-900 hover:text-white"
                >
                  {link.label}
                </a>
              );
            }
            return (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href, link.external)}
                className={`relative text-sm font-light tracking-wide transition-colors after:absolute after:left-0 after:-bottom-1 after:h-px after:w-full after:origin-left after:bg-gold-500 after:transition-transform after:duration-300 ${
                  isActive
                    ? 'text-gold-600 after:scale-x-100'
                    : 'text-gray-700 hover:text-gold-600 after:scale-x-0 hover:after:scale-x-100'
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-gray-700"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-px bg-current mb-1 transition-transform ${menuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
          <span className={`block w-5 h-px bg-current mb-1 transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-px bg-current transition-transform ${menuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 flex flex-col gap-4">
          {navLinks.map((link) => {
            const isActive = !link.external && link.href === `#${activeId}`;
            return (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href, link.external)}
                className={`text-sm font-light tracking-wide py-1 transition-colors hover:text-gold-600 ${
                  isActive ? 'text-gold-600' : 'text-gray-700'
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </div>
      )}
    </nav>
  );
}
