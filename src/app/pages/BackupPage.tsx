// 存档 PAGE-BACKUP：云存档卡、存档码备份卡、存档码恢复卡。后两张的文案、两步确认与错误提示逐字沿用旧版 renderBackup（dd731d6）。
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { gameById } from '../../catalog';
import type { SavePackV1 } from '../../shared';
import { Button, ButtonLink, Card, Icon, LargeTitle } from '../../ui';
import { copyText } from '../clipboard';
import { RecoveryCode } from '../components/bits';
import { copy } from '../copy';
import { fmtExportTime, fmtFileDay, fmtPlay, fmtWhen } from '../format';
import * as icons from '../icons';
import { go } from '../route';
import { useServices, useSnapshot, type CloudView } from '../services';
import { useAppUi } from '../state';
import { useAppToast } from '../toast';
import './BackupPage.css';

const B = copy.backup;
const titlesOf = (ids: string[]) => B.titles(ids.flatMap(id => gameById(id)?.title ?? []));

type Packed =
  | { kind: 'packing' }
  | { kind: 'failed' }
  | { kind: 'done'; pack: SavePackV1; have: string[]; code: string };

export function BackupPage() {
  const { cloud } = useSnapshot();
  const packed = usePacked();
  return (
    <div className="app-page app-page-tight app-page-narrow app-backup">
      <LargeTitle title={B.title} subtitle={cloud ? B.introCloud : B.intro} />
      <CloudCard cloud={cloud} />
      <BackupCard packed={packed} />
      <RestoreCard packed={packed} />
    </div>
  );
}

// 打开存档页时整理一次本机进度（旧版每次进存档页都重新打包）
function usePacked(): Packed {
  const services = useServices();
  const [packed, setPacked] = useState<Packed>({ kind: 'packing' });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const pack = await services.packSaves();
        const have = Object.keys(pack.saves);
        const code = have.length ? await services.encodeSaves(pack) : '';
        if (live) setPacked({ kind: 'done', pack, have, code });
      } catch {
        if (live) setPacked({ kind: 'failed' });
      }
    })();
    return () => { live = false; };
  }, [services]);
  return packed;
}

// 云存档卡（§13 存档页）：没开通时说明会自动开通；开通后给四段恢复码、复制、上次同步与输入恢复码入口
function CloudCard({ cloud }: { cloud: CloudView | null }) {
  const { openRecover } = useAppUi();
  const toast = useAppToast();
  const C = copy.cloud;
  const copyCode = async () => {
    if (!cloud) return;
    if (await copyText(cloud.code.match(/.{1,4}/g)!.join('-'))) toast.say(C.codeCopied);
    else toast.bad(C.copyFailed);
  };
  const tooBig = cloud ? cloud.tooBig.flatMap(id => gameById(id)?.title ?? []) : [];
  return (
    <Card title={C.cardTitle} subtitle={C.localOnly}>
      <div className="app-cloud">
        {cloud ? (
          <>
            <div className="app-cloud-code">
              <span className="app-fine">{C.codeLabel}</span>
              <RecoveryCode code={cloud.code} />
            </div>
            <div className="app-acts"><Button variant="primary" icon={<Icon src={icons.copy} size="sm" />} onClick={copyCode}>{C.copyCode}</Button></div>
            <p className="app-muted">{C.lastSync} {cloud.lastSyncAt ? fmtWhen(cloud.lastSyncAt) : C.neverSynced}</p>
            {cloud.stopped && <p className="app-err">{C.stopped}</p>}
            {tooBig.length > 0 && (
              <ul role="list" className="app-cloud-big">
                {tooBig.map(t => <li key={t}><b>{t}</b><span>{C.tooBig}</span></li>)}
              </ul>
            )}
          </>
        ) : (
          <p>{C.notYet}</p>
        )}
        <div className="app-acts"><Button onClick={() => openRecover()}>{C.enterCode}</Button></div>
      </div>
    </Card>
  );
}

