// 微信里引导在浏览器打开（§13 全屏与引导）：卡片贴在右上角，箭头指向微信的「···」菜单。第一次在微信里开游戏时自动弹一次。
import { useId } from 'react';
import { Button } from '../../ui';
import { useModal } from '../../ui/modal';
import '../../ui/Modal.css';
import { RecoveryCode } from '../components/bits';
import type { Device } from '../player/env';
import { extra } from '../player/copy';

export interface WechatGuideProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  device: Device;
  /** 云存档恢复码；还没开通时为 null */
  code: string | null;
}

export function WechatGuide({ open, onOpenChange, device, code }: WechatGuideProps) {
  const { mounted, dialogRef, panelRef, requestClose } = useModal({ open, onOpenChange });
  const titleId = useId();
  if (!mounted) return null;
  const ios = device === 'iphone' || device === 'ipad';
  return (
    <dialog ref={dialogRef} className="ui-modal pl-wechat" aria-labelledby={titleId}>
      <div className="ui-modal-scrim" onClick={requestClose} />
      <div ref={panelRef} className="pl-wechat-box">
        <h2 id={titleId}>{extra.wechatTitle}</h2>
        <p>{ios ? extra.wechatStepIos : extra.wechatStepAndroid}</p>
        <p className="app-muted">{extra.wechatCodeLead}</p>
        {code && <RecoveryCode code={code} />}
        <Button variant="primary" block onClick={requestClose}>{extra.gotIt}</Button>
      </div>
    </dialog>
  );
}
