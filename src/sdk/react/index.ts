// 游戏 SDK 的 React 层：hooks 与 GameShell，只调 src/sdk/core。
// 用法：入口里 const client = connectShoota({ game: 'yike' })，再渲染 <ShootaProvider client={client}><App /></ShootaProvider>。
export { GameShell, Split, type GameShellProps } from './GameShell';
export { connectShoota, ShootaProvider, useEnv, useLayout, useReady, useShoota, useSuspend } from './ShootaProvider';
