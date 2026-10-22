// 恢复确认 PAGE-RECOVER（FLOW-RECOVER）：输入恢复码 → 查找 → 列出云端有哪些游戏 → 确认取回，跳到游戏库。
// 从存档页的入口或 #recover= 链接打开；链接只把恢复码填好，等玩家自己点查找与确认。
import { useId, useRef, useState, type FormEvent } from 'react';
import { gameById } from '../../catalog';
import { Button, Sheet } from '../../ui';
import { copy } from '../copy';
import { fmtPlay } from '../format';
import { go } from '../route';
import { useServices, useSnapshot, type RecoverLookup } from '../services';
import { useAppToast } from '../toast';
import './RecoverSheet.css';

const R = copy.recover;

type Found = Extract<RecoverLookup, { ok: true }>;

export interface RecoverSheetProps {
  open: boolean;
  /** 打开时填进输入框的恢复码 */
  initialCode: string;
  onOpenChange(open: boolean): void;
}

export function RecoverSheet({ open, initialCode, onOpenChange }: RecoverSheetProps) {
  const services = useServices();
  const { stats, cloud } = useSnapshot();
  const toast = useAppToast();
  const [code, setCode] = useState(initialCode);
  const [found, setFound] = useState<Found | null>(null);
  const [err, setErr] = useState<{ text: string; invalid: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const errId = useId();

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await services.recoverLookup(code);
      if (r.ok) {
        setFound(r);
        return;
      }
      setErr(r.why === 'format' ? { text: R.errLength, invalid: true }
        : r.why === 'unknown' ? { text: R.errUnknown, invalid: true }
        : r.why === 'own' ? { text: R.sameCode, invalid: false }
        : { text: R.errNetwork, invalid: false });
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!found || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await services.recoverAdopt(found.saveId, found.code);
      if (r.ok) {
        onOpenChange(false);
        toast.say(R.done(r.restored));
        go('library');
        return;
      }
      setErr({
        text: r.why === 'expired' ? R.errGone : r.why === 'unavailable' ? R.errUnavailable : r.why === 'storage' ? R.errStorage : R.errNetwork,
        invalid: false,
      });
    } finally {
      setBusy(false);
    }
  };

  const games = found?.games.filter(x => gameById(x.g)) ?? [];
  const both = games.some(x => stats[x.g]?.seconds);
  const errLine = <p className="app-err" id={errId} role="alert">{err?.text}</p>;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={R.title}
      description={found ? undefined : R.intro}
      initialFocusRef={found ? undefined : input}
      footer={found ? (
        <>
          <Button variant="primary" loading={busy} onClick={confirm}>{busy ? R.adopting : R.confirm}</Button>
          <Button onClick={() => { setFound(null); setErr(null); }}>{R.back}</Button>
          <Button variant="text" onClick={() => onOpenChange(false)}>{R.cancel}</Button>
        </>
      ) : undefined}
    >
      {found ? (
        <div className="app-recover">
          <h3>{R.confirmTitle}</h3>
          <p>{games.length ? R.confirmIntro(games.length) : R.confirmEmpty}</p>
          {games.length > 0 && (
            <ul role="list" className="app-recover-games">
              {games.map(x => {
                const local = stats[x.g]?.seconds;
                return (
                  <li key={x.g}>
                    <b>{gameById(x.g)!.title}</b>
                    <span>{local ? R.bothSides(fmtPlay(x.s), fmtPlay(local)) : R.cloudSide(fmtPlay(x.s))}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {both && <p className="app-muted">{R.keepLonger}</p>}
          {cloud && <p className="app-muted">{R.switchAccount}</p>}
          {errLine}
        </div>
      ) : (
        <form className="app-recover" noValidate onSubmit={lookup}>
          <label className="app-fine" htmlFor="recover-code">{R.fieldLabel}</label>
          <div className="app-field app-recover-field state-layer focus-ring is-field">
            <input
              id="recover-code"
              ref={input}
              value={code}
              placeholder={R.placeholder}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="search"
              aria-describedby={errId}
              aria-invalid={err?.invalid || undefined}
              onChange={e => { setCode(e.target.value); setErr(null); }}
            />
          </div>
          {errLine}
          <Button type="submit" variant="primary" block loading={busy}>{busy ? R.looking : R.lookup}</Button>
        </form>
      )}
    </Sheet>
  );
}
