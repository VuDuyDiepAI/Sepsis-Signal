"use client";
import Link from "next/link";
import {
  BellRing,
  Clock3,
  ClipboardCheck,
  UserRound,
  FolderOpen,
  Layers,
} from "lucide-react";
import { useClinicalReader } from "@/lib/manual-store";
import { useReviews } from "@/components/review-context";
import { Panel } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { AlertStatus, Trend } from "@/components/clinical/alert-status";
import {
  percent,
  formatTime,
  hourLabel,
  departments,
  reviewFor,
} from "@/lib/clinical-data";
export function ClinicalOverview() {
  const reader = useClinicalReader(),
    { reviews } = useReviews(),
    rows = reader.getMonitoringRows(reviews);
  const pending = rows.filter((r) => r.state === "above" && !r.review),
    missing = rows.filter((r) => !r.prediction);
  const recent = Object.values(reviews)
    .filter((r) =>
      reader
        .listEncounters()
        .some((e) =>
          reader
            .getPredictions(e.id)
            .some(
              (p) => p.id === r.predictionId && reviewFor(p, reviews) === r,
            ),
        ),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 3);
  const manual = rows.filter((r) => r.encounter.id.startsWith("HS-")).length;
  return (
    <>
      <div className="overview-grid">
        <Panel
          title="Cần xem xét trước"
          description="Các hồ sơ đang vượt ngưỡng và chưa được xem xét ở bản tính hiện tại."
          meta={`${pending.length} hồ sơ`}
          className="priority-panel"
        >
          {pending.length === 0 ? (
            <EmptyState
              title="Không có cảnh báo đang chờ"
              description="Các cảnh báo hiện tại đã được xem xét hoặc chưa có kết quả vượt ngưỡng."
            />
          ) : (
            <div className="priority-list">
              {pending.slice(0, 3).map((r) => (
                <article className="priority-case" key={r.encounter.id}>
                  <div className="priority-case-head">
                    <div className="flex items-center gap-3">
                      <span className="patient-icon">
                        <UserRound size={21} />
                      </span>
                      <div>
                        <Link
                          className="case-title"
                          href={`/patients/${r.encounter.id}?hour=${r.encounter.currentHour}`}
                        >
                          {r.encounter.id}
                        </Link>
                        <p className="secondary-text">
                          {r.encounter.age} tuổi ·{" "}
                          {r.encounter.sex === "F" ? "Nữ" : "Nam"} ·{" "}
                          {departments[r.department]}
                        </p>
                      </div>
                    </div>
                    <AlertStatus state="above" />
                  </div>
                  <div className="priority-reading">
                    <div>
                      <p className="value-label">Điểm sepsis</p>
                      <strong>{percent(r.prediction!.score)}</strong>
                    </div>
                    <div>
                      <p className="value-label">So giờ trước</p>
                      <Trend value={r.change} />
                    </div>
                    <div>
                      <p className="value-label">Mốc dữ liệu</p>
                      <span>
                        {hourLabel(r.encounter.currentHour)} ·{" "}
                        {formatTime(r.timestamp, true)}
                      </span>
                    </div>
                  </div>
                  <div className="priority-reason">
                    <BellRing size={15} />
                    <span>
                      Cần xem xét: điểm vượt ngưỡng{" "}
                      {percent(r.prediction!.threshold)}. Chưa có ghi nhận cho
                      bản tính #{r.prediction!.revision}.
                    </span>
                  </div>
                  <div className="priority-case-foot">
                    <span className="secondary-text">
                      Cửa sổ dự báo 6 giờ tiếp theo
                    </span>
                    <Link
                      className="link-button primary"
                      href={`/patients/${r.encounter.id}?hour=${r.encounter.currentHour}`}
                    >
                      Xem xét hồ sơ
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="overview-panel-footer">
            <span>
              {pending.length > 3
                ? `Hiển thị 3/${pending.length} hồ sơ ưu tiên`
                : "Chỉ tính cảnh báo ở mốc hiện tại của mỗi hồ sơ"}
            </span>
            <Link href="/alerts">Mở trung tâm cảnh báo</Link>
          </div>
        </Panel>
        <div className="overview-side">
          <Panel
            title="Chưa có kết quả"
            description="Hồ sơ cần được kiểm tra dữ liệu hoặc chấm điểm."
            meta={`${missing.length} hồ sơ`}
          >
            {missing.length === 0 ? (
              <div className="compact-empty">
                <Clock3 size={20} />
                <p>Tất cả hồ sơ đã có kết quả tại mốc hiện tại.</p>
              </div>
            ) : (
              <div className="task-list">
                {missing.slice(0, 3).map((r) => (
                  <Link
                    key={r.encounter.id}
                    href={`/patients/${r.encounter.id}?hour=${r.encounter.currentHour}`}
                    className="task-row"
                  >
                    <span className="task-icon">
                      <Clock3 size={18} />
                    </span>
                    <div>
                      <strong>{r.encounter.id}</strong>
                      <p>
                        {hourLabel(r.encounter.currentHour)} ·{" "}
                        {departments[r.department]}
                      </p>
                    </div>
                    <span className="task-action">Mở hồ sơ</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="overview-panel-footer">
              <Link href="/patients?state=unavailable">
                Xem danh sách chưa có kết quả
              </Link>
            </div>
          </Panel>
          <Panel
            title="Vừa xem xét"
            description="Ghi nhận trải nghiệm trong tab, gắn đúng bản dự báo."
          >
            {recent.length === 0 ? (
              <div className="compact-empty">
                <ClipboardCheck size={22} />
                <p>Chưa có ghi nhận xem xét trong phiên tab này.</p>
              </div>
            ) : (
              <div className="task-list">
                {recent.map((r) => {
                  const p = reader
                    .listEncounters()
                    .flatMap((e) => reader.getPredictions(e.id))
                    .find((p) => p.id === r.predictionId)!;
                  return (
                    <Link
                      className="task-row"
                      key={r.predictionId}
                      href={`/patients/${p.encounterId}?hour=${p.hour}`}
                    >
                      <span className="task-icon">
                        <ClipboardCheck size={18} />
                      </span>
                      <div>
                        <strong>
                          {p.encounterId} · Bản #{r.revision}
                        </strong>
                        <p>
                          {r.reviewer} · {formatTime(r.timestamp, true)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>
          <Panel title="Phạm vi theo dõi" meta={<Layers size={15} />}>
            <div className="scope-list">
              <div>
                <span>Hồ sơ nhập tay trong tab</span>
                <strong>{manual}</strong>
              </div>
              <div>
                <span>Hồ sơ mẫu có sẵn</span>
                <strong>{rows.length - manual}</strong>
              </div>
              {Object.entries(departments).map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <strong>
                    {rows.filter((r) => r.department === key).length}
                  </strong>
                </div>
              ))}
            </div>
            <div className="overview-panel-footer">
              <Link href="/patients" className="flex items-center gap-2">
                <FolderOpen size={16} />
                Mở toàn bộ hồ sơ
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
