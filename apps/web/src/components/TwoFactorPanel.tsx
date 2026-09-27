import { useEffect, useState, type FormEvent } from 'react';
import type { TrustedDeviceDto, TwoFactorSetupDto, TwoFactorStatusDto } from '@streets/shared';
import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { useSession } from '../stores/session.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Field } from './Field.js';
import { Panel } from './Panel.js';

type Mode = 'idle' | 'password' | 'scan' | 'codes' | 'disable' | 'regenerate';

/** The recovery codes, shown once, with ways to keep them. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `StreetsEmpire recovery codes (each works once)\n\n${codes.join('\n')}\n`;
  const download = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
  return (
    <div className="se-2fa__codes">
      <p><strong>Save these recovery codes now.</strong> If you lose your phone, each one signs you in once. They will not be shown again.</p>
      <ol className="se-2fa__codelist">
        {codes.map((code) => <li key={code}><code>{code}</code></li>)}
      </ol>
      <div className="se-cta">
        <button
          type="button"
          className="se-btn se-btn--ghost se-btn--sm"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false));
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a className="se-btn se-btn--ghost se-btn--sm" href={download} download="streetsempire-recovery-codes.txt">Download</a>
        <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={onDone}>I have saved them</button>
      </div>
    </div>
  );
}

/** rc.4. Browsers that skip the code at sign-in ("Trust this browser"), each can be forgotten. */
function TrustedBrowsers() {
  const [devices, setDevices] = useState<TrustedDeviceDto[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setDevices((await authApi.trustedDevices()).devices);
    } catch {
      setDevices([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function forget(deviceId?: string) {
    setBusy(true);
    try {
      if (deviceId) await authApi.forgetTrustedDevice(deviceId);
      else await authApi.forgetTrustedDevices();
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!devices) return null;
  return (
    <div className="se-2fa__trusted">
      <h3 className="se-label">Trusted browsers</h3>
      {devices.length === 0 ? (
        <p className="se-hint">None. Tick "Trust this browser" when you enter a code to skip it there for 30 days.</p>
      ) : (
        <>
          <ul className="se-2fa__devices">
            {devices.map((device) => (
              <li key={device.id}>
                <span>
                  <strong>{device.current ? 'This browser' : device.userAgent?.slice(0, 60) ?? 'Unknown browser'}</strong>
                  <small className="se-hint"> · used {new Date(device.lastUsedAt).toLocaleDateString()} · until {new Date(device.expiresAt).toLocaleDateString()}</small>
                </span>
                <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy} onClick={() => void forget(device.id)}>Forget</button>
              </li>
            ))}
          </ul>
          {devices.length > 1 ? (
            <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy} onClick={() => void forget()}>Forget all</button>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * rc.3. Two-step sign-in with an authenticator app (Google Authenticator, Authy,
 * 1Password, Microsoft Authenticator...). Setup is scan, then confirm one code.
 */
export function TwoFactorPanel({ focusCodes = false }: { focusCodes?: boolean }) {
  const [status, setStatus] = useState<TwoFactorStatusDto | null>(null);
  const [mode, setMode] = useState<Mode>(focusCodes ? 'regenerate' : 'idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<TwoFactorSetupDto | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function refresh() {
    try {
      setStatus(await authApi.twoFactorStatus());
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function reset(next: Mode = 'idle') {
    setMode(next);
    setPassword('');
    setCode('');
    setFields({});
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    setFields({});
    try {
      await action();
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage({ tone: 'error', text: error.message });
        setFields(error.fields ?? {});
      } else {
        setMessage({ tone: 'error', text: 'Something went wrong. Try that again.' });
      }
    } finally {
      setBusy(false);
    }
  }

  const startSetup = (event?: FormEvent) => {
    event?.preventDefault();
    return run(async () => {
      setSetup(await authApi.setupTwoFactor(password || undefined));
      reset('scan');
    });
  };

  const confirm = (event: FormEvent) => {
    event.preventDefault();
    return run(async () => {
      const response = await authApi.enableTwoFactor(code.trim());
      useSession.setState({ account: response.account });
      setCodes(response.recoveryCodes);
      setSetup(null);
      reset('codes');
      await refresh();
    });
  };

  const disable = (event: FormEvent) => {
    event.preventDefault();
    return run(async () => {
      const response = await authApi.disableTwoFactor(code.trim());
      useSession.setState({ account: response.account });
      reset();
      setMessage({ tone: 'info', text: response.message });
      await refresh();
    });
  };

  const regenerate = (event: FormEvent) => {
    event.preventDefault();
    return run(async () => {
      const response = await authApi.regenerateRecoveryCodes(code.trim());
      setCodes(response.recoveryCodes);
      reset('codes');
      await refresh();
    });
  };

  const codeField = (
    <Field
      label="Code from your authenticator app"
      name="twoFactorCode"
      value={code}
      onChange={(event) => setCode(event.target.value)}
      autoComplete="one-time-code"
      inputMode="numeric"
      maxLength={12}
      required
      error={fields.code}
      hint={mode === 'scan' ? undefined : 'Or one of your recovery codes.'}
    />
  );
  const needCode = busy ? 'Working...' : code.trim().length < 6 ? 'Enter the 6-digit code first.' : null;

  return (
    <Panel title="Two-step sign-in">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {mode === 'codes' ? (
        <RecoveryCodes codes={codes} onDone={() => { setCodes([]); reset(); }} />
      ) : status?.enabled ? (
        <>
          <p>
            <strong>On.</strong> Signing in asks for a code from your authenticator app, after your password or Discord.
            {' '}{status.recoveryCodesLeft} recovery code{status.recoveryCodesLeft === 1 ? '' : 's'} left.
          </p>
          {status.recoveryCodesLeft <= 3 ? <p className="se-hint">You are running low on recovery codes. Make new ones.</p> : null}
          {mode === 'disable' || mode === 'regenerate' ? (
            <form onSubmit={mode === 'disable' ? disable : regenerate} noValidate>
              {codeField}
              <div className="se-cta">
                <button type="button" className="se-btn se-btn--ghost" onClick={() => reset()}>Cancel</button>
                <Button className={`se-btn ${mode === 'disable' ? 'se-btn--danger' : 'se-btn--primary'}`} disabledReason={needCode}>
                  {mode === 'disable' ? 'Turn off two-step sign-in' : 'Make new recovery codes'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="se-cta">
              <button type="button" className="se-btn se-btn--ghost" onClick={() => reset('regenerate')}>New recovery codes</button>
              <button type="button" className="se-btn se-btn--ghost" onClick={() => reset('disable')}>Turn off</button>
            </div>
          )}
          <TrustedBrowsers />
        </>
      ) : mode === 'scan' && setup ? (
        <form onSubmit={confirm} noValidate>
          <ol className="se-2fa__steps">
            <li>Open an authenticator app (Google Authenticator, Authy, 1Password, Microsoft Authenticator...) and add an account.</li>
            <li>Scan this code, or type the key below.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <img className="se-2fa__qr" alt="QR code to add StreetsEmpire to your authenticator app" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}`} width={200} height={200} />
          <p className="se-hint">Key: <code className="se-2fa__secret">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code></p>
          <p className="se-hint">On this phone? <a href={setup.otpauthUrl}>Open it in your authenticator app</a>.</p>
          {codeField}
          <div className="se-cta">
            <button type="button" className="se-btn se-btn--ghost" onClick={() => { setSetup(null); reset(); }}>Cancel</button>
            <Button className="se-btn se-btn--primary" disabledReason={needCode}>Turn on</Button>
          </div>
        </form>
      ) : mode === 'password' ? (
        <form onSubmit={startSetup} noValidate>
          <Field
            label="Password"
            name="twoFactorPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            error={fields.currentPassword}
            hint="Signed in with Discord this time? You can leave this empty."
          />
          <div className="se-cta">
            <button type="button" className="se-btn se-btn--ghost" onClick={() => reset()}>Cancel</button>
            <Button className="se-btn se-btn--primary" disabledReason={busy ? 'Working...' : null}>Continue</Button>
          </div>
        </form>
      ) : (
        <>
          <p>
            <strong>Off.</strong> Add a code from an authenticator app to every sign-in, so a stolen password is not enough
            to get into your account.
          </p>
          <button type="button" className="se-btn se-btn--primary" onClick={() => reset('password')} disabled={!status}>Set up an authenticator app</button>
        </>
      )}
    </Panel>
  );
}
