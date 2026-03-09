export interface Quote {
  id: number;
  work_id: number;
  user_id?: string | null;
  quote: string;
  page_number?: number | null;
  created_at: string;
}

export interface Work {
  id: string;
  title: string;
  file_url?: string | null;
  current_page?: number;
  goodreads_id?: string | null;
  cover_img_url?: string | null;
  dropbox_link?: string | null;
  amazon_asin?: string | null;
  tags: string[];
  authors: string[];
  series?: string | null;
  page_count: number;
  bookmark: number;
  file_id?: string | null;
  read?: boolean;
  liked?: boolean;
  shelved?: boolean;
  rating?: number;
  quotes?: Quote[];
}

export interface Author {
  name: string;
  goodreads_id?: string | null;
  followed?: boolean;
  avatar_img_url?: string | null;
  works_count: number;
}

export interface Series {
  id: string;
  text: string;
  img_url: string;
}

export interface User {
  id: string;
  username: string;
  role: "admin" | "guest";
}
