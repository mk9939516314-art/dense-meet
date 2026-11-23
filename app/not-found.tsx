import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="ended">
      <div className="ended-card">
        <h1>Page not found</h1>
        <p className="muted">This page does not exist. Meeting links look like abc-defg-hij.</p>
        <Link className="btn-primary" href="/">
          Back to home
        </Link>
      </div>
    </main>
  );
}
