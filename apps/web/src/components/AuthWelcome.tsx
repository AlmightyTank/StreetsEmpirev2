import { Link } from 'react-router-dom';

/** Shared, mobile-first welcome masthead for sign in and account creation. */
export function AuthWelcome({ mode }: { mode: 'login' | 'register' }) {
  const registering = mode === 'register';

  return (
    <header className="se-authwelcome">
      <div className="se-authwelcome__art" aria-hidden="true">
        <div className="se-authwelcome__moon" />
        <div className="se-authwelcome__skyline se-authwelcome__skyline--back" />
        <div className="se-authwelcome__skyline se-authwelcome__skyline--front" />
        <div className="se-authwelcome__street" />
        <img src="/icons/icon-maskable-512.png" alt="" />
        <span className="se-authwelcome__stamp">STREET<br />EMPIRE</span>
      </div>
      <p className="se-authwelcome__eyebrow">{registering ? 'Your story starts here' : 'Good to see you again'}</p>
      <h1>{registering ? 'Claim your place.' : 'Back to the block.'}</h1>
      <p className="se-authwelcome__copy">Build your crew. Take your city. Make your name mean something.</p>
      <nav className="se-authwelcome__switch" aria-label="Account access">
        <Link to="/register" aria-current={registering ? 'page' : undefined} className={registering ? 'is-active' : ''}>Create account</Link>
        <Link to="/login" aria-current={!registering ? 'page' : undefined} className={!registering ? 'is-active' : ''}>Sign in</Link>
      </nav>
    </header>
  );
}
