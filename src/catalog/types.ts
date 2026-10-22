import type { Orientation, Runtime } from '../shared/protocol';
import type { AchievementDef } from '../shared/save';

// 一款游戏的目录条目。除 orientation 与 runtime 外，字段与旧版 CATALOG（dd731d6 public/index.html）一一对应
export interface GameEntry {
  id: string; // 游戏标识，也是存档键与统计里的 game
  title: string;
  sub: string;
  genre: string;
  tags: string[];
  src: string; // 旧版单文件路径，相对站点根；构建另出带内容摘要的地址
  cover: string;
  size: number; // 游戏文件字节数，载入进度按它算
  status: 'ok' | 'dev';
  version?: string;
  session: string;
  saves: string;
  tagline: string;
  about: string[];
  loop: string[];
  notes?: string[];
  identities?: [string, string, string, string][]; // 身份、默认名、武魂、改命高光
  perks?: [string, string][];
  achievements?: AchievementDef[]; // 静态成就定义，优先于游戏上报的定义；目前没有条目使用
  orientation: Orientation; // 偏好方向：手机全屏后按它锁定，竖屏偏好的游戏在横屏时提示旋转
  runtime: Runtime; // legacy 旧单文件运行层；play 改写后走 SDK v2
}
