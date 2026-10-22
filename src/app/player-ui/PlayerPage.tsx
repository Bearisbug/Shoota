// 游戏页 PAGE-PLAYER（§13 游戏页布局）：固定定位铺满视口，游戏区是视口四边各扣掉安全区，iframe 铺满游戏区。
// 平台控件只有悬浮按钮，浮在游戏区上面；载入与失败时盖一层载入页。启动、存档与全屏都在运行层 src/app/player/ 的控制器里，这里只管界面。
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FloatSpot } from '../../shared/save';
import { copy } from '../copy';
import { REDUCED_MOTION, useMedia, useOnline } from '../media';
import { extra } from '../player/copy';
import { isHandheld, runtimeEnv } from '../player/env';
import { player, type PlayerView } from '../player/player';
import { hhmm } from '../player/playSession';
import { floatSpot, readPrefs, saveFloatSpot, updatePrefs } from '../player/uiPrefs';
import { useSnapshot, type CloudView, type PlayerProps } from '../services';
import { useAppToast } from '../toast';
import { FloatingControl } from './FloatingControl';
import { panelPlacement, placeSpot } from './geometry';
import { InstallGuide } from './InstallGuide';
import { LaunchScreen } from './LaunchScreen';
import { PlayerPanel } from './PlayerPanel';
import { RotateHint } from './RotateHint';
import { useGameArea } from './useGameArea';
import { WechatGuide } from './WechatGuide';
import './PlayerPage.css';

type Orient = 'portrait' | 'landscape';

const saveText = (s: PlayerView['save']) =>
  s.kind === 'pending' ? copy.player.savePending
  : s.kind === 'reading' ? copy.player.saveReading
  : s.kind === 'loaded' ? copy.player.saveLoaded
  : s.kind === 'new' ? copy.player.saveNew
  : copy.player.saved(new Date(s.at));

function cloudLine(cloud: CloudView | null, gid: string, online: boolean) {
  if (!cloud) return { text: extra.cloudOff, long: false };
  if (cloud.stopped) return { text: extra.cloudStopped, long: false };
  if (cloud.tooBig.includes(gid)) return { text: copy.player.tooBig, long: true };
  if (!online) return { text: extra.cloudOffline, long: false };
  if (cloud.lastSyncAt) return { text: extra.cloudSynced(hhmm(cloud.lastSyncAt)), long: false };
  return { text: extra.cloudPending, long: false };
}

