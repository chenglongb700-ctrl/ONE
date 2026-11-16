import { useEffect, useState } from "react";
import { Activity, Dumbbell, LayoutDashboard, Scale, Utensils, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api";
import { PageHeader } from "../components/Modal";
import BodyTab from "../fitness/Body";
import type { Overview } from "../fitness/data";
import FoodTab from "../fitness/Food";
import OverviewTab from "../fitness/Overview";
import StrengthTab from "../fitness/Strength";
import WorkoutsTab from "../fitness/Workouts";

/**
 * 健身（减脂）：概览、体重、饮食、运动、力量五个标签。
 * 汇总数据（GET /fitness/overview）在这里读一次，各个标签改了记录之后调 reload 重新读。
 */
type Tab = "overview" | "body" | "food" | "workouts" | "strength";
const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "概览", icon: LayoutDashboard },
  { key: "body", label: "体重", icon: Scale },
  { key: "food", label: "饮食", icon: Utensils },
  { key: "workouts", label: "运动", icon: Activity },
  { key: "strength", label: "力量", icon: Dumbbell },
];

export default function Fitness() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const reload = () => api.get<Overview>("/fitness/overview").then(setOverview, (err) => toast.error((err as Error).message));
  useEffect(() => {
    reload();
  }, []);

  return (
    <div>
      <PageHeader
        title="健身"
        sub="记体重、饮食和运动，看着数字一点点往下走"
        action={
          <div className="flex max-w-full overflow-x-auto rounded-xl bg-ink/6 p-1 text-sm [scrollbar-width:none]" role="tablist" aria-label="健身的几个部分">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1 transition ${tab === t.key ? "bg-surface shadow-sm" : "text-slate-600 hover:text-ink"}`} onClick={() => setTab(t.key)}>
                <t.icon className="size-4" /> {t.label}
              </button>
            ))}
          </div>
        }
      />

      {overview === null ? (
        <div className="card h-56 animate-pulse" />
      ) : tab === "overview" ? (
        <OverviewTab overview={overview} reload={reload} goto={setTab} />
      ) : tab === "body" ? (
        <BodyTab overview={overview} reload={reload} />
      ) : tab === "food" ? (
        <FoodTab overview={overview} reload={reload} />
      ) : tab === "workouts" ? (
        <WorkoutsTab overview={overview} reload={reload} />
      ) : (
        <StrengthTab overview={overview} reload={reload} />
      )}

      <p className="mt-6 px-1 text-xs leading-relaxed text-slate-500">基础代谢、建议摄入、运动消耗和食物热量都是按通用公式和常见数值估算的，不是医疗建议。有基础疾病、在孕期哺乳期，或者打算大幅减重，请先咨询医生。</p>
    </div>
  );
}
