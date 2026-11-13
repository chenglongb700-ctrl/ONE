/** 用户常常只打 example.com：没写协议就补上 https:// */
export const normalizeUrl = (s: string) => {
  const u = s.trim();
  return u && !/^https?:\/\//i.test(u) ? `https://${u}` : u;
};

/** 网址里的域名，去掉开头的 www.；网址不合法时原样返回 */
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
