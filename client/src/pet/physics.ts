/**
 * 团子被拖、被甩时的物理。每一帧直接改 transform，不经过 React，所以很顺。
 *
 * - 拖着：团子挂在一根弹簧上追着鼠标（硬一点才跟手，阻尼留一点余量，停下时会轻轻回弹一下，像果冻）
 * - 松手：按松手前一小段时间鼠标的速度甩出去，慢慢减速；甩得慢就当是"放下"，弹簧把它送到鼠标松开的地方
 * - 碰到窗口边：反弹，丢掉一部分速度，同时贴着墙压扁、再晃几下恢复
 * - 动得越快拉得越长（沿着运动方向），左右跑的时候身子往前倾
 */
export type Wall = "left" | "right" | "top" | "bottom";

export type Phys = {
  mode: "drag" | "settle" | "fly";
  /** 团子左上角的位置和速度（像素、像素/秒） */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 拖着时弹簧拉向的地方，和鼠标自己的速度（让弹簧"预判"，匀速拖时团子正好在手底下，不拖尾巴） */
  tx: number;
  ty: number;
  tvx: number;
  tvy: number;
  /** 按下的点离团子左上角多远（拖的时候保持这个相对位置） */
  gx: number;
  gy: number;
  /** 最近几次鼠标的位置，用来算松手时甩出去的速度 */
  samples: { x: number; y: number; t: number }[];
  /** 撞墙后的压扁量（scale 减 1）和它们的速度，弹簧拉回 0 时会晃几下 */
  wx: number;
  wy: number;
  wvx: number;
  wvy: number;
  wall: Wall | null;
  /** 看起来的样子：沿运动方向拉长多少、往哪个方向、身子歪多少度、被拎起来多少 */
  stretch: number;
  angle: number;
  tilt: number;
  lift: number;
  /** 这一趟撞得最狠的一下有多快（落地后决定说什么） */
  bumped: number;
  /** 开始拖时团子的位置：容器的 right/bottom 固定在这里，位移全靠 transform */
  base: { left: number; top: number };
  last: number;
  releasedAt: number;
  reduce: boolean;
};

export const EDGE = 4; // 离窗口边留几像素

/** 能放团子的区域（fixed 定位是相对它算的，不含滚动条，所以不用 innerWidth） */
export const viewW = () => document.documentElement.clientWidth;
export const viewH = () => document.documentElement.clientHeight;

