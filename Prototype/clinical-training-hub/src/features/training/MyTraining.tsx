import { useHub } from "@/shared/context/HubContext";
import { useLoad } from "@/shared/hooks/useLoad";
import { dateStr } from "@/shared/lib/dates";
import { statusNames } from "@/shared/lib/labels";
import { Badge } from "@/shared/ui/Badge";
import {
  EnterpriseDataTable,
  EnterprisePanel,
  FormField,
  SearchFilterPanel,
} from "@/shared/ui/enterprise";
import { Stat } from "@/shared/ui/Stat";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { useState } from "react";

export function MyTraining() {
  const { go } = useHub(),
    { data, loading, error } = useLoad<any[]>("/training/my-courses");
  const [query, setQuery] = useState({ keyword: "", status: "" }),
    [filters, setFilters] = useState(query);
  const rows = (data || []).filter(
    (c) =>
      (!filters.keyword ||
        c.title
          .toLocaleLowerCase("vi")
          .includes(filters.keyword.toLocaleLowerCase("vi"))) &&
      (!filters.status || c.status === filters.status),
  );
  return (
    <>
      <div className="stat-grid">
        <Stat
          icon={<BookOpen />}
          value={data?.length ?? "—"}
          label="Khóa học được giao"
        />
        <Stat
          icon={<Activity />}
          value={data?.filter((c) => c.status === "IN_PROGRESS").length ?? "—"}
          label="Đang học"
        />
        <Stat
          icon={<CheckCircle2 />}
          value={data?.filter((c) => c.status === "COMPLETED").length ?? "—"}
          label="Đã hoàn thành"
        />
        <Stat
          icon={<Clock3 />}
          value={data?.filter((c) => c.status === "OVERDUE").length ?? "—"}
          label="Cần hoàn thành quá hạn"
        />
      </div>
      <SearchFilterPanel
        compact
        onSearch={() => setFilters({ ...query })}
        onReset={() => {
          const reset = { keyword: "", status: "" };
          setQuery(reset);
          setFilters(reset);
        }}
      >
        <FormField label="Tên khóa học">
          <input
            placeholder="Nhập tên khóa học…"
            value={query.keyword}
            onChange={(e) => setQuery({ ...query, keyword: e.target.value })}
          />
        </FormField>
        <FormField label="Trạng thái học tập">
          <select
            value={query.status}
            onChange={(e) => setQuery({ ...query, status: e.target.value })}
          >
            <option value="">Tất cả</option>
            {["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "OVERDUE"].map((s) => (
              <option key={s} value={s}>
                {statusNames[s]}
              </option>
            ))}
          </select>
        </FormField>
      </SearchFilterPanel>
      <EnterprisePanel
        title="Lộ trình học tập"
        heading={false}
        className="data-panel"
        icon={<BookOpen size={18} />}
      >
        <EnterpriseDataTable
          rows={rows}
          rowKey={(a) => a.id}
          loading={loading}
          error={error}
          empty="Chưa có khóa học phù hợp"
          label="Lộ trình học tập"
          columns={[
            {
              key: "title",
              title: "Khóa học được giao",
              value: (a) => a.title,
              render: (a) => (
                <span>
                  <b>{a.title}</b>
                  <small>{a.lesson_count} bài học</small>
                </span>
              ),
            },
            {
              key: "duration",
              title: "Thời lượng",
              value: (a) => a.duration,
              render: (a) => a.duration + " phút",
            },
            {
              key: "due",
              title: "Hạn hoàn thành",
              value: (a) => a.due_date,
              render: (a) => dateStr(a.due_date),
            },
            {
              key: "progress",
              title: "Tiến độ",
              value: (a) => a.progress,
              render: (a) => (
                <div className="training-progress">
                  <span>
                    {a.completed_lessons.length}/{a.lesson_count} bài ·{" "}
                    {a.progress}%
                  </span>
                  <div className="progress-track">
                    <div style={{ width: a.progress + "%" }} />
                  </div>
                </div>
              ),
            },
            {
              key: "score",
              title: "Điểm tốt nhất",
              value: (a) => a.best_score ?? -1,
              render: (a) => a.best_score ?? "Chưa làm bài",
            },
            {
              key: "status",
              title: "Trạng thái",
              value: (a) => a.status,
              render: (a) => <Badge status={a.status} />,
            },
            {
              key: "action",
              title: "Thao tác",
              render: (a) => (
                <button
                  className="primary"
                  onClick={() =>
                    go(`learn/${a.id}/${a.course_id}/${a.version_id}`)
                  }
                >
                  {a.status === "COMPLETED" ? "Xem lại" : "Vào học"}
                  <ArrowUpRight size={16} />
                </button>
              ),
            },
          ]}
        />
      </EnterprisePanel>
    </>
  );
}
