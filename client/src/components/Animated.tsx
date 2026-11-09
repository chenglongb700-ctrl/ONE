import type { HTMLAttributes } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";

/**
 * 子元素增加、删除、换位置时自动播放平滑动画（AutoAnimate）。
 * 用法：把列表外层的 <div> / <ul> 换成 <AnimatedDiv> / <AnimatedUl>，子元素要有稳定的 key。
 */
export function AnimatedDiv(props: HTMLAttributes<HTMLDivElement>) {
  const [ref] = useAutoAnimate<HTMLDivElement>({ duration: 220 });
  return <div ref={ref} {...props} />;
}

export function AnimatedUl(props: HTMLAttributes<HTMLUListElement>) {
  const [ref] = useAutoAnimate<HTMLUListElement>({ duration: 220 });
  return <ul ref={ref} {...props} />;
}