export function PlayerPage({ game, onExit }: PlayerProps) {
  const view = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const { cloud } = useSnapshot();
  const toast = useAppToast();
  const online = useOnline();
  const reduced = useMedia(REDUCED_MOTION);
  const [env] = useState(runtimeEnv);
  const areaRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const vp = useGameArea(areaRef);
  const orient: Orient = vp && vp.vw > vp.vh ? 'landscape' : 'portrait';

  const [spots, setSpots] = useState<Record<Orient, FloatSpot | null>>(() => ({
    portrait: floatSpot(game.id, 'portrait'),
    landscape: floatSpot(game.id, 'landscape'),
  }));
  const [panel, setPanel] = useState(false);
  const [install, setInstall] = useState(false);
  const [wechat, setWechat] = useState(() => env.run === 'wechat' && !readPrefs().wechatHintAt);
  const [hintSeen] = useState(() => !!readPrefs().rotateHintSeen[game.id]);
  const [hintClosed, setHintClosed] = useState(false);

  const mine = view.gid === game.id;
  const ready = mine && view.status === 'ready';
  const prefer = mine ? view.prefer : game.orientation;
  const handheld = isHandheld(env.device);
  const wechatLine = env.run === 'wechat' ? [copy.player.rotateWechat] : [];
  const showHint = ready && handheld && prefer !== 'any' && orient !== prefer && !view.locked && !hintSeen && !hintClosed;

  // 游戏页开着时页面根不滚动
  useLayoutEffect(() => {
    document.documentElement.dataset.playing = '';
    return () => { delete document.documentElement.dataset.playing; };
  }, []);

  // 退出回调与提示条每次渲染都交最新的给运行层
  const exitRef = useRef(onExit);
  useLayoutEffect(() => {
    exitRef.current = onExit;
    player.setUi({
      achievement: (title, name) => toast.achievement(<span className="app-toast-lines"><small>{copy.player.achievement(title)}</small><span>{name}</span></span>),
      fullscreenDenied: () => toast.say(copy.player.fullscreenDenied),
    });
  });

  // 挂上就开局，卸载即退出（运行层把退出推迟一轮，开发模式的重复挂载不会重开）
  useEffect(() => {
    player.attachStage(stageRef.current);
    const release = player.acquire(game, () => exitRef.current());
    return () => {
      player.attachStage(null);
      release();
    };
  }, [game]);

  // 游戏区环境交给运行层，改写后的游戏据此排版（API-SDK-003）
  useEffect(() => {
    if (!vp) return;
    const { area, vw, vh } = vp;
    player.setEnv({
      orientation: orient,
      fullscreen: view.fullscreen,
      width: Math.round(area.w),
      height: Math.round(area.h),
      safe: { top: Math.round(area.y), right: Math.round(vw - area.x - area.w), bottom: Math.round(vh - area.y - area.h), left: Math.round(area.x) },
      run: env.run,
      reducedMotion: reduced,
    });
  }, [vp, orient, view.fullscreen, env.run, reduced]);

  // 第一次在微信里开游戏自动弹一次「在浏览器打开」；旋转提示自动出过一次就记下，这次游玩里消失后也不再出
  useEffect(() => {
    if (env.run === 'wechat' && !readPrefs().wechatHintAt) updatePrefs(p => { p.wechatHintAt = Date.now(); });
  }, [env.run]);
  useEffect(() => {
    if (!showHint) return;
    updatePrefs(p => { p.rotateHintSeen[game.id] = 1; });
    return () => setHintClosed(true);
  }, [showHint, game.id]);

  const pos = vp ? placeSpot(vp.area, spots[orient]) : null;
  const setSpot = (spot: FloatSpot | null) => {
    saveFloatSpot(game.id, orient, spot);
    setSpots(s => ({ ...s, [orient]: spot }));
  };

  return (
    <div className="pl-root">
      <div ref={areaRef} className="pl-area">
        <div ref={stageRef} className="pl-stage" />
        {showHint && (
          <RotateHint lines={[prefer === 'landscape' ? copy.player.rotateToLandscape : copy.player.rotateToPortrait, ...wechatLine]} onClose={() => setHintClosed(true)} />
        )}
      </div>
      {!ready && <LaunchScreen game={game} view={mine ? view : { ...view, status: 'loading', progress: undefined, retrying: false }} onRetry={() => player.retry()} onExit={() => void player.exit()} />}
      {ready && vp && pos && (
        <FloatingControl area={vp.area} pos={pos} savedAt={view.savedAt} panelOpen={panel} onOpen={() => setPanel(true)} onMoveEnd={setSpot} />
      )}
      <PlayerPanel
        open={panel && ready}
        onOpenChange={setPanel}
        placement={vp ? panelPlacement(vp.vw, vp.vh) : 'sheet'}
        anchor={vp && pos ? { area: vp.area, btn: pos } : null}
        game={game}
        statusText={view.statusText}
        saveText={saveText(view.save)}
        cloud={cloudLine(cloud, game.id, online)}
        secs={view.secs}
        fullscreen={{ mode: env.fullscreen, on: view.fullscreen }}
        rotateNote={handheld && prefer !== 'any' ? [prefer === 'portrait' ? extra.preferPortrait : extra.preferLandscape, ...wechatLine] : []}
        onFullscreen={() => player.toggleFullscreen()}
        onInstall={() => { setPanel(false); setInstall(true); }}
        onWechat={() => { setPanel(false); setWechat(true); }}
        onResetFloat={() => { setSpot(null); setPanel(false); }}
        onExit={() => void player.exit()}
      />
      {env.fullscreen === 'install' && <InstallGuide open={install} onOpenChange={setInstall} code={cloud?.code ?? null} />}
      {env.run === 'wechat' && <WechatGuide open={wechat} onOpenChange={setWechat} device={env.device} code={cloud?.code ?? null} />}
    </div>
  );
}
