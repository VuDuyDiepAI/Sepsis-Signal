export type User = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  role_grants: {
    role: string;
    department_id: string;
    review_specialties: string[];
  }[];
  title: string;
  department_id: string;
  department_name?: string;
};
