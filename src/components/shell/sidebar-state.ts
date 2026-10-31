export type SidebarState = "auto" | "collapsed" | "expanded";
export const SIDEBAR_COOKIE = "sidebar";
export const parseSidebarState = (value?: string): SidebarState =>
  value === "collapsed" || value === "expanded" ? value : "auto";
