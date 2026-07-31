import Link from "next/link";

export function SiteHeader({
  actions,
}: {
  actions?: React.ReactNode;
}) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        NoFake<span className="brand-tail">Tours</span>
      </Link>
      <nav className="nav">{actions}</nav>
    </header>
  );
}
