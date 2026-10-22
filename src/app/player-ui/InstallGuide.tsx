// iPhone 引导添加到主屏幕（§13 全屏与引导）：主屏幕上的 shoota 读不到 Safari 里的存档，先给恢复码与复制按钮，再给四步。
import { Button, Sheet } from '../../ui';
import { copyText } from '../clipboard';
import { RecoveryCode } from '../components/bits';
import { extra } from '../player/copy';
import { useAppToast } from '../toast';

export interface InstallGuideProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** 云存档恢复码；还没开通时为 null */
  code: string | null;
}

export function InstallGuide({ open, onOpenChange, code }: InstallGuideProps) {
  const toast = useAppToast();
  const copyCode = async () => {
    if (!code) return;
    if (await copyText(code.match(/.{1,4}/g)!.join('-'))) toast.say(extra.codeCopied);
    else toast.bad(extra.copyFailed);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={extra.installTitle}>
      <div className="pl-guide">
        {code ? (
          <div className="pl-guide-code">
            <p>{extra.installCodeLead}</p>
            <RecoveryCode code={code} />
            <div><Button variant="primary" onClick={copyCode}>{extra.copyCode}</Button></div>
          </div>
        ) : (
          <p>{extra.installNoCode}</p>
        )}
        <ol className="pl-guide-steps">{extra.installSteps.map(s => <li key={s}>{s}</li>)}</ol>
      </div>
    </Sheet>
  );
}
