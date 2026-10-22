// 视口与 UA：四个 Playwright 项目，加核心区占比复测多出的两组 Safari 可见区（docs/DESIGN.md §13）。
// 数值与旧版走查脚本一致，新旧两版用同一组视口量。

export type Vp = 'portrait' | 'landscape' | 'tablet' | 'desktop';
export type MeasureVp = Vp | 'safari-portrait' | 'safari-landscape';

export const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
export const ANDROID_TABLET_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
// 电脑 Edge；在手机项目里开电脑视口时要显式给它，否则新上下文沿用项目的安卓 UA
export const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';
export const WECHAT_UA = ANDROID_UA + ' MicroMessenger/8.0.50.2600(0x28003237) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN';

export interface ViewportSpec {
  width: number;
  height: number;
  mobile: boolean;
  tablet?: boolean;
  ua?: string; // 手机视口的默认 UA，不写时用安卓 Chrome
  screen?: { width: number; height: number }; // Safari 可见区所在的整块屏幕，换算整屏占比用
}

export const VIEWPORTS: Record<MeasureVp, ViewportSpec> = {
  portrait: { width: 393, height: 852, mobile: true },
  landscape: { width: 852, height: 393, mobile: true },
  tablet: { width: 820, height: 1180, mobile: true, tablet: true },
  desktop: { width: 1440, height: 900, mobile: false },
  // iPhone 15 Pro 上 Safari 扣掉状态栏、地址栏和工具栏后的可见区
  'safari-portrait': { width: 393, height: 659, mobile: true, ua: IPHONE_UA, screen: { width: 393, height: 852 } },
  'safari-landscape': { width: 734, height: 343, mobile: true, ua: IPHONE_UA, screen: { width: 852, height: 393 } },
};

// 浏览器上下文的视口选项；手机视口用安卓 Chrome 的 UA 与触屏，Safari 可见区用 iPhone Safari，平板用安卓平板 Chrome（后两者平台都不会开局自动全屏）
export function contextOptions(vp: MeasureVp, userAgent?: string) {
  const v = VIEWPORTS[vp];
  return {
    viewport: { width: v.width, height: v.height },
    hasTouch: v.mobile,
    isMobile: v.mobile,
    deviceScaleFactor: v.mobile ? 2 : 1,
    ...(v.mobile && { userAgent: userAgent ?? v.ua ?? (v.tablet ? ANDROID_TABLET_UA : ANDROID_UA) }),
  };
}
