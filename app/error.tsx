'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="ended">
      <div className="ended-card">
        <h1>Something went wrong</h1>
        <p className="muted">Reload the page. If it keeps happening, start a new meeting.</p>
        <div className="row-gap center">
          <button className="btn-primary" type="button" onClick={reset}>
            Try again
          </button>
          <a className="btn-ghost" href="/">
            Home
          </a>
        </div>
      </div>
    </main>
  );
}
