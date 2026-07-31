import Link from "next/link";

export function SiteHeader({
  actions,
}: {
  actions?: React.ReactNode;
}) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        verified tours
      </Link>
      <nav className="nav">{actions}</nav>
    </header>
  );
}
