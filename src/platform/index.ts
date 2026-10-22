// 平台的本机存档层与云同步客户端，页面与游戏运行层只从这里取。见 docs/DESIGN.md §9、FLOW-SAVE-MOVE、FLOW-LAUNCH S2b、FLOW-CLOUD-*、FLOW-RECOVER。
export { boot } from './boot';
export { ensurePlayer, hadMeta, hashId, me, meta, peek, persist, player, playUser, stat, toggleWish, wishList } from './meta';
export { track } from './collect';
export { holdGame, readSave, readSaves, releaseGame, SaveStoreError, writeSave, type ReadResult, type SaveFail } from './idb';
export { applySaves, decodeSaves, encodeSaves, packSaves } from './savecode';
export { moveIn } from './move';
export { listUndo, restoreUndo } from './undo';
export { adopt, cloudStatus, onCloud, recover, syncNow, type AdoptReply, type CloudEvent, type CloudPhase, type CloudStatus, type RecoverReply } from './cloud';
export { requestSync } from './cloudState';
export { formatCode, normalizeCode, recoverLink } from './recovery';
