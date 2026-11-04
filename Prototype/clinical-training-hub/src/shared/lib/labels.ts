export const statusNames: Record<string, string> = {
  DRAFT: "Bản nháp",
  PENDING_REVIEW: "Chờ phê duyệt",
  APPROVED: "Đã phê duyệt",
  ARCHIVED: "Đã lưu trữ",
  REJECTED: "Cần chỉnh sửa",
  PUBLISHED: "Đã xuất bản",
  COMPLETED: "Hoàn thành",
  IN_PROGRESS: "Đang học",
  NOT_STARTED: "Chưa bắt đầu",
  OVERDUE: "Quá hạn",
  QUEUED: "Đang chờ",
  RUNNING: "Đang xử lý",
  FAILED: "Xử lý lỗi",
  NEW: "Mới",
  REVIEWING: "Đang xử lý",
  RESOLVED: "Đã giải quyết",
  UNVERIFIED: "Chưa xác minh",
  VERIFIED: "Đã xác minh",
};

export const roleNames: Record<string, string> = {
  ADMIN: "Quản trị viên",
  REVIEWER: "Chuyên gia kiểm duyệt",
  STAFF: "Nhân viên y tế",
};
