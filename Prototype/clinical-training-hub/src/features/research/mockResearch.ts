import type { Paper } from "./types";
export const mockQuestion =
  "Thực trạng hiểu biết và sử dụng AI tạo sinh của nhân viên y tế tại Vinmec Times City: khoảng trống nghiên cứu, biến số và yếu tố liên quan là gì?";
export type MockStudy = Paper & {
  country: string;
  sample: number;
  tool: string;
  knowledge: number;
  usage: number;
  limitation: string;
  gap: string;
};
const records = [
  {
    title: "Generative AI literacy and use among hospital nurses",
    country: "Việt Nam",
    sample: 240,
    tool: "Bảng hỏi kiến thức + TAM",
    knowledge: 48,
    usage: 27,
    limitation: "Một bệnh viện công; tự báo cáo",
    gap: "Chưa bao phủ bệnh viện tư và các chuyên môn khác",
    study_type: "Nghiên cứu cắt ngang",
    finding: "Kiến thức còn hạn chế, sử dụng thực tế thấp hơn mức chấp nhận.",
  },
  {
    title: "Acceptance and actual use of generative AI in clinical staff",
    country: "Thái Lan",
    sample: 320,
    tool: "UTAUT + tần suất sử dụng",
    knowledge: 56,
    usage: 39,
    limitation: "Thiếu kiểm tra kiến thức khách quan",
    gap: "Cần đối chiếu tự đánh giá với kiến thức thực đo",
    study_type: "Nghiên cứu cắt ngang",
    finding:
      "Lợi ích cảm nhận và điều kiện hỗ trợ liên quan đến ý định sử dụng.",
  },
  {
    title: "Training and safe adoption of AI assistants in healthcare",
    country: "Malaysia",
    sample: 180,
    tool: "Bài kiểm tra trước / sau đào tạo",
    knowledge: 67,
    usage: 42,
    limitation: "Theo dõi ngắn; không có nhóm đối chứng",
    gap: "Chưa rõ mức duy trì kiến thức và hành vi dài hạn",
    study_type: "Nghiên cứu trước–sau",
    finding:
      "Điểm kiến thức tăng sau đào tạo; chưa đủ cơ sở kết luận quan hệ nhân quả.",
  },
  {
    title: "Privacy concerns and barriers to clinical generative AI use",
    country: "Singapore",
    sample: 150,
    tool: "Bảng hỏi rào cản + phỏng vấn",
    knowledge: 62,
    usage: 31,
    limitation: "Mẫu thuận tiện",
    gap: "Cần khảo sát đa trung tâm và kiểm soát yếu tố nhiễu",
    study_type: "Nghiên cứu hỗn hợp",
    finding:
      "Bảo mật dữ liệu và độ tin cậy của câu trả lời là các rào cản nổi bật.",
  },
  {
    title: "Differences in AI literacy across healthcare professions",
    country: "Indonesia",
    sample: 210,
    tool: "Thang AI literacy; so sánh nhóm",
    knowledge: 51,
    usage: 34,
    limitation: "Chưa phân tích đặc thù tổ chức",
    gap: "Thiếu mô hình tích hợp cá nhân và hỗ trợ từ bệnh viện",
    study_type: "Nghiên cứu cắt ngang",
    finding: "Kiến thức và hành vi sử dụng khác nhau giữa nhóm nghề nghiệp.",
  },
];
export const mockStudies: MockStudy[] = records.map((r, i) => ({
  ...r,
  paper_id: `mock-genai-${i + 1}`,
  authors: [`Nhóm nghiên cứu minh họa ${i + 1}`],
  published_date: "2025",
  journal: "Nguồn hư cấu để xem thử giao diện",
  citations: null,
  doi: "",
  url: "",
  pdf_url: "",
  source: "Mock",
  demo: true,
  key_takeaway: r.finding,
  abstract: `DỮ LIỆU MOCK — KHÔNG PHẢI NGHIÊN CỨU THẬT. ${r.study_type} trên ${r.sample} nhân viên y tế tại ${r.country}. Công cụ: ${r.tool}. Tỷ lệ đạt kiến thức: ${r.knowledge}%; sử dụng thực tế: ${r.usage}%. ${r.finding} Hạn chế: ${r.limitation}.`,
  evidence: [
    {
      section: "Kết quả mock",
      quote: `Trong bộ dữ liệu minh họa, ${r.knowledge}% đạt ngưỡng kiến thức và ${r.usage}% báo cáo sử dụng thực tế. ${r.finding}`,
    },
  ],
}));
