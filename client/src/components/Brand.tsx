/** 标志：一个圆环加一颗小点，像一天里的太阳。字标拉开字距 */
export function Mark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="15" cy="17" r="10" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="24.5" cy="7.5" r="3.6" fill="var(--brand)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-display font-medium tracking-[0.32em] ${className}`}>ONE</span>;
}
