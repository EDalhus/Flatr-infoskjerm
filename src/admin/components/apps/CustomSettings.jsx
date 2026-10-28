import { useEffect, useState } from 'react';
import { api } from '../../../lib/api.js';
import CustomAppView from '../../../viewer/slides/CustomAppView.jsx';
import { Icon, Field, Input, Button, Card, ErrorText } from '../ui.jsx';

// Innstillingene til en aktivert egen app: skjemaet lages fra feltene i
// manifestet. Hemmelige felt vises aldri igjen – bare om de er lagt inn.

export default function CustomSettings({ app, onSaved }) {
  const fields = app.definition?.settings || [];
  const [values, setValues] = useState(app.config?.settings || {});
  const [secrets, setSecrets] = useState({});
  const [secretKeys, setSecretKeys] = useState(app.config?.secret_keys || []);
  const [live, setLive] = useState(null);
  const [liveError, setLiveError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const loadLive = () =>
    api.apps
      .live(app.id)
      .then((d) => {
        setLive(d);
        setLiveError('');
      })
      .catch((e) => {
        setLive(null);
        setLiveError(e.message);
      });

  useEffect(() => {
    loadLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, app.updated_at]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const saved = await api.apps.update(app.id, { config: { settings: values }, secrets });
      setSecrets({});
      setSecretKeys(saved.config?.secret_keys || []);
      setNotice('Lagret.');
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card title="Verdier for kontoen din">
        {fields.length === 0 ? (
          <p className="m-0 text-sm text-muted">Appen trenger ingen innstillinger.</p>
        ) : (
          <form onSubmit={save} className="grid gap-4">
            {fields.map((f) =>
              f.type === 'secret' ? (
                <Field
                  key={f.key}
                  label={`${f.label}${f.required ? '' : ' (valgfritt)'}`}
                  hint={f.hint || (secretKeys.includes(f.key) ? 'Lagret og kryptert. Skriv inn en ny for å bytte.' : 'Lagres kryptert og vises aldri igjen.')}
                >
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={secrets[f.key] || ''}
                    placeholder={secretKeys.includes(f.key) ? '••••••••••••' : ''}
                    onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })}
                  />
                </Field>
              ) : (
                <Field key={f.key} label={`${f.label}${f.required ? '' : ' (valgfritt)'}`} hint={f.hint}>
                  <Input
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                </Field>
              )
            )}
            <ErrorText>{error}</ErrorText>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy}>
                <Icon name="check" className="h-4 w-4" />
                {busy ? 'Lagrer …' : 'Lagre innstillinger'}
              </Button>
              {notice && <span className="text-sm font-medium text-brand">{notice}</span>}
            </div>
          </form>
        )}
      </Card>

      <div className="space-y-2">
        <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-hair p-4 text-white" style={{ background: 'linear-gradient(135deg, #1f5566, #0f2733)', containerType: 'size' }}>
          {live ? (
            <CustomAppView template={live.template} display={live.display} items={live.items || []} color={app.definition?.color} />
          ) : (
            <div className="grid h-full place-items-center text-center text-sm opacity-80">{liveError || 'Henter data …'}</div>
          )}
        </div>
        <p className="m-0 text-xs text-muted">Forhåndsvisning med innstillingene som er lagret. Legg appen på et lysbilde med elementet «Flatr App» i editoren.</p>
      </div>
    </div>
  );
}
