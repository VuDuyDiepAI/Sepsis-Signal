export interface Evidence {
  quote: string;
  section?: string;
  source_url?: string;
  start?: number;
  end?: number;
}
export interface Paper {
  paper_id: string;
  title: string;
  authors: string[];
  published_date: string;
  journal: string;
  citations: number | null;
  study_type: string;
  abstract: string;
  key_takeaway: string;
  evidence: Evidence[];
  doi: string;
  url: string;
  pdf_url: string;
  source: string;
  demo?: boolean;
}