// 备份卡：本机有进度的游戏、存档码、复制与下载
function BackupCard({ packed }: { packed: Packed }) {
  const services = useServices();
  const toast = useAppToast();
  const out = useRef<HTMLTextAreaElement>(null);

  const body = (() => {
    if (packed.kind === 'packing') return <p className="app-muted" role="status">{B.packing}</p>;
    if (packed.kind === 'failed') return <p className="app-err" role="alert">{B.packFailed}</p>;
    const { pack, have, code } = packed;
    if (!have.length) {
      return (
        <>
          <p className="app-muted">{B.noProgress}</p>
          <div className="app-acts"><ButtonLink href="#store">{B.noProgressAction}</ButtonLink></div>
        </>
      );
    }
    const onCopy = async () => {
      if (await copyText(code, out.current)) {
        services.track({ t: 'backup' });
        toast.say(B.copied);
      } else toast.bad(B.copyFailed);
    };
    const onDownload = () => {
      services.track({ t: 'backup' });
      const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
      Object.assign(document.createElement('a'), { href: url, download: B.fileName(fmtFileDay()) }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return (
      <>
        <ul role="list" className="app-bk-list">
          {have.map(id => {
            const st = pack.stats[id];
            return <li key={id}>{gameById(id)?.title}<span>{fmtPlay(st?.seconds || 0)}{st?.status ? ' · ' + st.status : ''}</span></li>;
          })}
        </ul>
        <label className="sr-only" htmlFor="bk-out">{B.codeLabel}</label>
        <div className="app-field app-code-field state-layer focus-ring is-field">
          <textarea id="bk-out" ref={out} rows={3} readOnly value={code} />
        </div>
        <div className="app-acts">
          <Button variant="primary" icon={<Icon src={icons.copy} size="sm" />} onClick={onCopy}>{B.copy}</Button>
          <Button icon={<Icon src={icons.download} size="sm" />} onClick={onDownload}>{B.download}</Button>
        </div>
        <p className="app-fine">{B.codeNote(code.length.toLocaleString('zh-CN'))}</p>
      </>
    );
  })();

  return <Card title={B.packTitle}><div className="app-bk">{body}</div></Card>;
}

// 恢复卡：粘贴或选文件 → 解码校验 → 说明导出时间与会被替换的游戏 → 确认后逐款替换，跳到游戏库。
// 「会被替换」要等本机进度整理完才算得出来，整理完之前主按钮转圈，读不出本机存档时不能恢复
function RestoreCard({ packed }: { packed: Packed }) {
  const services = useServices();
  const toast = useAppToast();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<SavePackV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const submit = useRef<HTMLButtonElement>(null);

  const fail = (msg: string) => {
    setPending(null);
    setErr(msg);
    input.current?.focus();
  };

  const check = async (raw: string) => {
    if (!raw.trim()) return fail(B.errEmpty);
    let got: SavePackV1;
    try {
      got = await services.decodeSaves(raw);
    } catch (x) {
      return fail((x as Error).message === 'old' ? B.errOld : B.errBad);
    }
    const ids = Object.keys(got.saves).filter(id => gameById(id));
    if (!ids.length) return fail(B.errNone);
    setErr('');
    setPending(got);
    requestAnimationFrame(() => submit.current?.focus());
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || packed.kind !== 'done') return;
    setBusy(true);
    try {
      if (!pending) return await check(text);
      let n: number;
      try {
        n = await services.applySaves(pending);
      } catch {
        return fail(B.errWrite);
      }
      services.track({ t: 'restore' });
      toast.say(B.restored(n));
      go('library');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    f.text().then(t => {
      const v = t.trim();
      setText(v);
      setErr('');
      void check(v);
    }, () => fail(B.errFile));
  };

  const have = packed.kind === 'done' ? packed.have : [];
  const ids = pending ? Object.keys(pending.saves).filter(id => gameById(id)) : [];
  const over = ids.filter(id => have.includes(id));

  return (
    <Card title={B.restoreTitle}>
      <form className="app-bk" noValidate onSubmit={onSubmit}>
        <p className="app-muted">{B.restoreText}</p>
        <label className="sr-only" htmlFor="bk-in">{B.codeLabel}</label>
        <div className="app-field app-code-field state-layer focus-ring is-field">
          <textarea
            id="bk-in"
            ref={input}
            rows={3}
            placeholder={B.placeholder}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="bk-err"
            aria-invalid={err ? true : undefined}
            value={text}
            onChange={e => {
              setText(e.target.value);
              setErr('');
              setPending(null);
            }}
          />
        </div>
        <p className="app-err" id="bk-err" role="alert">{err}</p>
        <div className="app-acts">
          <Button ref={submit} type="submit" variant="primary" loading={busy || packed.kind === 'packing'} disabled={packed.kind === 'failed'}>{pending ? B.confirm : B.restore}</Button>
          {pending ? (
            <Button variant="text" onClick={() => { setPending(null); input.current?.focus(); }}>{B.cancel}</Button>
          ) : (
            <Button icon={<Icon src={icons.fileUp} size="sm" />} onClick={() => file.current?.click()}>{B.pickFile}</Button>
          )}
          <input
            ref={file}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={e => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        {pending && (
          <div className="app-note" tabIndex={-1}>
            <p>{B.askExport(fmtExportTime(pending.at), titlesOf(ids))}{over.length ? B.askOverwrite(titlesOf(over)) : ''}</p>
          </div>
        )}
      </form>
    </Card>
  );
}
