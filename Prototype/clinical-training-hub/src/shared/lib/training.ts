export type Assignment = {
  id: string;
  course_id: string;
  version_id: string;
  user_id: string;
  title: string;
  status: string;
  due_date: string;
  progress: number;
  lesson_count: number;
  completed_lessons: string[];
  started_at: string | null;
  completed_at?: string | null;
};

export const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const dueInDays = (date: string, today = localDay()) =>
  Math.round(
    (Date.parse(date.slice(0, 10) + "T00:00:00Z") -
      Date.parse(today + "T00:00:00Z")) /
      86400000,
  );

export function trainingSummary(assignments: Assignment[]) {
  const byCourse = new Map<string, Assignment[]>(),
    byUser = new Map<string, Assignment[]>();
  for (const a of assignments) {
    byCourse.set(a.course_id, [...(byCourse.get(a.course_id) || []), a]);
    byUser.set(a.user_id, [...(byUser.get(a.user_id) || []), a]);
  }
  const rows = [...byCourse.entries()]
    .map(([id, items]) => {
      const people = new Map<string, Assignment[]>();
      for (const a of items)
        people.set(a.user_id, [...(people.get(a.user_id) || []), a]);
      const completed = [...people.values()].filter((list) =>
        list.every((a) => a.status === "COMPLETED"),
      ).length;
      const overdue = [...people.values()].filter((list) =>
        list.some((a) => a.status === "OVERDUE"),
      ).length;
      return {
        id,
        title: items[0].title,
        people: people.size,
        completed,
        overdue,
        percent: people.size
          ? Math.round((completed / people.size) * 100)
          : null,
      };
    })
    .sort(
      (a, b) => b.overdue - a.overdue || a.title.localeCompare(b.title, "vi"),
    );
  return {
    rows,
    people: byUser.size,
    completedPeople: [...byUser.values()].filter((list) =>
      list.every((a) => a.status === "COMPLETED"),
    ).length,
  };
}
