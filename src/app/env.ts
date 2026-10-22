// 从主屏幕图标打开（iOS 主屏幕应用或安装后的 Web App）
export const isStandalone = () =>
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