const K = 900; // 拖着时弹簧的硬度：越大越跟手
const D = 44; // 弹簧的阻尼：小一点停下时会轻轻回弹
const FRICTION = 2.2; // 甩出去以后减速的快慢
const BOUNCE = 0.6; // 撞墙后还剩多少速度
const WOBBLE_K = 420; // 撞扁以后恢复的弹簧
const WOBBLE_D = 10; // 阻尼小 → 多晃几下
const MAX_THROW = 3200; // 甩出去最快多快
const THROW_MIN = 260; // 松手时比这慢就当是"放下"，不甩

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function createPhys(left: number, top: number, gx: number, gy: number): Phys {
  return {
    mode: "drag",
    x: left,
    y: top,
    vx: 0,
    vy: 0,
    tx: left,
    ty: top,
    tvx: 0,
    tvy: 0,
    gx,
    gy,
    samples: [],
    wx: 0,
    wy: 0,
    wvx: 0,
    wvy: 0,
    wall: null,
    stretch: 0,
    angle: 0,
    tilt: 0,
    lift: 0,
    bumped: 0,
    base: { left, top },
    last: performance.now(),
    releasedAt: 0,
    reduce: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

/** 拖着的时候鼠标动了：更新弹簧的目标点，记下这次的位置 */
export function aim(p: Phys, clientX: number, clientY: number, t: number, size: number) {
  const tx = clamp(clientX - p.gx, EDGE, viewW() - size - EDGE);
  const ty = clamp(clientY - p.gy, EDGE, viewH() - size - EDGE);
  const prev = p.samples[p.samples.length - 1];
  const dt = prev ? (t - prev.t) / 1000 : 0;
  if (dt > 0.002 && dt < 0.1) {
    // 鼠标的速度，稍微平滑一下（鼠标事件的间隔不均匀）
    p.tvx += ((tx - p.tx) / dt - p.tvx) * 0.5;
    p.tvy += ((ty - p.ty) / dt - p.tvy) * 0.5;
  }
  p.tx = tx;
  p.ty = ty;
  p.samples.push({ x: clientX, y: clientY, t });
  if (p.samples.length > 8) p.samples.shift();
}

/** 半路一把抓住正在飞的团子 */
export function catchIt(p: Phys, clientX: number, clientY: number) {
  p.mode = "drag";
  p.gx = clientX - p.x;
  p.gy = clientY - p.y;
  p.tx = p.x;
  p.ty = p.y;
  p.tvx = p.tvy = 0;
  p.samples = [];
}

/** 松手：按最近 100ms 鼠标的速度决定是甩出去还是轻轻放下 */
export function release(p: Phys, t: number) {
  p.releasedAt = performance.now();
  const recent = p.samples.filter((s) => t - s.t < 100);
  const a = recent[0];
  const b = recent[recent.length - 1];
  let vx = 0;
  let vy = 0;
  // 松手前停住了一会儿（最后一次移动超过 50ms 以前）就不算甩
  if (a && b && b !== a && t - b.t < 50) {
    const dt = (b.t - a.t) / 1000;
    if (dt > 0.008) {
      vx = (b.x - a.x) / dt;
      vy = (b.y - a.y) / dt;
    }
  }
  const speed = Math.hypot(vx, vy);
  if (p.reduce || speed < THROW_MIN) {
    p.mode = "settle";
    return;
  }
  const k = Math.min(1, MAX_THROW / speed);
  p.mode = "fly";
  p.vx = vx * k;
  p.vy = vy * k;
}

function hit(p: Phys, wall: Wall, speed: number) {
  if (speed > p.bumped) p.bumped = speed;
  if (speed < 90) return; // 轻轻碰一下不压扁
  const amt = Math.min(0.32, speed / 2800);
  const sideways = wall === "left" || wall === "right";
  // 撞左右墙：横着变扁、竖着变高；撞上下：反过来
  p.wx = sideways ? -amt : amt * 0.7;
  p.wy = sideways ? amt * 0.7 : -amt;
  p.wvx = 0;
  p.wvy = 0;
  p.wall = wall;
}

/** 往前算 dt 秒 */
export function step(p: Phys, dt: number, size: number) {
  const maxX = viewW() - size - EDGE;
  const maxY = viewH() - size - EDGE;

  if (p.reduce) {
    // 系统设了"减少动态效果"：直接跟着鼠标，不甩、不弹、不晃
    p.x = p.tx;
    p.y = p.ty;
    p.vx = p.vy = 0;
    return;
  }

  if (p.mode === "fly") {
    const f = Math.exp(-FRICTION * dt);
    p.vx *= f;
    p.vy *= f;
  } else {
    // 鼠标停了（最近 40ms 没动）或者已经松手，就不再"预判"
    const last = p.samples[p.samples.length - 1];
    if (p.mode !== "drag" || !last || p.last - last.t > 40) p.tvx = p.tvy = 0;
    p.vx += (K * (p.tx - p.x) + D * (p.tvx - p.vx)) * dt;
    p.vy += (K * (p.ty - p.y) + D * (p.tvy - p.vy)) * dt;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // 撞墙反弹
  if (p.x < EDGE) {
    p.x = EDGE;
    if (p.vx < 0) (hit(p, "left", -p.vx), (p.vx = -p.vx * BOUNCE));
  } else if (p.x > maxX) {
    p.x = maxX;
    if (p.vx > 0) (hit(p, "right", p.vx), (p.vx = -p.vx * BOUNCE));
  }
  if (p.y < EDGE) {
    p.y = EDGE;
    if (p.vy < 0) (hit(p, "top", -p.vy), (p.vy = -p.vy * BOUNCE));
  } else if (p.y > maxY) {
    p.y = maxY;
    if (p.vy > 0) (hit(p, "bottom", p.vy), (p.vy = -p.vy * BOUNCE));
  }

  // 撞扁以后弹回来，会晃几下
  p.wvx += (-WOBBLE_K * p.wx - WOBBLE_D * p.wvx) * dt;
  p.wvy += (-WOBBLE_K * p.wy - WOBBLE_D * p.wvy) * dt;
  p.wx += p.wvx * dt;
  p.wy += p.wvy * dt;

  // 看起来的样子（平滑地跟上，不要一帧一跳）
  const speed = Math.hypot(p.vx, p.vy);
  const k = 1 - Math.exp(-dt * 16);
  p.stretch += (Math.min(0.14, speed / 6000) - p.stretch) * k;
  if (speed > 40) p.angle = Math.atan2(p.vy, p.vx);
  p.tilt += (clamp(p.vx / 90, -12, 12) - p.tilt) * k;
  p.lift += ((p.mode === "drag" ? 1 : 0) - p.lift) * k;
}

/** 停稳了没有（停稳了就不用再每帧算了） */
export function atRest(p: Phys) {
  if (p.mode === "drag") return false;
  if (p.reduce) return true;
  const still = p.mode === "fly" ? Math.hypot(p.vx, p.vy) < 12 : Math.hypot(p.tx - p.x, p.ty - p.y) < 0.5 && Math.hypot(p.vx, p.vy) < 6;
  const calm = Math.abs(p.wx) + Math.abs(p.wy) < 0.006 && Math.abs(p.wvx) + Math.abs(p.wvy) < 0.12 && p.stretch < 0.004 && Math.abs(p.tilt) < 0.3 && p.lift < 0.02;
  return still && calm;
}

const ORIGIN: Record<Wall, string> = { left: "0% 50%", right: "100% 50%", top: "50% 0%", bottom: "50% 100%" };

/** 把算好的状态画上去：外层容器平移，jelly 层拉长和歪，squash 层贴着墙压扁 */
export function paint(p: Phys, root: HTMLElement, jelly: HTMLElement, squash: HTMLElement) {
  root.style.transform = `translate3d(${(p.x - p.base.left).toFixed(2)}px, ${(p.y - p.base.top).toFixed(2)}px, 0)`;
  const s = p.stretch;
  const a = p.angle.toFixed(4);
  jelly.style.transform =
    `rotate(${p.tilt.toFixed(2)}deg) rotate(${a}rad) scale(${(1 + s).toFixed(4)}, ${(1 - s * 0.6).toFixed(4)}) rotate(${(-p.angle).toFixed(4)}rad) ` +
    `scale(${(1 - p.lift * 0.04).toFixed(4)}, ${(1 + p.lift * 0.05).toFixed(4)})`;
  squash.style.transformOrigin = p.wall ? ORIGIN[p.wall] : "50% 50%";
  squash.style.transform = `scale(${(1 + p.wx).toFixed(4)}, ${(1 + p.wy).toFixed(4)})`;
}

export function unpaint(root: HTMLElement, jelly: HTMLElement | null, squash: HTMLElement | null) {
  root.style.transform = "";
  if (jelly) jelly.style.transform = "";
  if (squash) squash.style.transform = "";
}
