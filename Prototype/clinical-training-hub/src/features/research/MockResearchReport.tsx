import { mockStudies, type MockStudy } from "./mockResearch";
import "./report.css";
export default function MockResearchReport({
  onSource,
}: {
  onSource: (paper: MockStudy) => void;
}) {
  const cite = (i: number) => (
    <button
      className="rr-cite"
      aria-label={`Xem nguồn ${i + 1}`}
      onClick={() => onSource(mockStudies[i])}
    >
      [{i + 1}]
    </button>
  );
  return (
    <article className="rr-report" aria-label="Báo cáo nghiên cứu minh họa">
      <div className="rr-label">
        BẢN MOCK · Nguồn hư cấu, số liệu chỉ để xem thử giao diện
      </div>
      <h1>Hiểu biết và sử dụng AI tạo sinh trong nhân viên y tế</h1>
      <section>
        <h2>1. Kết luận nhanh & Bức tranh tổng quan</h2>
        <h3>1.1. Mức độ đồng thuận & Tóm tắt cốt lõi</h3>
        <p>
          Trong bộ mẫu minh họa, sử dụng thực tế thấp hơn tỷ lệ đạt kiến thức ở
          cả 5 nghiên cứu. Chỉ đo thái độ hoặc ý định sử dụng sẽ chưa phản ánh
          đầy đủ hành vi trong công việc. {cite(0)}
          {cite(1)}
          {cite(4)}
        </p>
        <div className="rr-insight">
          <strong>Hướng nghiên cứu đề xuất</strong>
          <p>
            Đo đồng thời kiến thức khách quan, hành vi sử dụng thực tế và điều
            kiện hỗ trợ tại bệnh viện; phân tích theo nhóm nghề nghiệp.
          </p>
        </div>
        <figure className="rr-consensus">
          <figcaption>
            <strong>5/5 nguồn mock</strong> có khoảng cách giữa kiến thức và sử
            dụng thực tế
          </figcaption>
          <div className="rr-consensus-bar">
            <span style={{ width: "100%" }} />
          </div>
          <small>
            So sánh mô tả bộ dữ liệu minh họa; không phải mức đồng thuận khoa
            học được kiểm định.
          </small>
        </figure>
        <h3>1.2. Tổng hợp số liệu thực trạng</h3>
        <p>
          Các mẫu có quy mô 150–320 người, tỷ lệ đạt kiến thức 48–67%, sử dụng
          thực tế 27–42%. Không gộp tỷ lệ vì công cụ và thiết kế khác nhau.
        </p>
        <figure className="rr-bars">
          <figcaption>
            <span>
              <i className="rr-key-knowledge" />
              Đạt kiến thức
            </span>
            <span>
              <i className="rr-key-usage" />
              Sử dụng thực tế
            </span>
          </figcaption>
          {mockStudies.map((p, i) => (
            <div className="rr-bar-row" key={p.paper_id}>
              <div>
                {p.country} {cite(i)}
                <small>N = {p.sample}</small>
              </div>
              <div className="rr-bar-pair">
                <div>
                  <span style={{ width: `${p.knowledge}%` }} />
                  <b>{p.knowledge}%</b>
                </div>
                <div>
                  <span style={{ width: `${p.usage}%` }} />
                  <b>{p.usage}%</b>
                </div>
              </div>
            </div>
          ))}
        </figure>
      </section>
      <section>
        <h2>2. Khoảng trống nghiên cứu</h2>
        <h3>2.1. Ma trận khoảng trống nghiên cứu</h3>
        <div className="rr-table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Chủ đề",
                  "Phương pháp",
                  "Kết quả chính",
                  "Hạn chế",
                  "Khoảng trống nghiên cứu",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mockStudies.map((p, i) => (
                <tr key={p.paper_id}>
                  <td>
                    {p.title} {cite(i)}
                  </td>
                  <td>{p.study_type}</td>
                  <td>{p.key_takeaway}</td>
                  <td>{p.limitation}</td>
                  <td className="rr-gap-cell">{p.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>2.2. Các khoảng trống cốt lõi cần lấp đầy</h3>
        <ol className="rr-gaps">
          <li>
            <strong>Bối cảnh:</strong> chưa có nguồn nào trong bộ mock khảo sát
            Vinmec Times City. Điều này không chứng minh rằng chưa có nghiên cứu
            thật tại đây. {cite(0)}
          </li>
          <li>
            <strong>Đo lường:</strong> cần tách kiến thức tự đánh giá và kiến
            thức khách quan. {cite(1)}
          </li>
          <li>
            <strong>Hành vi:</strong> cần đo tần suất, mục đích sử dụng và việc
            kiểm tra đầu ra AI. {cite(0)}
            {cite(3)}
          </li>
          <li>
            <strong>Mô hình:</strong> kết hợp yếu tố cá nhân với hỗ trợ tổ chức
            và khác biệt chuyên môn. {cite(4)}
          </li>
        </ol>
      </section>
      <section>
        <h2>3. Phân tích biến số & Yếu tố liên quan</h2>
        <h3>3.1. Bảng tổng hợp các yếu tố tác động</h3>
        <div className="rr-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Yếu tố / Biến số</th>
                <th>Hướng tác động (+ / −)</th>
                <th>Mức độ bằng chứng</th>
                <th>Nguồn đại diện</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "Đào tạo về AI",
                  "+ Kiến thức",
                  "Gợi ý; thiết kế trước–sau",
                  2,
                ],
                [
                  "Lợi ích cảm nhận",
                  "+ Ý định sử dụng",
                  "Liên quan trong khảo sát",
                  1,
                ],
                [
                  "Lo ngại bảo mật",
                  "− Sử dụng thực tế",
                  "Khảo sát + phỏng vấn",
                  3,
                ],
                [
                  "Hỗ trợ từ tổ chức",
                  "+ Điều kiện sử dụng",
                  "Gợi ý; cần kiểm định",
                  4,
                ],
                [
                  "Nhóm nghề nghiệp",
                  "Khác biệt giữa nhóm",
                  "Liên quan; không suy ra nhân quả",
                  4,
                ],
              ].map(([factor, direction, level, i]) => (
                <tr key={String(factor)}>
                  <td>{factor}</td>
                  <td>
                    <span className="rr-direction">{direction}</span>
                  </td>
                  <td>{level}</td>
                  <td>{cite(Number(i))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>3.2. Điểm đồng thuận và mâu thuẫn đáng chú ý</h3>
        <ul>
          <li>
            <strong>Đồng thuận mô tả:</strong> sử dụng thực tế thấp hơn kiến
            thức trong cả 5 mẫu mock.
          </li>
          <li>
            <strong>Khác biệt:</strong> tỷ lệ thay đổi theo công cụ, nhóm nghề
            và bối cảnh; chưa thể kết luận nơi nào tốt hơn.
          </li>
          <li>
            <strong>Chưa đủ bằng chứng:</strong> tác động nhân quả của đào tạo
            và mức duy trì hành vi theo thời gian.
          </li>
        </ul>
      </section>
      <section>
        <h2>4. Top 5 nghiên cứu sát nhất</h2>
        <p>
          Xếp thứ tự minh họa cho câu hỏi mẫu; đây không phải kết quả xếp hạng
          từ AI.
        </p>
        <div className="rr-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nghiên cứu</th>
                <th>Quốc gia & Cỡ mẫu (N)</th>
                <th>Thang đo / Mô hình gốc</th>
                <th>Kết quả cốt lõi</th>
              </tr>
            </thead>
            <tbody>
              {mockStudies.map((p, i) => (
                <tr key={p.paper_id}>
                  <td>
                    <button
                      className="rr-source-title"
                      onClick={() => onSource(p)}
                    >
                      {p.title}
                    </button>{" "}
                    {cite(i)}
                  </td>
                  <td>
                    {p.country}
                    <br />N = {p.sample}
                  </td>
                  <td>{p.tool}</td>
                  <td>{p.key_takeaway}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
