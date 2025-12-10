export interface License {
  id: string;
  name: string;
  slug?: string;
  full_name?: string;
  url?: string;
  created_at: Date;
  updated_at: Date | null;
}
